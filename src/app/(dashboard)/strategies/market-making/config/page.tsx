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

// Market-Making 配置类型
interface MarketMakingConfig {
  enabled: boolean
  autoExecute: boolean
  spreadPercent: number
  orderSize: number
  maxPositionPerSide: number
  totalCapital: number
  refreshIntervalMs: number
  minLiquidity: number
  minVolume24h: number
  skewThreshold: number
  maxOpenPosition: number
  autoHedge: boolean
  autoMerge: boolean
  mergeThreshold: number
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
              <Badge variant={config.enabled ? "destructive" : "secondary"}>
                {config.enabled ? "风险较高" : "已关闭"}
              </Badge>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                买单和卖单之间的价差，2% = 买 $0.49 卖 $0.51
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <BarChart2 className="h-3.5 w-3.5" />
                单笔订单量 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.orderSize || 10}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, orderSize: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                每个买单/卖单的金额
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" />
                总资金 ($)
              </Label>
              <Input
                type="number"
                value={localConfig.totalCapital || 500}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, totalCapital: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                分配给做市策略的总资金
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
                单边（买/卖）最大持仓金额
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
                订单刷新/重新挂单的间隔
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
                成交后的冷却等待时间
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 市场筛选 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle>市场筛选</CardTitle>
              <CardDescription>选择适合做市的目标市场</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>最小流动性 ($)</Label>
              <Input
                type="number"
                value={localConfig.minLiquidity}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minLiquidity: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                市场流动性低于此值时不做市
              </p>
            </div>
            <div className="space-y-2">
              <Label>最小 24h 交易量 ($)</Label>
              <Input
                type="number"
                value={localConfig.minVolume24h}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minVolume24h: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                日交易量低于此值时不做市
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label>库存偏斜阈值</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.skewThreshold}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, skewThreshold: parseFloat(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                超过此偏斜度时调整报价
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
                所有市场的未平仓持仓上限
              </p>
            </div>
            <div className="space-y-2">
              <Label>自动对冲</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  checked={localConfig.autoHedge}
                  onCheckedChange={(autoHedge) => setLocalConfig(prev => ({ ...prev, autoHedge }))}
                />
                <span className="text-sm text-muted-foreground">
                  {localConfig.autoHedge ? "已启用" : "已禁用"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                库存偏斜时自动调整报价
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
              <p className="text-xs text-muted-foreground">
                持有完整组合时自动赎回
              </p>
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
                完整组合价值超过此值时 Merge
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
              <CardDescription>理解做市策略的核心逻辑 - 动态对冲，赚取流动性价差</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 核心概念 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-blue-500" />
              核心概念：流动性提供者
            </h4>
            <p className="text-sm text-muted-foreground">
              做市商 (Market Maker) 是市场的流动性提供者。通过同时在买卖双方挂单，为市场提供流动性，
              并赚取买卖价差 (Bid-Ask Spread) 作为补偿。做市商<strong>不预测方向</strong>，只赚取交易手续费。
            </p>
          </div>

          {/* 做市流程 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-green-500" />
              做市操作流程
            </h4>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">1</Badge>
                <div>
                  <p className="font-medium text-sm">计算中间价</p>
                  <p className="text-xs text-muted-foreground">
                    获取订单簿的最佳买价 (Bid) 和最佳卖价 (Ask)，计算中间价 midPrice = (Bid + Ask) / 2
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">2</Badge>
                <div>
                  <p className="font-medium text-sm">双边挂单</p>
                  <p className="text-xs text-muted-foreground">
                    在中间价两侧挂单：买单价 = midPrice × (1 - spread/2)，卖单价 = midPrice × (1 + spread/2)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <Badge variant="outline" className="mt-0.5 bg-green-100 text-green-700 border-green-300">3</Badge>
                <div>
                  <p className="font-medium text-sm text-green-800">赚取价差</p>
                  <p className="text-xs text-green-700">
                    当买单成交 (买入代币) 后卖单成交 (卖出代币)，赚取中间的价差。例如：$0.49 买入 → $0.51 卖出 = 赚 $0.02
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant="outline" className="mt-0.5">4</Badge>
                <div>
                  <p className="font-medium text-sm">持续刷新</p>
                  <p className="text-xs text-muted-foreground">
                    定期刷新报价，跟踪市场中间价变化，避免订单过于偏离市场价格
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 收益计算 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-purple-500" />
              收益计算示例
            </h4>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border font-mono text-sm space-y-2">
              <p><span className="text-muted-foreground">// 设：价差 = 2%，订单量 = $10</span></p>
              <p>买单价格 = $0.49，卖单价格 = $0.51</p>
              <p>单次完整循环利润 = $10 × 2% = <span className="text-green-600">$0.20</span></p>
              <p><span className="text-muted-foreground">// 假设每小时完成 5 次循环</span></p>
              <p>时薪 = $0.20 × 5 = <span className="text-green-600">$1.00</span></p>
            </div>
          </div>

          {/* 库存管理 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Scale className="h-4 w-4 text-orange-500" />
              库存管理机制
            </h4>
            <div className="grid gap-3">
              <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 shrink-0">偏斜</Badge>
                <div className="text-sm">
                  <p className="font-medium text-orange-800">库存偏斜调整</p>
                  <p className="text-xs text-orange-700 mt-1">
                    当持仓偏向一侧（如 YES 过多）时，调整报价：降低 YES 买价、提高 YES 卖价，激励市场帮助减仓
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 shrink-0">Merge</Badge>
                <div className="text-sm">
                  <p className="font-medium text-purple-800">自动 Merge 赎回</p>
                  <p className="text-xs text-purple-700 mt-1">
                    当同时持有 YES 和 NO 代币时，可调用 <code className="bg-purple-100 px-1 rounded">mergePositions</code> 
                    合约，将一对代币赎回为 $1 USDC，释放资金
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 适用场景 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-cyan-500" />
              适用场景
            </h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>高流动性市场：</strong>交易活跃，订单容易成交</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>价格稳定市场：</strong>波动小，库存风险低</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>长期运行：</strong>需要持续在线监控和刷新订单</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500">✗</span>
                <span><strong>不适合：</strong>价格剧烈波动的市场，单边行情可能导致大额亏损</span>
              </li>
            </ul>
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
                知情交易者可能利用你的报价进行套利，导致你的订单总是在不利时成交
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">单边风险</Badge>
              <p className="text-muted-foreground">
                市场单边行情时，只有一侧订单成交，导致持仓偏斜，亏损可能超过价差收益
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">资金锁定</Badge>
              <p className="text-muted-foreground">
                需要持续锁定资金用于挂单，资金利用效率可能低于其他策略
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">运维成本</Badge>
              <p className="text-muted-foreground">
                需要 24/7 在线运行，订单刷新消耗 Gas，网络中断可能导致订单过期
              </p>
            </div>
          </div>
          <p className="text-red-700 font-medium mt-4">
            ⚠️ 强烈建议：小资金测试，设置严格持仓上限，选择稳定市场，充分了解风险后再启用
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
