/**
 * 队列系统统一导出
 * 
 * 提供扫描队列、存储队列、策略队列以及相关类型的统一访问入口
 */

// ==================== 类型导出 ====================

export type {
  // 队列配置
  QueueConfig,
  QueueName,
  QueueState,
  QueueStatus,
  
  // 扫描配置
  ScanConfig,
  OrderConfig,
  
  // 数据类型
  MarketData,
  ScanTaskResult,
  
  // 事件类型
  QueueEvent,
  QueueEventType,
  QueueEventListener,
  
  // 队列状态
  AllQueueStatus,
  QueueStats,
  ScanStats,
} from './types'

export {
  DEFAULT_QUEUE_CONFIGS,
  DEFAULT_SCAN_CONFIG,
  ORDER_MAPPINGS,
} from './types'

// ==================== 扫描队列 ====================

export {
  ScanQueue,
  getScanQueue,
  resetScanQueue,
} from './scan-queue'

// ==================== 存储队列 ====================

export {
  StorageQueue,
  getStorageQueue,
  resetStorageQueue,
  type StorageTaskResult,
} from './storage-queue'

// ==================== 价格队列 ====================

export {
  PriceQueue,
  getPriceQueue,
  resetPriceQueue,
  type PriceQueueConfig,
  type PriceTaskResult,
  type PriceQueueStatus,
  DEFAULT_PRICE_CONFIG,
} from './price-queue'

// ==================== 策略分发器 ====================

export {
  StrategyDispatcher,
  getStrategyDispatcher,
  resetStrategyDispatcher,
  type StrategyType,
  type ConfidenceLevel,
  type StrategyMatch,
  type DispatchTask,
  type DispatcherStats,
  type StrategyEnableConfig,
  type DispatcherConfig,
  DEFAULT_DISPATCHER_CONFIG,
} from './strategy-dispatcher'

// ==================== 策略配置管理 ====================

export {
  getStrategyConfigManager,
  resetStrategyConfigManager,
  strategyConfig,
  type MintSplitConfig,
  type ArbitrageConfig,
  type MarketMakingConfig,
  type AllStrategyConfig,
  DEFAULT_MINT_SPLIT_CONFIG,
  DEFAULT_ARBITRAGE_CONFIG,
  DEFAULT_MARKET_MAKING_CONFIG,
  DEFAULT_STRATEGY_CONFIG,
} from './strategy-config'

// ==================== 策略队列 ====================

export {
  // Mint-Split
  MintSplitQueue,
  getMintSplitQueue,
  resetMintSplitQueue,
  type MintSplitOpportunity,
  type MintSplitResult,
  // Arbitrage
  ArbitrageQueue,
  getArbitrageQueue,
  resetArbitrageQueue,
  type ArbitrageDirection,
  type ArbitrageOpportunity,
  type ArbitrageResult,
  // Market-Making
  MarketMakingQueue,
  getMarketMakingQueue,
  resetMarketMakingQueue,
  type MarketMakingState,
  type MarketMakingOpportunity,
  type MarketMakingResult,
} from './strategies'

// ==================== 交易执行队列 ====================

export {
  OrderQueue,
  getOrderQueue,
  resetOrderQueue,
  type OrderPriority,
  type OrderStatus,
  type OrderType,
  type TradeOrder,
  type BatchOrder,
  type OrderResult,
  type BatchOrderResult,
} from './order-queue'

// ==================== 扫描配置 ====================

export {
  getScanConfig,
  updateScanConfig,
  buildGammaApiParams,
  parseScanConfig,
  filterMarkets,
} from '../scan-config'

// ==================== 辅助函数 ====================

import { getScanQueue, resetScanQueue } from './scan-queue'
import { getStorageQueue, resetStorageQueue } from './storage-queue'
import { getStrategyDispatcher, resetStrategyDispatcher } from './strategy-dispatcher'
import { getMintSplitQueue, resetMintSplitQueue } from './strategies/mint-split-queue'
import { getArbitrageQueue, resetArbitrageQueue } from './strategies/arbitrage-queue'
import { getMarketMakingQueue, resetMarketMakingQueue } from './strategies/market-making-queue'
import { getOrderQueue, resetOrderQueue } from './order-queue'
import type { MarketData } from './types'

/**
 * 初始化队列系统
 * 连接扫描队列与存储队列的数据流
 */
export function initQueueSystem(): {
  scanQueue: ReturnType<typeof getScanQueue>
  storageQueue: ReturnType<typeof getStorageQueue>
} {
  const scanQueue = getScanQueue()
  const storageQueue = getStorageQueue()

  // 设置扫描队列的数据回调 - 扫描结果自动流入存储队列
  scanQueue.setOnMarketsScanned(async (markets: MarketData[]) => {
    console.log(`📤 [QueueSystem] 扫描完成，${markets.length} 条数据流入存储队列`)
    await storageQueue.add(markets)
  })

  // 设置背压检测 - 存储队列满时暂停扫描
  scanQueue.setBackpressureCheck(() => {
    return storageQueue.hasBackpressure()
  })

  console.log('✅ [QueueSystem] 队列系统已初始化，扫描→存储数据流已连接')
  
  return { scanQueue, storageQueue }
}

/**
 * 启动队列系统
 */
export async function startQueueSystem(): Promise<void> {
  const scanQueue = getScanQueue()
  const storageQueue = getStorageQueue()
  
  // 启动存储队列
  storageQueue.start()
  
  // 启动扫描队列
  await scanQueue.start()
  
  console.log('🚀 [QueueSystem] 队列系统已启动（含存储队列）')
}

/**
 * 停止队列系统
 */
export async function stopQueueSystem(): Promise<void> {
  const scanQueue = getScanQueue()
  const storageQueue = getStorageQueue()
  
  // 停止扫描
  await scanQueue.stop()
  
  // 停止存储队列
  await storageQueue.stop()
  
  console.log('⏹️ [QueueSystem] 队列系统已停止')
}

/**
 * 重置队列系统 (用于测试)
 */
export function resetQueueSystem(): void {
  resetScanQueue()
  resetStorageQueue()
  resetStrategyDispatcher()
  resetMintSplitQueue()
  resetArbitrageQueue()
  resetMarketMakingQueue()
  resetOrderQueue()
  console.log('🔄 [QueueSystem] 队列系统已重置')
}

/**
 * 获取队列系统状态
 */
export function getQueueSystemStatus() {
  const scanQueue = getScanQueue()
  const storageQueue = getStorageQueue()
  const dispatcher = getStrategyDispatcher()
  const mintSplitQueue = getMintSplitQueue()
  const arbitrageQueue = getArbitrageQueue()
  const marketMakingQueue = getMarketMakingQueue()
  const orderQueue = getOrderQueue()
  
  return {
    scan: scanQueue.getStatus(),
    storage: storageQueue.getStatus(),
    storageStats: storageQueue.getStats(),
    dispatcher: dispatcher.getStats(),
    strategies: {
      mintSplit: mintSplitQueue.getStats(),
      arbitrage: arbitrageQueue.getStats(),
      marketMaking: marketMakingQueue.getStats(),
    },
    orders: orderQueue.getStats(),
  }
}

/**
 * 初始化完整的策略队列系统
 * 连接所有队列的数据流
 */
export function initStrategyQueueSystem() {
  // 1. 初始化扫描队列（暂不连接存储队列）
  const scanQueue = getScanQueue()
  const storageQueue = getStorageQueue()
  
  // 2. 初始化策略分发器
  const dispatcher = getStrategyDispatcher()
  
  // 3. 初始化策略队列
  const mintSplitQueue = getMintSplitQueue()
  const arbitrageQueue = getArbitrageQueue()
  const marketMakingQueue = getMarketMakingQueue()
  
  // 4. 初始化执行队列
  const orderQueue = getOrderQueue()
  
  // 5. 注册策略处理器
  dispatcher.registerHandler('MINT_SPLIT', async (task) => {
    await mintSplitQueue.handleTask(task)
  })
  
  dispatcher.registerHandler('ARBITRAGE_LONG', async (task) => {
    await arbitrageQueue.handleTask(task, 'LONG')
  })
  
  dispatcher.registerHandler('MARKET_MAKING', async (task) => {
    await marketMakingQueue.handleTask(task)
  })
  
  // 6. 连接扫描 → 策略分发 + 存储队列 (流水线模式: 每页200条立即分发)
  scanQueue.setOnMarketsScanned(async (markets) => {
    // 存储到数据库
    await storageQueue.add(markets)
    
    // 分发到策略队列
    await dispatcher.analyze(markets)
  })

  // 7. 设置等待队列空闲的回调 (流水线模式核心)
  scanQueue.setWaitForQueuesIdle(async () => {
    // 等待存储队列处理完成
    await storageQueue.waitUntilIdle()
    
    // 等待策略队列处理完成
    await mintSplitQueue.waitUntilIdle()
    await arbitrageQueue.waitUntilIdle()
    await marketMakingQueue.waitUntilIdle()
    
    // 等待订单队列处理完成
    await orderQueue.waitUntilIdle()
  })
  
  console.log('✅ [QueueSystem] 策略队列系统已初始化（流水线模式）')
  
  return {
    scanQueue,
    storageQueue,
    dispatcher,
    mintSplitQueue,
    arbitrageQueue,
    marketMakingQueue,
    orderQueue,
  }
}
