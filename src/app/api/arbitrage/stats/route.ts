import { NextResponse } from "next/server"
import { arbitrageState, arbitrageSettings } from "@/lib/bot-state"

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      isRunning: arbitrageState.isRunning,
      startTime: arbitrageState.startTime,
      scanCount: arbitrageState.scanCount,
      opportunityCount: arbitrageState.opportunityCount,
      tradeCount: arbitrageState.tradeCount,
      totalProfit: arbitrageState.totalProfit,
      totalMarketCount: arbitrageState.totalMarketCount,
      filteredMarketCount: arbitrageState.filteredMarketCount,
      settings: arbitrageSettings,
    },
  })
}
