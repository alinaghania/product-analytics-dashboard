"use client"

import { useMemo, useState } from "react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { DataTable } from "@/components/tables/data-table"
import { Input } from "@/components/ui/input"
import { formatInParis } from "@/lib/analytics"
import { formatMs, formatNumber, plural } from "@/lib/format"
import { branchLabel } from "@/lib/onboarding-journal/labels"
import { OUTCOMES, type CohortJourney, type Outcome } from "@/lib/onboarding-journal/report"
import { acquisitionSource } from "@/lib/onboarding-journal/segments"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { COVERAGE_NOTES, JourneySheet } from "./journey-sheet"
import { OutcomeBadge, Pills, outcomeStyle, type PillOption } from "./primitives"

/** "all", an outcome, or "excluded" (journeys left out of the statistics). */
type ListKey = "all" | Outcome | "excluded"

const PAGE_SIZE = 25

const startOf = (journey: CohortJourney): string => formatInParis(journey.startedAt, "d MMM HH:mm")

function columnsFor(dataset: OnboardingDataset): ColumnDef<CohortJourney>[] {
  const lastScreen = (journey: CohortJourney) => dataset.screens[journey.lastStepId ?? ""]?.title ?? journey.lastStepId ?? "—"
  return [
    {
      id: "start",
      header: "Début",
      cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{startOf(row.original)}</span>,
    },
    {
      id: "name",
      header: "Prénom",
      // The row is clickable; this button makes it reachable from the keyboard.
      cell: ({ row }) => (
        <button
          type="button"
          aria-label={`Ouvrir la session de ${row.original.name ?? "prénom inconnu"} du ${startOf(row.original)}`}
          className="block max-w-[9rem] truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.name ?? "—"}
        </button>
      ),
    },
    {
      id: "branch",
      header: "Parcours",
      cell: ({ row }) => (row.original.branch ? branchLabel(row.original.branch) : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "outcome",
      header: "Où elle en est",
      cell: ({ row: { original: journey } }) => (
        <>
          <OutcomeBadge outcome={journey.outcome} flow={journey.flow} />
          {journey.coverage !== "full" && (
            <span className="block text-xs text-muted-foreground" title={COVERAGE_NOTES[journey.coverage]}>
              {journey.coverage === "register" ? "inscription seule" : "journal incomplet"}
            </span>
          )}
        </>
      ),
    },
    {
      id: "last",
      header: "Dernier écran",
      cell: ({ row }) => (
        <span className="block max-w-[16rem] truncate text-muted-foreground" title={lastScreen(row.original)}>
          {lastScreen(row.original)}
        </span>
      ),
    },
    {
      id: "screens",
      header: "Écrans",
      cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.steps.length)}</span>,
    },
    {
      id: "time",
      header: "Temps",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">{formatMs(row.original.steps.reduce((total, step) => total + step.ms, 0))}</span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => <span className="text-muted-foreground">{acquisitionSource(row.original, dataset) ?? "—"}</span>,
    },
  ]
}

/** The journeys one by one, most recent first; a click opens the whole journey. */
export function SessionsTab({
  journeys,
  excluded,
  flow,
  dataset,
}: {
  journeys: CohortJourney[]
  /** Journeys matching the filters but left out of the statistics. */
  excluded: CohortJourney[]
  /** Flow of the journeys listed (the page shows one at a time). */
  flow: string
  dataset: OnboardingDataset
}) {
  const [pickedList, setPickedList] = useState<ListKey>("all")
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })
  const [openId, setOpenId] = useState<string | null>(null)

  const lists = useMemo<PillOption<ListKey>[]>(() => {
    const perOutcome = (outcome: Outcome) => journeys.filter((journey) => journey.outcome === outcome).length
    return [
      { value: "all" as const, label: "Toutes", count: journeys.length },
      // From the most to the least advanced.
      ...[...OUTCOMES].reverse().map((outcome) => ({ value: outcome, label: outcomeStyle(outcome, flow).label, count: perOutcome(outcome) })),
      { value: "excluded" as const, label: "Hors statistiques", count: excluded.length },
    ].filter((list) => list.value === "all" || list.count > 0)
  }, [journeys, excluded, flow])
  // The list picked, unless a filter or another period has emptied it since.
  const listKey = lists.some((list) => list.value === pickedList) ? pickedList : "all"

  const rows = useMemo(() => {
    const listed = listKey === "excluded" ? excluded : listKey === "all" ? journeys : journeys.filter((journey) => journey.outcome === listKey)
    const needle = search.trim().toLocaleLowerCase("fr")
    if (!needle) return listed
    return listed.filter(
      (journey) => journey.name?.toLocaleLowerCase("fr").includes(needle) || journey.id.startsWith(needle) || journey.userId === search.trim(),
    )
  }, [journeys, excluded, listKey, search])

  const columns = useMemo(() => columnsFor(dataset), [dataset])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1)
  const open = [...journeys, ...excluded].find((journey) => journey.id === openId) ?? null
  const toFirstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills
          options={lists}
          value={listKey}
          onChange={(key) => {
            setPickedList(key)
            toFirstPage()
          }}
          label="Sessions à afficher"
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            toFirstPage()
          }}
          placeholder="Prénom, identifiant de session ou d'utilisatrice"
          aria-label="Rechercher une session"
          className="h-9 w-full sm:w-80"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {plural(rows.length, "session")}, de la plus récente à la plus ancienne (heure de Paris). Un clic sur une ligne ouvre son parcours écran
        par écran.
        {listKey === "excluded" &&
          " Celles-ci ont un journal qui ne couvre pas tout le parcours : elles fausseraient le tunnel, elles ne comptent donc dans aucune statistique de la page."}
      </p>

      <DataTable
        columns={columns}
        data={rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)}
        pageCount={pageCount}
        pagination={{ ...pagination, pageIndex }}
        onPaginationChange={setPagination}
        onRowClick={(journey) => setOpenId(journey.id)}
        emptyMessage="Aucune session ne correspond."
      />

      <JourneySheet journey={open} onClose={() => setOpenId(null)} dataset={dataset} />
    </div>
  )
}
