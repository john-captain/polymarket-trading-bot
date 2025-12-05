/**
 * 策略机会 API
 * 
 * GET - 获取各策略发现的机会
 */

import { NextResponse } from "next/server"
import {
  getMintSplitOpportunities,
  getMarketMakingMarkets,
  getMarketMakingSummary,
} from "@/lib/strategies"
import type { StrategyType } from "@/types"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const strategyType = searchParams.get("type") as StrategyType | null

    if (strategyType) {
      switch (strategyType) {
        case "MINT_SPLIT":
          return NextResponse.json({
            success: true,
            data: {
              type: "MINT_SPLIT",
              opportunities: getMintSplitOpportunities(),
            },
          })

        case "MARKET_MAKING":
          return NextResponse.json({
            success: true,
            data: {
              type: "MARKET_MAKING",
              markets: getMarketMakingMarkets(),
              summary: getMarketMakingSummary(),
            },
          })

        default:
          return NextResponse.json(
            { success: false, error: `无效的策略类型: ${strategyType}` },
            { status: 400 }
          )
      }
    }

    // 返回所有策略的机会概览
    return NextResponse.json({
      success: true,
      data: {
        mintSplit: {
          count: getMintSplitOpportunities().length,
          topOpportunities: getMintSplitOpportunities().slice(0, 5),
        },
        marketMaking: {
          ...getMarketMakingSummary(),
          markets: getMarketMakingMarkets(),
        },
      },
    })
  } catch (error: unknown) {
    console.error("获取策略机会失败:", error)
    const message = error instanceof Error ? error.message : "未知错误"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
