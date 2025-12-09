/**
 * 统一筛选和查询配置
 * 
 * 集中管理所有筛选选项、排序选项、默认值
 * 供前端页面、API、队列系统统一使用
 */

// ==================== 状态筛选选项 ====================

/**
 * 市场活跃状态选项
 */
export const MARKET_STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'true', label: '活跃' },
  { value: 'false', label: '已关闭' },
] as const

export type MarketStatusValue = typeof MARKET_STATUS_OPTIONS[number]['value']

// ==================== 排序选项 ====================

/**
 * 市场排序选项
 */
export const MARKET_SORT_OPTIONS = [
  { value: 'volume', label: '总交易量', dbField: 'volume', gammaField: 'volume', ascending: false },
  { value: 'volume_24hr', label: '24h交易量', dbField: 'volume_24hr', gammaField: 'volume24hr', ascending: false },
  { value: 'volume_1wk', label: '7天交易量', dbField: 'volume_1wk', gammaField: 'volume1wk', ascending: false },
  { value: 'liquidity', label: '流动性', dbField: 'liquidity', gammaField: 'liquidity', ascending: false },
  { value: 'end_date', label: '结束时间', dbField: 'end_date', gammaField: 'endDate', ascending: true },
  { value: 'one_day_price_change', label: '24h涨跌', dbField: 'one_day_price_change', gammaField: 'oneDayPriceChange', ascending: false },
  { value: 'updated_at', label: '更新时间', dbField: 'updated_at', gammaField: 'updatedAt', ascending: false },
  { value: 'created_at', label: '创建时间', dbField: 'created_at', gammaField: 'createdAt', ascending: false },
] as const

export type MarketSortValue = typeof MARKET_SORT_OPTIONS[number]['value']

/**
 * 获取排序配置
 */
export function getSortConfig(sortValue: string) {
  const option = MARKET_SORT_OPTIONS.find(o => o.value === sortValue)
  return option || MARKET_SORT_OPTIONS[0]
}

// ==================== 市场分类选项 ====================

/**
 * 市场分类选项
 */
export const MARKET_CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  { value: 'Crypto', label: '加密货币' },
  { value: 'Sports', label: '体育' },
  { value: 'US-current-affairs', label: '美国时事' },
  { value: 'Global Politics', label: '全球政治' },
  { value: 'Business', label: '商业' },
  { value: 'Tech', label: '科技' },
  { value: 'Science', label: '科学' },
  { value: 'Pop-Culture', label: '流行文化' },
  { value: 'Space', label: '航天' },
  { value: 'Art', label: '艺术' },
  { value: 'Chess', label: '国际象棋' },
  { value: 'Olympics', label: '奥运会' },
  { value: 'NFTs', label: 'NFT' },
] as const

export type MarketCategoryValue = typeof MARKET_CATEGORY_OPTIONS[number]['value']

// ==================== 筛选字段配置 ====================

/**
 * 数值范围筛选字段
 */
export const NUMERIC_FILTER_FIELDS = [
  {
    key: 'liquidity',
    label: '流动性',
    unit: '$',
    minKey: 'liquidityMin',
    maxKey: 'liquidityMax',
    dbMinKey: 'liquidityMin',
    dbMaxKey: 'liquidityMax',
    gammaMinKey: 'liquidity_num_min',
    gammaMaxKey: 'liquidity_num_max',
    placeholder: { min: '例如: 1000', max: '例如: 100000' },
  },
  {
    key: 'volume',
    label: '交易量',
    unit: '$',
    minKey: 'volumeMin',
    maxKey: 'volumeMax',
    dbMinKey: 'volumeMin',
    dbMaxKey: 'volumeMax',
    gammaMinKey: 'volume_num_min',
    gammaMaxKey: 'volume_num_max',
    placeholder: { min: '例如: 10000', max: '例如: 1000000' },
  },
] as const

/**
 * 日期范围筛选字段
 */
export const DATE_FILTER_FIELDS = [
  {
    key: 'endDate',
    label: '结束时间',
    minKey: 'endDateMin',
    maxKey: 'endDateMax',
    dbMinKey: 'endDateMin',
    dbMaxKey: 'endDateMax',
    gammaMinKey: 'end_date_min',
    gammaMaxKey: 'end_date_max',
  },
  {
    key: 'startDate',
    label: '开始时间',
    minKey: 'startDateMin',
    maxKey: 'startDateMax',
    dbMinKey: 'startDateMin',
    dbMaxKey: 'startDateMax',
    gammaMinKey: 'start_date_min',
    gammaMaxKey: 'start_date_max',
  },
] as const

// ==================== 默认值配置 ====================

/**
 * 默认筛选配置
 */
export const DEFAULT_FILTER_CONFIG = {
  // 基础筛选
  search: '',
  activeFilter: 'all' as MarketStatusValue,
  categoryFilter: 'all',
  
  // 排序
  orderBy: 'volume' as MarketSortValue,
  orderDir: 'DESC' as 'ASC' | 'DESC',
  
  // 数值范围
  liquidityMin: undefined as number | undefined,
  liquidityMax: undefined as number | undefined,
  volumeMin: undefined as number | undefined,
  volumeMax: undefined as number | undefined,
  
  // 日期范围
  endDateMin: undefined as string | undefined,
  endDateMax: undefined as string | undefined,
  startDateMin: undefined as string | undefined,
  startDateMax: undefined as string | undefined,
  
  // 分页
  limit: 20,
  offset: 0,
}

export type FilterConfig = {
  search: string
  activeFilter: MarketStatusValue
  categoryFilter: string
  orderBy: MarketSortValue
  orderDir: 'ASC' | 'DESC'
  liquidityMin?: number
  liquidityMax?: number
  volumeMin?: number
  volumeMax?: number
  endDateMin?: string
  endDateMax?: string
  startDateMin?: string
  startDateMax?: string
  limit: number
  offset: number
}

// ==================== 筛选参数转换工具 ====================

/**
 * 将前端筛选状态转换为 API 查询参数
 */
export function buildApiParams(filters: Partial<FilterConfig>): URLSearchParams {
  const params = new URLSearchParams()
  
  // 分页
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  if (filters.offset !== undefined) params.set('offset', String(filters.offset))
  
  // 排序
  if (filters.orderBy) params.set('orderBy', filters.orderBy)
  if (filters.orderDir) params.set('orderDir', filters.orderDir)
  
  // 搜索
  if (filters.search) params.set('search', filters.search)
  
  // 状态筛选
  if (filters.activeFilter && filters.activeFilter !== 'all') {
    params.set('active', filters.activeFilter)
  }
  if (filters.categoryFilter && filters.categoryFilter !== 'all') {
    params.set('category', filters.categoryFilter)
  }
  
  // 数值范围
  if (filters.liquidityMin !== undefined) params.set('liquidityMin', String(filters.liquidityMin))
  if (filters.liquidityMax !== undefined) params.set('liquidityMax', String(filters.liquidityMax))
  if (filters.volumeMin !== undefined) params.set('volumeMin', String(filters.volumeMin))
  if (filters.volumeMax !== undefined) params.set('volumeMax', String(filters.volumeMax))
  
  // 日期范围
  if (filters.endDateMin) params.set('endDateMin', filters.endDateMin)
  if (filters.endDateMax) params.set('endDateMax', filters.endDateMax)
  if (filters.startDateMin) params.set('startDateMin', filters.startDateMin)
  if (filters.startDateMax) params.set('startDateMax', filters.startDateMax)
  
  return params
}

/**
 * 将前端筛选状态转换为 Gamma API 参数
 */
export function buildGammaParams(filters: Partial<FilterConfig>): Record<string, any> {
  const params: Record<string, any> = {}
  
  // 分页
  if (filters.limit !== undefined) params.limit = filters.limit
  if (filters.offset !== undefined) params.offset = filters.offset
  
  // 排序 - 转换为 Gamma API 格式
  if (filters.orderBy) {
    const sortConfig = getSortConfig(filters.orderBy)
    params.order = sortConfig.gammaField
    params.ascending = sortConfig.ascending
  }
  
  // 状态筛选
  if (filters.activeFilter && filters.activeFilter !== 'all') {
    params.closed = filters.activeFilter === 'false' // Gamma 用 closed 字段
  }
  
  // 数值范围 - 使用 Gamma API 字段名
  if (filters.liquidityMin !== undefined) params.liquidity_num_min = filters.liquidityMin
  if (filters.liquidityMax !== undefined) params.liquidity_num_max = filters.liquidityMax
  if (filters.volumeMin !== undefined) params.volume_num_min = filters.volumeMin
  if (filters.volumeMax !== undefined) params.volume_num_max = filters.volumeMax
  
  // 日期范围 - 使用 Gamma API 字段名
  if (filters.endDateMin) params.end_date_min = filters.endDateMin
  if (filters.endDateMax) params.end_date_max = filters.endDateMax
  if (filters.startDateMin) params.start_date_min = filters.startDateMin
  if (filters.startDateMax) params.start_date_max = filters.startDateMax
  
  return params
}

/**
 * 将前端筛选状态转换为数据库查询参数
 */
export function buildDbParams(filters: Partial<FilterConfig>): Record<string, any> {
  const params: Record<string, any> = {}
  
  // 分页
  if (filters.limit !== undefined) params.limit = filters.limit
  if (filters.offset !== undefined) params.offset = filters.offset
  
  // 排序
  if (filters.orderBy) {
    const sortConfig = getSortConfig(filters.orderBy)
    params.orderBy = sortConfig.dbField
  }
  if (filters.orderDir) params.orderDir = filters.orderDir
  
  // 搜索
  if (filters.search) params.search = filters.search
  
  // 状态筛选
  if (filters.activeFilter && filters.activeFilter !== 'all') {
    params.active = filters.activeFilter === 'true'
  }
  if (filters.categoryFilter && filters.categoryFilter !== 'all') {
    params.category = filters.categoryFilter
  }
  
  // 数值范围
  if (filters.liquidityMin !== undefined) params.liquidityMin = filters.liquidityMin
  if (filters.liquidityMax !== undefined) params.liquidityMax = filters.liquidityMax
  if (filters.volumeMin !== undefined) params.volumeMin = filters.volumeMin
  if (filters.volumeMax !== undefined) params.volumeMax = filters.volumeMax
  
  // 日期范围
  if (filters.endDateMin) params.endDateMin = filters.endDateMin
  if (filters.endDateMax) params.endDateMax = filters.endDateMax
  if (filters.startDateMin) params.startDateMin = filters.startDateMin
  if (filters.startDateMax) params.startDateMax = filters.startDateMax
  
  return params
}

/**
 * 从 URL SearchParams 解析筛选配置
 */
export function parseUrlParams(searchParams: URLSearchParams): Partial<FilterConfig> {
  const filters: Partial<FilterConfig> = {}
  
  // 分页
  const limit = searchParams.get('limit')
  const offset = searchParams.get('offset')
  if (limit) filters.limit = parseInt(limit)
  if (offset) filters.offset = parseInt(offset)
  
  // 排序
  const orderBy = searchParams.get('orderBy')
  const orderDir = searchParams.get('orderDir')
  if (orderBy) filters.orderBy = orderBy as MarketSortValue
  if (orderDir) filters.orderDir = orderDir.toUpperCase() as 'ASC' | 'DESC'
  
  // 搜索
  const search = searchParams.get('search')
  if (search) filters.search = search
  
  // 状态筛选
  const active = searchParams.get('active')
  const category = searchParams.get('category')
  if (active) filters.activeFilter = active as MarketStatusValue
  if (category) filters.categoryFilter = category
  
  // 数值范围
  const liquidityMin = searchParams.get('liquidityMin')
  const liquidityMax = searchParams.get('liquidityMax')
  const volumeMin = searchParams.get('volumeMin')
  const volumeMax = searchParams.get('volumeMax')
  if (liquidityMin) filters.liquidityMin = parseFloat(liquidityMin)
  if (liquidityMax) filters.liquidityMax = parseFloat(liquidityMax)
  if (volumeMin) filters.volumeMin = parseFloat(volumeMin)
  if (volumeMax) filters.volumeMax = parseFloat(volumeMax)
  
  // 日期范围
  const endDateMin = searchParams.get('endDateMin')
  const endDateMax = searchParams.get('endDateMax')
  const startDateMin = searchParams.get('startDateMin')
  const startDateMax = searchParams.get('startDateMax')
  if (endDateMin) filters.endDateMin = endDateMin
  if (endDateMax) filters.endDateMax = endDateMax
  if (startDateMin) filters.startDateMin = startDateMin
  if (startDateMax) filters.startDateMax = startDateMax
  
  return filters
}

// ==================== 高级筛选辅助 ====================

/**
 * 检查是否有高级筛选条件
 */
export function hasAdvancedFilters(filters: Partial<FilterConfig>): boolean {
  return !!(
    filters.liquidityMin !== undefined ||
    filters.liquidityMax !== undefined ||
    filters.volumeMin !== undefined ||
    filters.volumeMax !== undefined ||
    filters.endDateMin ||
    filters.endDateMax ||
    filters.startDateMin ||
    filters.startDateMax
  )
}

/**
 * 清除高级筛选条件
 */
export function clearAdvancedFilters(filters: Partial<FilterConfig>): Partial<FilterConfig> {
  return {
    ...filters,
    liquidityMin: undefined,
    liquidityMax: undefined,
    volumeMin: undefined,
    volumeMax: undefined,
    endDateMin: undefined,
    endDateMax: undefined,
    startDateMin: undefined,
    startDateMax: undefined,
  }
}

/**
 * 重置所有筛选条件
 */
export function resetAllFilters(): FilterConfig {
  return { ...DEFAULT_FILTER_CONFIG }
}
