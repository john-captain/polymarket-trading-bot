/**
 * 交易执行队列 (Order Queue)
 * 
 * 功能：
 * 1. 统一的订单执行入口
 * 2. 优先级队列 (紧急 > 高 > 普通)
 * 3. 各策略的执行器封装
 * 4. 执行结果记录
 */

import PQueue from 'p-queue'
import type { QueueEventType } from './types'
import type { StrategyType } from './strategy-dispatcher'

// ==================== 类型定义 ====================

/**
 * 订单优先级
 */
export type OrderPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'

/**
 * 订单状态
 */
export type OrderStatus = 'pending' | 'executing' | 'success' | 'failed' | 'cancelled'

/**
 * 订单类型
 */
export type OrderType = 
  | 'MINT'           // 铸造代币
  | 'MERGE'          // 合并赎回
  | 'BUY'            // 买入
  | 'SELL'           // 卖出
  | 'CANCEL'         // 取消订单

/**
 * 交易订单
 */
export interface TradeOrder {
  /** 订单 ID */
  id: string
  /** 来源策略 */
  strategy: StrategyType
  /** 关联机会 ID */
  opportunityId?: string
  /** 订单类型 */
  type: OrderType
  /** 优先级 */
  priority: OrderPriority
  /** Token ID */
  tokenId?: string
  /** 条件 ID */
  conditionId: string
  /** 方向 */
  side?: 'BUY' | 'SELL'
  /** 价格 */
  price?: number
  /** 数量 */
  size: number
  /** 状态 */
  status: OrderStatus
  /** 创建时间 */
  createdAt: Date
  /** 开始执行时间 */
  startedAt?: Date
  /** 完成时间 */
  completedAt?: Date
  /** 交易哈希 */
  txHash?: string
  /** 实际成交量 */
  filledSize?: number
  /** 实际成交价 */
  filledPrice?: number
  /** 错误信息 */
  error?: string
  /** 重试次数 */
  retryCount: number
  /** 最大重试次数 */
  maxRetries: number
  /** 元数据 */
  metadata?: Record<string, any>
}

/**
 * 批量订单 (一次性执行多个订单)
 */
export interface BatchOrder {
  /** 批次 ID */
  batchId: string
  /** 来源策略 */
  strategy: StrategyType
  /** 关联机会 ID */
  opportunityId?: string
  /** 订单列表 */
  orders: Omit<TradeOrder, 'id' | 'createdAt' | 'status' | 'retryCount'>[]
  /** 优先级 */
  priority: OrderPriority
  /** 是否原子执行 (全部成功或全部失败) */
  atomic: boolean
  /** 执行顺序是否有依赖 */
  sequential: boolean
}

/**
 * 执行结果
 */
export interface OrderResult {
  orderId: string
  success: boolean
  txHash?: string
  filledSize?: number
  filledPrice?: number
  fee?: number
  error?: string
  duration: number
}

/**
 * 批量执行结果
 */
export interface BatchOrderResult {
  batchId: string
  success: boolean
  totalOrders: number
  successCount: number
  failedCount: number
  results: OrderResult[]
  totalDuration: number
}

// ==================== 优先级分数 ====================

const PRIORITY_SCORES: Record<OrderPriority, number> = {
  URGENT: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25,
}

// ==================== 订单执行队列 ====================

export class OrderQueue {
  private queue: PQueue
  private pendingOrders: Map<string, TradeOrder> = new Map()
  private completedOrders: Map<string, TradeOrder> = new Map()
  private eventListeners: Map<QueueEventType, ((data: any) => void)[]> = new Map()

  // 统计
  private stats = {
    totalOrders: 0,
    successOrders: 0,
    failedOrders: 0,
    cancelledOrders: 0,
    totalVolume: 0,
    totalFees: 0,
    byStrategy: {
      MINT_SPLIT: { count: 0, volume: 0 },
      ARBITRAGE_LONG: { count: 0, volume: 0 },
      ARBITRAGE_SHORT: { count: 0, volume: 0 },
      MARKET_MAKING: { count: 0, volume: 0 },
    } as Record<StrategyType, { count: number; volume: number }>,
    byType: {
      MINT: 0,
      MERGE: 0,
      BUY: 0,
      SELL: 0,
      CANCEL: 0,
    } as Record<OrderType, number>,
  }

  constructor() {
    this.queue = new PQueue({
      concurrency: 1, // 串行执行，避免 nonce 冲突
      timeout: 120000, // 2分钟超时
    })

    console.log('✅ [OrderQueue] 交易执行队列已初始化')
  }

  /**
   * 提交单个订单
   */
  async submitOrder(order: Omit<TradeOrder, 'id' | 'createdAt' | 'status' | 'retryCount'>): Promise<OrderResult> {
    const fullOrder: TradeOrder = {
      ...order,
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      status: 'pending',
      retryCount: 0,
      maxRetries: order.maxRetries ?? 3,
    }

    this.pendingOrders.set(fullOrder.id, fullOrder)
    this.stats.totalOrders++
    this.stats.byType[fullOrder.type]++

    console.log(
      `📝 [OrderQueue] 订单已提交: ${fullOrder.id} ` +
      `(${fullOrder.strategy} ${fullOrder.type} ${fullOrder.size})`
    )

    // 加入队列执行
    const result = await this.queue.add(
      () => this.executeOrder(fullOrder),
      { priority: PRIORITY_SCORES[fullOrder.priority] }
    )

    return result as OrderResult
  }

  /**
   * 提交批量订单
   */
  async submitBatch(batch: BatchOrder): Promise<BatchOrderResult> {
    const startTime = Date.now()
    const results: OrderResult[] = []
    let successCount = 0
    let failedCount = 0

    console.log(
      `📦 [OrderQueue] 批量订单已提交: ${batch.batchId} ` +
      `(${batch.orders.length} 个订单, ${batch.sequential ? '顺序' : '并行'}执行)`
    )

    if (batch.sequential) {
      // 顺序执行
      for (const orderSpec of batch.orders) {
        const result = await this.submitOrder({
          ...orderSpec,
          strategy: batch.strategy,
          opportunityId: batch.opportunityId,
          priority: batch.priority,
        })
        results.push(result)

        if (result.success) {
          successCount++
        } else {
          failedCount++
          if (batch.atomic) {
            // 原子执行模式，一个失败则停止
            console.log(`⚠️ [OrderQueue] 原子批量订单失败，停止后续执行`)
            break
          }
        }
      }
    } else {
      // 并行执行 (通过队列串行化)
      const promises = batch.orders.map(orderSpec =>
        this.submitOrder({
          ...orderSpec,
          strategy: batch.strategy,
          opportunityId: batch.opportunityId,
          priority: batch.priority,
        })
      )

      const batchResults = await Promise.all(promises)
      for (const result of batchResults) {
        results.push(result)
        if (result.success) successCount++
        else failedCount++
      }
    }

    return {
      batchId: batch.batchId,
      success: failedCount === 0,
      totalOrders: batch.orders.length,
      successCount,
      failedCount,
      results,
      totalDuration: Date.now() - startTime,
    }
  }

  /**
   * 执行订单
   */
  private async executeOrder(order: TradeOrder): Promise<OrderResult> {
    const startTime = Date.now()
    order.status = 'executing'
    order.startedAt = new Date()

    try {
      console.log(`⚡ [OrderQueue] 执行订单: ${order.id} (${order.type})`)
      this.emitEvent('task:start', { orderId: order.id, type: order.type })

      let result: OrderResult

      // 根据订单类型执行
      switch (order.type) {
        case 'MINT':
          result = await this.executeMint(order)
          break
        case 'MERGE':
          result = await this.executeMerge(order)
          break
        case 'BUY':
        case 'SELL':
          result = await this.executeMarketOrder(order)
          break
        case 'CANCEL':
          result = await this.executeCancel(order)
          break
        default:
          throw new Error(`不支持的订单类型: ${order.type}`)
      }

      // 更新订单状态
      order.status = result.success ? 'success' : 'failed'
      order.completedAt = new Date()
      order.txHash = result.txHash
      order.filledSize = result.filledSize
      order.filledPrice = result.filledPrice
      order.error = result.error

      // 更新统计
      if (result.success) {
        this.stats.successOrders++
        this.stats.totalVolume += result.filledSize || order.size
        this.stats.totalFees += result.fee || 0
        this.stats.byStrategy[order.strategy].count++
        this.stats.byStrategy[order.strategy].volume += result.filledSize || order.size
      } else {
        this.stats.failedOrders++
        
        // 重试逻辑
        if (order.retryCount < order.maxRetries) {
          order.retryCount++
          console.log(`🔄 [OrderQueue] 订单重试 (${order.retryCount}/${order.maxRetries}): ${order.id}`)
          return this.executeOrder(order)
        }
      }

      // 移动到已完成队列
      this.pendingOrders.delete(order.id)
      this.completedOrders.set(order.id, order)

      // 限制已完成队列大小
      if (this.completedOrders.size > 1000) {
        const oldest = this.completedOrders.keys().next().value
        if (oldest) this.completedOrders.delete(oldest)
      }

      console.log(
        `${result.success ? '✅' : '❌'} [OrderQueue] 订单${result.success ? '成功' : '失败'}: ${order.id} ` +
        `(耗时 ${Date.now() - startTime}ms)`
      )

      this.emitEvent(result.success ? 'task:complete' : 'task:error', result)
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      order.status = 'failed'
      order.error = errorMsg
      order.completedAt = new Date()
      this.stats.failedOrders++

      console.error(`❌ [OrderQueue] 订单执行异常: ${order.id}`, error)

      return {
        orderId: order.id,
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 执行铸造
   */
  private async executeMint(order: TradeOrder): Promise<OrderResult> {
    const startTime = Date.now()

    // TODO: 调用 polymarket-contracts 执行铸造
    // const contracts = createPolymarketContracts()
    // const tx = await contracts.mint(order.conditionId, order.size)

    await new Promise(resolve => setTimeout(resolve, 500))

    return {
      orderId: order.id,
      success: true,
      txHash: `0x${Math.random().toString(16).slice(2)}`, // 模拟
      filledSize: order.size,
      fee: order.size * 0.001, // 模拟 0.1% 费用
      duration: Date.now() - startTime,
    }
  }

  /**
   * 执行合并赎回
   */
  private async executeMerge(order: TradeOrder): Promise<OrderResult> {
    const startTime = Date.now()

    // TODO: 调用合约执行 merge
    await new Promise(resolve => setTimeout(resolve, 500))

    return {
      orderId: order.id,
      success: true,
      txHash: `0x${Math.random().toString(16).slice(2)}`,
      filledSize: order.size,
      duration: Date.now() - startTime,
    }
  }

  /**
   * 执行市价/限价单
   */
  private async executeMarketOrder(order: TradeOrder): Promise<OrderResult> {
    const startTime = Date.now()

    // TODO: 调用 CLOB API 下单
    // const clob = getClobClient()
    // const result = await clob.createOrder({...})

    await new Promise(resolve => setTimeout(resolve, 300))

    return {
      orderId: order.id,
      success: true,
      txHash: `0x${Math.random().toString(16).slice(2)}`,
      filledSize: order.size,
      filledPrice: order.price,
      fee: order.size * (order.price || 0.5) * 0.015, // 1.5% taker fee
      duration: Date.now() - startTime,
    }
  }

  /**
   * 执行取消订单
   */
  private async executeCancel(order: TradeOrder): Promise<OrderResult> {
    const startTime = Date.now()

    // TODO: 调用 CLOB API 取消订单
    await new Promise(resolve => setTimeout(resolve, 200))

    return {
      orderId: order.id,
      success: true,
      duration: Date.now() - startTime,
    }
  }

  /**
   * 取消待执行订单
   */
  cancelOrder(orderId: string): boolean {
    const order = this.pendingOrders.get(orderId)
    if (!order || order.status !== 'pending') {
      return false
    }

    order.status = 'cancelled'
    order.completedAt = new Date()
    this.pendingOrders.delete(orderId)
    this.completedOrders.set(orderId, order)
    this.stats.cancelledOrders++

    console.log(`🚫 [OrderQueue] 订单已取消: ${orderId}`)
    return true
  }

  /**
   * 获取订单
   */
  getOrder(orderId: string): TradeOrder | undefined {
    return this.pendingOrders.get(orderId) || this.completedOrders.get(orderId)
  }

  /**
   * 获取待执行订单列表
   */
  getPendingOrders(): TradeOrder[] {
    return Array.from(this.pendingOrders.values())
  }

  /**
   * 获取已完成订单列表
   */
  getCompletedOrders(limit: number = 100): TradeOrder[] {
    const all = Array.from(this.completedOrders.values())
    return all.slice(-limit)
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      pendingCount: this.pendingOrders.size,
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
    }
  }

  /**
   * 暂停队列
   */
  pause(): void {
    this.queue.pause()
    console.log('⏸️ [OrderQueue] 队列已暂停')
  }

  /**
   * 恢复队列
   */
  resume(): void {
    this.queue.start()
    console.log('▶️ [OrderQueue] 队列已恢复')
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.clear()
    
    // 将所有待执行订单标记为取消
    for (const order of this.pendingOrders.values()) {
      order.status = 'cancelled'
      order.completedAt = new Date()
      this.completedOrders.set(order.id, order)
    }
    this.pendingOrders.clear()

    console.log('🗑️ [OrderQueue] 队列已清空')
  }

  /**
   * 添加事件监听
   */
  on(event: QueueEventType, listener: (data: any) => void): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.push(listener)
    this.eventListeners.set(event, listeners)
  }

  private emitEvent(event: QueueEventType, data: any): void {
    const listeners = this.eventListeners.get(event) || []
    for (const listener of listeners) {
      try {
        listener(data)
      } catch (error) {
        console.error(`❌ [OrderQueue] 事件监听器错误:`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

// 使用 globalThis 防止开发模式热重载时丢失状态
const globalForOrderQueue = globalThis as unknown as {
  orderQueueInstance: OrderQueue | undefined
}

export function getOrderQueue(): OrderQueue {
  if (!globalForOrderQueue.orderQueueInstance) {
    globalForOrderQueue.orderQueueInstance = new OrderQueue()
    console.log('✅ [OrderQueue] 交易执行队列已初始化')
  }
  return globalForOrderQueue.orderQueueInstance
}

export function resetOrderQueue(): void {
  if (globalForOrderQueue.orderQueueInstance) {
    globalForOrderQueue.orderQueueInstance.clear()
  }
  globalForOrderQueue.orderQueueInstance = undefined
}
