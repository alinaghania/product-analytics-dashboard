"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { agree, formatNumber, formatShare, plural } from "@/lib/format"
import { allowsSeveralAnswers, answerLabel, type AnswerBreakdown } from "@/lib/onboarding-journal/report"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { Hint, Meter } from "./primitives"

/** Under this many sessions, a conversion rate is too fragile to be read as a difference. */
const SMALL_SAMPLE = 10

/** How far the sessions that gave an answer went afterwards. */
function Rate({ part, whole, decimals = 0 }: { part: number; whole: number; decimals?: number }) {
  return (
    <TableCell className="px-2 py-2 text-right text-sm">
      <Hint text={`${formatNumber(part)} sur ${plural(whole, "session")}`}>
        <span className={cn("cursor-default tabular-nums", whole < SMALL_SAMPLE ? "text-muted-foreground" : "text-foreground")}>
          {formatShare(part, whole, decimals)}
        </span>
      </Hint>
    </TableCell>
  )
}

/**
 * The answers left on one screen, most frequent first, and for each answer how
 * far the sessions that gave it went.
 */
export function AnswerTable({
  breakdown,
  dataset,
  signUp,
}: {
  breakdown: AnswerBreakdown
  dataset: OnboardingDataset
  /** The tunnel goes on to the sign-up and the paywall (not a re-onboarding): shows those two columns. */
  signUp: boolean
}) {
  const screen = dataset.screens[breakdown.screenId]
  const outcomes = signUp ? "« Terminent », « Compte créé », « Abonnées »" : "« Terminent »"

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {plural(breakdown.answered, "session")} sur {formatNumber(breakdown.reached)} ({formatShare(breakdown.answered, breakdown.reached)}){" "}
        {agree(breakdown.answered, "a répondu", "ont répondu")} sur cet écran
        {allowsSeveralAnswers(screen?.type) && " — plusieurs réponses possibles, leur total peut dépasser 100 %"}.
      </p>

      {breakdown.options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {screen?.personal
            ? "Les valeurs saisies ne sont pas listées : elles désignent la personne."
            : "Les valeurs saisies ne sont pas listées : chaque date est différente."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-2 text-xs">Réponse</TableHead>
                <TableHead className="h-9 w-[32%] px-2 text-xs">Sessions</TableHead>
                <TableHead className="h-9 px-2 text-right text-xs">Terminent</TableHead>
                {signUp && <TableHead className="h-9 px-2 text-right text-xs">Compte créé</TableHead>}
                {signUp && <TableHead className="h-9 px-2 text-right text-xs">Abonnées</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.options.map((option) => (
                <TableRow key={option.value}>
                  <TableCell className="px-2 py-2 text-sm text-foreground">
                    {answerLabel(dataset, breakdown.screenId, option.value)}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                        {formatNumber(option.count)}
                      </span>
                      <Meter value={option.count} total={breakdown.answered} />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {formatShare(option.count, breakdown.answered)}
                      </span>
                    </div>
                  </TableCell>
                  <Rate part={option.completed} whole={option.count} />
                  {signUp && <Rate part={option.registered} whole={option.count} />}
                  {signUp && <Rate part={option.subscribed} whole={option.count} decimals={1} />}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            {breakdown.unlisted > 0 &&
              `+ ${plural(breakdown.unlisted, "autre valeur moins fréquente", "autres valeurs moins fréquentes")}. `}
            {outcomes} : part des sessions ayant donné la réponse qui vont ensuite jusque-là — en gris sous {SMALL_SAMPLE} sessions, où un
            écart ne veut rien dire.
          </p>
        </>
      )}
    </div>
  )
}
