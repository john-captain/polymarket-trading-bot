import { NextResponse } from "next/server"
import { arbitrageSettings } from "@/lib/bot-state"

export async function GET() {
  return NextResponse.json({
    success: true,
    data: arbitrageSettings,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    if (body.minSpread !== undefined) {
      arbitrageSettings.minSpread = parseFloat(body.minSpread)
    }
    if (body.tradeAmount !== undefined) {
      arbitrageSettings.tradeAmount = parseFloat(body.tradeAmount)
    }
    if (body.scanInterval !== undefined) {
      arbitrageSettings.scanInterval = parseInt(body.scanInterval)
    }
    if (body.autoTrade !== undefined) {
      arbitrageSettings.autoTrade = body.autoTrade
    }

    return NextResponse.json({
      success: true,
      data: arbitrageSettings,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}
