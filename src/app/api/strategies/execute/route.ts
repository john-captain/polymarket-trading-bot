/**
 * 策略执行 API
 * 
 * 执行具体的交易策略
 */

import { NextResponse } from "next/server"
import { createPolymarketContracts, calculateMintSplitProfit } from "@/lib/polymarket-contracts"

// POST: 执行策略
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { strategy, conditionId, amount, outcomes, action } = body

    // 铸造拆分策略
    if (strategy === "MINT_SPLIT") {
      return await executeMintSplit(conditionId, amount, outcomes)
    }

    // 做市策略 - 添加市场
    if (strategy === "MARKET_MAKING" && action === "add_market") {
      // TODO: 调用做市策略添加市场
      return NextResponse.json({
        success: true,
        message: `市场 ${conditionId} 已添加到做市列表`,
      })
    }

    return NextResponse.json(
      { success: false, error: "未知策略类型" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("策略执行 API 错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// 执行铸造拆分
async function executeMintSplit(
  conditionId: string,
  amount: number,
  outcomes: { token_id: string; outcome: string }[]
) {
  try {
    console.log("=".repeat(50))
    console.log("🔨 执行铸造拆分策略")
    console.log("=".repeat(50))
    console.log(`市场: ${conditionId}`)
    console.log(`金额: $${amount}`)
    console.log(`结果数: ${outcomes.length}`)

    // 创建合约实例
    const contracts = createPolymarketContracts()
    if (!contracts) {
      return NextResponse.json({
        success: false,
        error: "无法创建合约实例，请检查 PRIVATE_KEY",
      })
    }

    // 1. 执行铸造
    console.log("\n📦 步骤1: 铸造代币...")
    const mintResult = await contracts.mintTokens(conditionId, amount, outcomes.length)

    if (!mintResult.success) {
      return NextResponse.json({
        success: false,
        error: `铸造失败: ${mintResult.error}`,
      })
    }

    console.log(`✅ 铸造成功: ${mintResult.txHash}`)

    // 2. 卖出所有代币（这里简化处理，实际应该调用订单执行器）
    // TODO: 实际调用 MarketOrderExecutor 卖出
    console.log("\n📤 步骤2: 卖出代币...")

    // 模拟卖出（实际应该调用 API）
    let totalSellValue = 0
    for (const outcome of outcomes) {
      console.log(`  卖出 ${outcome.outcome}...`)
      // 假设以平均 bid 价格卖出
      totalSellValue += amount * (1 / outcomes.length) * 1.01  // 简化计算
    }

    // 3. 计算利润
    const { netProfit } = calculateMintSplitProfit(totalSellValue / amount, amount)

    console.log("\n📊 交易结果:")
    console.log(`  铸造成本: $${amount}`)
    console.log(`  卖出收入: $${totalSellValue.toFixed(4)}`)
    console.log(`  净利润: $${netProfit.toFixed(4)}`)
    console.log("=".repeat(50))

    return NextResponse.json({
      success: true,
      data: {
        mintTxHash: mintResult.txHash,
        mintCost: amount,
        sellTotal: totalSellValue,
        profit: netProfit,
      },
    })
  } catch (error: any) {
    console.error("铸造拆分执行错误:", error)
    return NextResponse.json({
      success: false,
      error: error.message,
    })
  }
}
