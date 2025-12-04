"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  BarChart3,
  Play,
  Pause,
  Settings2,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Percent,
  Clock,
} from "lucide-react"
import { useState } from "react"

export default function MarketMakingPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [settings, setSettings] = useState({
    spreadPercent: "2.0",
    orderSize: "50",
    maxPosition: "500",
    rebalanceThreshold: "10",
    autoRebalance: true,
  })

  return (
    <div className="flex flex-col">
      <Header
        title="做市策略"
        description="配置和管理自动做市机器人"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 策略状态 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">策略状态</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                    <p className="text-lg font-semibold">{isRunning ? "运行中" : "已停止"}</p>
                  </div>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">当前价差</p>
                  <p className="text-2xl font-bold">{settings.spreadPercent}%</p>
                </div>
                <Percent className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">活跃订单</p>
                  <p className="text-2xl font-bold">0</p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">做市收益</p>
                  <p className="text-2xl font-bold text-success">$0.00</p>
                </div>
                <DollarSign className="h-8 w-8 text-success/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 策略配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                策略参数
              </CardTitle>
              <CardDescription>
                调整做市策略的核心参数
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  买卖价差 (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={settings.spreadPercent}
                  onChange={(e) => setSettings({ ...settings, spreadPercent: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  买入价和卖出价之间的差距百分比
                </p>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  单笔订单金额 ($)
                </label>
                <Input
                  type="number"
                  value={settings.orderSize}
                  onChange={(e) => setSettings({ ...settings, orderSize: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  最大持仓限额 ($)
                </label>
                <Input
                  type="number"
                  value={settings.maxPosition}
                  onChange={(e) => setSettings({ ...settings, maxPosition: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <label className="text-sm font-medium">自动再平衡</label>
                  <p className="text-sm text-muted-foreground">
                    持仓偏离时自动调整
                  </p>
                </div>
                <Switch
                  checked={settings.autoRebalance}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoRebalance: checked })}
                />
              </div>

              {settings.autoRebalance && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    再平衡阈值 (%)
                  </label>
                  <Input
                    type="number"
                    value={settings.rebalanceThreshold}
                    onChange={(e) => setSettings({ ...settings, rebalanceThreshold: e.target.value })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 策略控制 */}
          <Card>
            <CardHeader>
              <CardTitle>策略控制</CardTitle>
              <CardDescription>
                启动或停止做市策略
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => setIsRunning(true)}
                  disabled={isRunning}
                >
                  <Play className="h-4 w-4" />
                  启动策略
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-2"
                  onClick={() => setIsRunning(false)}
                  disabled={!isRunning}
                >
                  <Pause className="h-4 w-4" />
                  停止策略
                </Button>
              </div>

              {/* 运行信息 */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">运行时间</span>
                  <span className="text-sm font-mono">00:00:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">已成交订单</span>
                  <span className="text-sm font-mono">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">成交金额</span>
                  <span className="text-sm font-mono">$0.00</span>
                </div>
              </div>

              {/* 开发提示 */}
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-warning mb-1">功能开发中</p>
                    <p className="text-muted-foreground">
                      做市策略功能正在开发中，目前仅支持套利策略。
                      做市需要更大的资金量和更复杂的风险管理。
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 做市原理说明 */}
        <Card>
          <CardHeader>
            <CardTitle>做市策略原理</CardTitle>
            <CardDescription>
              了解做市策略如何运作
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center">1</Badge>
                  <h4 className="font-medium">双向挂单</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  在买卖双方同时挂出限价单，以买卖价差赚取利润
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center">2</Badge>
                  <h4 className="font-medium">持仓管理</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  监控持仓变化，当单边持仓过大时自动调整订单
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center">3</Badge>
                  <h4 className="font-medium">风险控制</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  设置最大持仓、止损阈值，防止极端行情下的大额亏损
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
