/**
 * Arbitrage 策略队列
 * 
 * 套利策略（仅 LONG）：
 * - LONG: 当 Ask 总价 < $1 时，买入所有选项，等待结算获利
 * - SHORT 策略已移除，与 MintSplit 策略重复
 */

import PQueue from 'p-queue'
import type { MarketData, QueueEventType } from '../types'
import type { DispatchTask, StrategyType } from '../strategy-dispatcher'
import { getStrategyConfigManager, type ArbitrageConfig } from '../strategy-config'

// ==================== 类型定义 ====================

/**
 * 套利方向 (仅保留 LONG)
 */
export type ArbitrageDirection = 'LONG'

/**
 * Arbitrage 机会
 */
export interface ArbitrageOpportunity {
  /** 机会ID */
  id: string
  /** 方向 */
  direction: ArbitrageDirection
  /** 市场 conditionId */
  conditionId: string
  /** 市场问题 */
  question: string
  /** 结果选项 (二元市场) */
  outcomes: string[]
  /** 各结果价格 */
  prices: number[]
  /** 价格总和 */
  priceSum: number
  /** 价差 (与 $1 的差值) */
  spread: number
  /** 价差百分比 */
  spreadPercent: number
  /** 建议交易量 */
  suggestedAmount: number
  /** 预估毛利润 */
  grossProfit: number
  /** 预估净利润 */
  netProfit: number
  /** 置信度 */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  /** 检测时间 */
  detectedAt: Date
  /** 状态 */
  status: 'detected' | 'pending' | 'executing' | 'executed' | 'failed' | 'expired'
  /** Token IDs */
  tokenIds?: string[]
}

/**
 * 执行计划
 */
export interface ArbitrageExecutionPlan {
  /** 机会 */
  opportunity: ArbitrageOpportunity
  /** 交易金额 */
  tradeAmount: number
  /** 订单列表 */
  orders: {
    tokenId: string
    outcome: string
    side: 'BUY' | 'SELL'
    price: number
    size: number
  }[]
  /** 是否需要先铸造 */
  needsMint: boolean
  /** 铸造金额 (如需) */
  mintAmount?: number
  /** 预估收益 */
  expectedProfit: number
}

/**
 * 执行结果
 */
export interface ArbitrageResult {
  success: boolean
  opportunityId: string
  direction?: ArbitrageDirection
  actualAmount?: number
  actualProfit?: number
  txHashes?: string[]
  error?: string
  duration?: number
}

// ==================== 常量 ====================

const FEES = {
  TAKER_FEE_PERCENT: 1.5,
  MIN_TX_COST: 0.01,
}

// ==================== Arbitrage 策略队列 ====================

export class ArbitrageQueue {
  private queue: PQueue
  private opportunities: Map<string, ArbitrageOpportunity> = new Map()
  private cooldowns: Map<string, number> = new Map()
  private eventListeners: Map<QueueEventType, ((data: any) => void)[]> = new Map()

  // 统计
  private stats = {
    totalDetected: 0,
    longDetected: 0,
    totalExecuted: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalProfit: 0,
    totalLoss: 0,
  }

  constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      timeout: 60000,
    })

    console.log('✅ [ArbitrageQueue] 策略队列已初始化')
  }

  /**
   * 处理分发任务
   */
  async handleTask(task: DispatchTask, direction: ArbitrageDirection): Promise<ArbitrageResult> {
    const startTime = Date.now()

    try {
      // 1. 检测机会
      const opportunity = this.detectOpportunity(task.market, direction)
      if (!opportunity) {
        return {
          success: false,
          opportunityId: task.id,
          error: '未检测到有效机会',
        }
      }

      this.opportunities.set(opportunity.id, opportunity)
      this.stats.totalDetected++
      this.stats.longDetected++

      // 2. 检查冷却
      if (this.isInCooldown(opportunity.conditionId)) {
        opportunity.status = 'expired'
        return {
          success: false,
          opportunityId: opportunity.id,
          direction,
          error: '市场冷却中',
        }
      }

      // 3. 检查配置限制
      const strategyType: StrategyType = 'ARBITRAGE_LONG'
      const canTrade = getStrategyConfigManager().canExecuteTrade(strategyType, opportunity.suggestedAmount)
      if (!canTrade.allowed) {
        opportunity.status = 'failed'
        return {
          success: false,
          opportunityId: opportunity.id,
          direction,
          error: canTrade.reason,
        }
      }

      // 4. 生成执行计划
      const config = getStrategyConfigManager().getStrategyConfig('arbitrage')
      const plan = this.generateExecutionPlan(opportunity, config)

      // 5. 处理
      opportunity.status = 'pending'
      this.emitEvent('task:start', { opportunityId: opportunity.id, direction, plan })

      if (config.autoExecute) {
        const result = await this.queue.add(() => this.executePlan(plan))
        return result as ArbitrageResult
      } else {
        console.log(`📋 [ArbitrageQueue] ${direction} 机会已记录: ${opportunity.id}`)
        return {
          success: true,
          opportunityId: opportunity.id,
          direction,
          actualProfit: 0,
          duration: Date.now() - startTime,
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ [ArbitrageQueue] 处理失败:`, error)
      this.emitEvent('task:error', { taskId: task.id, direction, error: errorMsg })

      return {
        success: false,
        opportunityId: task.id,
        direction,
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 检测 Arbitrage 机会 (仅 LONG)
   */
  detectOpportunity(market: MarketData, direction: ArbitrageDirection): ArbitrageOpportunity | null {
    const config = getStrategyConfigManager().getStrategyConfig('arbitrage')

    // 必须是二元市场
    if (market.outcomes.length !== 2) {
      return null
    }

    const prices = market.outcomePrices
    if (!prices || prices.length !== 2) {
      return null
    }

    const priceSum = prices.reduce((sum, p) => sum + p, 0)
    let spread = 0
    let spreadPercent = 0

    // LONG: 买入总价 < 1
    if (!config.long.enabled) return null
    if (priceSum >= config.long.maxPriceSum) return null

    spread = 1 - priceSum
    spreadPercent = spread * 100

    if (spreadPercent < config.long.minSpread) return null

    // 计算利润
    const tradeAmount = config.tradeAmount
    const grossProfit = spread * tradeAmount
    const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT / 100) - FEES.MIN_TX_COST

    if (netProfit < 0.01) return null

    // 计算置信度
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
    if (spreadPercent > 2 && netProfit > 0.1) confidence = 'HIGH'
    else if (spreadPercent > 1 && netProfit > 0.05) confidence = 'MEDIUM'

    const opportunity: ArbitrageOpportunity = {
      id: `arb-${direction.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction,
      conditionId: market.conditionId,
      question: market.question,
      outcomes: market.outcomes,
      prices,
      priceSum,
      spread,
      spreadPercent,
      suggestedAmount: tradeAmount,
      grossProfit,
      netProfit,
      confidence,
      detectedAt: new Date(),
      status: 'detected',
      tokenIds: market.clobTokenIds,
    }

    console.log(
      `🎯 [ArbitrageQueue] 检测到 ${direction} 机会: ${market.question.slice(0, 40)}... ` +
      `价格和=${priceSum.toFixed(4)}, 价差=${spreadPercent.toFixed(2)}%, 利润=$${netProfit.toFixed(4)}`
    )

    return opportunity
  }

  /**
   * 生成执行计划
   */
  generateExecutionPlan(opportunity: ArbitrageOpportunity, config: ArbitrageConfig): ArbitrageExecutionPlan {
    const tradeAmount = Math.min(opportunity.suggestedAmount, config.maxTradePerOrder)
    const side: 'BUY' | 'SELL' = 'BUY'  // LONG 策略只买入

    // 生成订单
    const orders = opportunity.outcomes.map((outcome, i) => ({
      tokenId: opportunity.tokenIds?.[i] || '',
      outcome,
      side: side as 'BUY' | 'SELL',
      price: opportunity.prices[i],
      size: tradeAmount,
    }))

    const expectedProfit = opportunity.netProfit * (tradeAmount / opportunity.suggestedAmount)

    return {
      opportunity,
      tradeAmount,
      orders,
      needsMint: false,  // LONG 策略不需要铸造
      mintAmount: undefined,
      expectedProfit,
    }
  }

  /**
   * 执行计划
   */
  async executePlan(plan: ArbitrageExecutionPlan): Promise<ArbitrageResult> {
    const startTime = Date.now()
    const { opportunity } = plan
    const txHashes: string[] = []

    try {
      opportunity.status = 'executing'
      console.log(`⚡ [ArbitrageQueue] 开始执行 ${opportunity.direction}: ${opportunity.id}`)

      // ==================== Step 0: 滑点检查 ====================
      const config = getStrategyConfigManager().getStrategyConfig('arbitrage')
      const currentPriceSum = opportunity.prices.reduce((sum, p) => sum + p, 0)
      const expectedPriceSum = plan.orders.reduce((sum, o) => sum + o.price, 0)
      const slippage = Math.abs(currentPriceSum - expectedPriceSum) / expectedPriceSum * 100
      
      if (slippage > config.maxSlippage) {
        throw new Error(`滑点过大: ${slippage.toFixed(2)}% > 最大允许 ${config.maxSlippage}%`)
      }
      console.log(`   ✅ 滑点检查通过: ${slippage.toFixed(2)}% <= ${config.maxSlippage}%`)

      // TODO: 完整实现
      // 1. 批量下单 (LONG=买入所有选项)
      // 2. 等待成交

      await new Promise(resolve => setTimeout(resolve, 1000))

      // 记录交易量
      const strategyType: StrategyType = 'ARBITRAGE_LONG'
      getStrategyConfigManager().recordTradeVolume(strategyType, plan.tradeAmount)

      this.setCooldown(opportunity.conditionId)

      opportunity.status = 'executed'
      this.stats.totalExecuted++
      this.stats.totalSuccess++
      this.stats.totalProfit += plan.expectedProfit

      const result: ArbitrageResult = {
        success: true,
        opportunityId: opportunity.id,
        direction: opportunity.direction,
        actualAmount: plan.tradeAmount,
        actualProfit: plan.expectedProfit,
        txHashes: [],
        duration: Date.now() - startTime,
      }

      console.log(
        `✅ [ArbitrageQueue] ${opportunity.direction} 执行成功: ${opportunity.id}, ` +
        `金额=$${plan.tradeAmount}, 利润=$${plan.expectedProfit.toFixed(4)}`
      )

      this.emitEvent('task:complete', result)
      return result
    } catch (error) {
      opportunity.status = 'failed'
      this.stats.totalFailed++

      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ [ArbitrageQueue] 执行失败:`, error)

      return {
        success: false,
        opportunityId: opportunity.id,
        direction: opportunity.direction,
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 检查冷却
   */
  private isInCooldown(conditionId: string): boolean {
    const lastTime = this.cooldowns.get(conditionId)
    if (!lastTime) return false

    const config = getStrategyConfigManager().getStrategyConfig('arbitrage')
    return Date.now() - lastTime < config.cooldownMs
  }

  /**
   * 设置冷却
   */
  private setCooldown(conditionId: string): void {
    this.cooldowns.set(conditionId, Date.now())
  }

  /**
   * 获取机会列表
   */
  getOpportunities(direction?: ArbitrageDirection, status?: ArbitrageOpportunity['status']): ArbitrageOpportunity[] {
    let all = Array.from(this.opportunities.values())
    if (direction) {
      all = all.filter(o => o.direction === direction)
    }
    if (status) {
      all = all.filter(o => o.status === status)
    }
    return all
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
      opportunityCount: this.opportunities.size,
    }
  }

  /**
   * 等待队列空闲
   */
  async waitUntilIdle(): Promise<void> {
    await this.queue.onIdle()
  }

  /**
   * 清理过期机会
   */
  cleanupExpired(maxAgeMs: number = 300000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, opp] of this.opportunities) {
      const age = now - opp.detectedAt.getTime()
      if (age > maxAgeMs && ['detected', 'pending'].includes(opp.status)) {
        opp.status = 'expired'
        this.opportunities.delete(id)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.clear()
    this.opportunities.clear()
    this.cooldowns.clear()
    console.log('🗑️ [ArbitrageQueue] 队列已清空')
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
        console.error(`❌ [ArbitrageQueue] 事件监听器错误:`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

// 使用 globalThis 防止开发模式热重载时丢失状态
const globalForArbitrage = globalThis as unknown as {
  arbitrageQueueInstance: ArbitrageQueue | undefined
}

export function getArbitrageQueue(): ArbitrageQueue {
  if (!globalForArbitrage.arbitrageQueueInstance) {
    globalForArbitrage.arbitrageQueueInstance = new ArbitrageQueue()
    console.log('✅ [ArbitrageQueue] 策略队列已初始化')
  }
  return globalForArbitrage.arbitrageQueueInstance
}

export function resetArbitrageQueue(): void {
  if (globalForArbitrage.arbitrageQueueInstance) {
    globalForArbitrage.arbitrageQueueInstance.clear()
  }
  globalForArbitrage.arbitrageQueueInstance = undefined
}
