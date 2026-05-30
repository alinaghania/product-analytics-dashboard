import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchGa4ActivityMetrics } from "@/lib/google-analytics"

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const data = await fetchGa4ActivityMetrics()
      return NextResponse.json({ data, source: "ga4", generatedAt: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[ga4-activity] failed:", message)
      // 503 (not 500) so the client knows GA4 is unavailable rather than the
      // route itself being broken — it can then fall back to the legacy
      // tracking_sessions-based metrics.
      return NextResponse.json({ error: message, source: "ga4" }, { status: 503 })
    }
  })
}
