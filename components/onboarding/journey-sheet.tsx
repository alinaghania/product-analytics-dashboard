"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatInParis } from "@/lib/analytics"
import { formatMs, formatNumber, plural } from "@/lib/format"
import {
  JOURNAL_SINCE_VERSION,
  branchLabel,
  consentLabel,
  exitLabel,
  langLabel,
  osLabel,
  paywallResultLabel,
  permissionResultLabel,
  registerErrorLabel,
  registerMethodLabel,
  stepTypeLabel,
  versionLabel,
} from "@/lib/onboarding-journal/labels"
import {
  INSTANT_MS,
  answerKindOf,
  answerLabel,
  changedMind,
  chosenOptions,
  hasAccount,
  stoppedShort,
  type CohortJourney,
} from "@/lib/onboarding-journal/report"
import { acquisitionSource, ageGroup } from "@/lib/onboarding-journal/segments"
import type { JourneyCoverage, OnboardingDataset, StepVisit } from "@/lib/onboarding-journal/types"
import { OutcomeBadge, useLastDefined } from "./primitives"

export const COVERAGE_NOTES: Record<Exclude<JourneyCoverage, "full">, string> = {
  partial: `Journal incomplet : il commence en cours de parcours (onboarding entamé avant la version ${JOURNAL_SINCE_VERSION}, ou premiers événements perdus).`,
  register: `Seul l'écran d'inscription a été journalisé : l'onboarding avait été fait avant la version ${JOURNAL_SINCE_VERSION}.`,
}

/** A moment of a journey, in Paris time like the days of the page. */
const formatMoment = (ms: number): string => formatInParis(ms, "d MMM yyyy 'à' HH:mm")

/** The answer left on a screen, in the words the person saw. */
function answerText(journey: CohortJourney, visit: StepVisit, dataset: OnboardingDataset): string | null {
  const type = dataset.screens[visit.id]?.type
  if (type === "consent") {
    // Only the ticked boxes: the record also holds consents that this screen does not ask for.
    const ticked = Object.entries(journey.consent?.choices ?? {}).flatMap(([key, value]) => (value ? consentLabel(key) : []))
    return ticked.length > 0 ? `Coché : ${ticked.join(" · ")}` : null
  }
  if (!visit.answer) return null
  if (answerKindOf(type) !== "choice") return visit.answer
  return chosenOptions(type, visit.answer)
    .map((value) => answerLabel(dataset, visit.id, value))
    .join(" · ")
}

/** What stood out during the visits of a screen. */
function visitNotes(visit: StepVisit): string[] {
  const notes: string[] = []
  // Left forward at once: a step the app skips by itself, not a screen she saw.
  if (visit.ms < INSTANT_MS && visit.exit && visit.exit !== "back") notes.push("passé automatiquement")
  if (visit.views > 1) notes.push(`vu ${visit.views} fois`)
  if (visit.backs) notes.push("quitté par la flèche retour")
  if (visit.backgrounds) notes.push(`app mise en arrière-plan${visit.backgrounds > 1 ? ` ${visit.backgrounds} fois` : ""}`)
  if (visit.maxReached) notes.push("maximum de sélections atteint")
  if (changedMind(visit)) notes.push("réponse changée avant de valider")
  if (visit.disabledTaps) notes.push("bouton désactivé tapé")
  return notes
}

/** "Apple → E-mail ×3": the sign-up methods tried in order, a repeated one counted. */
function attemptsText(attempts: string[]): string {
  const runs: Array<{ method: string; times: number }> = []
  for (const method of attempts) {
    const last = runs[runs.length - 1]
    if (last?.method === method) last.times++
    else runs.push({ method, times: 1 })
  }
  return runs.map(({ method, times }) => `${registerMethodLabel(method)}${times > 1 ? ` ×${times}` : ""}`).join(" → ")
}

function phoneText({ width, height, fontScale }: CohortJourney["device"]): string {
  const parts = [
    width !== undefined && height !== undefined ? `${width} × ${height} pt` : null,
    fontScale !== undefined ? `police ×${formatNumber(fontScale, 2)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{children}</dd>
    </div>
  )
}

const readable = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value))

/** One journey from its first screen to its last: facts, then every screen with the time spent and the answer left. */
export function JourneySheet({
  journey,
  onClose,
  dataset,
}: {
  /** Journey to show; null closes the panel. */
  journey: CohortJourney | null
  onClose: () => void
  dataset: OnboardingDataset
}) {
  // Kept while the panel slides out.
  const shown = useLastDefined(journey)

  return (
    <Sheet open={journey !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {shown && (
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-3 pr-6 text-left">
                {shown.name ?? "Session sans prénom"}
                <OutcomeBadge outcome={shown.outcome} flow={shown.flow} />
              </SheetTitle>
              <SheetDescription className="text-left">
                Démarrée le {formatMoment(shown.startedAt)} · {osLabel(shown.platform, shown.device.os)} · {versionLabel(shown.appVersion)} ·{" "}
                {langLabel(shown.lang)}
              </SheetDescription>
            </SheetHeader>

            {shown.coverage !== "full" && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {COVERAGE_NOTES[shown.coverage]} Cette session ne compte pas dans les statistiques.
              </p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Fact label="Parcours">{shown.branch ? branchLabel(shown.branch) : "Pas encore choisi"}</Fact>
              <Fact label="Source">{acquisitionSource(shown, dataset) ?? "—"}</Fact>
              <Fact label="Âge">{ageGroup(shown, dataset) ?? "—"}</Fact>
              <Fact label="Temps passé">{formatMs(shown.steps.reduce((total, step) => total + step.ms, 0))}</Fact>
              <Fact label="Écrans vus">{formatNumber(shown.steps.length)}</Fact>
              <Fact label="Ouvertures de l'onboarding">{formatNumber(Math.max(1, shown.launches))}</Fact>
              <Fact label="Compte">
                {shown.registeredAt
                  ? `${registerMethodLabel(shown.registerMethod ?? "")} · ${formatMoment(shown.registeredAt)}`
                  : "Pas de compte"}
              </Fact>
              {hasAccount(shown) && (
                <Fact label="Paywall">{shown.paywallResult ? paywallResultLabel(shown.paywallResult) : "Sans réponse"}</Fact>
              )}
              <Fact label="Téléphone">{phoneText(shown.device)}</Fact>
              {(shown.permissions ?? []).map((permission) => (
                <Fact key={permission.kind} label={permission.kind === "notifications" ? "Notifications" : "Données de santé"}>
                  {permissionResultLabel(permission.result, permission.kind)}
                </Fact>
              ))}
            </dl>

            {shown.userId && (
              <Link href={`/users/${shown.userId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Voir la fiche de l'utilisatrice
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Écran par écran</h3>
              <ol className="space-y-px overflow-hidden rounded-md border border-border">
                {shown.steps.map((visit, index) => {
                  const screen = dataset.screens[visit.id]
                  const answer = answerText(shown, visit, dataset)
                  return (
                    <li key={visit.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-x-3 bg-card px-3 py-2">
                      <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground" title={screen?.title}>
                          {screen?.title ?? visit.id}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[visit.id, stepTypeLabel(screen?.type ?? ""), ...visitNotes(visit)].join(" · ")}
                        </p>
                        {answer && <p className="mt-0.5 text-xs text-secondary-foreground">→ {answer}</p>}
                        {visit.id === shown.lastStepId && stoppedShort(shown) && (
                          <p className="mt-0.5 text-xs font-medium text-destructive">
                            Dernier écran : la session s'arrête ici
                            {shown.lastVisitMs ? `, après ${formatMs(shown.lastVisitMs)} dessus` : ""}.
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="block whitespace-nowrap text-sm tabular-nums text-foreground">{formatMs(visit.ms)}</span>
                        {visit.exit && visit.exit !== "next" && (
                          <span className="block whitespace-nowrap text-xs text-muted-foreground">{exitLabel(visit.exit)}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
              <p className="text-xs text-muted-foreground">Dans l'ordre où les écrans ont été vus pour la première fois ; temps cumulé de toutes les visites.</p>
            </section>

            {shown.register && (
              <section className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Inscription</h3>
                <p className="text-sm text-muted-foreground">
                  {shown.register.attempts.length > 0
                    ? `Méthodes essayées, dans l'ordre : ${attemptsText(shown.register.attempts)}.`
                    : "Aucune méthode essayée."}
                  {shown.register.cancels ? ` Fenêtre Apple ou Google refermée : ${plural(shown.register.cancels, "fois", "fois")}.` : ""}
                  {shown.register.typoPrompts ? " L'app a demandé de confirmer une adresse e-mail qui semblait mal saisie." : ""}
                  {shown.register.loginTaps ? " A tapé « J'ai déjà un compte »." : ""}
                </p>
                {shown.register.errors && (
                  <p className="text-sm text-muted-foreground">Erreurs : {shown.register.errors.map(registerErrorLabel).join(", ")}.</p>
                )}
              </section>
            )}

            {Object.keys(shown.answers).length > 0 && (
              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                  Toutes les réponses enregistrées ({plural(Object.keys(shown.answers).length, "champ")})
                </summary>
                <dl className="space-y-1 border-t border-border px-3 py-2">
                  {Object.entries(shown.answers).map(([field, value]) => (
                    <div key={field} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-3 text-xs">
                      <dt className="truncate font-mono text-muted-foreground">{field}</dt>
                      <dd className="break-words text-foreground">{readable(value)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}

            <p className="font-mono text-[11px] text-muted-foreground">onboarding_sessions/{shown.id}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
