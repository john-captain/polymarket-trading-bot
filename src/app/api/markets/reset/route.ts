/**
 * 市场数据重置 API
 * POST /api/markets/reset - 清空所有市场数据
 * DELETE /api/markets/reset - 删除旧数据
 */

import { NextRequest, NextResponse } from "next/server"
import {
  clearAllMarkets,
  deleteOldMarkets,
  cleanOldPriceHistory,
  getMarketsStats,
  getPriceHistoryStats,
} from "@/lib/database"

/**
 * POST - 清空所有市场数据
 * Body: { confirm: true } - 确认清空
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    
    if (!body.confirm) {
      return NextResponse.json({
        success: false,
        error: "需要确认清空操作",
        message: "请在请求体中传入 { confirm: true } 以确认清空",
      }, { status: 400 })
    }
    
    console.log("🔄 开始清空市场数据...")
    
    // 清空数据（表结构保留）
    const deleted = await clearAllMarkets()
    
    return NextResponse.json({
      success: true,
      message: `✅ 已清空 ${deleted} 条市场数据`,
      data: {
        action: "clear",
        deleted,
        timestamp: new Date().toISOString(),
      }
    })
  } catch (error: unknown) {
    console.error("清空市场数据失败:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "清空失败",
    }, { status: 500 })
  }
}

/**
 * DELETE - 删除旧数据（可选择性删除）
 * Query params:
 *   - olderThanDays: 删除多少天前的数据 (默认 30)
 *   - closedOnly: 只删除已关闭的市场 (true/false)
 *   - endedOnly: 只删除已结束的市场 (true/false)
 *   - inactiveOnly: 只删除非活跃的市场 (true/false)
 *   - clearPriceHistory: 是否同时清理价格历史 (true/false)
 *   - priceHistoryDays: 价格历史保留天数 (默认 7)
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    const olderThanDays = parseInt(searchParams.get("olderThanDays") || "30")
    const closedOnly = searchParams.get("closedOnly") === "true"
    const endedOnly = searchParams.get("endedOnly") === "true"
    const inactiveOnly = searchParams.get("inactiveOnly") === "true"
    const clearPriceHistory = searchParams.get("clearPriceHistory") === "true"
    const priceHistoryDays = parseInt(searchParams.get("priceHistoryDays") || "7")
    
    // 获取删除前的统计
    const beforeStats = await getMarketsStats()
    const beforePriceStats = await getPriceHistoryStats()
    
    // 删除旧市场数据
    const deletedMarkets = await deleteOldMarkets({
      olderThanDays,
      closedOnly,
      endedOnly,
      inactiveOnly,
    })
    
    // 可选：清理价格历史
    let deletedPriceHistory = 0
    if (clearPriceHistory) {
      deletedPriceHistory = await cleanOldPriceHistory(priceHistoryDays)
    }
    
    // 获取删除后的统计
    const afterStats = await getMarketsStats()
    const afterPriceStats = await getPriceHistoryStats()
    
    return NextResponse.json({
      success: true,
      message: `✅ 已清理旧数据`,
      data: {
        markets: {
          deleted: deletedMarkets,
          before: beforeStats.total,
          after: afterStats.total,
        },
        priceHistory: clearPriceHistory ? {
          deleted: deletedPriceHistory,
          before: beforePriceStats.totalRecords,
          after: afterPriceStats.totalRecords,
        } : null,
        options: {
          olderThanDays,
          closedOnly,
          endedOnly,
          inactiveOnly,
        },
        timestamp: new Date().toISOString(),
      }
    })
  } catch (error: unknown) {
    console.error("删除旧数据失败:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "删除失败",
    }, { status: 500 })
  }
}

/**
 * GET - 获取数据统计（便于决定是否清理）
 */
export async function GET() {
  try {
    const marketStats = await getMarketsStats()
    const priceHistoryStats = await getPriceHistoryStats()
    
    return NextResponse.json({
      success: true,
      data: {
        markets: marketStats,
        priceHistory: priceHistoryStats,
      }
    })
  } catch (error: unknown) {
    console.error("获取统计失败:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "获取统计失败",
    }, { status: 500 })
  }
}
