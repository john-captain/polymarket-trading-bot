import { NextResponse } from "next/server"
import { getApiLogs } from "@/lib/api-client/file-log-storage"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const clientType = searchParams.get('clientType') || undefined
    
    const logs = getApiLogs({
      limit,
      clientType,
    })

    return NextResponse.json({
      success: true,
      data: logs,
    })
  } catch (error: any) {
    console.error('❌ 获取 API 日志失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取 API 日志失败',
      },
      { status: 500 }
    )
  }
}
