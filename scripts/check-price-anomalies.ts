/**
 * 检查 market_price_history 表中 outcome_prices 价格和不等于 1 的数据
 * 
 * 用法: npx ts-node scripts/check-price-anomalies.ts [选项]
 * 
 * 选项:
 *   --limit=100        最大显示条数（默认 100）
 * 
 * 示例:
 *   npm run check-price                  # 显示价格和 ≠ 1 的记录，最多 100 条
 *   npm run check-price -- --limit=50    # 最多显示 50 条
 * 
 * npm run check-prices                    # 检测偏差 > 1% 的套利机会
npm run check-prices -- --min-dev=0.005 # 检测偏差 > 0.5% 的套利机会
npm run check-prices -- --min-dev=0.001 # 检测偏差 > 0.1% 的套利机会
 */

import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || '8.216.35.110',
  user: process.env.DB_USER || 'polymarket',
  password: process.env.DB_PASSWORD || 'polymarket666',
  database: process.env.DB_NAME || 'polymarket',
  port: parseInt(process.env.DB_PORT || '3306'),
}

interface PriceHistoryRow {
  id: number
  condition_id: string
  outcome_prices: string
  price_sum: number
  deviation: number
  volume: number
  liquidity: number
  recorded_at: Date
}

interface ParsedResult extends Omit<PriceHistoryRow, 'outcome_prices'> {
  prices: number[]
}

// 解析命令行参数
function parseArgs(): { limit: number } {
  const args = process.argv.slice(2)
  let limit = 100

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1])
    }
  }

  return { limit }
}

async function checkPriceAnomalies() {
  const { limit } = parseArgs()
  
  console.log('='.repeat(60))
  console.log('📊 市场价格异常检测脚本（价格和 ≠ 1）')
  console.log('='.repeat(60))
  console.log(`配置:`)
  console.log(`  - 检测条件: 价格和 ≠ 1.0 (容差 0.00001)`)
  console.log(`  - 最大显示条数: ${limit}`)
  console.log('='.repeat(60))
  
  let connection: mysql.Connection | null = null
  
  try {
    // 连接数据库
    console.log('\n🔌 连接数据库...')
    connection = await mysql.createConnection(dbConfig)
    console.log('✅ 数据库连接成功')
    
    // 先查询总记录数
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM market_price_history h
      WHERE h.outcome_prices IS NOT NULL
        AND h.outcome_prices != '[]'
        AND h.outcome_prices != 'null'
    `) as [any[], any]
    const totalRecords = countResult[0].total
    console.log(`\n📊 数据库共有 ${totalRecords} 条价格历史记录`)
    
    // 查询所有数据（不限制条数）
    // outcome_prices 是 JSON 数组格式，如 "[0.45, 0.55]" 或 '["0.45", "0.55"]'
    const sql = `
      SELECT 
        h.id,
        h.condition_id,
        h.outcome_prices,
        h.volume,
        h.liquidity,
        h.recorded_at
      FROM market_price_history h
      WHERE h.outcome_prices IS NOT NULL
        AND h.outcome_prices != '[]'
        AND h.outcome_prices != 'null'
      ORDER BY h.recorded_at DESC
    `
    
    console.log('🔍 执行查询（全量扫描）...')
    const [rows] = await connection.execute(sql) as [any[], any]
    console.log(`✅ 查询完成，获取 ${rows.length} 条记录`)
    
    // 在 JS 中计算价格和并筛选异常数据
    const anomalies: ParsedResult[] = []
    
    for (const row of rows) {
      let prices: number[] = []
      try {
        const parsed = JSON.parse(row.outcome_prices)
        // 处理字符串数组或数字数组
        prices = parsed.map((p: string | number) => parseFloat(String(p)))
      } catch {
        continue
      }
      
      if (prices.length === 0) continue

      const priceSum = prices.reduce((sum, p) => sum + p, 0)
      const deviation = Math.abs(priceSum - 1)
      
      // 使用 0.00001 容差（小数点后 5 位）来避免浮点数精度问题
      // 只要偏差超过 0.001%（即实际不等于 1）就记录
      if (deviation > 0.00001) {
        anomalies.push({
          id: row.id,
          condition_id: row.condition_id,
          prices,
          price_sum: priceSum,
          deviation,
          volume: row.volume,
          liquidity: row.liquidity,
          recorded_at: row.recorded_at,
        })
      }
    }
    
    // 按偏差大小排序
    anomalies.sort((a, b) => b.deviation - a.deviation)
    
    // 限制返回条数
    const results = anomalies.slice(0, limit)
    
    if (results.length === 0) {
      console.log(`\n✅ 未发现价格异常数据（所有记录价格和都等于 1）`)
      console.log(`   已扫描 ${rows.length} 条记录`)
      return
    }
    
    console.log(`\n⚠️ 发现 ${results.length} 条价格异常数据 (共扫描 ${rows.length} 条):\n`)
    
    // 统计
    let greaterThanOne = 0
    let lessThanOne = 0
    let maxDeviation = 0
    
    // 输出结果
    console.log('-'.repeat(120))
    console.log(
      'ID'.padEnd(10) +
      'ConditionID'.padEnd(45) +
      '价格和'.padEnd(12) +
      '偏差%'.padEnd(10) +
      'Prices'.padEnd(25) +
      '记录时间'
    )
    console.log('-'.repeat(120))
    
    for (const row of results) {
      const priceSum = row.price_sum
      const deviation = row.deviation * 100
      
      if (priceSum > 1) greaterThanOne++
      else lessThanOne++
      if (deviation > maxDeviation) maxDeviation = deviation
      
      const priceStr = row.prices.map(p => p.toFixed(4)).join(', ')
      const timeStr = new Date(row.recorded_at).toLocaleString('zh-CN')
      
      // 标记方向
      const direction = priceSum > 1 ? '▲' : '▼'
      
      console.log(
        String(row.id).padEnd(10) +
        row.condition_id.substring(0, 42).padEnd(45) +
        `${direction} ${priceSum.toFixed(6)}`.padEnd(12) +
        `${deviation.toFixed(4)}%`.padEnd(10) +
        `[${priceStr}]`.substring(0, 23).padEnd(25) +
        timeStr
      )
    }
    
    console.log('-'.repeat(120))
    
    // 输出统计
    console.log('\n📈 统计摘要:')
    console.log(`  总异常数: ${results.length}`)
    console.log(`  价格和 > 1: ${greaterThanOne} 条 (可做空/铸造卖出)`)
    console.log(`  价格和 < 1: ${lessThanOne} 条 (可做多)`)
    console.log(`  最大偏差: ${maxDeviation.toFixed(4)}%`)
    
    // 按 condition_id 分组统计
    const byCondition = new Map<string, number>()
    for (const row of results) {
      const count = byCondition.get(row.condition_id) || 0
      byCondition.set(row.condition_id, count + 1)
    }
    
    if (byCondition.size < results.length) {
      console.log(`\n📊 按市场分组 (显示前10个):`)
      const sorted = [...byCondition.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      for (const [conditionId, count] of sorted) {
        console.log(`  ${conditionId.substring(0, 50)}: ${count} 条`)
      }
    }
    
  } catch (error: unknown) {
    console.error('\n❌ 执行失败:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
      console.log('\n🔌 数据库连接已关闭')
    }
  }
}

// 运行
checkPriceAnomalies().catch(console.error)
