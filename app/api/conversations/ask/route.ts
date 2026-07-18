import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { askConversations } from "@/lib/conversation-ask"

// Reading ~hundreds of conversations + their messages, then one LLM call over a
// large corpus, is slow: force the Node runtime (Admin SDK) and raise Vercel's
// execution limit. Keep maxDuration ≤ the plan's ceiling (Hobby 60s, Pro 300s).
export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  question: z.string().trim().min(1, "La question est vide.").max(2000),
})

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const { question } = bodySchema.parse(await request.json())
    try {
      const data = await askConversations(question)
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
