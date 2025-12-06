/**
 * Market-Making 策略队列
 * 
 * 做市策略：双边挂单赚取买卖价差
 * 
 * 核心逻辑：
 * 1. 选择高流动性、适中波动的市场
 * 2. 在买卖两边挂限价单
 * 3. 定期刷新订单价格
 * 4. 管理库存偏斜，必要时自动 Merge 赎回
 */

import PQueue from 'p-queue'
import type { MarketData, QueueEventType } from '../types'
import type { DispatchTask } from '../strategy-dispatcher'
import { getStrategyConfigManager, type MarketMakingConfig } from '../strategy-config'

// ==================== 类型定义 ====================

/**
 * 做市状态
 */
export interface MarketMakingState {
  /** 市场 conditionId */
  conditionId: string
  /** 市场问题 */
  question: string
  /** 当前挂单 */
  openOrders: {
    orderId: string
    tokenId: string
    side: 'BUY' | 'SELL'
    price: number
    size: number
    filledSize: number
    createdAt: Date
  }[]
  /** 当前持仓 */
  positions: {
    tokenId: string
    outcome: string
    size: number
    avgCost: number
  }[]
  /** 总持仓价值 */
  totalPositionValue: number
  /** 库存偏斜 (-1 到 1，0 为平衡) */
  inventorySkew: number
  /** 最后刷新时间 */
  lastRefreshAt: Date | null
  /** 状态 */
  status: 'active' | 'paused' | 'stopped'
  /** 累计利润 */
  totalProfit: number
  /** 累计成交量 */
  totalVolume: number
}

/**
 * 做市机会 (新市场准入)
 */
export interface MarketMakingOpportunity {
  id: string
  conditionId: string
  question: string
  outcomes: string[]
  prices: number[]
  liquidity: number
  volume24hr: number
  spread: number
  spreadPercent: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  detectedAt: Date
  status: 'detected' | 'active' | 'paused' | 'stopped'
  tokenIds?: string[]
}

/**
 * 订单刷新计划
 */
export interface RefreshPlan {
  conditionId: string
  cancelOrders: string[]
  newOrders: {
    tokenId: string
    side: 'BUY' | 'SELL'
    price: number
    size: number
  }[]
}

/**
 * 执行结果
 */
export interface MarketMakingResult {
  success: boolean
  conditionId: string
  action: 'enter' | 'refresh' | 'exit' | 'merge'
  ordersPlaced?: number
  ordersCancelled?: number
  mergedAmount?: number
  error?: string
  duration?: number
}

// ==================== Market-Making 策略队列 ====================

export class MarketMakingQueue {
  private queue: PQueue
  private activeMarkets: Map<string, MarketMakingState> = new Map()
  private opportunities: Map<string, MarketMakingOpportunity> = new Map()
  private eventListeners: Map<QueueEventType, ((data: any) => void)[]> = new Map()
  private refreshTimer: NodeJS.Timeout | null = null

  // 统计
  private stats = {
    totalMarketsEntered: 0,
    totalMarketsExited: 0,
    totalOrdersPlaced: 0,
    totalOrdersFilled: 0,
    totalMerges: 0,
    totalProfit: 0,
    totalVolume: 0,
  }

  constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      timeout: 30000,
    })

    console.log('✅ [MarketMakingQueue] 策略队列已初始化')
  }

  /**
   * 处理分发任务 (新市场准入)
   */
  async handleTask(task: DispatchTask): Promise<MarketMakingResult> {
    const startTime = Date.now()

    try {
      // 检测机会
      const opportunity = this.detectOpportunity(task.market)
      if (!opportunity) {
        return {
          success: false,
          conditionId: task.market.conditionId,
          action: 'enter',
          error: '不符合做市条件',
        }
      }

      this.opportunities.set(opportunity.id, opportunity)

      // 检查是否已在做市
      if (this.activeMarkets.has(opportunity.conditionId)) {
        return {
          success: false,
          conditionId: opportunity.conditionId,
          action: 'enter',
          error: '已在该市场做市',
        }
      }

      // 检查配置
      const config = getStrategyConfigManager().getStrategyConfig('marketMaking')
      const canTrade = getStrategyConfigManager().canExecuteTrade('MARKET_MAKING', config.maxPositionPerSide)
      if (!canTrade.allowed) {
        return {
          success: false,
          conditionId: opportunity.conditionId,
          action: 'enter',
          error: canTrade.reason,
        }
      }

      // 进入市场做市
      if (config.autoExecute) {
        const result = await this.queue.add(() => this.enterMarket(opportunity, config))
        return result as MarketMakingResult
      } else {
        console.log(`📋 [MarketMakingQueue] 做市机会已记录: ${opportunity.id}`)
        return {
          success: true,
          conditionId: opportunity.conditionId,
          action: 'enter',
          duration: Date.now() - startTime,
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ [MarketMakingQueue] 处理失败:`, error)

      return {
        success: false,
        conditionId: task.market.conditionId,
        action: 'enter',
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 检测做市机会
   */
  detectOpportunity(market: MarketData): MarketMakingOpportunity | null {
    const config = getStrategyConfigManager().getStrategyConfig('marketMaking')

    // 检查流动性
    const liquidity = market.liquidity || 0
    if (liquidity < config.minLiquidity) {
      return null
    }

    // 检查24h交易量
    const volume24hr = market.volume24hr || 0
    if (volume24hr < config.minVolume24h) {
      return null
    }

    // 检查价差
    const spread = market.spread || 0
    const spreadPercent = spread * 100
    if (spreadPercent < config.spreadPercent / 2) {
      // 价差太小，没有做市空间
      return null
    }

    // 计算置信度
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
    if (liquidity > 10000 && volume24hr > 20000 && spreadPercent > 3) {
      confidence = 'HIGH'
    } else if (liquidity > 5000 && volume24hr > 10000 && spreadPercent > 2) {
      confidence = 'MEDIUM'
    }

    const opportunity: MarketMakingOpportunity = {
      id: `mm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conditionId: market.conditionId,
      question: market.question,
      outcomes: market.outcomes,
      prices: market.outcomePrices,
      liquidity,
      volume24hr,
      spread,
      spreadPercent,
      confidence,
      detectedAt: new Date(),
      status: 'detected',
      tokenIds: market.clobTokenIds,
    }

    console.log(
      `🎯 [MarketMakingQueue] 检测到做市机会: ${market.question.slice(0, 40)}... ` +
      `流动性=$${liquidity.toFixed(0)}, 价差=${spreadPercent.toFixed(2)}%`
    )

    return opportunity
  }

  /**
   * 进入市场做市
   */
  async enterMarket(opportunity: MarketMakingOpportunity, config: MarketMakingConfig): Promise<MarketMakingResult> {
    const startTime = Date.now()

    try {
      console.log(`⚡ [MarketMakingQueue] 进入市场做市: ${opportunity.conditionId}`)

      // 计算初始挂单价格
      const midPrice = opportunity.prices.reduce((a, b) => a + b, 0) / opportunity.prices.length
      const halfSpread = config.spreadPercent / 100 / 2
      
      const buyPrice = midPrice * (1 - halfSpread)
      const sellPrice = midPrice * (1 + halfSpread)
      const orderSize = config.maxPositionPerSide / 2

      // TODO: 实际下单逻辑
      // 1. 对每个 token 下买单和卖单
      // 2. 记录订单 ID

      await new Promise(resolve => setTimeout(resolve, 500))

      // 创建做市状态
      const state: MarketMakingState = {
        conditionId: opportunity.conditionId,
        question: opportunity.question,
        openOrders: [], // TODO: 填入实际订单
        positions: [],
        totalPositionValue: 0,
        inventorySkew: 0,
        lastRefreshAt: new Date(),
        status: 'active',
        totalProfit: 0,
        totalVolume: 0,
      }

      this.activeMarkets.set(opportunity.conditionId, state)
      opportunity.status = 'active'
      this.stats.totalMarketsEntered++
      this.stats.totalOrdersPlaced += opportunity.outcomes.length * 2

      // 启动定时刷新
      this.startRefreshTimer(config.refreshIntervalMs)

      const result: MarketMakingResult = {
        success: true,
        conditionId: opportunity.conditionId,
        action: 'enter',
        ordersPlaced: opportunity.outcomes.length * 2,
        duration: Date.now() - startTime,
      }

      console.log(`✅ [MarketMakingQueue] 已进入市场: ${opportunity.conditionId}`)
      this.emitEvent('task:complete', result)

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ [MarketMakingQueue] 进入市场失败:`, error)

      return {
        success: false,
        conditionId: opportunity.conditionId,
        action: 'enter',
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 刷新订单
   */
  async refreshOrders(conditionId: string): Promise<MarketMakingResult> {
    const startTime = Date.now()
    const state = this.activeMarkets.get(conditionId)

    if (!state || state.status !== 'active') {
      return {
        success: false,
        conditionId,
        action: 'refresh',
        error: '市场不在活跃做市中',
      }
    }

    try {
      console.log(`🔄 [MarketMakingQueue] 刷新订单: ${conditionId}`)

      // TODO: 实际刷新逻辑
      // 1. 获取当前市场价格
      // 2. 取消旧订单
      // 3. 根据库存偏斜调整价格
      // 4. 下新订单

      await new Promise(resolve => setTimeout(resolve, 300))

      state.lastRefreshAt = new Date()

      return {
        success: true,
        conditionId,
        action: 'refresh',
        ordersCancelled: state.openOrders.length,
        ordersPlaced: state.openOrders.length,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        conditionId,
        action: 'refresh',
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 退出市场
   */
  async exitMarket(conditionId: string): Promise<MarketMakingResult> {
    const startTime = Date.now()
    const state = this.activeMarkets.get(conditionId)

    if (!state) {
      return {
        success: false,
        conditionId,
        action: 'exit',
        error: '未在该市场做市',
      }
    }

    try {
      console.log(`⏹️ [MarketMakingQueue] 退出市场: ${conditionId}`)

      // TODO: 实际退出逻辑
      // 1. 取消所有挂单
      // 2. 可选：平仓持仓

      await new Promise(resolve => setTimeout(resolve, 300))

      state.status = 'stopped'
      this.activeMarkets.delete(conditionId)
      this.stats.totalMarketsExited++

      // 更新机会状态
      const opportunity = Array.from(this.opportunities.values())
        .find(o => o.conditionId === conditionId)
      if (opportunity) {
        opportunity.status = 'stopped'
      }

      return {
        success: true,
        conditionId,
        action: 'exit',
        ordersCancelled: state.openOrders.length,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        conditionId,
        action: 'exit',
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Merge 赎回 (双边持仓时)
   */
  async mergePositions(conditionId: string): Promise<MarketMakingResult> {
    const startTime = Date.now()
    const state = this.activeMarkets.get(conditionId)

    if (!state) {
      return {
        success: false,
        conditionId,
        action: 'merge',
        error: '未在该市场做市',
      }
    }

    try {
      console.log(`🔀 [MarketMakingQueue] Merge 赎回: ${conditionId}`)

      // TODO: 实际 Merge 逻辑
      // 计算可 Merge 数量，调用合约

      await new Promise(resolve => setTimeout(resolve, 500))

      this.stats.totalMerges++

      return {
        success: true,
        conditionId,
        action: 'merge',
        mergedAmount: 0, // TODO: 实际金额
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        conditionId,
        action: 'merge',
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 启动定时刷新
   */
  private startRefreshTimer(intervalMs: number): void {
    if (this.refreshTimer) return

    this.refreshTimer = setInterval(async () => {
      for (const [conditionId, state] of this.activeMarkets) {
        if (state.status === 'active') {
          await this.queue.add(() => this.refreshOrders(conditionId))
        }
      }
    }, intervalMs)

    console.log(`⏱️ [MarketMakingQueue] 定时刷新已启动，间隔 ${intervalMs}ms`)
  }

  /**
   * 停止定时刷新
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      console.log('⏱️ [MarketMakingQueue] 定时刷新已停止')
    }
  }

  /**
   * 获取活跃做市列表
   */
  getActiveMarkets(): MarketMakingState[] {
    return Array.from(this.activeMarkets.values())
  }

  /**
   * 获取机会列表
   */
  getOpportunities(): MarketMakingOpportunity[] {
    return Array.from(this.opportunities.values())
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      activeMarketsCount: this.activeMarkets.size,
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
    }
  }

  /**
   * 停止所有做市
   */
  async stopAll(): Promise<void> {
    console.log('⏹️ [MarketMakingQueue] 停止所有做市...')

    this.stopRefreshTimer()

    for (const conditionId of this.activeMarkets.keys()) {
      await this.exitMarket(conditionId)
    }

    console.log('⏹️ [MarketMakingQueue] 所有做市已停止')
  }

  /**
   * 清空
   */
  clear(): void {
    this.stopRefreshTimer()
    this.queue.clear()
    this.activeMarkets.clear()
    this.opportunities.clear()
    console.log('🗑️ [MarketMakingQueue] 队列已清空')
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
        console.error(`❌ [MarketMakingQueue] 事件监听器错误:`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

let marketMakingQueueInstance: MarketMakingQueue | null = null

export function getMarketMakingQueue(): MarketMakingQueue {
  if (!marketMakingQueueInstance) {
    marketMakingQueueInstance = new MarketMakingQueue()
  }
  return marketMakingQueueInstance
}

export function resetMarketMakingQueue(): void {
  if (marketMakingQueueInstance) {
    marketMakingQueueInstance.clear()
  }
  marketMakingQueueInstance = null
}
