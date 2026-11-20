"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShare, plural } from "@/lib/format"
import { stepTypeLabel } from "@/lib/onboarding-journal/labels"
import { cohortHasSignUp, listQuestions, type CohortJourney } from "@/lib/onboarding-journal/report"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { AnswerTable } from "./answer-table"
import { EmptyState, Pills } from "./primitives"
import { ALL_SCOPE, flowLabel, offeredScope, scopeOf, scopeOptions, TRUNK_SCOPE, type ScopeKey } from "./scopes"

/**
 * What people answer, question by question, and how far each answer goes
 * afterwards: the questions of a flow on the left, the answers of the selected
 * one on the right.
 */
export function AnswersTab({ journeys, dataset }: { journeys: CohortJourney[]; dataset: OnboardingDataset }) {
  const [pickedScope, setPickedScope] = useState<ScopeKey>(TRUNK_SCOPE)
  const [pickedId, setPickedId] = useState<string | null>(null)

  const options = useMemo(() => scopeOptions(journeys, "Tous parcours confondus"), [journeys])
  const scopeKey = offeredScope(options, pickedScope)
  const questions = useMemo(() => listQuestions(journeys, scopeOf(scopeKey), dataset), [journeys, scopeKey, dataset])
  // Until one is picked (or when the pick is not in the new flow): the first question whose answers can be listed.
  const selected =
    questions.find((question) => question.screenId === pickedId) ??
    questions.find((question) => question.options.length > 0) ??
    questions[0]

  return (
    <div className="space-y-4">
      <Pills options={options} value={scopeKey} onChange={setPickedScope} label="Questions à afficher" />

      {!selected ? (
        <EmptyState>Aucune réponse enregistrée sur cette sélection.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">{plural(questions.length, "question")}</CardTitle>
              <p className="text-xs text-muted-foreground">Dans l'ordre du parcours</p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ul className="max-h-[34rem] space-y-0.5 overflow-y-auto">
                {questions.map((question) => {
                  const active = question.screenId === selected.screenId
                  return (
                    <li key={question.screenId}>
                      <button
                        type="button"
                        aria-current={active}
                        onClick={() => setPickedId(question.screenId)}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="line-clamp-2 text-sm text-foreground">{dataset.screens[question.screenId]?.title ?? question.screenId}</span>
                        <span className="text-xs text-muted-foreground">
                          {plural(question.answered, "réponse")} · {formatShare(question.answered, question.reached)} des sessions qui voient l'écran
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium leading-snug text-foreground">
                {dataset.screens[selected.screenId]?.title ?? selected.screenId}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {[
                  selected.screenId,
                  stepTypeLabel(dataset.screens[selected.screenId]?.type ?? ""),
                  scopeKey === ALL_SCOPE ? flowLabel(selected.screenId, selected.branches) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </CardHeader>
            <CardContent>
              <AnswerTable breakdown={selected} dataset={dataset} signUp={cohortHasSignUp(journeys)} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
