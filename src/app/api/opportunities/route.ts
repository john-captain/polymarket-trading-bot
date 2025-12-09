/**
 * 机会列表 API
 * GET /api/opportunities - 获取机会列表
 */

import { NextRequest, NextResponse } from "next/server"
import { 
  getOpportunities, 
  getOpportunityStats,
  getTodayOpportunityStats,
  type OpportunityStrategyType,
  type OpportunityStatus,
} from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const strategyType = searchParams.get('strategy') as OpportunityStrategyType | null
    const status = searchParams.get('status') as OpportunityStatus | null
    const conditionId = searchParams.get('conditionId')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 获取机会列表
    const opportunities = await getOpportunities({
      strategyType: strategyType || undefined,
      status: status || undefined,
      conditionId: conditionId || undefined,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      limit,
      offset,
    })

    // 获取统计数据
    const stats = await getOpportunityStats({
      strategyType: strategyType || undefined,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    })

    // 获取今日统计
    const todayStats = await getTodayOpportunityStats(strategyType || undefined)

    return NextResponse.json({
      success: true,
      data: {
        opportunities,
        total: stats.total,
        stats: {
          pending: stats.pending,
          queued: stats.queued,
          executing: stats.executing,
          success: stats.success,
          failed: stats.failed,
          partial: stats.partial,
          expired: stats.expired,
          cancelled: stats.cancelled,
          successRate: stats.successRate,
          totalExpectedProfit: stats.totalExpectedProfit,
          totalActualProfit: stats.totalActualProfit,
        },
        today: todayStats,
      },
    })
  } catch (error: unknown) {
    console.error("获取机会列表失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "获取机会列表失败" },
      { status: 500 }
    )
  }
}
