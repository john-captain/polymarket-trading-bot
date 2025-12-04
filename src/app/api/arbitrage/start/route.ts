import { NextResponse } from "next/server"
import { arbitrageState, addArbitrageLog, arbitrageSettings } from "@/lib/bot-state"
import { scanMarkets } from "@/lib/arbitrage-scanner"

export async function POST() {
  if (arbitrageState.isRunning) {
    return NextResponse.json({ success: false, error: "扫描已在运行" })
  }

  arbitrageState.isRunning = true
  arbitrageState.startTime = new Date()
  addArbitrageLog("✅ 套利扫描已启动")

  // 启动定时扫描
  const runScan = async () => {
    if (!arbitrageState.isRunning) return
    
    try {
      await scanMarkets()
    } catch (error: any) {
      addArbitrageLog(`❌ 扫描错误: ${error.message}`)
    }
  }

  // 立即执行一次
  runScan()

  // 设置定时器
  arbitrageState.scanInterval = setInterval(runScan, arbitrageSettings.scanInterval)

  return NextResponse.json({
    success: true,
    message: "套利扫描已启动",
  })
}
