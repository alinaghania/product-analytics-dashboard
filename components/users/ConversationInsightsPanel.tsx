"use client"

import Link from "next/link"
import { useMutation } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { generateConversationInsights, type ConversationInsights } from "@/lib/api-client"
import { Loader2, MessageSquare, Sparkles } from "lucide-react"

type ConversationRef = ConversationInsights["interestingConversations"][number]

interface ConversationInsightsPanelProps {
  // Opens the in-place chats drawer for a user (email optional — falls back to
  // "Unknown email" in the drawer). Shared with the Users table's Chats column.
  onOpenChats: (userId: string, email?: string) => void
}

// One conversation row: read the conversation, jump to the user, or open the
// drawer in place — plus the LLM's short reason.
function ConversationEntry({
  item,
  onOpenChats,
}: {
  item: ConversationRef
  onOpenChats: (userId: string, email?: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Link
          href={`/chats/${item.conversationId}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Lire la conversation
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href={`/users/${item.userId}`}
          className="truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          title={item.userId}
        >
          {item.userId}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 shrink-0"
          onClick={() => onOpenChats(item.userId)}
        >
          <MessageSquare className="h-4 w-4" />
          <span className="sr-only">Ouvrir les chats</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{item.reason}</p>
    </div>
  )
}

export function ConversationInsightsPanel({ onOpenChats }: ConversationInsightsPanelProps) {
  const { mutate, isPending, data, error } = useMutation({
    mutationFn: generateConversationInsights,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Résumé & conversations les plus intéressantes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Analyse IA des 200 dernières conversations (hors onboarding).
          </p>
        </div>
        <Button onClick={() => mutate()} disabled={isPending} className="shrink-0">
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {isPending ? "Génération…" : "Générer"}
        </Button>
      </CardHeader>

      <CardContent>
        {isPending && (
          <div className="space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        )}

        {!isPending && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Échec de la génération."}
          </div>
        )}

        {!isPending && !error && !data && (
          <p className="text-sm text-muted-foreground">
            Cliquez sur « Générer » pour analyser les conversations récentes.
          </p>
        )}

        {!isPending && data && (
          <div className="space-y-6">
            {/* Global summary */}
            <p className="text-sm leading-relaxed text-foreground">{data.summary}</p>

            {/* Best conversation */}
            {data.bestConversation && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">Meilleure conversation</h3>
                <ConversationEntry item={data.bestConversation} onOpenChats={onOpenChats} />
              </div>
            )}

            {/* Top conversations (unit = conversation; a user may repeat) */}
            {data.interestingConversations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Top {data.interestingConversations.length} conversations à lire
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.interestingConversations.map((item) => (
                    <ConversationEntry
                      key={item.conversationId}
                      item={item}
                      onOpenChats={onOpenChats}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Meta line */}
            <p className="text-xs text-muted-foreground">
              {data.meta.conversationsAnalyzed} conversations analysées · {data.meta.onboardingExcluded}{" "}
              onboarding exclues · {data.meta.hallucinationsFiltered} hallucinations filtrées
              {data.meta.truncated ? " · corpus tronqué" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
