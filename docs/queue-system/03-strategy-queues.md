# 策略队列系统设计

> 本文档包含 PRD 第六章：策略队列系统设计 ⭐核心  
> **本章节是整个队列系统的重中之重**，详细描述三个策略队列和交易执行队列的设计。

---

## 六、策略队列系统设计 ⭐核心

### 6.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         策略分发器 (StrategyDispatcher)                      │
│                      根据市场数据特征分发到对应策略队列                          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ 分发规则
                    │
        ┌───────────┼───────────┬───────────────┐
        ▼           ▼           ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
│ Mint-Split   │ │ Arbitrage    │ │Market-Making │ │ 同一市场可被多个策略  │
│ 策略队列      │ │ 策略队列      │ │ 策略队列      │ │ 同时处理             │
│              │ │              │ │              │ └──────────────────────┘
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │
│ │ 机会检测  │ │ │ │ 机会检测  │ │ │ │ 机会检测  │ │
│ └────┬─────┘ │ │ └────┬─────┘ │ │ └────┬─────┘ │
│      │ 发现  │ │      │ 发现  │ │      │ 发现  │
│      ▼       │ │      ▼       │ │      ▼       │
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │
│ │ 生成订单  │ │ │ │ 生成订单  │ │ │ │ 生成订单  │ │
│ └────┬─────┘ │ │ └────┬─────┘ │ │ └────┬─────┘ │
└──────┼───────┘ └──────┼───────┘ └──────┼───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       交易执行队列 (OrderQueue)                              │
│                    统一处理所有策略产生的交易订单                               │
│                                                                             │
│   ┌─ 订单优先级 ────────────────────────────────────────────────────────┐   │
│   │ P0: 时效性订单 (即将过期的机会)                                       │   │
│   │ P1: 高利润订单 (预期利润 > $1)                                       │   │
│   │ P2: 普通订单                                                        │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOB API 下单                                       │
│                   执行结果记录到 MySQL (opportunities + trade_records)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.2 策略分发器 (StrategyDispatcher)

#### 6.2.1 职责

- 接收扫描队列传来的市场数据
- 根据策略启用状态和市场特征进行分发
- 支持同一市场被多个策略处理
- 记录分发统计信息

#### 6.2.2 分发规则

| 策略 | 分发条件 | 说明 |
|------|----------|------|
| **Mint-Split** | `outcomes >= 3 && enableOrderBook` | 多结果市场，有订单簿 |
| **Arbitrage** | `outcomes >= 2 && enableOrderBook` | 二元或多结果市场 |
| **Market-Making** | `liquidity >= minLiquidity && volume24hr >= minVolume` | 流动性充足的活跃市场 |

#### 6.2.3 接口定义

```typescript
// src/lib/queue/strategy-dispatcher.ts

interface StrategyDispatcher {
  // 分发市场数据到策略队列
  dispatch(markets: MarketData[]): void
  
  // 获取分发统计
  getStats(): DispatchStats
  
  // 启用/禁用策略
  enableStrategy(strategy: StrategyType): void
  disableStrategy(strategy: StrategyType): void
  
  // 获取策略启用状态
  getEnabledStrategies(): StrategyType[]
}

interface DispatchStats {
  totalDispatched: number
  byStrategy: {
    MINT_SPLIT: number
    ARBITRAGE: number
    MARKET_MAKING: number
  }
  lastDispatchAt: Date | null
}

type StrategyType = 'MINT_SPLIT' | 'ARBITRAGE' | 'MARKET_MAKING'
```

#### 6.2.4 实现代码框架

```typescript
import PQueue from 'p-queue'
import { mintSplitQueue } from './mint-split-queue'
import { arbitrageQueue } from './arbitrage-queue'
import { marketMakingQueue } from './market-making-queue'

class StrategyDispatcherImpl implements StrategyDispatcher {
  private enabledStrategies: Set<StrategyType> = new Set(['MINT_SPLIT', 'ARBITRAGE'])
  private stats: DispatchStats = {
    totalDispatched: 0,
    byStrategy: { MINT_SPLIT: 0, ARBITRAGE: 0, MARKET_MAKING: 0 },
    lastDispatchAt: null
  }

  dispatch(markets: MarketData[]): void {
    for (const market of markets) {
      // Mint-Split: 多结果市场
      if (this.enabledStrategies.has('MINT_SPLIT') && this.isMintSplitCandidate(market)) {
        mintSplitQueue.add(() => this.processMintSplit(market))
        this.stats.byStrategy.MINT_SPLIT++
      }
      
      // Arbitrage: 所有有订单簿的市场
      if (this.enabledStrategies.has('ARBITRAGE') && this.isArbitrageCandidate(market)) {
        arbitrageQueue.add(() => this.processArbitrage(market))
        this.stats.byStrategy.ARBITRAGE++
      }
      
      // Market-Making: 流动性充足的市场
      if (this.enabledStrategies.has('MARKET_MAKING') && this.isMarketMakingCandidate(market)) {
        marketMakingQueue.add(() => this.processMarketMaking(market))
        this.stats.byStrategy.MARKET_MAKING++
      }
      
      this.stats.totalDispatched++
    }
    this.stats.lastDispatchAt = new Date()
  }

  private isMintSplitCandidate(market: MarketData): boolean {
    return market.outcomes.length >= 3 && market.enableOrderBook
  }

  private isArbitrageCandidate(market: MarketData): boolean {
    return market.outcomes.length >= 2 && market.enableOrderBook
  }

  private isMarketMakingCandidate(market: MarketData): boolean {
    const config = getMarketMakingConfig()
    return market.liquidity >= config.minLiquidity && 
           market.volume24hr >= config.minVolume24hr
  }
}
```

---

### 6.3 Mint-Split 策略队列 ⭐

> **核心现金牛策略** - 当多结果市场所有结果卖价之和 > $1 时，铸造完整代币并分别卖出

#### 6.3.1 策略原理

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Mint-Split 策略原理                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  场景: 温度预测市场 (4个结果区间)                                              │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  结果A: <60°F     卖一价: $0.28                                       │  │
│  │  结果B: 60-70°F   卖一价: $0.35                                       │  │
│  │  结果C: 70-80°F   卖一价: $0.30                                       │  │
│  │  结果D: >80°F     卖一价: $0.15                                       │  │
│  │  ─────────────────────────────                                       │  │
│  │  价格总和: $1.08 > $1.00 ✅                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  操作流程:                                                                   │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐     │
│  │ 1. 支付 $1 │ →  │ 2. 铸造    │ →  │ 3. 分别    │ →  │ 4. 获得    │     │
│  │    到合约   │    │ 完整代币   │    │ 卖出4个   │    │ $1.08     │     │
│  └────────────┘    └────────────┘    └────────────┘    └────────────┘     │
│                                                                             │
│  利润计算: $1.08 - $1.00 = $0.08 (8% 收益)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 6.3.2 队列配置

```typescript
interface MintSplitQueueConfig {
  // 队列配置
  concurrency: 1              // 串行执行，避免同时铸造
  maxSize: 100                // 最大待处理数
  timeout: 30000              // 30秒超时
  
  // 策略参数 (可在页面配置)
  minPriceSum: 1.005          // 最小价格和 (0.5% 利润阈值)
  minProfit: 0.01             // 最小利润 $0.01
  maxMintAmount: 100          // 单次最大铸造金额
  defaultMintAmount: 10       // 默认铸造金额
  minOutcomes: 3              // 最少结果数
  maxSlippage: 0.02           // 最大滑点 2%
  
  // 安全配置
  cooldownMs: 5000            // 同市场冷却时间
  maxDailyTrades: 100         // 每日最大交易次数
  maxDailyLoss: 50            // 每日最大亏损 $50
}
```

#### 6.3.3 机会检测流程

```typescript
interface MintSplitOpportunity {
  conditionId: string
  question: string
  outcomes: {
    tokenId: string
    name: string
    bestAsk: number           // 卖一价
    askSize: number           // 卖一量
  }[]
  priceSum: number            // 价格总和
  expectedProfit: number      // 预期利润
  maxMintable: number         // 最大可铸造数量 (受限于最小卖一量)
  timestamp: Date
}

async function detectMintSplitOpportunity(market: MarketData): Promise<MintSplitOpportunity | null> {
  const config = getMintSplitConfig()
  
  // 1. 检查结果数量
  if (market.outcomes.length < config.minOutcomes) {
    return null
  }
  
  // 2. 获取每个结果的卖一价
  const outcomes = await Promise.all(
    market.outcomes.map(async (outcome) => {
      const orderbook = await getClobOrderbook(outcome.tokenId)
      return {
        tokenId: outcome.tokenId,
        name: outcome.name,
        bestAsk: orderbook.asks[0]?.price || 0,
        askSize: orderbook.asks[0]?.size || 0,
      }
    })
  )
  
  // 3. 检查是否所有结果都有卖单
  if (outcomes.some(o => o.bestAsk === 0)) {
    return null
  }
  
  // 4. 计算价格总和
  const priceSum = outcomes.reduce((sum, o) => sum + o.bestAsk, 0)
  
  // 5. 检查是否满足利润阈值
  if (priceSum < config.minPriceSum) {
    return null
  }
  
  // 6. 计算预期利润
  const expectedProfit = priceSum - 1
  if (expectedProfit < config.minProfit) {
    return null
  }
  
  // 7. 计算最大可铸造数量 (受限于最小卖一量)
  const maxMintable = Math.min(
    ...outcomes.map(o => o.askSize),
    config.maxMintAmount
  )
  
  return {
    conditionId: market.conditionId,
    question: market.question,
    outcomes,
    priceSum,
    expectedProfit,
    maxMintable,
    timestamp: new Date(),
  }
}
```

#### 6.3.4 订单生成

```typescript
interface MintSplitOrder {
  type: 'MINT_SPLIT'
  conditionId: string
  mintAmount: number          // 铸造数量
  sellOrders: {
    tokenId: string
    side: 'SELL'
    price: number             // 卖价 (比卖一价低一点确保成交)
    size: number              // 数量
  }[]
  expectedProfit: number
  maxSlippage: number
}

function generateMintSplitOrder(opportunity: MintSplitOpportunity): MintSplitOrder {
  const config = getMintSplitConfig()
  const mintAmount = Math.min(opportunity.maxMintable, config.defaultMintAmount)
  
  return {
    type: 'MINT_SPLIT',
    conditionId: opportunity.conditionId,
    mintAmount,
    sellOrders: opportunity.outcomes.map(o => ({
      tokenId: o.tokenId,
      side: 'SELL' as const,
      price: o.bestAsk * (1 - config.maxSlippage / 2), // 略低于卖一价
      size: mintAmount,
    })),
    expectedProfit: opportunity.expectedProfit * mintAmount,
    maxSlippage: config.maxSlippage,
  }
}
```

#### 6.3.5 执行流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Mint-Split 执行流程                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: 检查余额                                                            │
│         USDC >= mintAmount ?                                                │
│         失败 → 记录错误，跳过                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ 通过
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 2: 重新验证机会                                                         │
│         再次获取订单簿，确认价格和仍 > 阈值                                     │
│         失败 → 标记为 EXPIRED                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ 有效
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 3: 调用合约铸造                                                         │
│         ConditionalTokens.splitPosition(conditionId, amount)                │
│         失败 → 标记为 FAILED，记录错误                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ 成功
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 4: 批量挂卖单                                                           │
│         for each outcome:                                                   │
│           CLOB.createOrder(tokenId, SELL, price, size)                     │
│         部分失败 → 继续其他订单，记录失败的                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │ 完成
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 5: 记录结果                                                            │
│         - 更新 opportunity 状态为 SUCCESS/PARTIAL                           │
│         - 写入 trade_records                                                │
│         - 更新每日统计                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.4 Arbitrage 策略队列 ⭐

> **双边套利策略** - 当二元市场 Yes + No 价格偏离 $1 时进行套利

#### 6.4.1 策略原理

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Arbitrage 策略原理                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ 做多套利 (LONG) ──────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  条件: Yes 买价 + No 买价 < $1                                          │ │
│  │                                                                        │ │
│  │  例: Yes 买价 = $0.45, No 买价 = $0.50, 总和 = $0.95                    │ │
│  │                                                                        │ │
│  │  操作: 同时买入 Yes 和 No                                               │ │
│  │  结果: 无论哪个结果胜出，都能获得 $1                                      │ │
│  │  利润: $1 - $0.95 = $0.05 (5.26% 收益)                                 │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 做空套利 (SHORT) ─────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  条件: Yes 卖价 + No 卖价 > $1                                          │ │
│  │                                                                        │ │
│  │  例: Yes 卖价 = $0.55, No 卖价 = $0.52, 总和 = $1.07                    │ │
│  │                                                                        │ │
│  │  操作: 同时卖出 Yes 和 No (需要先持有或铸造)                              │ │
│  │  结果: 获得 $1.07，支付 $1 赎回                                          │ │
│  │  利润: $1.07 - $1 = $0.07 (7% 收益)                                    │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 6.4.2 队列配置

```typescript
interface ArbitrageQueueConfig {
  // 队列配置
  concurrency: 1              // 串行执行
  maxSize: 100                // 最大待处理数
  timeout: 30000              // 30秒超时
  
  // LONG 策略参数
  long: {
    enabled: true
    minSpread: 0.01           // 最小价差 1%
    minProfit: 0.02           // 最小利润 $0.02
    maxTradeAmount: 50        // 单次最大交易金额
    defaultTradeAmount: 10    // 默认交易金额
  }
  
  // SHORT 策略参数
  short: {
    enabled: true
    minSpread: 0.01           // 最小价差 1%
    minProfit: 0.02           // 最小利润 $0.02
    maxTradeAmount: 50        // 单次最大交易金额
    defaultTradeAmount: 10    // 默认交易金额
    requirePosition: false    // 是否要求已有持仓 (false = 可铸造后卖出)
  }
  
  // 安全配置
  cooldownMs: 3000            // 同市场冷却时间
  maxDailyTrades: 200         // 每日最大交易次数
  maxDailyLoss: 100           // 每日最大亏损
}
```

#### 6.4.3 机会检测

```typescript
interface ArbitrageOpportunity {
  conditionId: string
  question: string
  type: 'LONG' | 'SHORT'
  tokens: {
    yes: { tokenId: string; price: number; size: number }
    no: { tokenId: string; price: number; size: number }
  }
  priceSum: number
  spread: number              // 价差百分比
  expectedProfit: number
  maxTradeSize: number
  timestamp: Date
}

async function detectArbitrageOpportunity(market: MarketData): Promise<ArbitrageOpportunity | null> {
  const config = getArbitrageConfig()
  
  // 只处理二元市场
  if (market.outcomes.length !== 2) {
    return null
  }
  
  // 获取订单簿
  const [yesBook, noBook] = await Promise.all([
    getClobOrderbook(market.outcomes[0].tokenId),
    getClobOrderbook(market.outcomes[1].tokenId),
  ])
  
  // 检查 LONG 机会 (买价和 < 1)
  if (config.long.enabled) {
    const yesBid = yesBook.bids[0]
    const noBid = noBook.bids[0]
    
    if (yesBid && noBid) {
      const priceSum = yesBid.price + noBid.price
      const spread = 1 - priceSum
      
      if (spread >= config.long.minSpread) {
        const maxTradeSize = Math.min(yesBid.size, noBid.size, config.long.maxTradeAmount)
        const expectedProfit = spread * maxTradeSize
        
        if (expectedProfit >= config.long.minProfit) {
          return {
            conditionId: market.conditionId,
            question: market.question,
            type: 'LONG',
            tokens: {
              yes: { tokenId: market.outcomes[0].tokenId, price: yesBid.price, size: yesBid.size },
              no: { tokenId: market.outcomes[1].tokenId, price: noBid.price, size: noBid.size },
            },
            priceSum,
            spread,
            expectedProfit,
            maxTradeSize,
            timestamp: new Date(),
          }
        }
      }
    }
  }
  
  // 检查 SHORT 机会 (卖价和 > 1)
  if (config.short.enabled) {
    const yesAsk = yesBook.asks[0]
    const noAsk = noBook.asks[0]
    
    if (yesAsk && noAsk) {
      const priceSum = yesAsk.price + noAsk.price
      const spread = priceSum - 1
      
      if (spread >= config.short.minSpread) {
        const maxTradeSize = Math.min(yesAsk.size, noAsk.size, config.short.maxTradeAmount)
        const expectedProfit = spread * maxTradeSize
        
        if (expectedProfit >= config.short.minProfit) {
          return {
            conditionId: market.conditionId,
            question: market.question,
            type: 'SHORT',
            tokens: {
              yes: { tokenId: market.outcomes[0].tokenId, price: yesAsk.price, size: yesAsk.size },
              no: { tokenId: market.outcomes[1].tokenId, price: noAsk.price, size: noAsk.size },
            },
            priceSum,
            spread,
            expectedProfit,
            maxTradeSize,
            timestamp: new Date(),
          }
        }
      }
    }
  }
  
  return null
}
```

#### 6.4.4 订单生成

```typescript
interface ArbitrageOrder {
  type: 'ARBITRAGE'
  subType: 'LONG' | 'SHORT'
  conditionId: string
  orders: {
    tokenId: string
    side: 'BUY' | 'SELL'
    price: number
    size: number
  }[]
  expectedProfit: number
  requireMint: boolean        // SHORT 时是否需要先铸造
}

function generateArbitrageOrder(opportunity: ArbitrageOpportunity): ArbitrageOrder {
  const config = getArbitrageConfig()
  const tradeSize = Math.min(
    opportunity.maxTradeSize,
    opportunity.type === 'LONG' ? config.long.defaultTradeAmount : config.short.defaultTradeAmount
  )
  
  if (opportunity.type === 'LONG') {
    // 做多：买入 Yes + 买入 No
    return {
      type: 'ARBITRAGE',
      subType: 'LONG',
      conditionId: opportunity.conditionId,
      orders: [
        { tokenId: opportunity.tokens.yes.tokenId, side: 'BUY', price: opportunity.tokens.yes.price, size: tradeSize },
        { tokenId: opportunity.tokens.no.tokenId, side: 'BUY', price: opportunity.tokens.no.price, size: tradeSize },
      ],
      expectedProfit: opportunity.spread * tradeSize,
      requireMint: false,
    }
  } else {
    // 做空：卖出 Yes + 卖出 No (可能需要先铸造)
    return {
      type: 'ARBITRAGE',
      subType: 'SHORT',
      conditionId: opportunity.conditionId,
      orders: [
        { tokenId: opportunity.tokens.yes.tokenId, side: 'SELL', price: opportunity.tokens.yes.price, size: tradeSize },
        { tokenId: opportunity.tokens.no.tokenId, side: 'SELL', price: opportunity.tokens.no.price, size: tradeSize },
      ],
      expectedProfit: opportunity.spread * tradeSize,
      requireMint: !config.short.requirePosition, // 如果不要求持仓，则需要铸造
    }
  }
}
```

---

### 6.5 Market-Making 策略队列 ⭐

> **做市商策略** - 在活跃市场双边挂单赚取价差

#### 6.5.1 策略原理

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Market-Making 策略原理                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  目标: 不预测结果，只赚取买卖价差 (Spread)                                     │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  当前市场: Yes 买价 = $0.48, Yes 卖价 = $0.52                           │ │
│  │                                                                        │ │
│  │  做市策略:                                                              │ │
│  │  - 挂买单 @ $0.49 (比当前买价高一点，排队靠前)                            │ │
│  │  - 挂卖单 @ $0.51 (比当前卖价低一点，排队靠前)                            │ │
│  │                                                                        │ │
│  │  理想情况:                                                              │ │
│  │  - 买单成交: 以 $0.49 买入                                              │ │
│  │  - 卖单成交: 以 $0.51 卖出                                              │ │
│  │  - 利润: $0.51 - $0.49 = $0.02 (2%)                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  风险控制:                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  库存偏斜 (Inventory Skew):                                            │ │
│  │  - 如果持有过多 Yes，降低买价/提高卖价，促进卖出                           │ │
│  │  - 如果持有过多 No，反向调整                                             │ │
│  │                                                                        │ │
│  │  Merge 赎回:                                                            │ │
│  │  - 当同时持有 Yes 和 No 时，可以赎回为 USDC                              │ │
│  │  - 避免单边风险暴露                                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 6.5.2 队列配置

```typescript
interface MarketMakingQueueConfig {
  // 队列配置
  concurrency: 1              // 串行执行
  maxSize: 100                // 最大待处理市场数
  timeout: 30000              // 30秒超时
  
  // 做市参数
  spreadPercent: 2            // 目标价差 2%
  orderSize: 10               // 每单大小 $10
  maxPositionPerSide: 100     // 单边最大持仓 $100
  totalCapital: 500           // 总做市资金 $500
  
  // 库存管理
  inventorySkewThreshold: 0.3 // 库存偏斜阈值 30%
  skewAdjustment: 0.01        // 偏斜调整幅度 1%
  enableMerge: true           // 启用自动 Merge
  mergeThreshold: 50          // Merge 触发阈值 $50
  
  // 订单管理
  refreshInterval: 10000      // 订单刷新间隔 10秒
  cancelStaleOrders: true     // 取消过期订单
  staleThreshold: 60000       // 订单过期时间 60秒
  
  // 市场筛选
  minLiquidity: 1000          // 最小流动性
  minVolume24hr: 500          // 最小24h交易量
  maxMarkets: 10              // 最大同时做市市场数
  
  // 安全配置
  maxDailyLoss: 50            // 每日最大亏损
  stopLossPercent: 10         // 止损百分比
}
```

#### 6.5.3 做市状态管理

```typescript
interface MarketMakingState {
  conditionId: string
  
  // 订单状态
  activeOrders: {
    yesBuy?: { orderId: string; price: number; size: number }
    yesSell?: { orderId: string; price: number; size: number }
    noBuy?: { orderId: string; price: number; size: number }
    noSell?: { orderId: string; price: number; size: number }
  }
  
  // 持仓状态
  positions: {
    yes: number
    no: number
  }
  
  // 库存偏斜
  inventorySkew: number       // -1 到 1, 负数表示持有更多 No
  
  // 统计
  stats: {
    totalTrades: number
    totalProfit: number
    startTime: Date
  }
  
  // 状态
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED'
  lastUpdate: Date
}

// 全局做市状态 (按市场存储)
const marketMakingStates = new Map<string, MarketMakingState>()
```

#### 6.5.4 订单生成逻辑

```typescript
interface MarketMakingOrder {
  type: 'MARKET_MAKING'
  conditionId: string
  action: 'PLACE' | 'CANCEL' | 'UPDATE'
  orders: {
    tokenId: string
    side: 'BUY' | 'SELL'
    price: number
    size: number
    orderId?: string          // 取消/更新时需要
  }[]
}

function generateMarketMakingOrders(market: MarketData, state: MarketMakingState): MarketMakingOrder[] {
  const config = getMarketMakingConfig()
  const orders: MarketMakingOrder[] = []
  
  // 获取当前市场价格
  const midPrice = (market.bestBid + market.bestAsk) / 2
  const halfSpread = config.spreadPercent / 100 / 2
  
  // 计算库存偏斜调整
  const skewAdj = state.inventorySkew * config.skewAdjustment
  
  // 计算挂单价格
  const buyPrice = midPrice * (1 - halfSpread) * (1 - skewAdj)
  const sellPrice = midPrice * (1 + halfSpread) * (1 - skewAdj)
  
  // 检查是否需要更新订单
  const needUpdate = !state.activeOrders.yesBuy ||
    Math.abs(state.activeOrders.yesBuy.price - buyPrice) > 0.001
  
  if (needUpdate) {
    // 取消旧订单
    if (state.activeOrders.yesBuy) {
      orders.push({
        type: 'MARKET_MAKING',
        conditionId: market.conditionId,
        action: 'CANCEL',
        orders: [{ ...state.activeOrders.yesBuy, tokenId: market.outcomes[0].tokenId, side: 'BUY' }],
      })
    }
    
    // 挂新订单 (检查持仓限制)
    if (state.positions.yes < config.maxPositionPerSide) {
      orders.push({
        type: 'MARKET_MAKING',
        conditionId: market.conditionId,
        action: 'PLACE',
        orders: [
          { tokenId: market.outcomes[0].tokenId, side: 'BUY', price: buyPrice, size: config.orderSize },
          { tokenId: market.outcomes[0].tokenId, side: 'SELL', price: sellPrice, size: config.orderSize },
        ],
      })
    }
  }
  
  // 检查是否需要 Merge
  if (config.enableMerge) {
    const mergeAmount = Math.min(state.positions.yes, state.positions.no)
    if (mergeAmount >= config.mergeThreshold) {
      orders.push({
        type: 'MARKET_MAKING',
        conditionId: market.conditionId,
        action: 'MERGE',
        orders: [],
        mergeAmount,
      } as MarketMakingOrder & { mergeAmount: number })
    }
  }
  
  return orders
}
```

---

### 6.6 交易执行队列 (OrderQueue)

> **统一处理所有策略产生的订单**，确保执行顺序和错误处理

#### 6.6.1 队列配置

```typescript
interface OrderQueueConfig {
  // 队列配置
  concurrency: 1              // 串行执行，避免 nonce 冲突
  maxSize: 50                 // 最大待执行订单数
  timeout: 60000              // 60秒超时
  
  // 优先级配置
  priorities: {
    URGENT: 0                 // 紧急 (即将过期)
    HIGH: 1                   // 高优先级 (高利润)
    NORMAL: 2                 // 普通
    LOW: 3                    // 低优先级
  }
  
  // 重试配置
  maxRetries: 0               // 不自动重试 (避免重复下单)
  
  // 执行配置
  confirmationTimeout: 30000  // 确认超时
  gasLimitMultiplier: 1.2     // Gas 限制倍数
}
```

#### 6.6.2 订单优先级

```typescript
interface QueuedOrder {
  id: string                  // 唯一ID
  priority: number            // 优先级 (0最高)
  order: MintSplitOrder | ArbitrageOrder | MarketMakingOrder
  opportunity: {
    id: number                // DB中的 opportunity ID
    expectedProfit: number
    expiresAt?: Date
  }
  createdAt: Date
  attempts: number
}

function calculatePriority(order: QueuedOrder): number {
  const config = getOrderQueueConfig()
  
  // 即将过期的订单最高优先级
  if (order.opportunity.expiresAt) {
    const timeToExpire = order.opportunity.expiresAt.getTime() - Date.now()
    if (timeToExpire < 10000) {
      return config.priorities.URGENT
    }
  }
  
  // 高利润订单
  if (order.opportunity.expectedProfit > 1) {
    return config.priorities.HIGH
  }
  
  return config.priorities.NORMAL
}
```

#### 6.6.3 执行流程

```typescript
class OrderQueueImpl {
  private queue: PQueue
  private pendingOrders: Map<string, QueuedOrder> = new Map()
  
  constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      timeout: 60000,
    })
  }
  
  async add(order: QueuedOrder): Promise<void> {
    // 按优先级排序插入
    this.pendingOrders.set(order.id, order)
    
    this.queue.add(async () => {
      try {
        // 1. 更新 opportunity 状态为 EXECUTING
        await updateOpportunityStatus(order.opportunity.id, 'EXECUTING')
        
        // 2. 执行订单
        const result = await this.executeOrder(order)
        
        // 3. 记录结果
        await this.recordResult(order, result)
        
      } catch (error) {
        // 4. 记录失败
        await this.handleError(order, error)
      } finally {
        this.pendingOrders.delete(order.id)
      }
    }, { priority: order.priority })
  }
  
  private async executeOrder(order: QueuedOrder): Promise<ExecutionResult> {
    switch (order.order.type) {
      case 'MINT_SPLIT':
        return this.executeMintSplit(order.order as MintSplitOrder)
      case 'ARBITRAGE':
        return this.executeArbitrage(order.order as ArbitrageOrder)
      case 'MARKET_MAKING':
        return this.executeMarketMaking(order.order as MarketMakingOrder)
      default:
        throw new Error(`未知订单类型: ${order.order.type}`)
    }
  }
  
  private async executeMintSplit(order: MintSplitOrder): Promise<ExecutionResult> {
    // 1. 铸造代币
    const mintTx = await polymarketContracts.mint(order.conditionId, order.mintAmount)
    
    // 2. 批量挂卖单
    const sellResults = await Promise.allSettled(
      order.sellOrders.map(sell => 
        clobClient.createOrder({
          tokenId: sell.tokenId,
          side: 'SELL',
          price: sell.price,
          size: sell.size,
        })
      )
    )
    
    // 3. 统计结果
    const successCount = sellResults.filter(r => r.status === 'fulfilled').length
    const totalCount = sellResults.length
    
    return {
      success: successCount === totalCount,
      partial: successCount > 0 && successCount < totalCount,
      mintTxHash: mintTx.hash,
      sellOrders: sellResults.map((r, i) => ({
        tokenId: order.sellOrders[i].tokenId,
        success: r.status === 'fulfilled',
        orderId: r.status === 'fulfilled' ? r.value.orderId : undefined,
        error: r.status === 'rejected' ? r.reason.message : undefined,
      })),
    }
  }
  
  private async executeArbitrage(order: ArbitrageOrder): Promise<ExecutionResult> {
    // SHORT 类型可能需要先铸造
    if (order.subType === 'SHORT' && order.requireMint) {
      await polymarketContracts.mint(order.conditionId, order.orders[0].size)
    }
    
    // 批量下单 (买入或卖出)
    const results = await Promise.allSettled(
      order.orders.map(o => 
        clobClient.createOrder({
          tokenId: o.tokenId,
          side: o.side,
          price: o.price,
          size: o.size,
        })
      )
    )
    
    return {
      success: results.every(r => r.status === 'fulfilled'),
      partial: results.some(r => r.status === 'fulfilled') && 
               results.some(r => r.status === 'rejected'),
      orders: results.map((r, i) => ({
        tokenId: order.orders[i].tokenId,
        side: order.orders[i].side,
        success: r.status === 'fulfilled',
        orderId: r.status === 'fulfilled' ? r.value.orderId : undefined,
        error: r.status === 'rejected' ? r.reason.message : undefined,
      })),
    }
  }
  
  private async executeMarketMaking(order: MarketMakingOrder): Promise<ExecutionResult> {
    switch (order.action) {
      case 'PLACE':
        // 挂单
        const placeResults = await Promise.allSettled(
          order.orders.map(o => clobClient.createOrder(o))
        )
        return { success: placeResults.every(r => r.status === 'fulfilled'), orders: placeResults }
        
      case 'CANCEL':
        // 取消订单
        const cancelResults = await Promise.allSettled(
          order.orders.map(o => clobClient.cancelOrder(o.orderId!))
        )
        return { success: cancelResults.every(r => r.status === 'fulfilled'), orders: cancelResults }
        
      case 'MERGE':
        // Merge 赎回
        const mergeTx = await polymarketContracts.merge(order.conditionId, order.mergeAmount)
        return { success: true, mergeTxHash: mergeTx.hash }
        
      default:
        throw new Error(`未知做市操作: ${order.action}`)
    }
  }
  
  private async recordResult(order: QueuedOrder, result: ExecutionResult): Promise<void> {
    // 更新 opportunity 状态
    const status = result.success ? 'SUCCESS' : (result.partial ? 'PARTIAL' : 'FAILED')
    await updateOpportunityStatus(order.opportunity.id, status, {
      executedAt: new Date(),
      result: JSON.stringify(result),
    })
    
    // 写入交易记录
    await insertTradeRecord({
      opportunityId: order.opportunity.id,
      strategyType: order.order.type,
      ...result,
    })
    
    console.log(`✅ 订单执行完成: ${order.order.type}, 状态: ${status}`)
  }
  
  private async handleError(order: QueuedOrder, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    
    await updateOpportunityStatus(order.opportunity.id, 'FAILED', {
      errorMessage: message,
      executedAt: new Date(),
    })
    
    console.error(`❌ 订单执行失败: ${order.order.type}, 错误: ${message}`)
  }
}
```

---

### 6.7 策略配置管理

所有策略的配置都可以通过页面进行修改，存储在内存 + 数据库中。

#### 6.7.1 配置存储

```typescript
// src/lib/queue/strategy-config.ts

interface StrategyConfigManager {
  // 获取配置
  getMintSplitConfig(): MintSplitQueueConfig
  getArbitrageConfig(): ArbitrageQueueConfig
  getMarketMakingConfig(): MarketMakingQueueConfig
  
  // 更新配置
  updateMintSplitConfig(partial: Partial<MintSplitQueueConfig>): void
  updateArbitrageConfig(partial: Partial<ArbitrageQueueConfig>): void
  updateMarketMakingConfig(partial: Partial<MarketMakingQueueConfig>): void
  
  // 持久化
  saveToDatabase(): Promise<void>
  loadFromDatabase(): Promise<void>
}
```

#### 6.7.2 配置页面 UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  策略配置                                                      [保存所有]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ Mint-Split 策略 ──────────────────────────────────────────────────────┐ │
│  │ [✓] 启用                                                    [保存]     │ │
│  │                                                                        │ │
│  │ 利润阈值:                                                              │ │
│  │   最小价格和: [1.005  ] (>1 才有利润)                                   │ │
│  │   最小利润:   [$0.01  ]                                                │ │
│  │                                                                        │ │
│  │ 交易限制:                                                              │ │
│  │   默认铸造量: [$10    ]  最大铸造量: [$100   ]                          │ │
│  │   最大滑点:   [2%     ]                                                │ │
│  │                                                                        │ │
│  │ 安全设置:                                                              │ │
│  │   冷却时间:   [5s     ]  每日最大交易: [100    ]  每日止损: [$50   ]    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Arbitrage 策略 ───────────────────────────────────────────────────────┐ │
│  │ LONG: [✓] 启用   SHORT: [✓] 启用                            [保存]     │ │
│  │                                                                        │ │
│  │ LONG 参数:                         SHORT 参数:                         │ │
│  │   最小价差: [1%    ]                 最小价差: [1%    ]                 │ │
│  │   最小利润: [$0.02 ]                 最小利润: [$0.02 ]                 │ │
│  │   默认金额: [$10   ]                 默认金额: [$10   ]                 │ │
│  │                                     [✓] 无持仓时铸造                   │ │
│  │                                                                        │ │
│  │ 安全设置:                                                              │ │
│  │   冷却时间: [3s    ]  每日最大交易: [200   ]  每日止损: [$100  ]        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Market-Making 策略 ───────────────────────────────────────────────────┐ │
│  │ [✓] 启用                                                    [保存]     │ │
│  │                                                                        │ │
│  │ 做市参数:                                                              │ │
│  │   目标价差:   [2%     ]  每单大小: [$10    ]                            │ │
│  │   单边最大:   [$100   ]  总资金:   [$500   ]                            │ │
│  │                                                                        │ │
│  │ 库存管理:                                                              │ │
│  │   偏斜阈值:   [30%    ]  调整幅度: [1%     ]                            │ │
│  │   [✓] 自动Merge   Merge阈值: [$50    ]                                 │ │
│  │                                                                        │ │
│  │ 市场筛选:                                                              │ │
│  │   最小流动性: [$1000  ]  最小24h量: [$500   ]  最大市场数: [10    ]     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.8 策略队列状态监控

#### 6.8.1 状态数据结构

```typescript
interface StrategyQueueStatus {
  name: string
  enabled: boolean
  queue: {
    size: number
    pending: number
    maxSize: number
  }
  stats: {
    processedToday: number
    opportunitiesFound: number
    ordersExecuted: number
    successRate: number
    totalProfit: number
    totalLoss: number
  }
  lastActivity: Date | null
  errors: {
    count: number
    lastError: string | null
    lastErrorAt: Date | null
  }
}

interface AllStrategyStatus {
  mintSplit: StrategyQueueStatus
  arbitrage: StrategyQueueStatus
  marketMaking: StrategyQueueStatus
  orderQueue: {
    size: number
    pending: number
    maxSize: number
    processing: boolean
  }
}
```

#### 6.8.2 监控 API

```
GET /api/strategies/status

Response:
{
  "success": true,
  "data": {
    "mintSplit": {
      "name": "Mint-Split",
      "enabled": true,
      "queue": { "size": 5, "pending": 5, "maxSize": 100 },
      "stats": {
        "processedToday": 150,
        "opportunitiesFound": 12,
        "ordersExecuted": 10,
        "successRate": 0.83,
        "totalProfit": 8.52,
        "totalLoss": 1.20
      },
      "lastActivity": "2025-12-06T10:23:45.000Z",
      "errors": { "count": 2, "lastError": "余额不足", "lastErrorAt": "..." }
    },
    "arbitrage": { ... },
    "marketMaking": { ... },
    "orderQueue": { "size": 2, "pending": 2, "maxSize": 50, "processing": true }
  }
}
```

---

**上一章**: [02-scan-storage.md](./02-scan-storage.md) - 扫描配置与存储方案  
**下一章**: [04-database-api.md](./04-database-api.md) - 数据库与 API 设计
