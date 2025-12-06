/**
 * API 客户端基础类
 * 提供统一的请求处理、代理配置、限速控制、重试机制和日志记录
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type {
  ApiClientConfig,
  ApiClientType,
  ApiRequestOptions,
  ApiResponse,
  ApiRequestLog,
  HttpMethod,
  RateLimiterConfig,
  RetryConfig,
} from './types'

// ==================== 日志存储接口 ====================

/**
 * 日志存储器接口 - 由外部实现
 */
export interface LogStorage {
  saveLog(log: ApiRequestLog): Promise<void>
}

// 全局日志存储器
let globalLogStorage: LogStorage | null = null

/**
 * 设置全局日志存储器
 */
export function setLogStorage(storage: LogStorage): void {
  globalLogStorage = storage
}

// ==================== 限速器 ====================

/**
 * 令牌桶限速器
 */
class RateLimiter {
  private tokens: number
  private maxTokens: number
  private refillRate: number
  private lastRefill: number

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxRequests
    this.tokens = config.maxRequests
    this.refillRate = config.maxRequests / config.windowMs
    this.lastRefill = Date.now()
  }

  /**
   * 尝试获取令牌
   */
  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens < 1) {
      // 计算需要等待的时间
      const waitTime = (1 - this.tokens) / this.refillRate
      await this.sleep(waitTime)
      this.refill()
    }

    this.tokens -= 1
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== API 客户端基础类 ====================

/**
 * API 客户端基础类
 */
export class ApiClient {
  protected readonly clientType: ApiClientType
  protected readonly config: ApiClientConfig
  protected readonly axios: AxiosInstance
  protected readonly rateLimiter?: RateLimiter

  constructor(clientType: ApiClientType, config: ApiClientConfig) {
    this.clientType = clientType
    this.config = config

    // 创建 axios 实例
    this.axios = this.createAxiosInstance()

    // 创建限速器
    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit)
    }
  }

  /**
   * 创建 axios 实例
   */
  private createAxiosInstance(): AxiosInstance {
    const proxyAgent = this.getProxyAgent()

    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.defaultHeaders,
      },
    }

    // 配置代理
    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.httpAgent = proxyAgent
    }

    return axios.create(axiosConfig)
  }

  /**
   * 获取代理 agent
   */
  private getProxyAgent(): HttpsProxyAgent<string> | SocksProxyAgent | undefined {
    // 优先使用配置的代理
    const proxy = this.config.proxy || process.env.SOCKS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY

    if (!proxy) return undefined

    if (proxy.startsWith('socks')) {
      return new SocksProxyAgent(proxy)
    }

    return new HttpsProxyAgent(proxy)
  }

  /**
   * 执行请求 (带限速、重试、日志)
   */
  async request<T = any>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now()
    const method = options.method || 'GET'
    let retryCount = 0
    let lastError: Error | null = null

    // 限速
    if (this.rateLimiter) {
      await this.rateLimiter.acquire()
    }

    const maxRetries = this.config.retry?.maxRetries || 0

    while (retryCount <= maxRetries) {
      try {
        const response = await this.executeRequest<T>(endpoint, options)
        const duration = Date.now() - startTime

        // 记录日志
        if (!options.skipLogging && this.config.enableLogging) {
          await this.logRequest({
            clientType: this.clientType,
            endpoint,
            method,
            requestParams: options.params || options.body,
            statusCode: response.statusCode,
            responseSize: this.estimateSize(response.data),
            durationMs: duration,
            success: response.success,
            retryCount,
            traceId: options.context?.traceId,
            source: options.context?.source,
          })
        }

        return response
      } catch (error: any) {
        lastError = error
        const statusCode = error.response?.status

        // 检查是否需要重试
        if (
          retryCount < maxRetries &&
          this.config.retry?.retryOn?.includes(statusCode)
        ) {
          retryCount++
          const delay = this.calculateRetryDelay(retryCount)
          console.log(`⏳ [${this.clientType}] ${endpoint} 请求失败 (${statusCode})，${delay}ms 后重试 (${retryCount}/${maxRetries})`)
          await this.sleep(delay)
          continue
        }

        // 不重试，记录错误日志
        const duration = Date.now() - startTime
        if (!options.skipLogging && this.config.enableLogging) {
          await this.logRequest({
            clientType: this.clientType,
            endpoint,
            method,
            requestParams: options.params || options.body,
            statusCode,
            durationMs: duration,
            success: false,
            errorMessage: error.message,
            retryCount,
            traceId: options.context?.traceId,
            source: options.context?.source,
          })
        }

        return {
          success: false,
          error: error.message || '请求失败',
          statusCode,
          duration,
        }
      }
    }

    // 所有重试都失败
    const duration = Date.now() - startTime
    return {
      success: false,
      error: lastError?.message || '请求失败',
      duration,
    }
  }

  /**
   * 执行单次请求
   */
  private async executeRequest<T>(
    endpoint: string,
    options: ApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', params, body, headers, timeout } = options

    const config: AxiosRequestConfig = {
      method,
      url: endpoint,
      headers,
      timeout: timeout || this.config.timeout,
    }

    if (params) {
      config.params = params
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      config.data = body
    }

    const startTime = Date.now()
    const response: AxiosResponse<T> = await this.axios.request(config)
    const duration = Date.now() - startTime

    return {
      success: true,
      data: response.data,
      statusCode: response.status,
      duration,
    }
  }

  /**
   * 计算重试延迟 (指数退避)
   */
  private calculateRetryDelay(retryCount: number): number {
    const { initialDelayMs = 1000, maxDelayMs = 10000 } = this.config.retry || {}
    const delay = initialDelayMs * Math.pow(2, retryCount - 1)
    // 添加随机抖动 (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1)
    return Math.min(delay + jitter, maxDelayMs)
  }

  /**
   * 记录请求日志
   */
  private async logRequest(log: ApiRequestLog): Promise<void> {
    if (globalLogStorage) {
      try {
        await globalLogStorage.saveLog(log)
      } catch (error) {
        console.error('❌ 保存 API 日志失败:', error)
      }
    }
  }

  /**
   * 估算数据大小
   */
  private estimateSize(data: any): number {
    if (!data) return 0
    try {
      return JSON.stringify(data).length
    } catch {
      return 0
    }
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * GET 请求
   */
  async get<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  /**
   * POST 请求
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body })
  }

  /**
   * PUT 请求
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body })
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }

  /**
   * 获取客户端类型
   */
  getClientType(): ApiClientType {
    return this.clientType
  }

  /**
   * 获取基础 URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl
  }

  /**
   * 检查代理是否启用
   */
  isProxyEnabled(): boolean {
    return !!(this.config.proxy || process.env.SOCKS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  }

  /**
   * 获取代理信息
   */
  getProxyInfo(): string {
    const proxy = this.config.proxy || process.env.SOCKS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    return proxy || '未配置代理（直连）'
  }
}

/**
 * 生成 UUID v4
 */
export function generateTraceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
