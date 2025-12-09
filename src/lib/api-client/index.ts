/**
 * API 客户端统一导出
 * 
 * 使用方式：
 * ```typescript
 * import { getGammaClient, getClobClient, initApiClients } from '@/lib/api-client'
 * 
 * // 初始化（设置日志存储，可选）
 * await initApiClients()
 * 
 * // 获取市场数据 (Gamma API - 自建客户端)
 * const gamma = getGammaClient()
 * const markets = await gamma.getMarkets({ active: true, limit: 100 })
 * 
 * // 获取订单簿/下单 (CLOB API - 包装官方 SDK)
 * const clob = getClobClient()
 * const book = await clob.getOrderBook(tokenId)
 * ```
 */

// 类型导出
export type {
  ApiClientConfig,
  ApiClientType,
  ApiRequestContext,
  ApiRequestLog,
  ApiRequestOptions,
  ApiResponse,
  HttpMethod,
  RateLimiterConfig,
  RetryConfig,
  // Gamma API 类型
  GammaMarket,
  GammaMarketsParams,
  GammaEvent,
  // CLOB API 类型
  OrderBook,
  OrderBookEntry,
  OrderSide,
  ClobOrderType,
  CreateOrderParams,
  OrderResponse,
  UserOrder,
} from './types'

// 默认配置导出
export { DEFAULT_GAMMA_CONFIG, DEFAULT_CLOB_CONFIG } from './types'

// 基础类导出
export { ApiClient, setLogStorage, generateTraceId, type LogStorage } from './base'

// Gamma 客户端导出
export { GammaClient, getGammaClient, resetGammaClient } from './gamma'

// CLOB 客户端导出
export { ClobClientWrapper, getClobClient, resetClobClient } from './clob'

// 文件日志存储导出
export { 
  FileLogStorage, 
  getFileLogStorage, 
  getApiLogs, 
  getApiLogStats, 
  clearApiLogs 
} from './file-log-storage'

import { setLogStorage } from './base'
import { getClobClient } from './clob'
import { getFileLogStorage } from './file-log-storage'

/**
 * 初始化 API 客户端
 * 设置日志存储到文件（轻量级，不增加数据库负担）
 */
export async function initApiClients(): Promise<void> {
  const logStorage = getFileLogStorage()
  
  // 设置全局日志存储
  setLogStorage(logStorage)
  
  // 设置 CLOB 客户端日志存储
  getClobClient().setLogStorage(logStorage)
  
  console.log('✅ API 客户端已初始化，日志将记录到文件')
}

/**
 * 生成追踪 ID
 * 用于关联同一业务操作的多个 API 调用
 */
// generateTraceId 已在上方通过 base 导出
