/**
 * 策略管理 API
 * 
 * GET - 获取所有策略状态
 * POST - 启动/停止策略
 */

import { NextResponse } from "next/server"
import {
  getAllStrategyStats,
  getOverallStats,
  startStrategy,
  stopStrategy,
  strategyDescriptions,
} from "@/lib/strategies"
import type { StrategyType } from "@/types"

export async function GET() {
  try {
    const stats = getAllStrategyStats()
    const overall = getOverallStats()

    return NextResponse.json({
      success: true,
      data: {
        strategies: Object.entries(stats).map(([type, stat]) => ({
          type,
          ...stat,
          ...strategyDescriptions[type as StrategyType],
        })),
        overall,
      },
    })
  } catch (error: unknown) {
    console.error("获取策略状态失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, strategyType, settings } = body

    if (!strategyType) {
      return NextResponse.json(
        { success: false, error: "缺少 strategyType 参数" },
        { status: 400 }
      )
    }

    const validTypes: StrategyType[] = ["MINT_SPLIT", "MARKET_MAKING"]
    if (!validTypes.includes(strategyType)) {
      return NextResponse.json(
        { success: false, error: `无效的策略类型: ${strategyType}` },
        { status: 400 }
      )
    }

    const typedStrategyType = strategyType as StrategyType

    switch (action) {
      case "start":
        startStrategy(typedStrategyType, settings)
        return NextResponse.json({
          success: true,
          message: `策略 ${strategyDescriptions[typedStrategyType].name} 已启动`,
        })

      case "stop":
        await stopStrategy(typedStrategyType)
        return NextResponse.json({
          success: true,
          message: `策略 ${strategyDescriptions[typedStrategyType].name} 已停止`,
        })

      default:
        return NextResponse.json(
          { success: false, error: `无效的操作: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: unknown) {
    console.error("策略操作失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
