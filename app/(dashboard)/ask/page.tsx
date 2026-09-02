"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Header } from "@/components/dashboard/header"
import { HistoryPanel, type HistoryRow } from "@/components/dashboard/history-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { CitationList } from "@/components/chat/citation-list"
import {
  addAskHistory,
  askConversations,
  deleteAskHistory,
  fetchAskHistory,
  type AskResult,
} from "@/lib/api-client"
import { Loader2, RotateCcw, Sparkles } from "lucide-react"

const EXAMPLES = [
  "Cite-moi les messages où des utilisatrices demandent une nouvelle fonctionnalité.",
  "Quels bugs ou problèmes techniques sont remontés dans les dernières conversations ?",
  "Quelles douleurs ou frustrations reviennent le plus souvent ?",
]

const ASK_HISTORY_KEY = ["ask-history"]

export default function AskConversationsPage() {
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState("")
  // The answer currently on screen — from a fresh ask or a restored history entry.
  const [result, setResult] = useState<{ question: string; data: AskResult } | null>(null)

  // Persist each successful run so it can be found again later. A save failure
  // must not disrupt the answer already shown, so its errors are swallowed.
  const saveMutation = useMutation({
    mutationFn: addAskHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASK_HISTORY_KEY }),
  })

  const askMutation = useMutation({
    mutationFn: askConversations,
    // Drop any answer already on screen so a failed ask can't leave a stale
    // result showing beneath the error message.
    onMutate: () => setResult(null),
    onSuccess: (data, askedQuestion) => {
      setResult({ question: askedQuestion, data })
      saveMutation.mutate({
        question: askedQuestion,
        answer: data.answer,
        citations: data.citations,
        meta: data.meta,
      })
    },
  })

  const historyQuery = useQuery({
    queryKey: ASK_HISTORY_KEY,
    queryFn: fetchAskHistory,
    staleTime: 5 * 60 * 1000,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAskHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASK_HISTORY_KEY })
      toast.success("Recherche supprimée de l'historique")
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Échec de la suppression"),
  })

  const { isPending, error } = askMutation

  const ask = () => {
    const q = question.trim()
    if (q) askMutation.mutate(q)
  }

  const reset = () => {
    setResult(null)
    askMutation.reset()
    setQuestion("")
  }

  const restore = (id: string) => {
    const entry = historyQuery.data?.data.find((e) => e.id === id)
    if (!entry) return
    setQuestion(entry.question)
    setResult({
      question: entry.question,
      data: { answer: entry.answer, citations: entry.citations, meta: entry.meta },
    })
  }

  // The history sits at the bottom and hides as soon as a search runs or an
  // answer (fresh or restored) is on screen — « Nouvelle recherche » brings it back.
  const showHistory = !isPending && !result && !error

  const rows: HistoryRow[] = useMemo(
    () =>
      (historyQuery.data?.data ?? []).map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        createdBy: e.createdBy,
        primary: e.question,
        secondary: <span className="line-clamp-2">{e.answer}</span>,
      })),
    [historyQuery.data],
  )

  return (
    <div className="flex flex-col">
      <Header
        title="Ask Conversations"
        description="Pose une question en langage naturel sur les conversations récentes des utilisatrices."
      />

      <div className="flex-1 space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ta question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex : cite-moi les messages où des utilisatrices demandent une nouvelle fonctionnalité…"
              rows={3}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter submits.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask()
              }}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuestion(ex)}
                  className="rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={ask} disabled={isPending || !question.trim()} className="shrink-0">
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isPending ? "Analyse…" : "Demander"}
              </Button>
              {(result || error) && (
                <Button variant="ghost" onClick={reset} className="shrink-0">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Nouvelle recherche
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {(isPending || error || result) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Réponse</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending && (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                </div>
              )}

              {!isPending && error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {error instanceof Error ? error.message : "Échec de l’analyse."}
                </div>
              )}

              {!isPending && result && (
                <div className="space-y-6">
                  <p className="text-sm font-medium text-muted-foreground">« {result.question} »</p>
                  <p className="text-sm leading-relaxed text-foreground">{result.data.answer}</p>

                  <CitationList citations={result.data.citations} />

                  <p className="text-xs text-muted-foreground">
                    {result.data.meta.conversationsAnalyzed} conversations analysées ·{" "}
                    {result.data.meta.onboardingExcluded} onboarding exclues ·{" "}
                    {result.data.meta.hallucinationsFiltered} hallucinations filtrées
                    {result.data.meta.truncated ? " · corpus tronqué (résultat non exhaustif)" : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showHistory && (
          <HistoryPanel
            title="Historique des recherches"
            description="Clique sur une recherche pour réafficher sa réponse."
            rows={rows}
            isLoading={historyQuery.isLoading}
            unavailable={Boolean(historyQuery.data?.error)}
            emptyLabel="Aucune recherche enregistrée pour l'instant."
            onSelect={restore}
            onDelete={(id) => deleteMutation.mutate(id)}
            deletingId={deleteMutation.isPending ? deleteMutation.variables : null}
          />
        )}
      </div>
    </div>
  )
}
