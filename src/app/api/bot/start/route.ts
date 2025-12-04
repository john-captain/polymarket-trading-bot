import { NextResponse } from "next/server"
import { botState, addSystemLog } from "@/lib/bot-state"

export async function POST() {
  if (botState.isRunning) {
    return NextResponse.json({ success: false, error: "机器人已在运行" })
  }

  botState.isRunning = true
  botState.startTime = new Date()
  addSystemLog("✅ 机器人已启动")

  return NextResponse.json({
    success: true,
    message: "机器人已启动",
  })
}
