/**
 * MySQL 数据库模块 - 套利数据持久化
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 数据库连接池
let pool: mysql.Pool | null = null;

// 数据库配置
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'polymarket',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
};

/**
 * 初始化数据库连接池
 */
export async function initDatabase(): Promise<void> {
    try {
        pool = mysql.createPool(dbConfig);
        // 测试连接
        const connection = await pool.getConnection();
        console.log('✅ MySQL 数据库连接成功');
        connection.release();
    } catch (error: any) {
        console.error('❌ MySQL 数据库连接失败:', error.message);
        throw error;
    }
}

/**
 * 获取数据库连接池
 */
export function getPool(): mysql.Pool {
    if (!pool) {
        throw new Error('数据库未初始化，请先调用 initDatabase()');
    }
    return pool;
}

// ==================== 套利机会 ====================

export interface ArbitrageOpportunity {
    id?: number;
    market_question: string;
    market_slug?: string;
    condition_id?: string;
    yes_price: number;
    no_price: number;
    price_sum: number;
    spread: number;
    opportunity_type: 'LONG' | 'SHORT';
    expected_profit?: number;
    created_at?: Date;
}

/**
 * 保存套利机会
 */
export async function saveArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<number> {
    const pool = getPool();
    const sql = `
        INSERT INTO arbitrage_opportunities 
        (market_question, market_slug, condition_id, yes_price, no_price, price_sum, spread, opportunity_type, expected_profit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
        opportunity.market_question,
        opportunity.market_slug || null,
        opportunity.condition_id || null,
        opportunity.yes_price,
        opportunity.no_price,
        opportunity.price_sum,
        opportunity.spread,
        opportunity.opportunity_type,
        opportunity.expected_profit || null
    ]);
    return (result as any).insertId;
}

/**
 * 获取最近的套利机会
 */
export async function getRecentOpportunities(limit: number = 50): Promise<ArbitrageOpportunity[]> {
    const pool = getPool();
    const sql = `SELECT * FROM arbitrage_opportunities ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`;
    const [rows] = await pool.execute(sql);
    return rows as ArbitrageOpportunity[];
}

// ==================== 价格偏离市场 ====================

export interface PriceDeviationMarket {
    id?: number;
    market_question: string;
    market_slug?: string;
    condition_id?: string;
    yes_price: number;
    no_price: number;
    price_sum: number;
    spread: number;
    deviation_type: 'LONG' | 'SHORT';
    scan_id?: number;
    created_at?: Date;
}

/**
 * 批量保存价格偏离市场
 */
export async function savePriceDeviationMarkets(markets: PriceDeviationMarket[], scanId: number): Promise<void> {
    if (markets.length === 0) return;
    
    const pool = getPool();
    const sql = `
        INSERT INTO price_deviation_markets 
        (market_question, market_slug, condition_id, yes_price, no_price, price_sum, spread, deviation_type, scan_id)
        VALUES ?
    `;
    const values = markets.map(m => [
        m.market_question,
        m.market_slug || null,
        m.condition_id || null,
        m.yes_price,
        m.no_price,
        m.price_sum,
        m.spread,
        m.deviation_type,
        scanId
    ]);
    
    await pool.query(sql, [values]);
}

/**
 * 获取最近的价格偏离市场
 */
export async function getRecentDeviationMarkets(limit: number = 100): Promise<PriceDeviationMarket[]> {
    const pool = getPool();
    const sql = `SELECT * FROM price_deviation_markets ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`;
    const [rows] = await pool.execute(sql);
    return rows as PriceDeviationMarket[];
}

/**
 * 获取最新一次扫描的价格偏离市场（去重）
 */
export async function getLatestDeviationMarkets(limit: number = 15): Promise<PriceDeviationMarket[]> {
    const pool = getPool();
    // 获取最新的 scan_id
    const [scanRows] = await pool.execute('SELECT MAX(scan_id) as latest_scan_id FROM price_deviation_markets');
    const latestScanId = (scanRows as any)[0]?.latest_scan_id;
    
    if (!latestScanId) {
        return [];
    }
    
    // 获取最新扫描的偏离市场，按价差绝对值排序
    const sql = `
        SELECT * FROM price_deviation_markets 
        WHERE scan_id = ? 
        ORDER BY ABS(spread) DESC 
        LIMIT ${Math.floor(limit)}
    `;
    const [rows] = await pool.execute(sql, [latestScanId]);
    return rows as PriceDeviationMarket[];
}

/**
 * 获取指定扫描的偏离市场
 */
export async function getDeviationMarketsByScanId(scanId: number): Promise<PriceDeviationMarket[]> {
    const pool = getPool();
    const sql = `SELECT * FROM price_deviation_markets WHERE scan_id = ? ORDER BY ABS(spread) DESC`;
    const [rows] = await pool.execute(sql, [scanId]);
    return rows as PriceDeviationMarket[];
}

// ==================== 扫描历史 ====================

export interface ScanHistory {
    id?: number;
    total_markets: number;
    deviated_markets: number;
    opportunities_found: number;
    scan_duration_ms?: number;
    created_at?: Date;
}

/**
 * 保存扫描历史
 */
export async function saveScanHistory(scan: ScanHistory): Promise<number> {
    const pool = getPool();
    const sql = `
        INSERT INTO scan_history 
        (total_markets, deviated_markets, opportunities_found, scan_duration_ms)
        VALUES (?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
        scan.total_markets,
        scan.deviated_markets,
        scan.opportunities_found,
        scan.scan_duration_ms || null
    ]);
    return (result as any).insertId;
}

/**
 * 获取扫描历史
 */
export async function getScanHistory(limit: number = 100): Promise<ScanHistory[]> {
    const pool = getPool();
    const sql = `SELECT * FROM scan_history ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`;
    const [rows] = await pool.execute(sql);
    return rows as ScanHistory[];
}

/**
 * 获取扫描统计
 */
export async function getScanStats(): Promise<{
    totalScans: number;
    totalOpportunities: number;
    avgDeviatedMarkets: number;
    lastScanTime: Date | null;
}> {
    const pool = getPool();
    const sql = `
        SELECT 
            COUNT(*) as totalScans,
            SUM(opportunities_found) as totalOpportunities,
            AVG(deviated_markets) as avgDeviatedMarkets,
            MAX(created_at) as lastScanTime
        FROM scan_history
    `;
    const [rows] = await pool.execute(sql);
    const row = (rows as any[])[0];
    return {
        totalScans: row.totalScans || 0,
        totalOpportunities: row.totalOpportunities || 0,
        avgDeviatedMarkets: parseFloat(row.avgDeviatedMarkets) || 0,
        lastScanTime: row.lastScanTime || null
    };
}

// ==================== 交易记录 ====================

export interface TradeRecord {
    id?: number;
    opportunity_id?: number;
    market_question: string;
    trade_type: 'LONG' | 'SHORT';
    yes_amount?: number;
    no_amount?: number;
    total_investment?: number;
    expected_profit?: number;
    actual_profit?: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SIMULATED';
    tx_hash?: string;
    error_message?: string;
    created_at?: Date;
}

/**
 * 保存交易记录
 */
export async function saveTradeRecord(trade: TradeRecord): Promise<number> {
    const pool = getPool();
    const sql = `
        INSERT INTO trade_records 
        (opportunity_id, market_question, trade_type, yes_amount, no_amount, total_investment, expected_profit, actual_profit, status, tx_hash, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [
        trade.opportunity_id || null,
        trade.market_question,
        trade.trade_type,
        trade.yes_amount || null,
        trade.no_amount || null,
        trade.total_investment || null,
        trade.expected_profit || null,
        trade.actual_profit || null,
        trade.status,
        trade.tx_hash || null,
        trade.error_message || null
    ]);
    return (result as any).insertId;
}

/**
 * 获取交易记录
 */
export async function getTradeRecords(limit: number = 50): Promise<TradeRecord[]> {
    const pool = getPool();
    const sql = `SELECT * FROM trade_records ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`;
    const [rows] = await pool.execute(sql);
    return rows as TradeRecord[];
}

/**
 * 获取交易统计
 */
export async function getTradeStats(): Promise<{
    totalTrades: number;
    successTrades: number;
    totalProfit: number;
    totalInvestment: number;
}> {
    const pool = getPool();
    const sql = `
        SELECT 
            COUNT(*) as totalTrades,
            SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successTrades,
            SUM(CASE WHEN status = 'SUCCESS' THEN actual_profit ELSE 0 END) as totalProfit,
            SUM(total_investment) as totalInvestment
        FROM trade_records
    `;
    const [rows] = await pool.execute(sql);
    const row = (rows as any[])[0];
    return {
        totalTrades: row.totalTrades || 0,
        successTrades: row.successTrades || 0,
        totalProfit: parseFloat(row.totalProfit) || 0,
        totalInvestment: parseFloat(row.totalInvestment) || 0
    };
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('✅ MySQL 数据库连接已关闭');
    }
}
