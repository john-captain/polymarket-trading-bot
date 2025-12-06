/**
 * API 客户端类型定义
 * 统一 API 请求层的核心类型
 */

// ==================== 配置类型 ====================

/**
 * API 客户端配置
 */
export interface ApiClientConfig {
  /** 基础 URL */
  baseUrl: string
  /** 请求超时时间 (毫秒) */
  timeout: number
  /** 代理地址 (HTTP/SOCKS) */
  proxy?: string
  /** 限速配置 */
  rateLimit?: RateLimiterConfig
  /** 重试配置 */
  retry?: RetryConfig
  /** 是否启用日志记录 */
  enableLogging?: boolean
  /** 响应日志最大长度 (字节) */
  maxResponseLogSize?: number
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>
}

/**
 * 限速配置
 */
export interface RateLimiterConfig {
  /** 时间窗口内最大请求数 */
  maxRequests: number
  /** 时间窗口 (毫秒) */
  windowMs: number
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number
  /** 初始延迟 (毫秒) */
  initialDelayMs: number
  /** 最大延迟 (毫秒) */
  maxDelayMs: number
  /** 需要重试的 HTTP 状态码 */
  retryOn: number[]
}

// ==================== 请求/响应类型 ====================

/**
 * API 请求上下文
 */
export interface ApiRequestContext {
  /** 追踪 ID (关联业务操作) */
  traceId?: string
  /** 调用来源 */
  source?: string
  /** 额外标签 */
  tags?: Record<string, string>
}

/**
 * API 请求选项
 */
export interface ApiRequestOptions {
  /** HTTP 方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 查询参数 */
  params?: Record<string, any>
  /** 请求体 */
  body?: any
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 请求上下文 */
  context?: ApiRequestContext
  /** 单独设置超时 */
  timeout?: number
  /** 是否跳过日志记录 */
  skipLogging?: boolean
}

/**
 * API 响应结果
 */
export interface ApiResponse<T = any> {
  /** 是否成功 */
  success: boolean
  /** 响应数据 */
  data?: T
  /** 错误信息 */
  error?: string
  /** HTTP 状态码 */
  statusCode?: number
  /** 请求耗时 (毫秒) */
  duration: number
}

// ==================== 日志类型 ====================

/**
 * API 客户端类型
 */
export type ApiClientType = 'GAMMA' | 'CLOB' | 'RPC'

/**
 * HTTP 方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * API 请求日志记录
 */
export interface ApiRequestLog {
  id?: number
  /** API 类型 */
  clientType: ApiClientType
  /** 请求端点 */
  endpoint: string
  /** HTTP 方法 */
  method: HttpMethod
  /** 请求参数 */
  requestParams?: Record<string, any>
  /** 请求头 (脱敏后) */
  requestHeaders?: Record<string, string>
  /** HTTP 状态码 */
  statusCode?: number
  /** 响应数据 (可选, 大数据截断) */
  responseData?: any
  /** 响应大小 (bytes) */
  responseSize?: number
  /** 请求耗时 (毫秒) */
  durationMs: number
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  errorMessage?: string
  /** 重试次数 */
  retryCount?: number
  /** 追踪 ID */
  traceId?: string
  /** 调用来源 */
  source?: string
  /** 创建时间 */
  createdAt?: Date
}

// ==================== Gamma API 类型 ====================

/**
 * Gamma API 市场查询参数
 */
export interface GammaMarketsParams {
  /** 是否活跃 */
  active?: boolean
  /** 是否关闭 */
  closed?: boolean
  /** 每页数量 */
  limit?: number
  /** 偏移量 */
  offset?: number
  /** 排序字段 */
  order?: string
  /** 是否升序 */
  ascending?: boolean
  /** 分类 */
  tag_id?: number
  /** 包含相关标签 */
  related_tags?: boolean
  /** 最小流动性 */
  liquidity_num_min?: number
  /** 最大流动性 */
  liquidity_num_max?: number
  /** 最小交易量 */
  volume_num_min?: number
  /** 最大交易量 */
  volume_num_max?: number
  /** 结束日期最小 */
  end_date_min?: string
  /** 结束日期最大 */
  end_date_max?: string
  /** 开始日期最小 */
  start_date_min?: string
  /** 开始日期最大 */
  start_date_max?: string
}

/**
 * Gamma API 市场数据
 */
export interface GammaMarket {
  question: string
  conditionId: string
  questionId?: string
  slug?: string
  description?: string
  category?: string
  marketType?: string
  tokens: Array<{
    token_id: string
    outcome: string
    winner?: boolean
  }>
  outcomes: string
  outcomePrices: string
  active: boolean
  closed: boolean
  archived?: boolean
  restricted?: boolean
  enableOrderBook?: boolean
  volume?: string
  volumeNum?: number
  volume24hr?: number
  liquidity?: string
  liquidityNum?: number
  endDate?: string
  startDate?: string
  createdAt?: string
  updatedAt?: string
  // 更多字段...
}

/**
 * Gamma API 事件数据
 */
export interface GammaEvent {
  id: string
  slug: string
  title: string
  description?: string
  startDate?: string
  endDate?: string
  markets: GammaMarket[]
}

// ==================== CLOB API 类型 ====================

/**
 * 订单簿条目
 */
export interface OrderBookEntry {
  price: string
  size: string
}

/**
 * 订单簿数据
 */
export interface OrderBook {
  market: string
  asset_id: string
  timestamp: number
  asks: OrderBookEntry[]
  bids: OrderBookEntry[]
}

/**
 * 订单方向
 */
export type OrderSide = 'BUY' | 'SELL'

/**
 * 订单类型
 */
export type ClobOrderType = 'GTC' | 'GTD' | 'FOK'

/**
 * 创建订单参数
 */
export interface CreateOrderParams {
  /** Token ID */
  tokenId: string
  /** 订单方向 */
  side: OrderSide
  /** 价格 */
  price: number
  /** 数量 */
  size: number
  /** 订单类型 */
  orderType?: ClobOrderType
  /** 有效期 (GTD 类型) */
  expiration?: number
}

/**
 * 订单响应
 */
export interface OrderResponse {
  success: boolean
  orderId?: string
  errorMsg?: string
  transactionsHashes?: string[]
}

/**
 * 用户订单
 */
export interface UserOrder {
  id: string
  market: string
  asset_id: string
  side: OrderSide
  price: string
  original_size: string
  size_matched: string
  outcome: string
  status: 'live' | 'matched' | 'cancelled'
  created_at: number
}

// ==================== 默认配置 ====================

/**
 * Gamma API 默认配置
 */
export const DEFAULT_GAMMA_CONFIG: ApiClientConfig = {
  baseUrl: 'https://gamma-api.polymarket.com',
  timeout: 30000,
  rateLimit: {
    maxRequests: 10,
    windowMs: 1000,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    retryOn: [429, 500, 502, 503, 504],
  },
  enableLogging: true,
  maxResponseLogSize: 10000,
  defaultHeaders: {
    'User-Agent': 'polymarket-bot/2.0',
  },
}

/**
 * CLOB API 默认配置
 */
export const DEFAULT_CLOB_CONFIG: ApiClientConfig = {
  baseUrl: 'https://clob.polymarket.com',
  timeout: 15000,
  rateLimit: {
    maxRequests: 5,
    windowMs: 1000,
  },
  retry: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    retryOn: [429, 500, 502, 503, 504],
  },
  enableLogging: true,
  maxResponseLogSize: 5000,
  defaultHeaders: {
    'User-Agent': 'polymarket-bot/2.0',
  },
}
