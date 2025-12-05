import { NextResponse } from "next/server"
import { Wallet } from "@ethersproject/wallet"
import axios from "axios"
import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"

const CLOB_API = "https://clob.polymarket.com"
const GAMMA_API = "https://gamma-api.polymarket.com"

// 创建代理 agent
function getProxyAgent() {
  const socksProxy = process.env.SOCKS_PROXY
  if (socksProxy) {
    return new SocksProxyAgent(socksProxy)
  }
  const httpProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (httpProxy) {
    return new HttpsProxyAgent(httpProxy)
  }
  return undefined
}

// 从 CLOB API 获取用户持仓
async function fetchPositionsFromCLOB(address: string) {
  const proxyAgent = getProxyAgent()
  
  try {
    // 获取用户的所有持仓
    const response = await axios.get(`${CLOB_API}/positions`, {
      params: { user: address },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 15000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })
    
    return response.data || []
  } catch (error: any) {
    console.error("获取持仓失败:", error.message)
    return []
  }
}

// 从 Gamma API 获取市场信息
async function fetchMarketInfo(conditionId: string) {
  const proxyAgent = getProxyAgent()
  
  try {
    const response = await axios.get(`${GAMMA_API}/markets`, {
      params: { condition_id: conditionId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 10000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })
    
    const markets = response.data || []
    return markets[0] || null
  } catch (error) {
    return null
  }
}

// 从订单簿获取当前价格
async function fetchCurrentPrice(tokenId: string) {
  const proxyAgent = getProxyAgent()
  
  try {
    const response = await axios.get(`${CLOB_API}/book`, {
      params: { token_id: tokenId },
      headers: { "User-Agent": "polymarket-bot/2.0" },
      timeout: 5000,
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
    })
    
    const data = response.data
    const asks = data.asks || []
    const bids = data.bids || []
    
    if (bids.length > 0 && asks.length > 0) {
      const bestBid = parseFloat(bids[0].price)
      const bestAsk = parseFloat(asks[0].price)
      return (bestBid + bestAsk) / 2
    } else if (bids.length > 0) {
      return parseFloat(bids[0].price)
    } else if (asks.length > 0) {
      return parseFloat(asks[0].price)
    }
    
    return 0
  } catch (error) {
    return 0
  }
}

export async function GET() {
  try {
    const privateKey = (process.env.PRIVATE_KEY || "").replace(/[\s\r\n]/g, "")
    
    if (!privateKey) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "未配置私钥",
      })
    }

    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    let wallet: Wallet
    
    try {
      wallet = new Wallet(formattedKey)
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: "私钥格式错误",
        data: [],
      })
    }

    const address = wallet.address
    console.log(`获取持仓: ${address}`)

    // 从 CLOB API 获取持仓
    const rawPositions = await fetchPositionsFromCLOB(address)
    
    if (!rawPositions || rawPositions.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        address: address,
        message: "暂无持仓",
      })
    }

    // 处理持仓数据，获取当前价格
    const positions = await Promise.all(
      rawPositions.slice(0, 20).map(async (pos: any) => {
        const currentPrice = await fetchCurrentPrice(pos.asset_id || pos.token_id)
        const shares = parseFloat(pos.size || pos.shares || 0)
        const avgCost = parseFloat(pos.avg_price || pos.avgCost || 0)
        const value = shares * currentPrice
        const cost = shares * avgCost
        const pnl = value - cost
        const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0

        return {
          id: pos.asset_id || pos.token_id || pos.id,
          tokenId: pos.asset_id || pos.token_id,
          market: pos.title || pos.market || "未知市场",
          outcome: pos.outcome || pos.side || "Unknown",
          shares: shares,
          avgCost: avgCost,
          currentPrice: currentPrice,
          value: value,
          pnl: pnl,
          pnlPercent: pnlPercent,
          conditionId: pos.condition_id,
        }
      })
    )

    // 过滤掉无效持仓（份额为0或价格异常的）
    const validPositions = positions.filter(p => p.shares > 0)

    return NextResponse.json({
      success: true,
      data: validPositions,
      address: address,
      count: validPositions.length,
    })
  } catch (error: any) {
    console.error("获取持仓错误:", error)
    return NextResponse.json(
      { success: false, error: error.message, data: [] },
      { status: 500 }
    )
  }
}
