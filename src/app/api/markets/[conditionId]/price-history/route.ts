/**
 * 市场价格历史 API
 * 
 * GET /api/markets/[conditionId]/price-history
 * 返回指定市场的价格历史记录
 */

import { NextResponse } from "next/server"
import { getPriceHistory } from "@/lib/database"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conditionId: string }> }
) {
  try {
    const { conditionId } = await params
    const { searchParams } = new URL(request.url)
    
    // 解析查询参数
    const limit = parseInt(searchParams.get("limit") || "100")
    const startTime = searchParams.get("startTime")
    const endTime = searchParams.get("endTime")
    
    // 获取价格历史
    const history = await getPriceHistory(conditionId, {
      limit,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    })
    
    return NextResponse.json({
      success: true,
      data: {
        conditionId,
        count: history.length,
        history,
      },
    })
  } catch (error: unknown) {
    console.error("获取价格历史失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
