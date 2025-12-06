/**
 * Gamma API 客户端
 * 用于获取市场数据、事件信息
 */

import { ApiClient } from './base'
import type {
  ApiClientConfig,
  ApiRequestContext,
  ApiResponse,
  GammaMarket,
  GammaMarketsParams,
  GammaEvent,
  DEFAULT_GAMMA_CONFIG,
} from './types'
import { DEFAULT_GAMMA_CONFIG as defaultConfig } from './types'

/**
 * Gamma API 客户端
 */
export class GammaClient extends ApiClient {
  constructor(config?: Partial<ApiClientConfig>) {
    super('GAMMA', { ...defaultConfig, ...config })
  }

  /**
   * 获取市场列表
   */
  async getMarkets(
    params?: GammaMarketsParams,
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaMarket[]>> {
    // 构建查询参数
    const queryParams: Record<string, any> = {}

    if (params) {
      if (params.active !== undefined) queryParams.active = params.active
      if (params.closed !== undefined) queryParams.closed = params.closed
      if (params.limit !== undefined) queryParams.limit = params.limit
      if (params.offset !== undefined) queryParams.offset = params.offset
      if (params.order) queryParams.order = params.order
      if (params.ascending !== undefined) queryParams.ascending = params.ascending
      if (params.tag_id) queryParams.tag_id = params.tag_id
      if (params.related_tags !== undefined) queryParams.related_tags = params.related_tags
      if (params.liquidity_num_min) queryParams.liquidity_num_min = params.liquidity_num_min
      if (params.liquidity_num_max) queryParams.liquidity_num_max = params.liquidity_num_max
      if (params.volume_num_min) queryParams.volume_num_min = params.volume_num_min
      if (params.volume_num_max) queryParams.volume_num_max = params.volume_num_max
      if (params.end_date_min) queryParams.end_date_min = params.end_date_min
      if (params.end_date_max) queryParams.end_date_max = params.end_date_max
      if (params.start_date_min) queryParams.start_date_min = params.start_date_min
      if (params.start_date_max) queryParams.start_date_max = params.start_date_max
    }

    return this.get<GammaMarket[]>('/markets', {
      params: queryParams,
      context,
    })
  }

  /**
   * 分页获取所有市场
   * @param params 查询参数
   * @param maxPages 最大页数限制
   * @param onPageFetched 每页获取完成回调
   */
  async getAllMarkets(
    params?: GammaMarketsParams,
    options?: {
      maxPages?: number
      onPageFetched?: (markets: GammaMarket[], page: number, total: number) => void
      context?: ApiRequestContext
    }
  ): Promise<ApiResponse<GammaMarket[]>> {
    const { maxPages = 20, onPageFetched, context } = options || {}
    const pageSize = params?.limit || 500
    const allMarkets: GammaMarket[] = []
    let offset = params?.offset || 0
    let page = 1
    let hasMore = true

    while (hasMore && page <= maxPages) {
      const response = await this.getMarkets(
        { ...params, limit: pageSize, offset },
        context
      )

      if (!response.success) {
        // 如果已获取部分数据，返回已有数据
        if (allMarkets.length > 0) {
          console.warn(`⚠️ [GammaClient] 获取第 ${page} 页失败，返回已获取的 ${allMarkets.length} 条数据`)
          break
        }
        return response
      }

      const markets = response.data || []
      allMarkets.push(...markets)

      // 回调
      if (onPageFetched) {
        onPageFetched(markets, page, allMarkets.length)
      }

      // 检查是否还有更多
      if (markets.length < pageSize) {
        hasMore = false
      } else {
        offset += pageSize
        page++
        // 添加小延迟避免限速
        await this.delay(100)
      }
    }

    return {
      success: true,
      data: allMarkets,
      duration: 0, // 累计时间不太好计算
    }
  }

  /**
   * 获取单个市场详情
   */
  async getMarket(
    conditionId: string,
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaMarket>> {
    return this.get<GammaMarket>(`/markets/${conditionId}`, { context })
  }

  /**
   * 通过 slug 获取市场
   */
  async getMarketBySlug(
    slug: string,
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaMarket>> {
    const response = await this.get<GammaMarket[]>('/markets', {
      params: { slug },
      context,
    })

    if (!response.success) {
      return response as any
    }

    const markets = response.data || []
    if (markets.length === 0) {
      return {
        success: false,
        error: `未找到 slug=${slug} 的市场`,
        duration: response.duration,
      }
    }

    return {
      success: true,
      data: markets[0],
      duration: response.duration,
    }
  }

  /**
   * 获取事件列表
   */
  async getEvents(
    params?: {
      limit?: number
      offset?: number
      active?: boolean
      closed?: boolean
    },
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaEvent[]>> {
    return this.get<GammaEvent[]>('/events', {
      params,
      context,
    })
  }

  /**
   * 获取单个事件详情
   */
  async getEvent(
    eventId: string,
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaEvent>> {
    return this.get<GammaEvent>(`/events/${eventId}`, { context })
  }

  /**
   * 获取事件下的所有市场
   */
  async getEventMarkets(
    eventId: string,
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaMarket[]>> {
    const response = await this.getEvent(eventId, context)

    if (!response.success) {
      return response as any
    }

    return {
      success: true,
      data: response.data?.markets || [],
      duration: response.duration,
    }
  }

  /**
   * 搜索市场
   */
  async searchMarkets(
    query: string,
    options?: {
      limit?: number
      active?: boolean
    },
    context?: ApiRequestContext
  ): Promise<ApiResponse<GammaMarket[]>> {
    // Gamma API 不支持直接搜索，需要获取后在客户端过滤
    const response = await this.getMarkets(
      {
        active: options?.active ?? true,
        closed: false,
        limit: options?.limit || 100,
      },
      context
    )

    if (!response.success) {
      return response
    }

    const markets = response.data || []
    const lowerQuery = query.toLowerCase()
    const filtered = markets.filter(m => 
      m.question?.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery)
    )

    return {
      success: true,
      data: filtered,
      duration: response.duration,
    }
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 单例实例
let gammaClientInstance: GammaClient | null = null

/**
 * 获取 GammaClient 单例
 */
export function getGammaClient(): GammaClient {
  if (!gammaClientInstance) {
    gammaClientInstance = new GammaClient()
  }
  return gammaClientInstance
}

/**
 * 重置 GammaClient 单例 (用于测试)
 */
export function resetGammaClient(): void {
  gammaClientInstance = null
}
