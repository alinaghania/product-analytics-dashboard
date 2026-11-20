// The onboarding journal: what the mobile app logs, since 0.1.12, from the
// first onboarding screen to the onboarding paywall. Two Firestore collections:
// `onboarding_sessions/{sessionId}` (one record per journey: answers, last
// screen, status) and `onboarding_events` (every screen shown and left, taps,
// permissions, sign-up, paywall).
//
// The server reduces them to one `Journey` per session (digest.ts); the
// Onboarding page aggregates journeys in the browser (report.ts), so its
// filters never cost a Firestore read.

// ---- Firestore documents, as the queries return them (timestamps in ms) ----
// Written by phones, never checked by the dashboard: every field is `unknown`
// until the digest has read it.

/** `onboarding_sessions/{sessionId}`. */
export interface OnboardingSessionDoc {
  id: string
  flow?: unknown
  status?: unknown
  platform?: unknown
  appVersion?: unknown
  lang?: unknown
  branch?: unknown
  startedAt?: unknown
  updatedAt?: number
  lastStepId?: unknown
  completedAt?: unknown
  registeredAt?: unknown
  paywallAt?: unknown
  registerMethod?: unknown
  paywallResult?: unknown
  userId?: unknown
  screenW?: unknown
  screenH?: unknown
  fontScale?: unknown
  osVersion?: unknown
  answers?: unknown
}

/** A document of `onboarding_events`, reduced to the fields the digest reads. */
export interface OnboardingEventDoc {
  sessionId?: unknown
  name?: unknown
  /** Phone clock (ms): orders the events of a journey. */
  t?: unknown
  /** Counter of the app launch: breaks ties within a millisecond. */
  seq?: unknown
  stepId?: unknown
  stepType?: unknown
  stepIndex?: unknown
  branch?: unknown
  via?: unknown
  value?: unknown
  detail?: unknown
  selected?: unknown
  durationMs?: unknown
}

// ---- Dataset sent to the browser ----

/** One screen of one journey. Counters left out are zero. */
export interface StepVisit {
  /** Screen id (`stepId`), e.g. "U3". */
  id: string
  /**
   * Position in the flow the first time the screen was shown: the number of
   * screens before it for that journey, so it only compares within a journey.
   * Absent on the sign-up screen.
   */
  index?: number
  /**
   * Parcours active the first time the screen was shown; absent before the
   * parcours is chosen. Follows the journey when it changes parcours and sees
   * the screen again (`index` too).
   */
  branch?: string
  /** Times the screen was shown, returns included. */
  views: number
  /**
   * Time spent on it, app in the foreground, all visits together. Zero with
   * no `exit`: the app was closed on the screen and the time was never logged.
   */
  ms: number
  /** How the last visit ended (next, back, skip, complete, blur…). Absent: the screen was never left. */
  exit?: string
  /** Times it was left with the back arrow. */
  backs?: number
  /** Times it was reached again from the back arrow of a later screen. */
  returns?: number
  /** Times the app went to the background while it was shown. */
  backgrounds?: number
  /** Taps on the main button while it was disabled. */
  disabledTaps?: number
  /** Single choice: distinct options tapped (more than one = a change of mind). */
  picks?: number
  /** Multiple choice: boxes unticked. */
  unticks?: number
  /** Options refused because the maximum was reached → times. */
  maxReached?: Record<string, number>
  /** Answer left on the screen, as logged: values joined by commas for a choice. */
  answer?: string
}

export interface JourneyConsent {
  acceptedAll: boolean
  /** Final state of the boxes, when the screen was validated. */
  choices?: Record<string, boolean>
  /** Links opened: privacy, terms. */
  links?: string[]
  /** "Suivant" tapped without the mandatory boxes. */
  blocked?: number
}

export type PermissionKind = "notifications" | "health"

export interface JourneyPermission {
  kind: PermissionKind
  /** granted | denied | skipped | already_granted */
  result: string
}

export interface JourneyProgram {
  /** Goals of the proposed programme that were unticked and are not in the programme kept. */
  removed?: string[]
  /** Goals whose "Pourquoi ?" was opened. */
  whyOpened?: string[]
  /** Goals whose scientific source was opened. */
  sourcesOpened?: string[]
}

export interface JourneyHold {
  /** Times the finger was lifted before the end of the long press. */
  cancels: number
  /** How long those presses were held (ms), when logged. */
  cancelMs: number[]
  completed: boolean
}

export interface JourneyRegister {
  /** Methods tried, in order: apple | google | email. */
  attempts: string[]
  /** Apple / Google sheets dismissed. */
  cancels?: number
  /** Errors, in order: "<method>:<code>". */
  errors?: string[]
  /** Times the form asked to confirm an e-mail that looked mistyped ("gmial.com"). */
  typoPrompts?: number
  /** "J'ai déjà un compte" taps. */
  loginTaps?: number
}

/**
 * How much of the journey the journal saw.
 * - full: from the first screen;
 * - partial: it starts midway (journey begun before the app logged anything, or a first batch lost);
 * - register: only the sign-up screen (onboarding done before the app logged anything).
 */
export type JourneyCoverage = "full" | "partial" | "register"

export interface Journey {
  id: string
  /** onboarding | reonboarding (existing users sent through the onboarding again). */
  flow: string
  /** in_progress | completed | registered */
  status: string
  /** "unknown" when unreadable, like `appVersion` and `lang`. */
  platform: string
  appVersion: string
  lang: string
  /** Parcours entered after "Quelle situation te correspond le mieux ?". */
  branch?: string
  coverage: JourneyCoverage
  startedAt: number
  /** Last sign of life: last event, or last write of the session record. */
  lastActivityAt: number
  completedAt?: number
  registeredAt?: number
  paywallAt?: number
  registerMethod?: string
  /** purchased | restored | cancelled | already_premium */
  paywallResult?: string
  userId?: string
  /** Times the onboarding was opened: once, plus once per app launch that resumed it. */
  launches: number
  device: { width?: number; height?: number; fontScale?: number; os?: string }
  /** First name typed on the name screen. */
  name?: string
  /** Every answer of the session record, defaults removed. */
  answers: Record<string, unknown>
  /** Screens in the order the journey first showed them. */
  steps: StepVisit[]
  /** Last screen shown. */
  lastStepId?: string
  /** Time spent on the last screen during its last visit, when known. */
  lastVisitMs?: number
  consent?: JourneyConsent
  permissions?: JourneyPermission[]
  program?: JourneyProgram
  hold?: JourneyHold
  register?: JourneyRegister
  /** Paywall attempts that showed nothing (not_presented, error): it is retried later. */
  paywallMisses?: string[]
  languageChanges?: number
}

/** What the page shows for a screen id. */
export interface ScreenInfo {
  /** Text shown on the screen; the raw id when the catalog does not know it. */
  title: string
  /** Step type, as in the app (singleSelectExpand, productTour…). */
  type: string
  /** Field of the registration form the screen fills (`saveTo`), when the catalog knows it. */
  field?: string
  maxSelections?: number
  /** Option value → label. */
  options?: Record<string, string>
  /** Free text that names a person: its values are never listed. */
  personal?: boolean
}

export interface OnboardingDataset {
  /** Inclusive range of journey start days, yyyy-MM-dd, Europe/Paris. */
  from: string
  to: string
  generatedAt: string
  journeys: Journey[]
  /** Every screen seen in `journeys`. */
  screens: Record<string, ScreenInfo>
  /** Programme goal id → title (the programme screen logs ids only). */
  goals: Record<string, string>
}
