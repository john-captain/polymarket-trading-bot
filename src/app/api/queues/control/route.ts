/**
 * 队列控制 API
 * POST /api/queues/control - 启动/停止/暂停/恢复队列
 */

import { NextRequest, NextResponse } from "next/server"
import { startQueueSystem, stopQueueSystem, initStrategyQueueSystem, getScanQueue, getStorageQueue } from "@/lib/queue"
import { initApiClients } from "@/lib/api-client"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body as { action: string }

    switch (action) {
      case 'start': {
        // 初始化 API 客户端（设置日志存储）
        await initApiClients()
        
        // 初始化完整队列系统
        initStrategyQueueSystem()
        await startQueueSystem()
        return NextResponse.json({
          success: true,
          message: "队列系统已启动",
        })
      }
      
      case 'stop': {
        await stopQueueSystem()
        return NextResponse.json({
          success: true,
          message: "队列系统已停止",
        })
      }
      
      case 'pause': {
        const scanQueue = getScanQueue()
        await scanQueue.stop()
        return NextResponse.json({
          success: true,
          message: "扫描已暂停",
        })
      }
      
      case 'resume': {
        const scanQueue = getScanQueue()
        await scanQueue.start()
        return NextResponse.json({
          success: true,
          message: "扫描已恢复",
        })
      }
      
      case 'flush': {
        const storageQueue = getStorageQueue()
        await storageQueue.flush()
        return NextResponse.json({
          success: true,
          message: "存储队列已刷新",
        })
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `未知操作: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    console.error("队列控制失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "队列控制失败" },
      { status: 500 }
    )
  }
}
