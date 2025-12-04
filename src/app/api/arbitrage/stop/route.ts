import { NextResponse } from "next/server"
import { arbitrageState, addArbitrageLog } from "@/lib/bot-state"

export async function POST() {
  if (!arbitrageState.isRunning) {
    return NextResponse.json({ success: false, error: "扫描未运行" })
  }

  // 清除定时器
  if (arbitrageState.scanInterval) {
    clearInterval(arbitrageState.scanInterval)
    arbitrageState.scanInterval = null
  }

  arbitrageState.isRunning = false
  addArbitrageLog("⏹️ 套利扫描已停止")

  return NextResponse.json({
    success: true,
    message: "套利扫描已停止",
  })
}
