"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Bell,
  Key,
  Wallet,
  Globe,
  Moon,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Activity,
} from "lucide-react"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState({
    // API 设置
    rpcUrl: "https://polygon-rpc.com",
    clobApiKey: "",
    clobApiSecret: "",
    // 通知设置
    enableTelegramNotify: false,
    telegramBotToken: "",
    telegramChatId: "",
    enableEmailNotify: false,
    email: "",
    // 交易设置
    maxTradeAmount: "100",
    dailyLossLimit: "50",
    enableDailyLimit: true,
    // 安全设置
    enableTwoFactor: false,
    autoLockMinutes: "30",
  })

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
    }, 1000)
  }

  return (
    <div className="flex flex-col">
      <Header
        title="系统设置"
        description="管理账户、API 和通知配置"
      />

      <div className="flex-1 space-y-6 p-6">
        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full max-w-[750px] grid-cols-5">
            <TabsTrigger value="account" className="gap-2">
              <User className="h-4 w-4" />
              账户
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Key className="h-4 w-4" />
              API
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              通知
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              安全
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <FileText className="h-4 w-4" />
              日志
            </TabsTrigger>
          </TabsList>

          {/* 账户设置 */}
          <TabsContent value="account">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    钱包信息
                  </CardTitle>
                  <CardDescription>
                    您的 Polygon 钱包地址和余额
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      钱包地址
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        value="0x..."
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Badge variant="secondary" className="shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        已连接
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">
                        USDC 余额
                      </label>
                      <p className="text-lg font-mono font-semibold">$0.00</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">
                        MATIC 余额
                      </label>
                      <p className="text-lg font-mono font-semibold">0.00</p>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <RefreshCw className="h-4 w-4" />
                    刷新余额
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SettingsIcon className="h-5 w-5" />
                    交易限额
                  </CardTitle>
                  <CardDescription>
                    设置交易金额和风险控制
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">
                      单笔最大交易金额 ($)
                    </label>
                    <Input
                      type="number"
                      value={settings.maxTradeAmount}
                      onChange={(e) => setSettings({ ...settings, maxTradeAmount: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">启用每日亏损限额</label>
                      <p className="text-sm text-muted-foreground">
                        达到限额后自动停止交易
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableDailyLimit}
                      onCheckedChange={(checked) => setSettings({ ...settings, enableDailyLimit: checked })}
                    />
                  </div>

                  {settings.enableDailyLimit && (
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">
                        每日亏损限额 ($)
                      </label>
                      <Input
                        type="number"
                        value={settings.dailyLossLimit}
                        onChange={(e) => setSettings({ ...settings, dailyLossLimit: e.target.value })}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API 设置 */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  API 配置
                </CardTitle>
                <CardDescription>
                  配置 RPC 和 Polymarket CLOB API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Polygon RPC URL
                  </label>
                  <Input
                    value={settings.rpcUrl}
                    onChange={(e) => setSettings({ ...settings, rpcUrl: e.target.value })}
                    placeholder="https://polygon-rpc.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    用于查询余额和发送交易
                  </p>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    CLOB API Key
                  </label>
                  <Input
                    value={settings.clobApiKey}
                    onChange={(e) => setSettings({ ...settings, clobApiKey: e.target.value })}
                    placeholder="输入 API Key"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    CLOB API Secret
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type={showPrivateKey ? "text" : "password"}
                      value={settings.clobApiSecret}
                      onChange={(e) => setSettings({ ...settings, clobApiSecret: e.target.value })}
                      placeholder="输入 API Secret"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                    >
                      {showPrivateKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-warning mb-1">安全提示</p>
                      <p className="text-muted-foreground">
                        API 密钥存储在本地环境变量中。建议使用 <code className="bg-muted px-1 rounded">.env</code> 文件管理敏感信息。
                        运行 <code className="bg-muted px-1 rounded">npm run gen-creds</code> 生成凭证。
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通知设置 */}
          <TabsContent value="notifications">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Telegram 通知</CardTitle>
                  <CardDescription>
                    通过 Telegram 机器人接收交易提醒
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">启用 Telegram 通知</label>
                      <p className="text-sm text-muted-foreground">
                        接收套利机会和交易结果通知
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableTelegramNotify}
                      onCheckedChange={(checked) => setSettings({ ...settings, enableTelegramNotify: checked })}
                    />
                  </div>

                  {settings.enableTelegramNotify && (
                    <>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">
                          Bot Token
                        </label>
                        <Input
                          value={settings.telegramBotToken}
                          onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">
                          Chat ID
                        </label>
                        <Input
                          value={settings.telegramChatId}
                          onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                          placeholder="123456789"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>邮件通知</CardTitle>
                  <CardDescription>
                    通过邮件接收重要提醒
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">启用邮件通知</label>
                      <p className="text-sm text-muted-foreground">
                        接收每日报告和异常警告
                      </p>
                    </div>
                    <Switch
                      checked={settings.enableEmailNotify}
                      onCheckedChange={(checked) => setSettings({ ...settings, enableEmailNotify: checked })}
                    />
                  </div>

                  {settings.enableEmailNotify && (
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">
                        邮箱地址
                      </label>
                      <Input
                        type="email"
                        value={settings.email}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        placeholder="your@email.com"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 安全设置 */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  安全设置
                </CardTitle>
                <CardDescription>
                  保护您的账户安全
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">双重验证</label>
                    <p className="text-sm text-muted-foreground">
                      执行交易前需要额外确认
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableTwoFactor}
                    onCheckedChange={(checked) => setSettings({ ...settings, enableTwoFactor: checked })}
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    自动锁定时间（分钟）
                  </label>
                  <Input
                    type="number"
                    value={settings.autoLockMinutes}
                    onChange={(e) => setSettings({ ...settings, autoLockMinutes: e.target.value })}
                    className="max-w-[200px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    无操作后自动停止机器人
                  </p>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-4">危险区域</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
                      <div>
                        <p className="font-medium">重置所有设置</p>
                        <p className="text-sm text-muted-foreground">
                          将所有设置恢复为默认值
                        </p>
                      </div>
                      <Button variant="destructive" size="sm">
                        重置
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API 日志 */}
          <TabsContent value="logs">
            <ApiLogsTab />
          </TabsContent>
        </Tabs>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// API 日志类型定义
interface ApiLog {
  id: number
  clientType: string
  endpoint: string
  method: string
  requestParams?: Record<string, any>
  statusCode?: number
  durationMs?: number
  success: boolean
  errorMessage?: string
  traceId?: string
  source?: string
  createdAt: string
}

interface ApiLogStats {
  total: number
  success: number
  failed: number
  avgDuration: number
  byClient: { clientType: string; count: number; avgDuration: number }[]
}

// API 日志 Tab 组件
function ApiLogsTab() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // 筛选状态
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(0)
  const pageSize = 20
  
  // 获取统计数据
  const { data: statsData } = useQuery({
    queryKey: ['api-logs', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/logs?stats=true')
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data as ApiLogStats
    },
    refetchInterval: 30000,
  })
  
  // 获取日志列表
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['api-logs', clientFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (clientFilter !== 'all') params.set('clientType', clientFilter)
      if (statusFilter === 'success') params.set('success', 'true')
      if (statusFilter === 'failed') params.set('success', 'false')
      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))
      
      const res = await fetch(`/api/logs?${params}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data as { logs: ApiLog[]; pagination: { hasMore: boolean } }
    },
    refetchInterval: 10000,
  })
  
  // 清理旧日志
  const cleanMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await fetch(`/api/logs?days=${days}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.data
    },
    onSuccess: (data) => {
      toast({
        title: "清理成功",
        description: data.message,
      })
      queryClient.invalidateQueries({ queryKey: ['api-logs'] })
    },
    onError: (error) => {
      toast({
        title: "清理失败",
        description: error instanceof Error ? error.message : '未知错误',
        variant: "destructive",
      })
    },
  })
  
  const logs = logsData?.logs || []
  const hasMore = logsData?.pagination?.hasMore || false
  
  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  
  // 格式化端点显示
  const formatEndpoint = (endpoint: string) => {
    if (endpoint.length > 40) {
      return endpoint.substring(0, 40) + '...'
    }
    return endpoint
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总请求数</p>
                <p className="text-2xl font-bold">{statsData?.total || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">成功</p>
                <p className="text-2xl font-bold text-green-600">{statsData?.success || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">失败</p>
                <p className="text-2xl font-bold text-red-600">{statsData?.failed || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">平均耗时</p>
                <p className="text-2xl font-bold">{statsData?.avgDuration || 0}ms</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日志表格 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                API 请求日志
              </CardTitle>
              <CardDescription>
                查看所有 API 调用记录，用于调试和审计
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="客户端类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="GAMMA">Gamma</SelectItem>
                  <SelectItem value="CLOB">CLOB</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => cleanMutation.mutate(7)}
                disabled={cleanMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                清理7天前
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">时间</TableHead>
                  <TableHead className="w-[80px]">类型</TableHead>
                  <TableHead className="w-[60px]">方法</TableHead>
                  <TableHead>端点</TableHead>
                  <TableHead className="w-[80px]">耗时</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                  <TableHead>错误信息</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      暂无日志记录
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          log.clientType === 'GAMMA' && 'border-blue-300 bg-blue-50 text-blue-700',
                          log.clientType === 'CLOB' && 'border-purple-300 bg-purple-50 text-purple-700',
                        )}>
                          {log.clientType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {log.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[300px] truncate" title={log.endpoint}>
                        {formatEndpoint(log.endpoint)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.durationMs ? `${log.durationMs}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            成功
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            失败
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={log.errorMessage || ''}>
                        {log.errorMessage || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* 分页 */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              第 {page + 1} 页，每页 {pageSize} 条
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 按客户端统计 */}
      {statsData?.byClient && statsData.byClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>按客户端统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {statsData.byClient.map((client) => (
                <div 
                  key={client.clientType}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn(
                      client.clientType === 'GAMMA' && 'border-blue-300 bg-blue-50 text-blue-700',
                      client.clientType === 'CLOB' && 'border-purple-300 bg-purple-50 text-purple-700',
                    )}>
                      {client.clientType}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {client.count} 次请求
                    </span>
                  </div>
                  <span className="text-sm font-mono">
                    平均 {Math.round(client.avgDuration)}ms
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}