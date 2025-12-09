"use client"

/**
 * 机会列表页面
 * 显示所有策略发现的套利机会
 */

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QueueStatusGroup, type QueueStatusData } from "@/components/queue-status-card"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Play, Square, RefreshCw, Activity, Copy, Check } from "lucide-react"

// 类型定义
interface Opportunity {
  id: number
  conditionId: string
  question: string
  slug?: string
  strategyType: string
  priceSum?: number
  spread?: number
  expectedProfit?: number
  actualProfit?: number
  investmentAmount?: number
  tokens?: {
    tokenId: string
    outcome: string
    price: number
    size: number
    filled?: number
    status?: string
  }[]
  status: string
  executionSteps?: {
    step: number
    action: string
    status: string
    timestamp?: string
    txHash?: string
    error?: string
  }[]
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

interface OpportunityStats {
  pending: number
  queued: number
  executing: number
  success: number
  failed: number
  partial: number
  successRate: number
  totalExpectedProfit: number
  totalActualProfit: number
}

interface TodayStats {
  found: number
  executed: number
  success: number
  failed: number
  profit: number
}

// API 请求日志类型
interface ApiLog {
  id: number
  clientType: string
  endpoint: string
  method: string
  success: boolean
  statusCode?: number
  durationMs?: number
  responseSize?: number
  requestParams?: Record<string, any>
  retryCount?: number
  errorMessage?: string
  traceId?: string
  source?: string
  createdAt: string
}

// 状态徽章颜色映射
const statusStyles: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-700' },
  QUEUED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  EXECUTING: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  PARTIAL: { bg: 'bg-orange-100', text: 'text-orange-700' },
  SUCCESS: { bg: 'bg-green-100', text: 'text-green-700' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-700' },
  EXPIRED: { bg: 'bg-gray-200', text: 'text-gray-600' },
  CANCELLED: { bg: 'bg-gray-200', text: 'text-gray-600' },
}

const statusLabels: Record<string, string> = {
  PENDING: '待处理',
  QUEUED: '队列中',
  EXECUTING: '执行中',
  PARTIAL: '部分成功',
  SUCCESS: '成功',
  FAILED: '失败',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
}

const strategyLabels: Record<string, string> = {
  MINT_SPLIT: '铸造拆分',
  ARBITRAGE_LONG: '套利-做多',
  ARBITRAGE_SHORT: '套利-做空',
  MARKET_MAKING: '做市',
}

export default function OpportunitiesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // 筛选状态
  const [strategyFilter, setStrategyFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 20
  
  // 选中的机会详情
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  
  // 获取队列状态
  const { data: queueStatus } = useQuery({
    queryKey: ['queues', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/queues/status')
      const data = await res.json()
      if (!data.success) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        throw new Error(errMsg || '获取队列状态失败')
      }
      return data.data
    },
    refetchInterval: 3000,
  })
  
  // 获取机会列表
  const { data: opportunitiesData, isLoading } = useQuery({
    queryKey: ['opportunities', strategyFilter, statusFilter, searchQuery, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (strategyFilter !== 'all') params.set('strategy', strategyFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))
      
      const res = await fetch(`/api/opportunities?${params}`)
      const data = await res.json()
      if (!data.success) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        throw new Error(errMsg || '获取机会列表失败')
      }
      return data.data as {
        opportunities: Opportunity[]
        total: number
        stats: OpportunityStats
        today: TodayStats
      }
    },
    refetchInterval: 5000,
  })
  
  // 队列控制
  const controlMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch('/api/queues/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        throw new Error(errMsg || '队列控制失败')
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
  })
  
  // 获取 API 请求日志
  const { data: apiLogs } = useQuery({
    queryKey: ['api-logs'],
    queryFn: async () => {
      const res = await fetch('/api/logs?limit=20')
      const data = await res.json()
      if (!data.success) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        throw new Error(errMsg || '获取 API 日志失败')
      }
      return data.data as ApiLog[]
    },
    refetchInterval: 5000,
  })
  
  // 判断队列是否正在运行
  const isQueueRunning = queueStatus?.scan?.state === 'running' || 
                         queueStatus?.scan?.state === 'processing'
  
  // 构造队列状态数据
  const queueCards: QueueStatusData[] = queueStatus ? [
    {
      name: 'scan',
      label: '扫描队列',
      size: queueStatus.scan?.size || 0,
      pending: queueStatus.scan?.pending || 0,
      maxSize: queueStatus.scan?.maxSize,
      state: queueStatus.scan?.state || 'idle',
      processedCount: queueStatus.scan?.processedCount,
      errorCount: queueStatus.scan?.errorCount,
    },
    {
      name: 'storage',
      label: '存储队列',
      size: queueStatus.storage?.size || 0,
      pending: queueStatus.storage?.pending || 0,
      state: queueStatus.storage?.state || 'idle',
      processedCount: queueStatus.storage?.completed,
      errorCount: queueStatus.storage?.failed,
    },
    {
      name: 'strategy',
      label: '策略队列',
      size: (queueStatus.strategies?.mintSplit?.queueSize || 0) +
            (queueStatus.strategies?.arbitrage?.queueSize || 0) +
            (queueStatus.strategies?.marketMaking?.queueSize || 0),
      pending: 0,
      state: 'running',
    },
    {
      name: 'order',
      label: '订单队列',
      size: queueStatus.orders?.totalOrders || 0,
      pending: queueStatus.orders?.successOrders || 0,
      state: 'running',
    },
  ] : []
  
  const opportunities = opportunitiesData?.opportunities || []
  const stats = opportunitiesData?.stats
  const today = opportunitiesData?.today
  const totalPages = Math.ceil((opportunitiesData?.total || 0) / pageSize)
  
  // 过滤搜索
  const filteredOpportunities = searchQuery
    ? opportunities.filter(opp => 
        opp.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opp.conditionId.includes(searchQuery)
      )
    : opportunities

  return (
    <div className="space-y-6">
      {/* 页面标题和控制按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">套利机会监控</h1>
          <p className="text-muted-foreground">实时监控各策略发现的交易机会</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 运行状态指示 */}
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isQueueRunning ? "bg-green-500 animate-pulse" : "bg-gray-300"
            )} />
            <span className="text-sm text-muted-foreground">
              {isQueueRunning ? "运行中" : "已停止"}
            </span>
          </div>
          
          {/* 启动/停止按钮 */}
          {isQueueRunning ? (
            <Button 
              variant="outline"
              onClick={() => controlMutation.mutate('stop')}
              disabled={controlMutation.isPending}
            >
              <Square className="h-4 w-4 mr-2" />
              停止
            </Button>
          ) : (
            <Button 
              onClick={() => controlMutation.mutate('start')}
              disabled={controlMutation.isPending}
            >
              <Play className="h-4 w-4 mr-2" />
              启动
            </Button>
          )}
        </div>
      </div>
      
      {/* 队列状态卡片 */}
      <QueueStatusGroup queues={queueCards} />
      
      {/* 筛选区 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <Select value={strategyFilter} onValueChange={setStrategyFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="策略类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部策略</SelectItem>
                <SelectItem value="MINT_SPLIT">铸造拆分</SelectItem>
                <SelectItem value="ARBITRAGE_LONG">套利-做多</SelectItem>
                <SelectItem value="ARBITRAGE_SHORT">套利-做空</SelectItem>
                <SelectItem value="MARKET_MAKING">做市</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="PENDING">待处理</SelectItem>
                <SelectItem value="QUEUED">队列中</SelectItem>
                <SelectItem value="EXECUTING">执行中</SelectItem>
                <SelectItem value="SUCCESS">成功</SelectItem>
                <SelectItem value="FAILED">失败</SelectItem>
                <SelectItem value="PARTIAL">部分成功</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex-1">
              <Input
                placeholder="搜索市场问题..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 机会列表 */}
      <Card>
        <CardHeader>
          <CardTitle>机会列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">时间</TableHead>
                <TableHead className="w-[100px]">策略</TableHead>
                <TableHead>市场问题</TableHead>
                <TableHead className="w-[100px] text-right">预期利润</TableHead>
                <TableHead className="w-[100px] text-right">实际利润</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : filteredOpportunities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    暂无机会数据
                  </TableCell>
                </TableRow>
              ) : (
                filteredOpportunities.map((opp) => {
                  const style = statusStyles[opp.status] || statusStyles.PENDING
                  return (
                    <TableRow 
                      key={opp.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedOpportunity(opp)}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(opp.createdAt).toLocaleTimeString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {strategyLabels[opp.strategyType] || opp.strategyType}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {opp.question}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${opp.expectedProfit?.toFixed(2) || '-'}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        opp.actualProfit && opp.actualProfit > 0 ? "text-green-600" : 
                        opp.actualProfit && opp.actualProfit < 0 ? "text-red-600" : ""
                      )}>
                        {opp.actualProfit !== undefined ? `$${opp.actualProfit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(style.bg, style.text, "text-xs")}>
                          {statusLabels[opp.status] || opp.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          
          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                共 {opportunitiesData?.total || 0} 条记录
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  上一页
                </Button>
                <span className="flex items-center px-2 text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 底部统计 */}
      {today && (
        <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
          <span>今日发现 <strong className="text-foreground">{today.found}</strong> 个机会</span>
          <span>执行 <strong className="text-foreground">{today.executed}</strong> 次</span>
          <span>成功 <strong className="text-green-600">{today.success}</strong> 次</span>
          <span>总利润 <strong className={today.profit >= 0 ? "text-green-600" : "text-red-600"}>
            ${today.profit.toFixed(2)}
          </strong></span>
        </div>
      )}
      
      {/*  Gamma/CLOB API 调用日志 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-base">Gamma/CLOB API 调用日志</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {apiLogs && apiLogs.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    成功率: {Math.round(apiLogs.filter(l => l.success).length / apiLogs.length * 100)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    平均耗时: {Math.round(apiLogs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / apiLogs.length)}ms
                  </span>
                </>
              )}
              <Badge variant="outline" className="text-xs">
                最近 {apiLogs?.length || 0} 条
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {!apiLogs || apiLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无 Gamma/CLOB API 调用记录，启动扫描后将显示
              </p>
            ) : (
              apiLogs.map((log) => (
                <ApiLogItem key={log.id} log={log} />
              ))
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* 机会详情弹窗 */}
      <OpportunityDetailDialog
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
      />
    </div>
  )
}

// 机会详情弹窗组件
function OpportunityDetailDialog({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity | null
  onClose: () => void
}) {
  if (!opportunity) return null
  
  const style = statusStyles[opportunity.status] || statusStyles.PENDING
  
  return (
    <Dialog open={!!opportunity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            机会详情 #{opportunity.id}
            <Badge className={cn(style.bg, style.text)}>
              {statusLabels[opportunity.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 基本信息 */}
          <div>
            <h4 className="font-medium mb-2">📋 基本信息</h4>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">策略</span>
                <span>{strategyLabels[opportunity.strategyType]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">发现时间</span>
                <span>{new Date(opportunity.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">市场</span>
                <span className="text-right max-w-[60%]">{opportunity.question}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">市场 ID</span>
                <span className="font-mono text-xs">{opportunity.conditionId.slice(0, 20)}...</span>
              </div>
            </div>
          </div>
          
          {/* 套利数据 */}
          <div>
            <h4 className="font-medium mb-2">💰 套利数据</h4>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              {opportunity.priceSum && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">价格和</span>
                  <span>{opportunity.priceSum.toFixed(4)}</span>
                </div>
              )}
              {opportunity.spread !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">价差</span>
                  <span>{opportunity.spread.toFixed(2)}%</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">预期利润</span>
                <span className="text-green-600">${opportunity.expectedProfit?.toFixed(2) || '-'}</span>
              </div>
              {opportunity.actualProfit !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">实际利润</span>
                  <span className={opportunity.actualProfit >= 0 ? "text-green-600" : "text-red-600"}>
                    ${opportunity.actualProfit.toFixed(2)}
                  </span>
                </div>
              )}
              {opportunity.investmentAmount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">投入金额</span>
                  <span>${opportunity.investmentAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Token 详情 */}
          {opportunity.tokens && opportunity.tokens.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">📊 各结果详情</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>结果</TableHead>
                      <TableHead className="text-right">价格</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">成交</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opportunity.tokens.map((token, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{token.outcome}</TableCell>
                        <TableCell className="text-right">${token.price.toFixed(4)}</TableCell>
                        <TableCell className="text-right">{token.size.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {token.filled !== undefined ? token.filled.toFixed(2) : '-'}
                        </TableCell>
                        <TableCell>
                          {token.status === 'filled' && <span className="text-green-600">✅ 成交</span>}
                          {token.status === 'partial' && <span className="text-orange-600">⚠️ 部分</span>}
                          {token.status === 'failed' && <span className="text-red-600">❌ 失败</span>}
                          {token.status === 'pending' && <span className="text-gray-600">⏳ 待处理</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {/* 执行步骤 */}
          {opportunity.executionSteps && opportunity.executionSteps.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">⚡ 执行步骤</h4>
              <div className="space-y-2">
                {opportunity.executionSteps.map((step, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded text-sm",
                      step.status === 'success' && "bg-green-50",
                      step.status === 'failed' && "bg-red-50",
                      step.status === 'executing' && "bg-yellow-50",
                      step.status === 'pending' && "bg-gray-50",
                    )}
                  >
                    <span className="w-6 text-center">
                      {step.status === 'success' && '✅'}
                      {step.status === 'failed' && '❌'}
                      {step.status === 'executing' && '⏳'}
                      {step.status === 'pending' && '○'}
                    </span>
                    <span className="flex-1">{step.action}</span>
                    {step.timestamp && (
                      <span className="text-muted-foreground text-xs">
                        {new Date(step.timestamp).toLocaleTimeString('zh-CN')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 错误信息 */}
          {opportunity.errorMessage && (
            <div>
              <h4 className="font-medium mb-2 text-red-600">❌ 错误信息</h4>
              <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
                {opportunity.errorMessage}
              </div>
            </div>
          )}
          
          {/* 底部按钮 */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {opportunity.slug && (
              <Button
                variant="outline"
                onClick={() => window.open(`https://polymarket.com/event/${opportunity.slug}`, '_blank')}
              >
                在 Polymarket 查看
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// API 日志项组件 - 简洁版，显示时间和完整 URL
function ApiLogItem({ log }: { log: ApiLog }) {
  const [copied, setCopied] = useState(false)
  
  // 构建完整 URL
  const baseUrls: Record<string, string> = {
    GAMMA: 'https://gamma-api.polymarket.com',
    CLOB: 'https://clob.polymarket.com',
  }
  const baseUrl = baseUrls[log.clientType] || ''
  const queryString = log.requestParams 
    ? '?' + new URLSearchParams(
        Object.entries(log.requestParams).map(([k, v]) => [k, String(v)])
      ).toString()
    : ''
  const fullUrl = `${baseUrl}${log.endpoint}${queryString}`
  
  // 复制到剪贴板
  const copyToClipboard = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg border text-sm",
      log.success ? "bg-gray-50/50 border-gray-200" : "bg-red-50/50 border-red-200"
    )}>
      {/* 状态指示 */}
      <div className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        log.success ? "bg-green-500" : "bg-red-500"
      )} />
      
      {/* 时间 */}
      <span className="text-xs text-muted-foreground flex-shrink-0 w-20">
        {new Date(log.createdAt).toLocaleTimeString('zh-CN')}
      </span>
      
      {/* 耗时 */}
      <span className={cn(
        "text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 w-16 text-center",
        (log.durationMs || 0) < 500 ? "bg-green-100 text-green-700" : 
        (log.durationMs || 0) < 2000 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
      )}>
        {log.durationMs}ms
      </span>
      
      {/* 完整 URL */}
      <code 
        className="flex-1 font-mono text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded truncate cursor-pointer hover:bg-blue-100 select-all"
        title={fullUrl}
        onClick={() => window.open(fullUrl, '_blank')}
      >
        {fullUrl}
      </code>
      
      {/* 复制按钮 */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 px-2 text-xs flex-shrink-0"
        onClick={copyToClipboard}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-green-500" />
            <span className="ml-1">已复制</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            <span className="ml-1">复制</span>
          </>
        )}
      </Button>
    </div>
  )
}

