"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { ConversationViewer } from "@/components/chat/conversation-viewer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/date-utils"
import { fetchConversationMessages } from "@/lib/firestore-queries"
import { getFirebaseDb, doc, getDoc, toDate } from "@/lib/firebase"
import type { ChatMessage, ChatConversation } from "@/lib/types"
import { ArrowLeft, User } from "lucide-react"
import Link from "next/link"

async function fetchConversationData(conversationId: string) {
  const db = getFirebaseDb()

  const convDoc = await getDoc(doc(db, "chat_conversations", conversationId))
  let conversation: ChatConversation | null = null

  if (convDoc.exists()) {
    const data = convDoc.data()
    conversation = {
      id: convDoc.id,
      userId: data.userId || "",
      messageCount: data.messageCount || 0,
      topics: data.topics || [],
      entryPoint: data.entryPoint,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    }
  }

  const { data: messages } = await fetchConversationMessages(conversationId, { limitCount: 100 })

  return { conversation, messages }
}

export default function ConversationDetailPage() {
  const params = useParams()
  const conversationId = params.conversationId as string
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConversationData(conversationId),
    enabled: false, // Manual reload only
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const conversation = data?.conversation || {
    id: conversationId,
    userId: "",
    messageCount: 0,
    topics: [],
    entryPoint: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const messages: ChatMessage[] = data?.messages || []

  const messagesWithLatency = messages.filter((m) => m.latencyMs)
  const metrics = {
    avgLatency:
      messagesWithLatency.length > 0
        ? Math.round(messagesWithLatency.reduce((acc, m) => acc + (m.latencyMs || 0), 0) / messagesWithLatency.length)
        : 0,
    errorCount: messages.filter((m) => m.status === "error").length,
    avgRetryCount:
      messages.length > 0
        ? Math.round((messages.reduce((acc, m) => acc + (m.retryCount || 0), 0) / messages.length) * 100) / 100
        : 0,
    totalMessages: messages.length,
  }

  const duration =
    messages.length > 1
      ? Math.round((messages[messages.length - 1].createdAt.getTime() - messages[0].createdAt.getTime()) / 60000)
      : 0

  return (
    <div className="flex flex-col">
      <Header title="Conversation Detail" description={`Conversation ${conversationId}`} lastUpdated={lastUpdated} />

      <div className="flex-1 space-y-6 p-6">
        <Link
          href="/chats"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Chat Analytics
        </Link>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-foreground">Conversation Info</CardTitle>
              <div className="flex gap-2">
                {conversation.topics?.map((topic: string) => (
                  <Badge key={topic} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  {conversation.userId ? (
                    <Link
                      href={`/users/${conversation.userId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {conversation.userId.slice(0, 12)}...
                    </Link>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unknown</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entry Point</p>
                <p className="text-sm font-medium text-foreground">{conversation.entryPoint || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Started</p>
                <p className="text-sm font-medium text-foreground">{formatDateTime(conversation.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-medium text-foreground">{duration > 0 ? `~${duration} minutes` : "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <ConversationViewer
          messages={messages}
          metrics={metrics}
          topics={conversation.topics}
          entryPoint={conversation.entryPoint}
          isLoading={isLoading}
          onReload={handleReload}
        />
      </div>
    </div>
  )
}
