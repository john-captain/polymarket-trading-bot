/**
 * 文件日志存储实现
 * 将 API 请求日志存储到本地文件，避免数据库负担
 */

import fs from 'fs'
import path from 'path'
import type { LogStorage } from './base'
import type { ApiRequestLog } from './types'

// 日志文件配置
const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'api-requests.log')
const MAX_LOG_LINES = 1000  // 内存中保留的最大日志行数
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB 后轮转

// 内存中的日志缓存（用于快速查询）
let logCache: ApiRequestLog[] = []

/**
 * 确保日志目录存在
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

/**
 * 轮转日志文件（如果太大）
 */
function rotateLogFileIfNeeded(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE)
      if (stats.size > MAX_FILE_SIZE) {
        const backupFile = LOG_FILE + '.1'
        // 删除旧备份
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile)
        }
        // 重命名当前日志
        fs.renameSync(LOG_FILE, backupFile)
        console.log('✅ API 日志文件已轮转')
      }
    }
  } catch (error) {
    console.error('❌ 日志轮转失败:', error)
  }
}

/**
 * 文件日志存储实现
 */
export class FileLogStorage implements LogStorage {
  constructor() {
    ensureLogDir()
    // 启动时加载最近的日志到内存
    this.loadRecentLogs()
  }

  /**
   * 保存日志
   */
  async saveLog(log: ApiRequestLog): Promise<void> {
    try {
      rotateLogFileIfNeeded()
      
      // 添加时间戳（转为字符串存储）
      const logEntry = {
        ...log,
        createdAt: new Date().toISOString(),
      }

      // 写入文件（追加模式）
      const logLine = JSON.stringify(logEntry) + '\n'
      fs.appendFileSync(LOG_FILE, logLine, 'utf-8')

      // 更新内存缓存（存储原始对象）
      logCache.push({
        ...log,
        createdAt: new Date(),
      })
      
      // 限制内存缓存大小
      if (logCache.length > MAX_LOG_LINES) {
        logCache = logCache.slice(-MAX_LOG_LINES)
      }
    } catch (error) {
      console.error('❌ 保存 API 日志到文件失败:', error)
    }
  }

  /**
   * 加载最近的日志到内存
   */
  private loadRecentLogs(): void {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return
      }

      const content = fs.readFileSync(LOG_FILE, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      
      // 只加载最近的日志
      const recentLines = lines.slice(-MAX_LOG_LINES)
      
      logCache = recentLines.map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      }).filter(Boolean) as ApiRequestLog[]
    } catch (error) {
      console.error('❌ 加载 API 日志失败:', error)
      logCache = []
    }
  }
}

/**
 * 获取日志列表（从内存缓存）
 */
export function getApiLogs(options: {
  limit?: number
  clientType?: string
  success?: boolean
} = {}): ApiRequestLog[] {
  // 确保日志存储已初始化（会从文件加载日志到内存）
  getFileLogStorage()
  
  let logs = [...logCache]

  // 筛选
  if (options.clientType) {
    logs = logs.filter(log => log.clientType === options.clientType)
  }
  if (options.success !== undefined) {
    logs = logs.filter(log => log.success === options.success)
  }

  // 按时间倒序
  logs.sort((a, b) => {
    const timeA = new Date((a as any).createdAt || 0).getTime()
    const timeB = new Date((b as any).createdAt || 0).getTime()
    return timeB - timeA
  })

  // 限制数量
  const limit = options.limit || 50
  return logs.slice(0, limit)
}

/**
 * 获取日志统计
 */
export function getApiLogStats(): {
  total: number
  success: number
  failed: number
  byClient: Record<string, number>
} {
  // 确保日志存储已初始化（会从文件加载日志到内存）
  getFileLogStorage()
  
  const stats = {
    total: logCache.length,
    success: 0,
    failed: 0,
    byClient: {} as Record<string, number>,
  }

  for (const log of logCache) {
    if (log.success) {
      stats.success++
    } else {
      stats.failed++
    }

    const clientType = log.clientType || 'UNKNOWN'
    stats.byClient[clientType] = (stats.byClient[clientType] || 0) + 1
  }

  return stats
}

/**
 * 清空日志缓存
 */
export function clearApiLogs(): void {
  // 确保日志存储已初始化
  getFileLogStorage()
  
  logCache = []
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '', 'utf-8')
    }
    console.log('✅ API 日志已清空')
  } catch (error) {
    console.error('❌ 清空 API 日志失败:', error)
  }
}

// 导出单例
let fileLogStorage: FileLogStorage | null = null

export function getFileLogStorage(): FileLogStorage {
  if (!fileLogStorage) {
    fileLogStorage = new FileLogStorage()
  }
  return fileLogStorage
}
