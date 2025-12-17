/**
 * 价格队列
 * 
 * 从 markets 表循环获取 token_ids，调用 CLOB API 获取精确买卖价格
 * 将价格数据存储到 market_prices 表
 * 
 * 注意：使用 ApiClient 基类（支持代理），不使用官方 SDK
 */

import PQueue from 'p-queue'
import { getPool } from '@/lib/database'
import { generateTraceId } from '@/lib/api-client'
import { ApiClient } from '@/lib/api-client/base'
import type {
  QueueConfig,
  QueueState,
} from './types'

// ==================== CLOB 价格客户端 ====================

const CLOB_API_URL = process.env.CLOB_API_URL || 'https://clob.polymarket.com'

/**
 * CLOB 价格客户端 - 继承 ApiClient，支持代理
 */
class ClobPriceClient extends ApiClient {
  constructor() {
    super('CLOB', {
      baseUrl: CLOB_API_URL,
      timeout: 30000,
      enableLogging: false, // 价格查询太多，不记录日志
    })
  }

  /**
   * 获取单个 token 的价格
   */
  async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> {
    try {
      const response = await this.get<{ price: string }>('/price', {
        params: { token_id: tokenId, side },
      })
      
      if (response.success && response.data && response.data.price) {
        const price = parseFloat(response.data.price)
        // 检查是否为有效数字，避免 NaN 进入数据库
        if (isNaN(price) || !isFinite(price)) {
          return null
        }
        return price
      }
      return null
    } catch (err) {
      return null
    }
  }
}

// 单例
let clobPriceClient: ClobPriceClient | null = null

function getClobPriceClient(): ClobPriceClient {
  if (!clobPriceClient) {
    clobPriceClient = new ClobPriceClient()
  }
  return clobPriceClient
}

// ==================== 类型定义 ====================

/**
 * 价格队列配置
 */
export interface PriceQueueConfig {
  /** 每批获取的市场数量 */
  batchSize: number
  /** 每个 token 获取价格的间隔 (毫秒) */
  tokenInterval: number
  /** 批次之间的间隔 (毫秒) */
  batchInterval: number
  /** 扫描间隔 (毫秒) - 完成一轮后等待时间 */
  scanInterval: number
  /** 只获取活跃市场 */
  activeOnly: boolean
  /** 最小流动性筛选 */
  minLiquidity: number
}

/**
 * 默认价格队列配置
 */
export const DEFAULT_PRICE_CONFIG: PriceQueueConfig = {
  batchSize: 10,           // 每批 10 个 token
  tokenInterval: 100,      // 每个 token 间隔 100ms
  batchInterval: 1000,     // 批次间隔 1s
  scanInterval: 60000,     // 1 分钟一轮
  activeOnly: true,        // 只获取活跃市场
  minLiquidity: 100,       // 最小流动性 $100
}

/**
 * 市场 Token 信息
 */
interface MarketToken {
  conditionId: string
  tokenId: string
  outcome: string
  outcomeIndex: number
}

/**
 * 价格数据 - 独立的 CLOB 价格，不关联 Gamma
 */
interface PriceData {
  tokenId: string
  conditionId: string
  outcome: string
  outcomeIndex: number
  buyPrice: number | null
  sellPrice: number | null
  midPrice: number | null
  spread: number | null
  spreadPct: number | null
}

/**
 * 价格任务结果
 */
export interface PriceTaskResult {
  success: boolean
  totalMarkets: number
  totalTokens: number
  fetchedCount: number
  errorCount: number
  savedCount: number
  duration: number
  errors: string[]
}

/**
 * 队列状态
 */
export interface PriceQueueStatus {
  state: QueueState
  size: number
  pending: number
  processedCount: number
  errorCount: number
  lastTaskAt: string | null
  config: PriceQueueConfig
  stats: {
    totalMarkets: number
    totalTokens: number
    lastFetchedCount: number
    lastErrorCount: number
    lastDuration: number
  }
}

// ==================== 价格队列类 ====================

/**
 * 价格队列
 * 从 markets 表获取 token_ids，调用 CLOB API 获取精确价格
 * 连续循环模式：一轮完成后立即开始下一轮
 */
export class PriceQueue {
  private queue: PQueue
  private queueConfig: QueueConfig
  private priceConfig: PriceQueueConfig
  private state: QueueState = 'idle'
  private processedCount = 0
  private errorCount = 0
  private lastTaskAt: Date | null = null
  private isScanning = false
  
  // 统计
  private stats = {
    totalMarkets: 0,
    totalTokens: 0,
    lastFetchedCount: 0,
    lastErrorCount: 0,
    lastDuration: 0,
  }

  constructor(
    queueConfig?: Partial<QueueConfig>,
    priceConfig?: Partial<PriceQueueConfig>
  ) {
    // 创建价格队列的默认配置
    const defaultQueueConfig: QueueConfig = {
      name: 'price',
      concurrency: 1,
      maxSize: 1,
      timeout: 600000, // 10 分钟超时
      autoStart: false,
    }

    this.queueConfig = { ...defaultQueueConfig, ...queueConfig }
    this.priceConfig = { ...DEFAULT_PRICE_CONFIG, ...priceConfig }

    this.queue = new PQueue({
      concurrency: this.queueConfig.concurrency,
    })

    console.log('✅ [PriceQueue] 价格队列已初始化', {
      batchSize: this.priceConfig.batchSize,
      scanInterval: `${this.priceConfig.scanInterval / 1000}s`,
    })
  }

  // ==================== 生命周期 ====================

  /**
   * 启动队列 - 连续循环模式
   * 一轮完成后立即开始下一轮
   */
  async start(): Promise<void> {
    if (this.state === 'running') {
      console.log('⚠️ [PriceQueue] 队列已在运行')
      return
    }

    this.state = 'running'
    console.log('🚀 [PriceQueue] 价格队列已启动（连续循环模式）')
    
    // 启动循环扫描
    this.runContinuousLoop()
  }

  /**
   * 停止队列
   */
  async stop(): Promise<void> {
    this.state = 'stopped'
    this.queue.pause()
    this.queue.clear()
    console.log('⏹️ [PriceQueue] 价格队列已停止')
  }

  /**
   * 暂停队列
   */
  pause(): void {
    this.state = 'paused'
    this.queue.pause()
    console.log('⏸️ [PriceQueue] 价格队列已暂停')
  }

  /**
   * 恢复队列
   */
  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'running'
    this.queue.start()
    // 恢复后继续循环
    this.runContinuousLoop()
    console.log('▶️ [PriceQueue] 价格队列已恢复')
  }

  // ==================== 扫描逻辑 ====================

  /**
   * 连续循环扫描
   * 一轮完成后立即开始下一轮
   */
  private async runContinuousLoop(): Promise<void> {
    while (this.state === 'running') {
      try {
        await this.runScan()
        
        // 短暂休息避免 CPU 占用过高
        if (this.state === 'running') {
          await this.sleep(1000) // 1 秒后开始下一轮
        }
      } catch (err) {
        console.error('❌ [PriceQueue] 循环扫描出错:', err)
        // 出错后等待 5 秒再重试
        await this.sleep(5000)
      }
    }
    console.log('🔄 [PriceQueue] 循环已停止')
  }

  /**
   * 执行一轮扫描
   */
  async runScan(): Promise<PriceTaskResult> {
    if (this.isScanning) {
      return {
        success: false,
        totalMarkets: 0,
        totalTokens: 0,
        fetchedCount: 0,
        errorCount: 0,
        savedCount: 0,
        duration: 0,
        errors: ['扫描正在进行中'],
      }
    }

    this.isScanning = true
    const startTime = Date.now()
    const errors: string[] = []
    let fetchedCount = 0
    let errorCount = 0
    let savedCount = 0

    console.log('🔍 [PriceQueue] 开始获取价格...')

    try {
      // 1. 从数据库获取市场列表
      const markets = await this.getMarketsFromDb()
      this.stats.totalMarkets = markets.length
      
      // 2. 提取所有 tokens，并限制数量
      let tokens = this.extractTokens(markets)
      this.stats.totalTokens = tokens.length

      // 限制只获取前 N 个 token (batchSize 作为总限制)
      const maxTokens = this.priceConfig.batchSize
      if (tokens.length > maxTokens) {
        console.log(`📊 [PriceQueue] 限制获取前 ${maxTokens} 个 tokens (共 ${tokens.length} 个)`)
        tokens = tokens.slice(0, maxTokens)
      }

      console.log(`📊 [PriceQueue] 获取到 ${markets.length} 个市场, 处理 ${tokens.length} 个 tokens`)

      if (tokens.length === 0) {
        return {
          success: true,
          totalMarkets: markets.length,
          totalTokens: 0,
          fetchedCount: 0,
          errorCount: 0,
          savedCount: 0,
          duration: Date.now() - startTime,
          errors: [],
        }
      }

      // 3. 分批获取价格 (使用 ClobPriceClient，支持代理)
      const priceClient = getClobPriceClient()
      const batchSize = this.priceConfig.batchSize
      const prices: PriceData[] = []

      for (let i = 0; i < tokens.length; i += batchSize) {
        // 只有在 stopped 状态时才中断，其他状态（包括 idle）继续执行
        if (this.state === 'stopped') {
          console.log('⏹️ [PriceQueue] 扫描被中断')
          break
        }

        const batch = tokens.slice(i, i + batchSize)
        console.log(`📦 [PriceQueue] 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(tokens.length / batchSize)} (${batch.length} tokens)`)

        // 逐个获取价格 (CLOB API 限速)
        for (const token of batch) {
          try {
            // 使用 ClobPriceClient 获取价格 (支持代理)
            const [buyPrice, sellPrice] = await Promise.all([
              priceClient.getPrice(token.tokenId, 'BUY'),
              priceClient.getPrice(token.tokenId, 'SELL'),
            ])

            // 计算中点价格和价差
            let midPrice: number | null = null
            let spread: number | null = null
            let spreadPct: number | null = null

            if (buyPrice !== null && sellPrice !== null) {
              midPrice = (buyPrice + sellPrice) / 2
              spread = sellPrice - buyPrice
              spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : null
            }

            prices.push({
              tokenId: token.tokenId,
              conditionId: token.conditionId,
              outcome: token.outcome,
              outcomeIndex: token.outcomeIndex,
              buyPrice,
              sellPrice,
              midPrice,
              spread,
              spreadPct,
            })

            fetchedCount++
          } catch (err: any) {
            errorCount++
            errors.push(`Token ${token.tokenId}: ${err.message}`)
          }

          // Token 间隔
          if (this.priceConfig.tokenInterval > 0) {
            await this.sleep(this.priceConfig.tokenInterval)
          }
        }

        // 批次间隔
        if (i + batchSize < tokens.length && this.priceConfig.batchInterval > 0) {
          await this.sleep(this.priceConfig.batchInterval)
        }
      }

      // 4. 批量保存到数据库
      if (prices.length > 0) {
        savedCount = await this.savePrices(prices)
      }

      this.stats.lastFetchedCount = fetchedCount
      this.stats.lastErrorCount = errorCount
      this.stats.lastDuration = Date.now() - startTime
      this.processedCount++
      this.lastTaskAt = new Date()

      console.log(`✅ [PriceQueue] 扫描完成: 获取 ${fetchedCount} 个价格, 保存 ${savedCount} 条, 错误 ${errorCount} 个, 耗时 ${this.stats.lastDuration}ms`)

      return {
        success: true,
        totalMarkets: markets.length,
        totalTokens: tokens.length,
        fetchedCount,
        errorCount,
        savedCount,
        duration: this.stats.lastDuration,
        errors: errors.slice(0, 10), // 只返回前 10 个错误
      }
    } catch (err: any) {
      this.errorCount++
      console.error('❌ [PriceQueue] 扫描失败:', err)
      return {
        success: false,
        totalMarkets: 0,
        totalTokens: 0,
        fetchedCount,
        errorCount: errorCount + 1,
        savedCount,
        duration: Date.now() - startTime,
        errors: [err.message, ...errors.slice(0, 9)],
      }
    } finally {
      this.isScanning = false
    }
  }

  // ==================== 数据库操作 ====================

  /**
   * 从数据库获取市场列表
   * 只需要 tokens 字段（包含 token_ids）和 outcomes 字段
   * Gamma 价格不需要，因为我们独立获取 CLOB 价格
   */
  private async getMarketsFromDb(): Promise<Array<{
    conditionId: string
    tokens: string
    outcomes: string
  }>> {
    const pool = getPool()
    
    let sql = `
      SELECT 
        condition_id as conditionId,
        tokens,
        outcomes
      FROM markets
      WHERE enable_order_book = 1
        AND tokens IS NOT NULL
        AND tokens != '[]'
    `
    const params: any[] = []

    if (this.priceConfig.activeOnly) {
      sql += ' AND active = 1 AND closed = 0'
    }

    // 注意：liquidity 在 market_price_history 表，这里暂时跳过流动性筛选
    // 或者可以 JOIN market_price_history 获取最新流动性

    sql += ' ORDER BY condition_id'

    const [rows] = await pool.execute(sql, params)
    return rows as any[]
  }

  /**
   * 从市场数据中提取所有 tokens
   * 不再需要 Gamma 价格，独立获取 CLOB 精确价格
   */
  private extractTokens(markets: Array<{
    conditionId: string
    tokens: string
    outcomes: string
  }>): MarketToken[] {
    const tokens: MarketToken[] = []

    for (const market of markets) {
      try {
        // 解析 tokens
        let tokenIds: string[] = []
        if (market.tokens) {
          const parsed = typeof market.tokens === 'string' 
            ? JSON.parse(market.tokens) 
            : market.tokens
          
          if (Array.isArray(parsed)) {
            // 格式可能是 [{ token_id: "..." }] 或 ["..."]
            tokenIds = parsed.map((t: any) => 
              typeof t === 'string' ? t : t.token_id
            )
          }
        }

        // 解析 outcomes
        let outcomes: string[] = []
        if (market.outcomes) {
          outcomes = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes)
            : market.outcomes
        }

        // 组合 (独立获取 CLOB 价格)
        for (let i = 0; i < tokenIds.length; i++) {
          tokens.push({
            conditionId: market.conditionId,
            tokenId: tokenIds[i],
            outcome: outcomes[i] || `Outcome ${i}`,
            outcomeIndex: i,
          })
        }
      } catch (err) {
        console.warn(`⚠️ [PriceQueue] 解析市场 ${market.conditionId} tokens 失败:`, err)
      }
    }

    return tokens
  }

  /**
   * 批量保存价格到数据库
   */
  private async savePrices(prices: PriceData[]): Promise<number> {
    console.log(`📝 [PriceQueue] savePrices 收到 ${prices.length} 条数据`)
    if (prices.length === 0) return 0

    const pool = getPool()
    
    // 过滤掉无效数据（至少需要有 buyPrice 或 sellPrice）
    const validPrices = prices.filter(p => {
      // 检查必要字段
      if (!p.conditionId || !p.tokenId) return false
      // 至少需要一个有效价格
      if (p.buyPrice === null && p.sellPrice === null) return false
      // 确保数值字段不是 NaN
      const hasNaN = [p.buyPrice, p.sellPrice, p.midPrice, p.spread, p.spreadPct]
        .some(v => typeof v === 'number' && (isNaN(v) || !isFinite(v)))
      return !hasNaN
    })

    if (validPrices.length === 0) {
      console.log('⚠️ [PriceQueue] 没有有效价格数据可保存')
      return 0
    }

    if (validPrices.length < prices.length) {
      console.log(`⚠️ [PriceQueue] 过滤掉 ${prices.length - validPrices.length} 条无效数据`)
    }
    
    // 使用 INSERT IGNORE 只插入新数据，忽略已存在的记录
    const sql = `
      INSERT IGNORE INTO market_prices 
        (condition_id, token_id, outcome, outcome_index, 
         buy_price, sell_price, mid_price, spread, spread_pct, fetched_at)
      VALUES ?
    `

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const values = validPrices.map(p => [
      p.conditionId,
      p.tokenId,
      p.outcome,
      p.outcomeIndex,
      p.buyPrice,
      p.sellPrice,
      p.midPrice,
      p.spread,
      p.spreadPct,
      now,
    ])

    try {
      console.log(`📝 [PriceQueue] 准备插入 ${values.length} 条数据`)
      const [result] = await pool.query(sql, [values])
      const affected = (result as any).affectedRows || 0
      console.log(`📝 [PriceQueue] 插入完成, affectedRows: ${affected}`)
      return affected
    } catch (err: any) {
      console.error('❌ [PriceQueue] 保存价格失败:', err.message)
      throw err
    }
  }

  // ==================== 状态查询 ====================

  /**
   * 获取队列状态
   */
  getStatus(): PriceQueueStatus {
    return {
      state: this.state,
      size: this.queue.size,
      pending: this.queue.pending,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      lastTaskAt: this.lastTaskAt?.toISOString() || null,
      config: this.priceConfig,
      stats: { ...this.stats },
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PriceQueueConfig>): void {
    this.priceConfig = { ...this.priceConfig, ...config }
    console.log('⚙️ [PriceQueue] 配置已更新:', this.priceConfig)
  }

  // ==================== 工具方法 ====================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== 单例管理 ====================

let priceQueueInstance: PriceQueue | null = null

/**
 * 获取价格队列单例
 * 首次调用时自动启动队列
 */
export function getPriceQueue(): PriceQueue {
  if (!priceQueueInstance) {
    priceQueueInstance = new PriceQueue()
    // 自动启动队列（异步执行，不阻塞）
    priceQueueInstance.start().catch(err => {
      console.error('❌ [PriceQueue] 自动启动失败:', err)
    })
  }
  return priceQueueInstance
}

/**
 * 重置价格队列
 */
export async function resetPriceQueue(): Promise<void> {
  if (priceQueueInstance) {
    await priceQueueInstance.stop()
    priceQueueInstance = null
  }
}
