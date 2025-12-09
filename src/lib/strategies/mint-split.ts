/**
 * 铸造拆分套利策略 (Mint/Split Arbitrage)
 * 
 * 核心现金牛策略：批发进货，拆散零售
 * 
 * 操作逻辑：
 * 1. 监控多选项市场（如温度、赛区冠军、选举）
 * 2. 当所有选项的卖一价（Bid）之和 > $1 时触发
 * 3. 向智能合约支付 1 USDC，铸造一套完整代币
 * 4. 立即在市场上分别卖出所有代币
 * 5. 利润 = 卖出总价 - 铸造成本(1 USDC)
 * 
 * 特征：持有相同事件下的多个卖单；持仓时间极短
 */

import axios from "axios"
import type {
  MintSplitSettings,
  MintSplitOpportunity,
  StrategyStats,
  StrategyLogEntry,
} from "@/types"
import { createPolymarketContracts, calculateMintSplitProfit, FEES } from "@/lib/polymarket-contracts"
import { MarketOrderExecutor } from "@/../server/market_order"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

// 扩展设置接口（添加 autoTrade）
interface ExtendedMintSplitSettings extends MintSplitSettings {
  autoTrade?: boolean
}

// 默认设置
export const defaultMintSplitSettings: ExtendedMintSplitSettings = {
  enabled: false,
  minPriceSum: 1.005,  // 总价 > $1.005 时触发 (0.5% 利润)
  mintAmount: 10,      // 每次铸造 $10
  scanInterval: 2000,  // 2秒扫描一次
  minLiquidity: 100,   // 最小 $100 流动性
  maxSlippage: 0.5,    // 最大 0.5% 滑点
  multiOutcomeOnly: true,  // 只扫描多选项市场
  minOutcomes: 2,      // 至少 2 个结果（支持 Yes/No 二元市场）
  autoTrade: false,    // 默认不自动交易
}

// 策略状态
let strategyStats: StrategyStats = {
  strategyType: "MINT_SPLIT",
  status: "IDLE",
  executionCount: 0,
  successCount: 0,
  failCount: 0,
  totalProfit: 0,
  totalLoss: 0,
  netProfit: 0,
  runningTime: 0,
}

// 日志
const logs: StrategyLogEntry[] = []
const MAX_LOGS = 500

// 扫描间隔 ID
let scanIntervalId: NodeJS.Timeout | null = null
let startTime: Date | null = null

// 当前设置
let currentSettings: ExtendedMintSplitSettings = { ...defaultMintSplitSettings }

// 发现的机会
let opportunities: MintSplitOpportunity[] = []

/**
 * 添加日志
 */
function addLog(level: StrategyLogEntry["level"], message: string, data?: Record<string, unknown>) {
  const entry: StrategyLogEntry = {
    timestamp: new Date(),
    strategy: "MINT_SPLIT",
    level,
    message,
    data,
  }
  logs.unshift(entry)
  if (logs.length > MAX_LOGS) {
    logs.pop()
  }
  
  const emoji = level === "SUCCESS" ? "✅" : level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "📋"
  console.log(`[铸造拆分] ${emoji} ${message}`)
}

/**
 * 获取订单簿深度
 */
async function getOrderbookDepth(tokenId: string): Promise<{
  bestBid: number
  bestAsk: number
  bidSize: number
  askSize: number
  bids: { price: number; size: number }[]
  asks: { price: number; size: number }[]
}> {
  try {
    const response = await axios.get(`${CLOB_API}/book`, {
      params: { token_id: tokenId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 5000,
    })

    const data = response.data
    const bids = (data.bids || []).map((b: any) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    }))
    const asks = (data.asks || []).map((a: any) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    }))

    return {
      bestBid: bids.length > 0 ? bids[0].price : 0,
      bestAsk: asks.length > 0 ? asks[0].price : 1,
      bidSize: bids.length > 0 ? bids[0].size : 0,
      askSize: asks.length > 0 ? asks[0].size : 0,
      bids,
      asks,
    }
  } catch (error) {
    return {
      bestBid: 0,
      bestAsk: 1,
      bidSize: 0,
      askSize: 0,
      bids: [],
      asks: [],
    }
  }
}

/**
 * 计算卖出时的预期滑点
 */
function calculateSlippage(
  bids: { price: number; size: number }[],
  sellAmount: number
): { avgPrice: number; slippage: number } {
  if (bids.length === 0) {
    return { avgPrice: 0, slippage: 100 }
  }

  let remaining = sellAmount
  let totalValue = 0
  const bestPrice = bids[0].price

  for (const bid of bids) {
    const fillAmount = Math.min(remaining, bid.size)
    totalValue += fillAmount * bid.price
    remaining -= fillAmount
    if (remaining <= 0) break
  }

  if (remaining > 0) {
    // 流动性不足
    return { avgPrice: 0, slippage: 100 }
  }

  const avgPrice = totalValue / sellAmount
  const slippage = ((bestPrice - avgPrice) / bestPrice) * 100

  return { avgPrice, slippage }
}

/**
 * 获取多选项市场
 */
async function fetchMultiOutcomeMarkets(): Promise<any[]> {
  try {
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params: {
        active: true,
        closed: false,
        limit: 500,
      },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 15000,
    })

    const markets = response.data || []
    
    // 过滤多选项市场
    return markets.filter((m: any) => {
      if (!m.tokens || m.tokens.length < currentSettings.minOutcomes) return false
      if (!m.enableOrderBook) return false
      
      const liquidity = m.liquidityNum || parseFloat(m.liquidity || "0")
      if (liquidity < currentSettings.minLiquidity) return false
      
      return true
    })
  } catch (error: any) {
    addLog("ERROR", `获取市场失败: ${error.message}`)
    return []
  }
}

/**
 * 分析铸造拆分机会
 */
async function analyzeMintSplitOpportunity(market: any): Promise<MintSplitOpportunity | null> {
  try {
    const tokens = market.tokens || []
    if (tokens.length < currentSettings.minOutcomes) return null

    // 获取所有 token 的订单簿
    const orderbooks = await Promise.all(
      tokens.map((t: any) => getOrderbookDepth(t.token_id))
    )

    // 计算卖出每个 token 的预期收入
    const mintAmount = currentSettings.mintAmount
    const outcomes: MintSplitOpportunity["outcomes"] = []
    let totalBidSum = 0
    let totalExpectedSell = 0
    let minLiquidity = Infinity

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const orderbook = orderbooks[i]
      
      // 计算卖出 mintAmount 个代币的预期收入
      const { avgPrice, slippage } = calculateSlippage(orderbook.bids, mintAmount)
      
      if (slippage > currentSettings.maxSlippage) {
        // 滑点太大，跳过
        return null
      }

      const expectedSellPrice = avgPrice
      totalBidSum += orderbook.bestBid
      totalExpectedSell += expectedSellPrice * mintAmount
      minLiquidity = Math.min(minLiquidity, orderbook.bidSize * orderbook.bestBid)

      outcomes.push({
        tokenId: token.token_id,
        outcome: token.outcome,
        bestBid: orderbook.bestBid,
        bidSize: orderbook.bidSize,
        expectedSellPrice,
      })
    }

    // 铸造成本 = mintAmount (每个结果铸造相同数量)
    const mintCost = mintAmount
    // 预期利润 = 卖出总价 - 铸造成本
    const expectedProfit = totalExpectedSell - mintCost

    // 检查是否有利可图
    if (totalBidSum <= currentSettings.minPriceSum) {
      return null
    }

    // 只要净利润为正就视为机会
    if (expectedProfit <= 0) {
      return null
    }

    // 计算整体滑点
    const idealProfit = (totalBidSum - 1) * mintAmount
    const estimatedSlippage = ((idealProfit - expectedProfit) / idealProfit) * 100

    // 评估置信度
    let confidence: MintSplitOpportunity["confidence"] = "LOW"
    if (minLiquidity > 500 && estimatedSlippage < 0.2) {
      confidence = "HIGH"
    } else if (minLiquidity > 200 && estimatedSlippage < 0.5) {
      confidence = "MEDIUM"
    }

    return {
      conditionId: market.conditionId,
      question: market.question,
      outcomes,
      totalBidSum,
      expectedProfit,
      mintCost,
      estimatedSlippage,
      liquidity: minLiquidity,
      confidence,
    }
  } catch (error) {
    return null
  }
}

/**
 * 执行铸造拆分交易
 * 
 * 步骤：
 * 1. 调用智能合约铸造代币
 * 2. 在订单簿上卖出每个 outcome 的代币
 */
async function executeMintSplitTrade(opportunity: MintSplitOpportunity): Promise<{
  success: boolean
  profit?: number
  txHashes?: string[]
  error?: string
}> {
  addLog("INFO", `执行铸造拆分: ${opportunity.question.slice(0, 50)}...`, {
    totalBidSum: opportunity.totalBidSum.toFixed(4),
    expectedProfit: `$${opportunity.expectedProfit.toFixed(4)}`,
    outcomes: opportunity.outcomes.length,
  })

  const txHashes: string[] = []

  try {
    // 1. 创建合约实例
    const contracts = createPolymarketContracts()
    if (!contracts) {
      return { success: false, error: "无法创建合约实例，请检查 PRIVATE_KEY" }
    }

    // 2. 执行铸造
    addLog("INFO", `铸造 $${currentSettings.mintAmount} 代币...`)
    const mintResult = await contracts.mintTokens(
      opportunity.conditionId,
      currentSettings.mintAmount,
      opportunity.outcomes.length
    )

    if (!mintResult.success) {
      strategyStats.failCount++
      return { success: false, error: `铸造失败: ${mintResult.error}` }
    }

    if (mintResult.txHash) {
      txHashes.push(mintResult.txHash)
    }
    addLog("SUCCESS", `铸造成功: ${mintResult.txHash}`)

    // 3. 卖出所有代币
    let totalSellValue = 0
    const orderExecutor = new MarketOrderExecutor()

    for (const outcome of opportunity.outcomes) {
      addLog("INFO", `卖出 ${outcome.outcome}: ${currentSettings.mintAmount} @ $${outcome.bestBid.toFixed(4)}`)
      
      try {
        // 使用市价卖单
        const sellResult = await orderExecutor.placeMarketOrder({
          tokenId: outcome.tokenId,
          side: "SELL",
          amount: currentSettings.mintAmount,
        })

        if (sellResult && sellResult.orderID) {
          txHashes.push(sellResult.orderID)
          totalSellValue += currentSettings.mintAmount * outcome.expectedSellPrice
        }
      } catch (sellError: any) {
        addLog("ERROR", `卖出 ${outcome.outcome} 失败: ${sellError.message}`)
        // 继续卖出其他代币
      }

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // 4. 计算实际利润
    const actualProfit = totalSellValue - currentSettings.mintAmount
    const { netProfit } = calculateMintSplitProfit(opportunity.totalBidSum, currentSettings.mintAmount)

    if (actualProfit > 0) {
      strategyStats.successCount++
      strategyStats.totalProfit += actualProfit
    } else {
      strategyStats.failCount++
      strategyStats.totalLoss += Math.abs(actualProfit)
    }
    strategyStats.netProfit = strategyStats.totalProfit - strategyStats.totalLoss

    addLog("SUCCESS", `交易完成`, {
      mintCost: `$${currentSettings.mintAmount}`,
      sellTotal: `$${totalSellValue.toFixed(4)}`,
      grossProfit: `$${actualProfit.toFixed(4)}`,
      netProfit: `$${netProfit.toFixed(4)}`,
    })

    return {
      success: true,
      profit: netProfit,
      txHashes,
    }
  } catch (error: any) {
    strategyStats.failCount++
    addLog("ERROR", `执行失败: ${error.message}`)
    return {
      success: false,
      error: error.message,
      txHashes,
    }
  }
}

/**
 * 执行扫描
 */
async function scan() {
  if (strategyStats.status !== "RUNNING") return

  addLog("INFO", "开始扫描铸造拆分机会...")

  try {
    const markets = await fetchMultiOutcomeMarkets()
    addLog("INFO", `获取到 ${markets.length} 个多选项市场`)

    const newOpportunities: MintSplitOpportunity[] = []

    // 批量分析
    const batchSize = 10
    for (let i = 0; i < markets.length; i += batchSize) {
      const batch = markets.slice(i, i + batchSize)
      const results = await Promise.all(batch.map(analyzeMintSplitOpportunity))
      
      for (const opp of results) {
        if (opp) {
          newOpportunities.push(opp)
        }
      }

      // 避免 API 限速
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 按利润排序
    newOpportunities.sort((a, b) => b.expectedProfit - a.expectedProfit)
    opportunities = newOpportunities

    strategyStats.executionCount++

    if (newOpportunities.length > 0) {
      addLog("SUCCESS", `发现 ${newOpportunities.length} 个铸造拆分机会`)
      
      // 显示最佳机会
      const best = newOpportunities[0]
      addLog("SUCCESS", `最佳机会: ${best.question.slice(0, 50)}...`, {
        totalBidSum: best.totalBidSum.toFixed(4),
        expectedProfit: `$${best.expectedProfit.toFixed(4)}`,
        confidence: best.confidence,
      })

      // 如果启用自动交易，执行最佳机会
      if (currentSettings.autoTrade && newOpportunities.length > 0) {
        const best = newOpportunities[0]
        if (best.confidence !== "LOW") {
          addLog("INFO", "自动执行最佳机会...")
          await executeMintSplitTrade(best)
        }
      }
    } else {
      addLog("INFO", "本轮未发现套利机会")
    }
  } catch (error: any) {
    strategyStats.failCount++
    strategyStats.lastError = error.message
    addLog("ERROR", `扫描失败: ${error.message}`)
  }
}

/**
 * 启动策略
 */
export function startMintSplitStrategy(settings?: Partial<MintSplitSettings>) {
  if (strategyStats.status === "RUNNING") {
    addLog("WARN", "策略已在运行中")
    return
  }

  if (settings) {
    currentSettings = { ...currentSettings, ...settings }
  }

  strategyStats.status = "RUNNING"
  startTime = new Date()
  
  addLog("SUCCESS", "铸造拆分策略已启动", {
    minPriceSum: currentSettings.minPriceSum,
    mintAmount: currentSettings.mintAmount,
    scanInterval: currentSettings.scanInterval,
  })

  // 立即执行一次
  scan()

  // 设置定时扫描
  scanIntervalId = setInterval(scan, currentSettings.scanInterval)
}

/**
 * 停止策略
 */
export function stopMintSplitStrategy() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId)
    scanIntervalId = null
  }

  if (startTime) {
    strategyStats.runningTime += (Date.now() - startTime.getTime()) / 1000
  }

  strategyStats.status = "IDLE"
  addLog("INFO", "铸造拆分策略已停止")
}

/**
 * 获取策略状态
 */
export function getMintSplitStats(): StrategyStats {
  if (strategyStats.status === "RUNNING" && startTime) {
    return {
      ...strategyStats,
      runningTime: strategyStats.runningTime + (Date.now() - startTime.getTime()) / 1000,
    }
  }
  return { ...strategyStats }
}

/**
 * 获取当前机会
 */
export function getMintSplitOpportunities(): MintSplitOpportunity[] {
  return [...opportunities]
}

/**
 * 获取日志
 */
export function getMintSplitLogs(): StrategyLogEntry[] {
  return [...logs]
}

/**
 * 获取当前设置
 */
export function getMintSplitSettings(): MintSplitSettings {
  return { ...currentSettings }
}

/**
 * 更新设置
 */
export function updateMintSplitSettings(settings: Partial<MintSplitSettings>) {
  currentSettings = { ...currentSettings, ...settings }
  addLog("INFO", "设置已更新", settings as Record<string, unknown>)
}

/**
 * 模拟执行交易 (用于测试)
 */
export async function simulateMintSplitTrade(opportunity: MintSplitOpportunity): Promise<{
  success: boolean
  profit?: number
  error?: string
}> {
  addLog("INFO", `模拟执行: ${opportunity.question.slice(0, 50)}...`)

  // 模拟检查 - 只要净利润为正即可
  if (opportunity.expectedProfit <= 0) {
    return { success: false, error: "利润不足" }
  }

  if (opportunity.confidence === "LOW") {
    return { success: false, error: "置信度过低" }
  }

  // 模拟成功
  strategyStats.successCount++
  strategyStats.totalProfit += opportunity.expectedProfit
  strategyStats.netProfit = strategyStats.totalProfit - strategyStats.totalLoss

  addLog("SUCCESS", `模拟交易成功，利润: $${opportunity.expectedProfit.toFixed(4)}`)

  return {
    success: true,
    profit: opportunity.expectedProfit,
  }
}
