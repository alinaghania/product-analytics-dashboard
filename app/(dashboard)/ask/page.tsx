"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { CitationList } from "@/components/chat/citation-list"
import { askConversations } from "@/lib/api-client"
import { Loader2, Sparkles } from "lucide-react"

const EXAMPLES = [
  "Cite-moi les messages où des utilisatrices demandent une nouvelle fonctionnalité.",
  "Quels bugs ou problèmes techniques sont remontés dans les dernières conversations ?",
  "Quelles douleurs ou frustrations reviennent le plus souvent ?",
]

export default function AskConversationsPage() {
  const [question, setQuestion] = useState("")
  const { mutate, isPending, data, error } = useMutation({
    mutationFn: askConversations,
  })

  const ask = () => {
    const q = question.trim()
    if (q) mutate(q)
  }

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
            <Button onClick={ask} disabled={isPending || !question.trim()} className="shrink-0">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isPending ? "Analyse…" : "Demander"}
            </Button>
          </CardContent>
        </Card>

        {(isPending || error || data) && (
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

              {!isPending && data && (
                <div className="space-y-6">
                  <p className="text-sm leading-relaxed text-foreground">{data.answer}</p>

                  <CitationList citations={data.citations} />

                  <p className="text-xs text-muted-foreground">
                    {data.meta.conversationsAnalyzed} conversations analysées · {data.meta.onboardingExcluded}{" "}
                    onboarding exclues · {data.meta.hallucinationsFiltered} hallucinations filtrées
                    {data.meta.truncated ? " · corpus tronqué (résultat non exhaustif)" : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
