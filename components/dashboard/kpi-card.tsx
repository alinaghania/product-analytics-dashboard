"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCcw, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"

interface KpiCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  isLoading?: boolean
  onReload?: () => void
  variant?: "default" | "success" | "warning" | "danger" | "info"
  tooltipTitle?: string
  tooltipDescription?: string
  tooltipHowToRead?: string
  tooltipLimitations?: string
  tooltipDataCoverage?: string
}

export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  isLoading,
  onReload,
  variant = "default",
  tooltipTitle,
  tooltipDescription,
  tooltipHowToRead,
  tooltipLimitations,
  tooltipDataCoverage,
}: KpiCardProps) {
  const getTrendIcon = () => {
    if (change === undefined || change === 0) return <Minus className="h-3 w-3" />
    return change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
  }

  const getTrendColor = () => {
    if (change === undefined || change === 0) return "text-muted-foreground"
    return change > 0 ? "text-success" : "text-destructive"
  }

  const getValueColor = () => {
    switch (variant) {
      case "success":
        return "text-success"
      case "warning":
        return "text-warning"
      case "danger":
        return "text-destructive"
      case "info":
        return "text-accent"
      default:
        return "text-foreground"
    }
  }

  const handleReload = () => {
    console.log("[v0] 🔘 KpiCard reload clicked:", label)
    onReload?.()
  }

  return (
    <Card className="relative overflow-hidden border-border bg-card p-5">
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {tooltipTitle && (
          <InfoTooltip
            title={tooltipTitle}
            description={tooltipDescription}
            howToRead={tooltipHowToRead}
            limitations={tooltipLimitations}
            dataCoverage={tooltipDataCoverage}
          />
        )}
        {onReload && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleReload}
            disabled={isLoading}
          >
            <RefreshCcw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-bold", getValueColor())}>{isLoading ? "..." : value}</p>
        {change !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs", getTrendColor())}>
            {getTrendIcon()}
            <span className="font-medium">
              {change > 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            {changeLabel && <span className="text-muted-foreground">vs {changeLabel}</span>}
          </div>
        )}
      </div>
    </Card>
  )
}
