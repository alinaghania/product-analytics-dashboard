import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { runRevenueAgent } from "@/lib/revenue-agent/agent"
import { RevenueCatConfigError } from "@/lib/revenuecat"

// Several LLM turns + RevenueCat/ASC/Firestore calls: Node runtime, long limit.
// maxDuration is Vercel-only; on Cloud Run the limit is the service timeout
// (infra/terraform/cloud-run.tf).
export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1].role === "user", "Le dernier message doit être une question."),
})

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const { messages } = bodySchema.parse(await request.json())
    try {
      const data = await runRevenueAgent(messages)
      return NextResponse.json({ data, generatedAt: new Date().toISOString() })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LLM not configured")) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      if (error instanceof RevenueCatConfigError) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }
      throw error
    }
  })
}
