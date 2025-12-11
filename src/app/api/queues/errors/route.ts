/**
 * GET /api/queues/errors - 获取队列错误详情
 */

import { NextResponse } from "next/server"
import { getScanQueue } from "@/lib/queue"

export async function GET() {
  try {
    const scanQueue = getScanQueue()
    const status = scanQueue.getStatus()
    
    return NextResponse.json({
      success: true,
      data: {
        scan: {
          errorCount: status.errorCount,
          state: status.state,
          processedCount: status.processedCount,
          lastTaskAt: status.lastTaskAt,
        },
        message: status.errorCount > 0 
          ? `扫描队列有 ${status.errorCount} 个错误，请查看控制台日志获取详细信息`
          : '无错误'
      }
    })
  } catch (error) {
    console.error("获取队列错误信息失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "未知错误" 
      },
      { status: 500 }
    )
  }
}
