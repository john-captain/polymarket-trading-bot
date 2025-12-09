"use client"

/**
 * 队列状态卡片组件
 * 显示单个队列的运行状态
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface QueueStatusData {
  name: string
  label: string
  size: number
  pending: number
  maxSize?: number
  state: 'idle' | 'running' | 'paused' | 'stopped'
  processedCount?: number
  errorCount?: number
  lastTaskAt?: string | null
}

interface QueueStatusCardProps {
  queue: QueueStatusData
  className?: string
}

const stateColors: Record<string, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-gray-100', text: 'text-gray-700', label: '空闲' },
  running: { bg: 'bg-green-100', text: 'text-green-700', label: '运行中' },
  paused: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '已暂停' },
  stopped: { bg: 'bg-red-100', text: 'text-red-700', label: '已停止' },
}

export function QueueStatusCard({ queue, className }: QueueStatusCardProps) {
  const stateStyle = stateColors[queue.state] || stateColors.idle
  const utilizationPercent = queue.maxSize 
    ? Math.round((queue.size / queue.maxSize) * 100) 
    : 0

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{queue.label}</CardTitle>
          <Badge 
            variant="secondary"
            className={cn(stateStyle.bg, stateStyle.text, "text-xs")}
          >
            {stateStyle.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {/* 进度条 (如有最大容量) */}
        {queue.maxSize && (
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
            <div 
              className={cn(
                "h-full transition-all duration-300",
                utilizationPercent > 80 ? "bg-red-500" :
                utilizationPercent > 50 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        )}
        
        {/* 横向统计信息 */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          {/* 队列容量 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">队列:</span>
            <span className="font-medium">
              {queue.size}
              {queue.maxSize ? `/${queue.maxSize}` : ''}
            </span>
          </div>
          
          {/* 待处理 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">待处理:</span>
            <span className="font-medium">{queue.pending}</span>
          </div>

          {/* 已处理 */}
          {queue.processedCount !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已处理:</span>
              <span className="font-medium">{queue.processedCount}</span>
            </div>
          )}

          {/* 错误数 */}
          {queue.errorCount !== undefined && queue.errorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">错误:</span>
              <span className="font-medium text-red-600">{queue.errorCount}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * 流向箭头组件 - 向下
 */
function FlowArrowDown() {
  return (
    <div className="flex justify-center py-2">
      <div className="flex flex-col items-center text-muted-foreground">
        <div className="w-0.5 h-4 bg-border" />
        <svg 
          className="w-4 h-4" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </div>
  )
}

/**
 * 分叉箭头组件 - 一分为二
 */
function FlowArrowFork() {
  return (
    <div className="flex justify-center py-2">
      <svg 
        className="w-32 h-8 text-muted-foreground" 
        viewBox="0 0 128 32" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        {/* 中心向下 */}
        <path d="M64 0 V8" />
        {/* 左分支 */}
        <path d="M64 8 Q64 16 32 16 V24" />
        <path d="M28 20 L32 24 L36 20" />
        {/* 右分支 */}
        <path d="M64 8 Q64 16 96 16 V24" />
        <path d="M92 20 L96 24 L100 20" />
      </svg>
    </div>
  )
}

/**
 * 汇聚箭头组件 - 从右侧汇入
 */
function FlowArrowMerge() {
  return (
    <div className="flex justify-center py-2">
      <svg 
        className="w-32 h-8 text-muted-foreground" 
        viewBox="0 0 128 32" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        {/* 右侧向下汇入 */}
        <path d="M96 0 V8 Q96 16 64 16 V24" />
        {/* 箭头 */}
        <path d="M60 20 L64 24 L68 20" />
      </svg>
    </div>
  )
}

/**
 * 队列状态卡片组 - 展示数据流向架构
 * 
 * 架构：
 *        扫描队列
 *           ↓
 *    ┌──────┴──────┐
 *    ↓             ↓
 * 存储队列     策略队列
 *                  ↓
 *              订单队列
 */
interface QueueStatusGroupProps {
  queues: QueueStatusData[]
  className?: string
}

export function QueueStatusGroup({ queues, className }: QueueStatusGroupProps) {
  // 按名称找到各队列
  const scanQueue = queues.find(q => q.name === 'scan')
  const storageQueue = queues.find(q => q.name === 'storage')
  const strategyQueue = queues.find(q => q.name === 'strategy')
  const orderQueue = queues.find(q => q.name === 'order')

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {/* 第一层：扫描队列 */}
      {scanQueue && (
        <div className="w-full max-w-md">
          <QueueStatusCard queue={scanQueue} />
        </div>
      )}
      
      {/* 分叉箭头 */}
      <FlowArrowFork />
      
      {/* 第二层：存储队列 + 策略队列（并行） */}
      <div className="grid grid-cols-2 gap-4 w-full">
        {storageQueue && <QueueStatusCard queue={storageQueue} />}
        {strategyQueue && <QueueStatusCard queue={strategyQueue} />}
      </div>
      
      {/* 汇聚箭头（从策略队列到订单队列） */}
      <FlowArrowMerge />
      
      {/* 第三层：订单队列 */}
      {orderQueue && (
        <div className="w-full max-w-md">
          <QueueStatusCard queue={orderQueue} />
        </div>
      )}
    </div>
  )
}
