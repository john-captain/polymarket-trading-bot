/**
 * 策略日志 API
 * 
 * GET - 获取策略日志
 */

import { NextResponse } from "next/server"
import { getStrategyLogs, getAllStrategyLogs } from "@/lib/strategies"
import type { StrategyType } from "@/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const strategyType = searchParams.get("type") as StrategyType | null
    const limitStr = searchParams.get("limit")
    const limit = limitStr ? parseInt(limitStr) : 100

    let logs
    if (strategyType) {
      const validTypes: StrategyType[] = ["MINT_SPLIT", "MARKET_MAKING"]
      if (!validTypes.includes(strategyType)) {
        return NextResponse.json(
          { success: false, error: `无效的策略类型: ${strategyType}` },
          { status: 400 }
        )
      }
      logs = getStrategyLogs(strategyType).slice(0, limit)
    } else {
      logs = getAllStrategyLogs(limit)
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })),
        count: logs.length,
      },
    })
  } catch (error: unknown) {
    console.error("获取策略日志失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
