/**
 * 统一策略调度器 (Unified Strategy Dispatcher)
 * 
 * 核心功能：
 * 1. 单次扫描，识别所有套利机会
 * 2. 根据市场特征分发给不同策略
 * 3. 异步执行，互不阻塞
 * 
 * 策略分发逻辑：
 * - 铸造拆分 (MINT_SPLIT): 多选项市场(≥3 outcomes) + Bid总价 > $1
 * - 双边套利 (ARBITRAGE): 二元市场 + Ask总价 < $1 或 Bid总价 > $1
 * - 做市策略 (MARKET_MAKING): 高流动性市场 + 适中波动率
 */

import axios from "axios"
import { FEES } from "@/lib/polymarket-contracts"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

// ============ 类型定义 ============

export interface StrategyConfig {
  enabled: boolean
  autoExecute: boolean  // 是否自动执行（否则仅提示）
  // 铸造拆分参数
  mintSplit: {
    enabled: boolean
    minPriceSum: number      // Bid 总价阈值 (默认 1.005)
    minProfit: number        // 最小利润 ($)
    mintAmount: number       // 每次铸造金额
    minOutcomes: number      // 最少 outcome 数量 (默认 3)
    maxSlippage: number      // 最大滑点 (%)
  }
  // 双边套利参数
  arbitrage: {
    enabled: boolean
    minSpread: number        // 最小价差 (%)
    tradeAmount: number      // 每次交易金额
    longEnabled: boolean     // 启用做多 (Ask < 1)
    shortEnabled: boolean    // 启用做空 (Bid > 1)
  }
  // 做市参数
  marketMaking: {
    enabled: boolean
    spreadPercent: number    // 买卖价差 (%)
    maxPositionPerSide: number
    minLiquidity: number     // 最小流动性
    minVolume: number        // 最小成交量
  }
}

export interface ScannedMarket {
  conditionId: string
  question: string
  tokens: { token_id: string; outcome: string }[]
  outcomeCount: number
  // 订单簿数据
  askPrices: number[]        // 每个 outcome 的卖一价
  bidPrices: number[]        // 每个 outcome 的买一价
  askSizes: number[]         // 卖一深度
  bidSizes: number[]         // 买一深度
  realAskSum: number         // 买入总价
  realBidSum: number         // 卖出总价
  // 市场元数据
  liquidity: number
  volume: number
  category: string
  // 策略匹配
  matchedStrategies: StrategyMatch[]
}

export interface StrategyMatch {
  strategy: "MINT_SPLIT" | "ARBITRAGE_LONG" | "ARBITRAGE_SHORT" | "MARKET_MAKING"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  estimatedProfit: number
  reason: string
}

export interface DispatchResult {
  market: ScannedMarket
  strategy: string
  executed: boolean
  success?: boolean
  profit?: number
  error?: string
  txHash?: string
}

// ============ 全局状态 ============

const dispatcherState = {
  isRunning: false,
  lastScanTime: null as Date | null,
  scanCount: 0,
  totalOpportunities: 0,
  executedTrades: 0,
  totalProfit: 0,
  logs: [] as { time: Date; level: string; message: string }[],
}

// 默认配置
let strategyConfig: StrategyConfig = {
  enabled: true,
  autoExecute: false,  // 默认不自动执行，需要手动确认
  mintSplit: {
    enabled: true,
    minPriceSum: 1.005,
    minProfit: 0.02,
    mintAmount: 10,
    minOutcomes: 3,
    maxSlippage: 0.5,
  },
  arbitrage: {
    enabled: true,
    minSpread: 1.0,
    tradeAmount: 10,
    longEnabled: true,
    shortEnabled: true,
  },
  marketMaking: {
    enabled: false,  // 默认关闭，风险较高
    spreadPercent: 2,
    maxPositionPerSide: 100,
    minLiquidity: 1000,
    minVolume: 5000,
  },
}

// 执行队列（异步执行）
const executionQueue: DispatchResult[] = []
let isProcessingQueue = false

// ============ 日志函数 ============

function addLog(level: string, message: string) {
  const entry = { time: new Date(), level, message }
  dispatcherState.logs.unshift(entry)
  if (dispatcherState.logs.length > 500) {
    dispatcherState.logs.pop()
  }
  const emoji = level === "SUCCESS" ? "✅" : level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "📋"
  console.log(`[策略调度] ${emoji} ${message}`)
}

// ============ 订单簿获取 ============

async function getOrderbookData(tokenId: string): Promise<{
  bestAsk: number
  bestBid: number
  askSize: number
  bidSize: number
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

    return {
      bestAsk: asks.length > 0 ? parseFloat(asks[0].price) : 1,
      bestBid: bids.length > 0 ? parseFloat(bids[0].price) : 0,
      askSize: asks.length > 0 ? parseFloat(asks[0].size) : 0,
      bidSize: bids.length > 0 ? parseFloat(bids[0].size) : 0,
    }
  } catch {
    return { bestAsk: 1, bestBid: 0, askSize: 0, bidSize: 0 }
  }
}

// ============ 市场扫描 ============

async function fetchAndParseMarkets(): Promise<ScannedMarket[]> {
  const allMarkets: any[] = []
  const pageSize = 500
  let offset = 0
  let hasMore = true

  addLog("INFO", "开始获取活跃市场...")

  while (hasMore) {
    try {
      const response = await axios.get(`${GAMMA_API}/markets`, {
        params: { active: true, closed: false, limit: pageSize, offset },
        headers: { "User-Agent": "polymarket-bot/2.0" },
        timeout: 15000,
      })

      const markets = response.data || []
      if (markets.length === 0 || markets.length < pageSize) {
        hasMore = false
      }
      allMarkets.push(...markets)
      offset += pageSize

      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error: any) {
      addLog("ERROR", `获取市场失败: ${error.message}`)
      hasMore = false
    }
  }

  addLog("INFO", `获取到 ${allMarkets.length} 个活跃市场`)

  // 过滤并解析市场
  const scannedMarkets: ScannedMarket[] = []
  const batchSize = 20

  for (let i = 0; i < allMarkets.length; i += batchSize) {
    const batch = allMarkets.slice(i, i + batchSize)
    
    const results = await Promise.all(batch.map(async (market) => {
      if (!market.tokens || market.tokens.length < 2) return null
      if (!market.enableOrderBook) return null

      const tokens = market.tokens
      const orderbooks = await Promise.all(
        tokens.map((t: any) => getOrderbookData(t.token_id))
      )

      const askPrices = orderbooks.map(o => o.bestAsk)
      const bidPrices = orderbooks.map(o => o.bestBid)
      const askSizes = orderbooks.map(o => o.askSize)
      const bidSizes = orderbooks.map(o => o.bidSize)

      const realAskSum = askPrices.reduce((sum, p) => sum + p, 0)
      const realBidSum = bidPrices.reduce((sum, p) => sum + p, 0)

      return {
        conditionId: market.conditionId,
        question: market.question,
        tokens: tokens.map((t: any) => ({ token_id: t.token_id, outcome: t.outcome })),
        outcomeCount: tokens.length,
        askPrices,
        bidPrices,
        askSizes,
        bidSizes,
        realAskSum,
        realBidSum,
        liquidity: market.liquidityNum || parseFloat(market.liquidity || "0"),
        volume: market.volumeNum || parseFloat(market.volume || "0"),
        category: market.category || "",
        matchedStrategies: [],
      } as ScannedMarket
    }))

    scannedMarkets.push(...results.filter((m): m is ScannedMarket => m !== null))

    if ((i + batchSize) % 200 === 0) {
      addLog("INFO", `已处理 ${Math.min(i + batchSize, allMarkets.length)}/${allMarkets.length} 个市场`)
    }
  }

  return scannedMarkets
}

// ============ 策略匹配 ============

function matchStrategies(market: ScannedMarket): StrategyMatch[] {
  const matches: StrategyMatch[] = []
  const config = strategyConfig

  // 1. 铸造拆分策略 - 多选项市场 + Bid总价 > 1
  if (config.mintSplit.enabled && market.outcomeCount >= config.mintSplit.minOutcomes) {
    if (market.realBidSum > config.mintSplit.minPriceSum) {
      const grossProfit = (market.realBidSum - 1) * config.mintSplit.mintAmount
      const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT / 100) - 0.01

      if (netProfit >= config.mintSplit.minProfit) {
        // 检查流动性
        const minBidSize = Math.min(...market.bidSizes)
        let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW"
        if (minBidSize >= config.mintSplit.mintAmount * 2) {
          confidence = "HIGH"
        } else if (minBidSize >= config.mintSplit.mintAmount) {
          confidence = "MEDIUM"
        }

        matches.push({
          strategy: "MINT_SPLIT",
          confidence,
          estimatedProfit: netProfit,
          reason: `${market.outcomeCount}选项市场, Bid总价=${market.realBidSum.toFixed(4)}, 预估利润$${netProfit.toFixed(4)}`,
        })
      }
    }
  }

  // 2. 双边套利 - 二元市场
  if (config.arbitrage.enabled && market.outcomeCount === 2) {
    const spreadThreshold = config.arbitrage.minSpread / 100

    // 做多: Ask总价 < 1
    if (config.arbitrage.longEnabled && market.realAskSum < 1 - spreadThreshold) {
      const grossProfit = (1 - market.realAskSum) * config.arbitrage.tradeAmount
      const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT / 100) - 0.01

      if (netProfit > 0) {
        const minAskSize = Math.min(...market.askSizes)
        const confidence = minAskSize >= config.arbitrage.tradeAmount ? "HIGH" : "MEDIUM"

        matches.push({
          strategy: "ARBITRAGE_LONG",
          confidence,
          estimatedProfit: netProfit,
          reason: `Ask总价=${market.realAskSum.toFixed(4)}, 价差=${((1 - market.realAskSum) * 100).toFixed(2)}%`,
        })
      }
    }

    // 做空: Bid总价 > 1
    if (config.arbitrage.shortEnabled && market.realBidSum > 1 + spreadThreshold) {
      const grossProfit = (market.realBidSum - 1) * config.arbitrage.tradeAmount
      const netProfit = grossProfit * (1 - FEES.TAKER_FEE_PERCENT / 100) - 0.01

      if (netProfit > 0) {
        const minBidSize = Math.min(...market.bidSizes)
        const confidence = minBidSize >= config.arbitrage.tradeAmount ? "HIGH" : "MEDIUM"

        matches.push({
          strategy: "ARBITRAGE_SHORT",
          confidence,
          estimatedProfit: netProfit,
          reason: `Bid总价=${market.realBidSum.toFixed(4)}, 价差=${((market.realBidSum - 1) * 100).toFixed(2)}%`,
        })
      }
    }
  }

  // 3. 做市策略 - 高流动性市场
  if (config.marketMaking.enabled && market.outcomeCount === 2) {
    if (market.liquidity >= config.marketMaking.minLiquidity &&
        market.volume >= config.marketMaking.minVolume) {
      // 计算当前价差
      const midPrice = (market.askPrices[0] + market.bidPrices[0]) / 2
      const currentSpread = market.askPrices[0] - market.bidPrices[0]
      const spreadPercent = (currentSpread / midPrice) * 100

      // 如果当前价差较大，做市有利可图
      if (spreadPercent >= config.marketMaking.spreadPercent) {
        matches.push({
          strategy: "MARKET_MAKING",
          confidence: "MEDIUM",
          estimatedProfit: 0,  // 做市收益不确定
          reason: `流动性$${market.liquidity.toFixed(0)}, 当前价差${spreadPercent.toFixed(2)}%`,
        })
      }
    }
  }

  return matches
}

// ============ 异步执行队列 ============

async function processExecutionQueue() {
  if (isProcessingQueue || executionQueue.length === 0) return

  isProcessingQueue = true
  addLog("INFO", `开始处理执行队列，共 ${executionQueue.length} 个任务`)

  while (executionQueue.length > 0) {
    const task = executionQueue.shift()!
    
    try {
      addLog("INFO", `执行策略: ${task.strategy} - ${task.market.question.slice(0, 40)}...`)

      // 调用对应策略的执行函数
      const result = await executeStrategy(task)
      
      if (result.success) {
        dispatcherState.executedTrades++
        dispatcherState.totalProfit += result.profit || 0
        addLog("SUCCESS", `${task.strategy} 执行成功，利润: $${result.profit?.toFixed(4) || 0}`)
      } else {
        addLog("ERROR", `${task.strategy} 执行失败: ${result.error}`)
      }

      // 避免执行过快
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error: any) {
      addLog("ERROR", `执行异常: ${error.message}`)
    }
  }

  isProcessingQueue = false
  addLog("INFO", "执行队列处理完成")
}

async function executeStrategy(task: DispatchResult): Promise<{ success: boolean; profit?: number; error?: string }> {
  // 根据策略类型调用不同的执行函数
  switch (task.strategy) {
    case "MINT_SPLIT":
      // 调用铸造拆分执行
      return await executeMintSplitStrategy(task.market)
    
    case "ARBITRAGE_LONG":
    case "ARBITRAGE_SHORT":
      // 调用双边套利执行
      return await executeArbitrageStrategy(task.market, task.strategy)
    
    case "MARKET_MAKING":
      // 做市策略（添加市场到做市列表）
      return await executeMarketMakingStrategy(task.market)
    
    default:
      return { success: false, error: "未知策略类型" }
  }
}

// 策略执行函数 - 铸造拆分
async function executeMintSplitStrategy(market: ScannedMarket): Promise<{ success: boolean; profit?: number; error?: string }> {
  try {
    const response = await fetch("/api/strategies/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: "MINT_SPLIT",
        conditionId: market.conditionId,
        amount: strategyConfig.mintSplit.mintAmount,
        outcomes: market.tokens,
      }),
    })
    const data = await response.json()
    return data.success ? { success: true, profit: data.profit } : { success: false, error: data.error }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 策略执行函数 - 双边套利
async function executeArbitrageStrategy(market: ScannedMarket, type: string): Promise<{ success: boolean; profit?: number; error?: string }> {
  try {
    const response = await fetch("/api/arbitrage/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conditionId: market.conditionId,
        question: market.question,
        tokens: market.tokens,
        tradeType: type === "ARBITRAGE_LONG" ? "LONG" : "SHORT",
        amount: strategyConfig.arbitrage.tradeAmount,
        simulate: false,
      }),
    })
    const data = await response.json()
    return data.success ? { success: true, profit: data.profit } : { success: false, error: data.error }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// 策略执行函数 - 做市
async function executeMarketMakingStrategy(market: ScannedMarket): Promise<{ success: boolean; profit?: number; error?: string }> {
  try {
    const response = await fetch("/api/strategies/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: "MARKET_MAKING",
        conditionId: market.conditionId,
        action: "add_market",
      }),
    })
    const data = await response.json()
    return data.success ? { success: true } : { success: false, error: data.error }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ============ 主扫描函数 ============

export async function runUnifiedScan(): Promise<{
  success: boolean
  scannedCount: number
  opportunities: ScannedMarket[]
  byStrategy: Record<string, number>
}> {
  if (dispatcherState.isRunning) {
    return { success: false, scannedCount: 0, opportunities: [], byStrategy: {} }
  }

  dispatcherState.isRunning = true
  dispatcherState.lastScanTime = new Date()
  dispatcherState.scanCount++

  addLog("INFO", "========== 开始统一扫描 ==========")

  try {
    // 1. 获取并解析所有市场
    const markets = await fetchAndParseMarkets()
    addLog("INFO", `解析完成，共 ${markets.length} 个有效市场`)

    // 2. 匹配策略
    const opportunities: ScannedMarket[] = []
    const byStrategy: Record<string, number> = {
      MINT_SPLIT: 0,
      ARBITRAGE_LONG: 0,
      ARBITRAGE_SHORT: 0,
      MARKET_MAKING: 0,
    }

    for (const market of markets) {
      const matches = matchStrategies(market)
      if (matches.length > 0) {
        market.matchedStrategies = matches
        opportunities.push(market)

        for (const match of matches) {
          byStrategy[match.strategy]++
        }
      }
    }

    // 按利润排序
    opportunities.sort((a, b) => {
      const profitA = Math.max(...a.matchedStrategies.map(m => m.estimatedProfit))
      const profitB = Math.max(...b.matchedStrategies.map(m => m.estimatedProfit))
      return profitB - profitA
    })

    dispatcherState.totalOpportunities += opportunities.length

    addLog("SUCCESS", `扫描完成! 发现 ${opportunities.length} 个机会`)
    addLog("INFO", `  - 铸造拆分: ${byStrategy.MINT_SPLIT} 个`)
    addLog("INFO", `  - 做多套利: ${byStrategy.ARBITRAGE_LONG} 个`)
    addLog("INFO", `  - 做空套利: ${byStrategy.ARBITRAGE_SHORT} 个`)
    addLog("INFO", `  - 做市机会: ${byStrategy.MARKET_MAKING} 个`)

    // 3. 如果启用自动执行，将高置信度机会加入队列
    if (strategyConfig.autoExecute) {
      for (const opp of opportunities) {
        for (const match of opp.matchedStrategies) {
          if (match.confidence === "HIGH") {
            executionQueue.push({
              market: opp,
              strategy: match.strategy,
              executed: false,
            })
          }
        }
      }

      // 异步处理队列
      if (executionQueue.length > 0) {
        addLog("INFO", `加入执行队列: ${executionQueue.length} 个高置信度机会`)
        processExecutionQueue()  // 不等待，异步执行
      }
    }

    dispatcherState.isRunning = false
    return { success: true, scannedCount: markets.length, opportunities, byStrategy }

  } catch (error: any) {
    addLog("ERROR", `扫描失败: ${error.message}`)
    dispatcherState.isRunning = false
    return { success: false, scannedCount: 0, opportunities: [], byStrategy: {} }
  }
}

// ============ 导出函数 ============

export function getDispatcherState() {
  return { ...dispatcherState }
}

export function getStrategyConfig(): StrategyConfig {
  return { ...strategyConfig }
}

export function updateStrategyConfig(config: Partial<StrategyConfig>) {
  strategyConfig = { ...strategyConfig, ...config }
  
  // 深度合并子配置
  if (config.mintSplit) {
    strategyConfig.mintSplit = { ...strategyConfig.mintSplit, ...config.mintSplit }
  }
  if (config.arbitrage) {
    strategyConfig.arbitrage = { ...strategyConfig.arbitrage, ...config.arbitrage }
  }
  if (config.marketMaking) {
    strategyConfig.marketMaking = { ...strategyConfig.marketMaking, ...config.marketMaking }
  }

  addLog("INFO", "策略配置已更新")
}

export function getDispatcherLogs() {
  return [...dispatcherState.logs]
}

export function getExecutionQueue() {
  return [...executionQueue]
}

// 手动触发执行
export function triggerExecution(market: ScannedMarket, strategy: string) {
  executionQueue.push({
    market,
    strategy,
    executed: false,
  })
  processExecutionQueue()
}
