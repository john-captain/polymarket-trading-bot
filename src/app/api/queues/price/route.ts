/**
 * 价格队列 API
 * 
 * GET  - 获取队列状态
 * POST - 控制队列 (start/stop/pause/resume/run)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPriceQueue } from '@/lib/queue'

/**
 * GET /api/queues/price
 * 获取价格队列状态
 */
export async function GET() {
  try {
    const queue = getPriceQueue()
    const status = queue.getStatus()

    return NextResponse.json({
      success: true,
      data: status,
    })
  } catch (error: any) {
    console.error('❌ 获取价格队列状态失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '获取状态失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/queues/price
 * 控制价格队列
 * 
 * Body: { action: 'start' | 'stop' | 'pause' | 'resume' | 'run' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config } = body

    if (!action) {
      return NextResponse.json(
        { success: false, error: '缺少 action 参数' },
        { status: 400 }
      )
    }

    const queue = getPriceQueue()

    switch (action) {
      case 'start':
        await queue.start()
        return NextResponse.json({
          success: true,
          message: '价格队列已启动',
          data: queue.getStatus(),
        })

      case 'stop':
        await queue.stop()
        return NextResponse.json({
          success: true,
          message: '价格队列已停止',
          data: queue.getStatus(),
        })

      case 'pause':
        queue.pause()
        return NextResponse.json({
          success: true,
          message: '价格队列已暂停',
          data: queue.getStatus(),
        })

      case 'resume':
        queue.resume()
        return NextResponse.json({
          success: true,
          message: '价格队列已恢复',
          data: queue.getStatus(),
        })

      case 'run':
        // 手动触发一次扫描
        const result = await queue.runScan()
        return NextResponse.json({
          success: true,
          message: '价格扫描完成',
          data: {
            status: queue.getStatus(),
            result,
          },
        })

      case 'config':
        // 更新配置
        if (config) {
          queue.updateConfig(config)
          return NextResponse.json({
            success: true,
            message: '配置已更新',
            data: queue.getStatus(),
          })
        }
        return NextResponse.json(
          { success: false, error: '缺少 config 参数' },
          { status: 400 }
        )

      default:
        return NextResponse.json(
          { success: false, error: `未知操作: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('❌ 价格队列操作失败:', error)
    return NextResponse.json(
      { success: false, error: error.message || '操作失败' },
      { status: 500 }
    )
  }
}
