"use client"

import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
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
} from "lucide-react"
import { useState } from "react"

export default function SettingsPage() {
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
          <TabsList className="grid w-full max-w-[600px] grid-cols-4">
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
