/**
 * 做市商策略 (Market Making)
 * 
 * 动态对冲，赚取流动性价差
 * 
 * 操作逻辑：
 * 1. 在活跃市场的双方（是/否）同时挂单
 * 2. 不赌方向，只赚流动性。买单挂 49 美分，卖单挂 51 美分
 * 3. 只要有人买卖，就赚中间的 2 美分差价
 * 4. 风控：单边库存过多时，调整价格或使用 Merge 功能赎回
 * 
 * 特征：持续挂单，需要频繁调整价格，适合高流动性市场
 */

import axios from "axios"
import type {
  MarketMakingSettings,
  Position,
  OpenOrder,
  StrategyStats,
  StrategyLogEntry,
} from "@/types"
import { MarketOrderExecutor } from "@/../server/market_order"
import { createPolymarketContracts } from "@/lib/polymarket-contracts"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

// 默认设置
export const defaultMarketMakingSettings: MarketMakingSettings = {
  enabled: false,
  targetMarkets: [],           // 目标市场列表
  spreadPercent: 2,            // 2% 价差 (买49卖51)
  maxPositionPerSide: 100,     // 单边最大 $100 持仓
  totalCapital: 500,           // 总资金 $500
  inventorySkewThreshold: 0.3, // 30% 库存偏斜触发对冲
  autoHedge: true,
  refreshInterval: 5000,       // 5 秒刷新
  enableMerge: true,
}

// 策略状态
let strategyStats: StrategyStats = {
  strategyType: "MARKET_MAKING",
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

// 当前设置
let currentSettings: MarketMakingSettings = { ...defaultMarketMakingSettings }

// 做市订单
const marketMakingOrders: Map<string, {
  conditionId: string
  question: string
  yesTokenId: string
  noTokenId: string
  yesBuyOrder?: OpenOrder
  yesSellOrder?: OpenOrder
  noBuyOrder?: OpenOrder
  noSellOrder?: OpenOrder
  yesPosition: number
  noPosition: number
  midPrice: number
  lastUpdate: Date
}> = new Map()

// 定时器
let refreshIntervalId: NodeJS.Timeout | null = null
let startTime: Date | null = null

/**
 * 添加日志
 */
function addLog(level: StrategyLogEntry["level"], message: string, data?: Record<string, unknown>) {
  const entry: StrategyLogEntry = {
    timestamp: new Date(),
    strategy: "MARKET_MAKING",
    level,
    message,
    data,
  }
  logs.unshift(entry)
  if (logs.length > MAX_LOGS) {
    logs.pop()
  }
  
  const emoji = level === "SUCCESS" ? "📈" : level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "🏦"
  console.log(`[做市商] ${emoji} ${message}`)
}

/**
 * 获取订单簿
 */
async function getOrderbook(tokenId: string): Promise<{
  midPrice: number
  bestBid: number
  bestAsk: number
  spread: number
}> {
  try {
    const response = await axios.get(`${CLOB_API}/book`, {
      params: { token_id: tokenId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 5000,
    })

    const data = response.data
    const asks = data.asks || []
    const bids = data.bids || []

    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 1
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0
    const midPrice = (bestAsk + bestBid) / 2
    const spread = bestAsk - bestBid

    return { midPrice, bestBid, bestAsk, spread }
  } catch (error) {
    return { midPrice: 0.5, bestBid: 0, bestAsk: 1, spread: 1 }
  }
}

/**
 * 获取市场信息
 */
async function fetchMarketInfo(conditionId: string): Promise<any | null> {
  try {
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params: { condition_id: conditionId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 10000,
    })

    const markets = response.data || []
    return markets.length > 0 ? markets[0] : null
  } catch (error) {
    return null
  }
}

/**
 * 计算做市报价
 */
function calculateQuotes(midPrice: number, spreadPercent: number): {
  buyPrice: number
  sellPrice: number
} {
  const halfSpread = spreadPercent / 200 // 转换为小数
  const buyPrice = Math.max(0.01, midPrice * (1 - halfSpread))
  const sellPrice = Math.min(0.99, midPrice * (1 + halfSpread))
  
  return {
    buyPrice: Math.round(buyPrice * 100) / 100,
    sellPrice: Math.round(sellPrice * 100) / 100,
  }
}

/**
 * 计算库存偏斜
 */
function calculateInventorySkew(yesPosition: number, noPosition: number): number {
  const total = yesPosition + noPosition
  if (total === 0) return 0
  return Math.abs(yesPosition - noPosition) / total
}

/**
 * 创建或更新订单（调用真实 API）
 */
async function createOrder(
  tokenId: string,
  side: "BUY" | "SELL",
  price: number,
  size: number
): Promise<OpenOrder | null> {
  try {
    // 调用 CLOB API 创建限价单
    const orderExecutor = new MarketOrderExecutor()
    const result = await orderExecutor.placeLimitOrder(tokenId, side, price, size)

    if (!result || !result.orderID) {
      addLog("ERROR", `创建订单失败: ${side} @ ${price}`)
      return null
    }

    const order: OpenOrder = {
      orderId: result.orderID,
      tokenId,
      conditionId: "",
      side,
      price,
      size,
      filledSize: 0,
      status: "OPEN",
      strategy: "MARKET_MAKING",
      createdAt: new Date(),
    }

    addLog("INFO", `订单创建成功: ${side} ${size} @ $${price.toFixed(4)}`, {
      orderId: result.orderID,
    })

    return order
  } catch (error: any) {
    addLog("ERROR", `创建订单异常: ${error.message}`)
    return null
  }
}

/**
 * 取消订单（调用真实 API）
 */
async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    const orderExecutor = new MarketOrderExecutor()
    await orderExecutor.cancelOrder(orderId)
    addLog("INFO", `订单已取消: ${orderId}`)
    return true
  } catch (error: any) {
    addLog("ERROR", `取消订单失败: ${orderId} - ${error.message}`)
    return false
  }
}

/**
 * 更新单个市场的报价
 */
async function updateMarketQuotes(conditionId: string) {
  const mm = marketMakingOrders.get(conditionId)
  if (!mm) return

  try {
    // 获取 YES token 的订单簿
    const yesBook = await getOrderbook(mm.yesTokenId)
    mm.midPrice = yesBook.midPrice

    // 计算新报价
    const { buyPrice, sellPrice } = calculateQuotes(yesBook.midPrice, currentSettings.spreadPercent)

    // 检查库存偏斜
    const skew = calculateInventorySkew(mm.yesPosition, mm.noPosition)
    
    // 如果偏斜过大，调整报价
    let adjustedBuyPrice = buyPrice
    let adjustedSellPrice = sellPrice
    
    if (skew > currentSettings.inventorySkewThreshold) {
      if (mm.yesPosition > mm.noPosition) {
        // YES 持仓过多，降低买价，提高卖价激励卖出
        adjustedBuyPrice = buyPrice * 0.98
        adjustedSellPrice = sellPrice * 0.99
        addLog("WARN", `库存偏斜 ${(skew * 100).toFixed(1)}%，调整 YES 报价`, {
          buyPrice: adjustedBuyPrice.toFixed(4),
          sellPrice: adjustedSellPrice.toFixed(4),
        })
      } else {
        // NO 持仓过多
        adjustedBuyPrice = buyPrice * 1.01
        adjustedSellPrice = sellPrice * 1.02
      }
    }

    // 更新订单 (模拟)
    mm.yesBuyOrder = await createOrder(mm.yesTokenId, "BUY", adjustedBuyPrice, 10) || undefined
    mm.yesSellOrder = await createOrder(mm.yesTokenId, "SELL", adjustedSellPrice, 10) || undefined

    mm.lastUpdate = new Date()

    addLog("INFO", `更新报价: ${mm.question.slice(0, 30)}...`, {
      midPrice: yesBook.midPrice.toFixed(4),
      buyPrice: adjustedBuyPrice.toFixed(4),
      sellPrice: adjustedSellPrice.toFixed(4),
      skew: `${(skew * 100).toFixed(1)}%`,
    })
  } catch (error: any) {
    addLog("ERROR", `更新报价失败: ${error.message}`)
  }
}

/**
 * 刷新所有市场报价
 */
async function refreshAllQuotes() {
  if (strategyStats.status !== "RUNNING") return

  strategyStats.executionCount++

  for (const conditionId of marketMakingOrders.keys()) {
    await updateMarketQuotes(conditionId)
    // 避免 API 限速
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/**
 * 添加目标市场
 */
export async function addTargetMarket(conditionId: string): Promise<boolean> {
  if (marketMakingOrders.has(conditionId)) {
    addLog("WARN", `市场 ${conditionId} 已在做市列表中`)
    return false
  }

  const marketInfo = await fetchMarketInfo(conditionId)
  if (!marketInfo) {
    addLog("ERROR", `找不到市场: ${conditionId}`)
    return false
  }

  if (!marketInfo.tokens || marketInfo.tokens.length < 2) {
    addLog("ERROR", `市场 ${conditionId} 不是二元市场`)
    return false
  }

  const yesToken = marketInfo.tokens.find((t: any) => t.outcome === "Yes") || marketInfo.tokens[0]
  const noToken = marketInfo.tokens.find((t: any) => t.outcome === "No") || marketInfo.tokens[1]

  marketMakingOrders.set(conditionId, {
    conditionId,
    question: marketInfo.question,
    yesTokenId: yesToken.token_id,
    noTokenId: noToken.token_id,
    yesPosition: 0,
    noPosition: 0,
    midPrice: 0.5,
    lastUpdate: new Date(),
  })

  currentSettings.targetMarkets.push(conditionId)

  addLog("SUCCESS", `添加做市市场: ${marketInfo.question.slice(0, 50)}...`)

  // 立即更新报价
  await updateMarketQuotes(conditionId)

  return true
}

/**
 * 移除目标市场
 */
export async function removeTargetMarket(conditionId: string): Promise<boolean> {
  const mm = marketMakingOrders.get(conditionId)
  if (!mm) {
    addLog("WARN", `市场 ${conditionId} 不在做市列表中`)
    return false
  }

  // 取消所有订单
  if (mm.yesBuyOrder) await cancelOrder(mm.yesBuyOrder.orderId)
  if (mm.yesSellOrder) await cancelOrder(mm.yesSellOrder.orderId)
  if (mm.noBuyOrder) await cancelOrder(mm.noBuyOrder.orderId)
  if (mm.noSellOrder) await cancelOrder(mm.noSellOrder.orderId)

  marketMakingOrders.delete(conditionId)
  currentSettings.targetMarkets = currentSettings.targetMarkets.filter(id => id !== conditionId)

  addLog("INFO", `移除做市市场: ${conditionId}`)

  return true
}

/**
 * 启动策略
 */
export function startMarketMakingStrategy(settings?: Partial<MarketMakingSettings>) {
  if (strategyStats.status === "RUNNING") {
    addLog("WARN", "策略已在运行中")
    return
  }

  if (settings) {
    currentSettings = { ...currentSettings, ...settings }
  }

  strategyStats.status = "RUNNING"
  startTime = new Date()

  addLog("SUCCESS", "做市商策略已启动", {
    spreadPercent: `${currentSettings.spreadPercent}%`,
    maxPositionPerSide: `$${currentSettings.maxPositionPerSide}`,
    totalCapital: `$${currentSettings.totalCapital}`,
    targetMarkets: currentSettings.targetMarkets.length,
  })

  // 立即刷新一次
  refreshAllQuotes()

  // 设置定时刷新
  refreshIntervalId = setInterval(refreshAllQuotes, currentSettings.refreshInterval)
}

/**
 * 停止策略
 */
export async function stopMarketMakingStrategy() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId)
    refreshIntervalId = null
  }

  // 取消所有订单
  for (const [conditionId, mm] of marketMakingOrders) {
    if (mm.yesBuyOrder) await cancelOrder(mm.yesBuyOrder.orderId)
    if (mm.yesSellOrder) await cancelOrder(mm.yesSellOrder.orderId)
    if (mm.noBuyOrder) await cancelOrder(mm.noBuyOrder.orderId)
    if (mm.noSellOrder) await cancelOrder(mm.noSellOrder.orderId)
  }

  if (startTime) {
    strategyStats.runningTime += (Date.now() - startTime.getTime()) / 1000
  }

  strategyStats.status = "IDLE"
  addLog("INFO", "做市商策略已停止")
}

/**
 * 获取策略状态
 */
export function getMarketMakingStats(): StrategyStats {
  if (strategyStats.status === "RUNNING" && startTime) {
    return {
      ...strategyStats,
      runningTime: strategyStats.runningTime + (Date.now() - startTime.getTime()) / 1000,
    }
  }
  return { ...strategyStats }
}

/**
 * 获取做市市场列表
 */
export function getMarketMakingMarkets(): {
  conditionId: string
  question: string
  midPrice: number
  yesPosition: number
  noPosition: number
  skew: number
  lastUpdate: Date
}[] {
  const result = []
  for (const mm of marketMakingOrders.values()) {
    result.push({
      conditionId: mm.conditionId,
      question: mm.question,
      midPrice: mm.midPrice,
      yesPosition: mm.yesPosition,
      noPosition: mm.noPosition,
      skew: calculateInventorySkew(mm.yesPosition, mm.noPosition),
      lastUpdate: mm.lastUpdate,
    })
  }
  return result
}

/**
 * 获取日志
 */
export function getMarketMakingLogs(): StrategyLogEntry[] {
  return [...logs]
}

/**
 * 获取当前设置
 */
export function getMarketMakingSettings(): MarketMakingSettings {
  return { ...currentSettings }
}

/**
 * 更新设置
 */
export function updateMarketMakingSettings(settings: Partial<MarketMakingSettings>) {
  currentSettings = { ...currentSettings, ...settings }
  addLog("INFO", "设置已更新", settings as Record<string, unknown>)
}

/**
 * 获取总体统计
 */
export function getMarketMakingSummary(): {
  totalMarkets: number
  totalPositionValue: number
  totalPnL: number
  avgSkew: number
} {
  let totalPositionValue = 0
  let totalSkew = 0
  
  for (const mm of marketMakingOrders.values()) {
    totalPositionValue += (mm.yesPosition + mm.noPosition) * mm.midPrice
    totalSkew += calculateInventorySkew(mm.yesPosition, mm.noPosition)
  }
  
  const marketCount = marketMakingOrders.size
  
  return {
    totalMarkets: marketCount,
    totalPositionValue,
    totalPnL: strategyStats.netProfit,
    avgSkew: marketCount > 0 ? totalSkew / marketCount : 0,
  }
}

/**
 * 模拟成交
 */
export function simulateFill(conditionId: string, side: "BUY" | "SELL", isYes: boolean, amount: number, price: number) {
  const mm = marketMakingOrders.get(conditionId)
  if (!mm) return

  if (isYes) {
    if (side === "BUY") {
      mm.yesPosition += amount
      strategyStats.totalLoss += amount * price
    } else {
      mm.yesPosition -= amount
      strategyStats.totalProfit += amount * price
    }
  } else {
    if (side === "BUY") {
      mm.noPosition += amount
      strategyStats.totalLoss += amount * price
    } else {
      mm.noPosition -= amount
      strategyStats.totalProfit += amount * price
    }
  }

  strategyStats.netProfit = strategyStats.totalProfit - strategyStats.totalLoss
  strategyStats.successCount++

  addLog("SUCCESS", `成交: ${side} ${isYes ? "YES" : "NO"} x${amount} @ $${price.toFixed(4)}`)
}
