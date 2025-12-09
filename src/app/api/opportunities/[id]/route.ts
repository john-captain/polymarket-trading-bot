/**
 * 单个机会详情 API
 * GET /api/opportunities/[id] - 获取机会详情
 */

import { NextRequest, NextResponse } from "next/server"
import { getOpportunityById } from "@/lib/database"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const opportunityId = parseInt(id)
    
    if (isNaN(opportunityId)) {
      return NextResponse.json(
        { success: false, error: "无效的机会 ID" },
        { status: 400 }
      )
    }

    const opportunity = await getOpportunityById(opportunityId)
    
    if (!opportunity) {
      return NextResponse.json(
        { success: false, error: "机会不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: opportunity,
    })
  } catch (error: unknown) {
    console.error("获取机会详情失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "获取机会详情失败" },
      { status: 500 }
    )
  }
}
