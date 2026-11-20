"use client"

import { Fragment } from "react"
import { ArrowDown } from "lucide-react"
import { agree, formatNumber, formatShare, plural } from "@/lib/format"
import type { JournalSummary, StageKey } from "@/lib/onboarding-journal/report"
import { TONE } from "./primitives"

const STAGE_LABELS: Record<StageKey, string> = {
  started: "Sessions démarrées",
  parcours: "Parcours choisi",
  completed: "Onboarding terminé",
  registered: "Compte créé",
  paywall: "Paywall vu",
  subscribed: "Abonnement pris",
}

/** What happens to the journeys that do not reach a stage: for one of them, for several. */
const LOSS_LABELS: Record<Exclude<StageKey, "started">, [one: string, several: string]> = {
  parcours: ["part avant d'avoir choisi son parcours", "partent avant d'avoir choisi leur parcours"],
  completed: ["s'arrête pendant les questions de son parcours", "s'arrêtent pendant les questions de leur parcours"],
  registered: ["finit l'onboarding sans créer de compte", "finissent l'onboarding sans créer de compte"],
  paywall: ["n'a pas répondu au paywall", "n'ont pas répondu au paywall"],
  subscribed: ["ne prend pas d'abonnement sur le paywall", "ne prennent pas d'abonnement sur le paywall"],
}

/** What softens a loss: journeys that left the tunnel without being lost. */
function lossNote(stage: StageKey, summary: JournalSummary): string | null {
  if (stage === "registered" && summary.tappedLogin > 0) {
    return `dont ${plural(summary.tappedLogin, "session")} qui ${agree(summary.tappedLogin, "a", "ont")} tapé « J'ai déjà un compte »`
  }
  if (stage === "paywall" && summary.alreadyPremium > 0) {
    return `dont ${plural(summary.alreadyPremium, "compte")} déjà premium`
  }
  return null
}

/**
 * The tunnel stage by stage. Each bar is a share of the sessions started; the
 * line between two bars says how many are lost on the way, and how.
 */
export function TunnelFunnel({ summary, baseline }: { summary: JournalSummary; baseline?: JournalSummary | null }) {
  const started = summary.journeys
  const baselineCount = (key: StageKey) => baseline?.stages.find((stage) => stage.key === key)?.count ?? 0

  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 text-sm">
      {summary.stages.map((stage, index) => {
        const previous = summary.stages[index - 1]
        const lost = previous ? previous.count - stage.count : 0
        const note = lossNote(stage.key, summary)
        return (
          <Fragment key={stage.key}>
            {previous && stage.key !== "started" && (
              <p className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <ArrowDown className="h-3 w-3 shrink-0" style={{ color: TONE.lost }} aria-hidden />
                {lost > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {formatNumber(lost)} ({formatShare(lost, previous.count)})
                    </span>
                    {agree(lost, ...LOSS_LABELS[stage.key])}
                    {note && <span>— {note}</span>}
                  </>
                ) : (
                  <span>aucune perte</span>
                )}
              </p>
            )}
            <span className="truncate font-medium text-foreground">{STAGE_LABELS[stage.key]}</span>
            <div className="h-4 w-full rounded bg-muted">
              <div
                className="h-full rounded-r"
                style={{ width: `${started > 0 ? (stage.count / started) * 100 : 0}%`, backgroundColor: TONE.reach }}
              />
            </div>
            <span className="whitespace-nowrap text-right tabular-nums">
              <span className="font-semibold text-foreground">{formatNumber(stage.count)}</span>
              <span className="ml-2 inline-block w-11 text-muted-foreground">{formatShare(stage.count, started)}</span>
              {baseline && (
                <span className="ml-1 inline-block w-20 text-xs text-muted-foreground">
                  avant {index === 0 ? formatNumber(baseline.journeys) : formatShare(baselineCount(stage.key), baseline.journeys)}
                </span>
              )}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
