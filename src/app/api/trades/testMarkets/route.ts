import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"

const GAMMA_API = "https://gamma-api.polymarket.com"
const CLOB_API = "https://clob.polymarket.com"

// 创建代理 agent
function getProxyAgent() {
  const socksProxy = process.env.SOCKS_PROXY
  if (socksProxy) {
    return new SocksProxyAgent(socksProxy)
  }
  const httpProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (httpProxy) {
    return new HttpsProxyAgent(httpProxy)
  }
  return undefined
}

export interface TestMarket {
  question: string
  conditionId: string
  tokenId: string
  outcome: string
  bestBid: number
  bestAsk: number
  spread: number
  spreadPercent: number
  liquidity: number
  volume: number
  endDate: string | null
  daysUntilEnd: number | null
  riskScore: number  // 风险评分 (1-10, 1最低)
  testAmount: number  // 建议测试金额
  estimatedLoss: number  // 预估最大损失
  reason: string
  category: string
}

// 获取订单簿详情
async function getOrderbookDetails(tokenId: string, proxyAgent: any) {
  try {
    const response = await axios.get(`${CLOB_API}/book`, {
      params: { token_id: tokenId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 10000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })

    const data = response.data
    const asks = data.asks || []
    const bids = data.bids || []

    if (bids.length === 0 || asks.length === 0) {
      return null
    }

    const bestBid = parseFloat(bids[0].price)
    const bestAsk = parseFloat(asks[0].price)
    const spread = bestAsk - bestBid
    
    // 计算深度（前5档的总量）
    const bidDepth = bids.slice(0, 5).reduce((sum: number, b: any) => sum + parseFloat(b.size || 0), 0)
    const askDepth = asks.slice(0, 5).reduce((sum: number, a: any) => sum + parseFloat(a.size || 0), 0)

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercent: (spread / bestAsk) * 100,
      bidDepth,
      askDepth,
      liquidity: Math.min(bidDepth, askDepth) * bestBid,
    }
  } catch (error) {
    return null
  }
}

// 计算风险评分 (1-10, 1最安全)
function calculateRiskScore(market: any, orderbook: any, daysUntilEnd: number | null): number {
  let score = 5  // 基础分数

  // 流动性越高风险越低
  if (orderbook.liquidity > 1000) score -= 2
  else if (orderbook.liquidity > 500) score -= 1
  else if (orderbook.liquidity < 100) score += 2

  // 价差越小风险越低
  if (orderbook.spreadPercent < 1) score -= 2
  else if (orderbook.spreadPercent < 2) score -= 1
  else if (orderbook.spreadPercent > 5) score += 2

  // 交易量越大风险越低
  const volume = parseFloat(market.volume || 0)
  if (volume > 100000) score -= 1
  else if (volume < 10000) score += 1

  // 距离结束时间越长风险越低
  if (daysUntilEnd !== null) {
    if (daysUntilEnd > 180) score -= 2  // 6个月以上
    else if (daysUntilEnd > 90) score -= 1  // 3个月以上
    else if (daysUntilEnd < 7) score += 3  // 1周内结束风险很高
    else if (daysUntilEnd < 30) score += 1  // 1个月内结束
  }

  return Math.max(1, Math.min(10, score))
}

// 计算距离结束的天数
function calculateDaysUntilEnd(endDate: string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const now = new Date()
  const diffTime = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

export async function GET(request: NextRequest) {
  try {
    const proxyAgent = getProxyAgent()
    const { searchParams } = new URL(request.url)
    
    // 解析筛选参数
    const minDaysUntilEnd = parseInt(searchParams.get("minDays") || "30")  // 默认至少30天
    const maxSpread = parseFloat(searchParams.get("maxSpread") || "5")  // 默认最大价差5%
    const minLiquidity = parseFloat(searchParams.get("minLiquidity") || "50")  // 默认最小流动性$50
    const category = searchParams.get("category") || ""  // 市场类别
    const limit = parseInt(searchParams.get("limit") || "20")  // 返回数量
    
    console.log("🔍 开始查找测试交易市场...")
    console.log(`筛选条件: 最少${minDaysUntilEnd}天结束, 最大价差${maxSpread}%, 最小流动性$${minLiquidity}`)

    // 获取活跃、非受限的市场
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params: {
        active: true,
        closed: false,
        restricted: false,  // 只获取非受限市场
        limit: 500,  // 增加获取数量
      },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 30000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })

    const markets = response.data || []
    console.log(`获取到 ${markets.length} 个非受限市场`)

    const testMarkets: TestMarket[] = []
    
    // 调试统计
    let stats = {
      restricted: 0,
      noOrderBook: 0,
      tooSoon: 0,
      noTokens: 0,
      noOrderbookData: 0,
      spreadTooHigh: 0,
      liquidityTooLow: 0,
      passed: 0
    }

    // 分析每个市场 (最多检查 300 个)
    for (const market of markets.slice(0, 300)) {
      try {
        // 注意：restricted 可能表示地理限制，暂时跳过此检查
        // 在测试交易中，我们仍然可以尝试下单
        if (market.restricted) {
          stats.restricted++
          // continue  // 暂时注释掉，允许尝试受限市场
        }
        
        // 跳过没有订单簿的市场
        if (!market.enableOrderBook) {
          stats.noOrderBook++
          continue
        }

        // 检查结束时间
        const endDate = market.endDate || market.end_date_iso || null
        const daysUntilEnd = calculateDaysUntilEnd(endDate)
        
        // 筛选：距离结束时间必须大于指定天数（如果有结束日期）
        // 注意：如果没有结束日期，允许通过
        if (daysUntilEnd !== null && daysUntilEnd < minDaysUntilEnd) {
          stats.tooSoon++
          continue
        }
        
        // 筛选类别
        const marketCategory = market.category || market.tags?.[0] || "其他"
        if (category && marketCategory.toLowerCase() !== category.toLowerCase()) {
          continue
        }

        // 解析代币
        let tokens = market.tokens || []
        if (typeof tokens === 'string') {
          tokens = JSON.parse(tokens)
        }
        
        if (!tokens || tokens.length < 2) {
          // 尝试从 clobTokenIds 获取
          let tokenIds = market.clobTokenIds || []
          if (typeof tokenIds === 'string') {
            tokenIds = JSON.parse(tokenIds)
          }
          
          let outcomes = market.outcomes || []
          if (typeof outcomes === 'string') {
            outcomes = JSON.parse(outcomes)
          }
          
          if (tokenIds.length >= 2 && outcomes.length >= 2) {
            tokens = tokenIds.map((id: string, i: number) => ({
              token_id: id,
              outcome: outcomes[i] || `选项${i + 1}`
            }))
          }
        }

        if (!tokens || tokens.length < 2) {
          stats.noTokens++
          continue
        }

        // 检查第一个代币的订单簿
        const tokenId = tokens[0].token_id || tokens[0].tokenId
        if (!tokenId) {
          stats.noTokens++
          continue
        }

        // 使用 API 返回的价格数据而不是查询订单簿（更快）
        let bestBid = market.bestBid || 0
        let bestAsk = market.bestAsk || 0
        
        // 如果没有价格数据，尝试从 outcomePrices 获取
        if (!bestBid || !bestAsk) {
          let outcomePrices = market.outcomePrices || []
          if (typeof outcomePrices === 'string') {
            try {
              outcomePrices = JSON.parse(outcomePrices)
            } catch {
              outcomePrices = []
            }
          }
          if (outcomePrices.length > 0) {
            const price = parseFloat(outcomePrices[0]) || 0.5
            bestBid = price - 0.01
            bestAsk = price + 0.01
          }
        }

        // 如果还是没有价格，才查询订单簿
        if (!bestBid || !bestAsk) {
          const orderbook = await getOrderbookDetails(tokenId, proxyAgent)
          if (!orderbook) {
            stats.noOrderbookData++
            continue
          }
          bestBid = orderbook.bestBid
          bestAsk = orderbook.bestAsk
        }

        const spread = bestAsk - bestBid
        const spreadPercent = bestAsk > 0 ? (spread / bestAsk) * 100 : 100
        const liquidity = parseFloat(market.liquidityNum || market.liquidity || 0)

        // 筛选条件：价差和流动性
        if (spreadPercent > maxSpread) {
          stats.spreadTooHigh++
          continue
        }
        if (liquidity < minLiquidity) {
          stats.liquidityTooLow++
          continue
        }
        
        stats.passed++

        // 创建一个模拟的 orderbook 对象用于兼容
        const orderbookData = {
          bestBid,
          bestAsk,
          spread,
          spreadPercent,
          liquidity,
        }

        const riskScore = calculateRiskScore(market, orderbookData, daysUntilEnd)
        const testAmount = 1.0  // 固定测试金额 $1
        const estimatedLoss = testAmount * (spreadPercent / 100) + 0.01  // 价差损失 + 手续费

        testMarkets.push({
          question: market.question,
          conditionId: market.conditionId || market.condition_id,
          tokenId: tokenId,
          outcome: tokens[0].outcome,
          bestBid,
          bestAsk,
          spread,
          spreadPercent,
          liquidity,
          volume: parseFloat(market.volume || 0),
          endDate,
          daysUntilEnd,
          category: marketCategory,
          riskScore,
          testAmount,
          estimatedLoss,
          reason: getReason(riskScore, orderbookData, daysUntilEnd),
        })

        // 限制数量
        if (testMarkets.length >= limit) break
        
        // 减少延迟
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        // 跳过错误的市场
        continue
      }
    }

    // 输出调试统计
    console.log(`📊 筛选统计:`, stats)
    console.log(`   受限市场: ${stats.restricted}, 无订单簿功能: ${stats.noOrderBook}`)
    console.log(`   结束时间过近: ${stats.tooSoon}, 无代币数据: ${stats.noTokens}`)
    console.log(`   订单簿无数据: ${stats.noOrderbookData}, 价差过高: ${stats.spreadTooHigh}`)
    console.log(`   流动性不足: ${stats.liquidityTooLow}, 通过筛选: ${stats.passed}`)

    // 按风险评分排序（最低风险优先）
    testMarkets.sort((a, b) => a.riskScore - b.riskScore)

    return NextResponse.json({
      success: true,
      data: testMarkets,
      count: testMarkets.length,
      filters: {
        minDaysUntilEnd,
        maxSpread,
        minLiquidity,
        category: category || "全部",
        limit,
      },
      stats,  // 返回统计信息便于调试
      message: testMarkets.length > 0 
        ? `找到 ${testMarkets.length} 个适合测试的市场`
        : "未找到合适的测试市场，请尝试放宽筛选条件",
    })
  } catch (error: any) {
    console.error("查找测试市场错误:", error)
    return NextResponse.json(
      { success: false, error: error.message, data: [] },
      { status: 500 }
    )
  }
}

function getReason(riskScore: number, orderbook: any, daysUntilEnd: number | null): string {
  const reasons = []
  
  if (orderbook.spreadPercent < 1) {
    reasons.push("极低价差")
  } else if (orderbook.spreadPercent < 2) {
    reasons.push("低价差")
  }
  
  if (orderbook.liquidity > 500) {
    reasons.push("高流动性")
  } else if (orderbook.liquidity > 200) {
    reasons.push("中等流动性")
  }
  
  if (daysUntilEnd !== null) {
    if (daysUntilEnd > 180) {
      reasons.push("长期市场")
    } else if (daysUntilEnd > 90) {
      reasons.push("中期市场")
    }
  }
  
  if (riskScore <= 3) {
    reasons.push("推荐测试")
  }
  
  return reasons.join(", ") || "一般"
}
