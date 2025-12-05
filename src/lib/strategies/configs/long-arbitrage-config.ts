/**
 * LONG 套利策略配置文件
 * 二元市场套利：当所有结果的 Ask 总和 < $1 时，买入所有结果锁定利润
 */

export interface LongArbitrageConfig {
  // 是否启用策略
  enabled: boolean
  // 最小利润阈值 ($)
  minProfit: number
  // 是否自动交易（发现机会时自动执行）
  autoTrade: boolean
  // 每边交易金额 ($)
  tradeAmount: number
  // 最大滑点容忍度 (%)
  maxSlippage: number
  // 扫描间隔 (ms)
  scanInterval: number
  // 是否只扫描二元市场
  onlyBinaryMarkets: boolean
  // 最小价差百分比 (%)
  minSpreadPercent: number
}

// 默认配置
export const DEFAULT_LONG_ARBITRAGE_CONFIG: LongArbitrageConfig = {
  enabled: true,
  minProfit: 0.01,
  autoTrade: false,
  tradeAmount: 10,
  maxSlippage: 0.5,
  scanInterval: 3000,
  onlyBinaryMarkets: true,
  minSpreadPercent: 0.5,
}

// 内存中的配置状态
let currentConfig: LongArbitrageConfig = { ...DEFAULT_LONG_ARBITRAGE_CONFIG }

/**
 * 获取当前配置
 */
export function getLongArbitrageConfig(): LongArbitrageConfig {
  return { ...currentConfig }
}

/**
 * 更新配置
 */
export function updateLongArbitrageConfig(updates: Partial<LongArbitrageConfig>): LongArbitrageConfig {
  currentConfig = {
    ...currentConfig,
    ...updates,
  }
  console.log("📝 LONG 套利配置已更新:", currentConfig)
  return { ...currentConfig }
}

/**
 * 重置为默认配置
 */
export function resetLongArbitrageConfig(): LongArbitrageConfig {
  currentConfig = { ...DEFAULT_LONG_ARBITRAGE_CONFIG }
  console.log("🔄 LONG 套利配置已重置")
  return { ...currentConfig }
}

/**
 * 验证配置有效性
 */
export function validateLongArbitrageConfig(config: Partial<LongArbitrageConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (config.minProfit !== undefined && config.minProfit < 0) {
    errors.push("最小利润不能为负数")
  }

  if (config.tradeAmount !== undefined && config.tradeAmount < 1) {
    errors.push("交易金额至少为 $1")
  }

  if (config.maxSlippage !== undefined && (config.maxSlippage < 0 || config.maxSlippage > 10)) {
    errors.push("滑点容忍度应在 0-10% 之间")
  }

  if (config.scanInterval !== undefined && config.scanInterval < 1000) {
    errors.push("扫描间隔至少为 1000ms")
  }

  if (config.minSpreadPercent !== undefined && config.minSpreadPercent < 0) {
    errors.push("最小价差百分比不能为负数")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 计算 LONG 套利利润
 * @param askSum 所有结果的 Ask 总和
 * @param amount 投入金额
 * @returns 预期利润
 */
export function calculateLongProfit(askSum: number, amount: number): number {
  if (askSum >= 1) return 0
  // 利润 = 投入 × (1 - askSum) / askSum
  return amount * (1 - askSum) / askSum
}

/**
 * 判断是否满足 LONG 套利条件
 */
export function isLongOpportunity(askSum: number, config: LongArbitrageConfig = currentConfig): boolean {
  if (!config.enabled) return false
  if (askSum >= 1) return false
  
  const spreadPercent = ((1 - askSum) / askSum) * 100
  if (spreadPercent < config.minSpreadPercent) return false
  
  const profit = calculateLongProfit(askSum, config.tradeAmount)
  return profit >= config.minProfit
}
