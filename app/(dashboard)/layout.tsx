import type React from "react"
import { PageCacheScope } from "@/components/dashboard/page-cache-scope"
import { Sidebar } from "@/components/dashboard/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <PageCacheScope />
      <main className="min-h-screen md:ml-64">{children}</main>
    </div>
  )
}
