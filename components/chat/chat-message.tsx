"use client"

import { Badge } from "@/components/ui/badge"
import { formatTime, formatLatency } from "@/lib/date-utils"
import { cn } from "@/lib/utils"
import type { ChatMessage as ChatMessageType } from "@/lib/types"
import { AlertCircle, Clock, RefreshCw } from "lucide-react"

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const isError = message.status === "error"

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          isUser ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent",
        )}
      >
        {isUser ? "U" : "E"}
      </div>

      {/* Message Content */}
      <div className={cn("max-w-[70%] space-y-2", isUser ? "items-end" : "items-start")}>
        {/* Header with badges */}
        <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
          <Badge variant="secondary" className="text-[10px]">
            {message.role}
          </Badge>
          {message.agent && (
            <Badge variant="outline" className="text-[10px]">
              {message.agent}
            </Badge>
          )}
          {isError && (
            <Badge className="bg-destructive/20 text-destructive text-[10px]">
              <AlertCircle className="mr-1 h-3 w-3" />
              Error
            </Badge>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-card-soft text-foreground",
            isError && "border border-destructive/30",
          )}
        >
          {message.content}
          {message.errorMessage && <p className="mt-2 text-xs text-destructive/80">Error: {message.errorMessage}</p>}
        </div>

        {/* Footer with metrics */}
        <div className={cn("flex items-center gap-3 text-[10px] text-muted-foreground", isUser && "flex-row-reverse")}>
          <span>{formatTime(message.createdAt)}</span>
          {message.latencyMs !== undefined && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatLatency(message.latencyMs)}
            </span>
          )}
          {message.retryCount !== undefined && message.retryCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <RefreshCw className="h-3 w-3" />
              {message.retryCount} retries
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
