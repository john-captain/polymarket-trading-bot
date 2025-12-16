/**
 * 策略配置管理
 * 
 * 功能：
 * 1. 定义三个策略的配置数据结构
 * 2. 内存缓存 + 数据库持久化
 * 3. 支持配置热更新（不重启生效）
 */

import type { StrategyType } from './strategy-dispatcher'

// ==================== 配置类型定义 ====================

/**
 * Mint-Split 策略配置
 */
export interface MintSplitConfig {
  /** 是否启用 */
  enabled: boolean
  /** 是否自动执行 (否则仅提示) */
  autoExecute: boolean
  
  // 触发条件
  /** 最小价格和阈值 (触发条件：价格和 > 此值) */
  minPriceSum: number
  /** 最少 outcome 数量 */
  minOutcomes: number
  /** 最小流动性 ($) */
  minLiquidity: number
  
  // 交易参数
  /** 每次铸造金额 ($) */
  mintAmount: number
  /** 最大滑点 (%) */
  maxSlippage: number
  /** 冷却时间 (ms) */
  cooldownMs: number
  
  // 风控
  /** 单次最大铸造量 ($) */
  maxMintPerTrade: number
  /** 每日最大铸造量 ($) */
  maxMintPerDay: number
}

/**
 * Arbitrage 策略配置 (仅 LONG)
 * 
 * SHORT 策略已移除，功能与 MintSplit 策略重复
 */
export interface ArbitrageConfig {
  /** 是否启用 */
  enabled: boolean
  /** 是否自动执行 */
  autoExecute: boolean
  
  // LONG 子策略 (买入总价 < 1)
  long: {
    enabled: boolean
    /** 最大买入价格和 (触发条件：价格和 < 此值) */
    maxPriceSum: number
    /** 最小价差 (%) */
    minSpread: number
  }
  
  // 交易参数
  /** 每次交易金额 ($) */
  tradeAmount: number
  /** 最大滑点 (%) */
  maxSlippage: number
  /** 冷却时间 (ms) */
  cooldownMs: number
  /** 最小流动性 ($) */
  minLiquidity: number
  
  // 风控
  /** 单次最大交易量 ($) */
  maxTradePerOrder: number
  /** 每日最大交易量 ($) */
  maxTradePerDay: number
}

/**
 * Market-Making 做市策略配置
 * 
 * 适合小额做市的 6 个关键条件：
 * ① 成交活跃 - 每分钟 5+ 次成交
 * ② spread ≥ 1.5% - 覆盖手续费与利润
 * ③ 波动不剧烈 - 价格在区间震荡
 * ④ 深度足够厚 - 不会因小单推动价格
 * ⑤ 手续费可控 - 每单至少 $0.5～$1
 * ⑥ 无专业机器人垄断 - 否则永远插不进去
 */
export interface MarketMakingConfig {
  /** 是否启用 */
  enabled: boolean
  /** 是否自动执行 */
  autoExecute: boolean
  
  // ========== 做市参数 ==========
  /** 买卖价差 (%) - 你挂单的 spread */
  spreadPercent: number
  /** 单笔订单大小 ($) - 建议 ≥ $0.5 覆盖手续费 */
  orderSize: number
  /** 单边最大持仓 ($) */
  maxPositionPerSide: number
  /** 订单刷新间隔 (ms) */
  refreshIntervalMs: number
  
  // ========== ① 成交活跃度筛选 (最重要) ==========
  /** 最小24h交易量 ($) - 建议 ≥ $5000 */
  minVolume24h: number
  /** 最小每分钟成交次数 - 建议 ≥ 5 */
  minTradesPerMinute: number
  /** 最近成交时间阈值 (秒) - 超过此时间无成交则跳过 */
  maxLastTradeAge: number
  
  // ========== ② Spread 筛选 ==========
  /** 最小市场自然价差 (%) - 建议 ≥ 1.5% */
  minMarketSpread: number
  /** 最大市场价差 (%) - 价差太大可能流动性差 */
  maxMarketSpread: number
  
  // ========== ③ 波动率筛选 ==========
  /** 最大价格波动率 (%) - 24h内价格变动幅度 */
  maxVolatility: number
  /** 价格稳定区间 - YES价格应在此范围内 (如 0.35-0.65) */
  priceRangeMin: number
  priceRangeMax: number
  /** 最小剩余天数 - 避免临近结算的市场 */
  minDaysUntilEnd: number
  
  // ========== ④ 深度筛选 ==========
  /** 最小流动性 ($) */
  minLiquidity: number
  /** 最小订单簿深度 (条数) - bid/ask 各至少多少条 */
  minOrderBookDepth: number
  /** 最小深度金额 ($) - 订单簿前 N 档总金额 */
  minDepthAmount: number
  
  // ========== ⑤ 手续费控制 ==========
  /** 最小单笔订单 ($) - 太小会被手续费吃掉 */
  minOrderSize: number
  /** 预估手续费率 (%) */
  estimatedFeeRate: number
  
  // ========== ⑥ 竞争检测 ==========
  /** 是否启用竞争检测 */
  enableCompetitionDetection: boolean
  /** 最大订单刷新频率 (次/秒) - 超过说明有高频机器人 */
  maxOrderRefreshRate: number
  /** 最大连续被插队次数 - 超过则放弃该市场 */
  maxFrontRunCount: number
  
  // ========== 风控 ==========
  /** 库存偏斜阈值 (%) - 单边持仓超过此比例触发调整 */
  skewThreshold: number
  /** 最大未平仓持仓 ($) */
  maxOpenPosition: number
  /** 是否自动 Merge 赎回 */
  autoMerge: boolean
  /** Merge 触发阈值 ($) - 双边持仓都超过此值时触发 */
  mergeThreshold: number
  /** 单日最大亏损 ($) - 达到后暂停该市场 */
  maxDailyLoss: number
  
  // ========== 冷却 ==========
  /** 冷却时间 (ms) */
  cooldownMs: number
}

/**
 * 全局策略配置
 */
export interface AllStrategyConfig {
  mintSplit: MintSplitConfig
  arbitrage: ArbitrageConfig
  marketMaking: MarketMakingConfig
  
  // 全局设置
  global: {
    /** 是否启用策略系统 */
    enabled: boolean
    /** 扫描间隔 (ms) */
    scanIntervalMs: number
    /** 并发执行数 */
    concurrency: number
    /** 每日最大总交易量 ($) */
    maxDailyVolume: number
    /** 紧急停止标志 */
    emergencyStop: boolean
  }
}

// ==================== 默认配置 ====================

export const DEFAULT_MINT_SPLIT_CONFIG: MintSplitConfig = {
  enabled: true,
  autoExecute: false,
  minPriceSum: 1.005,
  minOutcomes: 2,
  minLiquidity: 100,
  mintAmount: 10,
  maxSlippage: 0.5,
  cooldownMs: 60000,
  maxMintPerTrade: 100,
  maxMintPerDay: 1000,
}

export const DEFAULT_ARBITRAGE_CONFIG: ArbitrageConfig = {
  enabled: true,
  autoExecute: false,
  long: {
    enabled: true,
    maxPriceSum: 0.995,
    minSpread: 0.5,
  },
  tradeAmount: 10,
  maxSlippage: 0.5,
  cooldownMs: 60000,
  minLiquidity: 100,
  maxTradePerOrder: 100,
  maxTradePerDay: 1000,
}

export const DEFAULT_MARKET_MAKING_CONFIG: MarketMakingConfig = {
  enabled: false, // 默认关闭，风险较高
  autoExecute: false,
  
  // 做市参数
  spreadPercent: 2,           // 挂单价差 2%
  orderSize: 1,               // 每单 $1
  maxPositionPerSide: 50,     // 单边最大持仓 $50
  refreshIntervalMs: 30000,   // 30秒刷新一次订单
  
  // ① 成交活跃度 (最重要)
  minVolume24h: 5000,         // 24h交易量 ≥ $5000
  minTradesPerMinute: 5,      // 每分钟 ≥ 5 笔成交
  maxLastTradeAge: 300,       // 最近成交不超过 5 分钟前
  
  // ② Spread 筛选
  minMarketSpread: 1.5,       // 市场自然价差 ≥ 1.5%
  maxMarketSpread: 10,        // 价差不超过 10% (太大说明流动性差)
  
  // ③ 波动率筛选
  maxVolatility: 15,          // 24h波动率 ≤ 15%
  priceRangeMin: 0.35,        // YES价格下限 35%
  priceRangeMax: 0.65,        // YES价格上限 65%
  minDaysUntilEnd: 10,        // 至少还有 10 天结束
  
  // ④ 深度筛选
  minLiquidity: 1000,         // 最小流动性 $1000
  minOrderBookDepth: 20,      // 订单簿至少 20 档
  minDepthAmount: 100,        // 前几档深度 ≥ $100
  
  // ⑤ 手续费控制
  minOrderSize: 0.5,          // 最小单笔 $0.5
  estimatedFeeRate: 0.2,      // 预估手续费 0.2%
  
  // ⑥ 竞争检测
  enableCompetitionDetection: true,
  maxOrderRefreshRate: 2,     // 订单刷新 ≤ 2次/秒 (否则有高频机器人)
  maxFrontRunCount: 5,        // 被插队超过 5 次则放弃
  
  // 风控
  skewThreshold: 0.6,         // 单边持仓超过 60% 触发调整
  maxOpenPosition: 100,       // 最大未平仓 $100
  autoMerge: true,            // 自动 Merge 赎回
  mergeThreshold: 20,         // 双边持仓都超过 $20 时触发 Merge
  maxDailyLoss: 10,           // 单日最大亏损 $10
  
  // 冷却
  cooldownMs: 30000,          // 30秒冷却
}

export const DEFAULT_STRATEGY_CONFIG: AllStrategyConfig = {
  mintSplit: DEFAULT_MINT_SPLIT_CONFIG,
  arbitrage: DEFAULT_ARBITRAGE_CONFIG,
  marketMaking: DEFAULT_MARKET_MAKING_CONFIG,
  global: {
    enabled: true,
    scanIntervalMs: 5000,
    concurrency: 1,
    maxDailyVolume: 5000,
    emergencyStop: false,
  },
}

// ==================== 配置管理器 ====================

class StrategyConfigManager {
  private config: AllStrategyConfig
  private listeners: ((config: AllStrategyConfig) => void)[] = []
  private dailyStats = {
    mintSplitVolume: 0,
    arbitrageVolume: 0,
    marketMakingVolume: 0,
    lastResetDate: new Date().toDateString(),
  }

  constructor() {
    this.config = { ...DEFAULT_STRATEGY_CONFIG }
    console.log('✅ [StrategyConfig] 配置管理器已初始化')
  }

  /**
   * 获取完整配置
   */
  getConfig(): AllStrategyConfig {
    return JSON.parse(JSON.stringify(this.config))
  }

  /**
   * 获取指定策略配置
   */
  getStrategyConfig<T extends keyof AllStrategyConfig>(strategy: T): AllStrategyConfig[T] {
    return JSON.parse(JSON.stringify(this.config[strategy]))
  }

  /**
   * 更新配置 (热更新)
   */
  updateConfig(updates: Partial<AllStrategyConfig>): void {
    // 深度合并
    if (updates.mintSplit) {
      this.config.mintSplit = { ...this.config.mintSplit, ...updates.mintSplit }
    }
    if (updates.arbitrage) {
      this.config.arbitrage = { ...this.config.arbitrage, ...updates.arbitrage }
      if (updates.arbitrage.long) {
        this.config.arbitrage.long = { ...this.config.arbitrage.long, ...updates.arbitrage.long }
      }
    }
    if (updates.marketMaking) {
      this.config.marketMaking = { ...this.config.marketMaking, ...updates.marketMaking }
    }
    if (updates.global) {
      this.config.global = { ...this.config.global, ...updates.global }
    }

    console.log('🔄 [StrategyConfig] 配置已更新')
    this.notifyListeners()
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_STRATEGY_CONFIG))
    console.log('🔄 [StrategyConfig] 已重置为默认配置')
    this.notifyListeners()
  }

  /**
   * 启用/禁用策略
   */
  setStrategyEnabled(strategy: StrategyType | 'global', enabled: boolean): void {
    switch (strategy) {
      case 'MINT_SPLIT':
        this.config.mintSplit.enabled = enabled
        break
      case 'ARBITRAGE_LONG':
        this.config.arbitrage.long.enabled = enabled
        break
      case 'MARKET_MAKING':
        this.config.marketMaking.enabled = enabled
        break
      case 'global':
        this.config.global.enabled = enabled
        break
    }
    console.log(`🔄 [StrategyConfig] ${strategy} 已${enabled ? '启用' : '禁用'}`)
    this.notifyListeners()
  }

  /**
   * 紧急停止
   */
  emergencyStop(): void {
    this.config.global.emergencyStop = true
    this.config.global.enabled = false
    console.log('🚨 [StrategyConfig] 紧急停止已触发!')
    this.notifyListeners()
  }

  /**
   * 解除紧急停止
   */
  clearEmergencyStop(): void {
    this.config.global.emergencyStop = false
    console.log('✅ [StrategyConfig] 紧急停止已解除')
    this.notifyListeners()
  }

  /**
   * 检查是否可以执行交易
   */
  canExecuteTrade(strategy: StrategyType, amount: number): { allowed: boolean; reason?: string } {
    // 检查紧急停止
    if (this.config.global.emergencyStop) {
      return { allowed: false, reason: '紧急停止已激活' }
    }

    // 检查全局开关
    if (!this.config.global.enabled) {
      return { allowed: false, reason: '策略系统已关闭' }
    }

    // 重置每日统计
    this.checkDailyReset()

    // 检查每日限额
    const totalDailyVolume = this.dailyStats.mintSplitVolume + 
      this.dailyStats.arbitrageVolume + 
      this.dailyStats.marketMakingVolume
    
    if (totalDailyVolume + amount > this.config.global.maxDailyVolume) {
      return { allowed: false, reason: `已达每日最大交易量 $${this.config.global.maxDailyVolume}` }
    }

    // 检查策略特定限额
    switch (strategy) {
      case 'MINT_SPLIT':
        if (!this.config.mintSplit.enabled) {
          return { allowed: false, reason: 'Mint-Split 策略已禁用' }
        }
        if (amount > this.config.mintSplit.maxMintPerTrade) {
          return { allowed: false, reason: `超过单次最大铸造量 $${this.config.mintSplit.maxMintPerTrade}` }
        }
        if (this.dailyStats.mintSplitVolume + amount > this.config.mintSplit.maxMintPerDay) {
          return { allowed: false, reason: `已达 Mint-Split 每日限额 $${this.config.mintSplit.maxMintPerDay}` }
        }
        break
      
      case 'ARBITRAGE_LONG':
        if (!this.config.arbitrage.enabled) {
          return { allowed: false, reason: 'Arbitrage 策略已禁用' }
        }
        if (!this.config.arbitrage.long.enabled) {
          return { allowed: false, reason: 'Arbitrage LONG 已禁用' }
        }
        if (amount > this.config.arbitrage.maxTradePerOrder) {
          return { allowed: false, reason: `超过单次最大交易量 $${this.config.arbitrage.maxTradePerOrder}` }
        }
        if (this.dailyStats.arbitrageVolume + amount > this.config.arbitrage.maxTradePerDay) {
          return { allowed: false, reason: `已达 Arbitrage 每日限额 $${this.config.arbitrage.maxTradePerDay}` }
        }
        break
      
      case 'MARKET_MAKING':
        if (!this.config.marketMaking.enabled) {
          return { allowed: false, reason: 'Market-Making 策略已禁用' }
        }
        break
    }

    return { allowed: true }
  }

  /**
   * 记录交易量
   */
  recordTradeVolume(strategy: StrategyType, amount: number): void {
    this.checkDailyReset()

    switch (strategy) {
      case 'MINT_SPLIT':
        this.dailyStats.mintSplitVolume += amount
        break
      case 'ARBITRAGE_LONG':
        this.dailyStats.arbitrageVolume += amount
        break
      case 'MARKET_MAKING':
        this.dailyStats.marketMakingVolume += amount
        break
    }
  }

  /**
   * 获取每日统计
   */
  getDailyStats(): typeof this.dailyStats {
    this.checkDailyReset()
    return { ...this.dailyStats }
  }

  /**
   * 检查并重置每日统计
   */
  private checkDailyReset(): void {
    const today = new Date().toDateString()
    if (this.dailyStats.lastResetDate !== today) {
      this.dailyStats = {
        mintSplitVolume: 0,
        arbitrageVolume: 0,
        marketMakingVolume: 0,
        lastResetDate: today,
      }
      console.log('🔄 [StrategyConfig] 每日统计已重置')
    }
  }

  /**
   * 监听配置变更
   */
  onConfigChange(listener: (config: AllStrategyConfig) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index !== -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    const config = this.getConfig()
    for (const listener of this.listeners) {
      try {
        listener(config)
      } catch (error) {
        console.error('❌ [StrategyConfig] 监听器错误:', error)
      }
    }
  }

  /**
   * 导出配置 (用于保存到数据库)
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  /**
   * 导入配置 (从数据库加载)
   */
  importConfig(configJson: string): void {
    try {
      const parsed = JSON.parse(configJson)
      this.config = {
        ...DEFAULT_STRATEGY_CONFIG,
        ...parsed,
        mintSplit: { ...DEFAULT_MINT_SPLIT_CONFIG, ...parsed.mintSplit },
        arbitrage: { 
          ...DEFAULT_ARBITRAGE_CONFIG, 
          ...parsed.arbitrage,
          long: { ...DEFAULT_ARBITRAGE_CONFIG.long, ...parsed.arbitrage?.long },
        },
        marketMaking: { ...DEFAULT_MARKET_MAKING_CONFIG, ...parsed.marketMaking },
        global: { ...DEFAULT_STRATEGY_CONFIG.global, ...parsed.global },
      }
      console.log('✅ [StrategyConfig] 配置已导入')
      this.notifyListeners()
    } catch (error) {
      console.error('❌ [StrategyConfig] 配置导入失败:', error)
    }
  }
}

// ==================== 单例导出 ====================

let configManagerInstance: StrategyConfigManager | null = null

/**
 * 获取策略配置管理器单例
 */
export function getStrategyConfigManager(): StrategyConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new StrategyConfigManager()
  }
  return configManagerInstance
}

/**
 * 重置策略配置管理器
 */
export function resetStrategyConfigManager(): void {
  configManagerInstance = null
}

// 便捷导出
export const strategyConfig = {
  get: () => getStrategyConfigManager().getConfig(),
  update: (updates: Partial<AllStrategyConfig>) => getStrategyConfigManager().updateConfig(updates),
  reset: () => getStrategyConfigManager().resetToDefault(),
  canTrade: (strategy: StrategyType, amount: number) => getStrategyConfigManager().canExecuteTrade(strategy, amount),
  recordVolume: (strategy: StrategyType, amount: number) => getStrategyConfigManager().recordTradeVolume(strategy, amount),
}
