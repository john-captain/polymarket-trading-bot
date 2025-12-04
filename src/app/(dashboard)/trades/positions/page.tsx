"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Package,
} from "lucide-react"
import { useState } from "react"

// 模拟持仓数据
const mockPositions = [
  {
    id: "1",
    market: "Will BTC reach $100k by end of 2024?",
    outcome: "Yes",
    shares: 100,
    avgCost: 0.55,
    currentPrice: 0.62,
    value: 62,
    pnl: 7,
    pnlPercent: 12.73,
  },
  {
    id: "2",
    market: "Who will win the 2024 US Election?",
    outcome: "Trump",
    shares: 50,
    avgCost: 0.48,
    currentPrice: 0.45,
    value: 22.5,
    pnl: -1.5,
    pnlPercent: -6.25,
  },
]

export default function PositionsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const totalValue = mockPositions.reduce((sum, p) => sum + p.value, 0)
  const totalPnl = mockPositions.reduce((sum, p) => sum + p.pnl, 0)
  const totalCost = mockPositions.reduce((sum, p) => sum + p.shares * p.avgCost, 0)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  return (
    <div className="flex flex-col">
      <Header
        title="当前持仓"
        description="查看和管理您的市场持仓"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 持仓概览 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">持仓市值</p>
                  <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
                </div>
                <Wallet className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">投入成本</p>
                  <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">未实现盈亏</p>
                  <p className={`text-2xl font-bold ${totalPnl >= 0 ? "text-success" : "text-destructive"}`}>
                    {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                  </p>
                </div>
                {totalPnl >= 0 ? (
                  <TrendingUp className="h-8 w-8 text-success/50" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-destructive/50" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">持仓数量</p>
                  <p className="text-2xl font-bold">{mockPositions.length}</p>
                </div>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  活跃
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 持仓列表 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>持仓明细</CardTitle>
              <CardDescription>您在各个市场的持仓详情</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </CardHeader>
          <CardContent>
            {mockPositions.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">暂无持仓</p>
                <p className="text-sm text-muted-foreground mt-1">
                  开始套利交易后，您的持仓将显示在这里
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {mockPositions.map((position) => (
                  <div
                    key={position.id}
                    className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary">{position.outcome}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {position.shares} 份额
                          </span>
                        </div>
                        <h3 className="font-medium mb-2 line-clamp-2">
                          {position.market}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">成本均价</p>
                            <p className="font-mono">${position.avgCost.toFixed(4)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">当前价格</p>
                            <p className="font-mono">${position.currentPrice.toFixed(4)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">市值</p>
                            <p className="font-mono">${position.value.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">盈亏</p>
                            <div className={`flex items-center gap-1 font-mono ${position.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                              {position.pnl >= 0 ? (
                                <ArrowUpRight className="h-4 w-4" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4" />
                              )}
                              {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                              <span className="text-xs">
                                ({position.pnlPercent >= 0 ? "+" : ""}{position.pnlPercent.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
                        <Button size="sm" variant="outline" className="gap-1">
                          <ExternalLink className="h-3 w-3" />
                          查看
                        </Button>
                        <Button size="sm" variant="destructive">
                          平仓
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 风险提示 */}
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-warning mb-1">风险提示</h4>
                <p className="text-sm text-muted-foreground">
                  预测市场存在风险，持仓价值会随市场波动而变化。请确保您了解相关风险，
                  并只投入您能承受损失的资金。建议定期检查持仓并设置适当的止盈止损。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
