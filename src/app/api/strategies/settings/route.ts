/**
 * 策略设置 API
 * 
 * GET - 获取策略设置
 * PUT - 更新策略设置
 */

import { NextResponse } from "next/server"
import { getStrategySettings, updateStrategySettings, getDefaultConfig } from "@/lib/strategies"
import type { StrategyType } from "@/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const strategyType = searchParams.get("type") as StrategyType | null

    if (strategyType) {
      const validTypes: StrategyType[] = ["MINT_SPLIT", "MARKET_MAKING"]
      if (!validTypes.includes(strategyType)) {
        return NextResponse.json(
          { success: false, error: `无效的策略类型: ${strategyType}` },
          { status: 400 }
        )
      }

      const settings = getStrategySettings(strategyType)
      return NextResponse.json({
        success: true,
        data: {
          type: strategyType,
          settings,
        },
      })
    }

    // 返回所有策略的设置
    const config = getDefaultConfig()
    return NextResponse.json({
      success: true,
      data: {
        mintSplit: getStrategySettings("MINT_SPLIT"),
        marketMaking: getStrategySettings("MARKET_MAKING"),
        defaults: config,
      },
    })
  } catch (error: unknown) {
    console.error("获取策略设置失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { strategyType, settings } = body

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

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { success: false, error: "缺少 settings 参数" },
        { status: 400 }
      )
    }

    updateStrategySettings(strategyType as StrategyType, settings)

    return NextResponse.json({
      success: true,
      message: "设置已更新",
      data: getStrategySettings(strategyType as StrategyType),
    })
  } catch (error: unknown) {
    console.error("更新策略设置失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
