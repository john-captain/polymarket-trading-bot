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
            <CardTitle>做市策略原理详解</CardTitle>
            <CardDescription>
              深入理解做市策略如何在预测市场赚取稳定收益
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 核心原理 */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-semibold mb-3">💡 核心思想：不赌方向，只赚流动性</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                做市商（Market Maker）通过在买卖双方同时挂单，赚取买卖价差（Spread）。
                无论市场结果是 YES 还是 NO，只要有人交易，做市商就能赚取中间的差价。
              </p>
            </div>

            {/* 操作流程 */}
            <div>
              <h4 className="font-semibold mb-4">📋 操作流程</h4>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mx-auto mb-2">
                    <span className="font-bold text-primary">1</span>
                  </div>
                  <h5 className="font-medium text-sm mb-1">选择市场</h5>
                  <p className="text-xs text-muted-foreground">选择流动性好、波动适中的活跃市场</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mx-auto mb-2">
                    <span className="font-bold text-primary">2</span>
                  </div>
                  <h5 className="font-medium text-sm mb-1">双向挂单</h5>
                  <p className="text-xs text-muted-foreground">买单挂 49¢，卖单挂 51¢，价差 2%</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mx-auto mb-2">
                    <span className="font-bold text-primary">3</span>
                  </div>
                  <h5 className="font-medium text-sm mb-1">等待成交</h5>
                  <p className="text-xs text-muted-foreground">有人买或卖时，订单被动成交</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/10 mx-auto mb-2">
                    <span className="font-bold text-success">4</span>
                  </div>
                  <h5 className="font-medium text-sm mb-1">赚取价差</h5>
                  <p className="text-xs text-muted-foreground">买卖差价就是利润（扣除手续费）</p>
                </div>
              </div>
            </div>

            {/* 举例说明 */}
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-3">📊 实例演示</h4>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium mb-2">假设市场："2025年BTC突破10万美元？"</p>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li>• 当前中间价：<span className="font-mono text-foreground">50¢</span></li>
                    <li>• 买单价格：<span className="font-mono text-green-600">49¢</span>（愿意以49¢买入YES）</li>
                    <li>• 卖单价格：<span className="font-mono text-red-600">51¢</span>（愿意以51¢卖出YES）</li>
                    <li>• 价差收益：<span className="font-mono text-primary">2¢</span>（每成交1股赚2美分）</li>
                  </ul>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">收益计算：</p>
                  <div className="text-sm space-y-1">
                    <p>• 买入100股 YES @ 49¢ = 支出 $49</p>
                    <p>• 卖出100股 YES @ 51¢ = 收入 $51</p>
                    <p className="font-medium text-success">• 净利润 = $2（4%回报率）</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 库存偏斜管理 */}
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-3">⚖️ 库存偏斜管理（关键风控）</h4>
              <p className="text-sm text-muted-foreground mb-3">
                做市最大风险是单边持仓过多。如果只有买单成交、卖单没人接，就会累积大量 YES 仓位。
              </p>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="font-medium text-green-700 mb-1">✅ 理想状态</p>
                  <p className="text-green-600">YES/NO 持仓 1:1</p>
                  <p className="text-green-600">无方向风险</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3">
                  <p className="font-medium text-yellow-700 mb-1">⚠️ 偏斜警告</p>
                  <p className="text-yellow-600">单边持仓 &gt; 70%</p>
                  <p className="text-yellow-600">调整报价吸引对手方</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="font-medium text-red-700 mb-1">🔴 高风险</p>
                  <p className="text-red-600">单边持仓 &gt; 90%</p>
                  <p className="text-red-600">使用 Merge 赎回减仓</p>
                </div>
              </div>
            </div>

            {/* Merge 功能说明 */}
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-3">🔄 Merge 功能（风险对冲神器）</h4>
              <p className="text-sm text-muted-foreground mb-2">
                当同时持有 YES 和 NO 代币时，可以调用智能合约的 Merge 功能，将一对 YES+NO 赎回为 $1 USDC。
              </p>
              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-700 mb-1">示例：</p>
                <p className="text-blue-600">持有 100股YES + 100股NO → Merge → 取回 $100 USDC</p>
                <p className="text-muted-foreground mt-1">这样可以释放资金，同时消除方向风险</p>
              </div>
            </div>

            {/* 适用场景与风险 */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2 text-green-600">✅ 适用场景</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 高流动性市场（日交易量 &gt; $10k）</li>
                  <li>• 价格稳定的市场（波动率 &lt; 5%/天）</li>
                  <li>• 临近结算的确定性市场</li>
                  <li>• 有多个做市商竞争的市场</li>
                </ul>
              </div>
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-2 text-red-600">⚠️ 风险提示</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 突发新闻导致价格剧烈波动</li>
                  <li>• 单边成交累积大量库存</li>
                  <li>• 市场流动性枯竭无法出货</li>
                  <li>• 与专业做市商竞争劣势</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
