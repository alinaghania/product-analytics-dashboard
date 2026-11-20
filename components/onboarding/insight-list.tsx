"use client"

import { ChevronRight, Hand, TrendingDown, TriangleAlert, type LucideIcon } from "lucide-react"
import type { Insight, InsightKind } from "@/lib/onboarding-journal/insights"
import { EmptyState, TONE } from "./primitives"

const KINDS: Record<InsightKind, { label: string; icon: LucideIcon; color: string }> = {
  loss: { label: "Perte", icon: TrendingDown, color: TONE.lost },
  risk: { label: "Risque", icon: TriangleAlert, color: TONE.stalled },
  friction: { label: "Friction", icon: Hand, color: TONE.reach },
}

/** The ranked frictions of the tunnel; each one opens the screen or the moment it is about. */
export function InsightList({ insights, onOpen }: { insights: Insight[]; onOpen: (insight: Insight) => void }) {
  if (insights.length === 0) {
    return <EmptyState>Rien ne ressort sur cette sélection : pas assez de sessions, ou aucun point de friction net.</EmptyState>
  }

  return (
    <ul className="divide-y divide-border">
      {insights.map((insight) => {
        const { label, icon: Icon, color } = KINDS[insight.kind]
        return (
          <li key={insight.key}>
            <button
              type="button"
              onClick={() => onOpen(insight)}
              className="group flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="block text-sm font-medium text-foreground">{insight.title}</span>
                <span className="block text-xs text-muted-foreground">{insight.detail}</span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
