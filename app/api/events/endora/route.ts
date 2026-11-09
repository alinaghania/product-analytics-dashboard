import type { NextRequest } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
import { fetchAppEvents } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    return cachedJson(request, "events-endora", params, async () => {
      const events = (name: string) => fetchAppEvents({ from: params.from, to: params.to, name, limitCount: 5000 })
      const [sent, received, failed, screenOpened, conversationStarted, limitReached] = await Promise.all([
        events("endora_message_sent"),
        events("endora_message_received"),
        events("endora_message_failed"),
        events("endora_screen_opened"),
        events("endora_conversation_started"),
        events("endora_message_limit_reached"),
      ])
      return {
        sent: sent.data,
        received: received.data,
        failed: failed.data,
        screenOpened: screenOpened.data,
        conversationStarted: conversationStarted.data,
        limitReached: limitReached.data,
        generatedAt: new Date().toISOString(),
      }
    })
  })
}
