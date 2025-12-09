/**
 * 市场统计 API
 * GET /api/markets/sync - 获取数据库中已同步的市场统计信息
 */

import { NextResponse } from "next/server"
import { 
  initMarketsTable, 
  getMarketsStats,
} from "@/lib/database"

/**
 * GET - 获取同步状态和统计
 */
export async function GET() {
  try {
    // 确保表存在
    await initMarketsTable()
    
    const stats = await getMarketsStats()
    
    return NextResponse.json({
      success: true,
      data: stats,
    })
    
  } catch (error: any) {
    console.error("❌ 获取市场统计错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
