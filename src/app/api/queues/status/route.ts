/**
 * 队列状态 API
 * GET /api/queues/status - 获取所有队列状态
 */

import { NextResponse } from "next/server"
import { getQueueSystemStatus, getPriceQueue } from "@/lib/queue"

export async function GET() {
  try {
    const status = getQueueSystemStatus()
    const priceQueue = getPriceQueue()
    const priceStatus = priceQueue.getStatus()
    
    return NextResponse.json({
      success: true,
      data: {
        scan: {
          size: status.scan.size,
          maxSize: status.scan.maxSize,
          pending: status.scan.pending,
          state: status.scan.state,
          processedCount: status.scan.processedCount,
          errorCount: status.scan.errorCount,
          lastTaskAt: status.scan.lastTaskAt,
        },
        storage: {
          size: status.storage.size,
          pending: status.storage.pending,
          state: status.storage.state,
          completed: status.storage.completed,
          failed: status.storage.failed,
          stats: status.storageStats,
        },
        price: {
          size: priceStatus.size,
          pending: priceStatus.pending,
          state: priceStatus.state,
          processedCount: priceStatus.processedCount,
          errorCount: priceStatus.errorCount,
          lastTaskAt: priceStatus.lastTaskAt,
          stats: priceStatus.stats,
        },
        strategies: {
          mintSplit: status.strategies.mintSplit,
          arbitrage: status.strategies.arbitrage,
          marketMaking: status.strategies.marketMaking,
        },
        orders: status.orders,
        dispatcher: status.dispatcher,
      },
    })
  } catch (error: unknown) {
    console.error("获取队列状态失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "获取队列状态失败" },
      { status: 500 }
    )
  }
}
