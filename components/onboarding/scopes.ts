import { REGISTER_STEP_ID, branchLabel } from "@/lib/onboarding-journal/labels"
import { countBy, ranked, type CohortJourney, type ScreenScope } from "@/lib/onboarding-journal/report"
import type { PillOption } from "./primitives"

// The tabs that go screen by screen show one flow at a time: the trunk every
// session goes through, one parcours, or everything together.

/** "trunk", "all", or the code of a parcours. */
export type ScopeKey = string

export const TRUNK_SCOPE: ScopeKey = "trunk"
export const ALL_SCOPE: ScopeKey = "all"

export function scopeOf(key: ScopeKey): ScreenScope {
  if (key === TRUNK_SCOPE) return { kind: "trunk" }
  if (key === ALL_SCOPE) return { kind: "all" }
  return { kind: "parcours", branch: key }
}

/** Where a screen sits: the trunk, one parcours, or several of them. */
export function flowLabel(screenId: string, branches: string[]): string {
  if (screenId === REGISTER_STEP_ID) return "Fin de tous les parcours"
  if (branches.length === 0) return "Tronc commun"
  return branches.length === 1 ? branchLabel(branches[0]) : `Commun à ${branches.length} parcours`
}

/** The trunk, then the parcours from the most to the least chosen, then everything together. */
export function scopeOptions(journeys: CohortJourney[], allLabel: string): PillOption<ScopeKey>[] {
  return [
    { value: TRUNK_SCOPE, label: "Début · tronc commun", count: journeys.length },
    ...ranked(countBy(journeys, (journey) => journey.branch)).map(({ key, count }) => ({
      value: key,
      label: branchLabel(key),
      count,
    })),
    { value: ALL_SCOPE, label: allLabel },
  ]
}

/**
 * The scope to show: the one picked, unless a filter or another period has
 * since left it without journeys — then the trunk.
 */
export const offeredScope = (options: PillOption<ScopeKey>[], picked: ScopeKey): ScopeKey =>
  options.some((option) => option.value === picked) ? picked : TRUNK_SCOPE
