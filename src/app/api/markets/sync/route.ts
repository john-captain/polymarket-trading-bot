/**
 * 市场同步 API
 * POST /api/markets/sync - 从 Polymarket 同步市场数据到数据库
 * GET /api/markets/sync - 获取同步状态和统计
 */

import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"
import { 
  initMarketsTable, 
  batchUpsertMarkets, 
  getMarketsStats,
  batchRecordPriceSnapshots,
  type MarketRecord 
} from "@/lib/database"

const GAMMA_API = "https://gamma-api.polymarket.com"

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

// 解析 JSON 字段
function parseJsonField(value: any, defaultValue: any = []): string {
  if (!value) return JSON.stringify(defaultValue)
  if (typeof value === 'string') {
    try {
      JSON.parse(value) // 验证是有效 JSON
      return value
    } catch {
      return JSON.stringify(defaultValue)
    }
  }
  return JSON.stringify(value)
}

// 转换 API 数据为数据库记录 - 完整字段版本
function convertToMarketRecord(market: any): MarketRecord {
  // 计算 spread
  const bestBid = parseFloat(market.bestBid || 0)
  const bestAsk = parseFloat(market.bestAsk || 0)
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : null
  
  return {
    // 基础标识
    conditionId: market.conditionId || market.condition_id,
    questionId: market.questionID || market.question_id || null,
    slug: market.slug || null,
    
    // 市场信息
    question: market.question || "未知市场",
    description: market.description || null,
    category: market.category || null,
    marketType: market.marketType || 'normal',
    
    // 日期
    endDate: market.endDate || market.end_date_iso || null,
    startDate: market.startDate || null,
    createdAt: market.createdAt || null,
    updatedAt: market.updatedAt || null,
    closedTime: market.closedTime || null,
    
    // 结果和价格
    outcomes: parseJsonField(market.outcomes, ["Yes", "No"]),
    outcomePrices: parseJsonField(market.outcomePrices, []),
    tokens: parseJsonField(market.tokens || market.clobTokenIds, []),
    
    // 交易量
    volume: parseFloat(market.volume || market.volumeNum || 0),
    volume24hr: parseFloat(market.volume24hr || 0),
    volume1wk: parseFloat(market.volume1wk || 0),
    volume1mo: parseFloat(market.volume1mo || 0),
    volume1yr: parseFloat(market.volume1yr || 0),
    
    // AMM vs CLOB 交易量分拆
    volume1wkAmm: parseFloat(market.volume1wkAmm || 0),
    volume1moAmm: parseFloat(market.volume1moAmm || 0),
    volume1yrAmm: parseFloat(market.volume1yrAmm || 0),
    volume1wkClob: parseFloat(market.volume1wkClob || 0),
    volume1moClob: parseFloat(market.volume1moClob || 0),
    volume1yrClob: parseFloat(market.volume1yrClob || 0),
    
    // 流动性
    liquidity: parseFloat(market.liquidity || market.liquidityNum || 0),
    liquidityAmm: parseFloat(market.liquidityAmm || 0),
    liquidityClob: parseFloat(market.liquidityClob || 0),
    
    // 价格信息
    bestBid: bestBid || undefined,
    bestAsk: bestAsk || undefined,
    spread: spread || undefined,
    lastTradePrice: parseFloat(market.lastTradePrice || 0) || undefined,
    
    // 价格变化
    oneHourPriceChange: parseFloat(market.oneHourPriceChange || 0) || undefined,
    oneDayPriceChange: parseFloat(market.oneDayPriceChange || 0) || undefined,
    oneWeekPriceChange: parseFloat(market.oneWeekPriceChange || 0) || undefined,
    oneMonthPriceChange: parseFloat(market.oneMonthPriceChange || 0) || undefined,
    oneYearPriceChange: parseFloat(market.oneYearPriceChange || 0) || undefined,
    
    // 状态标志
    active: market.active !== false,
    closed: market.closed === true,
    archived: market.archived === true,
    restricted: market.restricted === true,
    enableOrderBook: market.enableOrderBook !== false,
    fpmmLive: market.fpmmLive === true,
    
    // 功能标志
    cyom: market.cyom === true,
    competitive: parseFloat(market.competitive || 0),
    rfqEnabled: market.rfqEnabled === true,
    holdingRewardsEnabled: market.holdingRewardsEnabled === true,
    feesEnabled: market.feesEnabled === true,
    negRiskOther: market.negRiskOther === true,
    clearBookOnStart: market.clearBookOnStart === true,
    manualActivation: market.manualActivation === true,
    pendingDeployment: market.pendingDeployment === true,
    deploying: market.deploying === true,
    
    // 奖励配置
    rewardsMinSize: parseFloat(market.rewardsMinSize || 0),
    rewardsMaxSpread: parseFloat(market.rewardsMaxSpread || 0),
    
    // 媒体
    image: market.image || null,
    icon: market.icon || null,
    twitterCardImage: market.twitterCardImage || null,
    
    // 关联数据 (JSON 存储)
    events: market.events ? JSON.stringify(market.events) : undefined,
    tags: market.tags ? JSON.stringify(market.tags) : undefined,
    umaResolutionStatuses: parseJsonField(market.umaResolutionStatuses, []),
    
    // 其他元数据
    marketMakerAddress: market.marketMakerAddress || null,
    commentCount: parseInt(market.commentCount || 0),
    mailchimpTag: market.mailchimpTag || null,
  }
}

/**
 * POST - 同步市场数据
 * 支持官方 Gamma API 的所有筛选参数
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const offset = parseInt(body.offset || "0")
    const limit = Math.min(parseInt(body.limit || "100"), 100) // 最多 100 个
    
    // 基础排序选项
    const order = body.order || "volume"
    const ascending = body.ascending === true
    
    // 状态筛选
    const closed = body.closed // true/false/undefined
    
    // 数值范围筛选
    const liquidityNumMin = body.liquidity_num_min
    const liquidityNumMax = body.liquidity_num_max
    const volumeNumMin = body.volume_num_min
    const volumeNumMax = body.volume_num_max
    
    // 日期范围筛选
    const startDateMin = body.start_date_min
    const startDateMax = body.start_date_max
    const endDateMin = body.end_date_min
    const endDateMax = body.end_date_max
    
    // 标签筛选
    const tagId = body.tag_id
    const relatedTags = body.related_tags
    
    console.log(`🔄 开始同步市场数据: offset=${offset}, limit=${limit}, order=${order}, ascending=${ascending}`)
    
    // 确保表存在
    await initMarketsTable()
    
    const proxyAgent = getProxyAgent()
    
    // 构建 API 参数 - 遵循官方 Gamma API 参数格式
    const params: Record<string, string | number | boolean> = {
      limit,
      offset,
      order,
      ascending: ascending.toString(),
    }
    
    // 状态筛选
    if (closed !== undefined) {
      params.closed = closed.toString()
    }
    
    // 流动性范围
    if (liquidityNumMin !== undefined) params.liquidity_num_min = liquidityNumMin
    if (liquidityNumMax !== undefined) params.liquidity_num_max = liquidityNumMax
    
    // 交易量范围
    if (volumeNumMin !== undefined) params.volume_num_min = volumeNumMin
    if (volumeNumMax !== undefined) params.volume_num_max = volumeNumMax
    
    // 日期范围
    if (startDateMin) params.start_date_min = startDateMin
    if (startDateMax) params.start_date_max = startDateMax
    if (endDateMin) params.end_date_min = endDateMin
    if (endDateMax) params.end_date_max = endDateMax
    
    // 标签筛选
    if (tagId) params.tag_id = tagId
    if (relatedTags) params.related_tags = "true"
    
    console.log(`📡 API 参数:`, params)
    
    // 从 Polymarket API 获取市场
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params,
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 30000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })
    
    const markets = response.data || []
    console.log(`📦 获取到 ${markets.length} 个市场`)
    
    if (markets.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          synced: 0,
          inserted: 0,
          updated: 0,
          hasMore: false,
          nextOffset: offset,
        },
        message: "没有更多市场需要同步",
      })
    }
    
    // 转换并保存到数据库
    const marketRecords: MarketRecord[] = []
    for (const market of markets) {
      if (market.conditionId || market.condition_id) {
        marketRecords.push(convertToMarketRecord(market))
      }
    }
    
    const result = await batchUpsertMarkets(marketRecords)
    
    // 可选：记录价格历史
    const recordHistory = body.record_price_history === true
    let priceHistoryRecorded = 0
    if (recordHistory) {
      priceHistoryRecorded = await batchRecordPriceSnapshots(marketRecords)
    }
    
    console.log(`✅ 同步完成: 新增 ${result.inserted}, 更新 ${result.updated}${recordHistory ? `, 价格快照 ${priceHistoryRecorded}` : ''}`)
    
    return NextResponse.json({
      success: true,
      data: {
        synced: marketRecords.length,
        inserted: result.inserted,
        updated: result.updated,
        priceHistoryRecorded: recordHistory ? priceHistoryRecorded : undefined,
        hasMore: markets.length >= limit,
        nextOffset: offset + markets.length,
      },
      message: `同步成功: 新增 ${result.inserted} 个, 更新 ${result.updated} 个`,
    })
    
  } catch (error: any) {
    console.error("❌ 同步市场错误:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        data: null,
      },
      { status: 500 }
    )
  }
}

/**
 * GET - 获取同步状态和统计
 */
export async function GET() {
  try {
    // 确保表存在
    await initMarketsTable()
    
    const stats = await getMarketsStats()
    
    return NextResponse.json({
      success: true,
      data: stats,
    })
    
  } catch (error: any) {
    console.error("❌ 获取市场统计错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
