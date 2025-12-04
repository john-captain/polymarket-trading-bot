import { NextResponse } from "next/server"
import { botState } from "@/lib/bot-state"

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      isRunning: botState.isRunning,
      startTime: botState.startTime,
      tradesCount: botState.tradesCount,
      lastTrade: botState.lastTrade,
    },
  })
}
