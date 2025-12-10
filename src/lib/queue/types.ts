/**
 * 队列系统类型定义
 * 包含队列配置、状态、任务类型等
 */

// ==================== 队列配置类型 ====================

/**
 * 队列配置
 */
export interface QueueConfig {
  /** 队列名称 */
  name: string
  /** 并发数 */
  concurrency: number
  /** 最大容量 */
  maxSize: number
  /** 任务超时时间 (毫秒) */
  timeout: number
  /** 背压阈值 (百分比 0-1) */
  backpressureThreshold?: number
  /** 是否自动启动 */
  autoStart?: boolean
}

/**
 * 默认队列配置
 */
export const DEFAULT_QUEUE_CONFIGS: Record<QueueName, QueueConfig> = {
  scan: {
    name: 'scan',
    concurrency: 1,
    maxSize: 1,
    timeout: 120000,
    autoStart: false,
  },
  storage: {
    name: 'storage',
    concurrency: 10,
    maxSize: 5000,
    timeout: 10000,
    backpressureThreshold: 0.8,
  },
  mintSplit: {
    name: 'mintSplit',
    concurrency: 1,
    maxSize: 100,
    timeout: 30000,
  },
  arbitrage: {
    name: 'arbitrage',
    concurrency: 1,
    maxSize: 100,
    timeout: 30000,
  },
  marketMaking: {
    name: 'marketMaking',
    concurrency: 1,
    maxSize: 100,
    timeout: 30000,
  },
  order: {
    name: 'order',
    concurrency: 1,
    maxSize: 50,
    timeout: 60000,
  },
}

// ==================== 队列状态类型 ====================

/**
 * 队列名称
 */
export type QueueName = 'scan' | 'storage' | 'mintSplit' | 'arbitrage' | 'marketMaking' | 'order'

/**
 * 队列运行状态
 */
export type QueueState = 'idle' | 'running' | 'paused' | 'stopped'

/**
 * 单个队列状态
 */
export interface QueueStatus {
  /** 队列名称 */
  name: QueueName
  /** 当前队列大小 */
  size: number
  /** 等待处理数量 */
  pending: number
  /** 最大容量 */
  maxSize: number
  /** 运行状态 */
  state: QueueState
  /** 已处理任务数 */
  processedCount: number
  /** 错误数 */
  errorCount: number
  /** 最后任务时间 */
  lastTaskAt: Date | null
}

/**
 * 所有队列状态
 */
export interface AllQueueStatus {
  scan: QueueStatus
  storage: QueueStatus
  mintSplit: QueueStatus
  arbitrage: QueueStatus
  marketMaking: QueueStatus
  order: QueueStatus
}

// ==================== 扫描配置类型 ====================

/**
 * 排序配置
 */
export interface OrderConfig {
  order: string
  ascending: boolean
}

/**
 * 排序选项映射
 */
export const ORDER_MAPPINGS: Record<string, OrderConfig> = {
  volume: { order: 'volume', ascending: false },
  liquidity: { order: 'liquidity', ascending: false },
  volume24hr: { order: 'volume24hr', ascending: false },
  volume1wk: { order: 'volume1wk', ascending: false },
  end_date_asc: { order: 'endDate', ascending: true },
  end_date_desc: { order: 'endDate', ascending: false },
  start_date: { order: 'startDate', ascending: false },
  created_desc: { order: 'createdAt', ascending: false },
  created_asc: { order: 'createdAt', ascending: true },
  id_desc: { order: 'id', ascending: false },
  id_asc: { order: 'id', ascending: true },
}

/**
 * 扫描配置
 */
export interface ScanConfig {
  // === 来自 /markets/sync 页面 ===
  /** 排序方式 */
  orderBy: string
  /** 每次获取数量 */
  limit: number
  /** 市场状态: "true"=关闭, "false"=活跃, "all"=全部 */
  closed: 'true' | 'false' | 'all'
  /** 最小流动性 */
  liquidityMin?: number
  /** 最大流动性 */
  liquidityMax?: number
  /** 最小交易量 */
  volumeMin?: number
  /** 最大交易量 */
  volumeMax?: number
  /** 最早结束日期 */
  endDateMin?: string
  /** 最晚结束日期 */
  endDateMax?: string
  /** 最早开始日期 */
  startDateMin?: string
  /** 最晚开始日期 */
  startDateMax?: string
  /** 标签 ID */
  tagId?: number
  /** 包含相关标签 */
  relatedTags?: boolean

  // === 来自 /markets/scan 页面 ===
  /** 最小价差 (%) */
  minSpread?: number
  /** 排除受限市场 */
  excludeRestricted?: boolean
  /** 仅二元市场 */
  onlyBinaryMarkets?: boolean

  // === 队列系统新增 ===
  /** 最大扫描页数 */
  maxPages: number
  /** 订单簿并发获取数 */
  orderbookConcurrency: number
  /** 扫描间隔 (毫秒) */
  scanInterval: number
}

/**
 * 默认扫描配置
 * 
 * Polymarket 活跃市场约 16k+，需要足够的页数来覆盖
 * limit=200, maxPages=100 => 最多扫描 20,000 个市场
 */
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  orderBy: 'volume',
  limit: 200,           // 每页 200 条（Gamma API 最大支持）
  closed: 'false',
  maxPages: 100,        // 最多 100 页，覆盖 20k 市场
  orderbookConcurrency: 20,
  scanInterval: 60000,  // 60秒扫描一轮（扫描16k市场需要时间）
}

// ==================== 任务类型 ====================

/**
 * 扫描任务结果
 */
export interface ScanTaskResult {
  /** 获取的市场数量 */
  marketCount: number
  /** 扫描页数 */
  pageCount: number
  /** 耗时 (毫秒) */
  duration: number
  /** 错误信息 */
  error?: string
}

/**
 * 存储任务
 */
export interface StorageTask {
  /** 市场数据 */
  market: MarketData
  /** 追踪 ID */
  traceId?: string
}

/**
 * 市场数据 (简化版，用于队列传递)
 */
export interface MarketData {
  /** 条件 ID (唯一标识) */
  conditionId: string
  /** 市场问题 */
  question: string
  /** 市场 slug */
  slug: string
  /** 分类 */
  category?: string
  /** 结果选项 */
  outcomes: string[]
  /** 结果价格 */
  outcomePrices: number[]
  /** Token IDs */
  clobTokenIds?: string[]
  /** 交易量 */
  volume: number
  /** 24h 交易量 */
  volume24hr: number
  /** 流动性 */
  liquidity: number
  /** 最佳买价 */
  bestBid?: number
  /** 最佳卖价 */
  bestAsk?: number
  /** 价差 */
  spread?: number
  /** 结束日期 */
  endDate?: string
  /** 是否活跃 */
  active: boolean
  /** 是否已关闭 */
  closed: boolean
  /** 是否受限 */
  restricted?: boolean
  /** 是否有订单簿 */
  enableOrderBook: boolean
  /** 图片 URL */
  image?: string
}

// ==================== 事件类型 ====================

/**
 * 队列事件类型
 */
export type QueueEventType = 
  | 'task:start'
  | 'task:complete'
  | 'task:error'
  | 'queue:start'
  | 'queue:stop'
  | 'queue:pause'
  | 'queue:resume'
  | 'queue:empty'
  | 'queue:backpressure'
  | 'scan:complete'
  | 'storage:batch:complete'

/**
 * 队列事件数据
 */
export interface QueueEvent {
  /** 事件类型 */
  type: QueueEventType
  /** 队列名称 */
  queue: QueueName
  /** 事件数据 */
  data?: any
  /** 时间戳 */
  timestamp: Date
}

/**
 * 队列事件监听器
 */
export type QueueEventListener = (event: QueueEvent) => void

// ==================== 统计类型 ====================

/**
 * 队列统计信息
 */
export interface QueueStats {
  /** 今日处理任务数 */
  processedToday: number
  /** 今日错误数 */
  errorsToday: number
  /** 平均处理时间 (毫秒) */
  avgProcessingTime: number
  /** 队列利用率 (百分比) */
  utilizationPercent: number
}

/**
 * 扫描统计信息
 */
export interface ScanStats {
  /** 总扫描次数 */
  totalScans: number
  /** 今日扫描次数 */
  scansToday: number
  /** 总市场数 */
  totalMarkets: number
  /** 总机会数 */
  totalOpportunities: number
  /** 最后扫描时间 */
  lastScanAt: Date | null
}
