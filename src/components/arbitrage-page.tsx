"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  Search,
  PlayCircle,
  StopCircle,
  RefreshCw,
  Zap,
  Target,
  Clock,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { formatNumber, formatPrice, formatTime } from "@/lib/utils"

// API 请求
async function fetchArbitrageStats() {
  const res = await fetch("/api/arbitrage/stats")
  if (!res.ok) throw new Error("获取套利统计失败")
  return res.json()
}

async function fetchArbitrageMarkets() {
  const res = await fetch("/api/arbitrage/markets")
  if (!res.ok) throw new Error("获取市场数据失败")
  return res.json()
}

async function fetchArbitrageLogs() {
  const res = await fetch("/api/arbitrage/logs")
  if (!res.ok) throw new Error("获取日志失败")
  return res.json()
}

async function fetchArbitrageSettings() {
  const res = await fetch("/api/arbitrage/settings")
  if (!res.ok) throw new Error("获取设置失败")
  return res.json()
}

interface Market {
  question: string
  conditionId: string
  outcomePrices: string
  spread: number
  realAskSum?: number
  realBidSum?: number
  isArbitrage: boolean
  arbitrageType?: "LONG" | "SHORT"
  estimatedProfit?: number
}

export function ArbitragePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [autoScan, setAutoScan] = useState(false)

  // 数据查询
  const { data: stats } = useQuery({
    queryKey: ["arbitrageStats"],
    queryFn: fetchArbitrageStats,
    refetchInterval: autoScan ? 3000 : false,
  })

  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["arbitrageMarkets"],
    queryFn: fetchArbitrageMarkets,
    refetchInterval: autoScan ? 5000 : false,
  })

  const { data: logsData } = useQuery({
    queryKey: ["arbitrageLogs"],
    queryFn: fetchArbitrageLogs,
    refetchInterval: autoScan ? 3000 : false,
  })

  const { data: settingsData } = useQuery({
    queryKey: ["arbitrageSettings"],
    queryFn: fetchArbitrageSettings,
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
      toast({ title: `✅ 扫描完成，发现 ${data.data?.opportunityCount || 0} 个机会` })
    },
    onError: () => toast({ title: "❌ 扫描失败", variant: "destructive" }),
  })

  // 启动/停止套利机器人
  const startArbitrage = useMutation({
    mutationFn: () => fetch("/api/arbitrage/start", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      setAutoScan(true)
      toast({ title: "✅ 套利机器人已启动" })
    },
  })

  const stopArbitrage = useMutation({
    mutationFn: () => fetch("/api/arbitrage/stop", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      setAutoScan(false)
      toast({ title: "⏹️ 套利机器人已停止" })
    },
  })

  const isRunning = stats?.data?.isRunning || false
  const markets: Market[] = marketsData?.data || []
  const logs: string[] = logsData?.data || []
  const settings = settingsData?.data || {}

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                双边套利监控
              </h1>
              <p className="text-muted-foreground text-sm">
                实时扫描市场套利机会
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
              <span className="text-sm">自动扫描</span>
              <Switch
                checked={autoScan}
                onCheckedChange={setAutoScan}
              />
            </div>
            <Badge variant={isRunning ? "success" : "secondary"}>
              {isRunning ? "运行中" : "已停止"}
            </Badge>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                扫描次数
              </CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(stats?.data?.scanCount || 0, 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                市场数量
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{markets.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                发现机会
              </CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats?.data?.opportunityCount || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                交易次数
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.data?.tradeCount || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                累计利润
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(stats?.data?.totalProfit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                ${formatNumber(stats?.data?.totalProfit || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-3">
          <Button
            onClick={() => startArbitrage.mutate()}
            disabled={isRunning || startArbitrage.isPending}
            variant="success"
            className="gap-2"
          >
            <PlayCircle className="h-4 w-4" />
            启动扫描
          </Button>
          <Button
            onClick={() => stopArbitrage.mutate()}
            disabled={!isRunning || stopArbitrage.isPending}
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

        {/* 主内容区 */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 市场列表 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>市场列表</CardTitle>
              <CardDescription>
                按价差排序的活跃市场（显示前 50 个）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2">市场</th>
                      <th className="text-right py-3 px-2">买入总价</th>
                      <th className="text-right py-3 px-2">卖出总价</th>
                      <th className="text-right py-3 px-2">价差</th>
                      <th className="text-center py-3 px-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketsLoading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground">
                          加载中...
                        </td>
                      </tr>
                    ) : markets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted-foreground">
                          暂无市场数据，请点击"手动扫描"
                        </td>
                      </tr>
                    ) : (
                      markets.slice(0, 50).map((market, i) => (
                        <tr key={market.conditionId || i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 px-2">
                            <div className="max-w-[300px] truncate" title={market.question}>
                              {market.question}
                            </div>
                          </td>
                          <td className="text-right py-3 px-2 font-mono">
                            {market.realAskSum?.toFixed(4) || "-"}
                          </td>
                          <td className="text-right py-3 px-2 font-mono">
                            {market.realBidSum?.toFixed(4) || "-"}
                          </td>
                          <td className="text-right py-3 px-2">
                            <span className={`font-mono ${market.spread < 0 ? "text-destructive" : market.spread > 1 ? "text-success" : ""}`}>
                              {market.spread?.toFixed(2)}%
                            </span>
                          </td>
                          <td className="text-center py-3 px-2">
                            {market.isArbitrage ? (
                              <Badge variant={market.arbitrageType === "LONG" ? "success" : "destructive"}>
                                {market.arbitrageType}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">无机会</Badge>
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

          {/* 日志面板 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                实时日志
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="log-container bg-muted/30 rounded-lg p-3 h-[500px] overflow-y-auto text-xs">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">暂无日志</p>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className={`py-1 border-b border-border/30 ${
                        log.includes("✅") || log.includes("LONG")
                          ? "text-success"
                          : log.includes("❌") || log.includes("SHORT")
                          ? "text-destructive"
                          : log.includes("💡") || log.includes("机会")
                          ? "text-primary"
                          : "text-muted-foreground"
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

        {/* 设置面板 */}
        <Card>
          <CardHeader>
            <CardTitle>套利设置</CardTitle>
            <CardDescription>调整套利参数</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">最小价差 (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  defaultValue={settings.minSpread || 1.0}
                  placeholder="1.0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">交易金额 ($)</label>
                <Input
                  type="number"
                  step="1"
                  defaultValue={settings.tradeAmount || 10}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">扫描间隔 (秒)</label>
                <Input
                  type="number"
                  step="1"
                  defaultValue={(settings.scanInterval || 60000) / 1000}
                  placeholder="60"
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full">保存设置</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
