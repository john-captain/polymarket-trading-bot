"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
  Wallet,
  TrendingUp,
  Activity,
  Settings,
  PlayCircle,
  StopCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { formatNumber, formatPrice, shortenAddress } from "@/lib/utils"

// API 请求函数
async function fetchBalance() {
  const res = await fetch("/api/balance")
  if (!res.ok) throw new Error("获取余额失败")
  return res.json()
}

async function fetchBotStatus() {
  const res = await fetch("/api/bot/status")
  if (!res.ok) throw new Error("获取机器人状态失败")
  return res.json()
}

async function fetchArbitrageStats() {
  const res = await fetch("/api/arbitrage/stats")
  if (!res.ok) throw new Error("获取套利统计失败")
  return res.json()
}

async function fetchLogs() {
  const res = await fetch("/api/logs")
  if (!res.ok) throw new Error("获取日志失败")
  return res.json()
}

export function Dashboard() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // 数据查询
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance,
    refetchInterval: 30000,
  })

  const { data: botStatus } = useQuery({
    queryKey: ["botStatus"],
    queryFn: fetchBotStatus,
    refetchInterval: 5000,
  })

  const { data: arbStats } = useQuery({
    queryKey: ["arbitrageStats"],
    queryFn: fetchArbitrageStats,
    refetchInterval: 5000,
  })

  const { data: logsData } = useQuery({
    queryKey: ["logs"],
    queryFn: fetchLogs,
    refetchInterval: 3000,
  })

  // 机器人控制
  const startBot = useMutation({
    mutationFn: () => fetch("/api/bot/start", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botStatus"] })
      toast({ title: "✅ 机器人已启动" })
    },
    onError: () => toast({ title: "❌ 启动失败", variant: "destructive" }),
  })

  const stopBot = useMutation({
    mutationFn: () => fetch("/api/bot/stop", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botStatus"] })
      toast({ title: "⏹️ 机器人已停止" })
    },
  })

  const balance = balanceData?.data
  const isRunning = botStatus?.data?.isRunning || false
  const logs = logsData?.data || []

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Polymarket 交易机器人</h1>
            <p className="text-muted-foreground mt-1">预测市场自动化交易系统</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/arbitrage">
              <Button variant="outline" className="gap-2">
                <Zap className="h-4 w-4" />
                套利监控
              </Button>
            </Link>
            <Badge variant={isRunning ? "success" : "secondary"} className="text-sm px-3 py-1">
              {isRunning ? "运行中" : "已停止"}
            </Badge>
          </div>
        </div>

        {/* 数据卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* 钱包余额 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                USDC 余额
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {balanceLoading ? "..." : `$${formatNumber(balance?.usdc || 0)}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                MATIC: {balance?.matic?.toFixed(4) || "0"} 
              </p>
            </CardContent>
          </Card>

          {/* 扫描统计 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                扫描次数
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(arbStats?.data?.scanCount || 0, 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                发现机会: {arbStats?.data?.opportunityCount || 0}
              </p>
            </CardContent>
          </Card>

          {/* 交易次数 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                交易次数
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {arbStats?.data?.tradeCount || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                今日交易
              </p>
            </CardContent>
          </Card>

          {/* 总利润 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                累计利润
              </CardTitle>
              {(arbStats?.data?.totalProfit || 0) >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-success" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(arbStats?.data?.totalProfit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                ${formatNumber(arbStats?.data?.totalProfit || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                本周期
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 主内容区 */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 控制面板 */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                控制面板
              </CardTitle>
              <CardDescription>机器人运行控制</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => startBot.mutate()}
                  disabled={isRunning || startBot.isPending}
                  className="flex-1 gap-2"
                  variant="success"
                >
                  <PlayCircle className="h-4 w-4" />
                  启动
                </Button>
                <Button
                  onClick={() => stopBot.mutate()}
                  disabled={!isRunning || stopBot.isPending}
                  className="flex-1 gap-2"
                  variant="destructive"
                >
                  <StopCircle className="h-4 w-4" />
                  停止
                </Button>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm">自动交易</span>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">发现机会通知</span>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => queryClient.invalidateQueries()}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新数据
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 实时日志 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>实时日志</CardTitle>
              <CardDescription>系统运行日志（最近 50 条）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="log-container bg-muted/30 rounded-lg p-4 h-[400px] overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">暂无日志</p>
                ) : (
                  logs.map((log: string, i: number) => (
                    <div
                      key={i}
                      className={`log-entry py-1 text-sm ${
                        log.includes("✅") || log.includes("成功")
                          ? "text-success"
                          : log.includes("❌") || log.includes("错误")
                          ? "text-destructive"
                          : log.includes("⚠️") || log.includes("警告")
                          ? "text-warning"
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

        {/* 底部信息 */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            钱包地址: {balance?.address ? shortenAddress(balance.address) : "未连接"}
          </p>
        </div>
      </div>
    </div>
  )
}
