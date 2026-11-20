"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { agree, formatMs, formatNumber, formatShare, plural } from "@/lib/format"
import { branchLabel, stepTypeLabel } from "@/lib/onboarding-journal/labels"
import { screenStats, share, type CohortJourney, type ScreenStat } from "@/lib/onboarding-journal/report"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { EmptyState, Hint, Pills, SplitBar, TONE } from "./primitives"
import { ALL_SCOPE, flowLabel, offeredScope, scopeOf, scopeOptions, type ScopeKey } from "./scopes"
import { ScreenDetailSheet } from "./screen-detail-sheet"

// ---- Columns ----

type SortKey = "flow" | "reached" | "exits" | "medianMs" | SignalKey
type SignalKey = "backs" | "backgrounds" | "maxReached" | "changedMind" | "disabledTaps"

const SIGNALS: Array<{ key: SignalKey; label: string; hint: string }> = [
  { key: "backs", label: "Retours", hint: "Sessions qui ont quitté l'écran par la flèche retour." },
  { key: "backgrounds", label: "App quittée", hint: "Sessions qui ont mis l'app en arrière-plan sur cet écran." },
  { key: "maxReached", label: "Limite", hint: "Sessions qui ont voulu sélectionner plus d'options que le maximum autorisé." },
  {
    key: "changedMind",
    label: "Hésitations",
    hint: "Sessions qui ont changé de réponse avant de valider : plusieurs options touchées sur un choix unique, ou une case décochée sur un choix multiple.",
  },
  { key: "disabledTaps", label: "Bouton inactif", hint: "Sessions qui ont tapé le bouton principal alors qu'il était désactivé." },
]

const sortValue = (stat: ScreenStat, key: Exclude<SortKey, "flow">): number => stat[key] ?? -1

function SortHeader({
  label,
  hint,
  active,
  direction = "descending",
  onSort,
  align = "right",
}: {
  label: string
  hint?: string
  active: boolean
  /** Order the column sorts in: every figure from the biggest, the flow from its start. */
  direction?: "ascending" | "descending"
  onSort: () => void
  align?: "left" | "right"
}) {
  const button = (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <ArrowDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-0")} aria-hidden />
    </button>
  )
  return (
    <TableHead className={cn("h-10 px-3", align === "right" && "text-right")} aria-sort={active ? direction : undefined}>
      {hint ? <Hint text={hint}>{button}</Hint> : button}
    </TableHead>
  )
}

/** A count whose background darkens with the share of the screen's sessions it stands for. */
function HeatCell({ count, whole }: { count: number; whole: number }) {
  if (count === 0) return <TableCell className="px-3 py-2 text-right text-sm text-muted-foreground/50">–</TableCell>
  const strength = Math.min(60, 8 + (share(count, whole) ?? 0) * 0.7)
  return (
    <TableCell className="px-3 py-2 text-right">
      <Hint text={`${plural(count, "session")} sur ${formatNumber(whole)} (${formatShare(count, whole)})`}>
        <span
          className="inline-block min-w-9 cursor-default rounded px-1.5 py-0.5 text-center text-sm tabular-nums text-foreground"
          style={{ backgroundColor: `color-mix(in srgb, ${TONE.reach} ${strength}%, transparent)` }}
        >
          {formatNumber(count)}
        </span>
      </Hint>
    </TableCell>
  )
}

/** Under this many sessions on either side, a difference between two periods is noise. */
const MIN_COMPARABLE = 20
/** Differences smaller than this (in points) are not flagged. */
const MIN_DELTA_POINTS = 0.5
/** Nor are those worth fewer sessions than this: one person more or less is not a change. */
const MIN_DELTA_SESSIONS = 2

/** Change of the share of sessions that stop on the screen, against the previous period. */
function ExitDelta({ stat, before }: { stat: ScreenStat; before: ScreenStat | undefined }) {
  if (!before || before.reached < MIN_COMPARABLE || stat.reached < MIN_COMPARABLE) return null
  const diff = (share(stat.exits, stat.reached) ?? 0) - (share(before.exits, before.reached) ?? 0)
  if (Math.abs(diff) < MIN_DELTA_POINTS) return null
  // The exits this period would have counted at the rate of the previous one.
  const expectedExits = (before.exits / before.reached) * stat.reached
  if (Math.abs(stat.exits - expectedExits) < MIN_DELTA_SESSIONS) return null
  const worse = diff > 0
  const Icon = worse ? TrendingUp : TrendingDown
  return (
    <Hint text={`${formatShare(before.exits, before.reached, 1)} sur la période précédente (${formatNumber(before.exits)} sur ${formatNumber(before.reached)})`}>
      <span className="inline-flex cursor-default items-center gap-1 text-xs tabular-nums" style={{ color: worse ? TONE.lost : TONE.won }}>
        <Icon className="h-3 w-3" aria-hidden />
        {worse ? "+" : "−"}
        {formatNumber(Math.abs(diff), 1)} pts
      </span>
    </Hint>
  )
}

export function ScreensTab({
  journeys,
  baselineJourneys,
  dataset,
  scopeKey,
  onScopeChange,
  openScreenId,
  onOpenScreen,
}: {
  journeys: CohortJourney[]
  /** Same filters over the previous period, when the comparison is on. */
  baselineJourneys?: CohortJourney[] | null
  dataset: OnboardingDataset
  /** Flow picked; another one is shown when the journeys no longer have it. */
  scopeKey: ScopeKey
  onScopeChange: (key: ScopeKey) => void
  /** Screen whose detail panel is open. */
  openScreenId: string | null
  onOpenScreen: (screenId: string | null) => void
}) {
  const options = useMemo(() => scopeOptions(journeys, "Tous les écrans (classement)"), [journeys])
  const shownScope = offeredScope(options, scopeKey)
  const ranking = shownScope === ALL_SCOPE

  // null: the order that suits the scope — the flow, or the biggest leaks for the ranking of all screens.
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null)
  const sort: SortKey = chosenSort ?? (ranking ? "exits" : "flow")

  const scope = useMemo(() => scopeOf(shownScope), [shownScope])
  const stats = useMemo(() => screenStats(journeys, scope), [journeys, scope])
  const before = useMemo(
    () => (baselineJourneys ? new Map(screenStats(baselineJourneys, scope).screens.map((stat) => [stat.id, stat])) : null),
    [baselineJourneys, scope],
  )

  // "#": the position in the flow; across parcours there is no single flow, so the rank in the list.
  const rows = useMemo(() => {
    const flowPosition = new Map(stats.screens.map((stat, index) => [stat.id, index + 1]))
    const ordered = sort === "flow" ? stats.screens : [...stats.screens].sort((a, b) => sortValue(b, sort) - sortValue(a, sort))
    return ordered.map((stat, index) => ({ stat, position: ranking ? index + 1 : (flowPosition.get(stat.id) ?? 0) }))
  }, [stats, sort, ranking])

  const signals = SIGNALS.filter(({ key }) => stats.screens.some((stat) => stat[key] > 0))
  const openStat = stats.screens.find((stat) => stat.id === openScreenId) ?? null

  // A filter, a period or a scope that no longer has the open screen closes its panel for good:
  // it must not reopen by itself when the screen comes back.
  useEffect(() => {
    if (openScreenId !== null && openStat === null) onOpenScreen(null)
  }, [openScreenId, openStat, onOpenScreen])

  const changeScope = (key: ScopeKey) => {
    setChosenSort(null)
    onScopeChange(key)
  }

  return (
    <div className="space-y-4">
      <Pills options={options} value={shownScope} onChange={changeScope} label="Écrans à afficher" />

      <p className="text-sm text-muted-foreground">
        {scope.kind === "trunk" &&
          `Les écrans que tout le monde voit, avant le choix du parcours : ${plural(stats.journeys, "session")}.`}
        {scope.kind === "parcours" &&
          `Les écrans du parcours « ${branchLabel(scope.branch)} », jusqu'à l'inscription, pour ${agree(stats.journeys, "la", "les")} ${plural(stats.journeys, "session")} qui ${agree(stats.journeys, "l'a", "l'ont")} choisi.`}
        {scope.kind === "all" && "Tous les écrans de tous les parcours. Un clic sur un en-tête de colonne change le classement."}{" "}
        Un clic sur une ligne ouvre le détail de l'écran.
      </p>

      {rows.length === 0 ? (
        <EmptyState>Aucun écran vu sur cette sélection.</EmptyState>
      ) : (
        <Card className="border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: TONE.reach }} />
              voient l'écran et continuent
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: TONE.lost }} />
              s'arrêtent sur l'écran
            </span>
            <span>Barres en part des {plural(stats.journeys, "session")} du périmètre.</span>
            {before && (
              <span>
                Abandons : l'écart avec la période précédente n'est signalé que s'il pèse au moins {MIN_DELTA_SESSIONS} sessions.
              </span>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {ranking ? (
                  <TableHead className="h-10 px-3 text-xs">#</TableHead>
                ) : (
                  <SortHeader
                    label="#"
                    hint="Position dans le parcours. Un clic remet les écrans dans l'ordre du parcours."
                    active={sort === "flow"}
                    direction="ascending"
                    onSort={() => setChosenSort("flow")}
                    align="left"
                  />
                )}
                <TableHead className="h-10 px-3 text-xs">Écran</TableHead>
                <SortHeader label="Sessions" hint="Sessions qui ont vu l'écran." active={sort === "reached"} onSort={() => setChosenSort("reached")} align="left" />
                <SortHeader
                  label="Abandons"
                  hint="Sessions qui n'ont pas fini le tunnel et dont c'est le dernier écran affiché. « Après » : temps passé sur l'écran avant de partir (médiane), quand il est connu."
                  active={sort === "exits"}
                  onSort={() => setChosenSort("exits")}
                />
                <SortHeader label="Temps" hint="Temps médian passé sur l'écran par session, app au premier plan." active={sort === "medianMs"} onSort={() => setChosenSort("medianMs")} />
                {signals.map((signal) => (
                  <SortHeader key={signal.key} label={signal.label} hint={signal.hint} active={sort === signal.key} onSort={() => setChosenSort(signal.key)} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ stat, position }) => {
                const screen = dataset.screens[stat.id]
                return (
                  <TableRow key={stat.id} className="cursor-pointer" onClick={() => onOpenScreen(stat.id)}>
                    <TableCell className="px-3 py-2 text-sm tabular-nums text-muted-foreground">{position}</TableCell>
                    <TableCell className="min-w-[16rem] px-3 py-2">
                      {/* The row is clickable; this button makes it reachable from the keyboard. */}
                      <button
                        type="button"
                        className="line-clamp-2 text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {screen?.title ?? stat.id}
                      </button>
                      <span className="block text-xs text-muted-foreground">
                        {[stat.id, stepTypeLabel(screen?.type ?? ""), ranking ? flowLabel(stat.id, stat.branches) : null].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell className="w-48 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                          {formatNumber(stat.reached)}
                        </span>
                        <SplitBar
                          total={stats.journeys}
                          segments={[
                            { value: stat.reached - stat.exits, color: TONE.reach },
                            { value: stat.exits, color: TONE.lost },
                          ]}
                        />
                      </div>
                      {stat.skipped > 0 && (
                        <span className="block whitespace-nowrap pl-10 text-xs text-muted-foreground">
                          conditionnel : vu par {formatShare(stat.reached, stat.reached + stat.skipped)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      {stat.exits > 0 ? (
                        <>
                          <span className="block whitespace-nowrap text-sm tabular-nums text-foreground">
                            <span className="font-semibold">{formatNumber(stat.exits)}</span>
                            <span className="text-muted-foreground"> · {formatShare(stat.exits, stat.reached, 1)}</span>
                          </span>
                          {stat.exitMedianMs !== null && (
                            <span className="block whitespace-nowrap text-xs text-muted-foreground">après {formatMs(stat.exitMedianMs)}</span>
                          )}
                        </>
                      ) : (
                        <span className="block text-sm text-muted-foreground/50">–</span>
                      )}
                      <ExitDelta stat={stat} before={before?.get(stat.id)} />
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <span className="block whitespace-nowrap text-sm tabular-nums text-foreground">{formatMs(stat.medianMs)}</span>
                      <span className="block whitespace-nowrap text-xs text-muted-foreground">90 % sous {formatMs(stat.p90Ms)}</span>
                    </TableCell>
                    {signals.map((signal) => (
                      <HeatCell key={signal.key} count={stat[signal.key]} whole={stat.reached} />
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <ScreenDetailSheet stat={openStat} onClose={() => onOpenScreen(null)} journeys={journeys} scope={scope} dataset={dataset} />
    </div>
  )
}
