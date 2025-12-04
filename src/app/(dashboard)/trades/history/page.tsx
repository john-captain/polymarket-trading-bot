"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  History,
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  BarChart3,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

// 交易记录类型 - 与数据库返回的字段匹配
interface TradeRecord {
  id: number
  opportunityId?: number
  marketQuestion: string
  tradeType: "LONG" | "SHORT"
  yesAmount?: number
  noAmount?: number
  totalInvestment: number
  expectedProfit: number
  actualProfit?: number
  status: "PENDING" | "SUCCESS" | "FAILED" | "SIMULATED"
  txHash?: string
  errorMessage?: string
  createdAt: string
}

interface TradeStats {
  totalTrades: number
  successTrades: number
  failedTrades: number
  totalProfit: number
  totalInvestment: number
  winRate: number
}

interface DailyStat {
  date: string
  trades: number
  profit: number
}

// 获取交易数据
async function fetchTrades(limit: number, offset: number) {
  const res = await fetch(`/api/trades?limit=${limit}&offset=${offset}`)
  return res.json()
}

export default function TradeHistoryPage() {
  const [page, setPage] = useState(0)
  const pageSize = 20

  // 获取交易数据
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["trades", page],
    queryFn: () => fetchTrades(pageSize, page * pageSize),
    refetchInterval: 30000,  // 30 秒自动刷新
  })

  const records: TradeRecord[] = data?.data?.trades || []
  const stats: TradeStats = data?.data?.stats || {
    totalTrades: 0,
    successTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    totalInvestment: 0,
    winRate: 0,
  }
  const dailyStats: DailyStat[] = data?.data?.dailyStats || []

  // 过滤交易
  const profitTrades = records.filter((t) => (t.actualProfit || 0) > 0)
  const lossTrades = records.filter((t) => (t.actualProfit || 0) <= 0)

  // 格式化时间
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch {
      return dateStr
    }
  }

  // 状态徽章
  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "SUCCESS":
        return <Badge className="bg-success text-white">成功</Badge>
      case "SIMULATED":
        return <Badge variant="outline" className="border-primary text-primary">模拟</Badge>
      case "FAILED":
        return <Badge variant="destructive">失败</Badge>
      case "PENDING":
        return <Badge variant="secondary">进行中</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // 渲染交易列表
  const renderTradeList = (trades: TradeRecord[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-3 px-2 font-medium">时间</th>
            <th className="text-left py-3 px-2 font-medium">市场</th>
            <th className="text-center py-3 px-2 font-medium">类型</th>
            <th className="text-right py-3 px-2 font-medium">金额</th>
            <th className="text-right py-3 px-2 font-medium">盈亏</th>
            <th className="text-center py-3 px-2 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                暂无交易记录
              </td>
            </tr>
          ) : (
            trades.map((trade) => (
              <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-2 text-muted-foreground text-xs">
                  {formatTime(trade.createdAt)}
                </td>
                <td className="py-3 px-2">
                  <div className="max-w-[280px] truncate font-medium" title={trade.marketQuestion}>
                    {trade.marketQuestion}
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  <Badge variant={trade.tradeType === "LONG" ? "default" : "destructive"}>
                    {trade.tradeType}
                  </Badge>
                </td>
                <td className="text-right py-3 px-2 font-mono">
                  ${trade.totalInvestment.toFixed(2)}
                </td>
                <td className="text-right py-3 px-2">
                  <div className={`flex items-center justify-end gap-1 font-mono ${(trade.actualProfit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    {(trade.actualProfit || 0) >= 0 ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                    {(trade.actualProfit || 0) >= 0 ? "+" : ""}${(trade.actualProfit || 0).toFixed(4)}
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  {getStatusBadge(trade.status)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="flex flex-col">
      <Header
        title="交易历史"
        description="查看所有交易记录和盈亏统计"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">总交易次数</p>
                  <p className="text-2xl font-bold">{stats.totalTrades}</p>
                </div>
                <History className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">成功率</p>
                  <p className="text-2xl font-bold">{stats.winRate.toFixed(1)}%</p>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">成功交易</p>
                  <p className="text-2xl font-bold text-success">{stats.successTrades}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-success/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">累计盈亏</p>
                  <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(4)}
                  </p>
                </div>
                <DollarSign className={`h-8 w-8 ${stats.totalProfit >= 0 ? "text-success/50" : "text-destructive/50"}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 最近 7 天统计 */}
        {dailyStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">最近 7 天统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {dailyStats.map((day) => (
                  <div key={day.date} className="text-center p-2 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{String(day.date).slice(5)}</p>
                    <p className="font-medium">{day.trades} 笔</p>
                    <p className={`text-xs ${day.profit >= 0 ? "text-success" : "text-destructive"}`}>
                      {day.profit >= 0 ? "+" : ""}${day.profit.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 交易记录 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>交易记录</CardTitle>
              <CardDescription>所有套利交易的详细记录</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-center py-12 text-destructive">
                <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                加载失败: {(error as Error).message}
              </div>
            ) : isLoading && records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : (
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">全部 ({records.length})</TabsTrigger>
                  <TabsTrigger value="profit">盈利 ({profitTrades.length})</TabsTrigger>
                  <TabsTrigger value="loss">亏损 ({lossTrades.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="mt-4">
                  {renderTradeList(records)}
                </TabsContent>

                <TabsContent value="profit" className="mt-4">
                  {renderTradeList(profitTrades)}
                </TabsContent>

                <TabsContent value="loss" className="mt-4">
                  {renderTradeList(lossTrades)}
                </TabsContent>
              </Tabs>
            )}

            {/* 分页 */}
            {records.length > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  第 {page + 1} 页，共 {Math.ceil(stats.totalTrades / pageSize)} 页
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={records.length < pageSize}
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
    </div>
  )
}
