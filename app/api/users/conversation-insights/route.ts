import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { generateConversationInsights } from "@/lib/conversation-insights"
import { cachedJson } from "@/lib/server-cache"

// Reading ~400 conversations + their messages, then making 2 LLM calls, is
// slow: force the Node runtime (Admin SDK) and raise the execution limit.
// maxDuration is Vercel-only; on Cloud Run the limit is the service timeout
// (infra/terraform/cloud-run.tf).
export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = "force-dynamic"

// The analysis takes no input: one result per day serves every admin until
// "Régénérer" (?fresh=1) replaces it.
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      return await cachedJson(request, "conversation-insights", null, async () => ({
        data: await generateConversationInsights(),
        generatedAt: new Date().toISOString(),
      }))
    } catch (error) {
      // Surface a missing LLM config as an explicit 503 instead of a generic 500.
      if (error instanceof Error && error.message.startsWith("LLM not configured")) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      throw error
    }
  })
}
