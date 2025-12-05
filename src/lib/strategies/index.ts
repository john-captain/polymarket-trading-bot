/**
 * 策略管理器
 * 
 * 统一管理所有套利策略的启动、停止和状态监控
 */

import type { StrategyType, StrategyStats, StrategyConfig, StrategyLogEntry } from "@/types"

// 导入各策略模块
import {
  startMintSplitStrategy,
  stopMintSplitStrategy,
  getMintSplitStats,
  getMintSplitLogs,
  getMintSplitSettings,
  getMintSplitOpportunities,
  updateMintSplitSettings,
  defaultMintSplitSettings,
} from "./mint-split"

// Inventory and Longshot strategies removed from core build

import {
  startMarketMakingStrategy,
  stopMarketMakingStrategy,
  getMarketMakingStats,
  getMarketMakingLogs,
  getMarketMakingSettings,
  getMarketMakingMarkets,
  getMarketMakingSummary,
  updateMarketMakingSettings,
  addTargetMarket,
  removeTargetMarket,
  defaultMarketMakingSettings,
} from "./market-making"

/**
 * 获取默认策略配置
 */
export function getDefaultConfig(): StrategyConfig {
  return {
    mintSplit: { ...defaultMintSplitSettings },
    marketMaking: { ...defaultMarketMakingSettings },
    // inventory and longshot removed
  }
}

/**
 * 获取所有策略状态
 */
export function getAllStrategyStats(): Record<StrategyType, StrategyStats> {
  return {
    MINT_SPLIT: getMintSplitStats(),
    MARKET_MAKING: getMarketMakingStats(),
  }
}

/**
 * 获取策略状态
 */
export function getStrategyStats(type: StrategyType): StrategyStats {
  switch (type) {
    case "MINT_SPLIT":
      return getMintSplitStats()
    case "MARKET_MAKING":
      return getMarketMakingStats()
  }
}

/**
 * 启动策略
 */
export function startStrategy(type: StrategyType, settings?: Record<string, unknown>) {
  switch (type) {
    case "MINT_SPLIT":
      startMintSplitStrategy(settings)
      break
    case "MARKET_MAKING":
      startMarketMakingStrategy(settings)
      break
  }
}

/**
 * 停止策略
 */
export async function stopStrategy(type: StrategyType) {
  switch (type) {
    case "MINT_SPLIT":
      stopMintSplitStrategy()
      break
    case "MARKET_MAKING":
      await stopMarketMakingStrategy()
      break
  }
}

/**
 * 启动所有已启用的策略
 */
export function startAllEnabledStrategies(config: StrategyConfig) {
  if (config.mintSplit.enabled) {
    startMintSplitStrategy(config.mintSplit)
  }
  if (config.marketMaking.enabled) {
    startMarketMakingStrategy(config.marketMaking)
  }
}

/**
 * 停止所有策略
 */
export async function stopAllStrategies() {
  stopMintSplitStrategy()
  // inventory and longshot stopped/removed
  await stopMarketMakingStrategy()
}

/**
 * 获取策略日志
 */
export function getStrategyLogs(type: StrategyType): StrategyLogEntry[] {
  switch (type) {
    case "MINT_SPLIT":
      return getMintSplitLogs()
    case "MARKET_MAKING":
      return getMarketMakingLogs()
  }
}

/**
 * 获取所有策略日志 (合并并按时间排序)
 */
export function getAllStrategyLogs(limit: number = 100): StrategyLogEntry[] {
  const allLogs = [
    ...getMintSplitLogs(),
    ...getMarketMakingLogs(),
  ]
  
  return allLogs
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
}

/**
 * 获取策略设置
 */
export function getStrategySettings(type: StrategyType) {
  switch (type) {
    case "MINT_SPLIT":
      return getMintSplitSettings()
    case "MARKET_MAKING":
      return getMarketMakingSettings()
  }
}

/**
 * 更新策略设置
 */
export function updateStrategySettings(type: StrategyType, settings: Record<string, unknown>) {
  switch (type) {
    case "MINT_SPLIT":
      updateMintSplitSettings(settings)
      break
    case "MARKET_MAKING":
      updateMarketMakingSettings(settings)
      break
  }
}

/**
 * 获取综合统计
 */
export function getOverallStats(): {
  totalStrategies: number
  runningStrategies: number
  totalProfit: number
  totalLoss: number
  netProfit: number
  totalExecutions: number
  successRate: number
} {
  const stats = getAllStrategyStats()
  const values = Object.values(stats)
  
  const runningStrategies = values.filter(s => s.status === "RUNNING").length
  const totalProfit = values.reduce((sum, s) => sum + s.totalProfit, 0)
  const totalLoss = values.reduce((sum, s) => sum + s.totalLoss, 0)
  const totalExecutions = values.reduce((sum, s) => sum + s.executionCount, 0)
  const totalSuccess = values.reduce((sum, s) => sum + s.successCount, 0)
  
  return {
    totalStrategies: values.length,
    runningStrategies,
    totalProfit,
    totalLoss,
    netProfit: totalProfit - totalLoss,
    totalExecutions,
    successRate: totalExecutions > 0 ? (totalSuccess / totalExecutions) * 100 : 0,
  }
}

/**
 * 策略简介
 */
export const strategyDescriptions: Record<StrategyType, {
  name: string
  description: string
  riskLevel: "低" | "中" | "高"
  profitPotential: "低" | "中" | "高"
  complexity: "简单" | "中等" | "复杂"
}> = {
  MINT_SPLIT: {
    name: "铸造拆分套利",
    description: "核心现金牛策略。当多选项市场的卖一价之和 > $1 时，铸造完整代币组后分别卖出赚取差价。",
    riskLevel: "低",
    profitPotential: "中",
    complexity: "复杂",
  },
  // inventory and longshot removed
  MARKET_MAKING: {
    name: "做市商",
    description: "在活跃市场双向挂单赚取买卖价差。不赌方向，只赚流动性。需要对冲管理。",
    riskLevel: "中",
    profitPotential: "中",
    complexity: "中等",
  },
}

// 导出各策略的特定函数
export {
  // Mint Split
  getMintSplitOpportunities,
  
  // Market Making
  getMarketMakingMarkets,
  getMarketMakingSummary,
  addTargetMarket,
  removeTargetMarket,
}
