/**
 * Mint/Split 策略配置文件
 * 多结果市场套利：当所有结果的 Bid 总和 > $1 时，Mint 完整份额后拆分卖出
 */

export interface MintSplitConfig {
  // 是否启用策略
  enabled: boolean
  // 最小利润阈值 ($)
  minProfit: number
  // 是否自动交易（发现机会时自动执行）
  autoTrade: boolean
  // 每次 Mint 的金额 ($)
  mintAmount: number
  // 最小结果数量（默认 3，多结果市场）
  minOutcomes: number
  // 最大滑点容忍度 (%)
  maxSlippage: number
  // 扫描间隔 (ms)
  scanInterval: number
}

// 默认配置
export const DEFAULT_MINT_SPLIT_CONFIG: MintSplitConfig = {
  enabled: false,
  minProfit: 0.02,
  autoTrade: false,
  mintAmount: 10,
  minOutcomes: 3,
  maxSlippage: 1.0,
  scanInterval: 5000,
}

// 内存中的配置状态
let currentConfig: MintSplitConfig = { ...DEFAULT_MINT_SPLIT_CONFIG }

/**
 * 获取当前配置
 */
export function getMintSplitConfig(): MintSplitConfig {
  return { ...currentConfig }
}

/**
 * 更新配置
 */
export function updateMintSplitConfig(updates: Partial<MintSplitConfig>): MintSplitConfig {
  currentConfig = {
    ...currentConfig,
    ...updates,
  }
  console.log("📝 Mint/Split 配置已更新:", currentConfig)
  return { ...currentConfig }
}

/**
 * 重置为默认配置
 */
export function resetMintSplitConfig(): MintSplitConfig {
  currentConfig = { ...DEFAULT_MINT_SPLIT_CONFIG }
  console.log("🔄 Mint/Split 配置已重置")
  return { ...currentConfig }
}

/**
 * 验证配置有效性
 */
export function validateMintSplitConfig(config: Partial<MintSplitConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (config.minProfit !== undefined && config.minProfit < 0) {
    errors.push("最小利润不能为负数")
  }

  if (config.mintAmount !== undefined && config.mintAmount < 1) {
    errors.push("Mint 金额至少为 $1")
  }

  if (config.minOutcomes !== undefined && config.minOutcomes < 2) {
    errors.push("最小结果数量至少为 2")
  }

  if (config.maxSlippage !== undefined && (config.maxSlippage < 0 || config.maxSlippage > 10)) {
    errors.push("滑点容忍度应在 0-10% 之间")
  }

  if (config.scanInterval !== undefined && config.scanInterval < 1000) {
    errors.push("扫描间隔至少为 1000ms")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
