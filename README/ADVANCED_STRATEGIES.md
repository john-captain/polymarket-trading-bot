# 高级套利策略文档

## 策略概览

本系统实现了四种专业级 Polymarket 套利策略，基于真实的链上套利行为分析。

### 利润公式

```
总利润 = (拆分套利差价 × 高频次数) + (彩票暴击收益) + (做市点差) - (废料归零成本)
```

---

## 1. 铸造拆分套利 (Mint/Split Arbitrage)

**核心现金牛策略**：批发进货，拆散零售

### 操作逻辑

1. **监控**：24小时扫描多选项市场（温度、赛区冠军、选举等）
2. **触发点**：当所有选项的卖一价（Bid）之和 > $1 时
3. **执行**：
   - 向智能合约支付 1 USDC，铸造一套完整代币
   - 瞬间在市场上分别卖出所有代币
   - 利润 = 卖出总价 - 1 USDC

### 关键参数

```typescript
{
  minPriceSum: 1.005,    // 触发价格和 > $1.005
  minProfit: 0.01,       // 最小 $0.01 利润
  mintAmount: 10,        // 每次铸造 $10
  scanInterval: 2000,    // 2秒扫描一次
  minLiquidity: 100,     // 最小 $100 流动性
  maxSlippage: 0.5,      // 最大 0.5% 滑点
}
```

### 风险等级
- **风险**: 低
- **收益潜力**: 中
- **复杂度**: 复杂（需要快速 API 和竞争激烈）

---

## 2. 库存管理 (Inventory Management)

**垃圾回收与清仓策略**

### 操作逻辑

1. **来源**：执行拆分套利时，总有极冷门选项卖不出去
2. **挂单清仓**：以 0-0.1 美分挂出卖单
3. **Merge 合并**：如果持有同一事件的所有结果，可合并赎回 USDC
4. **税务清理**：确认归零，清理持仓数量

### 关键参数

```typescript
{
  autoListDust: true,        // 自动挂单清仓
  dustPrice: 0.1,            // 0.1 美分清仓价
  minValueToClean: 0.01,     // 价值 < $0.01 触发清理
  holdingTimeThreshold: 24,  // 持仓超过 24 小时清理
  enableMerge: true,         // 启用合并功能
}
```

### 风险等级
- **风险**: 低
- **收益潜力**: 低
- **复杂度**: 简单

---

## 3. 彩票长尾策略 (Longshot / Penny Sniping)

**充满亮点的埋伏策略**

### 操作逻辑

1. **埋伏**：在高不确定性、时间远的市场中，以 1-3 美分买入
2. **等待**：等待黑天鹅事件或市场情绪变化
3. **收益**：概率从 1% 变成 5%，收益就是 400%
4. **做市**：也可 1¢ 买入、1.5-2¢ 卖出，赚极低流动性市场价差

### 评分系统 (0-100分)

- **价格** (30分): 越低越好，1¢ 满分
- **赔率** (30分): 隐含赔率 ≥100x 满分
- **到期时间** (20分): ≥180 天满分
- **流动性** (10分): $100-$1000 最佳
- **成交量** (10分): ≥$1000 满分

### 关键参数

```typescript
{
  maxBuyPrice: 3,           // 最大 3 美分买入
  maxInvestPerMarket: 5,    // 每个市场最多 $5
  totalBudget: 100,         // 总预算 $100
  minDaysToExpiry: 30,      // 至少 30 天到期
  minImpliedOdds: 10,       // 最小 10 倍赔率
}
```

### 风险等级
- **风险**: 高
- **收益潜力**: 极高
- **复杂度**: 简单（推荐散户尝试）

---

## 4. 做市商策略 (Market Making)

**动态对冲，赚取流动性价差**

### 操作逻辑

1. 在活跃市场的双方（是/否）同时挂单
2. 不赌方向，只赚流动性：买单挂 49¢，卖单挂 51¢
3. 只要有人买卖，就赚中间的 2¢ 差价
4. **风控**：单边库存过多时：
   - 调整报价偏斜
   - 使用 Merge 功能赎回 USDC

### 关键参数

```typescript
{
  spreadPercent: 2,            // 2% 价差
  maxPositionPerSide: 100,     // 单边最大 $100
  totalCapital: 500,           // 总资金 $500
  inventorySkewThreshold: 0.3, // 30% 偏斜触发对冲
  refreshInterval: 5000,       // 5秒刷新报价
}
```

### 库存偏斜管理

```
偏斜 = |YES持仓 - NO持仓| / (YES持仓 + NO持仓)

当偏斜 > 30% 时:
- YES 过多 → 降低买价、提高卖价
- NO 过多 → 提高买价、降低卖价
```

### 风险等级
- **风险**: 中
- **收益潜力**: 中
- **复杂度**: 中等

---

## API 接口

### 策略管理

```bash
# 获取所有策略状态
GET /api/strategies

# 启动策略
POST /api/strategies
{
  "action": "start",
  "strategyType": "MINT_SPLIT" | "INVENTORY" | "LONGSHOT" | "MARKET_MAKING",
  "settings": { ... }  // 可选
}

# 停止策略
POST /api/strategies
{
  "action": "stop",
  "strategyType": "MINT_SPLIT"
}
```

### 策略设置

```bash
# 获取设置
GET /api/strategies/settings?type=MINT_SPLIT

# 更新设置
PUT /api/strategies/settings
{
  "strategyType": "MINT_SPLIT",
  "settings": {
    "minPriceSum": 1.01,
    "minProfit": 0.02
  }
}
```

### 策略机会

```bash
# 获取所有机会
GET /api/strategies/opportunities

# 获取特定策略机会
GET /api/strategies/opportunities?type=LONGSHOT
```

### 策略日志

```bash
# 获取所有日志
GET /api/strategies/logs

# 获取特定策略日志
GET /api/strategies/logs?type=MINT_SPLIT&limit=50
```

---

## 复刻建议

| 策略 | 难度 | 推荐指数 | 说明 |
|------|------|---------|------|
| 铸造拆分 | ⭐⭐⭐⭐⭐ | ★☆☆☆☆ | 需要毫秒级 API，竞争激烈 |
| 库存管理 | ⭐ | ★★☆☆☆ | 只是打扫卫生 |
| 彩票长尾 | ⭐⭐ | ★★★★★ | **强烈推荐**，散户最佳机会 |
| 做市商 | ⭐⭐⭐ | ★★★☆☆ | 需要资金和风控能力 |

---

## 一句话总结

> 他是一个在链上搬砖的批发商，顺便买了点彩票。
> 如果你看到他在卖某个几乎不可能获胜的选项，别多想，那只是他在倒垃圾。
