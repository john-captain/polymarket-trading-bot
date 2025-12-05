/**
 * 统一扫描 API
 * 
 * 单次扫描所有市场，根据策略配置分发机会
 */

import { NextResponse } from "next/server"
import {
  runUnifiedScan,
  getDispatcherState,
  getStrategyConfig,
  updateStrategyConfig,
  getDispatcherLogs,
  triggerExecution,
  type StrategyConfig,
  type ScannedMarket,
} from "@/lib/strategy-dispatcher"

// GET: 获取调度器状态和配置
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")

  if (type === "config") {
    return NextResponse.json({
      success: true,
      data: {
        config: getStrategyConfig(),
      },
    })
  }

  if (type === "logs") {
    return NextResponse.json({
      success: true,
      data: {
        logs: getDispatcherLogs().slice(0, 100),
      },
    })
  }

  // 默认返回状态
  const state = getDispatcherState()
  return NextResponse.json({
    success: true,
    data: {
      isRunning: state.isRunning,
      lastScanTime: state.lastScanTime,
      scanCount: state.scanCount,
      totalOpportunities: state.totalOpportunities,
      executedTrades: state.executedTrades,
      totalProfit: state.totalProfit,
      config: getStrategyConfig(),
    },
  })
}

// POST: 执行扫描或更新配置
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body

    // 执行统一扫描
    if (action === "scan") {
      const result = await runUnifiedScan()
      
      return NextResponse.json({
        success: result.success,
        data: {
          scannedCount: result.scannedCount,
          opportunityCount: result.opportunities.length,
          opportunities: result.opportunities.slice(0, 50), // 只返回前50个
          byStrategy: result.byStrategy,
        },
      })
    }

    // 更新策略配置
    if (action === "updateConfig") {
      const { config } = body as { config: Partial<StrategyConfig> }
      updateStrategyConfig(config)
      
      return NextResponse.json({
        success: true,
        message: "配置已更新",
        data: { config: getStrategyConfig() },
      })
    }

    // 手动触发执行
    if (action === "execute") {
      const { market, strategy } = body as { market: ScannedMarket; strategy: string }
      triggerExecution(market, strategy)
      
      return NextResponse.json({
        success: true,
        message: `已将 ${strategy} 加入执行队列`,
      })
    }

    return NextResponse.json(
      { success: false, error: "未知操作" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("统一扫描 API 错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
