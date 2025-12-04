"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  Zap,
  Settings2,
  Save,
  PlayCircle,
  StopCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Target,
  Shield,
} from "lucide-react"

async function fetchArbitrageSettings() {
  const res = await fetch("/api/arbitrage/settings")
  return res.json()
}

async function fetchArbitrageStats() {
  const res = await fetch("/api/arbitrage/stats")
  return res.json()
}

export default function ArbitrageStrategyPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: settingsData } = useQuery({
    queryKey: ["arbitrageSettings"],
    queryFn: fetchArbitrageSettings,
  })

  const { data: statsData } = useQuery({
    queryKey: ["arbitrageStats"],
    queryFn: fetchArbitrageStats,
    refetchInterval: 5000,
  })

  const settings = settingsData?.data || {}
  const stats = statsData?.data || {}

  // 本地表单状态
  const [formData, setFormData] = useState({
    minSpread: settings.minSpread || 1.0,
    tradeAmount: settings.tradeAmount || 10,
    scanInterval: (settings.scanInterval || 60000) / 1000,
    autoTrade: settings.autoTrade || false,
    maxDailyTrades: 50,
    maxDailyLoss: 100,
    slippage: 0.5,
  })

  // 保存设置
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/arbitrage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minSpread: data.minSpread,
          tradeAmount: data.tradeAmount,
          scanInterval: data.scanInterval * 1000,
          autoTrade: data.autoTrade,
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageSettings"] })
      toast({ title: "✅ 设置已保存" })
    },
    onError: () => toast({ title: "❌ 保存失败", variant: "destructive" }),
  })

  // 启动/停止
  const startMutation = useMutation({
    mutationFn: () => fetch("/api/arbitrage/start", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      toast({ title: "✅ 策略已启动" })
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => fetch("/api/arbitrage/stop", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrageStats"] })
      toast({ title: "⏹️ 策略已停止" })
    },
  })

  const isRunning = stats.isRunning || false

  return (
    <div className="flex flex-col">
      <Header
        title="套利策略"
        description="配置和管理双边套利策略参数"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 策略状态卡片 */}
        <Card className={isRunning ? "border-success/50" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${isRunning ? "bg-success/20" : "bg-muted"}`}>
                  <Zap className={`h-6 w-6 ${isRunning ? "text-success" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">双边套利策略</h3>
                  <p className="text-sm text-muted-foreground">
                    基于价格和分析的自动套利策略
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isRunning ? "default" : "secondary"} className="gap-1">
                  <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                  {isRunning ? "运行中" : "已停止"}
                </Badge>
                {isRunning ? (
                  <Button
                    variant="destructive"
                    onClick={() => stopMutation.mutate()}
                    disabled={stopMutation.isPending}
                    className="gap-2"
                  >
                    <StopCircle className="h-4 w-4" />
                    停止策略
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    className="gap-2"
                  >
                    <PlayCircle className="h-4 w-4" />
                    启动策略
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 策略配置 */}
        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basic" className="gap-2">
              <Settings2 className="h-4 w-4" />
              基础设置
            </TabsTrigger>
            <TabsTrigger value="risk" className="gap-2">
              <Shield className="h-4 w-4" />
              风控设置
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <Zap className="h-4 w-4" />
              高级设置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* 交易参数 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    交易参数
                  </CardTitle>
                  <CardDescription>配置每笔交易的金额和触发条件</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">单笔交易金额 (USDC)</label>
                    <Input
                      type="number"
                      step="1"
                      value={formData.tradeAmount}
                      onChange={(e) => setFormData({ ...formData, tradeAmount: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      每次套利操作投入的资金量
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最小价差触发 (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.minSpread}
                      onChange={(e) => setFormData({ ...formData, minSpread: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      只有当价差超过此值时才触发套利
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">滑点容忍度 (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.slippage}
                      onChange={(e) => setFormData({ ...formData, slippage: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      可接受的最大滑点百分比
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 扫描设置 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    扫描设置
                  </CardTitle>
                  <CardDescription>配置市场扫描频率和自动化行为</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">扫描间隔 (秒)</label>
                    <Input
                      type="number"
                      step="1"
                      min="10"
                      value={formData.scanInterval}
                      onChange={(e) => setFormData({ ...formData, scanInterval: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      每次扫描市场的时间间隔（最小 10 秒）
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">自动执行交易</p>
                      <p className="text-sm text-muted-foreground">
                        发现套利机会时自动下单
                      </p>
                    </div>
                    <Switch
                      checked={formData.autoTrade}
                      onCheckedChange={(checked) => setFormData({ ...formData, autoTrade: checked })}
                    />
                  </div>

                  {formData.autoTrade && (
                    <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                      <p className="text-sm text-warning">
                        自动交易已启用，请确保已设置适当的风控参数
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  风险控制
                </CardTitle>
                <CardDescription>设置每日交易限制和止损参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">每日最大交易次数</label>
                    <Input
                      type="number"
                      step="1"
                      value={formData.maxDailyTrades}
                      onChange={(e) => setFormData({ ...formData, maxDailyTrades: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">每日最大亏损 (USDC)</label>
                    <Input
                      type="number"
                      step="1"
                      value={formData.maxDailyLoss}
                      onChange={(e) => setFormData({ ...formData, maxDailyLoss: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    当达到每日限制时，策略将自动暂停直到次日重置
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>高级参数</CardTitle>
                <CardDescription>仅限高级用户，修改前请充分了解其影响</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-4">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-warning">注意</p>
                    <p className="text-sm text-warning/80">
                      高级参数可能显著影响策略表现，建议在测试环境验证后再应用到生产环境
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 保存按钮 */}
        <div className="flex justify-end gap-3">
          <Button variant="outline">重置默认</Button>
          <Button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            保存设置
          </Button>
        </div>

        {/* 策略说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              策略说明
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  做多套利 (LONG)
                </h4>
                <p className="text-sm text-muted-foreground">
                  当所有结果的买入总价 {"<"} 1 时，同时买入所有结果，等待市场结算后获利
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  做空套利 (SHORT)
                </h4>
                <p className="text-sm text-muted-foreground">
                  当所有结果的卖出总价 {">"} 1 时，同时卖出所有结果，即时获取利润
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
