import { NextResponse } from "next/server"
import { Wallet } from "@ethersproject/wallet"
import { ClobClient, Side, OrderType, ApiKeyCreds } from "@polymarket/clob-client"

// 获取或派生 API 凭证
async function getApiCreds(client: ClobClient): Promise<ApiKeyCreds> {
  // 检查环境变量中是否有 API 凭证
  const key = process.env.CLOB_API_KEY
  const secret = process.env.CLOB_SECRET
  const passphrase = process.env.CLOB_PASSPHRASE

  if (key && secret && passphrase) {
    return { key, secret, passphrase }
  }

  // 如果没有，则派生新的凭证
  console.log("⚠️ 未找到 API 凭证，正在派生...")
  const creds = await client.createOrDeriveApiKey()
  console.log("✅ API 凭证已派生")
  return creds
}

// 执行测试交易
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tokenId, side, amount, price, tickSize = "0.01", negRisk = false } = body

    if (!tokenId || !side || !amount || !price) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数: tokenId, side, amount, price" },
        { status: 400 }
      )
    }

    const privateKey = (process.env.PRIVATE_KEY || "").replace(/[\s\r\n]/g, "")
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: "未配置私钥" },
        { status: 400 }
      )
    }

    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    const wallet = new Wallet(formattedKey)
    
    // Polymarket Proxy 地址 (Funder)
    const funder = process.env.POLYMARKET_PROXY_ADDRESS || ""
    // 签名类型: 0=Browser Wallet, 1=Magic/Email, 2=Browser Wallet with Proxy
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0")

    console.log(`\n📝 执行测试交易:`)
    console.log(`   钱包: ${wallet.address}`)
    console.log(`   Funder: ${funder || "(未设置)"}`)
    console.log(`   签名类型: ${signatureType}`)
    console.log(`   代币: ${tokenId.slice(0, 20)}...`)
    console.log(`   方向: ${side}`)
    console.log(`   金额: $${amount}`)
    console.log(`   价格: $${price}`)

    // 创建初始客户端（用于获取凭证）
    const initClient = new ClobClient(
      process.env.CLOB_API_URL || "https://clob.polymarket.com",
      137,
      wallet
    )

    // 获取 API 凭证
    const creds = await getApiCreds(initClient)

    // 创建带凭证的客户端
    const client = funder 
      ? new ClobClient(
          process.env.CLOB_API_URL || "https://clob.polymarket.com",
          137,
          wallet,
          creds,
          signatureType,
          funder
        )
      : new ClobClient(
          process.env.CLOB_API_URL || "https://clob.polymarket.com",
          137,
          wallet,
          creds
        )

    // 计算份额
    const shares = amount / price

    // 下单方向
    const orderSide = side.toUpperCase() === "BUY" ? Side.BUY : Side.SELL
    
    console.log(`   份额: ${shares.toFixed(4)}`)
    console.log(`   tickSize: ${tickSize}`)
    console.log(`   negRisk: ${negRisk}`)
    console.log(`⏳ 正在下单...`)

    // 使用 createAndPostOrder (GTC限价单)
    const result = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price: price,
        size: shares,
        side: orderSide,
      },
      { tickSize, negRisk },
      OrderType.GTC
    )

    console.log(`✅ 下单成功: ${result.orderID || JSON.stringify(result)}`)

    return NextResponse.json({
      success: true,
      data: {
        orderId: result.orderID,
        tokenId,
        side,
        amount,
        price,
        shares,
        status: "submitted",
        result,
      },
      message: "测试订单已提交",
    })
  } catch (error: any) {
    console.error("❌ 测试交易错误:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: error.response?.data || null,
      },
      { status: 500 }
    )
  }
}

// 取消订单
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "缺少 orderId" },
        { status: 400 }
      )
    }

    const privateKey = (process.env.PRIVATE_KEY || "").replace(/[\s\r\n]/g, "")
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: "未配置私钥" },
        { status: 400 }
      )
    }

    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    const wallet = new Wallet(formattedKey)
    
    const funder = process.env.POLYMARKET_PROXY_ADDRESS || ""
    const signatureType = parseInt(process.env.SIGNATURE_TYPE || "0")

    // 创建初始客户端
    const initClient = new ClobClient(
      process.env.CLOB_API_URL || "https://clob.polymarket.com",
      137,
      wallet
    )

    // 获取 API 凭证
    const creds = await getApiCreds(initClient)

    // 创建带凭证的客户端
    const client = funder 
      ? new ClobClient(
          process.env.CLOB_API_URL || "https://clob.polymarket.com",
          137,
          wallet,
          creds,
          signatureType,
          funder
        )
      : new ClobClient(
          process.env.CLOB_API_URL || "https://clob.polymarket.com",
          137,
          wallet,
          creds
        )

    console.log(`🗑️ 取消订单: ${orderId}`)

    await client.cancelOrder({ orderID: orderId })

    console.log(`✅ 订单已取消`)

    return NextResponse.json({
      success: true,
      message: "订单已取消",
      orderId,
    })
  } catch (error: any) {
    console.error("❌ 取消订单错误:", error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
