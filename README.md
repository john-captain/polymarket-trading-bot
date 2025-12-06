# Polymarket 预测市场套利交易机器人

一个专业的 **Polymarket 预测市场自动化套利交易系统**，使用 **Next.js 15 + React 18 + TailwindCSS** 构建现代化 Web 管理界面。

🌐 **生产环境**：http://polymarket.wukongbc.com/

## 功能特性

- 🎯 **套利扫描**：自动扫描所有市场，检测套利机会
- � **实时监控**：价格监控、订单簿数据、市场分析
- 💰 **一键执行**：发现套利机会后可一键执行交易
- � **交易历史**：完整的交易记录和盈亏统计
- � **持仓管理**：查看当前持仓和浮动盈亏
- ⚙️ **策略配置**：可配置的套利参数和风险控制

![Dashboard](./run.png)

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 15 (App Router) | 页面路由、SSR |
| **UI** | TailwindCSS + shadcn/ui | 组件库 (Radix UI) |
| **状态管理** | Zustand + React Query | 客户端状态、数据获取 |
| **后端** | Next.js API Routes | RESTful API |
| **数据库** | MySQL | 交易记录存储 |
| **区块链** | Polygon + Polymarket CLOB | 链上交易执行 |

## 套利策略

> 基于论文《Polymarket 预测市场中的套利行为》

| 类型 | 条件 | 操作 | 利润公式 |
|------|------|------|----------|
| **做多 (LONG)** | 价格和 < 1 | 买入所有结果 | `投入 × (1 - 价格和) / 价格和` |
| **做空 (SHORT)** | 价格和 > 1 | 卖出所有结果 | `投入 × (价格和 - 1)` |

## 安装

```bash
# 克隆项目
git clone https://github.com/john-captain/polymarket-trading-bot.git
cd polymarket-trading-bot

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入您的私钥和数据库配置
```

## 配置

编辑 `.env` 文件：

```env
# Polygon 钱包私钥
PRIVATE_KEY=0x...

# 套利参数
ARB_MIN_SPREAD=1.0        # 最小价差 (%)
ARB_MIN_PROFIT=0.02       # 最小利润 ($)
ARB_TRADE_AMOUNT=10.0     # 每边金额 ($)
ARB_SCAN_INTERVAL=2000    # 扫描间隔 (ms)

# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=polymarket

# RPC 节点（可选，有默认值）
RPC_URL=https://polygon-rpc.com
```

## 使用方法

### 开发模式

```bash
npm run dev

taskkill /F /IM node.exe 2>$null; npm run dev  #重启开发服务器
```

访问 http://localhost:3000 打开管理界面。

### 生产部署

```bash
ss -ltnp | grep ':3000' || true
kill -9 26109 && sleep 1 && ss -ltnp | grep ':3000' || true
npm run start


# 构建生产版本
npm run build

# 使用 PM2 启动
pm2 start npm --name "polymarket-web" -- run start

# 常用命令
pm2 restart polymarket-web   # 重启
pm2 logs polymarket-web      # 查看日志
pm2 stop polymarket-web      # 停止
```

### 其他命令

```bash
# 生成 CLOB API 凭证
npm run gen-creds

# 检查钱包余额
npm run check-balance
```

## 项目结构

```
polymarket-trading-bot/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (dashboard)/          # 路由组 - 带侧边栏的页面
│   │   │   ├── overview/         # 总览仪表盘
│   │   │   ├── markets/scan/     # 套利扫描
│   │   │   ├── markets/monitor/  # 价格监控
│   │   │   ├── strategies/       # 策略配置
│   │   │   ├── trades/history/   # 交易历史
│   │   │   ├── trades/positions/ # 当前持仓
│   │   │   └── settings/         # 系统设置
│   │   ├── api/                  # API 路由
│   │   │   ├── balance/          # 钱包余额
│   │   │   ├── arbitrage/        # 套利相关 API
│   │   │   │   ├── scan/         # 扫描市场
│   │   │   │   ├── execute/      # 执行交易
│   │   │   │   ├── stats/        # 统计数据
│   │   │   │   └── ...
│   │   │   ├── trades/           # 交易记录
│   │   │   └── bot/              # 机器人控制
│   │   ├── layout.tsx            # 根布局
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   ├── layout/               # 布局组件 (Sidebar, Header)
│   │   └── ui/                   # shadcn/ui 组件
│   ├── lib/
│   │   ├── trade-executor.ts     # 交易执行器
│   │   ├── database.ts           # 数据库操作
│   │   ├── arbitrage-scanner.ts  # 套利扫描逻辑
│   │   └── utils.ts              # 工具函数
│   ├── types/                    # TypeScript 类型定义
│   └── hooks/                    # React Hooks
├── server/                       # 独立脚本 (凭证生成等)
├── .env                          # 环境变量（私有）
├── package.json                  # 依赖和脚本
└── README.md                     # 本文档
```

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/balance` | GET | 获取钱包 USDC/MATIC 余额 |
| `/api/arbitrage/scan` | GET | 扫描套利机会 |
| `/api/arbitrage/execute` | POST | 执行套利交易 |
| `/api/arbitrage/stats` | GET | 获取统计数据 |
| `/api/trades` | GET | 获取交易历史记录 |

## 关键集成点

| 服务 | URL | 用途 |
|------|-----|------|
| Polygon RPC | polygon-rpc.com | 余额查询、交易 |
| CLOB API | clob.polymarket.com | 订单簿、下单 |
| Gamma API | gamma-api.polymarket.com | 市场发现 |

**USDC 合约**：`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`（Polygon，6 位小数）

## 安全注意事项

⚠️ **重要：**
- 切勿提交您的 `.env` 文件
- 保护好您的私钥
- 首先使用小额测试
- 在确认前审查所有交易

## 依赖

- `next` - Next.js 15 框架
- `react` - React 18
- `@polymarket/clob-client` - Polymarket CLOB 客户端
- `@ethersproject/wallet` - 以太坊钱包
- `mysql2` - MySQL 数据库驱动
- `@tanstack/react-query` - 数据获取
- `zustand` - 状态管理
- `tailwindcss` - CSS 框架
- `shadcn/ui` - UI 组件库


### 关键参数 (.env)

```bash
ARB_MIN_SPREAD=1.0      # 最小价差 (%)
ARB_MIN_PROFIT=0.02     # 最小利润 ($)
ARB_TRADE_AMOUNT=10.0   # 每边金额 ($)
ARB_SCAN_INTERVAL=2000  # 扫描间隔 (ms)
PRIVATE_KEY=0x...       # Polygon 钱包私钥

# 代理配置 (可选)
HTTP_PROXY=http://127.0.0.1:7890    # HTTP 代理
SOCKS_PROXY=socks5://127.0.0.1:7890 # SOCKS5 代理
```

### 代理支持

API 请求支持通过代理访问，实现在 `src/lib/arbitrage-scanner.ts`：

```typescript
import { SocksProxyAgent } from 'socks-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'

// 根据环境变量自动选择代理类型
const proxyUrl = process.env.SOCKS_PROXY || process.env.HTTP_PROXY
const agent = proxyUrl?.startsWith('socks') 
  ? new SocksProxyAgent(proxyUrl)
  : new HttpsProxyAgent(proxyUrl)

// 在 fetch 请求中使用
const response = await fetch(url, { agent })
```

## 许可证

ISC

## 支持

如有问题或疑问，请参考：
- [Polymarket 文档](https://docs.polymarket.com)
- [CLOB API 文档](https://docs.polymarket.com/#clob-api)
- [Next.js 文档](https://nextjs.org/docs)

---

**免责声明**：使用风险自负。本软件按原样提供，不提供任何保证。始终先用小额测试。
