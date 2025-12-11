import { NextResponse } from "next/server"
import { arbitrageState } from "@/lib/bot-state"

export async function GET() {
  return NextResponse.json({
    success: true,
    data: arbitrageState.logs,
  })
}
