/**
 * 交易执行服务 - 连接 Polymarket CLOB API 执行真实下单
 */

import { ClobClient, OrderType, Side } from "@polymarket/clob-client"
import { Wallet } from "@ethersproject/wallet"
import type { Market, TradeResult, TradeRecord } from "@/types"
import { addArbitrageLog, arbitrageState } from "./bot-state"

const CLOB_API = process.env.CLOB_API_URL || "https://clob.polymarket.com"
const CHAIN_ID = parseInt(process.env.POLYGON_CHAIN_ID || "137")

// 单例客户端
let clobClient: ClobClient | null = null

/**
 * 获取 CLOB 客户端（单例）
 */
function getClobClient(): ClobClient {
  if (!clobClient) {
    const privateKey = process.env.PRIVATE_KEY?.trim()
    if (!privateKey) {
      throw new Error("未配置 PRIVATE_KEY 环境变量")
    }

    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    const wallet = new Wallet(formattedKey)
    clobClient = new ClobClient(CLOB_API, CHAIN_ID, wallet)
  }
  return clobClient
}

/**
 * 获取订单簿最优价格
 */
async function getBestPrice(
  tokenId: string,
  side: "BUY" | "SELL"
): Promise<{ price: number; size: number } | null> {
  try {
    const client = getClobClient()
    const book = await client.getOrderBook(tokenId)

    if (side === "BUY") {
      // 买入看 asks（卖单）
      const asks = book.asks || []
      if (asks.length > 0) {
        return {
          price: parseFloat(asks[0].price),
          size: parseFloat(asks[0].size),
        }
      }
    } else {
      // 卖出看 bids（买单）
      const bids = book.bids || []
      if (bids.length > 0) {
        return {
          price: parseFloat(bids[0].price),
          size: parseFloat(bids[0].size),
        }
      }
    }
    return null
  } catch (error) {
    console.error("获取订单簿失败:", error)
    return null
  }
}

/**
 * 下单到指定 token
 */
async function placeOrder(
  tokenId: string,
  side: "BUY" | "SELL",
  amount: number,
  maxSlippage: number = 0.01
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const client = getClobClient()

    // 获取当前最优价格
    const bestPrice = await getBestPrice(tokenId, side)
    if (!bestPrice) {
      return { success: false, error: "无法获取订单簿价格" }
    }

    // 计算订单价格（含滑点保护）
    const slippageMultiplier = side === "BUY" ? 1 + maxSlippage : 1 - maxSlippage
    const orderPrice = bestPrice.price * slippageMultiplier

    // 计算份额
    const size = amount / bestPrice.price

    // 检查流动性
    if (bestPrice.size < size) {
      return {
        success: false,
        error: `流动性不足: 需要 ${size.toFixed(2)} 份，可用 ${bestPrice.size.toFixed(2)} 份`,
      }
    }

    addArbitrageLog(`📝 下单: ${side} ${size.toFixed(2)} 份 @ $${orderPrice.toFixed(4)}`)

    // 执行下单
    const order = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price: orderPrice,
        size: size,
        side: side === "BUY" ? Side.BUY : Side.SELL,
      },
      { tickSize: "0.001", negRisk: false },
      OrderType.GTC
    )

    return { success: true, orderId: order.orderID || order.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 执行套利交易
 *
 * LONG: 买入所有结果 (价格和 < 1)
 * SHORT: 卖出所有结果 (价格和 > 1)
 */
export async function executeArbitrageTrade(
  market: Market,
  tradeType: "LONG" | "SHORT",
  amount: number,
  maxSlippage: number = 0.01
): Promise<TradeResult> {
  const startTime = Date.now()

  addArbitrageLog(`🚀 开始执行 ${tradeType} 套利: ${market.question.slice(0, 50)}...`)
  addArbitrageLog(`💰 投入金额: $${amount.toFixed(2)}, 预期利润: $${market.estimatedProfit.toFixed(4)}`)

  // 验证市场有足够的 token
  if (market.tokens.length < 2) {
    return { success: false, error: "市场 token 数量不足" }
  }

  const side = tradeType === "LONG" ? "BUY" : "SELL"
  const perTokenAmount = amount / market.tokens.length

  // 并行下单到所有 token
  const orderPromises = market.tokens.map((token) =>
    placeOrder(token.tokenId, side, perTokenAmount, maxSlippage)
  )

  const results = await Promise.all(orderPromises)

  // 检查结果
  const successOrders = results.filter((r) => r.success)
  const failedOrders = results.filter((r) => !r.success)

  if (failedOrders.length > 0) {
    // 有订单失败，需要记录
    const errors = failedOrders.map((r) => r.error).join("; ")
    addArbitrageLog(`⚠️ 部分订单失败: ${errors}`)

    // 如果全部失败
    if (successOrders.length === 0) {
      return { success: false, error: errors }
    }
  }

  // 计算实际利润（简化计算）
  const actualProfit =
    tradeType === "LONG"
      ? amount * ((1 - market.priceSum) / market.priceSum)
      : amount * (market.priceSum - 1)

  // 更新统计
  arbitrageState.tradeCount++
  arbitrageState.totalProfit += actualProfit

  const duration = Date.now() - startTime
  addArbitrageLog(
    `✅ 套利完成! 成功订单: ${successOrders.length}/${market.tokens.length}, 利润: $${actualProfit.toFixed(4)}, 耗时: ${duration}ms`
  )

  return {
    success: true,
    actualProfit,
    txHash: successOrders.map((r) => r.orderId).join(","),
  }
}

/**
 * 模拟交易（不实际下单，用于测试）
 */
export async function simulateArbitrageTrade(
  market: Market,
  tradeType: "LONG" | "SHORT",
  amount: number
): Promise<TradeResult> {
  addArbitrageLog(`🧪 模拟 ${tradeType} 套利: ${market.question.slice(0, 50)}...`)

  // 模拟延迟
  await new Promise((resolve) => setTimeout(resolve, 500))

  const profit =
    tradeType === "LONG"
      ? amount * ((1 - market.priceSum) / market.priceSum)
      : amount * (market.priceSum - 1)

  addArbitrageLog(`✅ 模拟完成! 预计利润: $${profit.toFixed(4)}`)

  return {
    success: true,
    actualProfit: profit,
    txHash: `SIM_${Date.now()}`,
  }
}

/**
 * 检查是否有足够余额执行交易
 */
export async function checkBalance(requiredAmount: number): Promise<{
  sufficient: boolean
  balance: number
  error?: string
}> {
  try {
    // 调用余额 API
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/balance`)
    const data = await response.json()

    if (!data.success) {
      return { sufficient: false, balance: 0, error: data.error }
    }

    const balance = data.data.usdc || 0
    const sufficient = balance >= requiredAmount

    if (!sufficient) {
      return {
        sufficient: false,
        balance,
        error: `余额不足: 需要 $${requiredAmount.toFixed(2)}, 当前 $${balance.toFixed(2)}`,
      }
    }

    return { sufficient: true, balance }
  } catch (error: any) {
    return { sufficient: false, balance: 0, error: error.message }
  }
}
