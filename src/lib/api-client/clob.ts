/**
 * CLOB 客户端包装器
 * 包装官方 @polymarket/clob-client SDK，添加日志记录和统一接口
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client'
import { Wallet } from '@ethersproject/wallet'
import type {
  ApiRequestContext,
  ApiRequestLog,
  OrderBook,
  OrderSide,
  CreateOrderParams,
  OrderResponse,
} from './types'
import { type LogStorage } from './base'

// ==================== 配置 ====================

const CLOB_API = process.env.CLOB_API_URL || 'https://clob.polymarket.com'
const CHAIN_ID = parseInt(process.env.POLYGON_CHAIN_ID || '137')

// ==================== 日志记录辅助 ====================

/**
 * 记录 API 调用日志
 */
async function logApiCall(
  logStorage: LogStorage | null,
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE',
  params: any,
  startTime: number,
  result: { success: boolean; data?: any; error?: string; statusCode?: number },
  context?: ApiRequestContext
): Promise<void> {
  if (!logStorage) return

  const log: ApiRequestLog = {
    clientType: 'CLOB',
    endpoint,
    method,
    requestParams: params,
    statusCode: result.statusCode || (result.success ? 200 : 500),
    responseSize: result.data ? JSON.stringify(result.data).length : 0,
    durationMs: Date.now() - startTime,
    success: result.success,
    errorMessage: result.error,
    traceId: context?.traceId,
    source: context?.source,
  }

  try {
    await logStorage.saveLog(log)
  } catch (error) {
    console.error('❌ 保存 CLOB API 日志失败:', error)
  }
}

// ==================== ClobClientWrapper ====================

/**
 * CLOB 客户端包装器
 * 复用官方 SDK，添加日志记录功能
 */
export class ClobClientWrapper {
  private client: ClobClient | null = null
  private logStorage: LogStorage | null = null
  private wallet: Wallet | null = null

  constructor() {
    // 延迟初始化，因为可能没有配置私钥
  }

  /**
   * 设置日志存储器
   */
  setLogStorage(storage: LogStorage): void {
    this.logStorage = storage
  }

  /**
   * 获取底层 ClobClient 实例
   */
  private getClient(): ClobClient {
    if (!this.client) {
      const privateKey = process.env.PRIVATE_KEY?.trim()
      if (!privateKey) {
        throw new Error('未配置 PRIVATE_KEY 环境变量')
      }

      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
      this.wallet = new Wallet(formattedKey)
      this.client = new ClobClient(CLOB_API, CHAIN_ID, this.wallet)
    }
    return this.client
  }

  /**
   * 检查是否已配置私钥
   */
  isConfigured(): boolean {
    return !!process.env.PRIVATE_KEY?.trim()
  }

  /**
   * 获取钱包地址
   */
  getWalletAddress(): string | null {
    if (this.wallet) {
      return this.wallet.address
    }
    if (this.isConfigured()) {
      const privateKey = process.env.PRIVATE_KEY!.trim()
      const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
      const wallet = new Wallet(formattedKey)
      return wallet.address
    }
    return null
  }

  // ==================== 订单簿查询 ====================

  /**
   * 获取订单簿
   */
  async getOrderBook(
    tokenId: string,
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: OrderBook; error?: string }> {
    const startTime = Date.now()
    const endpoint = `/book?token_id=${tokenId}`

    try {
      const client = this.getClient()
      const book = await client.getOrderBook(tokenId)

      const result = {
        success: true,
        data: {
          market: book.market || '',
          asset_id: book.asset_id || tokenId,
          timestamp: Date.now(),
          asks: book.asks || [],
          bids: book.bids || [],
        } as OrderBook,
      }

      await logApiCall(this.logStorage, endpoint, 'GET', { tokenId }, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '获取订单簿失败' }
      await logApiCall(this.logStorage, endpoint, 'GET', { tokenId }, startTime, result, context)
      return result
    }
  }

  /**
   * 获取最优价格
   */
  async getBestPrices(
    tokenId: string,
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: { bestBid: number; bestAsk: number }; error?: string }> {
    const result = await this.getOrderBook(tokenId, context)
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error || '获取订单簿失败' }
    }

    const { asks, bids } = result.data
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 1
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0

    return {
      success: true,
      data: { bestBid, bestAsk },
    }
  }

  /**
   * 获取市场价格
   */
  async getPrice(
    tokenId: string,
    side: OrderSide,
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: number; error?: string }> {
    const startTime = Date.now()
    const endpoint = `/price?token_id=${tokenId}&side=${side}`

    try {
      const client = this.getClient()
      const price = await client.getPrice(tokenId, side)
      const result = {
        success: true,
        data: price ? parseFloat(price) : undefined,
      }
      await logApiCall(this.logStorage, endpoint, 'GET', { tokenId, side }, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '获取价格失败' }
      await logApiCall(this.logStorage, endpoint, 'GET', { tokenId, side }, startTime, result, context)
      return result
    }
  }

  // ==================== 订单操作 ====================

  /**
   * 创建并提交订单
   */
  async createOrder(
    params: CreateOrderParams,
    options?: { tickSize?: string; negRisk?: boolean },
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: OrderResponse; error?: string }> {
    const startTime = Date.now()
    const endpoint = '/order'

    try {
      const client = this.getClient()
      
      // SDK 只支持 GTC 和 GTD 类型
      const orderType = params.orderType === 'GTD'
        ? OrderType.GTD
        : OrderType.GTC

      const side = params.side === 'BUY' ? Side.BUY : Side.SELL

      // tickSize 需要是特定的值类型
      const tickSize = (options?.tickSize || '0.01') as '0.1' | '0.01' | '0.001' | '0.0001'

      const response = await client.createAndPostOrder(
        {
          tokenID: params.tokenId,
          price: params.price,
          side,
          size: params.size,
        },
        {
          tickSize,
          negRisk: options?.negRisk ?? false,
        },
        orderType
      )

      const result = {
        success: true,
        data: {
          success: response.success || true,
          orderId: response.orderID,
          errorMsg: response.errorMsg,
          transactionsHashes: response.transactionsHashes,
        } as OrderResponse,
      }

      await logApiCall(this.logStorage, endpoint, 'POST', params, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '创建订单失败' }
      await logApiCall(this.logStorage, endpoint, 'POST', params, startTime, result, context)
      return result
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(
    orderId: string,
    context?: ApiRequestContext
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now()
    const endpoint = `/order/${orderId}`

    try {
      const client = this.getClient()
      // SDK 的 cancelOrder 需要完整的 order payload，这里使用 cancelOrders
      await client.cancelOrders([orderId])
      
      const result = { success: true }
      await logApiCall(this.logStorage, endpoint, 'DELETE', { orderId }, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '取消订单失败' }
      await logApiCall(this.logStorage, endpoint, 'DELETE', { orderId }, startTime, result, context)
      return result
    }
  }

  /**
   * 取消所有订单
   */
  async cancelAllOrders(
    context?: ApiRequestContext
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now()
    const endpoint = '/orders/cancel-all'

    try {
      const client = this.getClient()
      await client.cancelAll()
      
      const result = { success: true }
      await logApiCall(this.logStorage, endpoint, 'DELETE', {}, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '取消所有订单失败' }
      await logApiCall(this.logStorage, endpoint, 'DELETE', {}, startTime, result, context)
      return result
    }
  }

  // ==================== 用户查询 ====================

  /**
   * 获取用户开放订单
   */
  async getOpenOrders(
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const startTime = Date.now()
    const endpoint = '/orders'

    try {
      const client = this.getClient()
      const orders = await client.getOpenOrders()
      
      const result = {
        success: true,
        data: orders || [],
      }
      await logApiCall(this.logStorage, endpoint, 'GET', {}, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '获取订单列表失败' }
      await logApiCall(this.logStorage, endpoint, 'GET', {}, startTime, result, context)
      return result
    }
  }

  /**
   * 获取余额和授权
   */
  async getBalanceAllowance(
    context?: ApiRequestContext
  ): Promise<{ success: boolean; data?: { balance: string; allowance: string }; error?: string }> {
    const startTime = Date.now()
    const endpoint = '/balance-allowance'

    try {
      const client = this.getClient()
      const result_data = await client.getBalanceAllowance()
      
      const result = {
        success: true,
        data: {
          balance: result_data?.balance || '0',
          allowance: result_data?.allowance || '0',
        },
      }
      await logApiCall(this.logStorage, endpoint, 'GET', {}, startTime, result, context)
      return result
    } catch (error: any) {
      const result = { success: false, error: error.message || '获取余额授权失败' }
      await logApiCall(this.logStorage, endpoint, 'GET', {}, startTime, result, context)
      return result
    }
  }
}

// ==================== 单例 ====================

let clobClientInstance: ClobClientWrapper | null = null

/**
 * 获取 ClobClientWrapper 单例
 */
export function getClobClient(): ClobClientWrapper {
  if (!clobClientInstance) {
    clobClientInstance = new ClobClientWrapper()
  }
  return clobClientInstance
}

/**
 * 重置 ClobClient 单例 (用于测试)
 */
export function resetClobClient(): void {
  clobClientInstance = null
}
