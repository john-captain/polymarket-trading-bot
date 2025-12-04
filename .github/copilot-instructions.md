# Polymarket 交易机器人 AI 代理指令

## 项目概述

这是一个 **Polymarket 预测市场自动化交易系统**，使用 **Next.js 15 + React 18 + TailwindCSS** 构建 Web 管理界面，后端交易逻辑使用 TypeScript。

**生产环境**：https://polymarket.wukongbc.com/

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 15 (App Router) | 页面路由、SSR |
| **UI** | TailwindCSS + shadcn/ui | 组件库 (Radix UI) |
| **状态管理** | Zustand + React Query | 客户端状态、数据获取 |
| **后端** | Next.js API Routes | `/src/app/api/*` |
| **交易逻辑** | TypeScript | `/server/*.ts` (原 Express 代码) |
| **数据库** | MySQL | 交易记录存储 |

## 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── (dashboard)/          # 路由组 - 带侧边栏的页面
│   │   ├── overview/         # 总览仪表盘
│   │   ├── markets/scan/     # 套利扫描
│   │   ├── markets/monitor/  # 价格监控
│   │   ├── strategies/       # 策略配置
│   │   ├── trades/history/   # 交易历史
│   │   ├── trades/positions/ # 当前持仓
│   │   └── settings/         # 系统设置
│   ├── api/                  # API 路由
│   │   ├── balance/          # 钱包余额
│   │   ├── arbitrage/        # 套利相关 API
│   │   ├── bot/              # 机器人控制
│   │   └── logs/             # 日志
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 首页 (重定向到 /overview)
│   └── globals.css           # 全局样式 (CSS 变量)
├── components/
│   ├── layout/               # 布局组件 (Sidebar, Header)
│   └── ui/                   # shadcn/ui 组件
├── lib/
│   ├── bot-state.ts          # 全局状态管理
│   ├── arbitrage-scanner.ts  # 套利扫描逻辑
│   └── utils.ts              # 工具函数
└── hooks/                    # React Hooks

server/                       # 原后端交易逻辑 (独立运行)
├── arbitrage_bot.ts          # 双边套利策略
├── auto_trading_bot.ts       # 单向套利策略
├── binance_oracle.ts         # Binance 价格预言机
├── market_order.ts           # 订单执行
└── db.ts                     # MySQL 数据库
```

## 开发命令

```bash
npm run dev          # 启动 Next.js 开发服务器 (localhost:3000)
npm run build        # 生产构建
npm run start        # 生产服务器
npm run gen-creds    # 生成 Polymarket API 凭证
npm run check-balance # 检查钱包余额
```

## 核心套利策略

> 基于论文《Polymarket 预测市场中的套利行为》

| 类型 | 条件 | 操作 | 利润公式 |
|------|------|------|----------|
| **做多 (LONG)** | 价格和 < 1 | 买入所有结果 | `投入 × (1 - 价格和) / 价格和` |
| **做空 (SHORT)** | 价格和 > 1 | 卖出所有结果 | `投入 × (价格和 - 1)` |

### 关键参数 (.env)

```bash
ARB_MIN_SPREAD=1.0      # 最小价差 (%)
ARB_MIN_PROFIT=0.02     # 最小利润 ($)
ARB_TRADE_AMOUNT=10.0   # 每边金额 ($)
ARB_SCAN_INTERVAL=2000  # 扫描间隔 (ms)
PRIVATE_KEY=0x...       # Polygon 钱包私钥
```

## 项目约定 (必须遵守)

### 1. 中文本地化（强制）
```typescript
console.log('✅ 机器人启动成功！');
throw new Error('余额不足');
```

### 2. 浅色主题
使用 CSS 变量定义在 `globals.css`，不使用深色主题。

### 3. API 字段一致性
```typescript
// API 返回
{ success: true, data: { scanCount, opportunityCount, totalProfit } }

// 前端使用相同字段名
data.data.scanCount  // ✓
```

### 4. 价格精度
始终显示 4 位小数：`price.toFixed(4)`

### 5. shadcn/ui 组件
组件位于 `src/components/ui/`，使用方式：
```typescript
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
```

## 代码规范

### 前端规范 (React/Next.js)

#### 组件结构
```typescript
// 1. 导入顺序：React → 第三方库 → 本地组件 → 类型 → 样式
"use client"  // 客户端组件必须声明

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import type { Market } from "@/types"

// 2. 组件命名：PascalCase，文件名与组件名一致
export function MarketCard({ market }: { market: Market }) {
  // 3. Hooks 放在组件顶部
  const [isLoading, setIsLoading] = useState(false)
  
  // 4. 事件处理函数用 handle 前缀
  const handleClick = () => { ... }
  
  return (...)
}
```

#### 状态管理
```typescript
// 服务端状态：React Query
const { data, isLoading } = useQuery({
  queryKey: ['markets'],
  queryFn: () => fetch('/api/markets').then(r => r.json()),
  refetchInterval: 5000,  // 轮询间隔
})

// 客户端状态：Zustand (复杂) 或 useState (简单)
// 避免 prop drilling，超过 2 层使用 Context 或 Zustand
```

#### 样式规范
```typescript
// 1. 使用 Tailwind 类名，避免内联 style
<div className="flex items-center gap-4 p-4 rounded-lg border">

// 2. 条件类名使用 cn() 工具函数
import { cn } from "@/lib/utils"
<div className={cn(
  "px-4 py-2 rounded",
  isActive && "bg-primary text-white",
  disabled && "opacity-50 cursor-not-allowed"
)}>

// 3. 响应式设计：移动优先
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
```

#### 页面文件结构
```
src/app/(dashboard)/markets/scan/
├── page.tsx        # 页面组件（服务端默认）
├── loading.tsx     # 加载状态（可选）
├── error.tsx       # 错误边界（可选）
└── _components/    # 页面私有组件（下划线前缀）
```

### 后端规范 (API Routes)

#### API 响应格式
```typescript
// 统一响应结构
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string  // 用户友好的提示信息
}

// 成功响应
return NextResponse.json({
  success: true,
  data: { balance: 100.50, address: "0x..." }
})

// 错误响应
return NextResponse.json(
  { success: false, error: "余额不足", message: "请先充值 USDC" },
  { status: 400 }
)
```

#### 错误处理
```typescript
export async function GET() {
  try {
    const data = await fetchData()
    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    // 1. 记录详细错误日志
    console.error("API 错误:", error)
    
    // 2. 返回用户友好的错误信息
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
```

#### 环境变量
```typescript
// 1. 始终提供默认值
const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com"
const interval = parseInt(process.env.SCAN_INTERVAL || "2000")

// 2. 敏感信息检查
if (!process.env.PRIVATE_KEY) {
  throw new Error("未配置 PRIVATE_KEY 环境变量")
}

// 3. 数值类型转换并验证
const amount = Math.max(parseFloat(process.env.TRADE_AMOUNT || "10"), 1)
```

### 通用规范

#### 命名约定
| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `MarketCard`, `TradingBot` |
| 函数/变量 | camelCase | `fetchMarkets`, `isLoading` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| 文件 (组件) | kebab-case | `market-card.tsx`, `use-balance.ts` |
| CSS 类 | kebab-case | `card-header`, `btn-primary` |
| API 路由 | kebab-case | `/api/arbitrage/scan-markets` |

#### TypeScript 类型
```typescript
// 1. 优先使用 interface 定义对象类型
interface Market {
  id: string
  question: string
  outcomes: Outcome[]
}

// 2. 使用 type 定义联合类型或工具类型
type TradeType = "LONG" | "SHORT"
type MarketWithPrice = Market & { price: number }

// 3. 避免 any，使用 unknown 并进行类型收窄
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message)
  }
}

// 4. API 响应类型定义在 src/types/ 目录
```

#### 注释规范
```typescript
// 单行注释：解释"为什么"而非"是什么"
const delay = 2000  // 避免 API 限速，最小间隔 2 秒

/**
 * 计算套利利润
 * @param priceSum - 所有结果价格之和
 * @param amount - 投入金额
 * @returns 预期利润（美元）
 */
function calculateProfit(priceSum: number, amount: number): number {
  // 做多：价格和 < 1 时有利润
  if (priceSum < 1) {
    return amount * (1 - priceSum) / priceSum
  }
  return 0
}

// TODO: 待实现的功能
// FIXME: 需要修复的问题
// HACK: 临时解决方案，需要重构
```

#### Git 提交规范
```bash
# 格式：<type>: <description>
feat: 添加套利扫描页面
fix: 修复余额显示精度问题
refactor: 重构 API 响应格式
style: 调整卡片间距
docs: 更新部署文档
chore: 升级依赖版本
```

## 关键集成点

| 服务 | URL | 用途 |
|------|-----|------|
| Polygon RPC | polygon-rpc.com (多备用) | 余额查询、交易 |
| CLOB API | clob.polymarket.com | 订单簿、下单 |
| Gamma API | gamma-api.polymarket.com | 市场发现 |
| Binance WS | stream.binance.com | BTC 实时价格 |

**USDC 合约**：`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`（6 位小数）

## 数据库配置 (MySQL)

交易记录存储在 MySQL，配置在 `.env`：

```bash
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=polymarket
```

数据库操作封装在 `server/db.ts`，主要表：
- `trades` - 交易记录
- `arbitrage_logs` - 套利日志

## 生产部署 (PM2)

```bash
# 1. 构建生产版本
npm run build

# 2. 使用 PM2 启动
pm2 start npm --name "polymarket-web" -- run start

# 常用命令
pm2 restart polymarket-web   # 重启
pm2 logs polymarket-web      # 查看日志
pm2 stop polymarket-web      # 停止
pm2 delete polymarket-web    # 删除

# 设置开机自启
pm2 startup
pm2 save
```

**Nginx 反向代理** (可选)：
```nginx
server {
    listen 80;
    server_name polymarket.wukongbc.com;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 常见问题

1. **RPC 网络错误**：`src/app/api/balance/route.ts` 已配置多 RPC 自动切换
2. **市场数据为空**：API 请求需添加 `User-Agent` 头
3. **页面 404**：检查 `(dashboard)` 路由组下的文件结构
4. **样式不生效**：确认 `tailwind.config.ts` 包含正确的 content 路径
5. **PM2 端口占用**：`pm2 delete all` 后重新启动

## 调试

```bash
# 测试 API
curl http://localhost:3000/api/balance
curl http://localhost:3000/api/arbitrage/stats

# 查看日志
tail -f /tmp/next-dev.log  # 开发模式
pm2 logs polymarket-web    # 生产模式
```

---

**修改代码时**：保持中文本地化，使用 shadcn/ui 组件，浅色主题，API 字段一致。
