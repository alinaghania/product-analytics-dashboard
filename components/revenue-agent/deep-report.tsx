"use client"

import { AlertTriangle, CheckCircle2, ChevronRight, Circle, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { DeepProgress, DeepReport } from "@/lib/api-client"
import { AgentChart } from "./agent-chart"

const STEP_LABELS: Record<string, string> = {
  offres: "Offres & prix",
  retention: "Rétention & valeur",
  conversion: "Conversion",
  acquisition: "Acquisition",
  produit: "Produit & usage",
}
const IDS = Object.keys(STEP_LABELS)

function StepIcon({ state }: { state: "todo" | "running" | "ok" | "ko" }) {
  if (state === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (state === "ko") return <XCircle className="h-3.5 w-3.5 text-destructive" />
  if (state === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
}

/** Live checklist: code builds 5 dossiers → 5 analysts → synthesis. */
export function DeepProgressView({ events }: { events: DeepProgress[] }) {
  const done = (step: DeepProgress["step"], id?: string) =>
    events.find((e) => e.step === step && (!id || ("id" in e && e.id === id)))
  const state = (step: DeepProgress["step"], id?: string, started = true) => {
    const e = done(step, id)
    return e ? (e.ok ? "ok" : "ko") : started ? "running" : "todo"
  }
  const allDossiers = IDS.every((id) => done("dossier", id))
  const allAnalysts = IDS.every((id) => done("analyste", id) || done("dossier", id)?.ok === false)

  return (
    <div className="grid gap-4 text-xs sm:grid-cols-3">
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">1. Le code calcule</p>
        {IDS.map((id) => (
          <p key={id} className="flex items-center gap-1.5 text-muted-foreground">
            <StepIcon state={state("dossier", id)} /> {STEP_LABELS[id]}
          </p>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">2. 5 analystes lisent</p>
        {IDS.map((id) => (
          <p key={id} className="flex items-center gap-1.5 text-muted-foreground">
            <StepIcon state={state("analyste", id, Boolean(done("dossier", id)?.ok))} /> {STEP_LABELS[id]}
          </p>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="font-medium text-foreground">3. Bilan & stratégie</p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <StepIcon state={state("synthese", undefined, allDossiers && allAnalysts)} /> Synthèse
        </p>
      </div>
    </div>
  )
}

function Verified({ unverified }: { unverified: string[] }) {
  return unverified.length === 0 ? (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Chiffres vérifiés (calculés par le code)
    </p>
  ) : (
    <p className="flex items-center gap-1.5 text-xs text-amber-500">
      <AlertTriangle className="h-3.5 w-3.5" /> Non vérifiés, ne pas s'y fier : {unverified.join(", ")}
    </p>
  )
}

const EFFORT_STYLE = { faible: "bg-emerald-500/15 text-emerald-400", moyen: "bg-amber-500/15 text-amber-400", fort: "bg-rose-500/15 text-rose-400" }
const CONFIDENCE_LABEL = { haute: "confiance haute", moyenne: "confiance moyenne", faible: "confiance faible" }

export function DeepReportView({ report }: { report: DeepReport }) {
  const s = report.synthese
  return (
    <div className="space-y-6">
      {s && (
        <>
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">À retenir</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {s.en_bref.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Ce que je ferais, dans l'ordre</p>
            <ol className="space-y-3">
              {s.recommandations.map((r, i) => (
                <li key={r.action} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-foreground">
                        {r.action}{" "}
                        <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${EFFORT_STYLE[r.effort]}`}>
                          effort {r.effort}
                        </span>
                      </p>
                      <p className="text-sm text-foreground/80">
                        <span className="text-muted-foreground">Pourquoi : </span>
                        {r.pourquoi}
                      </p>
                      <p className="text-xs text-muted-foreground">📏 {r.comment_mesurer}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <details className="group rounded-lg border p-3" open>
            <summary className="flex cursor-pointer select-none items-center gap-1 text-sm font-semibold text-foreground">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /> Diagnostic & stratégie
            </summary>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
              <p>{s.diagnostic}</p>
              <p>
                <span className="font-medium text-foreground">Stratégie : </span>
                {s.strategie}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold text-foreground">👀 À surveiller chaque semaine</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {s.a_surveiller.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-foreground">❓ On ne sait pas encore</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {s.on_ne_sait_pas_encore.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </details>
          <Verified unverified={s.unverifiedNumbers} />
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Le détail, par analyste</p>
        {report.sections.map((sec) => (
          <details key={sec.id} className="group rounded-lg border p-3">
            <summary className="flex cursor-pointer select-none items-start gap-1">
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
              <span className="space-y-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {sec.titre}
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {CONFIDENCE_LABEL[sec.confiance]}
                  </Badge>
                </span>
                <span className="block text-sm text-muted-foreground">{sec.en_une_phrase}</span>
              </span>
            </summary>
            <div className="mt-3 space-y-4 pl-5">
              <ul className="space-y-3">
                {sec.constats.map((c) => (
                  <li key={c.fait} className="text-sm">
                    <p className="text-foreground">{c.fait}</p>
                    <p className="mt-0.5 text-foreground/70">→ {c.ce_que_ca_veut_dire}</p>
                  </li>
                ))}
              </ul>
              {sec.charts.map((spec) => (
                <AgentChart key={spec.title} spec={spec} />
              ))}
              <p className="text-sm">
                <span className="font-medium text-foreground">➡️ </span>
                {sec.recommandation}
              </p>
              <p className="text-xs text-muted-foreground">Limites : {sec.limites}</p>
              {sec.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-500/90">⚠️ {w}</p>
              ))}
              <Verified unverified={sec.unverifiedNumbers} />
            </div>
          </details>
        ))}
      </div>

      {report.erreurs.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {report.erreurs.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}
