"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/date-utils"
import { fetchChatSessionMessages, fetchUserChatSessions } from "@/lib/firestore-queries"
import type { ChatConversation, ChatMessage } from "@/lib/types"

interface UserChatsDrawerProps {
  userId: string
  userEmail: string
  open: boolean
  onClose: () => void
}

function sessionLabel(session: ChatConversation, index: number) {
  const date = session.updatedAt || session.createdAt || session.lastMessageAt
  if (date && date.getTime() > 0) {
    return `Session ${formatDateTime(date)}`
  }
  return `Conversation #${index + 1}`
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const timeLabel = message.createdAtMissing ? "unknown time" : formatDateTime(message.createdAt)

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-card-soft text-foreground",
        )}
      >
        {message.content || <span className="text-muted-foreground">No content</span>}
      </div>
      <span className="text-[10px] text-muted-foreground">{timeLabel}</span>
    </div>
  )
}

export function UserChatsDrawer({ userId, userEmail, open, onClose }: UserChatsDrawerProps) {
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const {
    data: sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ["userChatSessions", userId],
    queryFn: () => fetchUserChatSessions(userId),
    enabled: open && Boolean(userId),
    refetchOnWindowFocus: false,
  })

  const sessionList: ChatConversation[] = sessions || []

  useEffect(() => {
    if (!open) {
      setSelectedSessionId("")
      return
    }
    if (sessionList.length === 0) {
      setSelectedSessionId("")
      return
    }
    if (!selectedSessionId || !sessionList.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessionList[0].id)
    }
  }, [open, sessionList, selectedSessionId])

  const {
    data: messages,
    isLoading: messagesLoading,
    error: messagesError,
  } = useQuery({
    queryKey: ["chatSessionMessages", selectedSessionId],
    queryFn: () => fetchChatSessionMessages(selectedSessionId),
    enabled: open && Boolean(selectedSessionId),
    refetchOnWindowFocus: false,
  })

  const messageList: ChatMessage[] = messages || []

  useEffect(() => {
    if (!messageList.length) return
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messageList])

  const sessionHeader = useMemo(() => {
    const current = sessionList.find((session) => session.id === selectedSessionId)
    if (!current) return "Messages"
    const date = current.updatedAt || current.createdAt || current.lastMessageAt
    if (date && date.getTime() > 0) {
      return `Messages - ${formatDateTime(date)}`
    }
    return "Messages"
  }, [sessionList, selectedSessionId])

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-[720px]">
        <SheetHeader>
          <SheetTitle>Chats - {userEmail || "Unknown email"}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>UID:</span>
            <Badge variant="outline" className="text-[10px]">
              {userId || "unknown"}
            </Badge>
          </div>
        </SheetHeader>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <div className="flex w-full flex-col gap-3 md:w-56 lg:w-64">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Sessions</span>
              {sessionList.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {sessionList.length}
                </Badge>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-card p-2">
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                  Loading sessions...
                </div>
              ) : sessionsError ? (
                <div className="text-xs text-destructive">Failed to load sessions.</div>
              ) : sessionList.length === 0 ? (
                <div className="text-xs text-muted-foreground">No sessions available.</div>
              ) : (
                sessionList.map((session, index) => {
                  const isSelected = session.id === selectedSessionId
                  return (
                    <Button
                      key={session.id}
                      variant="ghost"
                      className={cn(
                        "h-auto w-full justify-start px-3 py-2 text-left",
                        isSelected && "bg-muted text-foreground",
                      )}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <div className="flex w-full flex-col gap-1">
                        <span className="text-xs font-medium text-foreground">
                          {sessionLabel(session, index)}
                        </span>
                        {session.lastMessageSnippet && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {session.lastMessageSnippet}
                          </span>
                        )}
                      </div>
                    </Button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{sessionHeader}</span>
              {selectedSessionId && (
                <Badge variant="secondary" className="text-[10px]">
                  {messageList.length} messages
                </Badge>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-card-soft p-4">
              {messagesLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messagesError ? (
                <div className="text-xs text-destructive">Failed to load messages.</div>
              ) : !selectedSessionId ? (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  Select a session to view messages.
                </div>
              ) : messageList.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  No messages.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {messageList.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
