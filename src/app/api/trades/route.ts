/**
 * 交易历史 API
 * GET /api/trades
 *
 * 获取交易记录列表和统计数据
 */

import { NextResponse } from "next/server"
import { getTradeRecords, getTradeStats, getDailyStats, testConnection } from "@/lib/database"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    const includeStats = searchParams.get("stats") !== "false"

    // 测试数据库连接
    const connected = await testConnection()
    if (!connected) {
      // 数据库未连接，返回空数据
      return NextResponse.json({
        success: true,
        data: {
          trades: [],
          stats: {
            totalTrades: 0,
            successTrades: 0,
            failedTrades: 0,
            totalProfit: 0,
            totalInvestment: 0,
            winRate: 0,
          },
          dailyStats: [],
          dbConnected: false,
        },
      })
    }

    // 获取交易记录
    const trades = await getTradeRecords(limit, offset)

    // 获取统计数据
    let stats = null
    let dailyStats = null
    if (includeStats) {
      stats = await getTradeStats()
      dailyStats = await getDailyStats(7)
    }

    return NextResponse.json({
      success: true,
      data: {
        trades,
        stats,
        dailyStats,
        dbConnected: true,
      },
    })
  } catch (error: any) {
    console.error("获取交易历史失败:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
