/**
 * SHORT 套利策略配置文件
 * 二元市场套利：当所有结果的 Bid 总和 > $1 时，卖出所有结果锁定利润
 * 注意：SHORT 策略需要先持有头寸才能卖出
 */

export interface ShortArbitrageConfig {
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
  // 是否要求持有头寸（安全模式）
  requirePosition: boolean
}

// 默认配置
export const DEFAULT_SHORT_ARBITRAGE_CONFIG: ShortArbitrageConfig = {
  enabled: true,
  minProfit: 0.01,
  autoTrade: false,
  tradeAmount: 10,
  maxSlippage: 0.5,
  scanInterval: 3000,
  onlyBinaryMarkets: true,
  minSpreadPercent: 0.5,
  requirePosition: true,
}

// 内存中的配置状态
let currentConfig: ShortArbitrageConfig = { ...DEFAULT_SHORT_ARBITRAGE_CONFIG }

/**
 * 获取当前配置
 */
export function getShortArbitrageConfig(): ShortArbitrageConfig {
  return { ...currentConfig }
}

/**
 * 更新配置
 */
export function updateShortArbitrageConfig(updates: Partial<ShortArbitrageConfig>): ShortArbitrageConfig {
  currentConfig = {
    ...currentConfig,
    ...updates,
  }
  console.log("📝 SHORT 套利配置已更新:", currentConfig)
  return { ...currentConfig }
}

/**
 * 重置为默认配置
 */
export function resetShortArbitrageConfig(): ShortArbitrageConfig {
  currentConfig = { ...DEFAULT_SHORT_ARBITRAGE_CONFIG }
  console.log("🔄 SHORT 套利配置已重置")
  return { ...currentConfig }
}

/**
 * 验证配置有效性
 */
export function validateShortArbitrageConfig(config: Partial<ShortArbitrageConfig>): { valid: boolean; errors: string[] } {
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
 * 计算 SHORT 套利利润
 * @param bidSum 所有结果的 Bid 总和
 * @param amount 投入金额
 * @returns 预期利润
 */
export function calculateShortProfit(bidSum: number, amount: number): number {
  if (bidSum <= 1) return 0
  // 利润 = 投入 × (bidSum - 1)
  return amount * (bidSum - 1)
}

/**
 * 判断是否满足 SHORT 套利条件
 */
export function isShortOpportunity(bidSum: number, config: ShortArbitrageConfig = currentConfig): boolean {
  if (!config.enabled) return false
  if (bidSum <= 1) return false
  
  const spreadPercent = (bidSum - 1) * 100
  if (spreadPercent < config.minSpreadPercent) return false
  
  const profit = calculateShortProfit(bidSum, config.tradeAmount)
  return profit >= config.minProfit
}
