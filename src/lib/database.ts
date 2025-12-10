/**
 * 数据库服务 - Next.js API Routes 用
 * 封装 MySQL 连接和交易记录操作
 */

import mysql from "mysql2/promise"
import type { TradeRecord } from "@/types"

// 数据库连接池
let pool: mysql.Pool | null = null

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "polymarket",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
}

/**
 * 获取数据库连接池
 */
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig)
    console.log("✅ MySQL 连接池已创建")
  }
  return pool
}

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const p = getPool()
    const connection = await p.getConnection()
    connection.release()
    return true
  } catch (error) {
    console.error("❌ 数据库连接失败:", error)
    return false
  }
}

// ==================== 交易记录 ====================

/**
 * 保存交易记录
 */
export async function saveTradeRecord(trade: TradeRecord): Promise<number> {
  const p = getPool()
  const sql = `
    INSERT INTO trade_records 
    (opportunity_id, market_question, trade_type, yes_amount, no_amount, 
     total_investment, expected_profit, actual_profit, status, tx_hash, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  const [result] = await p.execute(sql, [
    trade.opportunityId || null,
    trade.marketQuestion,
    trade.tradeType,
    trade.yesAmount || null,
    trade.noAmount || null,
    trade.totalInvestment,
    trade.expectedProfit,
    trade.actualProfit || null,
    trade.status,
    trade.txHash || null,
    trade.errorMessage || null,
  ])
  return (result as any).insertId
}

/**
 * 更新交易记录状态
 */
export async function updateTradeStatus(
  tradeId: number,
  status: TradeRecord["status"],
  actualProfit?: number,
  txHash?: string,
  errorMessage?: string
): Promise<void> {
  const p = getPool()
  const sql = `
    UPDATE trade_records 
    SET status = ?, actual_profit = ?, tx_hash = ?, error_message = ?
    WHERE id = ?
  `
  await p.execute(sql, [status, actualProfit || null, txHash || null, errorMessage || null, tradeId])
}

/**
 * 获取交易记录列表
 */
export async function getTradeRecords(
  limit: number = 50,
  offset: number = 0
): Promise<TradeRecord[]> {
  const p = getPool()
  // 注意：LIMIT/OFFSET 使用 query 而不是 execute，因为 execute 对数字参数有问题
  const sql = `
    SELECT 
      id,
      opportunity_id as opportunityId,
      market_question as marketQuestion,
      trade_type as tradeType,
      yes_amount as yesAmount,
      no_amount as noAmount,
      total_investment as totalInvestment,
      expected_profit as expectedProfit,
      actual_profit as actualProfit,
      status,
      tx_hash as txHash,
      error_message as errorMessage,
      created_at as createdAt
    FROM trade_records 
    ORDER BY created_at DESC 
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `
  const [rows] = await p.query(sql)
  return rows as TradeRecord[]
}

/**
 * 获取交易统计
 */
export async function getTradeStats(): Promise<{
  totalTrades: number
  successTrades: number
  failedTrades: number
  totalProfit: number
  totalInvestment: number
  winRate: number
}> {
  const p = getPool()
  const sql = `
    SELECT 
      COUNT(*) as totalTrades,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successTrades,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedTrades,
      COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN actual_profit ELSE 0 END), 0) as totalProfit,
      COALESCE(SUM(total_investment), 0) as totalInvestment
    FROM trade_records
  `
  const [rows] = await p.execute(sql)
  const row = (rows as any[])[0]

  const totalTrades = row.totalTrades || 0
  const successTrades = row.successTrades || 0

  return {
    totalTrades,
    successTrades,
    failedTrades: row.failedTrades || 0,
    totalProfit: parseFloat(row.totalProfit) || 0,
    totalInvestment: parseFloat(row.totalInvestment) || 0,
    winRate: totalTrades > 0 ? (successTrades / totalTrades) * 100 : 0,
  }
}

/**
 * 获取最近 N 天的每日统计
 */
export async function getDailyStats(
  days: number = 7
): Promise<{ date: string; trades: number; profit: number }[]> {
  const p = getPool()
  // 使用 query 而不是 execute，避免参数化问题
  const sql = `
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as trades,
      COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN actual_profit ELSE 0 END), 0) as profit
    FROM trade_records
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${Number(days)} DAY)
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `
  const [rows] = await p.query(sql)
  return (rows as any[]).map((row) => ({
    date: row.date,
    trades: row.trades,
    profit: parseFloat(row.profit) || 0,
  }))
}

// ==================== 套利机会记录 ====================

export interface OpportunityRecord {
  id?: number
  marketQuestion: string
  conditionId?: string
  priceSum: number
  spread: number
  opportunityType: "LONG" | "SHORT"
  expectedProfit: number
  executed: boolean
  createdAt?: Date
}

/**
 * 保存套利机会
 */
export async function saveOpportunity(opp: OpportunityRecord): Promise<number> {
  const p = getPool()
  const sql = `
    INSERT INTO arbitrage_opportunities 
    (market_question, condition_id, price_sum, spread, opportunity_type, expected_profit, executed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  const [result] = await p.execute(sql, [
    opp.marketQuestion,
    opp.conditionId || null,
    opp.priceSum,
    opp.spread,
    opp.opportunityType,
    opp.expectedProfit,
    opp.executed ? 1 : 0,
  ])
  return (result as any).insertId
}

/**
 * 获取最近的套利机会
 */
export async function getRecentOpportunities(limit: number = 50): Promise<OpportunityRecord[]> {
  const p = getPool()
  const sql = `
    SELECT 
      id,
      market_question as marketQuestion,
      condition_id as conditionId,
      price_sum as priceSum,
      spread,
      opportunity_type as opportunityType,
      expected_profit as expectedProfit,
      executed,
      created_at as createdAt
    FROM arbitrage_opportunities 
    ORDER BY created_at DESC 
    LIMIT ?
  `
  const [rows] = await p.execute(sql, [limit])
  return rows as OpportunityRecord[]
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log("✅ MySQL 连接已关闭")
  }
}

// ==================== 市场数据 ====================

/**
 * 完整的市场记录接口 - 包含 Gamma API 返回的所有字段
 */
export interface MarketRecord {
  id?: number
  // 基础标识
  conditionId: string          // 唯一标识
  questionId?: string
  slug?: string
  
  // 市场信息
  question: string             // 市场问题
  description?: string
  category?: string
  marketType?: string          // normal, multi, etc.
  
  // 日期
  endDate?: string
  startDate?: string
  createdAt?: string
  updatedAt?: string
  closedTime?: string
  
  // 结果和价格
  outcomes: string             // JSON: ["Yes", "No"] 或更多选项
  outcomePrices: string        // JSON: ["0.65", "0.35"]
  tokens: string               // JSON: token IDs (clobTokenIds)
  
  // 交易量
  volume?: number              // 总交易量
  volume24hr?: number          // 24小时交易量
  volume1wk?: number           // 7天交易量
  volume1mo?: number           // 30天交易量
  volume1yr?: number           // 年交易量
  
  // AMM vs CLOB 交易量分拆
  volume1wkAmm?: number
  volume1moAmm?: number
  volume1yrAmm?: number
  volume1wkClob?: number
  volume1moClob?: number
  volume1yrClob?: number
  
  // 流动性
  liquidity?: number           // 总流动性
  liquidityAmm?: number
  liquidityClob?: number
  
  // 价格信息
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number      // 最后成交价
  
  // 价格变化
  oneHourPriceChange?: number
  oneDayPriceChange?: number   // 24小时价格变化
  oneWeekPriceChange?: number  // 7天价格变化
  oneMonthPriceChange?: number
  oneYearPriceChange?: number
  
  // 状态标志
  active: boolean
  closed: boolean
  archived?: boolean
  restricted: boolean
  enableOrderBook: boolean
  fpmmLive?: boolean           // FPMM (AMM) 是否启用
  
  // 功能标志
  cyom?: boolean               // Create Your Own Market
  competitive?: number
  rfqEnabled?: boolean         // Request For Quote
  holdingRewardsEnabled?: boolean
  feesEnabled?: boolean
  negRiskOther?: boolean
  clearBookOnStart?: boolean
  manualActivation?: boolean
  pendingDeployment?: boolean
  deploying?: boolean
  
  // 奖励配置
  rewardsMinSize?: number
  rewardsMaxSpread?: number
  
  // 媒体
  image?: string               // 市场图片
  icon?: string
  twitterCardImage?: string
  
  // 关联数据 (JSON 存储)
  events?: string              // JSON: 关联的事件数据
  tags?: string                // JSON: 标签列表
  umaResolutionStatuses?: string // JSON: UMA 解决状态
  
  // 其他元数据
  marketMakerAddress?: string
  commentCount?: number
  mailchimpTag?: string
  
  // 同步时间
  syncedAt?: Date              // 本地同步时间
}

/**
 * 价格历史记录 - 存储动态变化的数据
 */
export interface PriceHistoryRecord {
  id?: number
  conditionId: string          // 关联市场
  outcomePrices: string        // JSON: 当时的价格
  volume: number
  volume24hr: number
  liquidity: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  recordedAt: Date             // 记录时间
}

/**
 * 检查市场表是否存在（表已通过 SQL 手动创建）
 */
export async function initMarketsTable(): Promise<void> {
  const p = getPool()
  
  // 只检查表是否存在，不创建
  try {
    await p.execute('SELECT 1 FROM markets LIMIT 1')
    await p.execute('SELECT 1 FROM market_price_history LIMIT 1')
    console.log("✅ markets 和 market_price_history 表已就绪")
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error("❌ 数据库表不存在，请先手动执行 SQL 创建表")
      throw new Error("数据库表不存在，请参考 README 手动创建")
    }
    throw error
  }
}

/**
 * 保存或更新市场数据 (Upsert) - 完整字段版本
 */
export async function upsertMarket(market: MarketRecord): Promise<{ inserted: boolean; id: number }> {
  const p = getPool()
  const sql = `
    INSERT INTO markets (
      condition_id, question_id, slug, question, description, category, market_type,
      end_date, start_date, created_at_api, updated_at_api, closed_time,
      outcomes, outcome_prices, tokens,
      volume, volume_24hr, volume_1wk, volume_1mo, volume_1yr,
      volume_1wk_amm, volume_1mo_amm, volume_1yr_amm,
      volume_1wk_clob, volume_1mo_clob, volume_1yr_clob,
      liquidity, liquidity_amm, liquidity_clob,
      best_bid, best_ask, spread, last_trade_price,
      one_hour_price_change, one_day_price_change, one_week_price_change, one_month_price_change, one_year_price_change,
      active, closed, archived, restricted, enable_order_book, fpmm_live,
      cyom, competitive, rfq_enabled, holding_rewards_enabled, fees_enabled,
      neg_risk_other, clear_book_on_start, manual_activation, pending_deployment, deploying,
      rewards_min_size, rewards_max_spread,
      image, icon, twitter_card_image,
      events, tags, uma_resolution_statuses,
      market_maker_address, comment_count, mailchimp_tag,
      synced_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      CURRENT_TIMESTAMP
    )
    ON DUPLICATE KEY UPDATE
      question_id = VALUES(question_id),
      slug = VALUES(slug),
      question = VALUES(question),
      description = VALUES(description),
      category = VALUES(category),
      market_type = VALUES(market_type),
      end_date = VALUES(end_date),
      start_date = VALUES(start_date),
      created_at_api = VALUES(created_at_api),
      updated_at_api = VALUES(updated_at_api),
      closed_time = VALUES(closed_time),
      outcomes = VALUES(outcomes),
      outcome_prices = VALUES(outcome_prices),
      tokens = VALUES(tokens),
      volume = VALUES(volume),
      volume_24hr = VALUES(volume_24hr),
      volume_1wk = VALUES(volume_1wk),
      volume_1mo = VALUES(volume_1mo),
      volume_1yr = VALUES(volume_1yr),
      volume_1wk_amm = VALUES(volume_1wk_amm),
      volume_1mo_amm = VALUES(volume_1mo_amm),
      volume_1yr_amm = VALUES(volume_1yr_amm),
      volume_1wk_clob = VALUES(volume_1wk_clob),
      volume_1mo_clob = VALUES(volume_1mo_clob),
      volume_1yr_clob = VALUES(volume_1yr_clob),
      liquidity = VALUES(liquidity),
      liquidity_amm = VALUES(liquidity_amm),
      liquidity_clob = VALUES(liquidity_clob),
      best_bid = VALUES(best_bid),
      best_ask = VALUES(best_ask),
      spread = VALUES(spread),
      last_trade_price = VALUES(last_trade_price),
      one_hour_price_change = VALUES(one_hour_price_change),
      one_day_price_change = VALUES(one_day_price_change),
      one_week_price_change = VALUES(one_week_price_change),
      one_month_price_change = VALUES(one_month_price_change),
      one_year_price_change = VALUES(one_year_price_change),
      active = VALUES(active),
      closed = VALUES(closed),
      archived = VALUES(archived),
      restricted = VALUES(restricted),
      enable_order_book = VALUES(enable_order_book),
      fpmm_live = VALUES(fpmm_live),
      cyom = VALUES(cyom),
      competitive = VALUES(competitive),
      rfq_enabled = VALUES(rfq_enabled),
      holding_rewards_enabled = VALUES(holding_rewards_enabled),
      fees_enabled = VALUES(fees_enabled),
      neg_risk_other = VALUES(neg_risk_other),
      clear_book_on_start = VALUES(clear_book_on_start),
      manual_activation = VALUES(manual_activation),
      pending_deployment = VALUES(pending_deployment),
      deploying = VALUES(deploying),
      rewards_min_size = VALUES(rewards_min_size),
      rewards_max_spread = VALUES(rewards_max_spread),
      image = VALUES(image),
      icon = VALUES(icon),
      twitter_card_image = VALUES(twitter_card_image),
      events = VALUES(events),
      tags = VALUES(tags),
      uma_resolution_statuses = VALUES(uma_resolution_statuses),
      market_maker_address = VALUES(market_maker_address),
      comment_count = VALUES(comment_count),
      mailchimp_tag = VALUES(mailchimp_tag),
      synced_at = CURRENT_TIMESTAMP
  `
  
  // 解析日期
  const parseDate = (d: string | undefined) => d ? new Date(d) : null
  
  const [result] = await p.execute(sql, [
    // 基础标识
    market.conditionId,
    market.questionId || null,
    market.slug || null,
    market.question,
    market.description || null,
    market.category || null,
    market.marketType || 'normal',
    
    // 日期
    parseDate(market.endDate),
    parseDate(market.startDate),
    parseDate(market.createdAt),
    parseDate(market.updatedAt),
    parseDate(market.closedTime),
    
    // 结果和价格
    market.outcomes,
    market.outcomePrices,
    market.tokens,
    
    // 交易量
    market.volume || 0,
    market.volume24hr || 0,
    market.volume1wk || 0,
    market.volume1mo || 0,
    market.volume1yr || 0,
    
    // AMM vs CLOB 交易量
    market.volume1wkAmm || 0,
    market.volume1moAmm || 0,
    market.volume1yrAmm || 0,
    market.volume1wkClob || 0,
    market.volume1moClob || 0,
    market.volume1yrClob || 0,
    
    // 流动性
    market.liquidity || 0,
    market.liquidityAmm || 0,
    market.liquidityClob || 0,
    
    // 价格信息
    market.bestBid || null,
    market.bestAsk || null,
    market.spread || null,
    market.lastTradePrice || null,
    
    // 价格变化
    market.oneHourPriceChange || null,
    market.oneDayPriceChange || null,
    market.oneWeekPriceChange || null,
    market.oneMonthPriceChange || null,
    market.oneYearPriceChange || null,
    
    // 状态标志
    market.active ? 1 : 0,
    market.closed ? 1 : 0,
    market.archived ? 1 : 0,
    market.restricted ? 1 : 0,
    market.enableOrderBook ? 1 : 0,
    market.fpmmLive ? 1 : 0,
    
    // 功能标志
    market.cyom ? 1 : 0,
    market.competitive || 0,
    market.rfqEnabled ? 1 : 0,
    market.holdingRewardsEnabled ? 1 : 0,
    market.feesEnabled ? 1 : 0,
    market.negRiskOther ? 1 : 0,
    market.clearBookOnStart ? 1 : 0,
    market.manualActivation ? 1 : 0,
    market.pendingDeployment ? 1 : 0,
    market.deploying ? 1 : 0,
    
    // 奖励配置
    market.rewardsMinSize || 0,
    market.rewardsMaxSpread || 0,
    
    // 媒体
    market.image || null,
    market.icon || null,
    market.twitterCardImage || null,
    
    // 关联数据
    market.events || null,
    market.tags || null,
    market.umaResolutionStatuses || null,
    
    // 其他元数据
    market.marketMakerAddress || null,
    market.commentCount || 0,
    market.mailchimpTag || null,
  ])
  
  const resultAny = result as any
  // affectedRows = 1 表示新增，affectedRows = 2 表示更新
  const inserted = resultAny.affectedRows === 1
  const id = resultAny.insertId || 0
  
  return { inserted, id }
}

/**
 * 批量保存市场数据（只插入新市场，已存在的跳过）
 */
export async function batchUpsertMarkets(markets: MarketRecord[]): Promise<{ inserted: number; updated: number }> {
  if (markets.length === 0) return { inserted: 0, updated: 0 }
  
  const p = getPool()
  
  // 1. 批量查询已存在的 condition_id
  const conditionIds = markets.map(m => m.conditionId)
  const placeholders = conditionIds.map(() => '?').join(',')
  const [existingRows] = await p.execute(
    `SELECT condition_id FROM markets WHERE condition_id IN (${placeholders})`,
    conditionIds
  )
  const existingIds = new Set((existingRows as any[]).map(r => r.condition_id))
  
  // 2. 过滤出新市场
  const newMarkets = markets.filter(m => !existingIds.has(m.conditionId))
  
  // 3. 只插入新市场
  let inserted = 0
  for (const market of newMarkets) {
    try {
      await upsertMarket(market)
      inserted++
    } catch (err) {
      // 忽略插入错误（可能是并发重复）
      console.warn(`⚠️ 插入市场 ${market.conditionId} 失败:`, err)
    }
  }
  
  // updated = 已存在但跳过的数量（实际没有更新）
  return { inserted, updated: existingIds.size }
}

/**
 * 获取市场列表
 */
export async function getMarkets(options: {
  limit?: number
  offset?: number
  active?: boolean
  category?: string
  search?: string
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  // 高级筛选参数
  liquidityMin?: number
  liquidityMax?: number
  volumeMin?: number
  volumeMax?: number
  endDateMin?: string
  endDateMax?: string
} = {}): Promise<{ markets: MarketRecord[]; total: number }> {
  const p = getPool()
  const {
    limit = 50,
    offset = 0,
    active,
    category,
    search,
    orderBy = 'updated_at',
    orderDir = 'DESC',
    liquidityMin,
    liquidityMax,
    volumeMin,
    volumeMax,
    endDateMin,
    endDateMax,
  } = options
  
  let whereClause = '1=1'
  const params: any[] = []
  
  if (active !== undefined) {
    whereClause += ' AND active = ?'
    params.push(active ? 1 : 0)
  }
  
  if (category) {
    whereClause += ' AND category = ?'
    params.push(category)
  }
  
  if (search) {
    whereClause += ' AND (question LIKE ? OR slug LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }
  
  // 高级筛选：流动性范围
  if (liquidityMin !== undefined && !isNaN(liquidityMin)) {
    whereClause += ' AND liquidity >= ?'
    params.push(liquidityMin)
  }
  if (liquidityMax !== undefined && !isNaN(liquidityMax)) {
    whereClause += ' AND liquidity <= ?'
    params.push(liquidityMax)
  }
  
  // 高级筛选：交易量范围
  if (volumeMin !== undefined && !isNaN(volumeMin)) {
    whereClause += ' AND volume >= ?'
    params.push(volumeMin)
  }
  if (volumeMax !== undefined && !isNaN(volumeMax)) {
    whereClause += ' AND volume <= ?'
    params.push(volumeMax)
  }
  
  // 高级筛选：结束时间范围
  if (endDateMin) {
    whereClause += ' AND end_date >= ?'
    params.push(endDateMin)
  }
  if (endDateMax) {
    whereClause += ' AND end_date <= ?'
    params.push(endDateMax)
  }
  
  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM markets WHERE ${whereClause}`
  const [countResult] = await p.execute(countSql, params)
  const total = (countResult as any)[0].total
  
  // 获取数据
  const allowedOrderBy = ['updated_at', 'created_at', 'volume', 'volume_24hr', 'volume_1wk', 'liquidity', 'end_date', 'question', 'one_day_price_change']
  const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'updated_at'
  const safeOrderDir = orderDir === 'ASC' ? 'ASC' : 'DESC'
  
  // 注意：LIMIT/OFFSET 使用 query 而不是 execute，因为 execute 对数字参数有问题
  const sql = `
    SELECT 
      id,
      condition_id as conditionId,
      question_id as questionId,
      slug,
      question,
      description,
      category,
      end_date as endDate,
      outcomes,
      outcome_prices as outcomePrices,
      tokens,
      volume,
      volume_24hr as volume24hr,
      volume_1wk as volume1wk,
      liquidity,
      best_bid as bestBid,
      best_ask as bestAsk,
      spread,
      last_trade_price as lastTradePrice,
      one_day_price_change as oneDayPriceChange,
      one_week_price_change as oneWeekPriceChange,
      active,
      closed,
      restricted,
      enable_order_book as enableOrderBook,
      image,
      created_at as createdAt,
      updated_at as updatedAt
    FROM markets 
    WHERE ${whereClause}
    ORDER BY ${safeOrderBy} ${safeOrderDir}
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `
  
  const [rows] = params.length > 0 
    ? await p.execute(sql, params)
    : await p.query(sql)
  
  return {
    markets: rows as MarketRecord[],
    total
  }
}

/**
 * 获取市场统计
 */
export async function getMarketsStats(): Promise<{
  total: number
  active: number
  closed: number
  restricted: number
  withOrderBook: number
  categories: { category: string; count: number }[]
}> {
  const p = getPool()
  
  const [statsResult] = await p.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN closed = 1 THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN restricted = 1 THEN 1 ELSE 0 END) as restricted,
      SUM(CASE WHEN enable_order_book = 1 THEN 1 ELSE 0 END) as withOrderBook
    FROM markets
  `)
  const stats = (statsResult as any)[0]
  
  const [categoriesResult] = await p.execute(`
    SELECT category, COUNT(*) as count 
    FROM markets 
    WHERE category IS NOT NULL AND category != ''
    GROUP BY category 
    ORDER BY count DESC
  `)
  
  return {
    total: stats.total || 0,
    active: stats.active || 0,
    closed: stats.closed || 0,
    restricted: stats.restricted || 0,
    withOrderBook: stats.withOrderBook || 0,
    categories: categoriesResult as { category: string; count: number }[]
  }
}

// ==================== 清除数据功能 ====================

/**
 * 删除所有市场数据（重新同步前使用）
 */
export async function clearAllMarkets(): Promise<number> {
  const p = getPool()
  const [result] = await p.execute('DELETE FROM markets')
  const deleted = (result as any).affectedRows
  console.log(`🗑️ 已删除 ${deleted} 条市场数据`)
  return deleted
}

/**
 * 删除旧的/过期的市场数据
 * @param options 删除选项
 */
export async function deleteOldMarkets(options: {
  olderThanDays?: number      // 删除 N 天前同步的数据
  closedOnly?: boolean        // 只删除已关闭的市场
  endedOnly?: boolean         // 只删除已结束的市场
  inactiveOnly?: boolean      // 只删除非活跃的市场
} = {}): Promise<number> {
  const p = getPool()
  const {
    olderThanDays = 30,
    closedOnly = false,
    endedOnly = false,
    inactiveOnly = false,
  } = options
  
  let whereClause = `synced_at < DATE_SUB(NOW(), INTERVAL ${Number(olderThanDays)} DAY)`
  
  if (closedOnly) {
    whereClause += ' AND closed = 1'
  }
  if (endedOnly) {
    whereClause += ' AND end_date < NOW()'
  }
  if (inactiveOnly) {
    whereClause += ' AND active = 0'
  }
  
  const [result] = await p.execute(`DELETE FROM markets WHERE ${whereClause}`)
  const deleted = (result as any).affectedRows
  console.log(`🗑️ 已删除 ${deleted} 条旧市场数据`)
  return deleted
}

// ==================== 价格历史功能 ====================

/**
 * 记录价格快照（用于追踪动态变化）
 */
export async function recordPriceSnapshot(market: {
  conditionId: string
  outcomePrices: string
  volume: number
  volume24hr: number
  liquidity: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
}): Promise<number> {
  const p = getPool()
  const sql = `
    INSERT INTO market_price_history 
    (condition_id, outcome_prices, volume, volume_24hr, liquidity, best_bid, best_ask, spread, last_trade_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  const [result] = await p.execute(sql, [
    market.conditionId,
    market.outcomePrices,
    market.volume,
    market.volume24hr,
    market.liquidity,
    market.bestBid || null,
    market.bestAsk || null,
    market.spread || null,
    market.lastTradePrice || null,
  ])
  return (result as any).insertId
}

/**
 * 批量记录价格快照（真正的批量 INSERT）
 */
export async function batchRecordPriceSnapshots(markets: MarketRecord[]): Promise<number> {
  if (markets.length === 0) return 0
  
  const p = getPool()
  
  // 构建批量 INSERT 语句
  const columns = '(condition_id, outcome_prices, volume, volume_24hr, liquidity, best_bid, best_ask, spread, last_trade_price)'
  const valuePlaceholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?)'
  const placeholders = markets.map(() => valuePlaceholder).join(', ')
  
  const sql = `
    INSERT INTO market_price_history ${columns}
    VALUES ${placeholders}
  `
  
  // 展平参数数组
  const params: any[] = []
  for (const market of markets) {
    params.push(
      market.conditionId,
      market.outcomePrices,
      market.volume || 0,
      market.volume24hr || 0,
      market.liquidity || 0,
      market.bestBid || null,
      market.bestAsk || null,
      market.spread || null,
      market.lastTradePrice || null
    )
  }
  
  try {
    const [result] = await p.execute(sql, params)
    return (result as any).affectedRows
  } catch (err) {
    console.error('❌ 批量写入价格快照失败:', err)
    return 0
  }
}

/**
 * 获取市场价格历史
 */
export async function getPriceHistory(conditionId: string, options: {
  limit?: number
  startTime?: Date
  endTime?: Date
} = {}): Promise<PriceHistoryRecord[]> {
  const p = getPool()
  const { limit = 100, startTime, endTime } = options
  
  let whereClause = 'condition_id = ?'
  const params: any[] = [conditionId]
  
  if (startTime) {
    whereClause += ' AND recorded_at >= ?'
    params.push(startTime)
  }
  if (endTime) {
    whereClause += ' AND recorded_at <= ?'
    params.push(endTime)
  }
  
  const sql = `
    SELECT 
      id,
      condition_id as conditionId,
      outcome_prices as outcomePrices,
      volume,
      volume_24hr as volume24hr,
      liquidity,
      best_bid as bestBid,
      best_ask as bestAsk,
      spread,
      last_trade_price as lastTradePrice,
      recorded_at as recordedAt
    FROM market_price_history
    WHERE ${whereClause}
    ORDER BY recorded_at DESC
    LIMIT ${Number(limit)}
  `
  
  const [rows] = await p.execute(sql, params)
  return rows as PriceHistoryRecord[]
}

/**
 * 清理旧的价格历史数据
 * @param daysToKeep 保留最近多少天的数据
 */
export async function cleanOldPriceHistory(daysToKeep: number = 7): Promise<number> {
  const p = getPool()
  const [result] = await p.execute(
    `DELETE FROM market_price_history WHERE recorded_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [daysToKeep]
  )
  const deleted = (result as any).affectedRows
  console.log(`🗑️ 已清理 ${deleted} 条旧价格历史记录`)
  return deleted
}

/**
 * 获取价格历史统计
 */
export async function getPriceHistoryStats(): Promise<{
  totalRecords: number
  marketsTracked: number
  oldestRecord: Date | null
  newestRecord: Date | null
}> {
  const p = getPool()
  const [result] = await p.execute(`
    SELECT 
      COUNT(*) as totalRecords,
      COUNT(DISTINCT condition_id) as marketsTracked,
      MIN(recorded_at) as oldestRecord,
      MAX(recorded_at) as newestRecord
    FROM market_price_history
  `)
  const stats = (result as any)[0]
  return {
    totalRecords: stats.totalRecords || 0,
    marketsTracked: stats.marketsTracked || 0,
    oldestRecord: stats.oldestRecord || null,
    newestRecord: stats.newestRecord || null,
  }
}

// ==================== API 请求日志 ====================

/**
 * API 客户端类型
 */
export type ApiClientType = 'GAMMA' | 'CLOB' | 'RPC'

/**
 * HTTP 方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * API 请求日志记录
 */
export interface ApiRequestLogRecord {
  id?: number
  clientType: ApiClientType
  endpoint: string
  method: HttpMethod
  requestParams?: Record<string, any>
  requestHeaders?: Record<string, string>
  statusCode?: number
  responseData?: any
  responseSize?: number
  durationMs: number
  success: boolean
  errorMessage?: string
  retryCount?: number
  traceId?: string
  source?: string
  createdAt?: Date
}

/**
 * 初始化 API 请求日志表
 */
export async function initApiRequestLogsTable(): Promise<void> {
  const p = getPool()
  await p.execute(`
    CREATE TABLE IF NOT EXISTS api_request_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
      client_type ENUM('GAMMA', 'CLOB', 'RPC') NOT NULL COMMENT 'API 类型',
      endpoint VARCHAR(500) NOT NULL COMMENT '请求端点',
      method ENUM('GET', 'POST', 'PUT', 'DELETE') NOT NULL COMMENT 'HTTP 方法',
      request_params JSON COMMENT '请求参数',
      request_headers JSON COMMENT '请求头',
      status_code INT COMMENT 'HTTP 状态码',
      response_data JSON COMMENT '响应数据',
      response_size INT COMMENT '响应大小',
      duration_ms INT NOT NULL COMMENT '请求耗时',
      success BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否成功',
      error_message TEXT COMMENT '错误信息',
      retry_count INT DEFAULT 0 COMMENT '重试次数',
      trace_id VARCHAR(36) COMMENT '追踪ID',
      source VARCHAR(100) COMMENT '调用来源',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '请求时间',
      INDEX idx_client_type (client_type),
      INDEX idx_endpoint (endpoint(100)),
      INDEX idx_created_at (created_at),
      INDEX idx_success (success),
      INDEX idx_trace_id (trace_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API 请求日志表'
  `)
  console.log('✅ API 请求日志表已初始化')
}

/**
 * 保存 API 请求日志
 */
export async function saveApiRequestLog(log: ApiRequestLogRecord): Promise<number> {
  const p = getPool()
  const sql = `
    INSERT INTO api_request_logs 
    (client_type, endpoint, method, request_params, request_headers, 
     status_code, response_data, response_size, duration_ms, success, 
     error_message, retry_count, trace_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  
  // 截断大响应数据
  let responseData = log.responseData
  if (responseData) {
    const jsonStr = JSON.stringify(responseData)
    if (jsonStr.length > 10000) {
      responseData = { _truncated: true, _size: jsonStr.length }
    }
  }
  
  const [result] = await p.execute(sql, [
    log.clientType,
    log.endpoint,
    log.method,
    log.requestParams ? JSON.stringify(log.requestParams) : null,
    log.requestHeaders ? JSON.stringify(log.requestHeaders) : null,
    log.statusCode || null,
    responseData ? JSON.stringify(responseData) : null,
    log.responseSize || null,
    log.durationMs,
    log.success ? 1 : 0,
    log.errorMessage || null,
    log.retryCount || 0,
    log.traceId || null,
    log.source || null,
  ])
  return (result as any).insertId
}

/**
 * 查询 API 请求日志
 */
export async function getApiRequestLogs(options: {
  clientType?: ApiClientType
  success?: boolean
  traceId?: string
  source?: string
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
} = {}): Promise<ApiRequestLogRecord[]> {
  const p = getPool()
  const { 
    clientType, success, traceId, source, 
    startTime, endTime, 
    limit = 100, offset = 0 
  } = options
  
  let whereClause = '1=1'
  const params: any[] = []
  
  if (clientType) {
    whereClause += ' AND client_type = ?'
    params.push(clientType)
  }
  if (success !== undefined) {
    whereClause += ' AND success = ?'
    params.push(success ? 1 : 0)
  }
  if (traceId) {
    whereClause += ' AND trace_id = ?'
    params.push(traceId)
  }
  if (source) {
    whereClause += ' AND source = ?'
    params.push(source)
  }
  if (startTime) {
    whereClause += ' AND created_at >= ?'
    params.push(startTime)
  }
  if (endTime) {
    whereClause += ' AND created_at <= ?'
    params.push(endTime)
  }
  
  const sql = `
    SELECT 
      id,
      client_type as clientType,
      endpoint,
      method,
      request_params as requestParams,
      request_headers as requestHeaders,
      status_code as statusCode,
      response_data as responseData,
      response_size as responseSize,
      duration_ms as durationMs,
      success,
      error_message as errorMessage,
      retry_count as retryCount,
      trace_id as traceId,
      source,
      created_at as createdAt
    FROM api_request_logs
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `
  
  const [rows] = await p.execute(sql, params)
  return (rows as any[]).map(row => ({
    ...row,
    requestParams: row.requestParams ? JSON.parse(row.requestParams) : null,
    requestHeaders: row.requestHeaders ? JSON.parse(row.requestHeaders) : null,
    responseData: row.responseData ? JSON.parse(row.responseData) : null,
    success: !!row.success,
  }))
}

/**
 * 获取 API 请求日志统计
 */
export async function getApiRequestLogStats(options: {
  startTime?: Date
  endTime?: Date
} = {}): Promise<{
  total: number
  success: number
  failed: number
  avgDuration: number
  byClient: { clientType: string; count: number; avgDuration: number }[]
}> {
  const p = getPool()
  const { startTime, endTime } = options
  
  let whereClause = '1=1'
  const params: any[] = []
  
  if (startTime) {
    whereClause += ' AND created_at >= ?'
    params.push(startTime)
  }
  if (endTime) {
    whereClause += ' AND created_at <= ?'
    params.push(endTime)
  }
  
  // 总体统计
  const [totalResult] = await p.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
      AVG(duration_ms) as avgDuration
    FROM api_request_logs
    WHERE ${whereClause}
  `, params)
  
  const totals = (totalResult as any)[0]
  
  // 按客户端分组
  const [byClientResult] = await p.execute(`
    SELECT 
      client_type as clientType,
      COUNT(*) as count,
      AVG(duration_ms) as avgDuration
    FROM api_request_logs
    WHERE ${whereClause}
    GROUP BY client_type
  `, params)
  
  return {
    total: totals.total || 0,
    success: totals.success || 0,
    failed: totals.failed || 0,
    avgDuration: Math.round(totals.avgDuration || 0),
    byClient: byClientResult as any[],
  }
}

/**
 * 清理旧的 API 请求日志
 * @param daysToKeep 保留最近多少天的数据
 */
export async function cleanOldApiRequestLogs(daysToKeep: number = 7): Promise<number> {
  const p = getPool()
  const [result] = await p.execute(
    `DELETE FROM api_request_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [daysToKeep]
  )
  const deleted = (result as any).affectedRows
  console.log(`🗑️ 已清理 ${deleted} 条旧 API 请求日志`)
  return deleted
}

// ==================== 套利机会 (Opportunities) ====================

/**
 * 策略类型
 */
export type OpportunityStrategyType = 'MINT_SPLIT' | 'ARBITRAGE_LONG' | 'MARKET_MAKING'

/**
 * 机会状态
 */
export type OpportunityStatus = 'PENDING' | 'QUEUED' | 'EXECUTING' | 'PARTIAL' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED'

/**
 * Token 详情
 */
export interface OpportunityTokenDetail {
  tokenId: string
  outcome: string
  price: number
  size: number
  filled?: number
  status?: 'pending' | 'filled' | 'partial' | 'failed'
}

/**
 * 执行步骤
 */
export interface ExecutionStep {
  step: number
  action: string
  status: 'pending' | 'executing' | 'success' | 'failed'
  timestamp?: Date
  txHash?: string
  error?: string
  details?: Record<string, any>
}

/**
 * 机会记录（完整版）
 */
export interface OpportunityFullRecord {
  id?: number
  conditionId: string
  question: string
  slug?: string
  strategyType: OpportunityStrategyType
  priceSum?: number
  spread?: number
  expectedProfit?: number
  actualProfit?: number
  investmentAmount?: number
  maxTradeable?: number
  tokens?: OpportunityTokenDetail[]
  status: OpportunityStatus
  executionSteps?: ExecutionStep[]
  tradeId?: number
  orderIds?: string[]
  txHashes?: string[]
  errorMessage?: string
  retryCount?: number
  createdAt?: Date
  queuedAt?: Date
  startedAt?: Date
  completedAt?: Date
}

/**
 * 保存套利机会
 */
export async function saveOpportunityFull(opp: OpportunityFullRecord): Promise<number> {
  const p = getPool()
  const sql = `
    INSERT INTO opportunities (
      condition_id, question, slug, strategy_type,
      price_sum, spread, expected_profit, actual_profit,
      investment_amount, max_tradeable, tokens, status,
      execution_steps, trade_id, order_ids, tx_hashes,
      error_message, retry_count, queued_at, started_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  const [result] = await p.execute(sql, [
    opp.conditionId,
    opp.question,
    opp.slug || null,
    opp.strategyType,
    opp.priceSum || null,
    opp.spread || null,
    opp.expectedProfit || null,
    opp.actualProfit || null,
    opp.investmentAmount || null,
    opp.maxTradeable || null,
    opp.tokens ? JSON.stringify(opp.tokens) : null,
    opp.status || 'PENDING',
    opp.executionSteps ? JSON.stringify(opp.executionSteps) : null,
    opp.tradeId || null,
    opp.orderIds ? JSON.stringify(opp.orderIds) : null,
    opp.txHashes ? JSON.stringify(opp.txHashes) : null,
    opp.errorMessage || null,
    opp.retryCount || 0,
    opp.queuedAt || null,
    opp.startedAt || null,
    opp.completedAt || null,
  ])
  return (result as any).insertId
}

/**
 * 更新机会状态
 */
export async function updateOpportunityStatus(
  id: number,
  updates: {
    status?: OpportunityStatus
    actualProfit?: number
    tradeId?: number
    txHashes?: string[]
    orderIds?: string[]
    executionSteps?: ExecutionStep[]
    errorMessage?: string
    retryCount?: number
    queuedAt?: Date
    startedAt?: Date
    completedAt?: Date
  }
): Promise<void> {
  const p = getPool()
  const setClauses: string[] = []
  const params: any[] = []

  if (updates.status !== undefined) {
    setClauses.push('status = ?')
    params.push(updates.status)
  }
  if (updates.actualProfit !== undefined) {
    setClauses.push('actual_profit = ?')
    params.push(updates.actualProfit)
  }
  if (updates.tradeId !== undefined) {
    setClauses.push('trade_id = ?')
    params.push(updates.tradeId)
  }
  if (updates.txHashes !== undefined) {
    setClauses.push('tx_hashes = ?')
    params.push(JSON.stringify(updates.txHashes))
  }
  if (updates.orderIds !== undefined) {
    setClauses.push('order_ids = ?')
    params.push(JSON.stringify(updates.orderIds))
  }
  if (updates.executionSteps !== undefined) {
    setClauses.push('execution_steps = ?')
    params.push(JSON.stringify(updates.executionSteps))
  }
  if (updates.errorMessage !== undefined) {
    setClauses.push('error_message = ?')
    params.push(updates.errorMessage)
  }
  if (updates.retryCount !== undefined) {
    setClauses.push('retry_count = ?')
    params.push(updates.retryCount)
  }
  if (updates.queuedAt !== undefined) {
    setClauses.push('queued_at = ?')
    params.push(updates.queuedAt)
  }
  if (updates.startedAt !== undefined) {
    setClauses.push('started_at = ?')
    params.push(updates.startedAt)
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?')
    params.push(updates.completedAt)
  }

  if (setClauses.length === 0) return

  params.push(id)
  const sql = `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = ?`
  await p.execute(sql, params)
}

/**
 * 追加执行步骤
 */
export async function appendExecutionStep(id: number, step: ExecutionStep): Promise<void> {
  const p = getPool()
  const sql = `
    UPDATE opportunities 
    SET execution_steps = JSON_ARRAY_APPEND(
      COALESCE(execution_steps, JSON_ARRAY()), 
      '$', 
      CAST(? AS JSON)
    )
    WHERE id = ?
  `
  await p.execute(sql, [JSON.stringify(step), id])
}

/**
 * 获取机会列表
 */
export async function getOpportunities(options: {
  strategyType?: OpportunityStrategyType
  status?: OpportunityStatus
  conditionId?: string
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
} = {}): Promise<OpportunityFullRecord[]> {
  const p = getPool()
  const { strategyType, status, conditionId, startTime, endTime, limit = 50, offset = 0 } = options

  let whereClause = '1=1'
  const params: any[] = []

  if (strategyType) {
    whereClause += ' AND strategy_type = ?'
    params.push(strategyType)
  }
  if (status) {
    whereClause += ' AND status = ?'
    params.push(status)
  }
  if (conditionId) {
    whereClause += ' AND condition_id = ?'
    params.push(conditionId)
  }
  if (startTime) {
    whereClause += ' AND created_at >= ?'
    params.push(startTime)
  }
  if (endTime) {
    whereClause += ' AND created_at <= ?'
    params.push(endTime)
  }

  const sql = `
    SELECT 
      id, condition_id as conditionId, question, slug,
      strategy_type as strategyType,
      price_sum as priceSum, spread, expected_profit as expectedProfit,
      actual_profit as actualProfit, investment_amount as investmentAmount,
      max_tradeable as maxTradeable, tokens, status,
      execution_steps as executionSteps, trade_id as tradeId,
      order_ids as orderIds, tx_hashes as txHashes,
      error_message as errorMessage, retry_count as retryCount,
      created_at as createdAt, queued_at as queuedAt,
      started_at as startedAt, completed_at as completedAt
    FROM opportunities
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `

  const [rows] = await p.query(sql, params)
  return (rows as any[]).map(row => ({
    ...row,
    tokens: row.tokens ? JSON.parse(row.tokens) : null,
    executionSteps: row.executionSteps ? JSON.parse(row.executionSteps) : null,
    orderIds: row.orderIds ? JSON.parse(row.orderIds) : null,
    txHashes: row.txHashes ? JSON.parse(row.txHashes) : null,
  }))
}

/**
 * 获取单个机会详情
 */
export async function getOpportunityById(id: number): Promise<OpportunityFullRecord | null> {
  const p = getPool()
  const sql = `
    SELECT 
      id, condition_id as conditionId, question, slug,
      strategy_type as strategyType,
      price_sum as priceSum, spread, expected_profit as expectedProfit,
      actual_profit as actualProfit, investment_amount as investmentAmount,
      max_tradeable as maxTradeable, tokens, status,
      execution_steps as executionSteps, trade_id as tradeId,
      order_ids as orderIds, tx_hashes as txHashes,
      error_message as errorMessage, retry_count as retryCount,
      created_at as createdAt, queued_at as queuedAt,
      started_at as startedAt, completed_at as completedAt
    FROM opportunities
    WHERE id = ?
  `
  const [rows] = await p.execute(sql, [id])
  const row = (rows as any[])[0]
  if (!row) return null

  return {
    ...row,
    tokens: row.tokens ? JSON.parse(row.tokens) : null,
    executionSteps: row.executionSteps ? JSON.parse(row.executionSteps) : null,
    orderIds: row.orderIds ? JSON.parse(row.orderIds) : null,
    txHashes: row.txHashes ? JSON.parse(row.txHashes) : null,
  }
}

/**
 * 获取机会统计
 */
export async function getOpportunityStats(options: {
  strategyType?: OpportunityStrategyType
  startTime?: Date
  endTime?: Date
} = {}): Promise<{
  total: number
  pending: number
  queued: number
  executing: number
  success: number
  failed: number
  partial: number
  expired: number
  cancelled: number
  totalExpectedProfit: number
  totalActualProfit: number
  successRate: number
}> {
  const p = getPool()
  const { strategyType, startTime, endTime } = options

  let whereClause = '1=1'
  const params: any[] = []

  if (strategyType) {
    whereClause += ' AND strategy_type = ?'
    params.push(strategyType)
  }
  if (startTime) {
    whereClause += ' AND created_at >= ?'
    params.push(startTime)
  }
  if (endTime) {
    whereClause += ' AND created_at <= ?'
    params.push(endTime)
  }

  const sql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'EXECUTING' THEN 1 ELSE 0 END) as executing,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) as partial,
      SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) as expired,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      COALESCE(SUM(expected_profit), 0) as totalExpectedProfit,
      COALESCE(SUM(CASE WHEN status IN ('SUCCESS', 'PARTIAL') THEN actual_profit ELSE 0 END), 0) as totalActualProfit
    FROM opportunities
    WHERE ${whereClause}
  `
  const [rows] = await p.execute(sql, params)
  const row = (rows as any[])[0]

  const total = row.total || 0
  const success = row.success || 0
  const partial = row.partial || 0

  return {
    total,
    pending: row.pending || 0,
    queued: row.queued || 0,
    executing: row.executing || 0,
    success,
    failed: row.failed || 0,
    partial,
    expired: row.expired || 0,
    cancelled: row.cancelled || 0,
    totalExpectedProfit: parseFloat(row.totalExpectedProfit) || 0,
    totalActualProfit: parseFloat(row.totalActualProfit) || 0,
    successRate: total > 0 ? ((success + partial) / total) * 100 : 0,
  }
}

/**
 * 获取今日统计
 */
export async function getTodayOpportunityStats(strategyType?: OpportunityStrategyType): Promise<{
  found: number
  executed: number
  success: number
  failed: number
  profit: number
}> {
  const p = getPool()
  
  let whereClause = 'DATE(created_at) = CURDATE()'
  const params: any[] = []
  
  if (strategyType) {
    whereClause += ' AND strategy_type = ?'
    params.push(strategyType)
  }

  const sql = `
    SELECT 
      COUNT(*) as found,
      SUM(CASE WHEN status IN ('SUCCESS', 'FAILED', 'PARTIAL') THEN 1 ELSE 0 END) as executed,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      COALESCE(SUM(CASE WHEN status IN ('SUCCESS', 'PARTIAL') THEN actual_profit ELSE 0 END), 0) as profit
    FROM opportunities
    WHERE ${whereClause}
  `
  const [rows] = await p.execute(sql, params)
  const row = (rows as any[])[0]

  return {
    found: row.found || 0,
    executed: row.executed || 0,
    success: row.success || 0,
    failed: row.failed || 0,
    profit: parseFloat(row.profit) || 0,
  }
}

/**
 * 清理过期的待处理机会 (超过指定时间未执行)
 */
export async function expireStaleOpportunities(maxAgeMinutes: number = 5): Promise<number> {
  const p = getPool()
  const [result] = await p.execute(
    `UPDATE opportunities 
     SET status = 'EXPIRED' 
     WHERE status IN ('PENDING', 'QUEUED') 
     AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [maxAgeMinutes]
  )
  return (result as any).affectedRows
}

// ==================== 策略配置持久化 ====================

/**
 * 保存策略配置到数据库
 */
export async function saveStrategyConfig(
  strategyType: string,
  enabled: boolean,
  config: Record<string, any>
): Promise<void> {
  const p = getPool()
  const sql = `
    INSERT INTO strategy_configs (strategy_type, enabled, config)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      enabled = VALUES(enabled),
      config = VALUES(config),
      updated_at = CURRENT_TIMESTAMP
  `
  await p.execute(sql, [strategyType, enabled, JSON.stringify(config)])
}

/**
 * 获取策略配置
 */
export async function getStrategyConfig(strategyType: string): Promise<{
  enabled: boolean
  config: Record<string, any>
} | null> {
  const p = getPool()
  const sql = `SELECT enabled, config FROM strategy_configs WHERE strategy_type = ?`
  const [rows] = await p.execute(sql, [strategyType])
  const row = (rows as any[])[0]
  if (!row) return null
  return {
    enabled: !!row.enabled,
    config: row.config ? JSON.parse(row.config) : {},
  }
}

/**
 * 获取所有策略配置
 */
export async function getAllStrategyConfigs(): Promise<Record<string, {
  enabled: boolean
  config: Record<string, any>
}>> {
  const p = getPool()
  const sql = `SELECT strategy_type, enabled, config FROM strategy_configs`
  const [rows] = await p.execute(sql)
  
  const result: Record<string, { enabled: boolean; config: Record<string, any> }> = {}
  for (const row of rows as any[]) {
    result[row.strategy_type] = {
      enabled: !!row.enabled,
      config: row.config ? JSON.parse(row.config) : {},
    }
  }
  return result
}

// ==================== 队列状态持久化 ====================

/**
 * 更新队列状态
 */
export async function updateQueueStatus(
  queueName: string,
  status: {
    currentSize?: number
    maxSize?: number
    state?: 'idle' | 'running' | 'paused' | 'stopped'
    processedCount?: number
    errorCount?: number
    lastTaskAt?: Date
    config?: Record<string, any>
  }
): Promise<void> {
  const p = getPool()
  const setClauses: string[] = []
  const params: any[] = []

  if (status.currentSize !== undefined) {
    setClauses.push('current_size = ?')
    params.push(status.currentSize)
  }
  if (status.maxSize !== undefined) {
    setClauses.push('max_size = ?')
    params.push(status.maxSize)
  }
  if (status.state !== undefined) {
    setClauses.push('state = ?')
    params.push(status.state)
  }
  if (status.processedCount !== undefined) {
    setClauses.push('processed_count = ?')
    params.push(status.processedCount)
  }
  if (status.errorCount !== undefined) {
    setClauses.push('error_count = ?')
    params.push(status.errorCount)
  }
  if (status.lastTaskAt !== undefined) {
    setClauses.push('last_task_at = ?')
    params.push(status.lastTaskAt)
  }
  if (status.config !== undefined) {
    setClauses.push('config = ?')
    params.push(JSON.stringify(status.config))
  }

  if (setClauses.length === 0) return

  const sql = `
    INSERT INTO queue_status (queue_name, ${setClauses.map(c => c.split(' = ')[0]).join(', ')})
    VALUES (?, ${setClauses.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE ${setClauses.join(', ')}
  `
  await p.execute(sql, [queueName, ...params, ...params])
}

/**
 * 获取队列状态
 */
export async function getQueueStatus(queueName: string): Promise<{
  currentSize: number
  maxSize: number
  state: 'idle' | 'running' | 'paused' | 'stopped'
  processedCount: number
  errorCount: number
  lastTaskAt: Date | null
  config: Record<string, any>
} | null> {
  const p = getPool()
  const sql = `
    SELECT current_size, max_size, state, processed_count, error_count, last_task_at, config
    FROM queue_status
    WHERE queue_name = ?
  `
  const [rows] = await p.execute(sql, [queueName])
  const row = (rows as any[])[0]
  if (!row) return null
  return {
    currentSize: row.current_size || 0,
    maxSize: row.max_size || 0,
    state: row.state || 'idle',
    processedCount: row.processed_count || 0,
    errorCount: row.error_count || 0,
    lastTaskAt: row.last_task_at || null,
    config: row.config ? JSON.parse(row.config) : {},
  }
}

/**
 * 获取所有队列状态
 */
export async function getAllQueueStatus(): Promise<Record<string, {
  currentSize: number
  maxSize: number
  state: 'idle' | 'running' | 'paused' | 'stopped'
  processedCount: number
  errorCount: number
  lastTaskAt: Date | null
}>> {
  const p = getPool()
  const sql = `SELECT queue_name, current_size, max_size, state, processed_count, error_count, last_task_at FROM queue_status`
  const [rows] = await p.execute(sql)
  
  const result: Record<string, any> = {}
  for (const row of rows as any[]) {
    result[row.queue_name] = {
      currentSize: row.current_size || 0,
      maxSize: row.max_size || 0,
      state: row.state || 'idle',
      processedCount: row.processed_count || 0,
      errorCount: row.error_count || 0,
      lastTaskAt: row.last_task_at || null,
    }
  }
  return result
}
