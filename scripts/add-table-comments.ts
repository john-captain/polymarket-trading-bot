/**
 * 为 MySQL 数据表和字段添加注释
 * 
 * 运行方式：npx ts-node scripts/add-table-comments.ts
 */

import mysql from 'mysql2/promise'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ES 模块兼容 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'polymarket',
  charset: 'utf8mb4',
}

/**
 * 表注释定义
 */
const TABLE_COMMENTS: Record<string, string> = {
  markets: 'Polymarket 市场数据表 - 存储从 Gamma API 同步的完整市场信息',
  market_price_history: '市场价格历史表 - 记录市场价格随时间的变化',
  trade_records: '交易记录表 - 存储所有套利交易的执行记录',
  arbitrage_opportunities: '套利机会表 - 记录发现的套利机会',
  price_deviation_markets: '价格偏离市场表 - 记录价格偏离正常值的市场',
  scan_history: '扫描历史表 - 记录每次市场扫描的统计数据',
}

/**
 * 字段注释定义 - markets 表
 */
const MARKETS_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  condition_id: '市场条件ID (唯一标识)',
  question_id: '问题ID',
  slug: 'URL友好标识符',
  question: '市场问题描述',
  description: '详细描述',
  category: '分类',
  market_type: '市场类型 (normal/multi)',
  end_date: '结束日期',
  start_date: '开始日期',
  created_at_api: 'API创建时间',
  updated_at_api: 'API更新时间',
  closed_time: '关闭时间',
  outcomes: '结果选项 (JSON数组)',
  outcome_prices: '结果价格 (JSON数组)',
  tokens: 'CLOB Token IDs (JSON数组)',
  volume: '总交易量',
  volume_24hr: '24小时交易量',
  volume_1wk: '7天交易量',
  volume_1mo: '30天交易量',
  volume_1yr: '年交易量',
  volume_1wk_amm: '7天AMM交易量',
  volume_1mo_amm: '30天AMM交易量',
  volume_1yr_amm: '年AMM交易量',
  volume_1wk_clob: '7天CLOB交易量',
  volume_1mo_clob: '30天CLOB交易量',
  volume_1yr_clob: '年CLOB交易量',
  liquidity: '总流动性',
  liquidity_amm: 'AMM流动性',
  liquidity_clob: 'CLOB流动性',
  best_bid: '最佳买价',
  best_ask: '最佳卖价',
  spread: '买卖价差',
  last_trade_price: '最后成交价',
  one_hour_price_change: '1小时价格变化',
  one_day_price_change: '24小时价格变化',
  one_week_price_change: '7天价格变化',
  one_month_price_change: '30天价格变化',
  one_year_price_change: '年价格变化',
  active: '是否活跃',
  closed: '是否已关闭',
  archived: '是否已归档',
  restricted: '是否受限',
  enable_order_book: '是否启用订单簿',
  fpmm_live: 'FPMM(AMM)是否启用',
  cyom: '是否为用户创建的市场',
  competitive: '竞争度评分',
  rfq_enabled: '是否启用RFQ',
  holding_rewards_enabled: '是否启用持仓奖励',
  fees_enabled: '是否启用手续费',
  neg_risk_other: '负风险其他标志',
  clear_book_on_start: '开始时清空订单簿',
  manual_activation: '手动激活标志',
  pending_deployment: '等待部署',
  deploying: '正在部署',
  rewards_min_size: '奖励最小规模',
  rewards_max_spread: '奖励最大价差',
  image: '市场图片URL',
  icon: '图标URL',
  twitter_card_image: 'Twitter卡片图片',
  events: '关联事件数据 (JSON)',
  tags: '标签列表 (JSON)',
  uma_resolution_statuses: 'UMA解决状态 (JSON)',
  market_maker_address: '做市商地址',
  comment_count: '评论数',
  mailchimp_tag: 'Mailchimp标签',
  synced_at: '本地同步时间',
}

/**
 * 字段注释定义 - market_price_history 表
 */
const PRICE_HISTORY_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  condition_id: '关联市场的条件ID',
  outcome_prices: '当时的价格 (JSON数组)',
  volume: '当时的总交易量',
  volume_24hr: '当时的24小时交易量',
  liquidity: '当时的流动性',
  best_bid: '当时的最佳买价',
  best_ask: '当时的最佳卖价',
  spread: '当时的买卖价差',
  last_trade_price: '当时的最后成交价',
  recorded_at: '记录时间',
}

/**
 * 字段注释定义 - trade_records 表
 */
const TRADE_RECORDS_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  opportunity_id: '关联的套利机会ID',
  market_question: '市场问题描述',
  trade_type: '交易类型 (LONG/SHORT)',
  yes_amount: 'Yes方向投入金额',
  no_amount: 'No方向投入金额',
  total_investment: '总投资金额',
  expected_profit: '预期利润',
  actual_profit: '实际利润',
  status: '交易状态 (PENDING/SUCCESS/FAILED/SIMULATED)',
  tx_hash: '交易哈希',
  error_message: '错误信息',
  created_at: '创建时间',
}

/**
 * 字段注释定义 - arbitrage_opportunities 表
 */
const ARBITRAGE_OPPORTUNITIES_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  market_question: '市场问题描述',
  market_slug: '市场URL标识',
  condition_id: '市场条件ID',
  yes_price: 'Yes价格',
  no_price: 'No价格',
  price_sum: '价格总和',
  spread: '价差百分比',
  opportunity_type: '机会类型 (LONG/SHORT)',
  expected_profit: '预期利润',
  executed: '是否已执行',
  created_at: '创建时间',
}

/**
 * 字段注释定义 - price_deviation_markets 表
 */
const PRICE_DEVIATION_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  market_question: '市场问题描述',
  market_slug: '市场URL标识',
  condition_id: '市场条件ID',
  yes_price: 'Yes价格',
  no_price: 'No价格',
  price_sum: '价格总和',
  spread: '价差百分比',
  deviation_type: '偏离类型 (LONG/SHORT)',
  scan_id: '关联的扫描ID',
  created_at: '创建时间',
}

/**
 * 字段注释定义 - scan_history 表
 */
const SCAN_HISTORY_COLUMN_COMMENTS: Record<string, string> = {
  id: '自增主键',
  total_markets: '扫描的总市场数',
  deviated_markets: '发现的偏离市场数',
  opportunities_found: '发现的套利机会数',
  scan_duration_ms: '扫描耗时(毫秒)',
  created_at: '创建时间',
}

/**
 * 所有表的字段注释映射
 */
const ALL_COLUMN_COMMENTS: Record<string, Record<string, string>> = {
  markets: MARKETS_COLUMN_COMMENTS,
  market_price_history: PRICE_HISTORY_COLUMN_COMMENTS,
  trade_records: TRADE_RECORDS_COLUMN_COMMENTS,
  arbitrage_opportunities: ARBITRAGE_OPPORTUNITIES_COLUMN_COMMENTS,
  price_deviation_markets: PRICE_DEVIATION_COLUMN_COMMENTS,
  scan_history: SCAN_HISTORY_COLUMN_COMMENTS,
}

/**
 * 检查表是否存在
 */
async function tableExists(pool: mysql.Pool, tableName: string): Promise<boolean> {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count FROM information_schema.tables 
     WHERE table_schema = ? AND table_name = ?`,
    [dbConfig.database, tableName]
  )
  return (rows as any)[0].count > 0
}

/**
 * 获取表的所有字段
 */
async function getTableColumns(pool: mysql.Pool, tableName: string): Promise<string[]> {
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME FROM information_schema.columns 
     WHERE table_schema = ? AND table_name = ?`,
    [dbConfig.database, tableName]
  )
  return (rows as any[]).map(row => row.COLUMN_NAME)
}

/**
 * 获取字段的数据类型信息（完整定义）
 */
async function getColumnType(pool: mysql.Pool, tableName: string, columnName: string): Promise<string> {
  const [rows] = await pool.execute(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, DATA_TYPE
     FROM information_schema.columns 
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [dbConfig.database, tableName, columnName]
  )
  const row = (rows as any[])[0]
  if (!row) return ''
  
  let type = row.COLUMN_TYPE
  
  // 处理 NULLABLE
  if (row.IS_NULLABLE === 'NO') {
    type += ' NOT NULL'
  }
  
  // 处理默认值 - 排除 CURRENT_TIMESTAMP 等特殊值
  if (row.COLUMN_DEFAULT !== null) {
    // 对于时间戳字段，DEFAULT_GENERATED 会在 EXTRA 中
    if (!row.EXTRA?.includes('DEFAULT_GENERATED')) {
      if (row.DATA_TYPE === 'varchar' || row.DATA_TYPE === 'text' || row.DATA_TYPE === 'char') {
        type += ` DEFAULT '${row.COLUMN_DEFAULT}'`
      } else if (row.DATA_TYPE === 'enum') {
        // ENUM 类型的默认值需要加引号
        type += ` DEFAULT '${row.COLUMN_DEFAULT}'`
      } else {
        type += ` DEFAULT ${row.COLUMN_DEFAULT}`
      }
    }
  }
  
  // 处理 AUTO_INCREMENT 等
  if (row.EXTRA) {
    // 排除 DEFAULT_GENERATED (MySQL 8.0 自动生成时间戳的标记)
    const extraClean = row.EXTRA.replace(/DEFAULT_GENERATED\s*(on update CURRENT_TIMESTAMP)?/gi, '').trim()
    if (extraClean) {
      type += ` ${extraClean}`
    }
    // 特殊处理: 如果有 on update CURRENT_TIMESTAMP
    if (row.EXTRA.toLowerCase().includes('on update current_timestamp')) {
      if (row.EXTRA.includes('DEFAULT_GENERATED')) {
        type += ' DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      }
    } else if (row.EXTRA.includes('DEFAULT_GENERATED')) {
      type += ' DEFAULT CURRENT_TIMESTAMP'
    }
  }
  
  return type
}

/**
 * 添加表注释
 */
async function addTableComment(pool: mysql.Pool, tableName: string, comment: string): Promise<void> {
  // 转义注释中的特殊字符
  const escapedComment = comment.replace(/'/g, "''")
  const sql = `ALTER TABLE \`${tableName}\` COMMENT = '${escapedComment}'`
  await pool.execute(sql)
  console.log(`✅ 表 ${tableName} 注释已添加`)
}

/**
 * 添加字段注释
 */
async function addColumnComment(
  pool: mysql.Pool,
  tableName: string,
  columnName: string,
  columnType: string,
  comment: string
): Promise<void> {
  // 转义注释中的特殊字符
  const escapedComment = comment.replace(/'/g, "''")
  // 需要保留原字段定义，只添加 COMMENT
  const sql = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${columnType} COMMENT '${escapedComment}'`
  await pool.execute(sql)
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始为数据表添加注释...\n')
  
  const pool = mysql.createPool(dbConfig)
  
  try {
    // 测试连接
    const connection = await pool.getConnection()
    console.log('✅ 数据库连接成功\n')
    connection.release()
    
    // 遍历所有表
    for (const [tableName, tableComment] of Object.entries(TABLE_COMMENTS)) {
      console.log(`\n📋 处理表: ${tableName}`)
      console.log('─'.repeat(50))
      
      // 检查表是否存在
      const exists = await tableExists(pool, tableName)
      if (!exists) {
        console.log(`⚠️  表 ${tableName} 不存在，跳过`)
        continue
      }
      
      // 添加表注释
      await addTableComment(pool, tableName, tableComment)
      
      // 获取表的所有字段
      const columns = await getTableColumns(pool, tableName)
      const columnComments = ALL_COLUMN_COMMENTS[tableName] || {}
      
      // 遍历字段添加注释
      let addedCount = 0
      let skippedCount = 0
      
      for (const column of columns) {
        const comment = columnComments[column]
        if (comment) {
          try {
            const columnType = await getColumnType(pool, tableName, column)
            await addColumnComment(pool, tableName, column, columnType, comment)
            addedCount++
          } catch (error: any) {
            console.log(`⚠️  字段 ${column} 注释添加失败: ${error.message}`)
          }
        } else {
          skippedCount++
        }
      }
      
      console.log(`   ✓ 已添加 ${addedCount} 个字段注释, 跳过 ${skippedCount} 个无定义字段`)
    }
    
    console.log('\n' + '═'.repeat(50))
    console.log('✅ 所有表注释添加完成！')
    console.log('═'.repeat(50))
    
    // 显示验证信息
    console.log('\n📊 验证注释 (查看 markets 表前10个字段):')
    const [verifyRows] = await pool.execute(
      `SELECT COLUMN_NAME, COLUMN_COMMENT 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = 'markets' 
       LIMIT 10`,
      [dbConfig.database]
    )
    console.table(verifyRows)
    
  } catch (error: any) {
    console.error('❌ 执行失败:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
    console.log('\n👋 数据库连接已关闭')
  }
}

main()
