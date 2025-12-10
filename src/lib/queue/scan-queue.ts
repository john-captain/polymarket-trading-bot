/**
 * 扫描队列
 * 
 * 负责从 Gamma API 获取市场数据，并分发给存储队列和策略分发器
 */

import PQueue from 'p-queue'
import { getGammaClient, generateTraceId } from '@/lib/api-client'
import { getScanConfig, buildGammaApiParams, filterMarkets } from '@/lib/scan-config'
import type {
  QueueConfig,
  QueueStatus,
  QueueState,
  ScanConfig,
  ScanTaskResult,
  MarketData,
  QueueEventListener,
  QueueEvent,
} from './types'
import { DEFAULT_QUEUE_CONFIGS } from './types'
import type { GammaMarket } from '@/lib/api-client'

// ==================== 类型转换 ====================

/**
 * 将 GammaMarket 转换为 MarketData
 */
function toMarketData(market: GammaMarket): MarketData {
  // 解析 outcomes
  let outcomes: string[] = []
  if (typeof market.outcomes === 'string') {
    try {
      outcomes = JSON.parse(market.outcomes)
    } catch {
      outcomes = []
    }
  } else if (Array.isArray(market.outcomes)) {
    outcomes = market.outcomes as unknown as string[]
  }

  // 解析 outcomePrices
  let outcomePrices: number[] = []
  if (typeof market.outcomePrices === 'string') {
    try {
      const parsed = JSON.parse(market.outcomePrices)
      outcomePrices = parsed.map((p: any) => 
        typeof p === 'string' ? parseFloat(p) : p
      )
    } catch {
      outcomePrices = []
    }
  } else if (Array.isArray(market.outcomePrices)) {
    outcomePrices = (market.outcomePrices as unknown as any[]).map(p => 
      typeof p === 'string' ? parseFloat(p) : p
    )
  }

  // 解析 tokens 获取 clobTokenIds
  let clobTokenIds: string[] | undefined
  if (Array.isArray(market.tokens)) {
    clobTokenIds = market.tokens.map(t => t.token_id)
  }

  // 获取市场数据，处理可能的字段名差异
  const marketAny = market as any

  return {
    conditionId: market.conditionId || '',
    question: market.question || '',
    slug: market.slug || '',
    category: market.category,
    outcomes,
    outcomePrices,
    clobTokenIds,
    volume: parseFloat(String(market.volume || market.volumeNum || 0)),
    volume24hr: parseFloat(String(market.volume24hr || marketAny.volume_24hr || 0)),
    liquidity: parseFloat(String(market.liquidity || market.liquidityNum || 0)),
    bestBid: marketAny.bestBid !== undefined ? parseFloat(String(marketAny.bestBid)) : undefined,
    bestAsk: marketAny.bestAsk !== undefined ? parseFloat(String(marketAny.bestAsk)) : undefined,
    spread: marketAny.spread !== undefined ? parseFloat(String(marketAny.spread)) : undefined,
    endDate: market.endDate,
    active: Boolean(market.active),
    closed: Boolean(market.closed),
    restricted: Boolean(market.restricted),
    enableOrderBook: Boolean(market.enableOrderBook),
    image: marketAny.image,
  }
}

// ==================== 扫描队列类 ====================

/**
 * 扫描队列
 */
export class ScanQueue {
  private queue: PQueue
  private config: QueueConfig
  private state: QueueState = 'stopped'
  private processedCount = 0
  private errorCount = 0
  private lastTaskAt: Date | null = null
  private eventListeners: QueueEventListener[] = []
  
  // 回调函数
  private onMarketsScanned?: (markets: MarketData[]) => void | Promise<void>
  private checkBackpressure?: () => boolean

  constructor(config?: Partial<QueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIGS.scan, ...config }
    this.queue = new PQueue({
      concurrency: this.config.concurrency,
      timeout: this.config.timeout,
    })

    // 监听队列事件
    this.queue.on('active', () => {
      if (this.state !== 'stopped' && this.state !== 'paused') {
        this.state = 'running'
      }
    })

    this.queue.on('idle', () => {
      // 不再将状态改为 idle，保持 running 状态让循环继续
      // this.state = 'idle' 会导致扫描循环退出
    })

    this.queue.on('error', (error) => {
      this.errorCount++
      console.error('❌ [ScanQueue] 任务错误:', error)
      this.emitEvent('task:error', { error: error.message })
    })
  }

  /**
   * 设置市场扫描完成回调
   */
  setOnMarketsScanned(callback: (markets: MarketData[]) => void | Promise<void>): void {
    this.onMarketsScanned = callback
  }

  /**
   * 设置背压检查函数
   */
  setBackpressureCheck(check: () => boolean): void {
    this.checkBackpressure = check
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: QueueEventListener): void {
    this.eventListeners.push(listener)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: QueueEventListener): void {
    const index = this.eventListeners.indexOf(listener)
    if (index !== -1) {
      this.eventListeners.splice(index, 1)
    }
  }

  /**
   * 发送事件
   */
  private emitEvent(type: QueueEvent['type'], data?: any): void {
    const event: QueueEvent = {
      type,
      queue: 'scan',
      data,
      timestamp: new Date(),
    }
    this.eventListeners.forEach(listener => listener(event))
  }

  /**
   * 执行单次扫描
   */
  async scan(scanConfig?: ScanConfig): Promise<ScanTaskResult> {
    const startTime = Date.now()
    const config = scanConfig || getScanConfig()
    const traceId = generateTraceId()
    const context = { traceId, source: 'scan-queue' }
    
    const maxMarkets = config.limit * config.maxPages
    console.log(`🔍 [ScanQueue] 开始扫描`)
    console.log(`   配置: 每页=${config.limit}条, 最大页数=${config.maxPages}, 理论最大=${maxMarkets}个市场`)
    
    try {
      const gamma = getGammaClient()
      const allMarkets: MarketData[] = []
      let page = 1
      let offset = 0
      let hasMore = true
      while (hasMore && page <= config.maxPages) {
        // 检查背压
        if (this.checkBackpressure?.()) {
          console.log('⏸️ [ScanQueue] 存储队列繁忙，等待...')
          await this.sleep(1000)
          continue
        }

        // 构建 API 参数
        const params = buildGammaApiParams(config, offset)
        
        // 获取市场数据
        const response = await gamma.getMarkets(params, context)
        
        if (!response.success) {
          console.error(`❌ [ScanQueue] 获取第 ${page} 页失败:`, response.error)
          // API 失败时，等待后重试一次
          await this.sleep(2000)
          const retryResponse = await gamma.getMarkets(params, context)
          if (!retryResponse.success) {
            console.error(`❌ [ScanQueue] 重试失败，停止扫描，已获取 ${allMarkets.length} 条`)
            break
          }
          // 重试成功，使用重试结果
          Object.assign(response, retryResponse)
        }

        const rawMarkets = response.data || []
        
        // 转换为 MarketData
        const markets = rawMarkets.map(toMarketData)
        
        // 应用过滤
        const filteredMarkets = filterMarkets(markets, config)
        
        allMarkets.push(...filteredMarkets)
        
        // 每 10 页输出一次进度
        if (page % 10 === 0 || rawMarkets.length < config.limit) {
          console.log(`📊 [ScanQueue] 第 ${page}/${config.maxPages} 页: 获取 ${rawMarkets.length} 条，过滤后 ${filteredMarkets.length} 条，累计 ${allMarkets.length} 条`)
        }

        // 检查是否还有更多
        if (rawMarkets.length < config.limit) {
          console.log(`📋 [ScanQueue] 已到达数据末尾 (本页仅 ${rawMarkets.length}/${config.limit} 条)`)
          hasMore = false
        } else if (page >= config.maxPages) {
          console.log(`📋 [ScanQueue] 已达到最大页数限制 (${config.maxPages} 页)`)
          hasMore = false
        } else {
          offset += config.limit
          page++
          // 添加 10 秒延迟避免限速和服务器压力
          console.log(`⏳ [ScanQueue] 等待 10 秒后继续下一页...`)
          await this.sleep(10000)
        }
      }

      const duration = Date.now() - startTime
      this.processedCount++
      this.lastTaskAt = new Date()

      // 回调处理
      if (this.onMarketsScanned && allMarkets.length > 0) {
        await this.onMarketsScanned(allMarkets)
      }

      const result: ScanTaskResult = {
        marketCount: allMarkets.length,
        pageCount: page,
        duration,
      }

      console.log(`✅ [ScanQueue] 扫描完成: ${allMarkets.length} 个市场, ${page} 页, 耗时 ${(duration / 1000).toFixed(1)}秒`)
      this.emitEvent('scan:complete', result)

      return result
    } catch (error) {
      this.errorCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('❌ [ScanQueue] 扫描失败:', errorMsg)
      
      return {
        marketCount: 0,
        pageCount: 0,
        duration: Date.now() - startTime,
        error: errorMsg,
      }
    }
  }

  /**
   * 添加扫描任务到队列
   */
  addScanTask(scanConfig?: ScanConfig): Promise<ScanTaskResult> {
    return this.queue.add(() => this.scan(scanConfig)) as Promise<ScanTaskResult>
  }

  /**
   * 启动循环扫描
   */
  start(): void {
    if (this.state === 'running') {
      console.log('⚠️ [ScanQueue] 扫描已在运行中')
      return
    }

    this.state = 'running'
    console.log('🚀 [ScanQueue] 启动循环扫描')
    
    // 立即执行一次
    this.runScanLoop()
  }

  /**
   * 扫描循环 - 持续运行
   */
  private async runScanLoop(): Promise<void> {
    while (this.state === 'running') {
      try {
        console.log('🔄 [ScanQueue] 开始新一轮扫描...')
        await this.addScanTask()
      } catch (error) {
        console.error('❌ [ScanQueue] 扫描循环错误:', error)
      }

      // 等待间隔后继续下一轮
      if (this.state === 'running') {
        const config = getScanConfig()
        console.log(`⏰ [ScanQueue] 等待 ${config.scanInterval / 1000} 秒后开始下一轮扫描...`)
        await this.sleep(config.scanInterval)
      }
    }
    
    console.log('🛑 [ScanQueue] 扫描循环已退出，当前状态:', this.state)
  }

  /**
   * 停止扫描
   */
  stop(): void {
    console.log('🛑 [ScanQueue] 停止扫描')
    this.state = 'stopped'
    this.queue.clear()
  }

  /**
   * 暂停扫描
   */
  pause(): void {
    console.log('⏸️ [ScanQueue] 暂停扫描')
    this.state = 'paused'
    this.queue.pause()
  }

  /**
   * 恢复扫描
   */
  resume(): void {
    if (this.state !== 'paused') {
      console.log('⚠️ [ScanQueue] 队列未处于暂停状态')
      return
    }

    console.log('▶️ [ScanQueue] 恢复扫描')
    this.state = 'running'
    this.queue.start()
    this.runScanLoop()
  }

  /**
   * 获取队列状态
   */
  getStatus(): QueueStatus {
    return {
      name: 'scan',
      size: this.queue.size,
      pending: this.queue.pending,
      maxSize: this.config.maxSize,
      state: this.state,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      lastTaskAt: this.lastTaskAt,
    }
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.processedCount = 0
    this.errorCount = 0
  }

  /**
   * 辅助睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== 单例导出 ====================

// 使用 globalThis 防止开发模式热重载时丢失状态
const globalForScanQueue = globalThis as unknown as {
  scanQueueInstance: ScanQueue | undefined
}

/**
 * 获取扫描队列单例
 */
export function getScanQueue(): ScanQueue {
  if (!globalForScanQueue.scanQueueInstance) {
    globalForScanQueue.scanQueueInstance = new ScanQueue()
    console.log('✅ [ScanQueue] 扫描队列已初始化')
  }
  return globalForScanQueue.scanQueueInstance
}

/**
 * 重置扫描队列单例 (用于测试)
 */
export function resetScanQueue(): void {
  if (globalForScanQueue.scanQueueInstance) {
    globalForScanQueue.scanQueueInstance.stop()
    globalForScanQueue.scanQueueInstance = undefined
  }
}

