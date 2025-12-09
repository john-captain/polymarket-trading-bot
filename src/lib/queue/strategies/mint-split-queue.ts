/**
 * Mint-Split 策略队列
 * 
 * 铸造拆分套利策略：批发进货，拆散零售
 * 
 * 核心逻辑：
 * 1. 检测多选项市场 (≥3 outcomes)
 * 2. 当所有选项的 Bid 价格之和 > $1 时触发
 * 3. 铸造完整代币套 → 分别卖出各选项
 * 4. 利润 = 卖出总价 - 铸造成本($1) - 手续费
 */

import PQueue from 'p-queue'
import type { MarketData, QueueEventType } from '../types'
import type { DispatchTask } from '../strategy-dispatcher'
import { getStrategyConfigManager, type MintSplitConfig } from '../strategy-config'
import { PolymarketContracts } from '../../polymarket-contracts'
import { getClobClient } from '../../api-client/clob'

// ==================== 类型定义 ====================

/**
 * Mint-Split 机会
 */
export interface MintSplitOpportunity {
  /** 机会ID */
  id: string
  /** 市场 conditionId */
  conditionId: string
  /** 市场问题 */
  question: string
  /** 各结果名称 */
  outcomes: string[]
  /** 各结果价格 */
  prices: number[]
  /** 各结果可卖量 */
  sellSizes: number[]
  /** 价格总和 */
  priceSum: number
  /** 建议铸造量 */
  suggestedMintAmount: number
  /** 最大可铸造量 (受限于最小卖深) */
  maxMintAmount: number
  /** 预估毛利润 */
  grossProfit: number
  /** 预估净利润 (扣除手续费) */
  netProfit: number
  /** 利润率 (%) */
  profitPercent: number
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
export interface MintSplitExecutionPlan {
  /** 机会 */
  opportunity: MintSplitOpportunity
  /** 铸造金额 */
  mintAmount: number
  /** 卖单列表 */
  sellOrders: {
    tokenId: string
    outcome: string
    price: number
    size: number
  }[]
  /** 预估总收入 */
  expectedRevenue: number
  /** 预估利润 */
  expectedProfit: number
}

/**
 * 执行结果
 */
export interface MintSplitResult {
  /** 是否成功 */
  success: boolean
  /** 机会ID */
  opportunityId: string
  /** 实际铸造量 */
  actualMintAmount?: number
  /** 实际卖出总价 */
  actualRevenue?: number
  /** 实际利润 */
  actualProfit?: number
  /** 交易哈希 */
  txHashes?: string[]
  /** 错误信息 */
  error?: string
  /** 执行耗时 (ms) */
  duration?: number
}

// ==================== 常量 ====================

/** 费率 */
const FEES = {
  TAKER_FEE_PERCENT: 1.5, // 1.5% taker 费
  MIN_TX_COST: 0.01,      // 最小交易成本
}

// ==================== Mint-Split 策略队列 ====================

export class MintSplitQueue {
  private queue: PQueue
  private opportunities: Map<string, MintSplitOpportunity> = new Map()
  private cooldowns: Map<string, number> = new Map() // conditionId -> 上次执行时间
  private eventListeners: Map<QueueEventType, ((data: any) => void)[]> = new Map()

  // 统计
  private stats = {
    totalDetected: 0,
    totalExecuted: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalProfit: 0,
    totalLoss: 0,
  }

  constructor() {
    this.queue = new PQueue({
      concurrency: 1, // 串行执行，避免重复铸造
      timeout: 60000, // 1分钟超时
    })

    console.log('✅ [MintSplitQueue] 策略队列已初始化')
  }

  /**
   * 处理分发任务 (来自 StrategyDispatcher)
   */
  async handleTask(task: DispatchTask): Promise<MintSplitResult> {
    const startTime = Date.now()
    
    try {
      // 1. 检测机会
      const opportunity = this.detectOpportunity(task.market)
      if (!opportunity) {
        return {
          success: false,
          opportunityId: task.id,
          error: '未检测到有效机会',
        }
      }

      this.opportunities.set(opportunity.id, opportunity)
      this.stats.totalDetected++

      // 2. 检查冷却
      if (this.isInCooldown(opportunity.conditionId)) {
        opportunity.status = 'expired'
        return {
          success: false,
          opportunityId: opportunity.id,
          error: '市场冷却中',
        }
      }

      // 3. 检查配置限制
      const config = getStrategyConfigManager().getStrategyConfig('mintSplit')
      const canTrade = getStrategyConfigManager().canExecuteTrade('MINT_SPLIT', opportunity.suggestedMintAmount)
      if (!canTrade.allowed) {
        opportunity.status = 'failed'
        return {
          success: false,
          opportunityId: opportunity.id,
          error: canTrade.reason,
        }
      }

      // 4. 生成执行计划
      const plan = this.generateExecutionPlan(opportunity, config)
      
      // 5. 加入执行队列
      opportunity.status = 'pending'
      this.emitEvent('task:start', { opportunityId: opportunity.id, plan })

      // 如果配置为自动执行，则执行
      if (config.autoExecute) {
        const result = await this.queue.add(() => this.executePlan(plan))
        return result as MintSplitResult
      } else {
        // 仅记录，等待手动确认
        console.log(`📋 [MintSplitQueue] 机会已记录，等待手动确认: ${opportunity.id}`)
        return {
          success: true,
          opportunityId: opportunity.id,
          actualProfit: 0,
          duration: Date.now() - startTime,
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ [MintSplitQueue] 处理失败:`, error)
      this.emitEvent('task:error', { taskId: task.id, error: errorMsg })
      
      return {
        success: false,
        opportunityId: task.id,
        error: errorMsg,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 检测 Mint-Split 机会
   */
  detectOpportunity(market: MarketData): MintSplitOpportunity | null {
    const config = getStrategyConfigManager().getStrategyConfig('mintSplit')
    
    // 检查 outcome 数量
    if (market.outcomes.length < config.minOutcomes) {
      return null
    }

    // 检查价格数据
    const prices = market.outcomePrices
    if (!prices || prices.length !== market.outcomes.length) {
      return null
    }

    // 计算价格总和
    const priceSum = prices.reduce((sum, p) => sum + p, 0)
    
    // 检查是否满足触发条件
    if (priceSum <= config.minPriceSum) {
      return null
    }

    // 检查流动性
    if ((market.liquidity || 0) < config.minLiquidity) {
      return null
    }

    // 计算利润
    const grossProfit = (priceSum - 1) * config.mintAmount
    const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT / 100) - FEES.MIN_TX_COST

    // 检查最小利润
    if (netProfit < config.minProfit) {
      return null
    }

    // 计算置信度
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
    if (priceSum > 1.02 && netProfit > 0.1) confidence = 'HIGH'
    else if (priceSum > 1.01 && netProfit > 0.05) confidence = 'MEDIUM'

    // 估算最大可铸造量 (这里简化处理，实际需要订单簿深度)
    const maxMintAmount = Math.min(config.maxMintPerTrade, config.mintAmount * 10)

    const opportunity: MintSplitOpportunity = {
      id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conditionId: market.conditionId,
      question: market.question,
      outcomes: market.outcomes,
      prices,
      sellSizes: prices.map(() => maxMintAmount), // 简化：假设都有足够深度
      priceSum,
      suggestedMintAmount: config.mintAmount,
      maxMintAmount,
      grossProfit,
      netProfit,
      profitPercent: (netProfit / config.mintAmount) * 100,
      confidence,
      detectedAt: new Date(),
      status: 'detected',
      tokenIds: market.clobTokenIds,
    }

    console.log(
      `🎯 [MintSplitQueue] 检测到机会: ${market.question.slice(0, 50)}... ` +
      `价格和=${priceSum.toFixed(4)}, 预估利润=$${netProfit.toFixed(4)}`
    )

    return opportunity
  }

  /**
   * 生成执行计划
   */
  generateExecutionPlan(opportunity: MintSplitOpportunity, config: MintSplitConfig): MintSplitExecutionPlan {
    const mintAmount = Math.min(
      opportunity.suggestedMintAmount,
      opportunity.maxMintAmount,
      config.maxMintPerTrade
    )

    // 生成卖单列表
    const sellOrders = opportunity.outcomes.map((outcome, i) => ({
      tokenId: opportunity.tokenIds?.[i] || '',
      outcome,
      price: opportunity.prices[i],
      size: mintAmount,
    }))

    const expectedRevenue = sellOrders.reduce((sum, o) => sum + o.price * o.size, 0)
    const expectedProfit = expectedRevenue - mintAmount - (expectedRevenue * FEES.TAKER_FEE_PERCENT / 100)

    return {
      opportunity,
      mintAmount,
      sellOrders,
      expectedRevenue,
      expectedProfit,
    }
  }

  /**
   * 执行计划 (实际交易)
   * 
   * 步骤：
   * 1. 调用合约铸造代币
   * 2. 批量下卖单
   * 3. 等待成交确认
   * 4. 计算实际利润
   */
  async executePlan(plan: MintSplitExecutionPlan): Promise<MintSplitResult> {
    const startTime = Date.now()
    const { opportunity } = plan
    const txHashes: string[] = []

    try {
      opportunity.status = 'executing'
      console.log(`⚡ [MintSplitQueue] 开始执行: ${opportunity.id}`)
      console.log(`   市场: ${opportunity.question}`)
      console.log(`   铸造金额: $${plan.mintAmount}`)
      console.log(`   预期利润: $${plan.expectedProfit.toFixed(4)}`)

      // 检查私钥配置
      if (!process.env.PRIVATE_KEY) {
        throw new Error('未配置 PRIVATE_KEY 环境变量')
      }

      // ==================== Step 1: 铸造代币 ====================
      console.log(`\n🔨 [MintSplitQueue] Step 1: 铸造代币...`)
      
      const contracts = new PolymarketContracts(process.env.PRIVATE_KEY)
      const mintResult = await contracts.mintTokens(
        opportunity.conditionId,
        plan.mintAmount,
        opportunity.outcomes.length
      )

      if (!mintResult.success) {
        throw new Error(`铸造失败: ${mintResult.error}`)
      }

      if (mintResult.txHash) {
        txHashes.push(mintResult.txHash)
      }
      console.log(`   ✅ 铸造成功: ${mintResult.txHash}`)

      // ==================== Step 2: 批量下卖单 ====================
      console.log(`\n📤 [MintSplitQueue] Step 2: 批量下卖单...`)
      
      const clob = getClobClient()
      const context = { 
        traceId: opportunity.id, 
        source: 'mint-split-execution' 
      }

      let totalRevenue = 0
      const sellResults: { tokenId: string; outcome: string; success: boolean; orderId?: string; error?: string }[] = []

      for (const sellOrder of plan.sellOrders) {
        console.log(`   📝 下单: ${sellOrder.outcome} @ $${sellOrder.price.toFixed(4)} x ${sellOrder.size}`)
        
        const orderResult = await clob.createOrder(
          {
            tokenId: sellOrder.tokenId,
            side: 'SELL',
            price: sellOrder.price,
            size: sellOrder.size,
          },
          { tickSize: '0.01', negRisk: false },
          context
        )

        if (orderResult.success && orderResult.data) {
          sellResults.push({
            tokenId: sellOrder.tokenId,
            outcome: sellOrder.outcome,
            success: true,
            orderId: orderResult.data.orderId,
          })
          totalRevenue += sellOrder.price * sellOrder.size
          console.log(`      ✅ 订单已提交: ${orderResult.data.orderId}`)
          
          if (orderResult.data.transactionsHashes) {
            txHashes.push(...orderResult.data.transactionsHashes)
          }
        } else {
          sellResults.push({
            tokenId: sellOrder.tokenId,
            outcome: sellOrder.outcome,
            success: false,
            error: orderResult.error,
          })
          console.log(`      ❌ 下单失败: ${orderResult.error}`)
        }

        // 每个订单之间稍微延迟，避免限速
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // 检查卖单结果
      const successSells = sellResults.filter(r => r.success).length
      const failedSells = sellResults.filter(r => !r.success).length

      if (failedSells > 0) {
        console.log(`   ⚠️ 部分订单失败: ${successSells}/${sellResults.length} 成功`)
      }

      // ==================== Step 3: 计算结果 ====================
      console.log(`\n📊 [MintSplitQueue] Step 3: 计算结果...`)

      // 实际利润 = 卖出总收入 - 铸造成本 - 手续费
      const takerFee = totalRevenue * (FEES.TAKER_FEE_PERCENT / 100)
      const actualProfit = totalRevenue - plan.mintAmount - takerFee - FEES.MIN_TX_COST

      // 记录交易量
      getStrategyConfigManager().recordTradeVolume('MINT_SPLIT', plan.mintAmount)

      // 设置冷却
      this.setCooldown(opportunity.conditionId)

      // 更新状态和统计
      opportunity.status = failedSells === 0 ? 'executed' : 'failed'
      this.stats.totalExecuted++
      
      if (failedSells === 0) {
        this.stats.totalSuccess++
        this.stats.totalProfit += actualProfit
      } else {
        this.stats.totalFailed++
      }

      const result: MintSplitResult = {
        success: failedSells === 0,
        opportunityId: opportunity.id,
        actualMintAmount: plan.mintAmount,
        actualRevenue: totalRevenue,
        actualProfit: actualProfit,
        txHashes,
        duration: Date.now() - startTime,
      }

      console.log(`\n${'='.repeat(50)}`)
      console.log(`${result.success ? '✅' : '⚠️'} [MintSplitQueue] 执行${result.success ? '成功' : '部分成功'}`)
      console.log(`   机会ID: ${opportunity.id}`)
      console.log(`   铸造金额: $${plan.mintAmount}`)
      console.log(`   卖出收入: $${totalRevenue.toFixed(4)}`)
      console.log(`   手续费: $${takerFee.toFixed(4)}`)
      console.log(`   实际利润: $${actualProfit.toFixed(4)}`)
      console.log(`   耗时: ${result.duration}ms`)
      console.log(`${'='.repeat(50)}\n`)

      this.emitEvent('task:complete', result)
      return result

    } catch (error) {
      opportunity.status = 'failed'
      this.stats.totalFailed++

      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`\n❌ [MintSplitQueue] 执行失败: ${errorMsg}`)

      const result: MintSplitResult = {
        success: false,
        opportunityId: opportunity.id,
        error: errorMsg,
        txHashes,
        duration: Date.now() - startTime,
      }

      this.emitEvent('task:error', result)
      return result
    }
  }

  /**
   * 检查冷却状态
   */
  private isInCooldown(conditionId: string): boolean {
    const lastTime = this.cooldowns.get(conditionId)
    if (!lastTime) return false

    const config = getStrategyConfigManager().getStrategyConfig('mintSplit')
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
  getOpportunities(status?: MintSplitOpportunity['status']): MintSplitOpportunity[] {
    const all = Array.from(this.opportunities.values())
    if (status) {
      return all.filter(o => o.status === status)
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
      cooldownCount: this.cooldowns.size,
    }
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

    if (cleaned > 0) {
      console.log(`🧹 [MintSplitQueue] 清理了 ${cleaned} 个过期机会`)
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
    console.log('🗑️ [MintSplitQueue] 队列已清空')
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
        console.error(`❌ [MintSplitQueue] 事件监听器错误:`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

// 使用 globalThis 防止开发模式热重载时丢失状态
const globalForMintSplit = globalThis as unknown as {
  mintSplitQueueInstance: MintSplitQueue | undefined
}

export function getMintSplitQueue(): MintSplitQueue {
  if (!globalForMintSplit.mintSplitQueueInstance) {
    globalForMintSplit.mintSplitQueueInstance = new MintSplitQueue()
    console.log('✅ [MintSplitQueue] 策略队列已初始化')
  }
  return globalForMintSplit.mintSplitQueueInstance
}

export function resetMintSplitQueue(): void {
  if (globalForMintSplit.mintSplitQueueInstance) {
    globalForMintSplit.mintSplitQueueInstance.clear()
  }
  globalForMintSplit.mintSplitQueueInstance = undefined
}
