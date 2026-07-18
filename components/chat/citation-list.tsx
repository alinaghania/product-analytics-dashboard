"use client"

import Link from "next/link"
import type { Citation } from "@/lib/api-client"
import { MessageSquareQuote, ExternalLink } from "lucide-react"

// One verified citation: the snippet, the LLM's reason, and a deep-link that
// opens the conversation scrolled to the exact message (#msg-<messageId>).
function CitationEntry({ item }: { item: Citation }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <p className="text-sm italic leading-relaxed text-foreground">“{item.snippet}”</p>
      <p className="text-xs text-muted-foreground">{item.reason}</p>
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/chats/${item.conversationId}#msg-${item.messageId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Ouvrir le message
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href={`/users/${item.userId}`}
          className="truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          title={item.userId}
        >
          {item.userId}
        </Link>
      </div>
    </div>
  )
}

export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun message précis n’a pu être cité de façon vérifiable pour cette question.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquareQuote className="h-4 w-4" />
        {citations.length} message{citations.length > 1 ? "s" : ""} cité{citations.length > 1 ? "s" : ""}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {citations.map((item) => (
          <CitationEntry key={`${item.conversationId}:${item.messageId}`} item={item} />
        ))}
      </div>
    </div>
  )
}
