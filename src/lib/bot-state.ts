// 全局状态管理 - 在服务端保持状态
// 注意：在生产环境中建议使用 Redis 或数据库

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
}

interface ArbitrageSettings {
  minSpread: number
  tradeAmount: number
  scanInterval: number
  autoTrade: boolean
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
}

// 套利设置
export const arbitrageSettings: ArbitrageSettings = {
  minSpread: parseFloat(process.env.ARB_MIN_SPREAD || "1.0"),
  tradeAmount: parseFloat(process.env.ARB_TRADE_AMOUNT || "10.0"),
  scanInterval: parseInt(process.env.ARB_SCAN_INTERVAL || "60000"),
  autoTrade: false,
}

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
