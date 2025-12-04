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
