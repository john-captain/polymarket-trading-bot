"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  PlayCircle,
  StopCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter,
  Zap,
  Target,
  Clock,
  AlertCircle,
  DollarSign,
  Loader2,
  HelpCircle,
  Settings,
} from "lucide-react"

// API 请求
async function fetchArbitrageStats() {
  const res = await fetch("/api/arbitrage/stats")
  return res.json()
}

async function fetchArbitrageMarkets() {
  const res = await fetch("/api/arbitrage/markets")
  return res.json()
}

async function fetchArbitrageLogs() {
  const res = await fetch("/api/arbitrage/logs")
  return res.json()
}

async function fetchArbitrageSettings() {
  const res = await fetch("/api/arbitrage/settings")
  return res.json()
}

// 执行套利交易
interface ExecuteTradeParams {
  market: Market
  tradeType: "LONG" | "SHORT"
  amount: number
  simulate?: boolean
}

async function executeArbitrageTrade(params: ExecuteTradeParams) {
  const res = await fetch("/api/arbitrage/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conditionId: params.market.conditionId,
      question: params.market.question,
      tokens: params.market.tokens || [],
      priceSum: params.market.priceSum,
      tradeType: params.tradeType,
      amount: params.amount,
      simulate: params.simulate ?? true,  // 默认模拟模式
    }),
  })
  return res.json()
}

interface Market {
  question: string
  conditionId: string
  tokens?: { token_id: string; outcome: string }[]
  spread: number
  realAskSum?: number
  realBidSum?: number
  priceSum?: number
  isArbitrage: boolean
  arbitrageType?: "LONG" | "SHORT"
  estimatedProfit?: number
}

export default function MarketScanPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [executingMarketId, setExecutingMarketId] = useState<string | null>(null)
  const [tradeAmount, setTradeAmount] = useState(10)
  const [showHelp, setShowHelp] = useState(false)
  
  // 过滤设置状态
  const [minVolumeFilter, setMinVolumeFilter] = useState(100)
  const [minSpreadFilter, setMinSpreadFilter] = useState(1.0)
  const [minLiquidity, setMinLiquidity] = useState(0)
  const [category, setCategory] = useState("")
  const [excludeRestricted, setExcludeRestricted] = useState(false)
  const [onlyBinaryMarkets, setOnlyBinaryMarkets] = useState(false)

  // 数据查询
  const { data: stats } = useQuery({
    queryKey: ["arbitrageStats"],
    queryFn: fetchArbitrageStats,
    refetchInterval: autoRefresh ? 3000 : false,
  })

  const { data: marketsData, isLoading } = useQuery({
    queryKey: ["arbitrageMarkets"],
    queryFn: fetchArbitrageMarkets,
    refetchInterval: autoRefresh ? 5000 : false,
  })

  const { data: logsData } = useQuery({
    queryKey: ["arbitrageLogs"],
    queryFn: fetchArbitrageLogs,
    refetchInterval: autoRefresh ? 3000 : false,
  })

  const { data: settingsData } = useQuery({
    queryKey: ["arbitrageSettings"],
    queryFn: fetchArbitrageSettings,
  })

  // 当设置数据加载后更新本地状态
  const settings = settingsData?.data || {}
  const categories = settingsData?.categories || []
  
  // 更新设置
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: {
      minVolumeFilter?: number
      minSpread?: number
      minLiquidity?: number
      category?: string
      excludeRestricted?: boolean
      maxOutcomes?: number
    }) => {
      const res = await fetch("/api/arbitrage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageSettings"] })
      toast({ title: "✅ 设置已更新" })
    },
    onError: () => toast({ title: "❌ 设置更新失败", variant: "destructive" }),
  })

  // 手动扫描
  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/arbitrage/scan", { method: "POST" })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      queryClient.invalidateQueries({ queryKey: ["arbitrageMarkets"] })
      toast({ title: `✅ 扫描完成`, description: `发现 ${data.data?.opportunityCount || 0} 个套利机会` })
    },
    onError: () => toast({ title: "❌ 扫描失败", variant: "destructive" }),
  })

  // 启动/停止
  const startMutation = useMutation({
    mutationFn: () => fetch("/api/arbitrage/start", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      setAutoRefresh(true)
      toast({ title: "✅ 套利扫描已启动" })
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => fetch("/api/arbitrage/stop", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      setAutoRefresh(false)
      toast({ title: "⏹️ 套利扫描已停止" })
    },
  })

  // 执行套利交易
  const executeMutation = useMutation({
    mutationFn: (params: ExecuteTradeParams) => executeArbitrageTrade(params),
    onMutate: (params) => {
      setExecutingMarketId(params.market.conditionId)
    },
    onSuccess: (data, params) => {
      setExecutingMarketId(null)
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
        queryClient.invalidateQueries({ queryKey: ["arbitrageMarkets"] })
        toast({
          title: data.data?.simulated ? "✅ 模拟交易成功" : "✅ 交易执行成功",
          description: `${params.tradeType} $${params.amount.toFixed(2)} | 预估利润: $${data.data?.profit?.toFixed(4) || 0}`,
        })
      } else {
        toast({
          title: "❌ 交易失败",
          description: data.error || "未知错误",
          variant: "destructive",
        })
      }
    },
    onError: (error: Error) => {
      setExecutingMarketId(null)
      toast({
        title: "❌ 交易失败",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  // 处理执行按钮点击
  const handleExecute = (market: Market, simulate: boolean = true) => {
    if (!market.arbitrageType) return
    executeMutation.mutate({
      market,
      tradeType: market.arbitrageType,
      amount: tradeAmount,
      simulate,
    })
  }

  const isRunning = stats?.data?.isRunning || false
  const markets: Market[] = marketsData?.data || []
  const logs: string[] = logsData?.data || []

  // 过滤市场
  const filteredMarkets = markets.filter((m) =>
    m.question?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 套利机会数
  const opportunities = markets.filter((m) => m.isArbitrage)

  return (
    <div className="flex flex-col">
      <Header
        title="套利扫描"
        description="实时扫描 Polymarket 市场，发现套利机会"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 顶部控制栏 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => startMutation.mutate()}
              disabled={isRunning || startMutation.isPending}
              variant="default"
              className="gap-2"
            >
              <PlayCircle className="h-4 w-4" />
              启动扫描
            </Button>
            <Button
              onClick={() => stopMutation.mutate()}
              disabled={!isRunning || stopMutation.isPending}
              variant="destructive"
              className="gap-2"
            >
              <StopCircle className="h-4 w-4" />
              停止扫描
            </Button>
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              手动扫描
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <span className="text-sm text-muted-foreground">自动刷新</span>
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            </div>
            <Badge variant={isRunning ? "default" : "secondary"} className="gap-1">
              <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
              {isRunning ? "运行中" : "已停止"}
            </Badge>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">市场总数</p>
                  <p className="text-2xl font-bold">{stats?.data?.totalMarketCount?.toLocaleString() || 0}</p>
                </div>
                <Target className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">过滤后市场</p>
                  <p className="text-2xl font-bold">{stats?.data?.filteredMarketCount?.toLocaleString() || markets.length}</p>
                </div>
                <Filter className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">扫描次数</p>
                  <p className="text-2xl font-bold">{stats?.data?.scanCount?.toLocaleString() || 0}</p>
                </div>
                <Search className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card className={opportunities.length > 0 ? "border-success/50 bg-success/5" : ""}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">发现机会</p>
                  <p className={`text-2xl font-bold ${opportunities.length > 0 ? "text-success" : ""}`}>
                    {opportunities.length}
                  </p>
                </div>
                <Zap className={`h-8 w-8 ${opportunities.length > 0 ? "text-success" : "text-muted-foreground/50"}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 过滤设置 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                过滤设置
              </CardTitle>
              <Dialog open={showHelp} onOpenChange={setShowHelp}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <HelpCircle className="h-4 w-4" />
                    页面说明
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>套利扫描页面说明</DialogTitle>
                    <DialogDescription>
                      了解本页面的功能和套利逻辑
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 text-sm">
                    <section>
                      <h3 className="font-semibold text-base mb-2">📌 功能概述</h3>
                      <p className="text-muted-foreground">
                        本页面用于扫描 Polymarket 预测市场，自动发现套利机会。当所有结果的买入价之和小于 1（做多机会）或卖出价之和大于 1（做空机会）时，存在无风险套利空间。
                      </p>
                    </section>

                    <section>
                      <h3 className="font-semibold text-base mb-2">🔗 调用的官方 API</h3>
                      <div className="space-y-3 text-muted-foreground">
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="font-medium text-blue-700">1. Gamma Markets API - 获取市场列表</p>
                          <p className="mt-1 font-mono text-xs break-all">GET https://gamma-api.polymarket.com/markets</p>
                          <p className="text-xs mt-1">参数: active, closed, limit, offset, volume_num_min, liquidity_num_min, tag_id 等</p>
                          <a href="https://docs.polymarket.com/api-reference/markets/list-markets" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                            📄 官方文档 →
                          </a>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="font-medium text-purple-700">2. CLOB API - 获取订单簿价格</p>
                          <p className="mt-1 font-mono text-xs break-all">GET https://clob.polymarket.com/book?token_id=xxx</p>
                          <p className="text-xs mt-1">返回: bids (买单), asks (卖单), 用于计算真实买入/卖出价</p>
                          <a href="https://docs.polymarket.com/api-reference/orderbook/get-order-book-summary" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline mt-1 inline-block">
                            📄 官方文档 →
                          </a>
                        </div>
                        <p className="text-xs">
                          <a href="https://docs.polymarket.com/developers/gamma-markets-api/overview" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Gamma API 概述
                          </a>
                          {" | "}
                          <a href="https://docs.polymarket.com/developers/CLOB/introduction" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            CLOB API 介绍
                          </a>
                          {" | "}
                          <a href="https://docs.polymarket.com/developers/CLOB/endpoints" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            API 端点列表
                          </a>
                        </p>
                      </div>
                    </section>

                    <section>
                      <h3 className="font-semibold text-base mb-2">📊 套利逻辑</h3>
                      <div className="space-y-3 text-muted-foreground">
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="font-medium text-green-700">做多 (LONG)</p>
                          <p className="mt-1">当所有结果的买入价之和 &lt; 1 时，买入所有结果，无论哪个结果发生都能获得 $1</p>
                          <p className="text-xs mt-1">利润 = 1 - 买入总价</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="font-medium text-red-700">做空 (SHORT)</p>
                          <p className="mt-1">当所有结果的卖出价之和 &gt; 1 时，卖出所有结果（需要持仓）</p>
                          <p className="text-xs mt-1">利润 = 卖出总价 - 1</p>
                        </div>
                        <p className="text-xs">价差计算公式: (1 - 买入总价) / 买入总价 × 100%</p>
                      </div>
                    </section>

                    <section>
                      <h3 className="font-semibold text-base mb-2">⚙️ 过滤参数说明</h3>
                      <ul className="space-y-2 text-muted-foreground">
                        <li><strong>最小交易量:</strong> 过滤掉交易量低于设定值的市场（低流动性市场难以成交）</li>
                        <li><strong>最小流动性:</strong> 过滤掉流动性低于设定值的市场</li>
                        <li><strong>最小价差:</strong> 只显示价差大于设定值的套利机会</li>
                        <li><strong>市场分类:</strong> 只扫描特定分类的市场（如加密货币、体育等）</li>
                        <li><strong>排除受限市场:</strong> 排除有地区限制的市场</li>
                        <li><strong>仅二元市场:</strong> 只扫描有 2 个结果的市场（Yes/No）</li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="font-semibold text-base mb-2">💡 使用建议</h3>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• 建议设置最小交易量 ≥ $1000，确保市场有足够流动性</li>
                        <li>• 套利机会通常很短暂，发现后需要快速执行</li>
                        <li>• 注意交易手续费可能会吃掉小额套利利润</li>
                        <li>• 建议先用模拟模式验证策略</li>
                      </ul>
                    </section>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* 第一行：数值过滤 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">最小交易量</span>
                <Input
                  type="number"
                  value={minVolumeFilter}
                  onChange={(e) => setMinVolumeFilter(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-24 h-8 text-sm"
                  min={0}
                  step={100}
                />
                <span className="text-sm text-muted-foreground">$</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">最小流动性</span>
                <Input
                  type="number"
                  value={minLiquidity}
                  onChange={(e) => setMinLiquidity(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-24 h-8 text-sm"
                  min={0}
                  step={100}
                />
                <span className="text-sm text-muted-foreground">$</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">最小价差</span>
                <Input
                  type="number"
                  value={minSpreadFilter}
                  onChange={(e) => setMinSpreadFilter(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-20 h-8 text-sm"
                  min={0}
                  step={0.1}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">市场分类</span>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-32 h-8 text-sm">
                    <SelectValue placeholder="全部" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat: { value: string; label: string }) => (
                      <SelectItem key={cat.value} value={cat.value || "all"}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 mt-4">
              {/* 第二行：开关选项 */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={excludeRestricted}
                  onCheckedChange={setExcludeRestricted}
                  id="excludeRestricted"
                />
                <label htmlFor="excludeRestricted" className="text-sm text-muted-foreground cursor-pointer">
                  排除受限市场
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={onlyBinaryMarkets}
                  onCheckedChange={setOnlyBinaryMarkets}
                  id="onlyBinaryMarkets"
                />
                <label htmlFor="onlyBinaryMarkets" className="text-sm text-muted-foreground cursor-pointer">
                  仅二元市场
                </label>
              </div>
              <Button
                size="sm"
                onClick={() => updateSettingsMutation.mutate({
                  minVolumeFilter,
                  minSpread: minSpreadFilter,
                  minLiquidity,
                  category: category === "all" ? "" : category,
                  excludeRestricted,
                  maxOutcomes: onlyBinaryMarkets ? 2 : 0,
                })}
                disabled={updateSettingsMutation.isPending}
              >
                {updateSettingsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                应用设置
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 主内容区 */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 市场列表 */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>市场列表</CardTitle>
                <CardDescription>按价差排序的活跃市场</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索市场..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64 pl-9"
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2 font-medium">市场</th>
                      <th className="text-right py-3 px-2 font-medium">买入价</th>
                      <th className="text-right py-3 px-2 font-medium">卖出价</th>
                      <th className="text-right py-3 px-2 font-medium">价差</th>
                      <th className="text-center py-3 px-2 font-medium">状态</th>
                      <th className="text-center py-3 px-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          加载中...
                        </td>
                      </tr>
                    ) : filteredMarkets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                          暂无市场数据，请点击"手动扫描"
                        </td>
                      </tr>
                    ) : (
                      filteredMarkets.slice(0, 50).map((market, i) => (
                        <tr
                          key={market.conditionId || i}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                            market.isArbitrage ? "bg-success/5" : ""
                          }`}
                        >
                          <td className="py-3 px-2">
                            <div className="max-w-[280px] truncate font-medium" title={market.question}>
                              {market.question}
                            </div>
                          </td>
                          <td className="text-right py-3 px-2 font-mono text-muted-foreground">
                            {market.realAskSum?.toFixed(4) || "-"}
                          </td>
                          <td className="text-right py-3 px-2 font-mono text-muted-foreground">
                            {market.realBidSum?.toFixed(4) || "-"}
                          </td>
                          <td className="text-right py-3 px-2">
                            <span
                              className={`font-mono font-medium ${
                                market.spread < 0
                                  ? "text-destructive"
                                  : market.spread > 1
                                  ? "text-success"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {market.spread?.toFixed(2)}%
                            </span>
                          </td>
                          <td className="text-center py-3 px-2">
                            {market.isArbitrage ? (
                              <Badge
                                variant={market.arbitrageType === "LONG" ? "default" : "destructive"}
                                className="gap-1"
                              >
                                <Zap className="h-3 w-3" />
                                {market.arbitrageType}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">无机会</Badge>
                            )}
                          </td>
                          <td className="text-center py-3 px-2">
                            {market.isArbitrage ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={executingMarketId === market.conditionId}
                                  onClick={() => handleExecute(market, true)}
                                  title="模拟执行"
                                >
                                  {executingMarketId === market.conditionId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <Zap className="h-3 w-3 mr-1" />
                                      模拟
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 px-2 text-xs"
                                  disabled={executingMarketId === market.conditionId}
                                  onClick={() => handleExecute(market, false)}
                                  title="真实执行"
                                >
                                  {executingMarketId === market.conditionId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <DollarSign className="h-3 w-3 mr-1" />
                                      执行
                                    </>
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 实时日志 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                扫描日志
              </CardTitle>
              <CardDescription>实时扫描活动</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    暂无日志
                  </p>
                ) : (
                  logs.slice(0, 50).map((log, i) => (
                    <div
                      key={i}
                      className={`text-xs py-2 px-3 rounded-lg font-mono ${
                        log.includes("✅") || log.includes("LONG")
                          ? "bg-success/10 text-success"
                          : log.includes("❌") || log.includes("SHORT")
                          ? "bg-destructive/10 text-destructive"
                          : log.includes("💡") || log.includes("机会")
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
