"use client"

import { useState, useEffect } from "react"
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
  DollarSign,
  Clock,
  Target,
  Shield,
  TrendingUp,
  Layers,
} from "lucide-react"

async function fetchStrategyStatus() {
  const res = await fetch("/api/strategies")
  return res.json()
}

async function fetchOpportunities() {
  const res = await fetch("/api/strategies/opportunities?type=MINT_SPLIT")
  return res.json()
}

async function fetchSettings() {
  const res = await fetch("/api/strategies/settings?type=MINT_SPLIT")
  return res.json()
}

export default function MintSplitStrategyPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: statusData } = useQuery({
    queryKey: ["strategies"],
    queryFn: fetchStrategyStatus,
    refetchInterval: 5000,
  })

  const { data: opportunitiesData } = useQuery({
    queryKey: ["mintSplitOpportunities"],
    queryFn: fetchOpportunities,
    refetchInterval: 10000,
  })

  const { data: settingsData } = useQuery({
    queryKey: ["mintSplitSettings"],
    queryFn: fetchSettings,
  })

  const strategy = statusData?.data?.strategies?.find((s: any) => s.type === "MINT_SPLIT") || {}
  const opportunities = opportunitiesData?.data?.opportunities || []
  const currentSettings = settingsData?.data?.settings || {}

  // 本地表单状态
  const [formData, setFormData] = useState({
    minPriceSum: 1.005,
    minProfit: 0.01,
    mintAmount: 10,
    scanInterval: 2,
    minLiquidity: 100,
    maxSlippage: 0.5,
    multiOutcomeOnly: true,
    minOutcomes: 2,
  })

  // 同步服务端设置到表单
  useEffect(() => {
    if (currentSettings && Object.keys(currentSettings).length > 0) {
      setFormData({
        minPriceSum: currentSettings.minPriceSum || 1.005,
        minProfit: currentSettings.minProfit || 0.01,
        mintAmount: currentSettings.mintAmount || 10,
        scanInterval: (currentSettings.scanInterval || 2000) / 1000,
        minLiquidity: currentSettings.minLiquidity || 100,
        maxSlippage: currentSettings.maxSlippage || 0.5,
        multiOutcomeOnly: currentSettings.multiOutcomeOnly ?? true,
        minOutcomes: currentSettings.minOutcomes || 2,
      })
    }
  }, [currentSettings])

  // 保存设置
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/strategies/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyType: "MINT_SPLIT",
          settings: {
            ...data,
            scanInterval: data.scanInterval * 1000,
          },
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mintSplitSettings"] })
      toast({ title: "✅ 设置已保存" })
    },
    onError: () => toast({ title: "❌ 保存失败", variant: "destructive" }),
  })

  // 启动策略
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", strategyType: "MINT_SPLIT" }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] })
      toast({ title: "✅ 策略已启动" })
    },
  })

  // 停止策略
  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", strategyType: "MINT_SPLIT" }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] })
      toast({ title: "⏹️ 策略已停止" })
    },
  })

  const isRunning = strategy.status === "RUNNING"

  return (
    <div className="flex flex-col">
      <Header
        title="铸造拆分套利"
        description="核心现金牛策略 - 批发进货，拆散零售"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* 策略状态卡片 */}
        <Card className={isRunning ? "border-primary/50" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${isRunning ? "bg-primary/20" : "bg-muted"}`}>
                  <Zap className={`h-6 w-6 ${isRunning ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">铸造拆分套利 (Mint/Split)</h3>
                  <p className="text-sm text-muted-foreground">
                    当卖一价之和 {">"} $1 时，铸造完整代币组后分别卖出
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isRunning ? "default" : "secondary"} className="gap-1">
                  <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
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

            {/* 统计数据 */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">执行次数</p>
                <p className="text-xl font-bold">{strategy.executionCount || 0}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">成功次数</p>
                <p className="text-xl font-bold text-green-600">{strategy.successCount || 0}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">净利润</p>
                <p className={`text-xl font-bold ${(strategy.netProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${(strategy.netProfit || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">发现机会</p>
                <p className="text-xl font-bold text-primary">{opportunities.length}</p>
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
            <TabsTrigger value="filter" className="gap-2">
              <Target className="h-4 w-4" />
              过滤条件
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              套利机会
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* 触发参数 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    触发参数
                  </CardTitle>
                  <CardDescription>配置套利触发条件和交易金额</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">最小价格和触发</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.minPriceSum}
                      onChange={(e) => setFormData({ ...formData, minPriceSum: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      当所有选项的卖一价之和超过此值时触发（例如 1.005 = 0.5% 利润空间）
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最小利润要求 ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.minProfit}
                      onChange={(e) => setFormData({ ...formData, minProfit: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      预期利润低于此值的机会将被忽略
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">单次铸造金额 ($)</label>
                    <Input
                      type="number"
                      step="1"
                      value={formData.mintAmount}
                      onChange={(e) => setFormData({ ...formData, mintAmount: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      每次铸造操作的 USDC 金额
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
                  <CardDescription>配置市场扫描频率和滑点控制</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">扫描间隔 (秒)</label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={formData.scanInterval}
                      onChange={(e) => setFormData({ ...formData, scanInterval: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      扫描市场的时间间隔（建议 2-5 秒）
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最大滑点容忍 (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.maxSlippage}
                      onChange={(e) => setFormData({ ...formData, maxSlippage: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      超过此滑点的交易将被跳过
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最小流动性要求 ($)</label>
                    <Input
                      type="number"
                      step="10"
                      value={formData.minLiquidity}
                      onChange={(e) => setFormData({ ...formData, minLiquidity: parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      确保有足够流动性完成交易
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="filter" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  市场过滤
                </CardTitle>
                <CardDescription>设置要扫描的市场类型</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">仅多选项市场</p>
                    <p className="text-sm text-muted-foreground">
                      只扫描有 3 个以上结果的市场（如温度、赛区冠军）
                    </p>
                  </div>
                  <Switch
                    checked={formData.multiOutcomeOnly}
                    onCheckedChange={(checked) => setFormData({ ...formData, multiOutcomeOnly: checked })}
                  />
                </div>

                {formData.multiOutcomeOnly && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">最小结果数量</label>
                    <Input
                      type="number"
                      step="1"
                      min="2"
                      value={formData.minOutcomes}
                      onChange={(e) => setFormData({ ...formData, minOutcomes: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      市场至少需要的结果选项数量
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    铸造拆分套利在多选项市场更容易发现机会，因为定价更容易出现偏差
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  发现的套利机会
                  <Badge variant="outline" className="ml-2">{opportunities.length} 个</Badge>
                </CardTitle>
                <CardDescription>实时扫描发现的铸造拆分套利机会</CardDescription>
              </CardHeader>
              <CardContent>
                {opportunities.length > 0 ? (
                  <div className="space-y-3">
                    {opportunities.slice(0, 10).map((opp: any, i: number) => (
                      <div key={i} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{opp.question}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <Badge variant="secondary">
                                价格和: ${opp.totalBidSum?.toFixed(4)}
                              </Badge>
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                预期利润: +${opp.expectedProfit?.toFixed(4)}
                              </Badge>
                              <Badge variant="secondary">
                                {opp.outcomes?.length || 0} 个结果
                              </Badge>
                              <Badge variant={opp.confidence === "HIGH" ? "default" : "secondary"}>
                                置信度: {opp.confidence}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <Zap className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>暂无套利机会</p>
                    <p className="text-sm">启动策略后将自动扫描市场</p>
                  </div>
                )}
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
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">监控多选项市场</p>
                  <p className="text-sm text-muted-foreground">
                    24小时扫描温度、赛区冠军、选举等多选项市场
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">发现定价偏差</p>
                  <p className="text-sm text-muted-foreground">
                    当所有选项的卖一价之和 {">"} $1 时（例如 $1.02）
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">铸造完整代币组</p>
                  <p className="text-sm text-muted-foreground">
                    向智能合约支付 1 USDC，铸造一套包含所有结果的代币
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold">
                  4
                </div>
                <div>
                  <p className="font-medium">分别卖出获利</p>
                  <p className="text-sm text-muted-foreground">
                    瞬间在市场上分别卖出所有代币，利润 = 卖出总价 - 铸造成本
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 rounded-lg bg-yellow-50 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-700">
                <strong>复刻难度: 极难</strong> - 需要毫秒级 API 响应，市场竞争激烈，普通用户手速无法跟上
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
