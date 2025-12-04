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
