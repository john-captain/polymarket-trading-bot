"use client"

/**
 * 队列管理页面
 * 显示所有队列的状态、配置和控制操作
 */

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { 
  Play, 
  Square, 
  Pause, 
  RefreshCw, 
  Activity,
  Database,
  Layers,
  ArrowRightLeft,
  TrendingUp,
  ShoppingCart,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"

// ==================== 类型定义 ====================

interface QueueInfo {
  name: string
  label: string
  description: string
  icon: React.ReactNode
  category: 'core' | 'strategy' | 'execution'
}

interface QueueStatusData {
  size: number
  pending: number
  maxSize?: number
  state: string
  processedCount?: number
  errorCount?: number
  completed?: number
  failed?: number
  lastTaskAt?: string | null
  stats?: {
    inserted: number
    updated: number
    skipped: number
    errors: number
  }
}

// ==================== 队列配置 ====================

const QUEUE_INFO: Record<string, QueueInfo> = {
  scan: {
    name: 'scan',
    label: '扫描队列',
    description: '从 Gamma API 获取市场数据，分发给下游队列',
    icon: <RefreshCw className="h-5 w-5" />,
    category: 'core',
  },
  storage: {
    name: 'storage',
    label: '存储队列',
    description: '将市场数据写入数据库（静态→markets，动态→price_history）',
    icon: <Database className="h-5 w-5" />,
    category: 'core',
  },
  price: {
    name: 'price',
    label: '价格队列',
    description: '从 CLOB API 获取精确买卖价格，存储到 market_prices 表',
    icon: <TrendingUp className="h-5 w-5" />,
    category: 'core',
  },
  mintSplit: {
    name: 'mintSplit',
    label: 'Mint-Split 策略',
    description: '铸造拆分套利：当价格和 > 1 时铸造并卖出',
    icon: <Layers className="h-5 w-5" />,
    category: 'strategy',
  },
  arbitrage: {
    name: 'arbitrage',
    label: '套利策略',
    description: 'LONG 套利：当价格和 < 1 时买入所有结果',
    icon: <ArrowRightLeft className="h-5 w-5" />,
    category: 'strategy',
  },
  marketMaking: {
    name: 'marketMaking',
    label: '做市策略',
    description: '双边挂单赚取价差，自动管理库存',
    icon: <TrendingUp className="h-5 w-5" />,
    category: 'strategy',
  },
  order: {
    name: 'order',
    label: '订单队列',
    description: '执行交易订单，调用 CLOB API 下单',
    icon: <ShoppingCart className="h-5 w-5" />,
    category: 'execution',
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  core: '核心队列',
  strategy: '策略队列',
  execution: '执行队列',
}

// ==================== 辅助函数 ====================

function getStateColor(state: string): string {
  switch (state) {
    case 'running':
      return 'bg-green-500'
    case 'paused':
      return 'bg-yellow-500'
    case 'stopped':
      return 'bg-red-500'
    case 'idle':
    default:
      return 'bg-gray-400'
  }
}

function getStateBadge(state: string) {
  const colors: Record<string, string> = {
    running: 'bg-green-100 text-green-800 border-green-200',
    paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    stopped: 'bg-red-100 text-red-800 border-red-200',
    idle: 'bg-gray-100 text-gray-800 border-gray-200',
  }
  const labels: Record<string, string> = {
    running: '运行中',
    paused: '已暂停',
    stopped: '已停止',
    idle: '空闲',
  }
  return (
    <Badge className={cn('border', colors[state] || colors.idle)}>
      {labels[state] || state}
    </Badge>
  )
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN')
  } catch {
    return '-'
  }
}

// ==================== 页面组件 ====================

export default function QueuesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isControlling, setIsControlling] = useState(false)

  // 获取队列状态
  const { data: queueStatus, isLoading, error } = useQuery({
    queryKey: ['queues', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/queues/status')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '获取队列状态失败')
      }
      return data.data
    },
    refetchInterval: 3000,
  })

  // 扫描队列控制
  const controlMutation = useMutation({
    mutationFn: async (action: string) => {
      setIsControlling(true)
      const res = await fetch('/api/queues/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '操作失败')
      }
      return data
    },
    onSuccess: (data) => {
      toast({ title: "操作成功", description: data.message })
      queryClient.invalidateQueries({ queryKey: ['queues'] })
    },
    onError: (error: Error) => {
      toast({ title: "操作失败", description: error.message, variant: "destructive" })
    },
    onSettled: () => {
      setIsControlling(false)
    },
  })

  // 价格队列控制
  const priceControlMutation = useMutation({
    mutationFn: async (action: string) => {
      setIsControlling(true)
      const res = await fetch('/api/queues/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || '操作失败')
      }
      return data
    },
    onSuccess: (data) => {
      toast({ title: "操作成功", description: data.message })
      queryClient.invalidateQueries({ queryKey: ['queues'] })
    },
    onError: (error: Error) => {
      toast({ title: "操作失败", description: error.message, variant: "destructive" })
    },
    onSettled: () => {
      setIsControlling(false)
    },
  })

  // 构建队列数据
  const buildQueueData = () => {
    if (!queueStatus) return []

    const queues: { info: QueueInfo; status: QueueStatusData }[] = []

    // 扫描队列
    if (queueStatus.scan) {
      queues.push({
        info: QUEUE_INFO.scan,
        status: queueStatus.scan,
      })
    }

    // 存储队列
    if (queueStatus.storage) {
      queues.push({
        info: QUEUE_INFO.storage,
        status: queueStatus.storage,
      })
    }

    // 价格队列
    if (queueStatus.price) {
      queues.push({
        info: QUEUE_INFO.price,
        status: queueStatus.price,
      })
    }

    // 策略队列
    if (queueStatus.strategies) {
      if (queueStatus.strategies.mintSplit) {
        queues.push({
          info: QUEUE_INFO.mintSplit,
          status: queueStatus.strategies.mintSplit,
        })
      }
      if (queueStatus.strategies.arbitrage) {
        queues.push({
          info: QUEUE_INFO.arbitrage,
          status: queueStatus.strategies.arbitrage,
        })
      }
      if (queueStatus.strategies.marketMaking) {
        queues.push({
          info: QUEUE_INFO.marketMaking,
          status: queueStatus.strategies.marketMaking,
        })
      }
    }

    // 订单队列
    if (queueStatus.orders) {
      queues.push({
        info: QUEUE_INFO.order,
        status: queueStatus.orders,
      })
    }

    return queues
  }

  const queues = buildQueueData()
  const isQueueRunning = queueStatus?.scan?.state === 'running'

  // 按类别分组
  const groupedQueues = queues.reduce((acc, queue) => {
    const category = queue.info.category
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(queue)
    return acc
  }, {} as Record<string, typeof queues>)

  // 统计数据
  const totalProcessed = queues.reduce((sum, q) => sum + (q.status.processedCount || q.status.completed || 0), 0)
  const totalErrors = queues.reduce((sum, q) => sum + (q.status.errorCount || q.status.failed || 0), 0)
  const runningCount = queues.filter(q => q.status.state === 'running').length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium">加载失败</p>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : '未知错误'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">队列管理</h1>
          <p className="text-muted-foreground">监控和管理所有后台队列任务</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Layers className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">队列总数</p>
                <p className="text-2xl font-bold">{queues.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">运行中</p>
                <p className="text-2xl font-bold">{runningCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">已处理</p>
                <p className="text-2xl font-bold">{totalProcessed.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">错误数</p>
                <p className="text-2xl font-bold">{totalErrors.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 队列列表 - 按类别分组 */}
      {Object.entries(groupedQueues).map(([category, categoryQueues]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {category === 'core' && <Database className="h-5 w-5" />}
              {category === 'strategy' && <TrendingUp className="h-5 w-5" />}
              {category === 'execution' && <ShoppingCart className="h-5 w-5" />}
              {CATEGORY_LABELS[category] || category}
            </CardTitle>
            <CardDescription>
              {category === 'core' && '数据采集和存储的核心队列'}
              {category === 'strategy' && '交易策略处理队列'}
              {category === 'execution' && '订单执行队列'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">队列名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-[100px]">状态</TableHead>
                  <TableHead className="w-[100px] text-right">队列大小</TableHead>
                  <TableHead className="w-[100px] text-right">已处理</TableHead>
                  <TableHead className="w-[100px] text-right">错误数</TableHead>
                  <TableHead className="w-[180px]">最后活动</TableHead>
                  <TableHead className="w-[100px] text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryQueues.map(({ info, status }) => (
                  <TableRow key={info.name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "p-2 rounded-lg",
                          status.state === 'running' ? 'bg-green-100' : 'bg-gray-100'
                        )}>
                          {info.icon}
                        </div>
                        <span className="font-medium">{info.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {info.description}
                    </TableCell>
                    <TableCell>
                      {getStateBadge(status.state)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono">
                        {status.size || 0}
                        {status.maxSize && (
                          <span className="text-muted-foreground">/{status.maxSize}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(status.processedCount || status.completed || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-mono",
                        (status.errorCount || status.failed || 0) > 0 && "text-red-600 font-medium"
                      )}>
                        {(status.errorCount || status.failed || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatTime(status.lastTaskAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      {info.name === 'scan' && (
                        <Button
                          size="sm"
                          variant={status.state === 'running' ? "destructive" : "default"}
                          onClick={() => controlMutation.mutate(status.state === 'running' ? 'stop' : 'start')}
                          disabled={isControlling}
                        >
                          {isControlling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : status.state === 'running' ? (
                            <>
                              <Square className="h-4 w-4 mr-1" />
                              停止
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              启动
                            </>
                          )}
                        </Button>
                      )}
                      {info.name === 'price' && (
                        <Button
                          size="sm"
                          variant={status.state === 'running' ? "destructive" : "default"}
                          onClick={() => priceControlMutation.mutate(status.state === 'running' ? 'stop' : 'start')}
                          disabled={isControlling}
                        >
                          {isControlling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : status.state === 'running' ? (
                            <>
                              <Square className="h-4 w-4 mr-1" />
                              停止
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              启动
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* 存储队列详细统计 */}
      {queueStatus?.storage?.stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              存储队列统计
            </CardTitle>
            <CardDescription>数据库写入统计信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">新增记录</p>
                <p className="text-2xl font-bold text-green-600">
                  {queueStatus.storage.stats.inserted?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">更新记录</p>
                <p className="text-2xl font-bold text-blue-600">
                  {queueStatus.storage.stats.updated?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-muted-foreground">跳过记录</p>
                <p className="text-2xl font-bold text-gray-600">
                  {queueStatus.storage.stats.skipped?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-muted-foreground">写入错误</p>
                <p className="text-2xl font-bold text-red-600">
                  {queueStatus.storage.stats.errors?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 价格队列详细统计 */}
      {queueStatus?.price?.stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              价格队列统计
            </CardTitle>
            <CardDescription>CLOB API 精确价格获取统计</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">市场总数</p>
                <p className="text-2xl font-bold text-blue-600">
                  {queueStatus.price.stats.totalMarkets?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Token 总数</p>
                <p className="text-2xl font-bold text-purple-600">
                  {queueStatus.price.stats.totalTokens?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">最后获取</p>
                <p className="text-2xl font-bold text-green-600">
                  {queueStatus.price.stats.lastFetchedCount?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-muted-foreground">耗时 (ms)</p>
                <p className="text-2xl font-bold text-orange-600">
                  {queueStatus.price.stats.lastDuration?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 队列说明 */}
      <Card>
        <CardHeader>
          <CardTitle>队列系统说明</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-2">扫描队列数据流</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>1. <strong>扫描队列</strong> 从 Gamma API 获取市场数据</p>
                <p>2. 数据同时分发给 <strong>存储队列</strong> 和 <strong>策略分发器</strong></p>
                <p>3. <strong>存储队列</strong> 将数据写入 MySQL 数据库</p>
                <p>4. <strong>策略队列</strong> 检测套利机会并生成订单</p>
                <p>5. <strong>订单队列</strong> 执行交易订单</p>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">价格队列数据流</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>1. 从 <strong>markets 表</strong> 读取活跃市场的 token_ids</p>
                <p>2. 调用 <strong>CLOB API /prices</strong> 获取精确买卖价格</p>
                <p>3. 计算中点价格、价差、价差百分比</p>
                <p>4. 对比 Gamma 价格差异</p>
                <p>5. 写入 <strong>market_prices 表</strong></p>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">扫描间隔</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>扫描队列：<strong>每 1 小时</strong> 扫描一轮</p>
                <p>价格队列：<strong>每 5 分钟</strong> 更新一次</p>
                <p>每轮扫描约 16,000+ 个活跃市场</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
