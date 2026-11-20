"use client"

import { useMemo, type ReactNode } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { agree, formatMs, formatNumber, formatShare, plural } from "@/lib/format"
import { exitLabel, stepTypeLabel } from "@/lib/onboarding-journal/labels"
import {
  answerLabel,
  cohortHasSignUp,
  describeScreen,
  type CohortJourney,
  type ScreenScope,
  type ScreenStat,
} from "@/lib/onboarding-journal/report"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { AnswerTable } from "./answer-table"
import { Figure, Meter, TONE, useLastDefined } from "./primitives"
import { flowLabel } from "./scopes"

const NEVER_LEFT = "Jamais quitté : l'app a été fermée dessus"

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** One line per behaviour seen on the screen: the sessions concerned, and what they did. */
function signalLines(stat: ScreenStat): Array<{ count: number; did: string }> {
  const line = (count: number, one: string, several: string) => ({ count, did: agree(count, one, several) })
  return [
    line(stat.backs, "a quitté l'écran par la flèche retour", "ont quitté l'écran par la flèche retour"),
    line(stat.returns, "y est revenue depuis un écran suivant", "y sont revenues depuis un écran suivant"),
    line(stat.backgrounds, "a mis l'app en arrière-plan sur cet écran", "ont mis l'app en arrière-plan sur cet écran"),
    line(stat.maxReached, "a voulu sélectionner plus d'options que le maximum", "ont voulu sélectionner plus d'options que le maximum"),
    line(stat.changedMind, "a changé de réponse avant de valider", "ont changé de réponse avant de valider"),
    line(stat.disabledTaps, "a tapé le bouton principal alors qu'il était désactivé", "ont tapé le bouton principal alors qu'il était désactivé"),
  ].filter(({ count }) => count > 0)
}

function exitHint(stat: ScreenStat): string {
  if (stat.exits === 0) return "personne ne s'arrête là"
  const stopping = formatShare(stat.exits, stat.reached, 1)
  return stat.exitMedianMs === null ? stopping : `${stopping} · après ${formatMs(stat.exitMedianMs)} (médiane)`
}

/** Everything known about one screen, for the sessions of the current scope. */
export function ScreenDetailSheet({
  stat,
  onClose,
  journeys,
  scope,
  dataset,
}: {
  /** Screen to describe; null closes the panel. */
  stat: ScreenStat | null
  onClose: () => void
  journeys: CohortJourney[]
  scope: ScreenScope
  dataset: OnboardingDataset
}) {
  // Kept while the panel slides out.
  const shown = useLastDefined(stat)
  const detail = useMemo(
    () => (shown ? describeScreen(journeys, scope, shown.id, dataset) : null),
    [shown, journeys, scope, dataset],
  )
  const screen = shown ? dataset.screens[shown.id] : undefined
  const tallestBucket = Math.max(1, ...(detail?.durations.map((bucket) => bucket.count) ?? []))
  const signals = shown ? signalLines(shown) : []

  return (
    <Sheet open={stat !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {shown && detail && (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle className="pr-6 text-left">{screen?.title ?? shown.id}</SheetTitle>
              <SheetDescription className="text-left">
                {[shown.id, stepTypeLabel(screen?.type ?? ""), flowLabel(shown.id, shown.branches)].join(" · ")}
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Sessions" value={formatNumber(shown.reached)} hint={agree(shown.reached, "a vu cet écran", "ont vu cet écran")} />
              <Figure label="Abandons ici" value={formatNumber(shown.exits)} hint={exitHint(shown)} />
              <Figure label="Temps médian" value={formatMs(shown.medianMs)} hint={`90 % sous ${formatMs(shown.p90Ms)}`} />
              {shown.skipped > 0 && (
                <Figure
                  label="Écran conditionnel"
                  value={formatShare(shown.reached, shown.reached + shown.skipped)}
                  hint="des sessions qui passent par là le voient"
                />
              )}
            </div>

            <Block title="Temps passé sur l'écran">
              <div className="flex h-28 items-end gap-2">
                {detail.durations.map((bucket) => (
                  <div key={bucket.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs tabular-nums text-muted-foreground">{bucket.count > 0 ? bucket.count : ""}</span>
                    <div
                      className="w-full max-w-6 rounded-t"
                      style={{ height: `${(bucket.count / tallestBucket) * 70}%`, backgroundColor: TONE.reach }}
                    />
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">{bucket.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Par session, toutes ses visites de l'écran cumulées, app au premier plan. Sans les sessions fermées sur l'écran avant que le
                temps ait été noté.
              </p>
            </Block>

            <Block title="Comment elles quittent l'écran">
              <ul className="space-y-1.5">
                {detail.exits.map((exit) => (
                  <li key={exit.via} className="grid grid-cols-[minmax(0,1fr)_6rem_3rem] items-center gap-3 text-sm">
                    <span className="truncate text-foreground">{exit.via ? exitLabel(exit.via) : NEVER_LEFT}</span>
                    <Meter value={exit.count} total={shown.reached} color={exit.via ? TONE.reach : TONE.lost} />
                    <span className="text-right tabular-nums text-muted-foreground">{formatNumber(exit.count)}</span>
                  </li>
                ))}
              </ul>
            </Block>

            {signals.length > 0 && (
              <Block title="Ce qui s'y passe">
                <ul className="space-y-1 text-sm">
                  {signals.map(({ count, did }) => (
                    <li key={did} className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {plural(count, "session")} ({formatShare(count, shown.reached)})
                      </span>{" "}
                      {did}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {detail.refused.length > 0 && (
              <Block title={`Options refusées, le maximum${screen?.maxSelections ? ` de ${screen.maxSelections}` : ""} étant atteint`}>
                <ul className="space-y-1.5">
                  {detail.refused.slice(0, 8).map((refused) => (
                    <li key={refused.value} className="grid grid-cols-[minmax(0,1fr)_6rem_3rem] items-center gap-3 text-sm">
                      <span className="truncate text-foreground">{answerLabel(dataset, shown.id, refused.value)}</span>
                      <Meter value={refused.journeys} total={shown.reached} />
                      <span className="text-right tabular-nums text-muted-foreground">{formatNumber(refused.journeys)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Sessions qui ont voulu ajouter cette option sans pouvoir.</p>
              </Block>
            )}

            {detail.answers && (
              <Block title="Réponses">
                <AnswerTable breakdown={detail.answers} dataset={dataset} signUp={cohortHasSignUp(journeys)} />
              </Block>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
