"use client"

/**
 * Market-Making 策略配置页面
 * 做市策略 - 在市场两侧挂单赚取价差，自动管理库存和持仓
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
  BarChart3, 
  Shield, 
  Zap, 
  DollarSign,
  Target,
  AlertTriangle,
  RefreshCw,
  Layers,
  Activity,
  Scale,
  Timer,
  TrendingUp,
  BookOpen,
  ArrowLeftRight,
  Percent,
  Wallet,
  Info,
  Calculator,
  ArrowRight,
  GitMerge,
  BarChart2,
} from "lucide-react"

// Market-Making 配置类型 - 包含 6 个关键筛选条件
interface MarketMakingConfig {
  enabled: boolean
  autoExecute: boolean
  
  // 做市参数
  spreadPercent: number
  orderSize: number
  maxPositionPerSide: number
  refreshIntervalMs: number
  
  // ① 成交活跃度 (最重要)
  minVolume24h: number
  minTradesPerMinute: number
  maxLastTradeAge: number
  
  // ② Spread 筛选
  minMarketSpread: number
  maxMarketSpread: number
  
  // ③ 波动率筛选
  maxVolatility: number
  priceRangeMin: number
  priceRangeMax: number
  minDaysUntilEnd: number
  
  // ④ 深度筛选
  minLiquidity: number
  minOrderBookDepth: number
  minDepthAmount: number
  
  // ⑤ 手续费控制
  minOrderSize: number
  estimatedFeeRate: number
  
  // ⑥ 竞争检测
  enableCompetitionDetection: boolean
  maxOrderRefreshRate: number
  maxFrontRunCount: number
  
  // 风控
  skewThreshold: number
  maxOpenPosition: number
  autoMerge: boolean
  mergeThreshold: number
  maxDailyLoss: number
  
  // 冷却
  cooldownMs: number
}

export default function MarketMakingConfigPage() {
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
    mutationFn: async (config: MarketMakingConfig) => {
      const res = await fetch('/api/strategies/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'marketMaking', config }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast({ title: "配置已保存", description: "Market-Making 策略配置更新成功" })
      queryClient.invalidateQueries({ queryKey: ['strategies', 'config'] })
    },
    onError: (error: Error) => {
      toast({ title: "保存失败", description: error.message, variant: "destructive" })
    },
  })
  
  const config = configData?.marketMaking as MarketMakingConfig | undefined
  const mmStatus = status?.marketMaking
  
  if (isLoading || !config) {
    return (
      <div className="flex flex-col">
        <Header title="Market-Making 配置" description="加载中..." />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">加载配置中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header 
        title="Market-Making 策略配置" 
        description="做市策略 - 双边挂单赚取买卖价差"
      />
      
      <div className="flex-1 space-y-6 p-6">
        {/* 风险提示 */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">高风险策略提醒</p>
                <p className="text-sm text-amber-700 mt-1">
                  做市策略需要持续管理库存，可能面临单边持仓风险。建议在充分了解策略原理后谨慎启用。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  <p className="text-sm text-muted-foreground">活跃市场</p>
                  <p className="text-xl font-bold">{mmStatus?.activeMarkets || 0}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">未平仓持仓</p>
                  <p className="text-xl font-bold">${mmStatus?.openPosition || 0}</p>
                </div>
                <Scale className="h-8 w-8 text-purple-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">今日利润</p>
                  <p className={`text-xl font-bold ${(mmStatus?.today?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${(mmStatus?.today?.profit || 0).toFixed(2)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 配置表单 */}
        <MarketMakingConfigForm 
          config={config}
          onSave={(newConfig) => updateMutation.mutate(newConfig)}
          saving={updateMutation.isPending}
        />
      </div>
    </div>
  )
}

// 配置表单组件
function MarketMakingConfigForm({ 
  config, 
  onSave, 
  saving 
}: { 
  config: MarketMakingConfig
  onSave: (config: MarketMakingConfig) => void
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
              <div className="p-2 bg-orange-100 rounded-lg">
                <BarChart3 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <CardTitle>策略开关</CardTitle>
                <CardDescription>启用或禁用 Market-Making 做市策略</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={localConfig.enabled ? "destructive" : "secondary"}>
                {localConfig.enabled ? "风险较高" : "已关闭"}
              </Badge>
              <Switch
                checked={localConfig.enabled}
                onCheckedChange={(enabled) => setLocalConfig(prev => ({ ...prev, enabled }))}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 做市参数 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>做市参数</CardTitle>
              <CardDescription>配置买卖价差和挂单策略</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                买卖价差 (%)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.spreadPercent}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, spreadPercent: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                你的挂单价差，建议 ≥ 2%
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                单笔订单量 ($)
              </Label>
              <Input
                type="number"
                step="0.5"
                value={localConfig.orderSize}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, orderSize: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                每笔订单金额，建议 ≥ $1
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Scale className="h-3.5 w-3.5" />
                单边最大持仓 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.maxPositionPerSide}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxPositionPerSide: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                单边最大持仓金额
              </p>
            </div>
            <div className="space-y-2">
              <Label>刷新间隔 (秒)</Label>
              <Input
                type="number"
                value={localConfig.refreshIntervalMs / 1000}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, refreshIntervalMs: parseInt(e.target.value) * 1000 }))}
              />
              <p className="text-xs text-muted-foreground">
                订单刷新间隔
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ① 成交活跃度筛选 (最重要) */}
      <Card className="border-green-200">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                ① 成交活跃度筛选
                <Badge variant="default" className="bg-green-600">最重要</Badge>
              </CardTitle>
              <CardDescription>活跃市场是做市策略的生命线</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>最小 24h 交易量 ($)</Label>
              <Input
                type="number"
                value={localConfig.minVolume24h}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minVolume24h: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                建议 ≥ $5000，越高越好
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小每分钟成交次数</Label>
              <Input
                type="number"
                value={localConfig.minTradesPerMinute}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minTradesPerMinute: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                建议 ≥ 5 次/分钟
              </p>
            </div>
            <div className="space-y-2">
              <Label>最近成交时间阈值 (秒)</Label>
              <Input
                type="number"
                value={localConfig.maxLastTradeAge}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxLastTradeAge: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                超过此时间无成交则跳过
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ② Spread 筛选 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>② Spread 价差筛选</CardTitle>
              <CardDescription>价差必须能覆盖手续费和利润</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>最小市场价差 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.minMarketSpread}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minMarketSpread: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                市场自然价差需 ≥ 1.5% 才能盈利
              </p>
            </div>
            <div className="space-y-2">
              <Label>最大市场价差 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.maxMarketSpread}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxMarketSpread: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                价差太大说明流动性差
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ③ 波动率筛选 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <BarChart2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle>③ 波动率筛选</CardTitle>
              <CardDescription>避免价格剧烈波动导致库存风险</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label>最大波动率 (%)</Label>
              <Input
                type="number"
                step="1"
                value={localConfig.maxVolatility}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxVolatility: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                24h价格变动幅度上限
              </p>
            </div>
            <div className="space-y-2">
              <Label>价格下限 (%)</Label>
              <Input
                type="number"
                step="0.05"
                value={localConfig.priceRangeMin}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, priceRangeMin: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                YES价格需 ≥ 此值
              </p>
            </div>
            <div className="space-y-2">
              <Label>价格上限 (%)</Label>
              <Input
                type="number"
                step="0.05"
                value={localConfig.priceRangeMax}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, priceRangeMax: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                YES价格需 ≤ 此值
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小剩余天数</Label>
              <Input
                type="number"
                value={localConfig.minDaysUntilEnd}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minDaysUntilEnd: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                避免临近结算的市场
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ④ 深度筛选 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Layers className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle>④ 深度筛选</CardTitle>
              <CardDescription>确保小额订单不会推动价格</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>最小流动性 ($)</Label>
              <Input
                type="number"
                value={localConfig.minLiquidity}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minLiquidity: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                市场总流动性下限
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小订单簿深度 (档)</Label>
              <Input
                type="number"
                value={localConfig.minOrderBookDepth}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minOrderBookDepth: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                bid/ask各至少多少档
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小深度金额 ($)</Label>
              <Input
                type="number"
                value={localConfig.minDepthAmount}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minDepthAmount: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                前几档总金额下限
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ⑤ 手续费控制 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Calculator className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <CardTitle>⑤ 手续费控制</CardTitle>
              <CardDescription>确保每单利润能覆盖手续费</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>最小单笔订单 ($)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.minOrderSize}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minOrderSize: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                太小会被手续费吃掉，建议 ≥ $0.5
              </p>
            </div>
            <div className="space-y-2">
              <Label>预估手续费率 (%)</Label>
              <Input
                type="number"
                step="0.05"
                value={localConfig.estimatedFeeRate}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, estimatedFeeRate: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                用于计算最小盈利要求
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ⑥ 竞争检测 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg">
              <Zap className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <CardTitle>⑥ 竞争检测</CardTitle>
              <CardDescription>避免与专业高频做市机器人竞争</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>启用竞争检测</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={localConfig.enableCompetitionDetection}
                  onCheckedChange={(v) => setLocalConfig(prev => ({ ...prev, enableCompetitionDetection: v }))}
                />
                <span className="text-sm text-muted-foreground">
                  {localConfig.enableCompetitionDetection ? "已启用" : "已禁用"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>最大订单刷新频率 (次/秒)</Label>
              <Input
                type="number"
                step="0.5"
                value={localConfig.maxOrderRefreshRate}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxOrderRefreshRate: parseFloat(e.target.value) }))}
                disabled={!localConfig.enableCompetitionDetection}
              />
              <p className="text-xs text-muted-foreground">
                超过说明有高频机器人
              </p>
            </div>
            <div className="space-y-2">
              <Label>最大被插队次数</Label>
              <Input
                type="number"
                value={localConfig.maxFrontRunCount}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxFrontRunCount: parseInt(e.target.value) }))}
                disabled={!localConfig.enableCompetitionDetection}
              />
              <p className="text-xs text-muted-foreground">
                超过则放弃该市场
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 风控设置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle>风控设置</CardTitle>
              <CardDescription>控制库存偏斜和最大持仓风险</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>库存偏斜阈值 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.skewThreshold * 100}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, skewThreshold: parseFloat(e.target.value) / 100 }))}
              />
              <p className="text-xs text-muted-foreground">
                单边持仓超过此比例触发调整
              </p>
            </div>
            <div className="space-y-2">
              <Label>最大未平仓持仓 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxOpenPosition}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxOpenPosition: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                所有市场的持仓上限
              </p>
            </div>
            <div className="space-y-2">
              <Label>单日最大亏损 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxDailyLoss}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxDailyLoss: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                达到后暂停该市场
              </p>
            </div>
            <div className="space-y-2">
              <Label>自动 Merge 赎回</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={localConfig.autoMerge}
                  onCheckedChange={(autoMerge) => setLocalConfig(prev => ({ ...prev, autoMerge }))}
                />
                <span className="text-sm text-muted-foreground">
                  {localConfig.autoMerge ? "已启用" : "已禁用"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Merge 阈值 ($)</Label>
              <Input
                type="number"
                value={localConfig.mergeThreshold}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, mergeThreshold: parseInt(e.target.value) }))}
                disabled={!localConfig.autoMerge}
              />
              <p className="text-xs text-muted-foreground">
                双边持仓都超过此值时触发
              </p>
            </div>
            <div className="space-y-2">
              <Label>冷却时间 (秒)</Label>
              <Input
                type="number"
                value={localConfig.cooldownMs / 1000}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, cooldownMs: parseInt(e.target.value) * 1000 }))}
              />
              <p className="text-xs text-muted-foreground">
                成交后冷却等待
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 小额做市提示 */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base text-blue-800">小额做市 (20U-100U) 建议</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid gap-2">
            <p className="text-muted-foreground">
              <strong>✓ 适合的市场：</strong>中等热度政治事件、还有 10~60 天结束、价格在 45%-55% 区间
            </p>
            <p className="text-muted-foreground">
              <strong>✓ 关键条件：</strong>每分钟 5+ 次成交、价差 ≥ 1.5%、深度中等、无高频机器人垄断
            </p>
            <p className="text-muted-foreground">
              <strong>✗ 避免的市场：</strong>刚发布新闻、名人推文、社区热点、临近结算的市场
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 风险提示 */}
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base text-red-800">高风险策略警告</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid gap-3">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">逆向选择</Badge>
              <p className="text-muted-foreground">
                知情交易者可能利用你的报价进行套利，导致订单总是在不利时成交
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">单边风险</Badge>
              <p className="text-muted-foreground">
                市场单边行情时，只有一侧订单成交，亏损可能超过价差收益
              </p>
            </div>
          </div>
          <p className="text-red-700 font-medium mt-4">
            ⚠️ 强烈建议：小资金测试，设置严格持仓上限，选择稳定市场
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
