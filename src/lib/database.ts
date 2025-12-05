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
  connectionLimit: 10,
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
 * 批量保存市场数据
 */
export async function batchUpsertMarkets(markets: MarketRecord[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0
  let updated = 0
  
  for (const market of markets) {
    const result = await upsertMarket(market)
    if (result.inserted) {
      inserted++
    } else {
      updated++
    }
  }
  
  return { inserted, updated }
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
} = {}): Promise<{ markets: MarketRecord[]; total: number }> {
  const p = getPool()
  const {
    limit = 50,
    offset = 0,
    active,
    category,
    search,
    orderBy = 'updated_at',
    orderDir = 'DESC'
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
    LIMIT 20
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
 * 批量记录价格快照
 */
export async function batchRecordPriceSnapshots(markets: MarketRecord[]): Promise<number> {
  let count = 0
  for (const market of markets) {
    await recordPriceSnapshot({
      conditionId: market.conditionId,
      outcomePrices: market.outcomePrices,
      volume: market.volume || 0,
      volume24hr: market.volume24hr || 0,
      liquidity: market.liquidity || 0,
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      spread: market.spread,
      lastTradePrice: market.lastTradePrice,
    })
    count++
  }
  return count
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
