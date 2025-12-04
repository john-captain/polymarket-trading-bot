# Polymarket 套利策略文档

> 基于论文《Polymarket 预测市场中的套利行为》优化

## 目录

- [策略概述](#策略概述)
- [套利类型](#套利类型)
- [利润计算](#利润计算)
- [代码架构](#代码架构)
- [配置参数](#配置参数)
- [运行指南](#运行指南)
- [风险控制](#风险控制)

---

## 策略概述

### 核心原理

预测市场中，所有互斥结果的价格之和理论上应等于 1。当实际价格偏离时，存在套利机会：

```
理论: P(YES) + P(NO) = 1.00
实际: P(YES) + P(NO) ≠ 1.00  →  套利机会！
```

### 论文数据（2024年4月 - 2025年4月）

| 指标 | 数值 |
|------|------|
| 总套利利润 | ~$4,000 万 |
| 有效市场 | 92% |
| 发现机会的条件 | 7,051 个 |
| 最高单账户利润 | $200+ 万 |

---

## 套利类型

### 1. 市场再平衡套利 (Market Rebalancing)

#### 1.1 做多策略 (Long)

**条件**: 价格和 < 1

**操作**: 买入所有结果

**示例**:
```
YES 价格: $0.45
NO 价格:  $0.50
价格和:   $0.95 (< 1.00)
价差:     5%

操作: 买入 YES + NO
结算时必有一个为 1，另一个为 0
保证收益: 5%
```

#### 1.2 做空策略 (Short)

**条件**: 价格和 > 1

**操作**: 卖出所有结果（需持有头寸）

**示例**:
```
YES 价格: $0.55
NO 价格:  $0.50
价格和:   $1.05 (> 1.00)
价差:     -5%

操作: 卖出 YES + NO
获得 $1.05，结算时最多赔付 $1.00
保证收益: 5%
```

### 2. 多条件套利 (NegRisk Markets)

**适用**: 同一事件有多个互斥结果

**示例**:
```
"谁将赢得 2024 美国大选？"
  - Trump:   $0.45
  - Biden:   $0.30
  - Harris:  $0.20
  - Other:   $0.03
  
价格和: $0.98 (< 1.00)
操作: 买入所有选项
```

### 3. 组合套利 (Composite Arbitrage)

**原理**: 利用市场间的逻辑依赖关系

**示例**:
```
市场 A: "A队获胜"          → YES $0.60
市场 B: "A队净胜2球以上"    → YES $0.25

逻辑: B 为真 → A 必然为真
套利: 如果 P(A) < P(B)，存在套利机会
```

> ⚠️ 组合套利需要 LLM 检测市场依赖关系，当前版本未实现

---

## 利润计算

### 做多利润公式

```
投入金额 = trade_amount × 结果数量
利润 = 投入金额 × (1 - 价格和) / 价格和
```

**示例**:
- 每边投入: $10
- 价格和: 0.95
- 总投入: $20
- 利润: $20 × (1 - 0.95) / 0.95 = $1.05

### 做空利润公式

```
利润 = 投入金额 × (价格和 - 1)
```

**示例**:
- 卖出价值: $20
- 价格和: 1.05
- 利润: $20 × (1.05 - 1) = $1.00

### 最小利润阈值

论文建议: **≥ $0.02**

考虑因素:
- Polygon 网络 gas 费: ~$0.001-0.01
- 交易滑点: 0.5%
- 订单执行延迟风险

---

## 代码架构

### 核心类: `ArbitrageBot`

```typescript
// 套利类型枚举
enum ArbitrageType {
    LONG = 'LONG',    // 做多: 买入所有
    SHORT = 'SHORT',  // 做空: 卖出所有
    NONE = 'NONE'
}

// 市场类型枚举
enum MarketType {
    BINARY = 'BINARY',           // 二元 (Yes/No)
    MULTI_OUTCOME = 'MULTI_OUTCOME'  // 多结果
}
```

### 关键方法

| 方法 | 功能 |
|------|------|
| `fetchActiveMarkets()` | 获取活跃市场 (最多 200 个) |
| `parseMarket()` | 解析市场数据，计算价格和 |
| `getTokenPrice()` | 获取 best ask 价格 |
| `checkArbitrageOpportunity()` | 检测套利机会 |
| `checkMultiOutcomeArbitrage()` | 多结果市场套利检测 |
| `executeTrade()` | 执行二元市场交易 |
| `executeMultiOutcomeTrade()` | 执行多结果市场交易 |

### 数据流

```
Gamma API (市场发现)
    ↓
fetchActiveMarkets() → 200 个活跃市场
    ↓
parseMarket() → 价格、类型、套利机会
    ↓
checkArbitrageOpportunity() → 利润计算
    ↓
executeTrade() → 并行下单
```

---

## 配置参数

### 环境变量

```bash
# .env 文件
ARB_MIN_SPREAD=1.0      # 最小价差阈值 (%)
ARB_TRADE_AMOUNT=10.0   # 每边交易金额 (USDC)
ARB_SCAN_INTERVAL=2000  # 扫描间隔 (ms)
ARB_MAX_SLIPPAGE=0.5    # 最大滑点 (%)
ARB_MIN_PROFIT=0.02     # 最小利润阈值 (USDC)
```

### 推荐配置

| 场景 | 价差 | 金额 | 间隔 |
|------|------|------|------|
| 保守 | 2% | $5 | 5000ms |
| 标准 | 1% | $10 | 2000ms |
| 激进 | 0.5% | $20 | 1000ms |

---

## 运行指南

### 启动方式

```bash
# Web 界面 (推荐)
npm run web
# 访问 http://localhost:3000/arbitrage

# 独立运行
npm run arbitrage

# PM2 生产部署
pm2 start npm --name "polymarket-web" -- run web
```

### API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/arbitrage/stats` | GET | 获取统计数据 |
| `/api/arbitrage/markets` | GET | 获取市场列表 |
| `/api/arbitrage/start` | POST | 启动机器人 |
| `/api/arbitrage/stop` | POST | 停止机器人 |
| `/api/arbitrage/settings` | GET/POST | 配置管理 |
| `/api/arbitrage/logs` | GET | 获取日志 |

### Web UI 功能

- 📊 实时统计卡片 (扫描次数、机会、交易)
- 📈 市场价差监控表格
- ⚙️ 参数配置表单
- 📝 日志滚动显示

---

## 风险控制

### 1. 滑点保护

```typescript
// 买入时设置价格上限
priceWithSlippage = price × (1 + maxSlippage)

// 卖出时设置价格下限
priceWithSlippage = price × (1 - maxSlippage)
```

### 2. 最小利润检查

```typescript
if (profit < ARB_MIN_PROFIT) {
    // 跳过，gas 费可能超过利润
    return null;
}
```

### 3. 并行下单

```typescript
// 使用 Promise.all 确保同时执行
const [result1, result2] = await Promise.all([
    buyYes(),
    buyNo()
]);
```

### 4. 市场优先级

按价差绝对值排序，优先处理高收益机会：

```typescript
markets.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
```

### 5. 扫描频率限制

```typescript
// 最小 2 秒间隔，避免 API 限速
scanInterval = Math.max(interval, 2000);
```

---

## 常见问题

### Q: 为什么显示负价差？

**A**: 负价差表示价格和 > 1，是做空机会。需要已持有头寸才能执行。

### Q: 多结果市场如何计算？

**A**: 所有选项价格相加，偏离 1 的部分即为套利空间。

### Q: 为什么有机会但不执行？

**A**: 可能原因：
1. 利润 < 最小阈值 ($0.02)
2. 模拟模式 (默认不执行实际交易)
3. 余额不足

### Q: 如何启用实际交易？

**A**: 取消 `executeTrade()` 调用的注释：
```typescript
// 当前
// await this.executeTrade(opportunity);

// 启用
await this.executeTrade(opportunity);
```

---

## 参考资料

- 论文: "Polymarket 预测市场中的套利行为"
- Polymarket CLOB API: https://docs.polymarket.com
- Gamma API: https://gamma-api.polymarket.com

---

**⚠️ 风险警告**: 套利交易存在执行风险、滑点风险和流动性风险。建议先小额测试。
