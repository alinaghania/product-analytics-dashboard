"use client"

import type React from "react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChartCardProps {
  title: string | React.ReactNode
  description?: string
  children: React.ReactNode
  isLoading?: boolean
  onReload?: () => void
  className?: string
}

export function ChartCard({ title, description, children, isLoading, onReload, className }: ChartCardProps) {
  const handleReload = () => {
    const titleText = typeof title === "string" ? title : "Chart"
    console.log("[v0] 🔘 ChartCard reload clicked:", titleText)
    onReload?.()
  }

  return (
    <Card className={cn("border-border bg-card", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {onReload && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleReload}
            disabled={isLoading}
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
