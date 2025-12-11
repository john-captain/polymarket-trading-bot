/**
 * 存储队列 - 数据库批量写入管理器
 * 
 * 核心功能：
 * 1. 批量缓冲 - 收集市场数据到内存缓冲区，减少数据库操作次数
 * 2. 自动刷新 - 达到批次大小或定时触发，自动写入数据库
 * 3. 双表写入 - markets 表存静态数据，market_price_history 表存动态数据
 * 4. INSERT IGNORE - 新数据插入，重复数据跳过（基于 conditionId）
 * 5. 背压控制 - 缓冲区超过 80% 时发出背压信号，暂停上游扫描
 * 6. 去重机制 - 缓冲区内自动去重，避免重复写入
 * 7. 溢出保护 - 缓冲区满时自动丢弃最旧数据，保证系统不阻塞
 * 
 * 方案A 数据分离：
 * - markets 表：只存储静态字段，INSERT IGNORE（不更新）
 * - market_price_history 表：存储所有动态字段，每次扫描都 INSERT
 * 
 * 配置参数：
 * - batchSize: 50 条/批次 - 每次写入数据库的记录数
 * - flushInterval: 5000ms - 定时刷新间隔
 * - maxBufferSize: 500 条 - 缓冲区最大容量
 * - concurrency: 10 - 并发写入任务数
 * 
 * 数据流：
 * ScanQueue (200条) → add() → buffer[] → flush() → MySQL
 *                                ↓
 *                        markets 表 (INSERT IGNORE 静态数据)
 *                        market_price_history 表 (INSERT 动态数据)
 */

import PQueue from 'p-queue'
import { batchUpsertMarkets, batchRecordPriceSnapshots } from '@/lib/database'
import type { MarketRecord, PriceHistoryRecord } from '@/lib/database'
import type {
  QueueConfig,
  QueueStatus,
  QueueState,
  MarketData,
  QueueEventType,
} from './types'
import { DEFAULT_QUEUE_CONFIGS } from './types'

// ==================== 类型定义 ====================

export interface StorageTaskResult {
  batchId: string
  inserted: number
  updated: number
  failed: number
  duration: number
  priceSnapshots?: number  // 价格快照记录数
  errors?: string[]
}

// 简化的事件监听器类型 (内部使用)
type SimpleEventListener = (data: any) => void

// ==================== 类型转换 ====================

/**
 * 将 MarketData 转换为 MarketRecord (静态数据)
 * 
 * 方案A：只保留静态字段，动态字段存入 market_price_history
 */
function toMarketRecord(market: MarketData): MarketRecord {
  return {
    // 基础标识
    conditionId: market.conditionId,
    question: market.question,
    slug: market.slug,
    category: market.category,
    
    // outcomes 转为 JSON（静态，不含价格）
    outcomes: JSON.stringify(market.outcomes),
    tokens: market.clobTokenIds ? JSON.stringify(market.clobTokenIds) : '[]',
    
    // 日期
    endDate: market.endDate,
    
    // 状态
    active: market.active,
    closed: market.closed,
    restricted: market.restricted ?? false,
    enableOrderBook: market.enableOrderBook,
    
    // 媒体
    image: market.image,
    
    // 交易配置（静态）
    acceptingOrders: market.acceptingOrders,
    acceptingOrdersTimestamp: market.acceptingOrdersTimestamp,
    orderMinSize: market.orderMinSize,
    orderPriceMinTickSize: market.orderPriceMinTickSize,
    negRisk: market.negRisk,
    negRiskMarketId: market.negRiskMarketId,
    negRiskRequestId: market.negRiskRequestId,
    
    // 市场审核状态
    approved: market.approved,
    ready: market.ready,
    funded: market.funded,
    featured: market.featured,
    isNew: market.isNew,
    
    // UMA 预言机相关
    umaBond: market.umaBond,
    umaReward: market.umaReward,
    resolvedBy: market.resolvedBy,
    resolutionSource: market.resolutionSource,
    submittedBy: market.submittedBy,
    
    // 分组/展示相关
    groupItemTitle: market.groupItemTitle,
    groupItemThreshold: market.groupItemThreshold,
    customLiveness: market.customLiveness,
  }
}

/**
 * 将 MarketData 转换为 PriceHistoryRecord (动态数据)
 * 
 * 方案A：包含所有动态字段，每次扫描都生成新快照
 */
function toPriceHistoryRecord(market: MarketData): Omit<PriceHistoryRecord, 'id' | 'recordedAt'> {
  return {
    conditionId: market.conditionId,
    
    // 价格数据
    outcomePrices: JSON.stringify(market.outcomePrices),
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    spread: market.spread,
    lastTradePrice: market.lastTradePrice,
    
    // 价格变化
    oneHourPriceChange: market.oneHourPriceChange,
    oneDayPriceChange: market.oneDayPriceChange,
    oneWeekPriceChange: market.oneWeekPriceChange,
    oneMonthPriceChange: market.oneMonthPriceChange,
    oneYearPriceChange: market.oneYearPriceChange,
    
    // 交易量
    volume: market.volume,
    volume24hr: market.volume24hr,
    volume1wk: market.volume1wk,
    volume1mo: market.volume1mo,
    volume1yr: market.volume1yr,
    
    // AMM vs CLOB 交易量分拆
    volume1wkAmm: market.volume1wkAmm,
    volume1moAmm: market.volume1moAmm,
    volume1yrAmm: market.volume1yrAmm,
    volume1wkClob: market.volume1wkClob,
    volume1moClob: market.volume1moClob,
    volume1yrClob: market.volume1yrClob,
    volumeClob: market.volumeClob,
    
    // 流动性
    liquidity: market.liquidity,
    liquidityAmm: market.liquidityAmm,
    liquidityClob: market.liquidityClob,
    
    // 其他动态数据
    competitive: market.competitive,
    commentCount: market.commentCount,
  }
}

// ==================== 存储队列类 ====================

export class StorageQueue {
  private queue: PQueue
  private config: QueueConfig
  private state: QueueState = 'idle'

  // 批量缓冲区
  private buffer: MarketData[] = []
  private bufferLock = false
  private flushTimer: NodeJS.Timeout | null = null

  // 统计
  private totalBatches = 0
  private totalRecords = 0
  private insertedRecords = 0
  private updatedRecords = 0
  private failedRecords = 0
  private errorCount = 0

  // 事件监听 (使用简化的字符串事件类型)
  private eventListeners: Map<QueueEventType, SimpleEventListener[]> = new Map()

  // 配置
  private batchSize: number
  private flushInterval: number
  private maxBufferSize: number

  constructor(config?: Partial<QueueConfig> & {
    batchSize?: number
    flushInterval?: number
    maxBufferSize?: number
  }) {
    this.config = { ...DEFAULT_QUEUE_CONFIGS.storage, ...config }
    this.batchSize = config?.batchSize ?? 50      // 每批次最大记录数
    this.flushInterval = config?.flushInterval ?? 5000  // 刷新间隔 (ms)
    this.maxBufferSize = config?.maxBufferSize ?? 500   // 缓冲区最大容量

    this.queue = new PQueue({
      concurrency: this.config.concurrency,
      timeout: this.config.timeout,
    })

    // 监听队列事件
    this.queue.on('idle', () => {
      if (this.state === 'running' && this.buffer.length === 0) {
        this.state = 'idle'
      }
    })

    this.queue.on('error', (error) => {
      this.errorCount++
      console.error('❌ [StorageQueue] 批次保存错误:', error)
      this.emitEvent('task:error', { error: error.message })
    })
  }

  /**
   * 添加市场数据到缓冲区
   */
  async add(markets: MarketData[]): Promise<void> {
    if (this.state === 'stopped') {
      console.warn('⚠️ [StorageQueue] 队列已停止，忽略新数据')
      return
    }

    // 去重并添加到缓冲区
    const newMarkets = markets.filter(m => 
      !this.buffer.some(b => b.conditionId === m.conditionId)
    )

    // 检查队列大小限制，超过时丢弃旧数据
    const spaceAvailable = this.maxBufferSize - this.buffer.length
    if (newMarkets.length > spaceAvailable) {
      if (spaceAvailable <= 0) {
        // 缓冲区已满，丢弃最旧的数据腾出空间
        const dropCount = Math.min(newMarkets.length, this.buffer.length)
        this.buffer.splice(0, dropCount)
        console.warn(`⚠️ [StorageQueue] 缓冲区已满，丢弃 ${dropCount} 条旧数据`)
      }
    }

    // 只添加能容纳的数量
    const toAdd = newMarkets.slice(0, this.maxBufferSize - this.buffer.length)
    this.buffer.push(...toAdd)
    this.totalRecords += toAdd.length

    if (toAdd.length < newMarkets.length) {
      console.warn(`⚠️ [StorageQueue] 丢弃 ${newMarkets.length - toAdd.length} 条超出容量的数据`)
    }

    console.log(`📥 [StorageQueue] 添加 ${toAdd.length} 条记录到缓冲区 (当前: ${this.buffer.length}/${this.maxBufferSize})`)

    // 检查是否需要立即刷新
    if (this.buffer.length >= this.batchSize) {
      await this.flush()
    }
  }

  /**
   * 刷新缓冲区 - 将数据写入数据库
   * 
   * 方案A 数据分离：
   * 1. 静态数据 → markets 表 (INSERT IGNORE)
   * 2. 动态数据 → market_price_history 表 (INSERT)
   */
  async flush(): Promise<StorageTaskResult | null> {
    // 防止并发刷新
    if (this.bufferLock || this.buffer.length === 0) {
      return null
    }

    this.bufferLock = true
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startTime = Date.now()

    try {
      // 取出缓冲区数据
      const batch = this.buffer.splice(0, this.batchSize)
      
      // 分离静态和动态数据
      const staticRecords = batch.map(toMarketRecord)
      const dynamicRecords = batch.map(toPriceHistoryRecord)

      console.log(`💾 [StorageQueue] 开始保存批次 ${batchId} (${batch.length} 条)`)
      this.state = 'running'
      this.emitEvent('task:start', { batchId, count: batch.length })

      // 1. 写入静态数据（市场主表 - INSERT IGNORE）
      const result = await this.queue.add(async () => {
        return await batchUpsertMarkets(staticRecords)
      })

      // 2. 写入动态数据（价格历史表 - INSERT）
      const priceCount = await this.queue.add(async () => {
        return await batchRecordPriceSnapshots(dynamicRecords)
      })

      const duration = Date.now() - startTime
      const taskResult: StorageTaskResult = {
        batchId,
        inserted: result?.inserted ?? 0,
        updated: result?.updated ?? 0,  // 方案A 中应该始终为 0
        failed: 0,
        duration,
        priceSnapshots: priceCount ?? 0,
      }

      this.totalBatches++
      this.insertedRecords += taskResult.inserted
      this.updatedRecords += taskResult.updated

      console.log(
        `✅ [StorageQueue] 批次 ${batchId} 完成: ` +
        `新增 ${taskResult.inserted}, 跳过 ${taskResult.updated}, 价格快照 ${priceCount}, 耗时 ${duration}ms`
      )

      this.emitEvent('task:complete', taskResult)
      return taskResult
    } catch (error) {
      this.errorCount++
      this.failedRecords += this.batchSize
      console.error(`❌ [StorageQueue] 批次 ${batchId} 失败:`, error)
      this.emitEvent('task:error', { 
        batchId, 
        error: error instanceof Error ? error.message : String(error) 
      })
      return null
    } finally {
      this.bufferLock = false
    }
  }

  /**
   * 启动定时刷新
   */
  start(): void {
    if (this.state === 'running') {
      console.warn('⚠️ [StorageQueue] 队列已在运行')
      return
    }

    this.state = 'running'
    this.emitEvent('queue:start', {})

    // 启动定时刷新
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.bufferLock) {
        await this.flush()
      }
    }, this.flushInterval)

    console.log(`🚀 [StorageQueue] 已启动，刷新间隔 ${this.flushInterval}ms`)
  }

  /**
   * 停止队列 (等待剩余任务完成)
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return
    }

    console.log('⏹️ [StorageQueue] 正在停止...')

    // 停止定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // 刷新剩余数据
    while (this.buffer.length > 0) {
      await this.flush()
    }

    // 等待队列清空
    await this.queue.onIdle()

    this.state = 'stopped'
    this.emitEvent('queue:stop', {})
    console.log('⏹️ [StorageQueue] 已停止')
  }

  /**
   * 暂停队列
   */
  pause(): void {
    if (this.state === 'paused') {
      return
    }
    this.queue.pause()
    this.state = 'paused'
    
    // 暂停定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    console.log('⏸️ [StorageQueue] 已暂停')
    this.emitEvent('queue:pause', {})
  }

  /**
   * 恢复队列
   */
  resume(): void {
    if (this.state !== 'paused') {
      return
    }
    this.queue.start()
    this.state = 'running'

    // 重启定时器
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.bufferLock) {
        await this.flush()
      }
    }, this.flushInterval)

    console.log('▶️ [StorageQueue] 已恢复')
    this.emitEvent('queue:resume', {})
  }

  /**
   * 清空缓冲区 (不写入数据库)
   */
  clear(): void {
    const count = this.buffer.length
    this.buffer = []
    console.log(`🗑️ [StorageQueue] 已清空 ${count} 条缓冲数据`)
  }

  /**
   * 获取队列状态
   */
  getStatus(): {
    state: QueueState
    pending: number
    size: number
    completed: number
    failed: number
  } {
    return {
      state: this.state,
      pending: this.queue.pending,
      size: this.queue.size,
      completed: this.totalBatches,
      failed: this.errorCount,
    }
  }

  /**
   * 获取详细统计
   */
  getStats(): {
    bufferSize: number
    totalBatches: number
    totalRecords: number
    insertedRecords: number
    updatedRecords: number
    failedRecords: number
    errorCount: number
  } {
    return {
      bufferSize: this.buffer.length,
      totalBatches: this.totalBatches,
      totalRecords: this.totalRecords,
      insertedRecords: this.insertedRecords,
      updatedRecords: this.updatedRecords,
      failedRecords: this.failedRecords,
      errorCount: this.errorCount,
    }
  }

  /**
   * 检查是否有背压 (缓冲区接近满)
   */
  hasBackpressure(): boolean {
    return this.buffer.length >= this.maxBufferSize * 0.8
  }

  /**
   * 等待队列空闲 (缓冲区清空 + 任务完成)
   */
  async waitUntilIdle(): Promise<void> {
    // 先刷新缓冲区
    if (this.buffer.length > 0) {
      await this.flush()
    }
    // 等待队列空闲
    await this.queue.onIdle()
  }

  /**
   * 检查缓冲区是否已满
   */
  isBufferFull(): boolean {
    return this.buffer.length >= this.maxBufferSize
  }

  /**
   * 获取缓冲区使用率
   */
  getBufferUsage(): number {
    return this.buffer.length / this.maxBufferSize
  }

  /**
   * 添加事件监听器
   */
  on(event: QueueEventType, listener: SimpleEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.push(listener)
    this.eventListeners.set(event, listeners)
  }

  /**
   * 移除事件监听器
   */
  off(event: QueueEventType, listener: SimpleEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    const index = listeners.indexOf(listener)
    if (index !== -1) {
      listeners.splice(index, 1)
      this.eventListeners.set(event, listeners)
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: QueueEventType, data: any): void {
    const listeners = this.eventListeners.get(event) || []
    for (const listener of listeners) {
      try {
        listener(data)
      } catch (error) {
        console.error(`❌ [StorageQueue] 事件监听器错误 (${event}):`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

// 使用 globalThis 防止开发模式热重载时丢失状态
const globalForStorageQueue = globalThis as unknown as {
  storageQueueInstance: StorageQueue | undefined
}

/**
 * 获取存储队列单例
 */
export function getStorageQueue(): StorageQueue {
  if (!globalForStorageQueue.storageQueueInstance) {
    globalForStorageQueue.storageQueueInstance = new StorageQueue()
    console.log('✅ [StorageQueue] 存储队列已初始化')
  }
  return globalForStorageQueue.storageQueueInstance
}

/**
 * 重置存储队列单例 (用于测试)
 */
export function resetStorageQueue(): void {
  if (globalForStorageQueue.storageQueueInstance) {
    globalForStorageQueue.storageQueueInstance.stop()
    globalForStorageQueue.storageQueueInstance = undefined
  }
}
