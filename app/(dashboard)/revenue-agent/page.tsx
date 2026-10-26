"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentAnswer } from "@/components/revenue-agent/agent-answer"
import { AgentChart } from "@/components/revenue-agent/agent-chart"
import { DeepProgressView, DeepReportView } from "@/components/revenue-agent/deep-report"
import {
  askRevenueAgent,
  runDeepAnalysis,
  type DeepProgress,
  type DeepReport,
  type RevenueAgentResult,
} from "@/lib/api-client"
import { AlertTriangle, CheckCircle2, Loader2, Microscope, RotateCcw, Send } from "lucide-react"

const EXAMPLES = [
  "Résume-moi la semaine dernière.",
  "On a changé le prix le 27/07 : quel impact ?",
  "Le test de prix 13,99/79,99 marche-t-il mieux ?",
  "Quelle source d'acquisition ramène le plus de premium ?",
  "Pourquoi le revenu d'octobre est différent de septembre ?",
]

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; result: RevenueAgentResult }
  | { role: "deep"; content: string; report: DeepReport }

export default function RevenueAgentPage() {
  const [question, setQuestion] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const askMutation = useMutation({
    mutationFn: askRevenueAgent,
    onSuccess: (result) => setTurns((t) => [...t, { role: "assistant", content: result.answer, result }]),
  })
  // Deep analysis: 5 code-built dossiers → 5 analysts → synthesis (~2-3 min).
  const [deepProgress, setDeepProgress] = useState<DeepProgress[]>([])
  const deepMutation = useMutation({
    mutationFn: (q: string | null) => {
      setDeepProgress([])
      return runDeepAnalysis(q, (p) => setDeepProgress((list) => [...list, p]))
    },
    onSuccess: (report) => setTurns((t) => [...t, { role: "deep", content: report.synthese?.en_bref.join(" ") ?? "", report }]),
  })
  const isPending = askMutation.isPending || deepMutation.isPending
  const error = askMutation.error ?? deepMutation.error

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns.length, isPending])

  const ask = (text = question) => {
    const q = text.trim()
    if (!q || isPending) return
    // Follow-ups replay the conversation as plain text (last 10 messages).
    const next: Turn[] = [...turns, { role: "user", content: q }]
    setTurns(next)
    setQuestion("")
    askMutation.mutate(
      next
        .slice(-10)
        .map(({ role, content }) => ({ role: role === "deep" ? ("assistant" as const) : role, content })),
    )
  }

  const deep = () => {
    if (isPending) return
    const q = question.trim()
    setTurns((t) => [...t, { role: "user", content: q ? `🔬 Analyse approfondie : ${q}` : "🔬 Analyse approfondie" }])
    setQuestion("")
    deepMutation.mutate(q || null)
  }

  const reset = () => {
    setTurns([])
    askMutation.reset()
    deepMutation.reset()
    setQuestion("")
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Agent Revenus"
        description="Pose une question sur les abonnements : l'agent croise RevenueCat, App Store, prix, releases et acquisition."
      />

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        {turns.length === 0 && (
          <button
            type="button"
            onClick={deep}
            className="w-full rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Microscope className="h-4 w-4 text-primary" /> Analyse approfondie (≈ 2-3 min)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              5 analystes (offres & prix, rétention, conversion, acquisition, produit) + un bilan stratégique avec recos. Tu
              peux taper une question avant pour orienter l'analyse.
            </p>
          </button>
        )}

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => ask(ex)}
                className="rounded-full border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-primary/15 px-4 py-2 text-sm text-foreground">
              {turn.content}
            </p>
          ) : turn.role === "deep" ? (
            <Card key={i}>
              <CardContent className="pt-6">
                <DeepReportView report={turn.report} />
              </CardContent>
            </Card>
          ) : (
            <Card key={i}>
              <CardContent className="space-y-4 pt-6">
                <AgentAnswer text={turn.content} />
                {turn.result.charts.map((spec, j) => (
                  <AgentChart key={j} spec={spec} />
                ))}
                {turn.result.unverifiedNumbers.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Chiffres vérifiés : tous viennent des données (calculés par le code, pas par l'IA)
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Non vérifiés, ne pas s'y fier : {turn.result.unverifiedNumbers.join(", ")}
                  </p>
                )}
                {turn.result.sources.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none">Sources ({turn.result.sources.length})</summary>
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {turn.result.sources.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          ),
        )}

        {deepMutation.isPending && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Analyse approfondie en cours (≈ 2-3 min)…
              </p>
              <DeepProgressView events={deepProgress} />
            </CardContent>
          </Card>
        )}

        {askMutation.isPending && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Je croise RevenueCat, App Store et l'app… (~30 s)
              </p>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        )}

        {!isPending && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Échec de l'analyse."}
          </div>
        )}

        <div ref={bottomRef} />

        <div className="sticky bottom-4 space-y-2 rounded-xl border bg-card p-3 shadow-lg">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={turns.length ? "Une précision ?" : "Ex : pourquoi les abonnements baissent ce mois-ci ?"}
            rows={2}
            className="resize-none border-0 bg-transparent focus-visible:ring-0"
            onKeyDown={(e) => {
              // isComposing: Enter during dead-key/IME composition (ê, …) must not send.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                ask()
              }
            }}
          />
          <div className="flex items-center justify-end gap-2">
            {turns.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                <RotateCcw className="mr-2 h-4 w-4" /> Nouvelle conversation
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={deep} disabled={isPending}>
              <Microscope className="mr-2 h-4 w-4" /> Analyse approfondie
            </Button>
            <Button size="sm" onClick={() => ask()} disabled={isPending || !question.trim()}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Demander
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
