"use client"

import { useQuery } from "@tanstack/react-query"
import { ThumbsDown, ThumbsUp } from "lucide-react"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { fetchChatFeedback } from "@/lib/api-client"

export const CHAT_FEEDBACK_QUERY_KEY = ["chat-feedback"]

const LIKE_COLOR = "#3B82F6"
const DISLIKE_COLOR = "#FF5C5C"

const FEEDBACK_STACKS = [
  { key: "likes", color: LIKE_COLOR, label: "Likes" },
  { key: "dislikes", color: DISLIKE_COLOR, label: "Dislikes" },
]

const plural = (count: number, word: string) => `${count.toLocaleString("fr-FR")} ${word}${count > 1 ? "s" : ""}`

/** Likes and dislikes left by users on the assistant's chat answers, per week. */
export function ChatFeedbackChart() {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: CHAT_FEEDBACK_QUERY_KEY,
    queryFn: fetchChatFeedback,
  })

  const rated = data ? data.likes + data.dislikes : 0

  return (
    <ChartCard
      title="Likes et dislikes sur le chat"
      description="Pouces laissés par les utilisatrices sur les réponses de l'assistante, par semaine (chaque barre commence le lundi indiqué)."
      isLoading={isFetching}
      onReload={() => refetch()}
    >
      {error || !data ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Impossible de charger les likes et dislikes."}
        </div>
      ) : rated === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          Aucun like ou dislike pour l'instant.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground">
            <span className="flex items-center gap-2 font-medium">
              <ThumbsUp className="h-4 w-4" style={{ color: LIKE_COLOR }} />
              {plural(data.likes, "like")}
            </span>
            <span className="flex items-center gap-2 font-medium">
              <ThumbsDown className="h-4 w-4" style={{ color: DISLIKE_COLOR }} />
              {plural(data.dislikes, "dislike")}
            </span>
            <span className="text-muted-foreground">
              {Math.round((data.likes / rated) * 100)} % de likes · {plural(data.ratedConversations, "conversation")}{" "}
              {data.ratedConversations > 1 ? "concernées" : "concernée"}
            </span>
          </div>

          <BarChart data={data.weekly} xKey="weekStart" yKey="total" maxBars={30} stacks={FEEDBACK_STACKS} />

          <p className="text-xs text-muted-foreground">
            État actuel des pouces : un pouce retiré ou changé ne laisse pas de trace.
          </p>
        </div>
      )}
    </ChartCard>
  )
}
