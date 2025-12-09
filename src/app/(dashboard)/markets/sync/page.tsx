"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, TrendingUp, Activity, Lock, Unlock, ArrowUpRight, ArrowDownRight, Clock, Filter, Settings2, X, Copy, Check } from "lucide-react"
import {
  MARKET_STATUS_OPTIONS,
  MARKET_SORT_OPTIONS,
  MARKET_CATEGORY_OPTIONS,
  NUMERIC_FILTER_FIELDS,
  DATE_FILTER_FIELDS,
  DEFAULT_FILTER_CONFIG,
  buildApiParams,
  hasAdvancedFilters as checkAdvancedFilters,
  type FilterConfig,
  type MarketStatusValue,
  type MarketSortValue,
  type MarketCategoryValue,
} from "@/lib/filter-config"

interface MarketStats {
  total: number
  active: number
  closed: number
  restricted: number
  withOrderBook: number
  categories?: { category: string; count: number }[]
}

interface Market {
  id: number
  conditionId: string
  slug: string
  question: string
  category: string
  outcomes: string | string[]
  outcomePrices: string | number[]
  volume: number
  volume24hr: number
  volume1wk: number
  liquidity: number
  bestBid: number | null
  bestAsk: number | null
  spread: number | null
  lastTradePrice: number | null
  oneDayPriceChange: number | null
  oneWeekPriceChange: number | null
  endDate: string | null
  active: boolean | number
  closed: boolean | number
  restricted: boolean | number
  enableOrderBook: boolean | number
  image: string | null
  createdAt: string
  updatedAt: string
}

export default function MarketSyncPage() {
  const [stats, setStats] = useState<MarketStats | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // 使用统一配置的筛选状态
  const [search, setSearch] = useState(DEFAULT_FILTER_CONFIG.search)
  const [activeFilter, setActiveFilter] = useState<MarketStatusValue>(DEFAULT_FILTER_CONFIG.activeFilter)
  const [categoryFilter, setCategoryFilter] = useState<MarketCategoryValue>(DEFAULT_FILTER_CONFIG.categoryFilter as MarketCategoryValue)
  const [listOrderBy, setListOrderBy] = useState<MarketSortValue>(DEFAULT_FILTER_CONFIG.orderBy)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  
  // 高级筛选
  const [liquidityMin, setLiquidityMin] = useState("")
  const [liquidityMax, setLiquidityMax] = useState("")
  const [volumeMin, setVolumeMin] = useState("")
  const [volumeMax, setVolumeMax] = useState("")
  const [endDateMin, setEndDateMin] = useState("")
  const [endDateMax, setEndDateMax] = useState("")
  
  // 分页
  const [page, setPage] = useState(0)
  const [totalMarkets, setTotalMarkets] = useState(0)
  const pageSize = DEFAULT_FILTER_CONFIG.limit

  // 加载统计信息
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/markets/sync")
      const data = await res.json()
      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error("加载统计失败:", error)
    }
  }, [])

  // 加载市场列表
  const loadMarkets = useCallback(async () => {
    setLoading(true)
    try {
      // 使用统一配置构建 API 参数
      const params = buildApiParams({
        limit: pageSize,
        offset: page * pageSize,
        orderBy: listOrderBy,
        orderDir: 'DESC',
        search: search || undefined,
        activeFilter,
        categoryFilter,
        liquidityMin: liquidityMin ? parseFloat(liquidityMin) : undefined,
        liquidityMax: liquidityMax ? parseFloat(liquidityMax) : undefined,
        volumeMin: volumeMin ? parseFloat(volumeMin) : undefined,
        volumeMax: volumeMax ? parseFloat(volumeMax) : undefined,
        endDateMin: endDateMin || undefined,
        endDateMax: endDateMax || undefined,
      })

      const res = await fetch(`/api/markets?${params}`)
      const data = await res.json()
      if (data.success) {
        setMarkets(data.data)
        setTotalMarkets(data.pagination.total)
      }
    } catch (error) {
      console.error("加载市场失败:", error)
    } finally {
      setLoading(false)
    }
  }, [page, search, activeFilter, categoryFilter, listOrderBy, liquidityMin, liquidityMax, volumeMin, volumeMax, endDateMin, endDateMax])

  useEffect(() => {
    loadStats()
  }, [loadStats])
  
  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  // 搜索/筛选时重置页码
  useEffect(() => {
    setPage(0)
  }, [search, activeFilter, categoryFilter, listOrderBy, liquidityMin, liquidityMax, volumeMin, volumeMax, endDateMin, endDateMax])

  const totalPages = Math.ceil(totalMarkets / pageSize)

  // 清除高级筛选
  const clearAdvancedFilters = () => {
    setLiquidityMin("")
    setLiquidityMax("")
    setVolumeMin("")
    setVolumeMax("")
    setEndDateMin("")
    setEndDateMax("")
  }
  
  // 检查是否有高级筛选 - 使用统一配置的函数
  const hasAdvancedFilters = checkAdvancedFilters({
    liquidityMin: liquidityMin ? parseFloat(liquidityMin) : undefined,
    liquidityMax: liquidityMax ? parseFloat(liquidityMax) : undefined,
    volumeMin: volumeMin ? parseFloat(volumeMin) : undefined,
    volumeMax: volumeMax ? parseFloat(volumeMax) : undefined,
    endDateMin: endDateMin || undefined,
    endDateMax: endDateMax || undefined,
  })

  // 格式化价格变化
  const formatPriceChange = (change: number | null) => {
    if (change === null || change === undefined) return null
    const percent = change * 100
    if (percent > 0) {
      return <span className="text-green-600 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />+{percent.toFixed(1)}%</span>
    } else if (percent < 0) {
      return <span className="text-red-600 flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{percent.toFixed(1)}%</span>
    }
    return <span className="text-gray-500">0%</span>
  }

  // 解析价格数组
  const parsePrices = (market: Market): number[] => {
    let prices = market.outcomePrices
    if (typeof prices === 'string') {
      try { prices = JSON.parse(prices) } catch { prices = [] }
    }
    if (Array.isArray(prices)) {
      return prices.map(p => {
        const price = typeof p === 'string' ? parseFloat(p) : p
        return isNaN(price) ? 0 : price
      })
    }
    return []
  }

  // 解析结果名称数组
  const parseOutcomes = (market: Market): string[] => {
    let outcomes = market.outcomes
    if (typeof outcomes === 'string') {
      try { outcomes = JSON.parse(outcomes) } catch { outcomes = [] }
    }
    return Array.isArray(outcomes) ? outcomes : []
  }

  // 复制 conditionId 到剪贴板
  const copyConditionId = async (conditionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(conditionId)
      setCopiedId(conditionId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">市场列表</h1>
        <p className="text-muted-foreground">浏览和筛选已同步的 Polymarket 市场数据</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总市场数</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活跃市场</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.active || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已关闭</CardTitle>
            <Lock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{stats?.closed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">受限市场</CardTitle>
            <Lock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats?.restricted || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可交易</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.withOrderBook || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* 市场列表 */}
      <Card>
        <CardHeader>
          <CardTitle>市场列表</CardTitle>
          <CardDescription>共 {totalMarkets} 个市场</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 筛选和排序工具栏 */}
          <div className="flex flex-col gap-3">
            {/* 第一行：筛选 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Filter className="h-4 w-4" />
                筛选:
              </span>
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索市场..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as MarketStatusValue)}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as MarketCategoryValue)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="分类" />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.value || 'all'} value={option.value || 'all'}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant={showAdvancedFilters ? "secondary" : "outline"} 
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                高级筛选
                {hasAdvancedFilters && <Badge className="ml-2 h-5" variant="default">已设置</Badge>}
              </Button>
            </div>
            
            {/* 第二行：排序和刷新 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4" />
                  排序:
                </span>
                <Select value={listOrderBy} onValueChange={(v) => setListOrderBy(v as MarketSortValue)}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="排序方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKET_SORT_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">降序排列</span>
              </div>
              <Button variant="outline" size="sm" onClick={loadMarkets} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </div>
          
          {/* 高级筛选面板 */}
          {showAdvancedFilters && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  高级筛选条件
                </div>
                {hasAdvancedFilters && (
                  <Button variant="ghost" size="sm" onClick={clearAdvancedFilters}>
                    <X className="h-4 w-4 mr-1" />
                    清除筛选
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 数值范围筛选 - 使用统一配置 */}
                {NUMERIC_FILTER_FIELDS.map(field => (
                  <>
                    <div key={`${field.key}-min`} className="space-y-1">
                      <label className="text-xs text-muted-foreground">最小{field.label} ({field.unit})</label>
                      <Input
                        type="number"
                        placeholder={field.placeholder.min}
                        value={field.key === 'liquidity' ? liquidityMin : volumeMin}
                        onChange={(e) => field.key === 'liquidity' ? setLiquidityMin(e.target.value) : setVolumeMin(e.target.value)}
                      />
                    </div>
                    <div key={`${field.key}-max`} className="space-y-1">
                      <label className="text-xs text-muted-foreground">最大{field.label} ({field.unit})</label>
                      <Input
                        type="number"
                        placeholder={field.placeholder.max}
                        value={field.key === 'liquidity' ? liquidityMax : volumeMax}
                        onChange={(e) => field.key === 'liquidity' ? setLiquidityMax(e.target.value) : setVolumeMax(e.target.value)}
                      />
                    </div>
                  </>
                ))}
                
                {/* 日期范围筛选 - 使用统一配置 */}
                {DATE_FILTER_FIELDS.map(field => (
                  <>
                    <div key={`${field.key}-min`} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{field.label} (从)</label>
                      <Input
                        type="date"
                        value={endDateMin}
                        onChange={(e) => setEndDateMin(e.target.value)}
                      />
                    </div>
                    <div key={`${field.key}-max`} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{field.label} (至)</label>
                      <Input
                        type="date"
                        value={endDateMax}
                        onChange={(e) => setEndDateMax(e.target.value)}
                      />
                    </div>
                  </>
                ))}
              </div>
            </div>
          )}

          {/* 表格 */}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[320px]">市场</TableHead>
                  <TableHead className="text-center">价格</TableHead>
                  <TableHead className="text-center">24h涨跌</TableHead>
                  <TableHead className="text-right">总交易量</TableHead>
                  <TableHead className="text-right">24h交易量</TableHead>
                  <TableHead className="text-right">流动性</TableHead>
                  <TableHead className="text-center">结束时间</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {loading ? "加载中..." : "暂无数据"}
                    </TableCell>
                  </TableRow>
                ) : (
                  markets.map((market) => {
                    const prices = parsePrices(market)
                    const outcomes = parseOutcomes(market)
                    return (
                      <TableRow key={market.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium line-clamp-2 text-sm" title={market.question}>
                              {market.question}
                            </div>
                            <div className="flex items-center gap-2">
                              {market.category && (
                                <Badge variant="outline" className="w-fit text-xs">
                                  {market.category}
                                </Badge>
                              )}
                              <button
                                onClick={(e) => copyConditionId(market.conditionId, e)}
                                className="group flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted hover:bg-muted-foreground/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                title={`点击复制: ${market.conditionId}`}
                              >
                                <code className="select-none">
                                  {market.conditionId.slice(0, 10)}...
                                </code>
                                {copiedId === market.conditionId ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {prices.length >= 2 ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-sm">
                                <span className="text-green-600 font-semibold">{outcomes[0] || 'Yes'}: {(prices[0] * 100).toFixed(2)}¢</span>
                              </span>
                              <span className="font-mono text-sm">
                                <span className="text-red-600 font-semibold">{outcomes[1] || 'No'}: {(prices[1] * 100).toFixed(2)}¢</span>
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                Σ = {(prices.reduce((a, b) => a + b, 0) * 100).toFixed(2)}¢
                              </span>
                            </div>
                          ) : prices.length === 1 ? (
                            <span className="font-mono text-lg font-semibold">
                              {(prices[0] * 100).toFixed(2)}¢
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {formatPriceChange(market.oneDayPriceChange)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${(market.volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(market.volume24hr || 0) > 0 ? (
                            <span className="text-green-600">
                              ${(market.volume24hr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${(market.liquidity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {market.endDate ? (
                            <div className="flex items-center justify-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(market.endDate).toLocaleDateString("zh-CN")}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {market.active ? (
                              <Badge variant="default" className="bg-green-500">活跃</Badge>
                            ) : (
                              <Badge variant="secondary">关闭</Badge>
                            )}
                            {market.restricted && (
                              <Badge variant="outline" className="text-orange-500 border-orange-500">受限</Badge>
                            )}
                            {market.enableOrderBook && (
                              <span title="可交易">
                                <Unlock className="h-3 w-3 text-blue-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                显示 {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalMarkets)} / {totalMarkets}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <span className="text-sm">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
