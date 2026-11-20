import { formatInParis } from "@/lib/analytics"
import { agree, formatMs, formatShare, plural } from "@/lib/format"
import { REGISTER_STEP_ID, permissionResultLabel, registerErrorLabel, registerMethodLabel } from "./labels"
import type { Moments } from "./moments"
import type { ScreenStat, ScreenStats } from "./report"
import type { OnboardingDataset } from "./types"

// "Où agir en priorité": what the figures point at, worded and ranked. Plain
// rules, no model.

/**
 * - loss: people who left the tunnel;
 * - risk: something that often goes wrong on the way (errors, paywall not shown);
 * - friction: something that slows people down or constrains them.
 */
export type InsightKind = "loss" | "risk" | "friction"

export type MomentKey = "consent" | "permissions" | "program" | "register" | "paywall"

export interface Insight {
  key: string
  kind: InsightKind
  title: string
  detail: string
  /** Journeys concerned: ranks the insights of a kind. */
  journeys: number
  /** Where to look: one screen, or one of the key moments. */
  screenId?: string
  moment?: MomentKey
}

/** Losses first, then risks, then frictions; this many of each at most. */
const KINDS: Array<{ kind: InsightKind; max: number }> = [
  { kind: "loss", max: 3 },
  { kind: "risk", max: 3 },
  { kind: "friction", max: 3 },
]

// Below these, a figure is noise rather than a pattern.
const MIN_LOST = 3
const MIN_CONCERNED = 5
const MIN_EXIT_SHARE = 0.02
const MIN_METHOD_ATTEMPTS = 10

const concerns = (part: number, whole: number, minimumShare: number) =>
  part >= MIN_CONCERNED && whole > 0 && part / whole >= minimumShare

const top = (screens: ScreenStat[], valueOf: (screen: ScreenStat) => number, howMany: number) =>
  [...screens].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, howMany)

/** "12 sessions sur 40 (30 %)" */
const outOf = (part: number, whole: number) => `${plural(part, "session")} sur ${whole} (${formatShare(part, whole)})`

export function buildInsights(stats: ScreenStats, moments: Moments, dataset: OnboardingDataset): Insight[] {
  const titleOf = (id: string) => `« ${dataset.screens[id]?.title ?? id} »`
  const insights: Insight[] = []
  const questions = stats.screens.filter((screen) => screen.id !== REGISTER_STEP_ID)
  const { register, paywall, program, notifications } = moments

  // ---- Losses ----

  const minExits = Math.max(MIN_LOST, stats.journeys * MIN_EXIT_SHARE)
  for (const screen of top(questions.filter((s) => s.exits >= minExits), (s) => s.exits, 2)) {
    const after = screen.exitMedianMs === null ? "" : `, après ${formatMs(screen.exitMedianMs)} passées dessus (médiane)`
    insights.push({
      key: `exit-${screen.id}`,
      kind: "loss",
      title: `${plural(screen.exits, "abandon")} sur ${titleOf(screen.id)}`,
      detail: `${formatShare(screen.exits, screen.reached, 1)} des ${screen.reached} sessions qui voient cet écran s'arrêtent là${after}.`,
      journeys: screen.exits,
      screenId: screen.id,
    })
  }

  if (register.left >= MIN_LOST) {
    const others =
      register.tappedLogin > 0
        ? ` ${plural(register.tappedLogin, "autre")} ${agree(register.tappedLogin, "a", "ont")} tapé « J'ai déjà un compte ».`
        : ""
    insights.push({
      key: "register-left",
      kind: "loss",
      title: `${plural(register.left, "session")} sans compte après avoir fini l'onboarding`,
      detail: `${formatShare(register.left, register.reached, 1)} des sessions arrivées à l'écran d'inscription repartent sans créer de compte.${others}`,
      journeys: register.left,
      moment: "register",
    })
  }

  // ---- Risks ----

  for (const method of register.methods) {
    const failed = method.tried - method.succeeded
    if (method.tried < MIN_METHOD_ATTEMPTS || !concerns(failed, method.tried, 0.2)) continue
    const name = registerMethodLabel(method.method)
    // When its errors stopped some time ago, the rate tells of an incident, not of the method as it works today.
    const lastErrorAt = Math.max(...register.errors.flatMap((error) => (error.key.startsWith(`${method.method}:`) ? error.lastStartedAt : [])))
    // An abbreviated month ("nov.") already ends the sentence.
    const lastErrorDay = Number.isFinite(lastErrorAt) ? formatInParis(lastErrorAt, "d MMM") : null
    const lastError = lastErrorDay ? ` Dernière erreur ${name} : session du ${lastErrorDay}${lastErrorDay.endsWith(".") ? "" : "."}` : ""
    insights.push({
      key: `register-method-${method.method}`,
      kind: "risk",
      title: `Inscription ${name} : ${formatShare(method.succeeded, method.tried)} seulement aboutissent`,
      detail: `${plural(method.succeeded, "compte créé", "comptes créés")} pour ${plural(method.tried, "session")} qui ${agree(method.tried, "a", "ont")} essayé ${name} ; les autres annulent, échouent ou passent à une autre méthode.${lastError}`,
      journeys: failed,
      moment: "register",
    })
  }

  if (register.withError >= MIN_CONCERNED) {
    const mostFrequent = register.errors[0] ? `La plus fréquente : ${registerErrorLabel(register.errors[0].key)}. ` : ""
    insights.push({
      key: "register-errors",
      kind: "risk",
      title: `${plural(register.withError, "session")} avec une erreur à l'inscription`,
      detail: `${mostFrequent}Compte créé malgré tout : ${register.withErrorRegistered} sur ${register.withError}.`,
      journeys: register.withError,
      moment: "register",
    })
  }

  if (paywall.pending >= MIN_LOST) {
    const failed =
      paywall.pendingAfterMiss > 0
        ? ` Pour ${paywall.pendingAfterMiss} d'entre eux, la présentation a échoué au moins une fois.`
        : ""
    insights.push({
      key: "paywall-pending",
      kind: "risk",
      title: `${plural(paywall.pending, "compte")} sans réponse au paywall`,
      detail: `${formatShare(paywall.pending, paywall.accounts, 1)} des comptes créés : paywall jamais présenté, ou app fermée avant d'y répondre.${failed}`,
      journeys: paywall.pending,
      moment: "paywall",
    })
  }

  // ---- Frictions ----

  for (const screen of top(questions.filter((s) => concerns(s.maxReached, s.reached, 0.25)), (s) => s.maxReached, 1)) {
    const maximum = dataset.screens[screen.id]?.maxSelections
    insights.push({
      key: `max-${screen.id}`,
      kind: "friction",
      title: `Limite de choix atteinte sur ${titleOf(screen.id)}`,
      detail: `${outOf(screen.maxReached, screen.reached)} ${agree(screen.maxReached, "a", "ont")} voulu cocher une option de plus que le maximum${maximum ? ` de ${maximum}` : ""}.`,
      journeys: screen.maxReached,
      screenId: screen.id,
    })
  }

  const singleChoices = questions.filter((screen) => dataset.screens[screen.id]?.type === "singleSelectExpand")
  for (const screen of top(singleChoices.filter((s) => concerns(s.changedMind, s.reached, 0.5)), (s) => s.changedMind, 1)) {
    insights.push({
      key: `mind-${screen.id}`,
      kind: "friction",
      title: `${formatShare(screen.changedMind, screen.reached)} touchent plusieurs réponses sur ${titleOf(screen.id)}`,
      detail: `${outOf(screen.changedMind, screen.reached)} ${agree(screen.changedMind, "a", "ont")} touché plus d'une option avant de valider ce choix unique : hésitation, ou envie d'en choisir plusieurs.`,
      journeys: screen.changedMind,
      screenId: screen.id,
    })
  }

  for (const screen of top(questions.filter((s) => concerns(s.backgrounds, s.reached, 0.25)), (s) => s.backgrounds, 1)) {
    insights.push({
      key: `background-${screen.id}`,
      kind: "friction",
      title: `${titleOf(screen.id)} fait sortir de l'app`,
      detail: `${outOf(screen.backgrounds, screen.reached)} ${agree(screen.backgrounds, "a", "ont")} mis l'app en arrière-plan sur cet écran.`,
      journeys: screen.backgrounds,
      screenId: screen.id,
    })
  }

  for (const screen of top(questions.filter((s) => concerns(s.backs, s.reached, 0.1)), (s) => s.backs, 1)) {
    insights.push({
      key: `back-${screen.id}`,
      kind: "friction",
      title: `Retours en arrière depuis ${titleOf(screen.id)}`,
      detail: `${outOf(screen.backs, screen.reached)} ${agree(screen.backs, "est revenue", "sont revenues")} à l'écran précédent.`,
      journeys: screen.backs,
      screenId: screen.id,
    })
  }

  if (concerns(program.releasedEarly, program.reached, 0.25)) {
    insights.push({
      key: "hold-early",
      kind: "friction",
      title: `Appui long d'engagement relâché trop tôt par ${plural(program.releasedEarly, "session")}`,
      detail: `${formatShare(program.releasedEarly, program.reached)} des sessions arrivées au programme, après ${formatMs(program.medianEarlyReleaseMs)} d'appui (médiane).`,
      journeys: program.releasedEarly,
      moment: "program",
    })
  }

  const resultCount = (result: string) => notifications.results.find((entry) => entry.key === result)?.count ?? 0
  const skipped = resultCount("skipped")
  const denied = resultCount("denied")
  const notEnabled = denied + skipped
  if (concerns(notEnabled, notifications.asked, 0.3)) {
    const how = [
      skipped > 0 ? `${skipped} ${permissionResultLabel("skipped", "notifications")}` : null,
      denied > 0 ? `${denied} refus dans la fenêtre du système` : null,
    ].filter(Boolean)
    insights.push({
      key: "notifications-off",
      kind: "friction",
      title: `${formatShare(notEnabled, notifications.asked)} n'activent pas les notifications`,
      detail: `${plural(notEnabled, "session")} sur ${notifications.asked} : ${how.join(", ")}.`,
      journeys: notEnabled,
      moment: "permissions",
    })
  }

  return KINDS.flatMap(({ kind, max }) =>
    insights
      .filter((insight) => insight.kind === kind)
      .sort((a, b) => b.journeys - a.journeys)
      .slice(0, max),
  )
}
