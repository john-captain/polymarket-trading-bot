"use client"

/**
 * Arbitrage 策略配置页面
 * 套利策略 - LONG: 买价和 < $1 时买入 | SHORT: 卖价和 > $1 时卖出
 */

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/layout/header"
import { useToast } from "@/hooks/use-toast"
import { 
  TrendingUp, 
  TrendingDown,
  Shield, 
  Zap, 
  DollarSign,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
  BookOpen,
  Calculator,
  ArrowRight,
  Info,
  Clock,
  RefreshCw,
  Percent,
  Wallet,
  Timer,
  Scale,
} from "lucide-react"

// Arbitrage 配置类型
interface ArbitrageConfig {
  enabled: boolean
  autoExecute: boolean
  long: {
    enabled: boolean
    maxPriceSum: number
    minSpread: number
  }
  short: {
    enabled: boolean
    minPriceSum: number
    minSpread: number
    allowMint: boolean
  }
  tradeAmount: number
  maxSlippage: number
  cooldownMs: number
  minLiquidity: number
  maxTradePerOrder: number
  maxTradePerDay: number
}

export default function ArbitrageConfigPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // 获取配置
  const { data: configData, isLoading } = useQuery({
    queryKey: ['strategies', 'config'],
    queryFn: async () => {
      const res = await fetch('/api/strategies/config')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data
    },
  })
  
  // 获取状态
  const { data: status } = useQuery({
    queryKey: ['strategies', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/strategies/status')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data
    },
    refetchInterval: 5000,
  })
  
  // 更新配置
  const updateMutation = useMutation({
    mutationFn: async (config: ArbitrageConfig) => {
      const res = await fetch('/api/strategies/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'arbitrage', config }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast({ title: "配置已保存", description: "Arbitrage 策略配置更新成功" })
      queryClient.invalidateQueries({ queryKey: ['strategies', 'config'] })
    },
    onError: (error: Error) => {
      toast({ title: "保存失败", description: error.message, variant: "destructive" })
    },
  })
  
  const config = configData?.arbitrage as ArbitrageConfig | undefined
  const arbStatus = status?.arbitrage
  
  if (isLoading || !config) {
    return (
      <div className="flex flex-col">
        <Header title="Arbitrage 配置" description="加载中..." />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">加载配置中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header 
        title="Arbitrage 策略配置" 
        description="套利策略 - LONG/SHORT 双向套利"
      />
      
      <div className="flex-1 space-y-6 p-6">
        {/* 状态概览 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">策略状态</p>
                  <p className="text-xl font-bold">
                    {config.enabled ? (
                      <span className="text-green-600">运行中</span>
                    ) : (
                      <span className="text-gray-500">已停止</span>
                    )}
                  </p>
                </div>
                <Zap className={`h-8 w-8 ${config.enabled ? 'text-green-500' : 'text-gray-400'}`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">LONG 今日</p>
                  <p className="text-xl font-bold">
                    {arbStatus?.long?.today?.success || 0}/{arbStatus?.long?.today?.found || 0}
                  </p>
                </div>
                <ArrowUpCircle className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">SHORT 今日</p>
                  <p className="text-xl font-bold">
                    {arbStatus?.short?.today?.success || 0}/{arbStatus?.short?.today?.found || 0}
                  </p>
                </div>
                <ArrowDownCircle className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">今日利润</p>
                  <p className={`text-xl font-bold ${(arbStatus?.today?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${(arbStatus?.today?.profit || 0).toFixed(2)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 配置表单 */}
        <ArbitrageConfigForm 
          config={config}
          onSave={(newConfig) => updateMutation.mutate(newConfig)}
          saving={updateMutation.isPending}
        />
      </div>
    </div>
  )
}

// 配置表单组件
function ArbitrageConfigForm({ 
  config, 
  onSave, 
  saving 
}: { 
  config: ArbitrageConfig
  onSave: (config: ArbitrageConfig) => void
  saving: boolean
}) {
  const [localConfig, setLocalConfig] = useState(config)
  
  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config)
  
  return (
    <div className="space-y-6">
      {/* 主开关 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>策略开关</CardTitle>
                <CardDescription>启用或禁用 Arbitrage 套利策略</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Switch
                checked={localConfig.enabled}
                onCheckedChange={(enabled) => setLocalConfig(prev => ({ ...prev, enabled }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">自动执行</p>
                <p className="text-sm text-amber-600">检测到机会时自动执行交易</p>
              </div>
            </div>
            <Switch
              checked={localConfig.autoExecute}
              onCheckedChange={(autoExecute) => setLocalConfig(prev => ({ ...prev, autoExecute }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* LONG 子策略 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <ArrowUpCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle>LONG 做多策略</CardTitle>
                <CardDescription>当买价总和 &lt; $1 时，买入所有结果等待市场校正</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={localConfig.long.enabled ? "default" : "secondary"}>
                {localConfig.long.enabled ? "已启用" : "已禁用"}
              </Badge>
              <Switch
                checked={localConfig.long.enabled}
                onCheckedChange={(enabled) => 
                  setLocalConfig(prev => ({ ...prev, long: { ...prev.long, enabled } }))
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>最大价格和</Label>
              <Input
                type="number"
                step="0.001"
                value={localConfig.long.maxPriceSum}
                onChange={(e) => 
                  setLocalConfig(prev => ({ 
                    ...prev, 
                    long: { ...prev.long, maxPriceSum: parseFloat(e.target.value) } 
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                买价和 &lt; 此值时触发（推荐 0.99）
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小价差 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.long.minSpread}
                onChange={(e) => 
                  setLocalConfig(prev => ({ 
                    ...prev, 
                    long: { ...prev.long, minSpread: parseFloat(e.target.value) } 
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                预期收益率低于此值时跳过
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SHORT 子策略 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <ArrowDownCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <CardTitle>SHORT 做空策略</CardTitle>
                <CardDescription>当卖价总和 &gt; $1 时，卖出（或铸造后卖出）所有结果</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={localConfig.short.enabled ? "default" : "secondary"}>
                {localConfig.short.enabled ? "已启用" : "已禁用"}
              </Badge>
              <Switch
                checked={localConfig.short.enabled}
                onCheckedChange={(enabled) => 
                  setLocalConfig(prev => ({ ...prev, short: { ...prev.short, enabled } }))
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>最小价格和</Label>
              <Input
                type="number"
                step="0.001"
                value={localConfig.short.minPriceSum}
                onChange={(e) => 
                  setLocalConfig(prev => ({ 
                    ...prev, 
                    short: { ...prev.short, minPriceSum: parseFloat(e.target.value) } 
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                卖价和 &gt; 此值时触发（推荐 1.01）
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小价差 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.short.minSpread}
                onChange={(e) => 
                  setLocalConfig(prev => ({ 
                    ...prev, 
                    short: { ...prev.short, minSpread: parseFloat(e.target.value) } 
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                预期收益率低于此值时跳过
              </p>
            </div>
            <div className="space-y-2">
              <Label>允许铸造</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={localConfig.short.allowMint}
                  onCheckedChange={(allowMint) => 
                    setLocalConfig(prev => ({ ...prev, short: { ...prev.short, allowMint } }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {localConfig.short.allowMint ? "可铸造后卖出" : "仅卖出已有持仓"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 通用参数 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle>通用参数</CardTitle>
              <CardDescription>LONG 和 SHORT 共享的交易参数</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" />
                交易金额 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.tradeAmount}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, tradeAmount: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                每次套利的投入金额，建议 $10-50 起步
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                最大滑点 (%)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.maxSlippage}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxSlippage: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                实际成交价与显示价偏差阈值
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                最小流动性 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.minLiquidity || 100}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minLiquidity: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                市场流动性低于此值时跳过
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                冷却时间 (秒)
              </Label>
              <Input
                type="number"
                value={localConfig.cooldownMs / 1000}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, cooldownMs: parseInt(e.target.value) * 1000 }))}
              />
              <p className="text-xs text-muted-foreground">
                同一市场重复交易的间隔
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                单笔最大 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.maxTradePerOrder}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxTradePerOrder: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                单笔交易金额上限
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 风控限制 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle>风控限制</CardTitle>
              <CardDescription>设置每日交易量上限，控制整体风险</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>每日最大交易量 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxTradePerDay}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxTradePerDay: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                24 小时内的最大交易总额
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 策略原理详解 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BookOpen className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle>策略原理详解</CardTitle>
              <CardDescription>理解双边套利的核心逻辑 - 基于市场再平衡原理</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 核心概念 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-500" />
              核心概念：市场再平衡套利
            </h4>
            <p className="text-sm text-muted-foreground">
              在预测市场中，一个事件所有互斥结果的价格之和理论上应等于 $1（100%）。
              当价格和偏离 1 时，就存在无风险套利机会。这被称为"市场再平衡套利"(Market Rebalancing Arbitrage)。
            </p>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <p className="text-blue-800 font-medium">📊 真实数据参考</p>
              <p className="text-blue-700 text-xs mt-1">
                根据学术研究，2024年4月-2025年4月期间，Polymarket 约有 $4000万 套利利润被实现。
                最佳策略是单条件套利，最低 $0.02 利润阈值即可覆盖 Gas 费用。
              </p>
            </div>
          </div>

          {/* LONG 做多详解 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-green-500" />
              LONG 做多策略
            </h4>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <Badge variant="outline" className="mt-0.5 bg-green-100 text-green-700 border-green-300">触发</Badge>
                <div className="text-sm">
                  <p className="font-medium text-green-800">价格和 &lt; 1 时触发</p>
                  <p className="text-xs text-green-700 mt-1">
                    例：二元市场 YES=$0.48 + NO=$0.47 = $0.95
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">操作</Badge>
                <div className="text-sm">
                  <p className="font-medium">同时买入所有结果各 N 份</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    支付 $0.95 × N，获得 N 份 YES + N 份 NO
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">结算</Badge>
                <div className="text-sm">
                  <p className="font-medium">等待市场结算，自动赎回</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    无论结果如何，N 份获胜代币可兑换 $N
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <Badge variant="outline" className="mt-0.5 bg-green-100 text-green-700 border-green-300">利润</Badge>
                <div className="text-sm">
                  <p className="font-medium text-green-800">利润 = N × (1 - 价格和) / 价格和</p>
                  <p className="text-xs text-green-700 mt-1">
                    示例：投入 $95 → 获得 $100 → 净赚 $5 (5.26%)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SHORT 做空详解 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-red-500" />
              SHORT 做空策略
            </h4>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <Badge variant="outline" className="mt-0.5 bg-red-100 text-red-700 border-red-300">触发</Badge>
                <div className="text-sm">
                  <p className="font-medium text-red-800">价格和 &gt; 1 时触发</p>
                  <p className="text-xs text-red-700 mt-1">
                    例：三元市场 A=$0.35 + B=$0.38 + C=$0.32 = $1.05
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">操作</Badge>
                <div className="text-sm">
                  <p className="font-medium">卖出所有结果各 N 份</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    如果没有持仓，先铸造 N 套（成本 $N），然后分别卖出
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <Badge variant="outline" className="mt-0.5 bg-red-100 text-red-700 border-red-300">利润</Badge>
                <div className="text-sm">
                  <p className="font-medium text-red-800">利润 = N × (价格和 - 1)</p>
                  <p className="text-xs text-red-700 mt-1">
                    示例：铸造 $100 → 卖出 $105 → 净赚 $5 (5%)，即时到账
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* LONG vs SHORT 对比 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-cyan-500" />
              LONG vs SHORT 策略对比
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">特性</th>
                    <th className="text-left py-2 font-medium text-green-600">LONG 做多</th>
                    <th className="text-left py-2 font-medium text-red-600">SHORT 做空</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2">触发条件</td>
                    <td className="py-2">价格和 &lt; 1</td>
                    <td className="py-2">价格和 &gt; 1</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">资金锁定</td>
                    <td className="py-2 text-amber-600">需等待结算</td>
                    <td className="py-2 text-green-600">即时获利</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">利润计算</td>
                    <td className="py-2">A × (1-S) / S</td>
                    <td className="py-2">A × (S-1)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">需要铸造</td>
                    <td className="py-2">不需要</td>
                    <td className="py-2">可能需要</td>
                  </tr>
                  <tr>
                    <td className="py-2">机会频率</td>
                    <td className="py-2">较少</td>
                    <td className="py-2">较多（等同 Mint-Split）</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 风险提示 */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">风险提示</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid gap-3">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">LONG 特有</Badge>
              <p className="text-muted-foreground">
                <strong>资金锁定风险：</strong>LONG 策略需要等待市场结算才能获利，资金可能被锁定数天甚至数月
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">执行风险</Badge>
              <p className="text-muted-foreground">
                需要同时买入/卖出所有结果，时间差可能导致部分订单失败或价格变动
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">滑点风险</Badge>
              <p className="text-muted-foreground">
                订单簿深度不足时，实际成交价可能偏离显示价格，导致利润降低
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">竞争风险</Badge>
              <p className="text-muted-foreground">
                套利机会稍纵即逝，其他机器人可能更快完成交易
              </p>
            </div>
          </div>
          <p className="text-amber-700 font-medium mt-4">
            💡 建议：优先使用 SHORT 策略（即时获利），LONG 策略仅在高确信度时使用
          </p>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end gap-4">
        <Button 
          variant="outline" 
          onClick={() => setLocalConfig(config)}
          disabled={!hasChanges}
        >
          重置
        </Button>
        <Button 
          onClick={() => onSave(localConfig)} 
          disabled={saving || !hasChanges}
        >
          {saving ? "保存中..." : "保存配置"}
        </Button>
      </div>
    </div>
  )
}
