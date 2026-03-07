import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import {
  fetchUserChatSessions,
  fetchChatSessionMessages,
  checkUserHasChats,
} from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  userId: z.string(),
  mode: z.enum(["sessions", "messages", "check"]).default("sessions"),
  conversationId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      userId: searchParams.get("userId"),
      mode: searchParams.get("mode") || "sessions",
      conversationId: searchParams.get("conversationId") || undefined,
    })

    if (params.mode === "check") {
      const hasChats = await checkUserHasChats(params.userId)
      return NextResponse.json({ data: hasChats, generatedAt: new Date().toISOString() })
    }

    if (params.mode === "messages" && params.conversationId) {
      const messages = await fetchChatSessionMessages(params.conversationId)
      return NextResponse.json({ data: messages, generatedAt: new Date().toISOString() })
    }

    const sessions = await fetchUserChatSessions(params.userId)
    return NextResponse.json({ data: sessions, generatedAt: new Date().toISOString() })
  })
}
