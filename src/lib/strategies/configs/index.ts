/**
 * 策略配置统一导出
 */

export * from './mint-split-config'
export * from './long-arbitrage-config'
export * from './short-arbitrage-config'

// 策略类型枚举
export type StrategyType = 'MINT_SPLIT' | 'LONG_ARBITRAGE' | 'SHORT_ARBITRAGE' | 'MARKET_MAKING' | 'INVENTORY'

// 统一配置接口
export interface UnifiedStrategyConfig {
  MINT_SPLIT: {
    enabled: boolean
    minProfit: number
    autoTrade: boolean
    mintAmount: number
  }
  LONG_ARBITRAGE: {
    enabled: boolean
    minProfit: number
    autoTrade: boolean
    tradeAmount: number
  }
  SHORT_ARBITRAGE: {
    enabled: boolean
    minProfit: number
    autoTrade: boolean
    tradeAmount: number
  }
}

// 获取所有策略的统一配置
import { getMintSplitConfig } from './mint-split-config'
import { getLongArbitrageConfig } from './long-arbitrage-config'
import { getShortArbitrageConfig } from './short-arbitrage-config'

export function getAllStrategyConfigs(): UnifiedStrategyConfig {
  const mintSplit = getMintSplitConfig()
  const longArb = getLongArbitrageConfig()
  const shortArb = getShortArbitrageConfig()

  return {
    MINT_SPLIT: {
      enabled: mintSplit.enabled,
      minProfit: mintSplit.minProfit,
      autoTrade: mintSplit.autoTrade,
      mintAmount: mintSplit.mintAmount,
    },
    LONG_ARBITRAGE: {
      enabled: longArb.enabled,
      minProfit: longArb.minProfit,
      autoTrade: longArb.autoTrade,
      tradeAmount: longArb.tradeAmount,
    },
    SHORT_ARBITRAGE: {
      enabled: shortArb.enabled,
      minProfit: shortArb.minProfit,
      autoTrade: shortArb.autoTrade,
      tradeAmount: shortArb.tradeAmount,
    },
  }
}
