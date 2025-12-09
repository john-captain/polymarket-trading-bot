"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  Zap,
  TrendingUp,
  History,
  Wallet,
  Settings,
  Bell,
  Key,
  User,
  ChevronDown,
  ChevronRight,
  Activity,
  BarChart3,
  Layers,
  TestTube,
  Database,
  Eye,
  Cog,
} from "lucide-react"

interface NavItem {
  title: string
  href?: string
  icon: React.ElementType
  children?: NavItem[]
  badge?: string
}

const navigation: NavItem[] = [
  {
    title: "总览",
    href: "/overview",
    icon: LayoutDashboard,
  },
  {
    title: "机会监控",
    href: "/opportunities",
    icon: Eye,
    // badge: "新",
  },
    {
    title: "市场列表",
    href: "/markets/sync",
    icon: Database,
    // badge: "新",
  },

  {
    title: "策略",
    icon: Zap,
    children: [
      { title: "铸造拆分", href: "/strategies/mint-split/config", icon: Layers, badge: "配置" },
      { title: "套利策略", href: "/strategies/arbitrage/config", icon: TrendingUp, badge: "配置" },
      { title: "做市策略", href: "/strategies/market-making/config", icon: BarChart3, badge: "配置" },
    ],
  },
  {
    title: "交易",
    icon: Activity,
    children: [
      { title: "交易历史", href: "/trades/history", icon: History },
      { title: "当前持仓", href: "/trades/positions", icon: Wallet },
      { title: "测试交易", href: "/trades/test", icon: TestTube, badge: "测试" },
    ],
  },
  {
    title: "设置",
    href: "/settings",
    icon: Settings,
  },
]

interface SidebarProps {
  balance?: number
  isConnected?: boolean
}

export function Sidebar({ balance = 0, isConnected = false }: SidebarProps) {
  const pathname = usePathname()
  const [expanded, setExpanded] = React.useState<string[]>(["市场", "策略"])

  const toggleExpand = (title: string) => {
    setExpanded((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    )
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/overview" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">PolyTrader</h1>
              <p className="text-xs text-muted-foreground">套利平台</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navigation.map((item) => (
            <div key={item.title}>
              {item.href ? (
                // 直接链接
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Link>
              ) : (
                // 可展开的父级
                <>
                  <button
                    onClick={() => toggleExpand(item.title)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      item.children?.some((c) => c.href && isActive(c.href))
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      {item.title}
                    </div>
                    {expanded.includes(item.title) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {/* 子菜单 */}
                  {expanded.includes(item.title) && item.children && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-border pl-4">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href!}
                          className={cn(
                            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive(child.href!)
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <child.icon className="h-4 w-4" />
                            {child.title}
                          </div>
                          {child.badge && (
                            <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
                              {child.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* 底部状态 */}
        <div className="border-t border-border p-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">账户余额</span>
              <span className={cn(
                "flex items-center gap-1 text-xs",
                isConnected ? "text-success" : "text-muted-foreground"
              )}>
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected ? "bg-success animate-pulse" : "bg-muted-foreground"
                )} />
                {isConnected ? "已连接" : "未连接"}
              </span>
            </div>
            <p className="mt-1 text-xl font-bold">${balance.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
