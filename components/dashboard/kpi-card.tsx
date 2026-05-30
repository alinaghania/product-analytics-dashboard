"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCcw, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { goalStatus, goalProgress, type GoalStatus } from "@/lib/metric-goals"

interface KpiCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  isLoading?: boolean
  onReload?: () => void
  variant?: "default" | "success" | "warning" | "danger" | "info"
  /** Raw numeric value used to compute progress/status against `target`. */
  numericValue?: number
  /** The objective to reach (same unit as the metric). Enables the goal bar. */
  target?: number
  /** Caption shown next to the goal bar, e.g. "Goal 20%". */
  goalLabel?: string
  tooltipTitle?: string
  tooltipDescription?: string
  tooltipHowToRead?: string
  tooltipLimitations?: string
  tooltipDataCoverage?: string
}

// CSS variable per status — used for the progress-bar fill (inline so we don't
// depend on Tailwind generating bg-* for the semantic colors).
const STATUS_VAR: Record<GoalStatus, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
}

const STATUS_TEXT: Record<GoalStatus, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
}

const STATUS_WORD: Record<GoalStatus, string> = {
  success: "On target",
  warning: "Getting close",
  danger: "Needs work",
}

export function KpiCard({
  label,
  value,
  change,
  changeLabel,
  isLoading,
  onReload,
  variant = "default",
  numericValue,
  target,
  goalLabel,
  tooltipTitle,
  tooltipDescription,
  tooltipHowToRead,
  tooltipLimitations,
  tooltipDataCoverage,
}: KpiCardProps) {
  const hasGoal = numericValue !== undefined && target !== undefined && !isLoading
  const status = hasGoal ? goalStatus(numericValue!, target!) : undefined
  const progress = hasGoal ? goalProgress(numericValue!, target!) : 0
  const getTrendIcon = () => {
    if (change === undefined || change === 0) return <Minus className="h-3 w-3" />
    return change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
  }

  const getTrendColor = () => {
    if (change === undefined || change === 0) return "text-muted-foreground"
    return change > 0 ? "text-success" : "text-destructive"
  }

  const getValueColor = () => {
    // When a goal is set, the value takes the traffic-light color so the
    // headline number itself signals progress against the objective.
    if (status) return STATUS_TEXT[status]
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
        {hasGoal && status && (
          <div className="space-y-1 pt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: STATUS_VAR[status] }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={cn("font-medium", STATUS_TEXT[status])}>{STATUS_WORD[status]}</span>
              {goalLabel && <span className="text-muted-foreground">{goalLabel}</span>}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
