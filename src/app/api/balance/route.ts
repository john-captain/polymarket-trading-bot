import { NextResponse } from "next/server"
import { Wallet } from "@ethersproject/wallet"

// USDC 合约信息
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

// 多个 Polygon RPC 提供商，按优先级排序
const RPC_URLS = [
  "https://polygon-rpc.com",
  "https://polygon.llamarpc.com",
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://polygon-mainnet.public.blastapi.io",
  "https://rpc-mainnet.maticvigil.com",
]

// 使用 fetch 直接调用 RPC
async function rpcCall(rpcUrl: string, method: string, params: any[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  })
  const data = await response.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

async function tryGetBalance(rpcUrl: string, address: string) {
  // 获取 MATIC 余额
  const maticHex = await rpcCall(rpcUrl, "eth_getBalance", [address, "latest"])
  const matic = parseInt(maticHex, 16) / 1e18

  // 获取 USDC 余额 (调用 balanceOf)
  const balanceOfData = "0x70a08231000000000000000000000000" + address.slice(2).toLowerCase()
  const usdcHex = await rpcCall(rpcUrl, "eth_call", [
    { to: USDC_ADDRESS, data: balanceOfData },
    "latest",
  ])
  const usdc = parseInt(usdcHex, 16) / 1e6

  return { usdc, matic }
}

export async function GET() {
  try {
    // 彻底清理私钥，移除所有空白字符和换行符
    const privateKey = (process.env.PRIVATE_KEY || "").replace(/[\s\r\n]/g, "")
    if (!privateKey) {
      // 没有配置私钥时返回模拟数据
      return NextResponse.json({
        success: true,
        data: {
          address: "0x0000...未配置",
          usdc: 0,
          matic: 0,
          isDemo: true,
        },
      })
    }

    // 确保私钥格式正确
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    let wallet: Wallet
    try {
      wallet = new Wallet(formattedKey)
    } catch (e) {
      console.error("私钥格式错误:", e)
      return NextResponse.json({
        success: true,
        data: {
          address: "0x0000...私钥格式错误",
          usdc: 0,
          matic: 0,
          isDemo: true,
        },
      })
    }

    // 尝试多个 RPC
    let lastError: Error | null = null
    for (const rpcUrl of RPC_URLS) {
      try {
        const { usdc, matic } = await tryGetBalance(rpcUrl, wallet.address)
        
        return NextResponse.json({
          success: true,
          data: {
            address: wallet.address,
            usdc,
            matic,
          },
        })
      } catch (error: any) {
        lastError = error
        continue
      }
    }

    // 所有 RPC 都失败，返回钱包地址但余额为 0
    console.warn("所有 RPC 请求失败，返回离线模式数据")
    return NextResponse.json({
      success: true,
      data: {
        address: wallet.address,
        usdc: 0,
        matic: 0,
        isOffline: true,
        error: lastError?.message || "网络连接失败",
      },
    })
  } catch (error: any) {
    console.error("获取余额失败:", error)
    return NextResponse.json({
      success: true,
      data: {
        address: "错误",
        usdc: 0,
        matic: 0,
        isDemo: true,
        error: error.message,
      },
    })
  }
}
