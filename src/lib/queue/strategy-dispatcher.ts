/**
 * 策略分发器 (Strategy Dispatcher)
 * 
 * 核心功能：
 * 1. 接收扫描队列的市场数据
 * 2. 根据市场特征匹配合适的策略
 * 3. 分发给对应的策略队列处理
 * 
 * 策略分发规则：
 * - Mint-Split: 多选项市场(≥3) + Bid总价 > 1
 * - Arbitrage LONG: 二元市场 + Ask总价 < 1
 * - Arbitrage SHORT: 二元市场 + Bid总价 > 1
 * - Market-Making: 高流动性市场
 */

import type { MarketData, QueueEventType } from './types'

// ==================== 类型定义 ====================

/**
 * 策略类型
 */
export type StrategyType = 'MINT_SPLIT' | 'ARBITRAGE_LONG' | 'ARBITRAGE_SHORT' | 'MARKET_MAKING'

/**
 * 置信度等级
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * 策略匹配结果
 */
export interface StrategyMatch {
  /** 策略类型 */
  strategy: StrategyType
  /** 置信度 */
  confidence: ConfidenceLevel
  /** 预估利润 */
  estimatedProfit: number
  /** 匹配原因 */
  reason: string
  /** 匹配分数 (0-100) */
  score: number
}

/**
 * 分发任务
 */
export interface DispatchTask {
  /** 唯一ID */
  id: string
  /** 市场数据 */
  market: MarketData
  /** 匹配的策略 */
  matches: StrategyMatch[]
  /** 最佳策略 */
  bestMatch: StrategyMatch | null
  /** 创建时间 */
  createdAt: Date
  /** 状态 */
  status: 'pending' | 'dispatched' | 'executed' | 'failed' | 'skipped'
  /** 分发时间 */
  dispatchedAt?: Date
  /** 执行结果 */
  result?: {
    success: boolean
    profit?: number
    error?: string
    txHash?: string
  }
}

/**
 * 分发统计
 */
export interface DispatcherStats {
  /** 总分析数 */
  totalAnalyzed: number
  /** 匹配成功数 */
  matchedCount: number
  /** 已分发数 */
  dispatchedCount: number
  /** 各策略分发数 */
  byStrategy: Record<StrategyType, number>
  /** 最后分发时间 */
  lastDispatchAt: Date | null
}

/**
 * 策略启用配置
 */
export interface StrategyEnableConfig {
  mintSplit: boolean
  arbitrageLong: boolean
  arbitrageShort: boolean
  marketMaking: boolean
}

/**
 * 分发器配置
 */
export interface DispatcherConfig {
  /** 策略启用配置 */
  strategies: StrategyEnableConfig
  /** 是否自动分发 */
  autoDispatch: boolean
  /** 最小置信度 (跳过低于此置信度的匹配) */
  minConfidence: ConfidenceLevel
  /** 冷却时间配置 (市场ID -> 策略 -> 上次执行时间) */
  cooldownMs: number
}

// ==================== 常量 ====================

/** 默认分发器配置 */
export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  strategies: {
    mintSplit: true,
    arbitrageLong: true,
    arbitrageShort: true,
    marketMaking: false, // 默认关闭，风险较高
  },
  autoDispatch: false, // 默认不自动分发，需手动确认
  minConfidence: 'LOW',
  cooldownMs: 60000, // 1分钟冷却
}

/** 费率常量 */
const FEES = {
  TAKER_FEE_PERCENT: 0.015, // 1.5% taker 费率
  MAKER_FEE_PERCENT: 0,     // 0% maker 费率
  MIN_TX_COST: 0.01,        // 最小交易成本
}

/** 置信度分数映射 */
const CONFIDENCE_SCORES: Record<ConfidenceLevel, number> = {
  HIGH: 80,
  MEDIUM: 50,
  LOW: 20,
}

// ==================== 策略分发器类 ====================

export class StrategyDispatcher {
  private config: DispatcherConfig
  private stats: DispatcherStats
  private cooldowns: Map<string, Map<StrategyType, number>> = new Map()
  private eventListeners: Map<QueueEventType, ((data: any) => void)[]> = new Map()

  // 策略队列回调 (由外部注入)
  private strategyHandlers: Map<StrategyType, (task: DispatchTask) => Promise<void>> = new Map()

  constructor(config?: Partial<DispatcherConfig>) {
    this.config = { ...DEFAULT_DISPATCHER_CONFIG, ...config }
    this.stats = {
      totalAnalyzed: 0,
      matchedCount: 0,
      dispatchedCount: 0,
      byStrategy: {
        MINT_SPLIT: 0,
        ARBITRAGE_LONG: 0,
        ARBITRAGE_SHORT: 0,
        MARKET_MAKING: 0,
      },
      lastDispatchAt: null,
    }
  }

  /**
   * 注册策略处理器
   */
  registerHandler(strategy: StrategyType, handler: (task: DispatchTask) => Promise<void>): void {
    this.strategyHandlers.set(strategy, handler)
    console.log(`📌 [Dispatcher] 已注册 ${strategy} 策略处理器`)
  }

  /**
   * 分析并分发市场数据
   */
  async analyze(markets: MarketData[]): Promise<DispatchTask[]> {
    const tasks: DispatchTask[] = []

    for (const market of markets) {
      this.stats.totalAnalyzed++
      
      // 策略匹配
      const matches = this.matchStrategies(market)
      
      if (matches.length === 0) {
        continue
      }

      this.stats.matchedCount++
      
      // 选择最佳策略
      const bestMatch = this.selectBestMatch(matches)
      
      // 检查冷却
      if (bestMatch && this.isInCooldown(market.conditionId, bestMatch.strategy)) {
        console.log(`⏳ [Dispatcher] 市场 ${market.conditionId.slice(0, 8)}... 策略 ${bestMatch.strategy} 冷却中`)
        continue
      }

      const task: DispatchTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        market,
        matches,
        bestMatch,
        createdAt: new Date(),
        status: 'pending',
      }

      tasks.push(task)

      // 自动分发
      if (this.config.autoDispatch && bestMatch) {
        await this.dispatch(task)
      }
    }

    return tasks
  }

  /**
   * 匹配策略
   */
  private matchStrategies(market: MarketData): StrategyMatch[] {
    const matches: StrategyMatch[] = []
    const prices = market.outcomePrices
    const outcomeCount = market.outcomes.length

    if (!prices || prices.length === 0) {
      return matches
    }

    // 计算价格总和
    const priceSum = prices.reduce((sum, p) => sum + p, 0)

    // 1. Mint-Split 策略 - 多选项市场 + Bid总价 > 1
    if (this.config.strategies.mintSplit && outcomeCount >= 3) {
      if (priceSum > 1.005) { // 至少 0.5% 利润空间
        const grossProfit = (priceSum - 1) * 10 // 假设 $10 铸造
        const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT) - FEES.MIN_TX_COST

        if (netProfit > 0.01) {
          let confidence: ConfidenceLevel = 'LOW'
          if (priceSum > 1.02) confidence = 'HIGH'
          else if (priceSum > 1.01) confidence = 'MEDIUM'

          matches.push({
            strategy: 'MINT_SPLIT',
            confidence,
            estimatedProfit: netProfit,
            reason: `${outcomeCount}选项市场, 价格和=${priceSum.toFixed(4)}, 预估利润$${netProfit.toFixed(4)}`,
            score: CONFIDENCE_SCORES[confidence] + netProfit * 10,
          })
        }
      }
    }

    // 2. Arbitrage 策略 - 二元市场
    if (outcomeCount === 2) {
      // LONG: 买入总价 < 1
      if (this.config.strategies.arbitrageLong && priceSum < 0.995) {
        const grossProfit = (1 - priceSum) * 10
        const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT) - FEES.MIN_TX_COST

        if (netProfit > 0.01) {
          let confidence: ConfidenceLevel = 'LOW'
          if (priceSum < 0.98) confidence = 'HIGH'
          else if (priceSum < 0.99) confidence = 'MEDIUM'

          matches.push({
            strategy: 'ARBITRAGE_LONG',
            confidence,
            estimatedProfit: netProfit,
            reason: `二元市场做多, 价格和=${priceSum.toFixed(4)}, 预估利润$${netProfit.toFixed(4)}`,
            score: CONFIDENCE_SCORES[confidence] + netProfit * 10,
          })
        }
      }

      // SHORT: 卖出总价 > 1
      if (this.config.strategies.arbitrageShort && priceSum > 1.005) {
        const grossProfit = (priceSum - 1) * 10
        const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT) - FEES.MIN_TX_COST

        if (netProfit > 0.01) {
          let confidence: ConfidenceLevel = 'LOW'
          if (priceSum > 1.02) confidence = 'HIGH'
          else if (priceSum > 1.01) confidence = 'MEDIUM'

          matches.push({
            strategy: 'ARBITRAGE_SHORT',
            confidence,
            estimatedProfit: netProfit,
            reason: `二元市场做空, 价格和=${priceSum.toFixed(4)}, 预估利润$${netProfit.toFixed(4)}`,
            score: CONFIDENCE_SCORES[confidence] + netProfit * 10,
          })
        }
      }
    }

    // 3. Market-Making 策略 - 高流动性市场
    if (this.config.strategies.marketMaking) {
      const liquidity = market.liquidity || 0
      const volume24hr = market.volume24hr || 0

      if (liquidity >= 1000 && volume24hr >= 5000) {
        const spread = market.spread || 0
        if (spread > 0.02) { // 至少 2% 价差
          let confidence: ConfidenceLevel = 'LOW'
          if (liquidity > 10000 && spread > 0.05) confidence = 'HIGH'
          else if (liquidity > 5000 && spread > 0.03) confidence = 'MEDIUM'

          matches.push({
            strategy: 'MARKET_MAKING',
            confidence,
            estimatedProfit: spread * 10, // 粗略估算
            reason: `流动性=$${liquidity.toFixed(0)}, 价差=${(spread * 100).toFixed(2)}%`,
            score: CONFIDENCE_SCORES[confidence] + liquidity / 1000,
          })
        }
      }
    }

    return matches
  }

  /**
   * 选择最佳策略匹配
   */
  private selectBestMatch(matches: StrategyMatch[]): StrategyMatch | null {
    if (matches.length === 0) return null

    // 按置信度过滤
    const minScore = CONFIDENCE_SCORES[this.config.minConfidence]
    const filtered = matches.filter(m => CONFIDENCE_SCORES[m.confidence] >= minScore)

    if (filtered.length === 0) return null

    // 按分数排序，选最高
    filtered.sort((a, b) => b.score - a.score)
    return filtered[0]
  }

  /**
   * 检查是否在冷却中
   */
  private isInCooldown(conditionId: string, strategy: StrategyType): boolean {
    const marketCooldowns = this.cooldowns.get(conditionId)
    if (!marketCooldowns) return false

    const lastTime = marketCooldowns.get(strategy)
    if (!lastTime) return false

    return Date.now() - lastTime < this.config.cooldownMs
  }

  /**
   * 设置冷却
   */
  private setCooldown(conditionId: string, strategy: StrategyType): void {
    let marketCooldowns = this.cooldowns.get(conditionId)
    if (!marketCooldowns) {
      marketCooldowns = new Map()
      this.cooldowns.set(conditionId, marketCooldowns)
    }
    marketCooldowns.set(strategy, Date.now())
  }

  /**
   * 分发任务到策略队列
   */
  async dispatch(task: DispatchTask): Promise<void> {
    if (!task.bestMatch) {
      task.status = 'skipped'
      return
    }

    const strategy = task.bestMatch.strategy
    const handler = this.strategyHandlers.get(strategy)

    if (!handler) {
      console.warn(`⚠️ [Dispatcher] 未找到 ${strategy} 策略处理器`)
      task.status = 'skipped'
      return
    }

    try {
      task.status = 'dispatched'
      task.dispatchedAt = new Date()
      this.stats.dispatchedCount++
      this.stats.byStrategy[strategy]++
      this.stats.lastDispatchAt = new Date()

      // 设置冷却
      this.setCooldown(task.market.conditionId, strategy)

      console.log(`📤 [Dispatcher] 分发任务 ${task.id} 到 ${strategy}`)
      this.emitEvent('task:start', { taskId: task.id, strategy })

      await handler(task)

      task.status = 'executed'
      this.emitEvent('task:complete', { taskId: task.id, strategy })
    } catch (error) {
      task.status = 'failed'
      task.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
      console.error(`❌ [Dispatcher] 分发失败:`, error)
      this.emitEvent('task:error', { taskId: task.id, error: task.result.error })
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DispatcherConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.strategies) {
      this.config.strategies = { ...this.config.strategies, ...config.strategies }
    }
    console.log('🔄 [Dispatcher] 配置已更新')
  }

  /**
   * 获取统计信息
   */
  getStats(): DispatcherStats {
    return { ...this.stats }
  }

  /**
   * 获取配置
   */
  getConfig(): DispatcherConfig {
    return { ...this.config }
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalAnalyzed: 0,
      matchedCount: 0,
      dispatchedCount: 0,
      byStrategy: {
        MINT_SPLIT: 0,
        ARBITRAGE_LONG: 0,
        ARBITRAGE_SHORT: 0,
        MARKET_MAKING: 0,
      },
      lastDispatchAt: null,
    }
    console.log('🔄 [Dispatcher] 统计已重置')
  }

  /**
   * 清除冷却
   */
  clearCooldowns(): void {
    this.cooldowns.clear()
    console.log('🔄 [Dispatcher] 冷却已清除')
  }

  /**
   * 添加事件监听
   */
  on(event: QueueEventType, listener: (data: any) => void): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.push(listener)
    this.eventListeners.set(event, listeners)
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
        console.error(`❌ [Dispatcher] 事件监听器错误:`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

let dispatcherInstance: StrategyDispatcher | null = null

/**
 * 获取策略分发器单例
 */
export function getStrategyDispatcher(): StrategyDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new StrategyDispatcher()
  }
  return dispatcherInstance
}

/**
 * 重置策略分发器单例
 */
export function resetStrategyDispatcher(): void {
  dispatcherInstance = null
}
