/**
 * 套利交易执行 API
 * POST /api/arbitrage/execute
 *
 * 执行真实或模拟套利交易
 */

import { NextResponse } from "next/server"
import {
  executeArbitrageTrade,
  simulateArbitrageTrade,
  checkBalance,
} from "@/lib/trade-executor"
import { saveTradeRecord, updateTradeStatus } from "@/lib/database"
import { addArbitrageLog } from "@/lib/bot-state"
import type { Market, TradeRecord } from "@/types"

interface ExecuteRequest {
  market: Market
  tradeType: "LONG" | "SHORT"
  amount: number
  simulate?: boolean // 是否模拟执行
}

export async function POST(request: Request) {
  try {
    const body: ExecuteRequest = await request.json()
    const { market, tradeType, amount, simulate = false } = body

    // 参数验证
    if (!market || !tradeType || !amount) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数: market, tradeType, amount" },
        { status: 400 }
      )
    }

    if (amount < 1) {
      return NextResponse.json(
        { success: false, error: "交易金额不能小于 $1" },
        { status: 400 }
      )
    }

    if (amount > 1000) {
      return NextResponse.json(
        { success: false, error: "单笔交易金额不能超过 $1000" },
        { status: 400 }
      )
    }

    addArbitrageLog(`📨 收到 ${simulate ? "模拟" : "真实"} ${tradeType} 交易请求: $${amount}`)

    // 检查余额（真实交易时）
    if (!simulate) {
      const balanceCheck = await checkBalance(amount)
      if (!balanceCheck.sufficient) {
        return NextResponse.json(
          {
            success: false,
            error: balanceCheck.error || "余额不足",
            balance: balanceCheck.balance,
          },
          { status: 400 }
        )
      }
    }

    // 创建初始交易记录
    const tradeRecord: TradeRecord = {
      marketQuestion: market.question,
      conditionId: market.conditionId,
      tradeType,
      totalInvestment: amount,
      expectedProfit: market.estimatedProfit,
      status: "PENDING",
    }

    let tradeId: number | undefined

    try {
      // 保存到数据库
      tradeId = await saveTradeRecord(tradeRecord)
      addArbitrageLog(`💾 交易记录已创建: ID=${tradeId}`)
    } catch (dbError) {
      console.error("数据库保存失败:", dbError)
      // 数据库失败不阻止交易，继续执行
    }

    // 执行交易
    const result = simulate
      ? await simulateArbitrageTrade(market, tradeType, amount)
      : await executeArbitrageTrade(market, tradeType, amount)

    // 更新交易记录
    if (tradeId) {
      try {
        await updateTradeStatus(
          tradeId,
          result.success ? "SUCCESS" : "FAILED",
          result.actualProfit,
          result.txHash,
          result.error
        )
      } catch (dbError) {
        console.error("更新交易状态失败:", dbError)
      }
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          tradeId,
          txHash: result.txHash,
          actualProfit: result.actualProfit,
          message: simulate
            ? `模拟交易成功，预计利润: $${result.actualProfit?.toFixed(4)}`
            : `交易执行成功，利润: $${result.actualProfit?.toFixed(4)}`,
        },
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "交易执行失败",
          tradeId,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("执行交易 API 错误:", error)
    addArbitrageLog(`❌ 交易 API 错误: ${error.message}`)
    return NextResponse.json(
      { success: false, error: error.message || "服务器内部错误" },
      { status: 500 }
    )
  }
}
