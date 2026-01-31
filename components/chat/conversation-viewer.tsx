"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChatMessage } from "./chat-message"
import { RefreshCcw, Clock, AlertTriangle, MessageSquare, RefreshCw } from "lucide-react"
import { formatLatency } from "@/lib/date-utils"
import type { ChatMessage as ChatMessageType } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ConversationViewerProps {
  messages: ChatMessageType[]
  metrics: {
    avgLatency: number
    errorCount: number
    avgRetryCount: number
    totalMessages: number
  }
  topics?: string[]
  entryPoint?: string
  isLoading?: boolean
  onReload?: () => void
}

export function ConversationViewer({
  messages,
  metrics,
  topics,
  entryPoint,
  isLoading,
  onReload,
}: ConversationViewerProps) {
  return (
    <Card className="border-border bg-card">
      {/* Header with metrics */}
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-foreground">Conversation</CardTitle>
          {onReload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onReload}
              disabled={isLoading}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            </Button>
          )}
        </div>

        {/* Metrics Bar */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{metrics.totalMessages}</span>
            <span className="text-xs text-muted-foreground">messages</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{formatLatency(metrics.avgLatency)}</span>
            <span className="text-xs text-muted-foreground">avg latency</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-foreground">{metrics.errorCount}</span>
            <span className="text-xs text-muted-foreground">errors</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-foreground">{metrics.avgRetryCount.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">avg retries</span>
          </div>
        </div>

        {/* Topics & Entry Point */}
        {(topics || entryPoint) && (
          <div className="flex flex-wrap items-center gap-2">
            {entryPoint && (
              <Badge variant="outline" className="text-xs">
                Entry: {entryPoint}
              </Badge>
            )}
            {topics?.map((topic) => (
              <Badge key={topic} variant="secondary" className="text-xs">
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      {/* Messages */}
      <CardContent>
        {isLoading ? (
          <div className="flex h-[400px] items-center justify-center">
            <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[600px] space-y-4 overflow-y-auto rounded-lg bg-card-soft p-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
