"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMs, formatNumber, formatShare, plural } from "@/lib/format"
import { cohortHasSignUp, type CohortJourney } from "@/lib/onboarding-journal/report"
import { buildSegments, type SegmentRow } from "@/lib/onboarding-journal/segments"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { Hint, Meter, TONE } from "./primitives"

/** Under this many sessions, the rates of a group are too fragile to compare. */
const SMALL_GROUP = 10

function RateCell({ part, row, color, decimals = 0 }: { part: number; row: SegmentRow; color: string; decimals?: number }) {
  return (
    <TableCell className="px-2 py-2">
      <Hint text={`${formatNumber(part)} sur ${plural(row.journeys, "session")}`}>
        <div className="cursor-default space-y-1">
          <span className={cn("block text-right text-sm tabular-nums", row.journeys < SMALL_GROUP ? "text-muted-foreground" : "text-foreground")}>
            {formatShare(part, row.journeys, decimals)}
          </span>
          <Meter value={part} total={row.journeys} color={color} className="h-1" />
        </div>
      </Hint>
    </TableCell>
  )
}

/** The tunnel cut by who the person is and what she uses, one table per cut. */
export function SegmentsTab({ journeys, dataset }: { journeys: CohortJourney[]; dataset: OnboardingDataset }) {
  const dimensions = useMemo(() => buildSegments(journeys, dataset), [journeys, dataset])
  // A re-onboarding has no account to create and no paywall.
  const signUp = cohortHasSignUp(journeys)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pour chaque groupe : la part de ses sessions qui {signUp ? "terminent l'onboarding, créent un compte, s'abonnent" : "terminent l'onboarding"}
        . En gris sous {SMALL_GROUP} sessions, où un écart ne veut rien dire.
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {dimensions.map((dimension) => (
          <Card key={dimension.key} className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">{dimension.title}</CardTitle>
              {dimension.note && <p className="text-xs text-muted-foreground">{dimension.note}</p>}
            </CardHeader>
            <CardContent className="px-4">
              <Table className="table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[5.25rem]" />
                  <col className="w-[4.5rem]" />
                  {signUp && <col className="w-[4.5rem]" />}
                  {signUp && <col className="w-[4.5rem]" />}
                  <col className="w-[4.75rem]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-2 text-xs">Groupe</TableHead>
                    <TableHead className="h-9 px-2 text-right text-xs">Sessions</TableHead>
                    <TableHead className="h-9 px-2 text-right text-xs">Terminent</TableHead>
                    {signUp && <TableHead className="h-9 px-2 text-right text-xs leading-tight">Compte créé</TableHead>}
                    {signUp && <TableHead className="h-9 px-2 text-right text-xs">Abonnées</TableHead>}
                    <TableHead className="h-9 px-2 text-right text-xs">Temps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dimension.rows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="px-2 py-2 text-sm leading-snug text-foreground">{row.label}</TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-2 text-right text-sm tabular-nums">
                        <span className="font-medium text-foreground">{formatNumber(row.journeys)}</span>
                        <span className="text-muted-foreground"> · {formatShare(row.journeys, journeys.length)}</span>
                      </TableCell>
                      <RateCell part={row.completed} row={row} color={TONE.reach} />
                      {signUp && <RateCell part={row.registered} row={row} color={TONE.reach} />}
                      {signUp && <RateCell part={row.subscribed} row={row} color={TONE.won} decimals={1} />}
                      <TableCell className="whitespace-nowrap px-2 py-2 text-right text-sm tabular-nums text-muted-foreground">
                        {formatMs(row.medianCompletionMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
