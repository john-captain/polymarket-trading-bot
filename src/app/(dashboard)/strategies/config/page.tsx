"use client"

/**
 * 策略配置页面
 * 管理各策略的参数配置
 */

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// 策略配置类型
interface MintSplitConfig {
  enabled: boolean
  autoExecute: boolean
  minPriceSum: number
  minProfit: number
  minOutcomes: number
  minLiquidity: number
  mintAmount: number
  maxSlippage: number
  cooldownMs: number
  maxMintPerTrade: number
  maxMintPerDay: number
}

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
  maxTradePerOrder: number
  maxTradePerDay: number
}

interface MarketMakingConfig {
  enabled: boolean
  autoExecute: boolean
  spreadPercent: number
  maxPositionPerSide: number
  refreshIntervalMs: number
  minLiquidity: number
  minVolume24h: number
  skewThreshold: number
  maxOpenPosition: number
  autoMerge: boolean
  mergeThreshold: number
  cooldownMs: number
}

interface GlobalConfig {
  enabled: boolean
  scanIntervalMs: number
  concurrency: number
  maxDailyVolume: number
  emergencyStop: boolean
}

interface AllConfig {
  mintSplit: MintSplitConfig
  arbitrage: ArbitrageConfig
  marketMaking: MarketMakingConfig
  global: GlobalConfig
}

export default function StrategyConfigPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState("mintSplit")
  
  // 获取配置
  const { data: config, isLoading } = useQuery<AllConfig>({
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
    mutationFn: async ({ strategy, config }: { strategy: string; config: any }) => {
      const res = await fetch('/api/strategies/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, config }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast({ title: "配置已保存" })
      queryClient.invalidateQueries({ queryKey: ['strategies', 'config'] })
    },
    onError: (error: Error) => {
      toast({ title: "保存失败", description: error.message, variant: "destructive" })
    },
  })
  
  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载配置中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">策略配置</h1>
        <p className="text-muted-foreground">配置各策略的运行参数</p>
      </div>
      
      {/* 全局配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>全局设置</span>
            <Switch
              checked={config.global.enabled}
              onCheckedChange={(enabled) => 
                updateMutation.mutate({ 
                  strategy: 'global', 
                  config: { ...config.global, enabled } 
                })
              }
            />
          </CardTitle>
          <CardDescription>控制整个策略系统的开关和全局参数</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>扫描间隔 (毫秒)</Label>
              <Input
                type="number"
                value={config.global.scanIntervalMs}
                onChange={(e) => 
                  updateMutation.mutate({ 
                    strategy: 'global',
                    config: { ...config.global, scanIntervalMs: parseInt(e.target.value) }
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>每日最大交易量 ($)</Label>
              <Input
                type="number"
                value={config.global.maxDailyVolume}
                onChange={(e) => 
                  updateMutation.mutate({ 
                    strategy: 'global',
                    config: { ...config.global, maxDailyVolume: parseInt(e.target.value) }
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                紧急停止
                <Badge variant={config.global.emergencyStop ? "destructive" : "secondary"}>
                  {config.global.emergencyStop ? "已触发" : "正常"}
                </Badge>
              </Label>
              <Switch
                checked={config.global.emergencyStop}
                onCheckedChange={(emergencyStop) => 
                  updateMutation.mutate({ 
                    strategy: 'global', 
                    config: { ...config.global, emergencyStop } 
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 策略配置 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="mintSplit" className="flex items-center gap-2">
            铸造拆分
            {config.mintSplit.enabled && <Badge variant="default" className="h-5">开启</Badge>}
          </TabsTrigger>
          <TabsTrigger value="arbitrage" className="flex items-center gap-2">
            套利
            {config.arbitrage.enabled && <Badge variant="default" className="h-5">开启</Badge>}
          </TabsTrigger>
          <TabsTrigger value="marketMaking" className="flex items-center gap-2">
            做市
            {config.marketMaking.enabled && <Badge variant="default" className="h-5">开启</Badge>}
          </TabsTrigger>
        </TabsList>
        
        {/* Mint-Split 配置 */}
        <TabsContent value="mintSplit">
          <MintSplitConfigCard 
            config={config.mintSplit}
            status={status?.mintSplit}
            onSave={(newConfig) => updateMutation.mutate({ strategy: 'mintSplit', config: newConfig })}
            saving={updateMutation.isPending}
          />
        </TabsContent>
        
        {/* Arbitrage 配置 */}
        <TabsContent value="arbitrage">
          <ArbitrageConfigCard 
            config={config.arbitrage}
            status={status?.arbitrage}
            onSave={(newConfig) => updateMutation.mutate({ strategy: 'arbitrage', config: newConfig })}
            saving={updateMutation.isPending}
          />
        </TabsContent>
        
        {/* Market-Making 配置 */}
        <TabsContent value="marketMaking">
          <MarketMakingConfigCard 
            config={config.marketMaking}
            status={status?.marketMaking}
            onSave={(newConfig) => updateMutation.mutate({ strategy: 'marketMaking', config: newConfig })}
            saving={updateMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Mint-Split 配置卡片
function MintSplitConfigCard({ 
  config, 
  status,
  onSave, 
  saving 
}: { 
  config: MintSplitConfig
  status?: any
  onSave: (config: MintSplitConfig) => void
  saving: boolean
}) {
  const [localConfig, setLocalConfig] = useState(config)
  
  const updateField = <K extends keyof MintSplitConfig>(key: K, value: MintSplitConfig[K]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>铸造拆分策略 (Mint-Split)</CardTitle>
            <CardDescription>当多结果市场所有结果卖价之和 {`>`} $1 时，铸造完整代币并分别卖出</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              {status?.today && (
                <>
                  <div>今日: {status.today.found} 发现 / {status.today.success} 成功</div>
                  <div className={status.today.profit >= 0 ? "text-green-600" : "text-red-600"}>
                    利润: ${status.today.profit?.toFixed(2)}
                  </div>
                </>
              )}
            </div>
            <Switch
              checked={localConfig.enabled}
              onCheckedChange={(enabled) => updateField('enabled', enabled)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 触发条件 */}
        <div>
          <h4 className="font-medium mb-3">触发条件</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>最小价格和</Label>
              <Input
                type="number"
                step="0.001"
                value={localConfig.minPriceSum}
                onChange={(e) => updateField('minPriceSum', parseFloat(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">价格和 {`>`} 此值时触发</p>
            </div>
            <div className="space-y-2">
              <Label>最小预期利润 ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={localConfig.minProfit}
                onChange={(e) => updateField('minProfit', parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>最少结果数</Label>
              <Input
                type="number"
                value={localConfig.minOutcomes}
                onChange={(e) => updateField('minOutcomes', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>最小流动性 ($)</Label>
              <Input
                type="number"
                value={localConfig.minLiquidity}
                onChange={(e) => updateField('minLiquidity', parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>
        
        {/* 交易参数 */}
        <div>
          <h4 className="font-medium mb-3">交易参数</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>铸造金额 ($)</Label>
              <Input
                type="number"
                value={localConfig.mintAmount}
                onChange={(e) => updateField('mintAmount', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>最大滑点 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.maxSlippage}
                onChange={(e) => updateField('maxSlippage', parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>冷却时间 (秒)</Label>
              <Input
                type="number"
                value={localConfig.cooldownMs / 1000}
                onChange={(e) => updateField('cooldownMs', parseInt(e.target.value) * 1000)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                自动执行
              </Label>
              <Switch
                checked={localConfig.autoExecute}
                onCheckedChange={(v) => updateField('autoExecute', v)}
              />
            </div>
          </div>
        </div>
        
        {/* 风控 */}
        <div>
          <h4 className="font-medium mb-3">风控限制</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>单次最大铸造 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxMintPerTrade}
                onChange={(e) => updateField('maxMintPerTrade', parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>每日最大铸造 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxMintPerDay}
                onChange={(e) => updateField('maxMintPerDay', parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={() => onSave(localConfig)} disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Arbitrage 配置卡片
function ArbitrageConfigCard({ 
  config, 
  status,
  onSave, 
  saving 
}: { 
  config: ArbitrageConfig
  status?: any
  onSave: (config: ArbitrageConfig) => void
  saving: boolean
}) {
  const [localConfig, setLocalConfig] = useState(config)
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>套利策略 (Arbitrage)</CardTitle>
            <CardDescription>
              LONG: 当买价总和 {`<`} $1 时买入所有结果 | 
              SHORT: 当卖价总和 {`>`} $1 时卖出所有结果
            </CardDescription>
          </div>
          <Switch
            checked={localConfig.enabled}
            onCheckedChange={(enabled) => setLocalConfig(prev => ({ ...prev, enabled }))}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* LONG 子策略 */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">LONG (做多)</h4>
            <Switch
              checked={localConfig.long.enabled}
              onCheckedChange={(enabled) => 
                setLocalConfig(prev => ({ ...prev, long: { ...prev.long, enabled } }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
              <p className="text-xs text-muted-foreground">价格和 {`<`} 此值时触发</p>
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
            </div>
          </div>
          {status?.long?.today && (
            <div className="mt-2 text-sm text-muted-foreground">
              今日: {status.long.today.found} 发现 / {status.long.today.success} 成功
            </div>
          )}
        </div>
        
        {/* 通用参数 */}
        <div>
          <h4 className="font-medium mb-3">通用参数</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>交易金额 ($)</Label>
              <Input
                type="number"
                value={localConfig.tradeAmount}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, tradeAmount: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>最大滑点 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.maxSlippage}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxSlippage: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>冷却时间 (秒)</Label>
              <Input
                type="number"
                value={localConfig.cooldownMs / 1000}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, cooldownMs: parseInt(e.target.value) * 1000 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>自动执行</Label>
              <Switch
                checked={localConfig.autoExecute}
                onCheckedChange={(autoExecute) => setLocalConfig(prev => ({ ...prev, autoExecute }))}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={() => onSave(localConfig)} disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Market-Making 配置卡片
function MarketMakingConfigCard({ 
  config, 
  status,
  onSave, 
  saving 
}: { 
  config: MarketMakingConfig
  status?: any
  onSave: (config: MarketMakingConfig) => void
  saving: boolean
}) {
  const [localConfig, setLocalConfig] = useState(config)
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>做市策略 (Market-Making)</CardTitle>
            <CardDescription>在市场两侧挂单赚取价差，自动管理库存和持仓</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.enabled ? "default" : "secondary"}>
              {config.enabled ? "风险较高" : "已关闭"}
            </Badge>
            <Switch
              checked={localConfig.enabled}
              onCheckedChange={(enabled) => setLocalConfig(prev => ({ ...prev, enabled }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 做市参数 */}
        <div>
          <h4 className="font-medium mb-3">做市参数</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>买卖价差 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.spreadPercent}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, spreadPercent: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>单边最大持仓 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxPositionPerSide}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxPositionPerSide: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>刷新间隔 (秒)</Label>
              <Input
                type="number"
                value={localConfig.refreshIntervalMs / 1000}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, refreshIntervalMs: parseInt(e.target.value) * 1000 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>自动执行</Label>
              <Switch
                checked={localConfig.autoExecute}
                onCheckedChange={(autoExecute) => setLocalConfig(prev => ({ ...prev, autoExecute }))}
              />
            </div>
          </div>
        </div>
        
        {/* 市场筛选 */}
        <div>
          <h4 className="font-medium mb-3">市场筛选</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>最小流动性 ($)</Label>
              <Input
                type="number"
                value={localConfig.minLiquidity}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minLiquidity: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>最小24h交易量 ($)</Label>
              <Input
                type="number"
                value={localConfig.minVolume24h}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, minVolume24h: parseInt(e.target.value) }))}
              />
            </div>
          </div>
        </div>
        
        {/* 风控 */}
        <div>
          <h4 className="font-medium mb-3">风控设置</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>库存偏斜阈值</Label>
              <Input
                type="number"
                step="0.1"
                value={localConfig.skewThreshold}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, skewThreshold: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>最大未平仓持仓 ($)</Label>
              <Input
                type="number"
                value={localConfig.maxOpenPosition}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, maxOpenPosition: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>自动 Merge</Label>
              <Switch
                checked={localConfig.autoMerge}
                onCheckedChange={(autoMerge) => setLocalConfig(prev => ({ ...prev, autoMerge }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Merge 阈值 ($)</Label>
              <Input
                type="number"
                value={localConfig.mergeThreshold}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, mergeThreshold: parseInt(e.target.value) }))}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={() => onSave(localConfig)} disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
