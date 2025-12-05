import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化数字（千分位）
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// 格式化价格（4位小数）
export function formatPrice(price: number): string {
  return price.toFixed(4)
}

// 格式化时间
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("zh-CN")
}

// 缩短地址显示
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return ""
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}
