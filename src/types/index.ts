/**
 * 统一类型定义
 */

// ==================== 市场类型 ====================

export interface TokenInfo {
  tokenId: string
  outcome: string
  price: number
  bestAsk: number
  bestBid: number
  askSize: number
  bidSize: number
}

export interface Market {
  conditionId: string
  question: string
  slug?: string
  tokens: TokenInfo[]
  priceSum: number
  spread: number
  arbitrageType: ArbitrageType
  estimatedProfit: number
  liquidity: number
}

export type ArbitrageType = "LONG" | "SHORT" | "NONE"

// ==================== 交易类型 ====================

export type TradeStatus = "PENDING" | "SUCCESS" | "FAILED" | "SIMULATED"

export interface TradeRecord {
  id?: number
  opportunityId?: number
  marketQuestion: string
  conditionId?: string
  tradeType: "LONG" | "SHORT"
  yesTokenId?: string
  noTokenId?: string
  yesAmount?: number
  noAmount?: number
  totalInvestment: number
  expectedProfit: number
  actualProfit?: number
  status: TradeStatus
  txHash?: string
  errorMessage?: string
  createdAt?: Date
}

export interface TradeRequest {
  market: Market
  tradeType: "LONG" | "SHORT"
  amount: number
}

export interface TradeResult {
  success: boolean
  tradeId?: number
  txHash?: string
  actualProfit?: number
  error?: string
}

// ==================== 套利机会类型 ====================

export interface ArbitrageOpportunity {
  id?: number
  market: Market
  type: "LONG" | "SHORT"
  expectedProfit: number
  priceSum: number
  spread: number
  createdAt?: Date
}

// ==================== API 响应类型 ====================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ==================== 余额类型 ====================

export interface BalanceInfo {
  address: string
  usdc: number
  matic: number
  isOffline?: boolean
  isDemo?: boolean
}

// ==================== 扫描统计类型 ====================

export interface ScanStats {
  scanCount: number
  opportunityCount: number
  tradeCount: number
  totalProfit: number
  isRunning: boolean
  startTime?: Date
}

// ==================== 策略设置类型 ====================

export interface ArbitrageSettings {
  minSpread: number
  minProfit: number
  tradeAmount: number
  scanInterval: number
  autoTrade: boolean
  maxSlippage: number
}

// ==================== 高级套利策略类型 ====================

/**
 * 策略类型枚举
 * - MINT_SPLIT: 铸造拆分套利 (核心现金牛)
 * - MARKET_MAKING: 做市商策略
 */
export type StrategyType = "MINT_SPLIT" | "MARKET_MAKING"

/**
 * 策略状态
 */
export type StrategyStatus = "IDLE" | "RUNNING" | "PAUSED" | "ERROR"

/**
 * 铸造拆分套利设置
 * 核心逻辑：当所有选项的卖一价之和 > $1 时，铸造一套完整代币后分别卖出
 */
export interface MintSplitSettings {
  enabled: boolean
  // 最小价差触发点 (例如 1.02 表示总价 > $1.02 时触发)
  minPriceSum: number
  // 最小预期利润 (美元)
  minProfit: number
  // 每次铸造金额 (USDC)
  mintAmount: number
  // 扫描间隔 (毫秒)
  scanInterval: number
  // 最小流动性要求 (确保能卖出)
  minLiquidity: number
  // 最大滑点容忍度 (%)
  maxSlippage: number
  // 只扫描多选项市场 (>2 个结果)
  multiOutcomeOnly: boolean
  // 最小结果数
  minOutcomes: number
}

/**
 * 做市商策略设置
 * 核心逻辑：双向挂单赚取买卖价差
 */
export interface MarketMakingSettings {
  enabled: boolean
  // 目标市场列表 (conditionId)
  targetMarkets: string[]
  // 挂单价差 (%, 例如 2 = 买49卖51)
  spreadPercent: number
  // 单边最大持仓 (美元)
  maxPositionPerSide: number
  // 总资金池 (美元)
  totalCapital: number
  // 库存偏斜阈值 (触发对冲)
  inventorySkewThreshold: number
  // 自动对冲
  autoHedge: boolean
  // 刷新频率 (毫秒)
  refreshInterval: number
  // 使用 Merge 功能平衡仓位
  enableMerge: boolean
}

/**
 * 持仓记录
 */
export interface Position {
  tokenId: string
  conditionId: string
  marketQuestion: string
  outcome: string
  amount: number
  avgCost: number
  currentPrice: number
  unrealizedPnL: number
  acquiredAt: Date
  source: StrategyType
  // 是否为垃圾持仓 (套利剩余)
  isDust: boolean
}

/**
 * 挂单记录
 */
export interface OpenOrder {
  orderId: string
  tokenId: string
  conditionId: string
  side: "BUY" | "SELL"
  price: number
  size: number
  filledSize: number
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED"
  strategy: StrategyType
  createdAt: Date
}

/**
 * 铸造拆分机会
 */
export interface MintSplitOpportunity {
  conditionId: string
  question: string
  outcomes: {
    tokenId: string
    outcome: string
    bestBid: number
    bidSize: number
    expectedSellPrice: number
  }[]
  totalBidSum: number
  expectedProfit: number
  mintCost: number
  estimatedSlippage: number
  liquidity: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
}

/**
 * 策略统计
 */
export interface StrategyStats {
  strategyType: StrategyType
  status: StrategyStatus
  // 执行次数
  executionCount: number
  // 成功次数
  successCount: number
  // 失败次数
  failCount: number
  // 总利润
  totalProfit: number
  // 总亏损
  totalLoss: number
  // 净利润
  netProfit: number
  // 最后执行时间
  lastExecutionTime?: Date
  // 最后错误
  lastError?: string
  // 运行时长 (秒)
  runningTime: number
}

/**
 * 完整策略配置
 */
export interface StrategyConfig {
  mintSplit: MintSplitSettings
  marketMaking: MarketMakingSettings
}

/**
 * 策略日志条目
 */
export interface StrategyLogEntry {
  timestamp: Date
  strategy: StrategyType
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS"
  message: string
  data?: Record<string, unknown>
}

