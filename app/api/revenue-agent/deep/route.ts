import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { runDeepAnalysis } from "@/lib/revenue-agent/deep-analysis"

// 5 dossiers (~25 rate-limited RevenueCat calls) + 6 LLM calls: ~2-3 min.
export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

const bodySchema = z.object({ question: z.string().trim().max(2000).optional() })

// Streams NDJSON: {"type":"progress",...} lines while it works, then one
// {"type":"result","data":…} (or {"type":"error"}) line. Auth is checked
// before the stream opens.
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const { question } = bodySchema.parse(await request.json().catch(() => ({})))
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
        try {
          const data = await runDeepAnalysis(question || null, (p) => send({ type: "progress", ...p }))
          send({ type: "result", data })
        } catch (error) {
          console.error("[deep-analysis] failed:", error)
          send({ type: "error", error: error instanceof Error ? error.message : "Analyse impossible" })
        } finally {
          controller.close()
        }
      },
    })
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    })
  })
}
