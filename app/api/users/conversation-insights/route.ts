import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { generateConversationInsights } from "@/lib/conversation-insights"

// Reading ~400 conversations + their messages, then making 2 LLM calls, is
// slow: force the Node runtime (Admin SDK) and raise Vercel's execution limit
// (default ~10s Hobby / 15s Pro is far too short). Keep maxDuration ≤ the plan's
// ceiling (Hobby 60s, Pro 300s).
export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const data = await generateConversationInsights()
      return NextResponse.json({ data, generatedAt: new Date().toISOString() })
    } catch (error) {
      // Surface a missing LLM config as an explicit 503 instead of a generic 500.
      if (error instanceof Error && error.message.startsWith("LLM not configured")) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      throw error
    }
  })
}
