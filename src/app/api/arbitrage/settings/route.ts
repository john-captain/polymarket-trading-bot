import { NextResponse } from "next/server"
import { arbitrageSettings, MARKET_CATEGORIES } from "@/lib/bot-state"

export async function GET() {
  return NextResponse.json({
    success: true,
    data: arbitrageSettings,
    categories: MARKET_CATEGORIES,
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
    if (body.minVolumeFilter !== undefined) {
      arbitrageSettings.minVolumeFilter = parseFloat(body.minVolumeFilter)
    }
    if (body.minLiquidity !== undefined) {
      arbitrageSettings.minLiquidity = parseFloat(body.minLiquidity)
    }
    if (body.category !== undefined) {
      arbitrageSettings.category = body.category
    }
    if (body.excludeRestricted !== undefined) {
      arbitrageSettings.excludeRestricted = body.excludeRestricted
    }
    if (body.onlyWithOrderbook !== undefined) {
      arbitrageSettings.onlyWithOrderbook = body.onlyWithOrderbook
    }
    if (body.maxOutcomes !== undefined) {
      arbitrageSettings.maxOutcomes = parseInt(body.maxOutcomes)
    }

    return NextResponse.json({
      success: true,
      data: arbitrageSettings,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}
