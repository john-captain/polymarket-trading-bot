/**
 * 策略配置 API
 * GET /api/strategies/config - 获取所有策略配置
 * POST /api/strategies/config - 更新策略配置
 */

import { NextRequest, NextResponse } from "next/server"
import { getStrategyConfigManager } from "@/lib/queue"
import { saveStrategyConfig, getAllStrategyConfigs } from "@/lib/database"

export async function GET() {
  try {
    const configManager = getStrategyConfigManager()
    const config = configManager.getConfig()
    
    return NextResponse.json({
      success: true,
      data: config,
    })
  } catch (error: unknown) {
    console.error("获取策略配置失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "获取策略配置失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { strategy, config } = body as { 
      strategy: 'mintSplit' | 'arbitrage' | 'marketMaking' | 'global'
      config: Record<string, any>
    }

    if (!strategy || !config) {
      return NextResponse.json(
        { success: false, error: "缺少 strategy 或 config 参数" },
        { status: 400 }
      )
    }

    const configManager = getStrategyConfigManager()
    
    // 更新内存配置
    configManager.updateConfig({
      [strategy]: config,
    })
    
    // 持久化到数据库 (除了全局配置)
    if (strategy !== 'global') {
      const strategyTypeMap: Record<string, string> = {
        mintSplit: 'MINT_SPLIT',
        arbitrage: 'ARBITRAGE_LONG', // 会同时保存 LONG 和 SHORT
        marketMaking: 'MARKET_MAKING',
      }
      const dbStrategyType = strategyTypeMap[strategy]
      if (dbStrategyType) {
        await saveStrategyConfig(
          dbStrategyType,
          config.enabled ?? true,
          config
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: `${strategy} 策略配置已更新`,
      data: configManager.getConfig(),
    })
  } catch (error: unknown) {
    console.error("更新策略配置失败:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "更新策略配置失败" },
      { status: 500 }
    )
  }
}
