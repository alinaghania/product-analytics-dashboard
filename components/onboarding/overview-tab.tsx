"use client"

import { useMemo } from "react"
import { BarChart } from "@/components/charts/bar-chart"
import { ChartCard } from "@/components/dashboard/chart-card"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { formatInParis } from "@/lib/analytics"
import { agree, formatMs, formatNumber, formatPercent, formatShare, plural } from "@/lib/format"
import type { Insight } from "@/lib/onboarding-journal/insights"
import { OUTCOMES, hasSignUp, share, type JournalSummary, type StageKey } from "@/lib/onboarding-journal/report"
import { cn } from "@/lib/utils"
import { InsightList } from "./insight-list"
import { outcomeStyle } from "./primitives"
import { TunnelFunnel } from "./tunnel-funnel"

const stageCount = (summary: JournalSummary, key: StageKey): number =>
  summary.stages.find((stage) => stage.key === key)?.count ?? 0

/** "avant 78 %": the same share of the sessions started, over the previous period. */
function shareBefore(baseline: JournalSummary | null | undefined, key: StageKey, decimals = 0): string | null {
  return baseline ? `avant ${formatPercent(share(stageCount(baseline, key), baseline.journeys), decimals)}` : null
}

const joined = (...parts: Array<string | null>): string => parts.filter(Boolean).join(" · ")

/** "17 nov." for a day of the range (yyyy-MM-dd): noon UTC falls on that day in Paris. */
const dayLabel = (day: string): string => formatInParis(new Date(`${day}T12:00:00Z`), "d MMM")

export function OverviewTab({
  summary,
  baseline,
  insights,
  onOpenInsight,
}: {
  summary: JournalSummary
  /** Same filters over the previous period, when the comparison is on. */
  baseline?: JournalSummary | null
  insights: Insight[]
  onOpenInsight: (insight: Insight) => void
}) {
  const started = summary.journeys
  const completed = stageCount(summary, "completed")
  const registered = stageCount(summary, "registered")
  const paywall = stageCount(summary, "paywall")
  const subscribed = stageCount(summary, "subscribed")
  // Days since the first session of the period: the journal may be younger than the period asked for.
  const firstDay = summary.daily.findIndex((day) => day.total > 0)
  const days = firstDay === -1 ? 0 : summary.daily.length - firstDay
  // A re-onboarding stops with the onboarding: no account, no subscription to count.
  const signUp = hasSignUp(summary.flow)

  // The outcomes seen over the period, stacked from the furthest (bottom) to the least advanced (top).
  const dailyStacks = useMemo(
    () =>
      [...OUTCOMES]
        .reverse()
        .filter((outcome) => summary.outcomes[outcome] > 0)
        .map((outcome) => {
          const { label, hex } = outcomeStyle(outcome, summary.flow)
          return { key: outcome, label, color: hex }
        }),
    [summary],
  )
  const dailyRows = useMemo(() => summary.daily.map((day) => ({ ...day, day: dayLabel(day.date) })), [summary])

  return (
    <div className="space-y-6">
      <div className={cn("grid grid-cols-2 gap-4", signUp ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
        <KpiCard
          label="Sessions démarrées"
          value={formatNumber(started)}
          caption={joined(
            days > 0 ? `≈ ${formatNumber(started / days)} par jour` : null,
            baseline ? `avant ${formatNumber(baseline.journeys)}` : null,
          )}
          tooltipTitle="Sessions démarrées"
          tooltipDescription="Parcours d'onboarding ouverts sur la période, suivis depuis leur premier écran. Un parcours repris plus tard sur le même téléphone reste la même session."
        />
        <KpiCard
          label="Onboarding terminé"
          value={formatShare(completed, started)}
          caption={joined(`${formatNumber(completed)} sur ${formatNumber(started)}`, shareBefore(baseline, "completed"))}
          tooltipTitle="Onboarding terminé"
          tooltipDescription="Part des sessions démarrées qui vont jusqu'à l'appui long d'engagement, le dernier écran de l'onboarding."
        />
        {signUp && (
          <KpiCard
            label="Compte créé"
            value={formatShare(registered, started)}
            caption={
              baseline || completed === 0
                ? joined(`${formatNumber(registered)} sur ${formatNumber(started)}`, shareBefore(baseline, "registered"))
                : `${formatShare(registered, completed)} de celles qui terminent`
            }
            tooltipTitle="Compte créé"
            tooltipDescription="Part des sessions démarrées qui aboutissent à un compte (Apple, Google ou e-mail)."
          />
        )}
        {signUp && (
          <KpiCard
            label="Abonnement pris"
            value={formatPercent(share(subscribed, started), 1)}
            // The share is spelled out: it is not the one of the headline, which counts every session started.
            caption={
              baseline || paywall === 0
                ? joined(`${formatNumber(subscribed)} sur ${formatNumber(started)}`, shareBefore(baseline, "subscribed", 1))
                : `${formatNumber(subscribed)} sur ${plural(paywall, "paywall vu", "paywalls vus")} (${formatShare(subscribed, paywall, 1)})`
            }
            variant={subscribed > 0 ? "success" : "default"}
            tooltipTitle="Abonnement pris"
            tooltipDescription="Part des sessions démarrées qui s'abonnent sur le paywall présenté à la fin de l'onboarding. Les abonnements pris plus tard dans l'app ne sont pas comptés ici."
          />
        )}
        <KpiCard
          label="Temps pour terminer"
          value={formatMs(summary.medianCompletionMs)}
          caption={baseline ? `médiane · avant ${formatMs(baseline.medianCompletionMs)}` : "médiane, app au premier plan"}
          tooltipTitle="Temps pour terminer"
          tooltipDescription="Temps passé du premier écran à la fin de l'onboarding (inscription non comprise), pour les sessions qui terminent. Seul le temps où l'app est à l'écran compte."
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <ChartCard
            title={signUp ? "Du premier écran à l'abonnement" : "Du premier écran à la fin de l'onboarding"}
            description="Chaque barre : part des sessions démarrées qui atteignent l'étape"
          >
            <TunnelFunnel summary={summary} baseline={baseline} />
            {summary.resumed.journeys > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {plural(summary.resumed.journeys, "session")} ({formatShare(summary.resumed.journeys, started)}){" "}
                {agree(summary.resumed.journeys, "s'est faite", "se sont faites")} en plusieurs fois, l'app rouverte entre-temps ;{" "}
                {formatNumber(summary.resumed.completed)} {agree(summary.resumed.completed, "a", "ont")} terminé l'onboarding.
              </p>
            )}
          </ChartCard>

          <ChartCard
            title="Sessions par jour de début"
            description="Où en sont aujourd'hui les sessions démarrées chaque jour (heure de Paris)"
          >
            <BarChart data={dailyRows} xKey="day" yKey="total" stacks={dailyStacks} maxBars={31} />
          </ChartCard>
        </div>

        <ChartCard
          title="Où agir en priorité"
          description="Ce que les chiffres font ressortir — un clic ouvre le détail"
          className="xl:col-span-2"
        >
          <InsightList insights={insights} onOpen={onOpenInsight} />
        </ChartCard>
      </div>
    </div>
  )
}
