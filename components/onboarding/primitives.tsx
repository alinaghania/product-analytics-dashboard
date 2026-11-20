"use client"

import { useState, type ReactNode } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { hasSignUp, type Outcome } from "@/lib/onboarding-journal/report"
import { cn } from "@/lib/utils"

// Building blocks shared by the tabs of the Onboarding page.

/**
 * Colours of the page, all from the theme (app/globals.css). One blue for
 * "how many", and the theme's status colours for what they mean here — lost,
 * stalled, converted — always next to a label, never alone.
 */
export const TONE = {
  reach: "var(--primary)",
  lost: "var(--destructive)",
  stalled: "var(--warning)",
  won: "var(--success)",
  idle: "var(--muted-foreground)",
} as const

type Tone = keyof typeof TONE

/** Same colours as hex, for the Recharts components (SVG attributes). */
const TONE_HEX: Record<Tone, string> = {
  reach: "#3B82F6",
  lost: "#FF5C5C",
  stalled: "#FFB020",
  won: "#2ED47A",
  idle: "#6B7694",
}

const OUTCOMES: Record<Outcome, { label: string; tone: Tone }> = {
  live: { label: "En cours", tone: "idle" },
  abandoned: { label: "Abandon", tone: "lost" },
  completed: { label: "Terminé sans compte", tone: "stalled" },
  registered: { label: "Compte créé", tone: "reach" },
  subscribed: { label: "Abonnée", tone: "won" },
}

/** A re-onboarding has nothing after the onboarding: finishing it is the good ending. */
const REONBOARDING_COMPLETED = { label: "Terminé", tone: "won" } as const

/** How an outcome is named and coloured, for a journey of the given flow. */
export function outcomeStyle(outcome: Outcome, flow: string): { label: string; color: string; hex: string } {
  const { label, tone } = outcome === "completed" && !hasSignUp(flow) ? REONBOARDING_COMPLETED : OUTCOMES[outcome]
  return { label, color: TONE[tone], hex: TONE_HEX[tone] }
}

export function OutcomeBadge({ outcome, flow }: { outcome: Outcome; flow: string }) {
  const { label, color } = outcomeStyle(outcome, flow)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

/**
 * Explanation shown on hover or keyboard focus of `children`. Needs a
 * TooltipProvider above: the page has one for all its hints (a table has
 * hundreds of them).
 */
export function Hint({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs font-normal normal-case">{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The last value that was not null. A side panel is told what to show by a
 * value that turns null when it closes: this keeps its content in place while
 * it slides out.
 */
export function useLastDefined<T>(value: T | null): T | null {
  const [last, setLast] = useState(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}

export interface BarSegment {
  value: number
  color: string
}

/**
 * A thin horizontal bar: its segments side by side, on a track that stands for
 * `total`. The gap between two segments is the track showing through.
 */
export function SplitBar({ segments, total, className }: { segments: BarSegment[]; total: number; className?: string }) {
  const visible = segments.filter((segment) => segment.value > 0)
  return (
    <div className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted", className)}>
      {total > 0 &&
        visible.map((segment, index) => (
          <div
            key={index}
            className={cn("h-full", index === visible.length - 1 && "rounded-r-full")}
            style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
          />
        ))}
    </div>
  )
}

/** A share against its whole: one segment of a SplitBar. */
export function Meter({ value, total, color = TONE.reach, className }: { value: number; total: number; color?: string; className?: string }) {
  return <SplitBar segments={[{ value, color }]} total={total} className={className} />
}

/** A figure with its label, for the header of a card or a side panel. */
export function Figure({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export interface PillOption<T extends string> {
  value: T
  label: string
  /** Shown after the label, muted. */
  count?: number
}

/** One choice among a few, all visible: the pills wrap on several lines. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: PillOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Tapping the selected pill would unselect it: one is always selected.
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={label}
      className="flex-wrap justify-start gap-1.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="group h-auto min-w-0 gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-secondary-foreground hover:bg-muted hover:text-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {option.label}
          {option.count !== undefined && (
            <span className="tabular-nums text-muted-foreground group-data-[state=on]:text-primary-foreground/80">
              {formatNumber(option.count)}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
