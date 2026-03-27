import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
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

    const [sent, received, failed, screenOpened, conversationStarted, limitReached] = await Promise.all([
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_message_sent", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_message_received", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_message_failed", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_screen_opened", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_conversation_started", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "endora_message_limit_reached", limitCount: 5000 }),
    ])

    return NextResponse.json({
      sent: sent.data,
      received: received.data,
      failed: failed.data,
      screenOpened: screenOpened.data,
      conversationStarted: conversationStarted.data,
      limitReached: limitReached.data,
      generatedAt: new Date().toISOString(),
    })
  })
}
