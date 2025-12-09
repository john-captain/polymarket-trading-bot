/**
 * 市场列表 API
 * GET /api/markets - 获取已同步的市场列表
 */

import { NextRequest, NextResponse } from "next/server"
import { getMarkets, initMarketsTable } from "@/lib/database"
import { parseUrlParams, buildDbParams, getSortConfig } from "@/lib/filter-config"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // 使用统一配置解析参数
    const filters = parseUrlParams(searchParams)
    const dbParams = buildDbParams(filters)
    
    // 限制最大数量
    const limit = Math.min(filters.limit || 50, 100)
    
    // 确保表存在
    await initMarketsTable()
    
    const result = await getMarkets({
      ...dbParams,
      limit,
    })
    
    return NextResponse.json({
      success: true,
      data: result.markets,
      pagination: {
        total: result.total,
        limit,
        offset: filters.offset || 0,
        hasMore: (filters.offset || 0) + result.markets.length < result.total,
      },
    })
    
  } catch (error: any) {
    console.error("❌ 获取市场列表错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
