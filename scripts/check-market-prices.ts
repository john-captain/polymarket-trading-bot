/**
 * 检查套利机会 - 价格和偏离 1
 * 
 * 原理：同一个市场的所有互斥 outcome 的 mid_price 之和应该等于 1
 *       当价格和偏离 1 时，存在无风险套利机会：
 *       - 价格和 < 1：做多（买入所有 outcome）
 *       - 价格和 > 1：做空（铸造 $1 卖出所有 outcome）
 * 
 * 用法: npm run check-prices
 */

import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'polymarket',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'polymarket',
  port: parseInt(process.env.DB_PORT || '3306'),
}

async function checkArbitrage() {
  console.log('='.repeat(80))
  console.log('📊 套利机会扫描 - 检查价格和偏离')
  console.log('='.repeat(80))
  
  let connection: mysql.Connection | null = null
  
  try {
    connection = await mysql.createConnection(dbConfig)
    console.log('✅ 数据库连接成功\n')
    
    // 1. 统计总记录数
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total, COUNT(DISTINCT condition_id) as markets, COUNT(DISTINCT token_id) as tokens FROM market_prices'
    ) as [any[], any]
    const { total, markets, tokens } = countResult[0]
    console.log(`📊 数据概览: ${total} 条记录, ${markets} 个市场, ${tokens} 个 tokens\n`)
    
    // 2. 按 condition_id + fetched_at 分组，查询所有时间点的价格和
    const sql = `
      SELECT 
        p.condition_id,
        m.question,
        p.fetched_at,
        COUNT(*) as outcome_count,
        SUM(p.mid_price) as price_sum,
        ABS(SUM(p.mid_price) - 1) as deviation,
        GROUP_CONCAT(
          CONCAT(p.outcome, ':', ROUND(p.mid_price, 4)) 
          ORDER BY p.outcome_index SEPARATOR ' | '
        ) as details
      FROM market_prices p
      LEFT JOIN markets m ON p.condition_id = m.condition_id
      WHERE p.mid_price IS NOT NULL
      GROUP BY p.condition_id, m.question, p.fetched_at
      HAVING outcome_count >= 2 AND ABS(SUM(p.mid_price) - 1) > 0.001
      ORDER BY deviation DESC
      LIMIT 50
    `
    
    console.log('🔍 扫描价格偏离 > 0.1% 的市场...\n')
    const [rows] = await connection.execute(sql) as [any[], any]
    
    if (rows.length === 0) {
      console.log('✅ 没有发现套利机会！所有市场价格和 ≈ 1.0000')
      
      // 显示一些正常市场的示例
      const [sampleResult] = await connection.execute(`
        SELECT 
          p.condition_id,
          p.fetched_at,
          COUNT(*) as outcomes,
          ROUND(SUM(p.mid_price), 4) as price_sum,
          GROUP_CONCAT(
            CONCAT(p.outcome, ':', ROUND(p.mid_price, 4)) 
            ORDER BY p.outcome_index SEPARATOR ' | '
          ) as details
        FROM market_prices p
        WHERE p.mid_price IS NOT NULL
        GROUP BY p.condition_id, p.fetched_at
        HAVING outcomes = 2
        LIMIT 5
      `) as [any[], any]
      
      console.log('\n📋 正常市场示例 (价格和 = 1.0):')
      console.log('-'.repeat(80))
      for (const row of sampleResult) {
        console.log(`  ${row.condition_id.substring(0, 20)}... | ${row.details}`)
      }
      
      return
    }
    
    // 显示套利机会
    console.log(`⚠️ 发现 ${rows.length} 个潜在套利机会:\n`)
    console.log('-'.repeat(80))
    
    let longCount = 0
    let shortCount = 0
    
    for (const row of rows) {
      const priceSum = parseFloat(row.price_sum)
      const deviation = parseFloat(row.deviation)
      const direction = priceSum > 1 ? '做空' : '做多'
      const arrow = priceSum > 1 ? '▲' : '▼'
      
      if (priceSum > 1) shortCount++
      else longCount++
      
      const question = row.question?.substring(0, 40) || row.condition_id.substring(0, 20)
      
      console.log(`${arrow} 价格和: ${priceSum.toFixed(4)} | 偏差: ${(deviation * 100).toFixed(2)}% | ${direction}`)
      console.log(`  市场: ${question}`)
      console.log(`  详情: ${row.details}`)
      console.log('')
    }
    
    console.log('='.repeat(80))
    console.log('📈 套利统计:')
    console.log(`   做多机会 (价格和 < 1): ${longCount} 个`)
    console.log(`   做空机会 (价格和 > 1): ${shortCount} 个`)
    console.log('='.repeat(80))
    
  } catch (error: unknown) {
    console.error('❌ 执行失败:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

checkArbitrage().catch(console.error)
