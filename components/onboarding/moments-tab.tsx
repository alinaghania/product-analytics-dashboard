"use client"

import { useEffect, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatInParis } from "@/lib/analytics"
import { agree, formatMs, formatNumber, formatShare, plural } from "@/lib/format"
import type { MomentKey } from "@/lib/onboarding-journal/insights"
import {
  consentLabel,
  consentLinkLabel,
  paywallResultLabel,
  permissionResultLabel,
  registerErrorLabel,
  registerMethodLabel,
} from "@/lib/onboarding-journal/labels"
import type {
  ConsentMoment,
  Moments,
  PaywallMoment,
  PermissionMoment,
  ProgramMoment,
  RegisterMoment,
  Tally,
} from "@/lib/onboarding-journal/moments"
import type { OnboardingDataset, PermissionKind } from "@/lib/onboarding-journal/types"
import { cn } from "@/lib/utils"
import { Figure, Meter, TONE } from "./primitives"

const anchorId = (moment: MomentKey) => `moment-${moment}`

function MomentCard({
  anchor,
  title,
  subtitle,
  focused = false,
  wide,
  children,
}: {
  /** Makes the card a target of the insights of the overview. */
  anchor?: MomentKey
  title: string
  subtitle: string
  focused?: boolean
  wide?: boolean
  children: ReactNode
}) {
  return (
    <Card
      id={anchor && anchorId(anchor)}
      className={cn("border-border bg-card", wide && "lg:col-span-2", focused && "ring-2 ring-primary")}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

interface MeterRow {
  label: string
  /** A few words under the label. */
  hint?: string
  count: number
  color?: string
}

/** Named shares of one whole: a label, a bar, a count and its share per row. */
function MeterList({ title, rows, total }: { title?: string; rows: MeterRow[]; total: number }) {
  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,7rem)_5.5rem] items-center gap-3 text-sm">
            <span className="leading-snug text-foreground">
              {row.label}
              {row.hint && <span className="block text-xs text-muted-foreground">{row.hint}</span>}
            </span>
            <Meter value={row.count} total={total} color={row.color} />
            <span className="whitespace-nowrap text-right tabular-nums">
              <span className="font-medium text-foreground">{formatNumber(row.count)}</span>
              <span className="text-muted-foreground"> · {formatShare(row.count, total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const Note = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>

const countOf = (tallies: Tally[], key: string): number => tallies.find((tally) => tally.key === key)?.count ?? 0

const RESULT_COLORS: Record<string, string> = {
  granted: TONE.won,
  already_granted: TONE.won,
  skipped: TONE.stalled,
  denied: TONE.lost,
}

/** The long press lasts two seconds: released under one, it was a tap. */
const TAP_MS = 1_000

function ConsentCard({ consent, subtitle, focused }: { consent: ConsentMoment; subtitle: string; focused: boolean }) {
  return (
    <MomentCard anchor="consent" title="Consentement" subtitle={subtitle} focused={focused}>
      <div className="grid grid-cols-3 gap-4">
        <Figure
          label="Valident l'écran"
          value={formatShare(consent.validated, consent.reached)}
          hint={`${formatNumber(consent.validated)} sur ${formatNumber(consent.reached)}`}
        />
        <Figure label="« Tout accepter »" value={formatShare(consent.acceptedAll, consent.validated)} hint="de celles qui valident" />
        <Figure label="Temps médian" value={formatMs(consent.medianMs)} />
      </div>
      <MeterList
        title="Cases cochées au moment de valider"
        total={consent.validated}
        rows={consent.optIns.map((optIn) => ({ label: consentLabel(optIn.key), count: optIn.count }))}
      />
      <Note>
        {consent.linksOpened.length > 0
          ? `Liens légaux touchés : ${consent.linksOpened.map((link) => `${consentLinkLabel(link.key)} (${plural(link.count, "session")})`).join(", ")}.`
          : "Personne ne touche les liens vers la politique de confidentialité ou les CGU."}
        {consent.blocked > 0 &&
          ` ${plural(consent.blocked, "session")} ${agree(consent.blocked, "a", "ont")} tapé « Suivant » sans les cases obligatoires.`}
      </Note>
    </MomentCard>
  )
}

function ProgramCard({
  program,
  goalTitle,
  focused,
}: {
  program: ProgramMoment
  /** Title of a goal of the programme, from its template id. */
  goalTitle: (goal: string) => string
  focused: boolean
}) {
  const notes = [
    program.releasedEarly > 0 && program.medianEarlyReleaseMs !== null
      ? `Appui relâché après ${formatMs(program.medianEarlyReleaseMs)} en médiane${program.medianEarlyReleaseMs < TAP_MS ? " : un simple tap plutôt qu'un appui maintenu" : ""}.`
      : null,
    program.removedGoals.length > 0
      ? `Objectifs retirés : ${program.removedGoals.map((goal) => `${goalTitle(goal.key)} (${goal.count})`).join(", ")}.`
      : null,
  ].filter(Boolean)

  return (
    <MomentCard
      anchor="program"
      title="Programme et engagement"
      subtitle="Dernier écran : le programme proposé, puis l'appui long qui termine l'onboarding"
      focused={focused}
    >
      <div className="grid grid-cols-3 gap-4">
        <Figure label="Voient le programme" value={formatNumber(program.reached)} hint={agree(program.reached, "session", "sessions")} />
        <Figure label="S'engagent" value={formatShare(program.committed, program.reached)} hint="vont au bout de l'appui long" />
        <Figure label="Temps médian" value={formatMs(program.medianMs)} />
      </div>
      <MeterList
        total={program.reached}
        rows={[
          { label: "Relâchent l'appui long trop tôt au moins une fois", count: program.releasedEarly, color: TONE.stalled },
          { label: "Retirent au moins un objectif proposé", count: program.edited },
          { label: "Ouvrent un « Pourquoi ? »", count: program.openedWhy },
          { label: "Ouvrent une source scientifique", count: program.openedSource },
        ]}
      />
      {notes.length > 0 && <Note>{notes.join(" ")}</Note>}
    </MomentCard>
  )
}

function PermissionBody({ moment, kind, noun }: { moment: PermissionMoment; kind: PermissionKind; noun: string }) {
  const answered = moment.results.reduce((total, result) => total + result.count, 0)
  const enabled = countOf(moment.results, "granted") + countOf(moment.results, "already_granted")
  const rows: MeterRow[] = moment.results.map((result) => ({
    label: permissionResultLabel(result.key, kind),
    count: result.count,
    color: RESULT_COLORS[result.key],
  }))
  if (moment.asked > answered) rows.push({ label: "Sans réponse sur l'écran", count: moment.asked - answered, color: TONE.idle })

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Figure label="Voient l'écran" value={formatNumber(moment.asked)} hint={agree(moment.asked, "session", "sessions")} />
        <Figure
          label={`Activent ${noun}`}
          value={formatShare(enabled, moment.asked)}
          hint={`${formatNumber(enabled)} sur ${formatNumber(moment.asked)}`}
        />
      </div>
      <MeterList rows={rows} total={moment.asked} />
    </>
  )
}

function RegisterCard({ register, focused }: { register: RegisterMoment; focused: boolean }) {
  // Still on the sign-up screen when the figures were computed.
  const registering = register.reached - register.registered - register.tappedLogin - register.left

  return (
    <MomentCard anchor="register" title="Inscription" subtitle="Écran de création du compte, après l'onboarding" focused={focused} wide>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Arrivent à l'inscription" value={formatNumber(register.reached)} hint={agree(register.reached, "session", "sessions")} />
        <Figure
          label="Créent un compte"
          value={formatShare(register.registered, register.reached)}
          hint={`${formatNumber(register.registered)} sur ${formatNumber(register.reached)}`}
        />
        <Figure label="Temps médian" value={formatMs(register.medianMs)} hint="pour celles qui créent leur compte" />
        <Figure
          label="Rencontrent une erreur"
          value={formatShare(register.withError, register.reached)}
          hint={register.withError > 0 ? `compte créé malgré tout : ${register.withErrorRegistered} sur ${register.withError}` : undefined}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <MeterList
          title="Ce qu'elles deviennent"
          total={register.reached}
          rows={[
            { label: "Compte créé", count: register.registered, color: TONE.won },
            { label: "Tapent « J'ai déjà un compte » et repartent", count: register.tappedLogin, color: TONE.idle },
            { label: "Repartent sans compte", count: register.left, color: TONE.lost },
            ...(registering > 0 ? [{ label: "Encore sur l'écran", count: registering, color: TONE.idle }] : []),
          ]}
        />
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Méthodes essayées → comptes créés</p>
          {register.methods.length > 0 ? (
            <ul className="space-y-1.5">
              {register.methods.map((method) => (
                <li key={method.method} className="grid grid-cols-[4rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-sm">
                  <span className="text-foreground">{registerMethodLabel(method.method)}</span>
                  <Meter value={method.succeeded} total={method.tried} color={TONE.won} />
                  <span className="whitespace-nowrap text-right tabular-nums">
                    <span className="font-medium text-foreground">
                      {formatNumber(method.succeeded)} / {formatNumber(method.tried)}
                    </span>
                    <span className="text-muted-foreground"> · {formatShare(method.succeeded, method.tried)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune méthode essayée.</p>
          )}
          <Note>
            Sessions qui ont essayé la méthode, et celles dont le compte a été créé avec.
            {register.cancelled > 0 &&
              ` ${plural(register.cancelled, "session")} ${agree(register.cancelled, "a", "ont")} refermé la fenêtre Apple ou Google au moins une fois.`}
            {register.alreadySignedIn > 0 &&
              ` ${plural(register.alreadySignedIn, "session")} déjà ${agree(register.alreadySignedIn, "connectée", "connectées")} en arrivant (réinstallation).`}
          </Note>
        </div>
        <div className="space-y-2">
          {register.errors.length > 0 ? (
            <MeterList
              title="Erreurs rencontrées (sessions)"
              total={register.reached}
              rows={register.errors.map((error) => ({
                label: registerErrorLabel(error.key),
                // Tells an incident that is over from a problem still there.
                hint: `dernière session touchée : ${formatInParis(error.lastStartedAt, "d MMM")}`,
                count: error.count,
                color: TONE.stalled,
              }))}
            />
          ) : (
            <Note>Aucune erreur rencontrée à l'inscription.</Note>
          )}
          {register.typoPrompted > 0 && (
            <Note>
              Hors erreurs : l'app a demandé à {plural(register.typoPrompted, "session")} de confirmer une adresse e-mail qui semblait mal saisie.
            </Note>
          )}
        </div>
      </div>
    </MomentCard>
  )
}

function PaywallCard({ paywall, focused }: { paywall: PaywallMoment; focused: boolean }) {
  const purchased = countOf(paywall.results, "purchased")

  return (
    <MomentCard
      anchor="paywall"
      title="Paywall d'onboarding"
      subtitle="Présenté sur le premier écran d'accueil, une fois le compte créé"
      focused={focused}
      wide
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Comptes créés" value={formatNumber(paywall.accounts)} />
        <Figure
          label="Voient le paywall"
          value={formatShare(paywall.seen, paywall.accounts)}
          hint={`${formatNumber(paywall.seen)} sur ${formatNumber(paywall.accounts)}`}
        />
        <Figure
          label="S'abonnent"
          value={formatShare(purchased, paywall.seen, 1)}
          hint={`${formatNumber(purchased)} sur ${plural(paywall.seen, "paywall vu", "paywalls vus")}`}
        />
        <Figure label="Répondent en" value={formatMs(paywall.medianDelayMs)} hint="médiane, du compte créé à la réponse" />
      </div>
      <MeterList
        title="Réponse au paywall, sur l'ensemble des comptes créés"
        total={paywall.accounts}
        rows={[
          ...paywall.results.map((result) => ({
            label: paywallResultLabel(result.key),
            count: result.count,
            color: result.key === "purchased" || result.key === "restored" ? TONE.won : result.key === "cancelled" ? TONE.reach : TONE.idle,
          })),
          { label: "Sans réponse (jamais présenté, ou app fermée avant)", count: paywall.pending, color: TONE.lost },
        ]}
      />
      {paywall.pendingAfterMiss > 0 && (
        <Note>
          Parmi les comptes sans réponse, la présentation du paywall a échoué au moins une fois pour {paywall.pendingAfterMiss} ; l'app la retente
          au lancement suivant.
        </Note>
      )}
    </MomentCard>
  )
}

/** The screens of the tunnel that have an outcome of their own, in the order they come. */
export function MomentsTab({
  moments,
  dataset,
  signUp,
  focus,
}: {
  moments: Moments
  dataset: OnboardingDataset
  /** The flow goes on to a sign-up and a paywall; a re-onboarding stops before them. */
  signUp: boolean
  /** Card to bring into view, when the tab is opened from an insight. */
  focus: MomentKey | null
}) {
  useEffect(() => {
    if (focus) document.getElementById(anchorId(focus))?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focus])

  // The text the app shows on the screen of a type, as a reminder of which screen the card is about.
  const subtitle = (stepType: string, description: string) => {
    const screen = Object.values(dataset.screens).find((candidate) => candidate.type === stepType)
    return screen ? `« ${screen.title} » : ${description}` : description
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <ConsentCard
          consent={moments.consent}
          subtitle={subtitle("consent", "les cases à cocher avant toute question de santé")}
          focused={focus === "consent"}
        />
        <ProgramCard program={moments.program} goalTitle={(goal) => dataset.goals[goal] ?? goal} focused={focus === "program"} />

        <MomentCard
          anchor="permissions"
          title="Notifications"
          subtitle={subtitle("preNotification", "l'écran qui précède la fenêtre du système")}
          focused={focus === "permissions"}
        >
          <PermissionBody moment={moments.notifications} kind="notifications" noun="les notifications" />
        </MomentCard>

        <MomentCard title="Données de santé" subtitle={subtitle("healthPermission", "Apple Santé ou Health Connect")}>
          <PermissionBody moment={moments.health} kind="health" noun="le partage" />
          <Note>
            Sur iPhone, le choix fait dans la fenêtre Santé n'est pas lisible : « Acceptée » dit seulement que la fenêtre a été présentée, « Non
            accordée » que la demande n'a pas abouti. Sur Android, c'est la réponse donnée dans Health Connect.
          </Note>
        </MomentCard>

        {signUp && <RegisterCard register={moments.register} focused={focus === "register"} />}
        {signUp && <PaywallCard paywall={moments.paywall} focused={focus === "paywall"} />}
      </div>

      {moments.languageChanged > 0 && (
        <Note>
          {plural(moments.languageChanged, "session")} {agree(moments.languageChanged, "a", "ont")} changé la langue de l'app pendant l'onboarding.
        </Note>
      )}
    </div>
  )
}
