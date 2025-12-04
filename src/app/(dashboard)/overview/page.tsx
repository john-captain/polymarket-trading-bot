"use client"

import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  PlayCircle,
  Eye,
  BarChart3,
  Clock,
} from "lucide-react"
import Link from "next/link"

// API 请求
async function fetchBalance() {
  const res = await fetch("/api/balance")
  return res.json()
}

async function fetchArbitrageStats() {
  const res = await fetch("/api/arbitrage/stats")
  return res.json()
}

async function fetchLogs() {
  const res = await fetch("/api/logs")
  return res.json()
}

async function fetchTradeStats() {
  const res = await fetch("/api/trades?limit=1")
  return res.json()
}

export default function OverviewPage() {
  const { data: balanceData } = useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance,
    refetchInterval: 30000,
  })

  const { data: arbStats } = useQuery({
    queryKey: ["arbitrageStats"],
    queryFn: fetchArbitrageStats,
    refetchInterval: 5000,
  })

  const { data: logsData } = useQuery({
    queryKey: ["logs"],
    queryFn: fetchLogs,
    refetchInterval: 5000,
  })

  const { data: tradeData } = useQuery({
    queryKey: ["tradeStats"],
    queryFn: fetchTradeStats,
    refetchInterval: 30000,
  })

  const balance = balanceData?.data
  const stats = arbStats?.data
  const logs = logsData?.data || []
  const tradeStats = tradeData?.data?.stats
  const dailyStats = tradeData?.data?.dailyStats || []

  // 从真实数据计算统计
  const todayPnL = dailyStats.length > 0 ? dailyStats[0]?.profit || 0 : 0
  const weekPnL = tradeStats?.totalProfit || 0
  const totalTrades = tradeStats?.totalTrades || 0
  const winRate = tradeStats?.winRate || 0

  return (
    <div className="flex flex-col">
      <Header title="总览" description="查看您的账户状态和交易概况" />
      
      <div className="flex-1 space-y-6 p-6">
        {/* KPI 卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* 账户余额 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                账户余额
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                USDC: {(balance?.usdc || 0)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  MATIC: {(balance?.matic || 0).toFixed(4)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 今日盈亏 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                今日盈亏
              </CardTitle>
              {todayPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${todayPnL >= 0 ? "text-success" : "text-destructive"}`}>
                {todayPnL >= 0 ? "+" : ""}${todayPnL.toFixed(2)}
              </div>
              <div className="flex items-center gap-1 mt-1">
                {todayPnL >= 0 ? (
                  <ArrowUpRight className="h-3 w-3 text-success" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs ${todayPnL >= 0 ? "text-success" : "text-destructive"}`}>
                  {todayPnL >= 0 ? "+" : ""}{((todayPnL / (balance?.usdc || 1)) * 100).toFixed(2)}%
                </span>
                <span className="text-xs text-muted-foreground">vs 昨日</span>
              </div>
            </CardContent>
          </Card>

          {/* 本周盈亏 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                本周盈亏
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${weekPnL >= 0 ? "text-success" : "text-destructive"}`}>
                {weekPnL >= 0 ? "+" : ""}${weekPnL.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                胜率: {winRate}%
              </div>
            </CardContent>
          </Card>

          {/* 扫描状态 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                扫描状态
              </CardTitle>
              <Activity className={`h-4 w-4 ${stats?.isRunning ? "text-success animate-pulse" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.scanCount?.toLocaleString() || 0}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  stats?.isRunning 
                    ? "bg-success/20 text-success" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stats?.isRunning ? "bg-success" : "bg-muted-foreground"}`} />
                  {stats?.isRunning ? "运行中" : "已停止"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 中间区域 */}
        <div className="grid gap-6 lg:grid-cols-3">
       

          {/* 实时统计 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                实时统计
              </CardTitle>
              <CardDescription>今日交易数据</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">扫描次数</span>
                  <span className="font-medium">{stats?.scanCount?.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">发现机会</span>
                  <span className="font-medium text-primary">{stats?.opportunityCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">执行交易</span>
                  <span className="font-medium">{stats?.tradeCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">累计利润</span>
                  <span className={`font-medium ${(stats?.totalProfit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    ${(stats?.totalProfit || 0).toFixed(4)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 系统状态 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                系统状态
              </CardTitle>
              <CardDescription>服务运行状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-sm">API 服务</span>
                  </div>
                  <span className="text-xs text-success">正常</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${balance?.usdc ? "bg-success" : "bg-destructive"}`} />
                    <span className="text-sm">钱包连接</span>
                  </div>
                  <span className={`text-xs ${balance?.usdc ? "text-success" : "text-destructive"}`}>
                    {balance?.usdc ? "已连接" : "未连接"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stats?.isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                    <span className="text-sm">套利扫描</span>
                  </div>
                  <span className={`text-xs ${stats?.isRunning ? "text-success" : "text-muted-foreground"}`}>
                    {stats?.isRunning ? "运行中" : "已停止"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-sm">数据库</span>
                  </div>
                  <span className="text-xs text-success">正常</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 活动日志 */}
        <Card>
          <CardHeader>
            <CardTitle>活动日志</CardTitle>
            <CardDescription>最近的系统活动（最新 20 条）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  暂无活动日志
                </p>
              ) : (
                logs.slice(0, 20).map((log: string, i: number) => (
                  <div
                    key={i}
                    className={`text-sm py-2 px-3 rounded-lg ${
                      log.includes("✅") || log.includes("成功")
                        ? "bg-success/10 text-success"
                        : log.includes("❌") || log.includes("错误")
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
  )
}
