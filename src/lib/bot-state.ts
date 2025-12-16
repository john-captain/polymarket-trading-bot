// 全局状态管理 - 在服务端保持状态
// 注意：在生产环境中建议使用 Redis 或数据库

// 从统一配置导入市场分类
import { MARKET_CATEGORY_OPTIONS } from './filter-config'

// 向后兼容：导出 MARKET_CATEGORIES (旧名称)
export const MARKET_CATEGORIES = MARKET_CATEGORY_OPTIONS

interface BotState {
  isRunning: boolean
  startTime: Date | null
  tradesCount: number
  lastTrade: Date | null
}

interface ArbitrageState {
  isRunning: boolean
  startTime: Date | null
  scanCount: number
  opportunityCount: number
  tradeCount: number
  totalProfit: number
  markets: any[]
  logs: string[]
  scanInterval: NodeJS.Timeout | null
  totalMarketCount: number  // 市场总数
  filteredMarketCount: number  // 过滤后的市场数
}

interface ArbitrageSettings {
  minSpread: number
  tradeAmount: number
  scanInterval: number
  autoTrade: boolean
  minVolumeFilter: number  // 最小交易量过滤
  minLiquidity: number     // 最小流动性
  category: string         // 市场分类 (空字符串表示全部)
  excludeRestricted: boolean  // 排除受限市场
  onlyWithOrderbook: boolean  // 只显示有订单簿的市场
  maxOutcomes: number      // 最大结果数 (2 表示只显示二元市场)
}

// 机器人状态
export const botState: BotState = {
  isRunning: false,
  startTime: null,
  tradesCount: 0,
  lastTrade: null,
}

// 套利状态
export const arbitrageState: ArbitrageState = {
  isRunning: false,
  startTime: null,
  scanCount: 0,
  opportunityCount: 0,
  tradeCount: 0,
  totalProfit: 0,
  markets: [],
  logs: [],
  scanInterval: null,
  totalMarketCount: 0,
  filteredMarketCount: 0,
}

// 套利设置
export const arbitrageSettings: ArbitrageSettings = {
  minSpread: parseFloat(process.env.ARB_MIN_SPREAD || "1.0"),
  tradeAmount: parseFloat(process.env.ARB_TRADE_AMOUNT || "10.0"),
  scanInterval: parseInt(process.env.ARB_SCAN_INTERVAL || "3600000"), // 1小时扫描一轮
  autoTrade: false,
  minVolumeFilter: parseFloat(process.env.ARB_MIN_VOLUME || "100"),
  minLiquidity: parseFloat(process.env.ARB_MIN_LIQUIDITY || "0"),
  category: "",  // 空字符串表示全部分类
  excludeRestricted: false,
  onlyWithOrderbook: true,
  maxOutcomes: 0,  // 0 表示不限制
}

// 可用的市场分类 - 已迁移到 filter-config.ts
// 保留此处注释供参考，实际使用从 filter-config 导入

// 系统日志
export const systemLogs: string[] = []

// 添加系统日志
export function addSystemLog(message: string) {
  const timestamp = new Date().toLocaleString("zh-CN")
  const logEntry = `[${timestamp}] ${message}`
  systemLogs.unshift(logEntry)
  if (systemLogs.length > 100) systemLogs.pop()
  console.log(logEntry)
}

// 添加套利日志
export function addArbitrageLog(message: string) {
  const timestamp = new Date().toLocaleString("zh-CN")
  const logEntry = `[${timestamp}] ${message}`
  arbitrageState.logs.unshift(logEntry)
  if (arbitrageState.logs.length > 100) arbitrageState.logs.pop()
  console.log(`[套利] ${logEntry}`)
}
