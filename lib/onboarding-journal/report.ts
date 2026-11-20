import { toDayKey } from "@/lib/analytics"
import { REGISTER_STEP_ID } from "./labels"
import type { Journey, OnboardingDataset, StepVisit } from "./types"

// Statistics of the Onboarding page, computed in the browser from the
// journeys of the dataset: changing a filter never calls the server.

// ---- Small statistics helpers ----

/** Nearest-rank percentile: the smallest value of the list that a share `p` of it does not exceed. Null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  // The epsilon keeps 0.9 × 30 = 27.000000000000004 from being rounded up to the next rank.
  const rank = Math.ceil(p * sorted.length - 1e-9)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

/** Median: the middle value, or the mean of the two middle ones. Null for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Share in percent points; null when there is nothing to divide by. */
export const share = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null)

/** How many items have each key; items without a key are left out. */
export function countBy<T>(items: Iterable<T>, keyOf: (item: T) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyOf(item)
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Entries of a count map, most frequent first. */
export function ranked(counts: Map<string, number>): Array<{ key: string; count: number }> {
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

// ---- Cohort ----

/**
 * Where a journey stands, from the least to the most advanced:
 * - live: short of the end of its tunnel, but active in the last half hour;
 * - abandoned: onboarding not finished;
 * - completed: onboarding finished, no account;
 * - registered: account created, no subscription taken on the onboarding paywall;
 * - subscribed: subscription taken on the onboarding paywall.
 */
export type Outcome = "live" | "abandoned" | "completed" | "registered" | "subscribed"

export const OUTCOMES: Outcome[] = ["live", "abandoned", "completed", "registered", "subscribed"]

const LIVE_WINDOW_MS = 30 * 60 * 1000

export interface CohortJourney extends Journey {
  outcome: Outcome
}

export interface JourneyFilters {
  flow: string
  version?: string
  platform?: string
  lang?: string
}

export interface Cohort {
  /** Journeys the statistics are computed on: the journal covers them from their first screen. */
  journeys: CohortJourney[]
  /** Journeys matching the filters but left out of the statistics: see their `coverage`. */
  excluded: CohortJourney[]
}

/**
 * Existing users sent through the onboarding again ("reonboarding"): for them
 * the tunnel ends with the onboarding itself — no sign-up, no paywall.
 */
export const hasSignUp = (flow: string): boolean => flow !== "reonboarding"

/** A cohort holds journeys of one flow: whether theirs goes on to the sign-up and the paywall. */
export const cohortHasSignUp = (journeys: CohortJourney[]): boolean => journeys.length === 0 || hasSignUp(journeys[0].flow)

function outcomeOf(journey: Journey, nowMs: number): Outcome {
  if (journey.paywallResult === "purchased") return "subscribed"
  if (journey.status === "registered") return "registered"
  const active = nowMs - journey.lastActivityAt < LIVE_WINDOW_MS
  // On the sign-up screen a moment ago: she may still be typing her e-mail.
  if (journey.status === "completed") return active && hasSignUp(journey.flow) ? "live" : "completed"
  return active ? "live" : "abandoned"
}

export const finishedOnboarding = (journey: Journey): boolean =>
  journey.status === "completed" || journey.status === "registered"

export const hasAccount = (journey: Journey): boolean => journey.status === "registered"

/** A paywall was actually shown, whatever the answer. */
export const sawPaywall = (journey: Journey): boolean =>
  journey.paywallResult === "purchased" || journey.paywallResult === "restored" || journey.paywallResult === "cancelled"

/** Short of the end of its tunnel and no longer active: its last screen is where it stopped. */
export const stoppedShort = (journey: CohortJourney): boolean =>
  journey.outcome === "abandoned" || (journey.outcome === "completed" && hasSignUp(journey.flow))

/**
 * Left the sign-up screen without an account after tapping "J'ai déjà un
 * compte": most likely an existing user. Whether she then signed in is not
 * in the journal.
 */
export const tappedLogin = (journey: CohortJourney): boolean =>
  journey.outcome === "completed" && (journey.register?.loginTaps ?? 0) > 0

export function selectCohort(dataset: OnboardingDataset, filters: JourneyFilters): Cohort {
  // "Now" is when the dataset was computed: a cached dataset keeps its own picture of who was active.
  const nowMs = Date.parse(dataset.generatedAt)
  const cohort: Cohort = { journeys: [], excluded: [] }
  for (const journey of dataset.journeys) {
    if (journey.flow !== filters.flow) continue
    if (filters.version && journey.appVersion !== filters.version) continue
    if (filters.platform && journey.platform !== filters.platform) continue
    if (filters.lang && journey.lang !== filters.lang) continue
    const withOutcome = { ...journey, outcome: outcomeOf(journey, nowMs) }
    if (journey.coverage === "full") cohort.journeys.push(withOutcome)
    else cohort.excluded.push(withOutcome)
  }
  return cohort
}

/** Values a filter can take, most frequent first. */
export function filterChoices(dataset: OnboardingDataset, field: "appVersion" | "platform" | "lang" | "flow"): string[] {
  return ranked(countBy(dataset.journeys, (journey) => journey[field])).map((entry) => entry.key)
}

// ---- Tunnel ----

export type StageKey = "started" | "parcours" | "completed" | "registered" | "paywall" | "subscribed"

export interface FunnelStage {
  key: StageKey
  count: number
}

export type DailyOutcomes = { date: string; total: number } & Record<Outcome, number>

export interface JournalSummary {
  /** Flow the journeys belong to: the tunnel of a re-onboarding stops at "completed". */
  flow: string
  journeys: number
  stages: FunnelStage[]
  outcomes: Record<Outcome, number>
  /** Median foreground time from the first screen to the end of the onboarding, sign-up excluded. */
  medianCompletionMs: number | null
  /** Finished the onboarding, then tapped "J'ai déjà un compte" instead of creating one. */
  tappedLogin: number
  /** Accounts that were already premium: no paywall to show them. */
  alreadyPremium: number
  /** Journeys spread over several app launches, and how many of those finished the onboarding. */
  resumed: { journeys: number; completed: number }
  /** One row per start day of the range, Europe/Paris. */
  daily: DailyOutcomes[]
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (; cursor <= end && days.length < 400; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10))
  }
  return days
}

const emptyOutcomes = (): Record<Outcome, number> => ({ live: 0, abandoned: 0, completed: 0, registered: 0, subscribed: 0 })

/** A visit whose duration is known: it was left, or the app logged the time before it was closed on it. */
const timed = (visit: StepVisit): boolean => visit.exit !== undefined || visit.ms > 0

/** Foreground time spent in the onboarding itself (every screen but the sign-up one). */
export const onboardingMs = (journey: Journey): number =>
  journey.steps.reduce((total, step) => (step.id === REGISTER_STEP_ID ? total : total + step.ms), 0)

export function summarize(journeys: CohortJourney[], range: { from: string; to: string }, flow: string): JournalSummary {
  const outcomes = emptyOutcomes()
  const daily = new Map<string, DailyOutcomes>(
    daysBetween(range.from, range.to).map((date) => [date, { date, total: 0, ...emptyOutcomes() }]),
  )
  const count = (test: (journey: CohortJourney) => boolean) => journeys.filter(test).length

  for (const journey of journeys) {
    outcomes[journey.outcome]++
    const day = daily.get(toDayKey(new Date(journey.startedAt)))
    if (day) {
      day.total++
      day[journey.outcome]++
    }
  }

  const stages: FunnelStage[] = [
    { key: "started", count: journeys.length },
    { key: "parcours", count: count((j) => j.branch !== undefined) },
    { key: "completed", count: count(finishedOnboarding) },
  ]
  if (hasSignUp(flow)) {
    stages.push(
      { key: "registered", count: count(hasAccount) },
      { key: "paywall", count: count(sawPaywall) },
      { key: "subscribed", count: outcomes.subscribed },
    )
  }

  const resumed = journeys.filter((journey) => journey.launches > 1)
  return {
    flow,
    journeys: journeys.length,
    stages,
    outcomes,
    medianCompletionMs: median(journeys.filter(finishedOnboarding).map(onboardingMs)),
    tappedLogin: count(tappedLogin),
    alreadyPremium: count((j) => j.paywallResult === "already_premium"),
    resumed: { journeys: resumed.length, completed: resumed.filter(finishedOnboarding).length },
    daily: [...daily.values()],
  }
}

// ---- Screens ----

/**
 * Which screens a table lists, and for which journeys:
 * - trunk: the screens everybody sees, before the parcours is chosen;
 * - parcours: the screens of one parcours, for the journeys that entered it;
 * - all: every screen of every journey (rankings).
 */
export type ScreenScope = { kind: "trunk" } | { kind: "parcours"; branch: string } | { kind: "all" }

export interface ScreenStat {
  id: string
  /** Parcours in which the screen was seen; empty before the choice of parcours. */
  branches: string[]
  /** Journeys that saw the screen. */
  reached: number
  /** Journeys that stopped on it: tunnel never finished, and this was the last screen shown. */
  exits: number
  /** Journeys that went past its position without seeing it: above zero for a conditional screen. */
  skipped: number
  /** Time spent on the screen per journey, all visits together, where the time is known. */
  medianMs: number | null
  p90Ms: number | null
  /** Time on the screen before leaving, for the journeys that stopped on it and whose time is known. */
  exitMedianMs: number | null
  /** Journeys that, at least once… */
  backs: number // …left it with the back arrow
  returns: number // …came back to it from a later screen
  backgrounds: number // …sent the app to the background on it
  maxReached: number // …hit the maximum number of selections
  disabledTaps: number // …tapped the disabled main button
  changedMind: number // …changed their answer before validating
}

export interface ScreenStats {
  /** Journeys of the scope: the 100 % of the reach bars. */
  journeys: number
  /** In the order of the flow, the sign-up screen last. */
  screens: ScreenStat[]
}

interface ScopedVisit {
  journey: CohortJourney
  visit: StepVisit
}

const journeysOf = (journeys: CohortJourney[], scope: ScreenScope): CohortJourney[] =>
  scope.kind === "parcours" ? journeys.filter((journey) => journey.branch === scope.branch) : journeys

function visitInScope(visit: StepVisit, scope: ScreenScope): boolean {
  if (scope.kind === "all") return true
  // The sign-up screen is logged without a parcours, like the trunk, but comes after every parcours: it closes each of them.
  if (visit.id === REGISTER_STEP_ID) return scope.kind === "parcours"
  return scope.kind === "trunk" ? visit.branch === undefined : visit.branch === scope.branch
}

/** Visits of the scope, grouped by screen. */
function visitsByScreen(journeys: CohortJourney[], scope: ScreenScope): Map<string, ScopedVisit[]> {
  const byScreen = new Map<string, ScopedVisit[]>()
  for (const journey of journeysOf(journeys, scope)) {
    for (const visit of journey.steps) {
      if (!visitInScope(visit, scope)) continue
      const list = byScreen.get(visit.id)
      if (list) list.push({ journey, visit })
      else byScreen.set(visit.id, [{ journey, visit }])
    }
  }
  return byScreen
}

/**
 * The screens in the order of the flow.
 *
 * A screen's logged position is the number of screens shown before it, so it
 * shifts with every conditional screen a journey did or did not see: positions
 * compare within a journey, not across journeys. The order therefore follows
 * what the journeys agree on, pair by pair — X before Y when most journeys
 * that saw both saw X first — and falls back on the median position between
 * screens never seen together. A screen without a position (the sign-up
 * screen) comes last.
 */
function flowOrder(byScreen: Map<string, ScopedVisit[]>): string[] {
  const ids = [...byScreen.keys()]
  const size = ids.length
  const medianIndex: number[] = []
  const seenByJourney = new Map<string, Array<{ screen: number; index: number }>>()
  ids.forEach((id, screen) => {
    const indexes: number[] = []
    for (const { journey, visit } of byScreen.get(id) ?? []) {
      if (visit.index === undefined) continue
      indexes.push(visit.index)
      const seen = seenByJourney.get(journey.id)
      if (seen) seen.push({ screen, index: visit.index })
      else seenByJourney.set(journey.id, [{ screen, index: visit.index }])
    }
    medianIndex.push(median(indexes) ?? Number.POSITIVE_INFINITY)
  })

  // sawFirst[a * size + b]: journeys that saw screen a before screen b.
  const sawFirst = new Int32Array(size * size)
  for (const seen of seenByJourney.values()) {
    for (const a of seen) {
      for (const b of seen) {
        if (a.index < b.index) sawFirst[a.screen * size + b.screen]++
      }
    }
  }
  const precedes = (a: number, b: number) => sawFirst[a * size + b] > sawFirst[b * size + a]
  const earlier = (a: number, b: number) => medianIndex[a] - medianIndex[b] || ids[a].localeCompare(ids[b])

  const hasPosition = (screen: number) => Number.isFinite(medianIndex[screen])
  const pending = new Set([...ids.keys()].filter(hasPosition))
  // Screens still to place that come before each screen.
  const blockers = new Int32Array(size)
  for (const a of pending) {
    for (const b of pending) {
      if (precedes(a, b)) blockers[b]++
    }
  }

  const order: string[] = []
  while (pending.size > 0) {
    // Next: the earliest of the screens nothing comes before. When journeys
    // disagree in a circle (a parcours changed midway, two versions of the
    // app), no screen is free: the earliest of them all.
    let next: number | undefined
    for (const onlyFree of [true, false]) {
      for (const candidate of pending) {
        if (onlyFree && blockers[candidate] > 0) continue
        if (next === undefined || earlier(candidate, next) < 0) next = candidate
      }
      if (next !== undefined) break
    }
    if (next === undefined) break
    pending.delete(next)
    order.push(ids[next])
    for (const other of pending) {
      if (precedes(next, other)) blockers[other]--
    }
  }
  return [...order, ...ids.filter((_, screen) => !hasPosition(screen)).sort()]
}

/** The journey stopped on this screen, short of the end of its tunnel. */
const stoppedOn = (journey: CohortJourney, screenId: string): boolean =>
  journey.lastStepId === screenId && stoppedShort(journey)

/** More than one option tapped on a single choice, or a box unticked on a multiple one. */
export const changedMind = (visit: StepVisit): boolean => (visit.picks ?? 0) > 1 || (visit.unticks ?? 0) > 0

/** Parcours of a set of visits, most frequent first. */
const branchesOf = (visits: ScopedVisit[]): string[] =>
  ranked(countBy(visits, ({ visit }) => visit.branch)).map((entry) => entry.key)

function statOf(id: string, visits: ScopedVisit[]): ScreenStat {
  const stopped = visits.filter(({ journey }) => stoppedOn(journey, id))
  const having = (test: (visit: StepVisit) => boolean) => visits.filter(({ visit }) => test(visit)).length
  const durations = visits.flatMap(({ visit }) => (timed(visit) ? visit.ms : []))
  return {
    id,
    branches: branchesOf(visits),
    reached: visits.length,
    exits: stopped.length,
    skipped: 0,
    medianMs: median(durations),
    p90Ms: percentile(durations, 0.9),
    exitMedianMs: median(stopped.flatMap(({ journey }) => journey.lastVisitMs ?? [])),
    backs: having((visit) => (visit.backs ?? 0) > 0),
    returns: having((visit) => (visit.returns ?? 0) > 0),
    backgrounds: having((visit) => (visit.backgrounds ?? 0) > 0),
    maxReached: having((visit) => visit.maxReached !== undefined),
    disabledTaps: having((visit) => (visit.disabledTaps ?? 0) > 0),
    changedMind: having(changedMind),
  }
}

// A step of the flow that the app skips by itself shows no screen: nobody
// stays on it, nobody stops on it (today: the language step, replaced by a
// toggle in the header).
export const INSTANT_MS = 500
const isInstant = (stat: ScreenStat): boolean => stat.exits === 0 && (stat.p90Ms ?? 0) < INSTANT_MS

export function screenStats(journeys: CohortJourney[], scope: ScreenScope): ScreenStats {
  const scoped = journeysOf(journeys, scope)
  const byScreen = visitsByScreen(journeys, scope)
  const screens = flowOrder(byScreen)
    .map((id) => statOf(id, byScreen.get(id) ?? []))
    .filter((stat) => !isInstant(stat))

  // A conditional screen is one that journeys walk past: they saw a later
  // screen of the scope, not this one. Across parcours ("all") that is true of
  // every screen of the other parcours, so it is only worked out within a flow.
  if (scope.kind !== "all") {
    const rank = new Map(screens.map((stat, index) => [stat.id, index]))
    for (const journey of scoped) {
      const seen = new Set<number>()
      for (const visit of journey.steps) {
        const position = visitInScope(visit, scope) ? rank.get(visit.id) : undefined
        if (position !== undefined) seen.add(position)
      }
      const furthest = Math.max(-1, ...seen)
      for (let position = 0; position < furthest; position++) {
        if (!seen.has(position)) screens[position].skipped++
      }
    }
  }

  return { journeys: scoped.length, screens }
}

// ---- Answers ----

/**
 * - choice: one or several options;
 * - year: a year, listed chronologically;
 * - bands: a birth year, shown as age bands;
 * - text: free text, most frequent values first (never listed when it names the person);
 * - date: a date, only counted as filled.
 */
export type AnswerKind = "choice" | "year" | "bands" | "text" | "date"

const ANSWER_KIND_BY_TYPE: Record<string, AnswerKind> = {
  singleSelectExpand: "choice",
  multiSelectExpand: "choice",
  gridSelect: "choice",
  program: "choice",
  yearPicker: "year",
  birthYearWheel: "bands",
  textInput: "text",
  bodyMeasure: "text",
  datePicker: "date",
}

/** How the answers of a screen of this type read; undefined when it has none to list (messages, consent, tours…). */
export const answerKindOf = (stepType: string | undefined): AnswerKind | undefined => ANSWER_KIND_BY_TYPE[stepType ?? ""]

const SEVERAL_ANSWERS_TYPES = new Set(["multiSelectExpand", "program"])

/** Several options can be kept on a screen of this type: the shares of its answers can add up to more than 100 %. */
export const allowsSeveralAnswers = (stepType: string | undefined): boolean => SEVERAL_ANSWERS_TYPES.has(stepType ?? "")

export interface AnswerOption {
  value: string
  /** Journeys that gave this answer, and how far they went afterwards. */
  count: number
  completed: number
  registered: number
  subscribed: number
}

export interface AnswerBreakdown {
  screenId: string
  /** Parcours in which the screen was seen; empty before the choice of parcours. */
  branches: string[]
  kind: AnswerKind
  /** Journeys that saw the screen, and those that left an answer on it. */
  reached: number
  answered: number
  options: AnswerOption[]
  /** Distinct values that are not listed. */
  unlisted: number
}

const MAX_LISTED_VALUES = 15

export const AGE_BANDS = ["Moins de 18 ans", "18–24 ans", "25–34 ans", "35–44 ans", "45 ans et plus"]

/** Age band of a birth year, at the time the journey started. */
export function ageBand(birthYear: unknown, startedAt: number): string | undefined {
  const year = typeof birthYear === "number" ? birthYear : Number.parseInt(String(birthYear), 10)
  if (!Number.isFinite(year)) return undefined
  const age = new Date(startedAt).getFullYear() - year
  if (age < 0 || age > 120) return undefined
  if (age < 18) return AGE_BANDS[0]
  if (age <= 24) return AGE_BANDS[1]
  if (age <= 34) return AGE_BANDS[2]
  if (age <= 44) return AGE_BANDS[3]
  return AGE_BANDS[4]
}

/**
 * The options kept on a choice screen, from the answer it logged. A single
 * choice keeps one, the first: the app may log after it values it derives from
 * it and nobody picked ("baby_endo" comes with "endo_confirmed").
 */
export function chosenOptions(stepType: string | undefined, answer: string): string[] {
  const values = [...new Set(answer.split(",").filter(Boolean))]
  return allowsSeveralAnswers(stepType) ? values : values.slice(0, 1)
}

function answerValues(kind: AnswerKind, stepType: string | undefined, { journey, visit }: ScopedVisit): string[] {
  const answer = visit.answer?.trim()
  if (!answer) return []
  if (kind === "choice") return chosenOptions(stepType, answer)
  if (kind === "bands") return [ageBand(answer, journey.startedAt) ?? answer]
  return [answer]
}

function breakdownOf(dataset: OnboardingDataset, screenId: string, visits: ScopedVisit[]): AnswerBreakdown | null {
  const screen = dataset.screens[screenId]
  const kind = answerKindOf(screen?.type)
  if (!kind) return null

  const options = new Map<string, AnswerOption>()
  let answered = 0
  for (const scoped of visits) {
    const values = answerValues(kind, screen?.type, scoped)
    if (values.length === 0) continue
    answered++
    for (const raw of values) {
      // Free text: "Slinda", "slinda " and "SLINDA" are one answer.
      const key = kind === "text" ? raw.toLocaleLowerCase("fr") : raw
      let option = options.get(key)
      if (!option) options.set(key, (option = { value: raw, count: 0, completed: 0, registered: 0, subscribed: 0 }))
      option.count++
      if (finishedOnboarding(scoped.journey)) option.completed++
      if (hasAccount(scoped.journey)) option.registered++
      if (scoped.journey.outcome === "subscribed") option.subscribed++
    }
  }
  if (answered === 0) return null

  const hidden = kind === "date" || screen?.personal === true
  const byCount = [...options.values()].sort((a, b) => b.count - a.count)
  const listed = hidden ? [] : byCount.slice(0, MAX_LISTED_VALUES)
  if (kind === "year") listed.sort((a, b) => a.value.localeCompare(b.value))
  if (kind === "bands") listed.sort((a, b) => AGE_BANDS.indexOf(a.value) - AGE_BANDS.indexOf(b.value))

  return {
    screenId,
    branches: branchesOf(visits),
    kind,
    reached: visits.length,
    answered,
    options: listed,
    unlisted: byCount.length - listed.length,
  }
}

/** Every question of the scope with at least one answer, in the order of the flow. */
export function listQuestions(journeys: CohortJourney[], scope: ScreenScope, dataset: OnboardingDataset): AnswerBreakdown[] {
  const byScreen = visitsByScreen(journeys, scope)
  return flowOrder(byScreen).flatMap((id) => breakdownOf(dataset, id, byScreen.get(id) ?? []) ?? [])
}

/** Label of an answer value: the option's text (the goal's title on the programme screen), or the value itself. */
export function answerLabel(dataset: OnboardingDataset, screenId: string, value: string): string {
  const screen = dataset.screens[screenId]
  return screen?.options?.[value] ?? (screen?.type === "program" ? dataset.goals[value] : undefined) ?? value
}

// ---- One screen in detail ----

export interface ScreenDetail {
  /** How the journeys last left the screen ("" = never left: the app was closed on it). */
  exits: Array<{ via: string; count: number }>
  /** Time spent on the screen per journey, in buckets, where the time is known. */
  durations: Array<{ label: string; count: number }>
  /** Options refused because the maximum was reached. */
  refused: Array<{ value: string; journeys: number; times: number }>
  answers: AnswerBreakdown | null
}

const DURATION_BUCKETS: Array<{ label: string; below: number }> = [
  { label: "< 3 s", below: 3_000 },
  { label: "3–10 s", below: 10_000 },
  { label: "10–30 s", below: 30_000 },
  { label: "30–60 s", below: 60_000 },
  { label: "1–2 min", below: 120_000 },
  { label: "> 2 min", below: Number.POSITIVE_INFINITY },
]

export function describeScreen(
  journeys: CohortJourney[],
  scope: ScreenScope,
  screenId: string,
  dataset: OnboardingDataset,
): ScreenDetail {
  const visits = visitsByScreen(journeys, scope).get(screenId) ?? []
  const durations = visits.flatMap(({ visit }) => (timed(visit) ? visit.ms : []))

  const refused = new Map<string, { value: string; journeys: number; times: number }>()
  for (const { visit } of visits) {
    for (const [value, times] of Object.entries(visit.maxReached ?? {})) {
      const entry = refused.get(value) ?? { value, journeys: 0, times: 0 }
      entry.journeys++
      entry.times += times
      refused.set(value, entry)
    }
  }

  return {
    exits: ranked(countBy(visits, ({ visit }) => visit.exit ?? "")).map(({ key, count }) => ({ via: key, count })),
    durations: DURATION_BUCKETS.map(({ label, below }, index) => {
      const from = index === 0 ? 0 : DURATION_BUCKETS[index - 1].below
      return { label, count: durations.filter((ms) => ms >= from && ms < below).length }
    }),
    refused: [...refused.values()].sort((a, b) => b.journeys - a.journeys),
    answers: breakdownOf(dataset, screenId, visits),
  }
}
