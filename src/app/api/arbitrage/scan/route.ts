import { NextResponse } from "next/server"
import { scanMarkets } from "@/lib/arbitrage-scanner"
import { arbitrageState } from "@/lib/bot-state"

export async function POST() {
  try {
    await scanMarkets()
    
    return NextResponse.json({
      success: true,
      data: {
        scanCount: arbitrageState.scanCount,
        opportunityCount: arbitrageState.opportunityCount,
        marketCount: arbitrageState.markets.length,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
