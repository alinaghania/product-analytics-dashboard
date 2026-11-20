import { REGISTER_STEP_ID } from "./labels"
import { countBy, hasAccount, median, ranked, sawPaywall, tappedLogin, type CohortJourney } from "./report"
import type { OnboardingDataset, PermissionKind, StepVisit } from "./types"

// The key moments of the tunnel: the few screens with an outcome of their own
// (consent, permissions, programme and commitment, sign-up, paywall).

export interface Tally {
  key: string
  count: number
}

export interface ConsentMoment {
  /** Journeys that saw the consent screen / that validated it. */
  reached: number
  validated: number
  /** Validated with "Tout accepter" at some point. */
  acceptedAll: number
  /** Per box: journeys that validated with it ticked. */
  optIns: Tally[]
  linksOpened: Tally[]
  /** Journeys that tapped "Suivant" without the mandatory boxes. */
  blocked: number
  medianMs: number | null
}

export interface PermissionMoment {
  /** Journeys that saw the screen. */
  asked: number
  /** granted | denied | skipped | already_granted → journeys. */
  results: Tally[]
}

export interface ProgramMoment {
  reached: number
  /** Journeys that completed the long press: the onboarding is finished. */
  committed: number
  /** Journeys that removed at least one proposed goal. */
  edited: number
  removedGoals: Tally[]
  /** Journeys that opened at least one "Pourquoi ?" / one scientific source. */
  openedWhy: number
  openedSource: number
  /** Journeys that lifted their finger too early at least once, and how long they had held (median). */
  releasedEarly: number
  medianEarlyReleaseMs: number | null
  medianMs: number | null
}

/** A sign-up error, with when it was last met: an incident that is over reads differently from a standing problem. */
export interface ErrorTally extends Tally {
  /** Start of the most recent journey that met it. */
  lastStartedAt: number
}

export interface RegisterMethod {
  method: string
  /** Journeys that tried the method, and those whose account was created with it. */
  tried: number
  succeeded: number
}

export interface RegisterMoment {
  reached: number
  registered: number
  /** Already signed in when reaching the screen (reinstall): no form to fill. */
  alreadySignedIn: number
  /** Left without an account after tapping "J'ai déjà un compte". */
  tappedLogin: number
  /** Left without an account and without tapping "J'ai déjà un compte". */
  left: number
  methods: RegisterMethod[]
  /** Journeys that dismissed an Apple / Google sheet at least once. */
  cancelled: number
  /** Journeys that met at least one error, and how many of them still created their account. */
  withError: number
  withErrorRegistered: number
  /** Per error ("<method>:<code>"): journeys that met it. */
  errors: ErrorTally[]
  /** Journeys asked to confirm an e-mail address that looked mistyped. */
  typoPrompted: number
  /** Time on the screen for the journeys that created their account. */
  medianMs: number | null
}

export interface PaywallMoment {
  /** Accounts created: the paywall is shown on the first home screen. */
  accounts: number
  /** Journeys with a final answer: purchased | restored | cancelled | already_premium. */
  results: Tally[]
  seen: number
  /** Accounts without any answer yet: paywall never shown, or app closed before answering. */
  pending: number
  /** Among those, accounts for which a presentation failed at least once (not_presented, error). */
  pendingAfterMiss: number
  /** Time between the account creation and the answer to the paywall. */
  medianDelayMs: number | null
}

export interface Moments {
  consent: ConsentMoment
  notifications: PermissionMoment
  health: PermissionMoment
  program: ProgramMoment
  register: RegisterMoment
  paywall: PaywallMoment
  /** Journeys that changed the language from the selector. */
  languageChanged: number
}

const tally = (keys: string[]): Tally[] => ranked(countBy(keys, (key) => key))

/** A journey's own occurrences of each key count once. */
const tallyPerJourney = (lists: Array<string[] | undefined>): Tally[] => tally(lists.flatMap((list) => [...new Set(list)]))

export function buildMoments(journeys: CohortJourney[], dataset: OnboardingDataset): Moments {
  const withVisit = (matches: (visit: StepVisit) => boolean) =>
    journeys.flatMap((journey) => {
      const visit = journey.steps.find(matches)
      return visit ? [{ journey, visit }] : []
    })
  const withScreenOfType = (type: string) => withVisit((visit) => dataset.screens[visit.id]?.type === type)

  // Consent
  const consents = withScreenOfType("consent")
  const validatedConsents = consents.filter(({ journey }) => journey.consent?.choices)

  // Permissions
  const permission = (kind: PermissionKind, type: string): PermissionMoment => ({
    asked: withScreenOfType(type).length,
    results: tally(journeys.flatMap((journey) => journey.permissions?.find((p) => p.kind === kind)?.result ?? [])),
  })

  // Programme and commitment
  const programs = withScreenOfType("program")

  // Sign-up
  const registers = withVisit((visit) => visit.id === REGISTER_STEP_ID)
  const methods = [...new Set(registers.flatMap(({ journey }) => journey.register?.attempts ?? []))]
  const withError = registers.filter(({ journey }) => (journey.register?.errors?.length ?? 0) > 0)
  const withoutAccount = registers.filter(({ journey }) => journey.outcome === "completed")
  const loginTappers = withoutAccount.filter(({ journey }) => tappedLogin(journey)).length

  // Paywall
  const accounts = journeys.filter(hasAccount)
  const answered = accounts.filter((journey) => journey.paywallResult !== undefined)
  const pending = accounts.filter((journey) => journey.paywallResult === undefined)

  return {
    consent: {
      reached: consents.length,
      validated: validatedConsents.length,
      acceptedAll: validatedConsents.filter(({ journey }) => journey.consent?.acceptedAll).length,
      optIns: tally(
        validatedConsents.flatMap(({ journey }) =>
          Object.entries(journey.consent?.choices ?? {}).flatMap(([key, ticked]) => (ticked ? key : [])),
        ),
      ),
      linksOpened: tallyPerJourney(consents.map(({ journey }) => journey.consent?.links)),
      blocked: consents.filter(({ journey }) => (journey.consent?.blocked ?? 0) > 0).length,
      medianMs: median(consents.map(({ visit }) => visit.ms)),
    },
    notifications: permission("notifications", "preNotification"),
    health: permission("health", "healthPermission"),
    program: {
      reached: programs.length,
      committed: programs.filter(({ journey }) => journey.hold?.completed).length,
      edited: programs.filter(({ journey }) => (journey.program?.removed?.length ?? 0) > 0).length,
      removedGoals: tallyPerJourney(programs.map(({ journey }) => journey.program?.removed)),
      openedWhy: programs.filter(({ journey }) => (journey.program?.whyOpened?.length ?? 0) > 0).length,
      openedSource: programs.filter(({ journey }) => (journey.program?.sourcesOpened?.length ?? 0) > 0).length,
      releasedEarly: programs.filter(({ journey }) => (journey.hold?.cancels ?? 0) > 0).length,
      medianEarlyReleaseMs: median(programs.flatMap(({ journey }) => journey.hold?.cancelMs ?? [])),
      medianMs: median(programs.map(({ visit }) => visit.ms)),
    },
    register: {
      reached: registers.length,
      registered: registers.filter(({ journey }) => hasAccount(journey)).length,
      alreadySignedIn: registers.filter(({ journey }) => journey.registerMethod === "existing_session").length,
      tappedLogin: loginTappers,
      left: withoutAccount.length - loginTappers,
      methods: methods
        .map((method) => ({
          method,
          tried: registers.filter(({ journey }) => journey.register?.attempts.includes(method)).length,
          succeeded: registers.filter(({ journey }) => journey.registerMethod === method).length,
        }))
        .sort((a, b) => b.tried - a.tried),
      cancelled: registers.filter(({ journey }) => (journey.register?.cancels ?? 0) > 0).length,
      withError: withError.length,
      withErrorRegistered: withError.filter(({ journey }) => hasAccount(journey)).length,
      errors: tallyPerJourney(registers.map(({ journey }) => journey.register?.errors)).map((error) => ({
        ...error,
        lastStartedAt: Math.max(
          ...registers.flatMap(({ journey }) => (journey.register?.errors?.includes(error.key) ? journey.startedAt : [])),
        ),
      })),
      typoPrompted: registers.filter(({ journey }) => (journey.register?.typoPrompts ?? 0) > 0).length,
      medianMs: median(registers.filter(({ journey }) => hasAccount(journey)).map(({ visit }) => visit.ms)),
    },
    paywall: {
      accounts: accounts.length,
      results: tally(answered.flatMap((journey) => journey.paywallResult ?? [])),
      seen: accounts.filter(sawPaywall).length,
      pending: pending.length,
      pendingAfterMiss: pending.filter((journey) => (journey.paywallMisses?.length ?? 0) > 0).length,
      medianDelayMs: median(
        accounts.flatMap((journey) =>
          sawPaywall(journey) && journey.paywallAt !== undefined && journey.registeredAt !== undefined
            ? Math.max(0, journey.paywallAt - journey.registeredAt)
            : [],
        ),
      ),
    },
    languageChanged: journeys.filter((journey) => (journey.languageChanges ?? 0) > 0).length,
  }
}
