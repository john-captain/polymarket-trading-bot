import axios from "axios"
import { arbitrageState, addArbitrageLog, arbitrageSettings } from "./bot-state"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

interface Market {
  question: string
  conditionId: string
  tokens: { token_id: string; outcome: string }[]
  outcomePrices: string
  outcomes?: string  // JSON 字符串格式的结果列表
  active: boolean
  closed: boolean
  volume?: string
  volumeNum?: number
  liquidity?: string
  liquidityNum?: number
  category?: string
  restricted?: boolean
  enableOrderBook?: boolean
  createdAt?: string  // 创建时间
  endDate?: string    // 结束时间
  updatedAt?: string  // 更新时间
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
    const url = `${CLOB_API}/book?token_id=${tokenId}`
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

// 获取活跃市场（分页获取所有数据）
async function fetchActiveMarkets(): Promise<Market[]> {
  const allMarkets: Market[] = []
  const pageSize = 500  // 每页获取500个
  let offset = 0
  let hasMore = true

  addArbitrageLog(`📡 开始获取活跃市场...`)
  addArbitrageLog(`🔗 API: ${GAMMA_API}/markets?active=true&closed=false&limit=${pageSize}`)

  while (hasMore) {
    try {
      const apiUrl = `${GAMMA_API}/markets?active=true&closed=false&limit=${pageSize}&offset=${offset}`
      addArbitrageLog(`📥 请求: ${apiUrl}`)
      
      const response = await axios.get(`${GAMMA_API}/markets`, {
        params: {
          active: true,
          closed: false,
          limit: pageSize,
          offset: offset,
        },
        headers: { "User-Agent": "polymarket-bot/2.0" },
        timeout: 15000,
      })

      const markets = response.data || []
      
      if (markets.length === 0) {
        hasMore = false
        addArbitrageLog(`📭 offset=${offset} 返回空数据，停止分页`)
      } else {
        allMarkets.push(...markets)
        addArbitrageLog(`✅ offset=${offset} 获取 ${markets.length} 个，累计 ${allMarkets.length} 个`)
        offset += pageSize
        
        // 如果返回数量少于请求数量，说明已到最后一页
        if (markets.length < pageSize) {
          hasMore = false
          addArbitrageLog(`📄 最后一页，共 ${allMarkets.length} 个市场`)
        }
        
        // 添加小延迟避免 API 限速
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error: any) {
      addArbitrageLog(`❌ 获取市场失败 (offset=${offset}): ${error.message}`)
      hasMore = false
    }
  }

  addArbitrageLog(`✅ 共获取 ${allMarkets.length} 个活跃市场`)
  
  // 按创建时间倒序排序（最新的市场优先扫描）
  allMarkets.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime()
    const dateB = new Date(b.createdAt || 0).getTime()
    return dateB - dateA  // 倒序：新 -> 旧
  })
  addArbitrageLog(`📅 已按创建时间倒序排列（最新市场优先）`)
  
  return allMarkets
}

// 手续费配置
const TAKER_FEE_PERCENT = 1.0  // Polymarket taker 手续费约 1%
const ESTIMATED_GAS_MATIC = 0.01  // 估算 Gas 费

// 计算净利润（扣除手续费和 Gas）
function calculateNetProfit(grossProfit: number): number {
  const fee = grossProfit * (TAKER_FEE_PERCENT / 100)
  return grossProfit - fee - ESTIMATED_GAS_MATIC
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

    // LONG: 买入总价 < 1 (扣除手续费后仍有利润)
    if (realAskSum < 1 - arbitrageSettings.minSpread / 100) {
      const grossProfit = (1 - realAskSum) * arbitrageSettings.tradeAmount
      const netProfit = calculateNetProfit(grossProfit)
      if (netProfit > 0) {
        isArbitrage = true
        arbitrageType = "LONG"
        estimatedProfit = netProfit
      }
    }
    // SHORT: 卖出总价 > 1 (扣除手续费后仍有利润)
    else if (realBidSum > 1 + arbitrageSettings.minSpread / 100) {
      const grossProfit = (realBidSum - 1) * arbitrageSettings.tradeAmount
      const netProfit = calculateNetProfit(grossProfit)
      if (netProfit > 0) {
        isArbitrage = true
        arbitrageType = "SHORT"
        estimatedProfit = netProfit
      }
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
  addArbitrageLog(`⚙️ 过滤条件:`)
  addArbitrageLog(`   - 最小交易量: $${arbitrageSettings.minVolumeFilter}`)
  addArbitrageLog(`   - 最小流动性: $${arbitrageSettings.minLiquidity}`)
  addArbitrageLog(`   - 最小价差: ${arbitrageSettings.minSpread}%`)
  if (arbitrageSettings.category) {
    addArbitrageLog(`   - 分类: ${arbitrageSettings.category}`)
  }
  if (arbitrageSettings.excludeRestricted) {
    addArbitrageLog(`   - 排除受限市场: 是`)
  }
  if (arbitrageSettings.maxOutcomes > 0) {
    addArbitrageLog(`   - 最大结果数: ${arbitrageSettings.maxOutcomes}`)
  }

  const allMarkets = await fetchActiveMarkets()
  
  // 更新市场总数
  arbitrageState.totalMarketCount = allMarkets.length
  
  // 应用所有过滤条件
  const markets = allMarkets.filter(m => {
    // 交易量过滤
    const volume = m.volumeNum || parseFloat(m.volume || "0")
    if (volume < arbitrageSettings.minVolumeFilter) return false
    
    // 流动性过滤
    const liquidity = m.liquidityNum || parseFloat(m.liquidity || "0")
    if (liquidity < arbitrageSettings.minLiquidity) return false
    
    // 分类过滤
    if (arbitrageSettings.category && m.category !== arbitrageSettings.category) return false
    
    // 受限市场过滤
    if (arbitrageSettings.excludeRestricted && m.restricted) return false
    
    // 结果数过滤 (二元市场 = 2 个结果)
    if (arbitrageSettings.maxOutcomes > 0) {
      const outcomes = m.outcomes ? JSON.parse(m.outcomes).length : (m.tokens?.length || 0)
      if (outcomes > arbitrageSettings.maxOutcomes) return false
    }
    
    // 订单簿过滤
    if (arbitrageSettings.onlyWithOrderbook && !m.enableOrderBook) return false
    
    return true
  })
  
  // 更新过滤后的市场数
  arbitrageState.filteredMarketCount = markets.length
  
  addArbitrageLog(`📊 共 ${allMarkets.length} 个活跃市场，过滤后 ${markets.length} 个`)

  if (markets.length === 0) {
    arbitrageState.scanCount++
    addArbitrageLog(`⚠️ 没有符合条件的市场，请调整过滤设置`)
    return
  }

  // 并行解析市场（限制并发数）
  const batchSize = 20  // 增加批量大小以加快速度
  const parsedMarkets: ParsedMarket[] = []

  addArbitrageLog(`🔄 正在获取 ${markets.length} 个市场的订单簿价格...`)
  addArbitrageLog(`🔗 订单簿 API: ${CLOB_API}/book`)

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(parseMarket))
    parsedMarkets.push(...results.filter((m): m is ParsedMarket => m !== null))
    
    // 每处理 200 个打印进度
    if ((i + batchSize) % 200 === 0 || i + batchSize >= markets.length) {
      const progress = Math.min(i + batchSize, markets.length)
      addArbitrageLog(`⏳ 已处理 ${progress}/${markets.length} 个市场...`)
    }
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
