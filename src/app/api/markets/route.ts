/**
 * 市场列表 API
 * GET /api/markets - 获取已同步的市场列表
 */

import { NextRequest, NextResponse } from "next/server"
import { getMarkets, initMarketsTable } from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")
    const active = searchParams.get("active")
    const category = searchParams.get("category") || undefined
    const search = searchParams.get("search") || undefined
    const orderBy = searchParams.get("orderBy") || "updated_at"
    const orderDir = (searchParams.get("orderDir") || "DESC").toUpperCase() as 'ASC' | 'DESC'
    
    // 确保表存在
    await initMarketsTable()
    
    const result = await getMarkets({
      limit,
      offset,
      active: active === "true" ? true : active === "false" ? false : undefined,
      category,
      search,
      orderBy,
      orderDir,
    })
    
    return NextResponse.json({
      success: true,
      data: result.markets,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + result.markets.length < result.total,
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
