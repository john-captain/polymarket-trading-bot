"use client"

/**
 * Mint-Split 策略配置页面
 * 铸造拆分策略 - 当多结果市场所有结果卖价之和 > $1 时，铸造完整代币并分别卖出
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
    Layers,
    TrendingUp,
    Shield,
    Zap,
    DollarSign,
    Clock,
    Target,
    AlertTriangle,
    CheckCircle2,
    BarChart3,
    BookOpen,
    Calculator,
    ArrowRight,
    Info,
    Percent,
    RefreshCw,
    Timer,
    Wallet,
} from "lucide-react"

// Mint-Split 配置类型
interface MintSplitConfig {
    enabled: boolean
    autoExecute: boolean
    minPriceSum: number
    minOutcomes: number
    minLiquidity: number
    mintAmount: number
    maxSlippage: number
    cooldownMs: number
    maxMintPerTrade: number
    maxMintPerDay: number
}

export default function MintSplitConfigPage() {
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
        mutationFn: async (config: MintSplitConfig) => {
            const res = await fetch('/api/strategies/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strategy: 'mintSplit', config }),
            })
            const data = await res.json()
            if (!data.success) throw new Error(data.error)
            return data
        },
        onSuccess: () => {
            toast({ title: "配置已保存", description: "Mint-Split 策略配置更新成功" })
            queryClient.invalidateQueries({ queryKey: ['strategies', 'config'] })
        },
        onError: (error: Error) => {
            toast({ title: "保存失败", description: error.message, variant: "destructive" })
        },
    })

    const config = configData?.mintSplit as MintSplitConfig | undefined
    const mintSplitStatus = status?.mintSplit

    if (isLoading || !config) {
        return (
            <div className="flex flex-col">
                <Header title="Mint-Split 配置" description="加载中..." />
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">加载配置中...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col">
            <Header
                title="Mint-Split 策略配置"
                description="铸造拆分策略 - 当多结果市场价格和 > $1 时套利"
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
                                    <p className="text-sm text-muted-foreground">今日发现</p>
                                    <p className="text-xl font-bold">{mintSplitStatus?.today?.found || 0}</p>
                                </div>
                                <Target className="h-8 w-8 text-blue-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">今日成功</p>
                                    <p className="text-xl font-bold text-green-600">{mintSplitStatus?.today?.success || 0}</p>
                                </div>
                                <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">今日利润</p>
                                    <p className={`text-xl font-bold ${(mintSplitStatus?.today?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ${(mintSplitStatus?.today?.profit || 0).toFixed(2)}
                                    </p>
                                </div>
                                <DollarSign className="h-8 w-8 text-green-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 配置表单 */}
                <MintSplitConfigForm
                    config={config}
                    onSave={(newConfig) => updateMutation.mutate(newConfig)}
                    saving={updateMutation.isPending}
                />
            </div>
        </div>
    )
}

// 配置表单组件
function MintSplitConfigForm({
    config,
    onSave,
    saving
}: {
    config: MintSplitConfig
    onSave: (config: MintSplitConfig) => void
    saving: boolean
}) {
    const [localConfig, setLocalConfig] = useState(config)

    const updateField = <K extends keyof MintSplitConfig>(key: K, value: MintSplitConfig[K]) => {
        setLocalConfig(prev => ({ ...prev, [key]: value }))
    }

    const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config)

    return (
        <div className="space-y-6">
            {/* 主开关 */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Layers className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <CardTitle>策略开关</CardTitle>
                                <CardDescription>启用或禁用 Mint-Split 策略</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <Switch
                                checked={localConfig.enabled}
                                onCheckedChange={(enabled) => updateField('enabled', enabled)}
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
                            onCheckedChange={(autoExecute) => updateField('autoExecute', autoExecute)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* 触发条件 */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Target className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle>触发条件</CardTitle>
                            <CardDescription>满足以下条件时才会检测套利机会</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <Label>最小价格和</Label>
                            <Input
                                type="number"
                                step="0.001"
                                value={localConfig.minPriceSum}
                                onChange={(e) => updateField('minPriceSum', parseFloat(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                价格和 &gt; 此值时触发（推荐 1.005）
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>最少结果数</Label>
                            <Input
                                type="number"
                                min={2}
                                value={localConfig.minOutcomes}
                                onChange={(e) => updateField('minOutcomes', parseInt(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                市场至少有这么多结果选项
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>最小流动性 ($)</Label>
                            <Input
                                type="number"
                                value={localConfig.minLiquidity}
                                onChange={(e) => updateField('minLiquidity', parseInt(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                市场流动性低于此值时跳过
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 交易参数 */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <TrendingUp className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                            <CardTitle>交易参数</CardTitle>
                            <CardDescription>配置每次交易的金额和执行参数</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5" />
                                铸造金额 ($)
                            </Label>
                            <Input
                                type="number"
                                value={localConfig.mintAmount}
                                onChange={(e) => updateField('mintAmount', parseInt(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                每次铸造的 USDC 金额，建议 $10-100 起步
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
                                onChange={(e) => updateField('maxSlippage', parseFloat(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                实际成交价与 Bid 价偏差阈值
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
                                onChange={(e) => updateField('cooldownMs', parseInt(e.target.value) * 1000)}
                            />
                            <p className="text-xs text-muted-foreground">
                                同一市场重复交易的间隔
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
                            <CardDescription>设置交易量上限，控制风险敞口</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>单次最大铸造 ($)</Label>
                            <Input
                                type="number"
                                value={localConfig.maxMintPerTrade}
                                onChange={(e) => updateField('maxMintPerTrade', parseInt(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                单笔交易最大铸造金额
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>每日最大铸造 ($)</Label>
                            <Input
                                type="number"
                                value={localConfig.maxMintPerDay}
                                onChange={(e) => updateField('maxMintPerDay', parseInt(e.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">
                                24 小时内最大铸造总额
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
                            <CardDescription>理解 Mint-Split 套利的核心逻辑</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* 核心概念 */}
                    <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                            <Target className="h-4 w-4 text-blue-500" />
                            核心概念
                        </h4>
                        <p className="text-sm text-muted-foreground">
                            在 Polymarket 预测市场中，每个市场有多个互斥结果（如 Yes/No，或候选人 A/B/C/D）。
                            由于市场定价机制，所有结果的最佳卖价（Bid）之和可能超过 $1，此时存在无风险套利机会。
                        </p>
                    </div>

                    {/* 套利步骤 */}
                    <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-green-500" />
                            套利步骤
                        </h4>
                        <div className="grid gap-3">
                            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                                <Badge variant="outline" className="mt-0.5">1</Badge>
                                <div>
                                    <p className="font-medium text-sm">发现机会</p>
                                    <p className="text-xs text-muted-foreground">
                                        扫描所有活跃市场，计算每个结果的 Bid 价格之和。当 ∑Bid &gt; 1 时触发（如 0.35 + 0.28 + 0.42 = 1.05）
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                                <Badge variant="outline" className="mt-0.5">2</Badge>
                                <div>
                                    <p className="font-medium text-sm">铸造代币 (Mint)</p>
                                    <p className="text-xs text-muted-foreground">
                                        调用 ConditionalTokens 智能合约的 <code className="bg-muted px-1 rounded">splitPosition</code> 函数，
                                        支付 N 个 USDC，铸造一套完整代币（每个结果各 N 份）
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                                <Badge variant="outline" className="mt-0.5">3</Badge>
                                <div>
                                    <p className="font-medium text-sm">分别卖出</p>
                                    <p className="text-xs text-muted-foreground">
                                        在 CLOB 订单簿上分别卖出每个结果的代币，按照各自的 Bid 价格成交
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                                <Badge variant="outline" className="mt-0.5">4</Badge>
                                <div>
                                    <p className="font-medium text-sm">获取利润</p>
                                    <p className="text-xs text-muted-foreground">
                                        卖出总额 - 铸造成本 = 净利润。例如：铸造 $10 → 卖出 $10.50 → 净赚 $0.50
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 收益计算公式 */}
                    <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-purple-500" />
                            收益计算公式
                        </h4>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border font-mono text-sm space-y-2">
                            <p><span className="text-muted-foreground">// 设：铸造金额 = A，价格和 = S</span></p>
                            <p>毛利润 = A × (S - 1)</p>
                            <p>Taker 手续费 = A × S × 1%</p>
                            <p>Gas 费 ≈ $0.01~0.05</p>
                            <p className="text-green-600 font-semibold">净利润 = 毛利润 - 手续费 - Gas</p>
                        </div>
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-sm text-green-800">
                                <strong>示例：</strong>价格和 = 1.05，铸造 $100
                            </p>
                            <ul className="text-xs text-green-700 mt-1 space-y-0.5">
                                <li>• 毛利润 = $100 × 0.05 = $5.00</li>
                                <li>• 手续费 = $100 × 1.05 × 1% = $1.05</li>
                                <li>• 净利润 ≈ $5.00 - $1.05 = <strong>$3.95 (3.95%)</strong></li>
                            </ul>
                        </div>
                    </div>

                    {/* 为什么有效 */}
                    <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                            <Info className="h-4 w-4 text-cyan-500" />
                            为什么会存在套利机会？
                        </h4>
                        <ul className="text-sm text-muted-foreground space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-cyan-500">•</span>
                                <span><strong>多结果市场：</strong>候选人众多时，市场难以高效定价，更容易出现偏差</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-cyan-500">•</span>
                                <span><strong>流动性分散：</strong>做市商无法覆盖所有结果，部分结果定价偏高</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-cyan-500">•</span>
                                <span><strong>信息不对称：</strong>突发新闻导致某些结果价格过度反应</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-cyan-500">•</span>
                                <span><strong>套利者不足：</strong>多数人不知道可以铸造代币套利</span>
                            </li>
                        </ul>
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
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">滑点风险</Badge>
                            <p className="text-muted-foreground">
                                订单簿深度不足时，实际成交价可能低于显示的 Bid 价格，导致利润减少甚至亏损
                            </p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">执行风险</Badge>
                            <p className="text-muted-foreground">
                                铸造和卖出之间存在时间差，市场价格可能在此期间变动
                            </p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">Gas 风险</Badge>
                            <p className="text-muted-foreground">
                                Polygon 网络拥堵时 Gas 费上涨，可能侵蚀小额套利的利润
                            </p>
                        </div>
                        <div className="flex items-start gap-2">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">竞争风险</Badge>
                            <p className="text-muted-foreground">
                                其他套利者可能更快发现并执行相同机会，导致机会消失
                            </p>
                        </div>
                    </div>
                    <p className="text-amber-700 font-medium mt-4">
                        💡 建议：优先选择高流动性市场，设置合理的滑点和利润阈值，小额起步验证策略
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
