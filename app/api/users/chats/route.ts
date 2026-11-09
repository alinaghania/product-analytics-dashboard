import type { NextRequest } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
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

    return cachedJson(request, "users-chats", params, async () => {
      const generatedAt = new Date().toISOString()

      if (params.mode === "check") {
        return { data: await checkUserHasChats(params.userId), generatedAt }
      }

      if (params.mode === "messages" && params.conversationId) {
        return { data: await fetchChatSessionMessages(params.conversationId), generatedAt }
      }

      return { data: await fetchUserChatSessions(params.userId), generatedAt }
    })
  })
}
