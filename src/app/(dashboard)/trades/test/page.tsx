"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw, TestTube, AlertCircle, CheckCircle, Loader2, Calendar, TrendingUp, Shield, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface TestMarket {
  question: string
  conditionId: string
  tokenId: string
  outcome: string
  bestBid: number
  bestAsk: number
  spread: number
  spreadPercent: number
  liquidity: number
  volume: number
  endDate: string | null
  daysUntilEnd: number | null
  riskScore: number
  testAmount: number
  estimatedLoss: number
  reason: string
  category: string
}

interface TradeResult {
  orderId: string
  tokenId: string
  side: string
  amount: number
  price: number
  shares: number
  status: string
}

interface Filters {
  minDays: string
  maxSpread: string
  minLiquidity: string
}

export default function TestTradingPage() {
  const [filters, setFilters] = useState<Filters>({
    minDays: "30",
    maxSpread: "5",
    minLiquidity: "50",
  })
  const [tradeAmount, setTradeAmount] = useState("1")
  const [tradeResults, setTradeResults] = useState<TradeResult[]>([])
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)

  // 构建查询参数
  const buildQueryParams = () => {
    const params = new URLSearchParams()
    if (filters.minDays) params.set("minDays", filters.minDays)
    if (filters.maxSpread) params.set("maxSpread", filters.maxSpread)
    if (filters.minLiquidity) params.set("minLiquidity", filters.minLiquidity)
    return params.toString()
  }

  // 获取测试市场
  const { data: marketsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["testMarkets", filters],
    queryFn: async () => {
      const res = await fetch(`/api/trades/testMarkets?${buildQueryParams()}`)
      return res.json()
    },
    refetchInterval: 120000,
  })

  // 执行交易
  const tradeMutation = useMutation({
    mutationFn: async ({ tokenId, side, amount, price }: {
      tokenId: string
      side: string
      amount: number
      price: number
    }) => {
      const res = await fetch("/api/trades/testExecute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, side, amount, price }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.success) {
        setTradeResults(prev => [data.data, ...prev])
      }
    },
  })

  // 取消订单
  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/trades/testExecute?orderId=${orderId}`, {
        method: "DELETE",
      })
      return res.json()
    },
    onSuccess: (data, orderId) => {
      if (data.success) {
        setTradeResults(prev =>
          prev.map(r => r.orderId === orderId ? { ...r, status: "cancelled" } : r)
        )
      }
    },
  })

  const handleBuy = (market: TestMarket) => {
    const amount = parseFloat(tradeAmount)
    if (amount <= 0) return
    setSelectedTokenId(market.tokenId)
    tradeMutation.mutate({
      tokenId: market.tokenId,
      side: "BUY",
      amount,
      price: market.bestAsk,
    })
  }

  const handleSell = (market: TestMarket) => {
    const amount = parseFloat(tradeAmount)
    if (amount <= 0) return
    setSelectedTokenId(market.tokenId)
    tradeMutation.mutate({
      tokenId: market.tokenId,
      side: "SELL",
      amount,
      price: market.bestBid,
    })
  }

  const markets: TestMarket[] = marketsData?.data || []

  // 风险等级颜色
  const getRiskColor = (score: number) => {
    if (score <= 3) return "text-green-600 bg-green-50"
    if (score <= 5) return "text-yellow-600 bg-yellow-50"
    if (score <= 7) return "text-orange-600 bg-orange-50"
    return "text-red-600 bg-red-50"
  }

  const getRiskLabel = (score: number) => {
    if (score <= 3) return "低"
    if (score <= 5) return "中"
    if (score <= 7) return "较高"
    return "高"
  }

  return (
    <div className="space-y-6 p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">测试交易</h1>
          <p className="text-sm text-muted-foreground">
            在低风险、长期市场验证订单流程
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          刷新市场
        </Button>
      </div>

      {/* 警告提示 */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">测试交易注意事项</p>
              <ul className="mt-1 text-amber-700 space-y-1">
                <li>• 测试交易使用真实资金，会产生实际损失（约为价差金额）</li>
                <li>• 优先选择结束时间较长的市场，短期风险较低</li>
                <li>• 建议使用 $1-5 小额测试，验证订单流程是否正常</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 筛选条件 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            筛选条件
          </CardTitle>
          <CardDescription>
            设置市场筛选条件，选择适合测试的低风险市场
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">最少天数</span>
              <Select
                value={filters.minDays}
                onValueChange={(v) => setFilters(prev => ({ ...prev, minDays: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择天数" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7天以上</SelectItem>
                  <SelectItem value="30">30天以上</SelectItem>
                  <SelectItem value="60">60天以上</SelectItem>
                  <SelectItem value="90">90天以上</SelectItem>
                  <SelectItem value="180">180天以上</SelectItem>
                  <SelectItem value="365">1年以上</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">最大价差 (%)</span>
              <Select
                value={filters.maxSpread}
                onValueChange={(v) => setFilters(prev => ({ ...prev, maxSpread: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择价差" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">≤ 1%</SelectItem>
                  <SelectItem value="2">≤ 2%</SelectItem>
                  <SelectItem value="3">≤ 3%</SelectItem>
                  <SelectItem value="5">≤ 5%</SelectItem>
                  <SelectItem value="10">≤ 10%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">最小流动性 ($)</span>
              <Select
                value={filters.minLiquidity}
                onValueChange={(v) => setFilters(prev => ({ ...prev, minLiquidity: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择流动性" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">≥ $10</SelectItem>
                  <SelectItem value="50">≥ $50</SelectItem>
                  <SelectItem value="100">≥ $100</SelectItem>
                  <SelectItem value="500">≥ $500</SelectItem>
                  <SelectItem value="1000">≥ $1000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">交易金额 (USDC)</span>
              <Input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                min="0.1"
                max="100"
                step="0.5"
              />
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">&nbsp;</span>
              <Button onClick={() => refetch()} className="w-full" disabled={isFetching}>
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                搜索市场
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 市场列表 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                适合测试的市场
              </CardTitle>
              <CardDescription>
                {marketsData?.message || `共 ${markets.length} 个市场`}
              </CardDescription>
            </div>
            {marketsData?.filters && (
              <div className="flex gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">≥{marketsData.filters.minDaysUntilEnd}天</Badge>
                <Badge variant="outline">≤{marketsData.filters.maxSpread}%价差</Badge>
                <Badge variant="outline">≥${marketsData.filters.minLiquidity}流动性</Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">正在查找适合测试的市场...</span>
            </div>
          ) : markets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <TestTube className="h-12 w-12 mb-3" />
              <p>暂无符合条件的市场</p>
              <p className="text-sm">请尝试放宽筛选条件</p>
            </div>
          ) : (
            <div className="space-y-3">
              {markets.map((market) => (
                <div
                  key={market.tokenId}
                  className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* 左侧：市场信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2" title={market.question}>
                        {market.question}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {market.outcome}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {market.daysUntilEnd !== null ? (
                            <span className={cn(
                              market.daysUntilEnd > 90 ? "text-green-600" :
                              market.daysUntilEnd > 30 ? "text-yellow-600" : "text-red-600"
                            )}>
                              {market.daysUntilEnd}天后结束
                            </span>
                          ) : "未知"}
                        </div>
                        <Badge className={cn("text-xs", getRiskColor(market.riskScore))}>
                          风险: {getRiskLabel(market.riskScore)}
                        </Badge>
                      </div>
                    </div>

                    {/* 右侧：价格和操作 */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">买入</div>
                        <div className="font-mono text-sm text-green-600">${market.bestAsk.toFixed(3)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">卖出</div>
                        <div className="font-mono text-sm text-red-600">${market.bestBid.toFixed(3)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">价差</div>
                        <div className="font-mono text-sm">{market.spreadPercent.toFixed(1)}%</div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleBuy(market)}
                          disabled={tradeMutation.isPending && selectedTokenId === market.tokenId}
                          className="h-8 px-3"
                        >
                          {tradeMutation.isPending && selectedTokenId === market.tokenId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : "买入"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSell(market)}
                          disabled={tradeMutation.isPending && selectedTokenId === market.tokenId}
                          className="h-8 px-3"
                        >
                          卖出
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 预计损失说明 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            预计损失说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium mb-1">买入后立即卖出</p>
              <p className="text-muted-foreground">
                损失 ≈ 价差 × 份额<br/>
                例如: $1 × 2% = $0.02
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium mb-1">长期持有风险</p>
              <p className="text-muted-foreground">
                市场结束前价格可能波动<br/>
                选择长期市场可降低短期风险
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium mb-1">建议测试金额</p>
              <p className="text-muted-foreground">
                $1 - $5 小额测试<br/>
                验证完整订单流程
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 交易结果 */}
      {tradeResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">交易记录</CardTitle>
            <CardDescription>本次会话的测试交易结果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tradeResults.map((result, index) => (
                <div
                  key={result.orderId + index}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {result.status === "submitted" ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : result.status === "cancelled" ? (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {result.side === "BUY" ? "买入" : "卖出"} ${result.amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        价格: ${result.price.toFixed(4)} | 份额: {result.shares.toFixed(2)} | ID: {result.orderId.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={result.status === "submitted" ? "default" : "secondary"}>
                      {result.status === "submitted" ? "已提交" : 
                       result.status === "cancelled" ? "已取消" : result.status}
                    </Badge>
                    {result.status === "submitted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelMutation.mutate(result.orderId)}
                        disabled={cancelMutation.isPending}
                        className="h-7 px-2 text-xs"
                      >
                        取消
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误显示 */}
      {tradeMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div className="text-sm text-red-700">
                交易失败: {(tradeMutation.error as Error)?.message || "未知错误"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
