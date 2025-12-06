/**
 * 扫描配置模块
 * 
 * 从现有页面抽取的公共配置逻辑，供队列系统复用
 * 参考: src/app/(dashboard)/markets/sync/page.tsx 的 buildSyncParams()
 */

import { ScanConfig, DEFAULT_SCAN_CONFIG, ORDER_MAPPINGS, OrderConfig } from './queue/types'

// ==================== 全局配置状态 ====================

/** 当前扫描配置 (内存) */
let currentConfig: ScanConfig = { ...DEFAULT_SCAN_CONFIG }

/**
 * 获取当前扫描配置
 */
export function getScanConfig(): ScanConfig {
  return { ...currentConfig }
}

/**
 * 更新扫描配置
 * @param partial - 部分配置更新
 */
export function updateScanConfig(partial: Partial<ScanConfig>): void {
  currentConfig = { ...currentConfig, ...partial }
  console.log('📝 扫描配置已更新:', partial)
}

/**
 * 重置为默认配置
 */
export function resetScanConfig(): void {
  currentConfig = { ...DEFAULT_SCAN_CONFIG }
  console.log('🔄 扫描配置已重置为默认值')
}

// ==================== API 参数构建 ====================

/**
 * 构建 Gamma API 请求参数
 * 从 ScanConfig 转换为 Gamma API 格式的参数
 * 
 * @param config - 扫描配置 (可选，默认使用全局配置)
 * @param offset - 分页偏移量
 * @returns Gamma API 参数对象
 */
export function buildGammaApiParams(
  config: ScanConfig = currentConfig,
  offset: number = 0
): Record<string, any> {
  const params: Record<string, any> = {
    limit: config.limit,
    offset,
  }

  // 排序配置
  const orderConfig: OrderConfig = ORDER_MAPPINGS[config.orderBy] || ORDER_MAPPINGS.volume
  params.order = orderConfig.order
  params.ascending = orderConfig.ascending

  // 市场状态筛选
  if (config.closed !== 'all') {
    params.closed = config.closed === 'true'
  }

  // 流动性范围
  if (config.liquidityMin !== undefined) {
    params.liquidity_num_min = config.liquidityMin
  }
  if (config.liquidityMax !== undefined) {
    params.liquidity_num_max = config.liquidityMax
  }

  // 交易量范围
  if (config.volumeMin !== undefined) {
    params.volume_num_min = config.volumeMin
  }
  if (config.volumeMax !== undefined) {
    params.volume_num_max = config.volumeMax
  }

  // 日期范围
  if (config.endDateMin) params.end_date_min = config.endDateMin
  if (config.endDateMax) params.end_date_max = config.endDateMax
  if (config.startDateMin) params.start_date_min = config.startDateMin
  if (config.startDateMax) params.start_date_max = config.startDateMax

  // 标签筛选
  if (config.tagId !== undefined) {
    params.tag_id = config.tagId
  }
  if (config.relatedTags) {
    params.related_tags = true
  }

  return params
}

/**
 * 从 API/前端请求中解析扫描配置
 * 
 * @param input - 输入参数 (来自 API 请求体或前端)
 * @returns 扫描配置对象
 */
export function parseScanConfig(input: Record<string, any>): Partial<ScanConfig> {
  const config: Partial<ScanConfig> = {}

  // 基础参数
  if (input.orderBy !== undefined) config.orderBy = String(input.orderBy)
  if (input.limit !== undefined) config.limit = parseInt(input.limit) || DEFAULT_SCAN_CONFIG.limit
  if (input.closed !== undefined) {
    config.closed = input.closed === true || input.closed === 'true' 
      ? 'true' 
      : input.closed === 'all' 
        ? 'all' 
        : 'false'
  }

  // 数值范围
  if (input.liquidityMin !== undefined) config.liquidityMin = parseFloat(input.liquidityMin)
  if (input.liquidityMax !== undefined) config.liquidityMax = parseFloat(input.liquidityMax)
  if (input.volumeMin !== undefined) config.volumeMin = parseFloat(input.volumeMin)
  if (input.volumeMax !== undefined) config.volumeMax = parseFloat(input.volumeMax)
  if (input.liquidity_num_min !== undefined) config.liquidityMin = parseFloat(input.liquidity_num_min)
  if (input.liquidity_num_max !== undefined) config.liquidityMax = parseFloat(input.liquidity_num_max)
  if (input.volume_num_min !== undefined) config.volumeMin = parseFloat(input.volume_num_min)
  if (input.volume_num_max !== undefined) config.volumeMax = parseFloat(input.volume_num_max)

  // 日期范围
  if (input.endDateMin) config.endDateMin = String(input.endDateMin)
  if (input.endDateMax) config.endDateMax = String(input.endDateMax)
  if (input.startDateMin) config.startDateMin = String(input.startDateMin)
  if (input.startDateMax) config.startDateMax = String(input.startDateMax)
  if (input.end_date_min) config.endDateMin = String(input.end_date_min)
  if (input.end_date_max) config.endDateMax = String(input.end_date_max)
  if (input.start_date_min) config.startDateMin = String(input.start_date_min)
  if (input.start_date_max) config.startDateMax = String(input.start_date_max)

  // 标签
  if (input.tagId !== undefined) config.tagId = parseInt(input.tagId)
  if (input.tag_id !== undefined) config.tagId = parseInt(input.tag_id)
  if (input.relatedTags !== undefined) config.relatedTags = Boolean(input.relatedTags)
  if (input.related_tags !== undefined) config.relatedTags = Boolean(input.related_tags)

  // 扫描页筛选
  if (input.minSpread !== undefined) config.minSpread = parseFloat(input.minSpread)
  if (input.excludeRestricted !== undefined) config.excludeRestricted = Boolean(input.excludeRestricted)
  if (input.onlyBinaryMarkets !== undefined) config.onlyBinaryMarkets = Boolean(input.onlyBinaryMarkets)

  // 队列系统参数
  if (input.maxPages !== undefined) config.maxPages = parseInt(input.maxPages) || DEFAULT_SCAN_CONFIG.maxPages
  if (input.orderbookConcurrency !== undefined) config.orderbookConcurrency = parseInt(input.orderbookConcurrency) || DEFAULT_SCAN_CONFIG.orderbookConcurrency
  if (input.scanInterval !== undefined) config.scanInterval = parseInt(input.scanInterval) || DEFAULT_SCAN_CONFIG.scanInterval

  return config
}

// ==================== 市场过滤 ====================

/**
 * 根据扫描配置过滤市场
 * 
 * @param markets - 市场数据列表
 * @param config - 扫描配置
 * @returns 过滤后的市场列表
 */
export function filterMarkets<T extends { 
  restricted?: boolean
  outcomes?: any[] | string
  spread?: number
}>(
  markets: T[],
  config: ScanConfig = currentConfig
): T[] {
  return markets.filter(market => {
    // 排除受限市场
    if (config.excludeRestricted && market.restricted) {
      return false
    }

    // 仅二元市场
    if (config.onlyBinaryMarkets) {
      const outcomes = Array.isArray(market.outcomes) 
        ? market.outcomes 
        : typeof market.outcomes === 'string'
          ? JSON.parse(market.outcomes || '[]')
          : []
      if (outcomes.length !== 2) {
        return false
      }
    }

    // 最小价差筛选
    if (config.minSpread !== undefined && market.spread !== undefined) {
      if (market.spread < config.minSpread) {
        return false
      }
    }

    return true
  })
}

// ==================== 导出类型 ====================

export type { ScanConfig, OrderConfig }
export { DEFAULT_SCAN_CONFIG, ORDER_MAPPINGS }
