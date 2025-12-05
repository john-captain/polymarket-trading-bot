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
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, TrendingUp, Activity, Lock, Unlock, ArrowUpRight, ArrowDownRight, Clock, DollarSign, Filter, Settings2 } from "lucide-react"

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

interface SyncResult {
  synced: number
  inserted: number
  updated: number
  hasMore: boolean
  nextOffset: number
}

// 官方支持的排序字段
const SYNC_ORDER_OPTIONS = [
  { value: "volume", label: "交易量 (高→低)" },
  { value: "liquidity", label: "流动性 (高→低)" },
  { value: "volume24hr", label: "24h交易量" },
  { value: "volume1wk", label: "7天交易量" },
  { value: "end_date_asc", label: "结束时间 (近→远)" },
  { value: "end_date_desc", label: "结束时间 (远→近)" },
  { value: "start_date", label: "开始时间" },
  { value: "created_desc", label: "创建时间 (新→旧)" },
  { value: "created_asc", label: "创建时间 (旧→新)" },
  { value: "id_desc", label: "市场ID (新→旧)" },
  { value: "id_asc", label: "市场ID (旧→新)" },
]

export default function MarketSyncPage() {
  const [stats, setStats] = useState<MarketStats | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncOffset, setSyncOffset] = useState(0)
  
  // 同步选项 - 基于官方 API 参数
  const [syncOrderBy, setSyncOrderBy] = useState<string>("volume")
  const [syncClosed, setSyncClosed] = useState<string>("false") // "true", "false", "all"
  const [syncLiquidityMin, setSyncLiquidityMin] = useState<string>("")
  const [syncLiquidityMax, setSyncLiquidityMax] = useState<string>("")
  const [syncVolumeMin, setSyncVolumeMin] = useState<string>("")
  const [syncVolumeMax, setSyncVolumeMax] = useState<string>("")
  const [syncEndDateMin, setSyncEndDateMin] = useState<string>("")
  const [syncEndDateMax, setSyncEndDateMax] = useState<string>("")
  const [syncStartDateMin, setSyncStartDateMin] = useState<string>("")
  const [syncStartDateMax, setSyncStartDateMax] = useState<string>("")
  const [syncTagId, setSyncTagId] = useState<string>("")
  const [syncRelatedTags, setSyncRelatedTags] = useState<boolean>(false)
  const [syncLimit, setSyncLimit] = useState<string>("100")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false)
  
  // 筛选和分页
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [listOrderBy, setListOrderBy] = useState<string>("volume")
  const [page, setPage] = useState(0)
  const [totalMarkets, setTotalMarkets] = useState(0)
  const pageSize = 20

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
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
        orderBy: listOrderBy,
        orderDir: "DESC",
      })
      if (search) params.set("search", search)
      if (activeFilter !== "all") params.set("active", activeFilter)
      if (categoryFilter !== "all") params.set("category", categoryFilter)

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
  }, [page, search, activeFilter, categoryFilter, listOrderBy])

  // 构建同步参数
  const buildSyncParams = () => {
    const params: Record<string, any> = {
      limit: parseInt(syncLimit) || 100,
    }
    
    // 解析排序选项 - 映射到官方 API 的 order 参数
    // 官方支持的 order 字段: volume, liquidity, volume24hr, volume1wk, endDate, startDate, createdAt, id
    const orderMappings: Record<string, { order: string; ascending: boolean }> = {
      "volume": { order: "volume", ascending: false },
      "liquidity": { order: "liquidity", ascending: false },
      "volume24hr": { order: "volume24hr", ascending: false },
      "volume1wk": { order: "volume1wk", ascending: false },
      "end_date_asc": { order: "endDate", ascending: true },
      "end_date_desc": { order: "endDate", ascending: false },
      "start_date": { order: "startDate", ascending: false },
      "created_desc": { order: "createdAt", ascending: false },
      "created_asc": { order: "createdAt", ascending: true },
      "id_desc": { order: "id", ascending: false },
      "id_asc": { order: "id", ascending: true },
    }
    
    const orderConfig = orderMappings[syncOrderBy] || { order: "volume", ascending: false }
    params.order = orderConfig.order
    params.ascending = orderConfig.ascending
    
    // 状态筛选
    if (syncClosed !== "all") {
      params.closed = syncClosed === "true"
    }
    
    // 流动性范围
    if (syncLiquidityMin) params.liquidity_num_min = parseFloat(syncLiquidityMin)
    if (syncLiquidityMax) params.liquidity_num_max = parseFloat(syncLiquidityMax)
    
    // 交易量范围
    if (syncVolumeMin) params.volume_num_min = parseFloat(syncVolumeMin)
    if (syncVolumeMax) params.volume_num_max = parseFloat(syncVolumeMax)
    
    // 日期范围
    if (syncEndDateMin) params.end_date_min = syncEndDateMin
    if (syncEndDateMax) params.end_date_max = syncEndDateMax
    if (syncStartDateMin) params.start_date_min = syncStartDateMin
    if (syncStartDateMax) params.start_date_max = syncStartDateMax
    
    // 标签
    if (syncTagId) params.tag_id = parseInt(syncTagId)
    if (syncRelatedTags) params.related_tags = true
    
    return params
  }

  // 同步市场
  const syncMarkets = async (offset: number = 0) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const params = buildSyncParams()
      params.offset = offset
      
      const res = await fetch("/api/markets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (data.success) {
        setSyncResult(data.data)
        setSyncOffset(data.data.nextOffset)
        // 刷新数据
        await loadStats()
        await loadMarkets()
      } else {
        console.error("同步失败:", data.error)
      }
    } catch (error) {
      console.error("同步失败:", error)
    } finally {
      setSyncing(false)
    }
  }

  // 继续同步下一批
  const continueSync = () => {
    syncMarkets(syncOffset)
  }

  useEffect(() => {
    loadStats()
    loadMarkets()
  }, [loadStats, loadMarkets])

  // 搜索/筛选时重置页码
  useEffect(() => {
    setPage(0)
  }, [search, activeFilter, categoryFilter, listOrderBy])

  const totalPages = Math.ceil(totalMarkets / pageSize)

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

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">市场同步</h1>
        <p className="text-muted-foreground">从 Polymarket 同步市场数据到本地数据库</p>
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

      {/* 同步控制 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>同步控制</CardTitle>
              <CardDescription>从 Polymarket Gamma API 同步市场数据（支持官方所有筛选参数）</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              {showAdvancedFilters ? "收起高级筛选" : "展开高级筛选"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 基础同步选项 */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">排序方式:</span>
              <Select value={syncOrderBy} onValueChange={setSyncOrderBy}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_ORDER_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">市场状态:</span>
              <Select value={syncClosed} onValueChange={setSyncClosed}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">仅活跃</SelectItem>
                  <SelectItem value="true">仅关闭</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">每次数量:</span>
              <Select value={syncLimit} onValueChange={setSyncLimit}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 高级筛选选项 */}
          {showAdvancedFilters && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              <div className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" />
                高级筛选条件（基于官方 Gamma API）
              </div>
              
              {/* 流动性范围 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">最小流动性 ($)</label>
                  <Input
                    type="number"
                    placeholder="liquidity_num_min"
                    value={syncLiquidityMin}
                    onChange={(e) => setSyncLiquidityMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">最大流动性 ($)</label>
                  <Input
                    type="number"
                    placeholder="liquidity_num_max"
                    value={syncLiquidityMax}
                    onChange={(e) => setSyncLiquidityMax(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">最小交易量 ($)</label>
                  <Input
                    type="number"
                    placeholder="volume_num_min"
                    value={syncVolumeMin}
                    onChange={(e) => setSyncVolumeMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">最大交易量 ($)</label>
                  <Input
                    type="number"
                    placeholder="volume_num_max"
                    value={syncVolumeMax}
                    onChange={(e) => setSyncVolumeMax(e.target.value)}
                  />
                </div>
              </div>
              
              {/* 日期范围 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">结束时间 (从)</label>
                  <Input
                    type="datetime-local"
                    value={syncEndDateMin}
                    onChange={(e) => setSyncEndDateMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">结束时间 (至)</label>
                  <Input
                    type="datetime-local"
                    value={syncEndDateMax}
                    onChange={(e) => setSyncEndDateMax(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">开始时间 (从)</label>
                  <Input
                    type="datetime-local"
                    value={syncStartDateMin}
                    onChange={(e) => setSyncStartDateMin(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">开始时间 (至)</label>
                  <Input
                    type="datetime-local"
                    value={syncStartDateMax}
                    onChange={(e) => setSyncStartDateMax(e.target.value)}
                  />
                </div>
              </div>
              
              {/* 标签筛选 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">标签 ID (tag_id)</label>
                  <Input
                    type="number"
                    placeholder="如 100381 (Sports)"
                    value={syncTagId}
                    onChange={(e) => setSyncTagId(e.target.value)}
                  />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer h-10">
                    <input
                      type="checkbox"
                      checked={syncRelatedTags}
                      onChange={(e) => setSyncRelatedTags(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">包含相关标签 (related_tags)</span>
                  </label>
                </div>
              </div>
              
              {/* 常用标签快捷选择 */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">常用标签快捷选择 (基于官方 API):</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "", label: "全部" },
                    { id: "102", label: "🏛️ 政治" },
                    { id: "103", label: "⚽ 体育" },
                    { id: "104", label: "₿ 加密货币" },
                    { id: "105", label: "🎬 流行文化" },
                    { id: "106", label: "💼 商业" },
                    { id: "107", label: "🔬 科学" },
                  ].map(tag => (
                    <Badge 
                      key={tag.id || "all"}
                      variant={syncTagId === tag.id ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSyncTagId(tag.id)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { id: "375", label: "🇺🇸 美国大选" },
                    { id: "359", label: "🗳️ 2024总统大选" },
                    { id: "306", label: "⚽ 英超" },
                    { id: "100351", label: "🏈 大学橄榄球" },
                    { id: "366", label: "🌍 世界事务" },
                    { id: "440", label: "🤖 AI/GPT" },
                  ].map(tag => (
                    <Badge 
                      key={tag.id}
                      variant={syncTagId === tag.id ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSyncTagId(tag.id)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* 清除筛选 */}
              <div className="flex justify-end">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setSyncLiquidityMin("")
                    setSyncLiquidityMax("")
                    setSyncVolumeMin("")
                    setSyncVolumeMax("")
                    setSyncEndDateMin("")
                    setSyncEndDateMax("")
                    setSyncStartDateMin("")
                    setSyncStartDateMax("")
                    setSyncTagId("")
                    setSyncRelatedTags(false)
                  }}
                >
                  清除所有筛选
                </Button>
              </div>
            </div>
          )}
          
          {/* 同步按钮 */}
          <div className="flex items-center gap-4">
            <Button onClick={() => syncMarkets(0)} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "同步中..." : "开始同步"}
            </Button>
            
            {syncResult?.hasMore && (
              <Button variant="outline" onClick={continueSync} disabled={syncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                继续同步 (offset: {syncOffset})
              </Button>
            )}
          </div>

          {syncResult && (
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg flex-wrap">
              <Badge variant="default">同步完成</Badge>
              <span>共处理 <strong>{syncResult.synced}</strong> 个市场</span>
              <span className="text-green-600">新增 <strong>{syncResult.inserted}</strong></span>
              <span className="text-blue-600">更新 <strong>{syncResult.updated}</strong></span>
              {syncResult.hasMore && (
                <Badge variant="outline">还有更多市场可同步</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 市场列表 */}
      <Card>
        <CardHeader>
          <CardTitle>已同步市场</CardTitle>
          <CardDescription>共 {totalMarkets} 个市场</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 筛选工具栏 */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索市场..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="true">活跃</SelectItem>
                <SelectItem value="false">已关闭</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {stats?.categories?.map(cat => (
                  <SelectItem key={cat.category} value={cat.category}>
                    {cat.category} ({cat.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={listOrderBy} onValueChange={setListOrderBy}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="volume">总交易量</SelectItem>
                <SelectItem value="volume_24hr">24h交易量</SelectItem>
                <SelectItem value="volume_1wk">7天交易量</SelectItem>
                <SelectItem value="liquidity">流动性</SelectItem>
                <SelectItem value="end_date">结束时间</SelectItem>
                <SelectItem value="one_day_price_change">24h涨跌</SelectItem>
                <SelectItem value="updated_at">更新时间</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadMarkets} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

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
                      {loading ? "加载中..." : "暂无数据，请先同步市场"}
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
                            {market.category && (
                              <Badge variant="outline" className="w-fit text-xs">
                                {market.category}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {prices.length >= 2 ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-sm">
                                <span className="text-green-600 font-semibold">{outcomes[0] || 'Yes'}: {(prices[0] * 100).toFixed(0)}¢</span>
                              </span>
                              <span className="font-mono text-sm">
                                <span className="text-red-600 font-semibold">{outcomes[1] || 'No'}: {(prices[1] * 100).toFixed(0)}¢</span>
                              </span>
                            </div>
                          ) : prices.length === 1 ? (
                            <span className="font-mono text-lg font-semibold">
                              {(prices[0] * 100).toFixed(0)}¢
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
