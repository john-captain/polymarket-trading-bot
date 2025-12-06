/**
 * 存储队列
 * 
 * 负责将市场数据批量写入 MySQL 数据库
 * 支持批量合并、去重、背压控制
 */

import PQueue from 'p-queue'
import { batchUpsertMarkets } from '@/lib/database'
import type { MarketRecord } from '@/lib/database'
import type {
  QueueConfig,
  QueueStatus,
  QueueState,
  MarketData,
  QueueEventType,
} from './types'
import { DEFAULT_QUEUE_CONFIGS } from './types'

// ==================== 类型定义 ====================

export interface StorageTaskResult {
  batchId: string
  inserted: number
  updated: number
  failed: number
  duration: number
  errors?: string[]
}

// 简化的事件监听器类型 (内部使用)
type SimpleEventListener = (data: any) => void

// ==================== 类型转换 ====================

/**
 * 将 MarketData 转换为 MarketRecord (数据库格式)
 */
function toMarketRecord(market: MarketData): MarketRecord {
  return {
    conditionId: market.conditionId,
    question: market.question,
    slug: market.slug,
    category: market.category,
    
    // outcomes 和 prices 转为 JSON
    outcomes: JSON.stringify(market.outcomes),
    outcomePrices: JSON.stringify(market.outcomePrices),
    tokens: market.clobTokenIds ? JSON.stringify(market.clobTokenIds) : '[]',
    
    // 数值字段
    volume: market.volume,
    volume24hr: market.volume24hr,
    liquidity: market.liquidity,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    spread: market.spread,
    
    // 日期
    endDate: market.endDate,
    
    // 状态
    active: market.active,
    closed: market.closed,
    restricted: market.restricted ?? false,
    enableOrderBook: market.enableOrderBook,
    
    // 媒体
    image: market.image,
  }
}

// ==================== 存储队列类 ====================

export class StorageQueue {
  private queue: PQueue
  private config: QueueConfig
  private state: QueueState = 'idle'

  // 批量缓冲区
  private buffer: MarketData[] = []
  private bufferLock = false
  private flushTimer: NodeJS.Timeout | null = null

  // 统计
  private totalBatches = 0
  private totalRecords = 0
  private insertedRecords = 0
  private updatedRecords = 0
  private failedRecords = 0
  private errorCount = 0

  // 事件监听 (使用简化的字符串事件类型)
  private eventListeners: Map<QueueEventType, SimpleEventListener[]> = new Map()

  // 配置
  private batchSize: number
  private flushInterval: number
  private maxBufferSize: number

  constructor(config?: Partial<QueueConfig> & {
    batchSize?: number
    flushInterval?: number
    maxBufferSize?: number
  }) {
    this.config = { ...DEFAULT_QUEUE_CONFIGS.storage, ...config }
    this.batchSize = config?.batchSize ?? 50      // 每批次最大记录数
    this.flushInterval = config?.flushInterval ?? 5000  // 刷新间隔 (ms)
    this.maxBufferSize = config?.maxBufferSize ?? 500   // 缓冲区最大容量

    this.queue = new PQueue({
      concurrency: this.config.concurrency,
      timeout: this.config.timeout,
    })

    // 监听队列事件
    this.queue.on('idle', () => {
      if (this.state === 'running' && this.buffer.length === 0) {
        this.state = 'idle'
      }
    })

    this.queue.on('error', (error) => {
      this.errorCount++
      console.error('❌ [StorageQueue] 批次保存错误:', error)
      this.emitEvent('task:error', { error: error.message })
    })
  }

  /**
   * 添加市场数据到缓冲区
   */
  async add(markets: MarketData[]): Promise<void> {
    if (this.state === 'stopped') {
      console.warn('⚠️ [StorageQueue] 队列已停止，忽略新数据')
      return
    }

    // 去重并添加到缓冲区
    const newMarkets = markets.filter(m => 
      !this.buffer.some(b => b.conditionId === m.conditionId)
    )

    this.buffer.push(...newMarkets)
    this.totalRecords += newMarkets.length

    console.log(`📥 [StorageQueue] 添加 ${newMarkets.length} 条记录到缓冲区 (当前: ${this.buffer.length})`)

    // 检查是否需要立即刷新
    if (this.buffer.length >= this.batchSize) {
      await this.flush()
    }
  }

  /**
   * 刷新缓冲区 - 将数据写入数据库
   */
  async flush(): Promise<StorageTaskResult | null> {
    // 防止并发刷新
    if (this.bufferLock || this.buffer.length === 0) {
      return null
    }

    this.bufferLock = true
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startTime = Date.now()

    try {
      // 取出缓冲区数据
      const batch = this.buffer.splice(0, this.batchSize)
      const records = batch.map(toMarketRecord)

      console.log(`💾 [StorageQueue] 开始保存批次 ${batchId} (${records.length} 条)`)
      this.state = 'running'
      this.emitEvent('task:start', { batchId, count: records.length })

      // 执行批量写入
      const result = await this.queue.add(async () => {
        return await batchUpsertMarkets(records)
      })

      const duration = Date.now() - startTime
      const taskResult: StorageTaskResult = {
        batchId,
        inserted: result?.inserted ?? 0,
        updated: result?.updated ?? 0,
        failed: 0,
        duration,
      }

      this.totalBatches++
      this.insertedRecords += taskResult.inserted
      this.updatedRecords += taskResult.updated

      console.log(
        `✅ [StorageQueue] 批次 ${batchId} 完成: ` +
        `新增 ${taskResult.inserted}, 更新 ${taskResult.updated}, 耗时 ${duration}ms`
      )

      this.emitEvent('task:complete', taskResult)
      return taskResult
    } catch (error) {
      this.errorCount++
      this.failedRecords += this.batchSize
      console.error(`❌ [StorageQueue] 批次 ${batchId} 失败:`, error)
      this.emitEvent('task:error', { 
        batchId, 
        error: error instanceof Error ? error.message : String(error) 
      })
      return null
    } finally {
      this.bufferLock = false
    }
  }

  /**
   * 启动定时刷新
   */
  start(): void {
    if (this.state === 'running') {
      console.warn('⚠️ [StorageQueue] 队列已在运行')
      return
    }

    this.state = 'running'
    this.emitEvent('queue:start', {})

    // 启动定时刷新
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.bufferLock) {
        await this.flush()
      }
    }, this.flushInterval)

    console.log(`🚀 [StorageQueue] 已启动，刷新间隔 ${this.flushInterval}ms`)
  }

  /**
   * 停止队列 (等待剩余任务完成)
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return
    }

    console.log('⏹️ [StorageQueue] 正在停止...')

    // 停止定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // 刷新剩余数据
    while (this.buffer.length > 0) {
      await this.flush()
    }

    // 等待队列清空
    await this.queue.onIdle()

    this.state = 'stopped'
    this.emitEvent('queue:stop', {})
    console.log('⏹️ [StorageQueue] 已停止')
  }

  /**
   * 暂停队列
   */
  pause(): void {
    if (this.state === 'paused') {
      return
    }
    this.queue.pause()
    this.state = 'paused'
    
    // 暂停定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    console.log('⏸️ [StorageQueue] 已暂停')
    this.emitEvent('queue:pause', {})
  }

  /**
   * 恢复队列
   */
  resume(): void {
    if (this.state !== 'paused') {
      return
    }
    this.queue.start()
    this.state = 'running'

    // 重启定时器
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.bufferLock) {
        await this.flush()
      }
    }, this.flushInterval)

    console.log('▶️ [StorageQueue] 已恢复')
    this.emitEvent('queue:resume', {})
  }

  /**
   * 清空缓冲区 (不写入数据库)
   */
  clear(): void {
    const count = this.buffer.length
    this.buffer = []
    console.log(`🗑️ [StorageQueue] 已清空 ${count} 条缓冲数据`)
  }

  /**
   * 获取队列状态
   */
  getStatus(): {
    state: QueueState
    pending: number
    size: number
    completed: number
    failed: number
  } {
    return {
      state: this.state,
      pending: this.queue.pending,
      size: this.queue.size,
      completed: this.totalBatches,
      failed: this.errorCount,
    }
  }

  /**
   * 获取详细统计
   */
  getStats(): {
    bufferSize: number
    totalBatches: number
    totalRecords: number
    insertedRecords: number
    updatedRecords: number
    failedRecords: number
    errorCount: number
  } {
    return {
      bufferSize: this.buffer.length,
      totalBatches: this.totalBatches,
      totalRecords: this.totalRecords,
      insertedRecords: this.insertedRecords,
      updatedRecords: this.updatedRecords,
      failedRecords: this.failedRecords,
      errorCount: this.errorCount,
    }
  }

  /**
   * 检查是否有背压 (缓冲区接近满)
   */
  hasBackpressure(): boolean {
    return this.buffer.length >= this.maxBufferSize * 0.8
  }

  /**
   * 检查缓冲区是否已满
   */
  isBufferFull(): boolean {
    return this.buffer.length >= this.maxBufferSize
  }

  /**
   * 获取缓冲区使用率
   */
  getBufferUsage(): number {
    return this.buffer.length / this.maxBufferSize
  }

  /**
   * 添加事件监听器
   */
  on(event: QueueEventType, listener: SimpleEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.push(listener)
    this.eventListeners.set(event, listeners)
  }

  /**
   * 移除事件监听器
   */
  off(event: QueueEventType, listener: SimpleEventListener): void {
    const listeners = this.eventListeners.get(event) || []
    const index = listeners.indexOf(listener)
    if (index !== -1) {
      listeners.splice(index, 1)
      this.eventListeners.set(event, listeners)
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: QueueEventType, data: any): void {
    const listeners = this.eventListeners.get(event) || []
    for (const listener of listeners) {
      try {
        listener(data)
      } catch (error) {
        console.error(`❌ [StorageQueue] 事件监听器错误 (${event}):`, error)
      }
    }
  }
}

// ==================== 单例导出 ====================

let storageQueueInstance: StorageQueue | null = null

/**
 * 获取存储队列单例
 */
export function getStorageQueue(): StorageQueue {
  if (!storageQueueInstance) {
    storageQueueInstance = new StorageQueue()
  }
  return storageQueueInstance
}

/**
 * 重置存储队列单例 (用于测试)
 */
export function resetStorageQueue(): void {
  if (storageQueueInstance) {
    storageQueueInstance.stop()
    storageQueueInstance = null
  }
}
