"use client"

import { useQuery } from "@tanstack/react-query"
import { Sidebar } from "@/components/layout/sidebar"

async function fetchBalance() {
  try {
    const res = await fetch("/api/balance")
    if (!res.ok) return { success: false, data: { usdc: 0 } }
    return res.json()
  } catch {
    return { success: false, data: { usdc: 0 } }
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: balanceData } = useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance,
    refetchInterval: 30000,
  })

  const balance = balanceData?.data?.usdc || 0
  const isConnected = balanceData?.success || false

  return (
    <div className="min-h-screen bg-background">
      <Sidebar balance={balance} isConnected={isConnected} />
      <main className="pl-64">
        {children}
      </main>
    </div>
  )
}
