"use client"

import { Button } from "@/components/ui/button"
import { RefreshCcw } from "lucide-react"
import { useState } from "react"
import { formatDateTime } from "@/lib/date-utils"

interface HeaderProps {
  title: string
  description?: string
  lastUpdated?: Date
  onReloadAll?: () => void | Promise<void>
}

export function Header({ title, description, lastUpdated, onReloadAll }: HeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleReloadAll = async () => {
    if (!onReloadAll) return

    console.log("[v0] 🔄 Header: Reload All button clicked")
    setIsRefreshing(true)

    try {
      await onReloadAll()
      console.log("[v0] ✅ Header: All data refreshed successfully")
    } catch (error) {
      console.error("[v0] ❌ Header: Error refreshing data:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">Last updated: {formatDateTime(lastUpdated)}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleReloadAll}
          disabled={isRefreshing || !onReloadAll}
          className="gap-2 bg-transparent"
        >
          <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Reload All
        </Button>
      </div>
    </header>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
