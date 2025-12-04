import axios from "axios"
import { arbitrageState, addArbitrageLog, arbitrageSettings } from "./bot-state"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

interface Market {
  question: string
  conditionId: string
  tokens: { token_id: string; outcome: string }[]
  outcomePrices: string
  active: boolean
  closed: boolean
}

interface ParsedMarket {
  question: string
  conditionId: string
  outcomePrices: string
  tokens: { token_id: string; outcome: string }[]
  spread: number
  realAskSum: number
  realBidSum: number
  isArbitrage: boolean
  arbitrageType?: "LONG" | "SHORT"
  estimatedProfit: number
}

// 获取真实的订单簿价格
async function getOrderbookPrices(tokenId: string): Promise<{ bestAsk: number; bestBid: number }> {
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

    return { bestAsk, bestBid }
  } catch (error) {
    return { bestAsk: 1, bestBid: 0 }
  }
}

// 获取活跃市场
async function fetchActiveMarkets(): Promise<Market[]> {
  try {
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params: {
        active: true,
        closed: false,
        limit: 200,
      },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 10000,
    })

    return response.data || []
  } catch (error: any) {
    addArbitrageLog(`❌ 获取市场失败: ${error.message}`)
    return []
  }
}

// 解析市场并获取真实价格
async function parseMarket(market: Market): Promise<ParsedMarket | null> {
  try {
    if (!market.tokens || market.tokens.length < 2) return null

    // 获取所有 token 的真实订单簿价格
    const pricePromises = market.tokens.map((t) => getOrderbookPrices(t.token_id))
    const prices = await Promise.all(pricePromises)

    // 计算真实的买入总价和卖出总价
    const realAskSum = prices.reduce((sum, p) => sum + p.bestAsk, 0)
    const realBidSum = prices.reduce((sum, p) => sum + p.bestBid, 0)

    // 计算价差百分比
    const spread = ((1 - realAskSum) / realAskSum) * 100

    // 判断套利机会
    let isArbitrage = false
    let arbitrageType: "LONG" | "SHORT" | undefined
    let estimatedProfit = 0

    // LONG: 买入总价 < 1
    if (realAskSum < 1 - arbitrageSettings.minSpread / 100) {
      isArbitrage = true
      arbitrageType = "LONG"
      estimatedProfit = (1 - realAskSum) * arbitrageSettings.tradeAmount
    }
    // SHORT: 卖出总价 > 1
    else if (realBidSum > 1 + arbitrageSettings.minSpread / 100) {
      isArbitrage = true
      arbitrageType = "SHORT"
      estimatedProfit = (realBidSum - 1) * arbitrageSettings.tradeAmount
    }

    return {
      question: market.question,
      conditionId: market.conditionId,
      outcomePrices: market.outcomePrices,
      tokens: market.tokens,
      spread,
      realAskSum,
      realBidSum,
      isArbitrage,
      arbitrageType,
      estimatedProfit,
    }
  } catch (error) {
    return null
  }
}

// 主扫描函数
export async function scanMarkets() {
  addArbitrageLog("🔍 开始扫描市场...")

  const markets = await fetchActiveMarkets()
  addArbitrageLog(`📊 获取到 ${markets.length} 个活跃市场`)

  if (markets.length === 0) {
    arbitrageState.scanCount++
    return
  }

  // 并行解析市场（限制并发数）
  const batchSize = 10
  const parsedMarkets: ParsedMarket[] = []

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(parseMarket))
    parsedMarkets.push(...results.filter((m): m is ParsedMarket => m !== null))
  }

  // 按价差排序
  parsedMarkets.sort((a, b) => b.spread - a.spread)

  // 更新状态
  arbitrageState.markets = parsedMarkets
  arbitrageState.scanCount++

  // 检查套利机会
  const opportunities = parsedMarkets.filter((m) => m.isArbitrage)
  if (opportunities.length > 0) {
    arbitrageState.opportunityCount += opportunities.length
    for (const opp of opportunities) {
      addArbitrageLog(
        `💡 发现${opp.arbitrageType}套利机会: ${opp.question.slice(0, 50)}... 预估利润: $${opp.estimatedProfit.toFixed(4)}`
      )
    }
  }

  addArbitrageLog(
    `✅ 扫描完成: ${parsedMarkets.length} 个市场, ${opportunities.length} 个套利机会`
  )
}
