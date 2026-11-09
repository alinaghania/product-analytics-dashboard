import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { runDeepAnalysis } from "@/lib/revenue-agent/deep-analysis"
import { cachedValue, wantsFresh } from "@/lib/server-cache"

// 5 dossiers (~25 rate-limited RevenueCat calls) + 6 LLM calls: ~2-3 min.
export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

const bodySchema = z.object({ question: z.string().trim().max(2000).optional() })

// Streams NDJSON: {"type":"progress",...} lines while it works, then one
// {"type":"result","data":…} (or {"type":"error"}) line. Auth is checked
// before the stream opens. A complete report for the same question is reused
// until midnight (sent at once, with its `cachedAt`); ?fresh=1 forces a new run.
export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const { question } = bodySchema.parse(await request.json().catch(() => ({})))
    const fresh = wantsFresh(request)
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
          } catch {
            // Client gone: keep going, the finished report still gets cached
            // (and an admin who joined the same run still gets it).
          }
        }
        try {
          const report = await cachedValue(
            "deep-analysis",
            { question: question || null },
            () => runDeepAnalysis(question || null, (p) => send({ type: "progress", ...p })),
            // A failed dossier, analyst or synthesis is reported, not frozen for the day.
            { fresh, cacheIf: (result) => result.erreurs.length === 0 },
          )
          send({
            type: "result",
            data: report.value,
            ...(report.status === "HIT" ? { cachedAt: report.cachedAt.toISOString() } : {}),
          })
        } catch (error) {
          console.error("[deep-analysis] failed:", error)
          send({ type: "error", error: error instanceof Error ? error.message : "Analyse impossible" })
        } finally {
          try {
            controller.close()
          } catch {
            // Already closed: the client went away.
          }
        }
      },
    })
    return new NextResponse(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    })
  })
}
