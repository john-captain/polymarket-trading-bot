"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  AlertTriangle,
} from "lucide-react"

// 模拟监控数据
const watchedMarkets = [
  {
    id: "1",
    question: "Will BTC reach $100k by end of 2024?",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume24h: 125000,
    change24h: 5.2,
    liquidity: 450000,
    status: "active",
  },
  {
    id: "2",
    question: "Will ETH reach $5k by end of 2024?",
    yesPrice: 0.35,
    noPrice: 0.65,
    volume24h: 85000,
    change24h: -2.1,
    liquidity: 320000,
    status: "active",
  },
  {
    id: "3",
    question: "Will there be a Fed rate cut in December?",
    yesPrice: 0.78,
    noPrice: 0.22,
    volume24h: 200000,
    change24h: 8.5,
    liquidity: 580000,
    status: "active",
  },
]

export default function MarketMonitorPage() {
  return (
    <div className="flex flex-col">
      <Header
        title="价格监控"
        description="实时监控市场价格变化和交易机会"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 监控概览 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">监控市场</p>
                  <p className="text-2xl font-bold">{watchedMarkets.length}</p>
                </div>
                <Eye className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">价格警报</p>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">总流动性</p>
                  <p className="text-2xl font-bold">
                    ${(watchedMarkets.reduce((sum, m) => sum + m.liquidity, 0) / 1000000).toFixed(2)}M
                  </p>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">更新频率</p>
                  <p className="text-2xl font-bold">实时</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 监控列表 */}
        <Card>
          <CardHeader>
            <CardTitle>监控列表</CardTitle>
            <CardDescription>
              您正在关注的市场价格实时数据
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {watchedMarkets.map((market) => (
                <div
                  key={market.id}
                  className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">{market.status === "active" ? "活跃" : "关闭"}</Badge>
                        <span className={`flex items-center gap-1 text-sm ${market.change24h >= 0 ? "text-success" : "text-destructive"}`}>
                          {market.change24h >= 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {market.change24h >= 0 ? "+" : ""}{market.change24h}%
                        </span>
                      </div>
                      <h3 className="font-medium mb-3 line-clamp-2">
                        {market.question}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Yes 价格</p>
                          <p className="font-mono text-success">${market.yesPrice.toFixed(4)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">No 价格</p>
                          <p className="font-mono text-destructive">${market.noPrice.toFixed(4)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">24h 交易量</p>
                          <p className="font-mono">${(market.volume24h / 1000).toFixed(1)}K</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">流动性</p>
                          <p className="font-mono">${(market.liquidity / 1000).toFixed(1)}K</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {watchedMarkets.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>暂无监控市场</p>
                <p className="text-sm mt-1">在市场扫描页面添加您想监控的市场</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 价格警报设置 */}
        <Card>
          <CardHeader>
            <CardTitle>价格警报</CardTitle>
            <CardDescription>
              设置价格警报，当满足条件时通知您
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无价格警报</p>
              <p className="text-sm mt-1">点击上方市场设置价格警报</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
