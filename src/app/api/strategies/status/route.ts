/**
 * 策略状态 API
 * GET /api/strategies/status - 获取各策略的详细运行状态
 */

import { NextResponse } from "next/server"
import { 
  getStrategyConfigManager,
  getMintSplitQueue,
  getArbitrageQueue,
  getMarketMakingQueue,
  getOrderQueue,
  getStrategyDispatcher,
} from "@/lib/queue"
import { getTodayOpportunityStats } from "@/lib/database"

export async function GET() {
  try {
    const configManager = getStrategyConfigManager()
    const config = configManager.getConfig()
    
    const mintSplitQueue = getMintSplitQueue()
    const arbitrageQueue = getArbitrageQueue()
    const marketMakingQueue = getMarketMakingQueue()
    const orderQueue = getOrderQueue()
    const dispatcher = getStrategyDispatcher()
    
    // 获取各策略今日统计
    const [mintSplitToday, arbitrageLongToday, marketMakingToday] = await Promise.all([
      getTodayOpportunityStats('MINT_SPLIT'),
      getTodayOpportunityStats('ARBITRAGE_LONG'),
      getTodayOpportunityStats('MARKET_MAKING'),
    ])
    
    const dispatcherStats = dispatcher.getStats()
    
    return NextResponse.json({
      success: true,
      data: {
        global: {
          enabled: config.global.enabled,
          emergencyStop: config.global.emergencyStop,
          scanIntervalMs: config.global.scanIntervalMs,
        },
        mintSplit: {
          enabled: config.mintSplit.enabled,
          autoExecute: config.mintSplit.autoExecute,
          queue: mintSplitQueue.getStats(),
          today: mintSplitToday,
          dispatched: dispatcherStats.byStrategy['MINT_SPLIT'] || { count: 0, matched: 0 },
        },
        arbitrage: {
          enabled: config.arbitrage.enabled,
          autoExecute: config.arbitrage.autoExecute,
          long: {
            enabled: config.arbitrage.long.enabled,
            today: arbitrageLongToday,
            dispatched: dispatcherStats.byStrategy['ARBITRAGE_LONG'] || { count: 0, matched: 0 },
          },
          queue: arbitrageQueue.getStats(),
        },
        marketMaking: {
          enabled: config.marketMaking.enabled,
          autoExecute: config.marketMaking.autoExecute,
          queue: marketMakingQueue.getStats(),
          today: marketMakingToday,
          dispatched: dispatcherStats.byStrategy['MARKET_MAKING'] || { count: 0, matched: 0 },
        },
        orderQueue: orderQueue.getStats(),
        dispatcher: dispatcherStats,
      },
    })
  } catch (error: unknown) {
    console.error("获取策略状态失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "获取策略状态失败" },
      { status: 500 }
    )
  }
}
