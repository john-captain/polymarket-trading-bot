# Polymarket 交易机器人 AI 代理指令

## 项目概述

这是一个用 TypeScript 编写的 **Polymarket 预测市场自动化交易系统**，包含两种交易策略和 Web 管理界面。

**生产环境**：https://polymarket.wukongbc.com/

### 核心策略

1. **单向套利** (`auto_trading_bot.ts`)：当预言机价格 > 市场价格达到阈值时买入，设置止盈/止损
2. **双边套利** (`arbitrage_bot.ts`)：基于论文优化的市场再平衡套利策略

## 套利策略详解 (论文优化版)

> 基于论文《Polymarket 预测市场中的套利行为》

### 套利类型

| 类型 | 条件 | 操作 | 利润公式 |
|------|------|------|----------|
| **做多 (LONG)** | 价格和 < 1 | 买入所有结果 | `投入 × (1 - 价格和) / 价格和` |
| **做空 (SHORT)** | 价格和 > 1 | 卖出所有结果 | `投入 × (价格和 - 1)` |

### 市场类型

```typescript
enum MarketType {
    BINARY = 'BINARY',           // 二元市场 (Yes/No)
    MULTI_OUTCOME = 'MULTI_OUTCOME'  // 多结果市场 (NegRisk)
}
```

### 关键参数

```bash
ARB_MIN_SPREAD=1.0      # 最小价差 (%)
ARB_MIN_PROFIT=0.02     # 最小利润 ($)，论文建议值
ARB_TRADE_AMOUNT=10.0   # 每边金额 ($)
ARB_SCAN_INTERVAL=2000  # 扫描间隔 (ms)
```

## 架构与数据流

### 三种操作模式

| 模式 | 入口 | 命令 | 说明 |
|------|------|------|------|
| **Web 界面** | `web_server.ts` | `npm run web` | Express 服务 + 实时监控 |
| **手动 CLI** | `main.ts` | `npm run dev` | 交互式菜单 |
| **自动交易** | `auto_trading_bot.ts` | `npm run auto-trade` | 单向套利机器人 |

### Web 服务架构 (`web_server.ts`)

```
Express (port 3000)
├── /                    → index.html (主控制台)
├── /arbitrage           → arbitrage.html (双边套利界面)
├── /api/balance         → 钱包余额
├── /api/prices          → 实时价格 (BinanceOracle)
├── /api/bot/*           → 单向交易机器人控制
├── /api/arbitrage/*     → 双边套利机器人控制
└── /api/settings        → 参数配置
```

**套利数据流**：
```
Gamma API → fetchActiveMarkets() (200 个市场)
    ↓
parseMarket() → 价格和、套利类型、利润计算
    ↓
checkArbitrageOpportunity() → 做多/做空判断
    ↓
executeTrade() / executeMultiOutcomeTrade() → 并行下单
```

### 价格获取逻辑

**市场价格** (`arbitrage_bot.ts`)：
- 使用 **best ask 价格**（买入价），不是中间价
- 多结果市场：并行获取所有 token 价格
- API 请求需添加 `User-Agent` 头避免被拦截

```typescript
// 做多: 买入所有，用 ask 价格
// 做空: 卖出所有，用 bid 价格
const asks = data.asks || [];
if (asks.length > 0) return parseFloat(asks[0].price);
```

## 开发工作流

### 运行命令

```bash
npm run web          # Web 界面（PM2 部署用）
npm run auto-trade   # 单向套利机器人
npm run arbitrage    # 双边套利机器人（独立运行）
npm run check-balance # 余额检查
npm run gen-creds    # 生成 API 凭证
```

### PM2 生产部署

```bash
pm2 start npm --name "polymarket-web" -- run web
pm2 restart polymarket-web  # 重启服务
pm2 logs polymarket-web     # 查看日志
```

### 首次设置

1. `.env` 添加 `PRIVATE_KEY=0x...`
2. `npm run gen-creds` 生成凭证
3. 充值 USDC + MATIC 到 Polygon 钱包
4. `npm run check-balance` 验证
5. 小额测试（$5-10）

## 项目约定

### 1. 中文本地化（强制）

所有控制台输出必须使用中文：
```typescript
console.log('✅ 机器人启动成功！');
addArbitrageLog('💡 发现套利机会');
throw new Error('余额不足');
```

### 2. API 字段命名

后端与前端字段必须一致：
```typescript
// 后端返回
{ scanCount, opportunityCount, tradeCount, totalProfit }

// 前端使用相同字段名
data.data.scanCount  // ✓
data.data.totalScans // ✗ 错误
```

### 3. 价格精度

显示始终 4 位小数：
```typescript
console.log(`价格: $${price.toFixed(4)}`);
```

### 4. Token ID 格式

长数字字符串，不是十六进制：
```typescript
tokenId: "74767151816109143033985302396646508973461696862933513382243898574910115069108"
```

### 5. 环境变量默认值

始终提供回退：
```typescript
const interval = Math.max(parseInt(process.env.ARB_SCAN_INTERVAL || '2000'), 2000);
```

## 关键集成点

| 服务 | URL | 用途 |
|------|-----|------|
| Polygon RPC | polygon-rpc.com | 余额查询、交易 |
| CLOB API | clob.polymarket.com | 订单簿、下单 |
| Gamma API | gamma-api.polymarket.com | 市场发现 |
| Binance WS | stream.binance.com | BTC 实时价格 |

**USDC 合约**：`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`（6 位小数，桥接版本）

## 文件结构

```
src/
├── web_server.ts      # Express Web 服务（主入口）
├── arbitrage_bot.ts   # 双边套利策略 (论文优化版)
├── auto_trading_bot.ts # 单向套利策略
├── binance_oracle.ts  # Binance 价格预言机
├── balance_checker.ts # 余额验证
├── market_finder.ts   # 市场发现
└── market_order.ts    # 订单执行

public/
├── index.html         # 主控制台
└── arbitrage.html     # 套利监控界面

docs/
└── ARBITRAGE_STRATEGY.md  # 套利策略完整文档
```

## ArbitrageBot 核心方法

| 方法 | 功能 |
|------|------|
| `fetchActiveMarkets()` | 获取 200 个活跃市场，按价差排序 |
| `parseMarket()` | 解析市场，识别类型 (BINARY/MULTI_OUTCOME) |
| `checkArbitrageOpportunity()` | 检测套利 (做多/做空) |
| `checkMultiOutcomeArbitrage()` | 多结果市场专用检测 |
| `executeTrade()` | 二元市场并行下单 |
| `executeMultiOutcomeTrade()` | 多结果市场并行下单 |

## 常见问题

1. **市场数据为空**：检查 API 请求是否有 User-Agent 头
2. **价格都是 0.5**：确认使用 best ask 而非中间价
3. **PM2 端口占用**：`pm2 delete all && pm2 start...`
4. **扫描间隔太快**：最小 2000ms，避免 API 限速
5. **负价差显示**：正常，表示做空机会 (价格和 > 1)
6. **利润为 0**：未达到最小利润阈值 ($0.02)

## 调试技巧

```bash
# 查看套利日志
curl http://localhost:3000/api/arbitrage/logs | python3 -m json.tool

# 检查市场数据
curl http://localhost:3000/api/arbitrage/markets | python3 -m json.tool

# PM2 实时日志
pm2 logs polymarket-web --lines 50
```

---

**修改代码时**：保持中文本地化，API 字段一致，先小额测试。
