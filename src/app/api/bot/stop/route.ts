import { NextResponse } from "next/server"
import { botState, addSystemLog } from "@/lib/bot-state"

export async function POST() {
  if (!botState.isRunning) {
    return NextResponse.json({ success: false, error: "机器人未运行" })
  }

  botState.isRunning = false
  addSystemLog("⏹️ 机器人已停止")

  return NextResponse.json({
    success: true,
    message: "机器人已停止",
  })
}
