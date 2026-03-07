import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchTrackingMetrics, fetchTrackingEntries, fetchTrackingSessions } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["metrics", "entries", "sessions"]).default("metrics"),
  userId: z.string().optional(),
  limit: z.string().transform(Number).default("100"),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      mode: searchParams.get("mode") || "metrics",
      userId: searchParams.get("userId") || undefined,
      limit: searchParams.get("limit") || "100",
    })

    if (params.mode === "entries") {
      const result = await fetchTrackingEntries({
        from: params.from,
        to: params.to,
        userId: params.userId,
        limitCount: params.limit,
      })
      return NextResponse.json({ data: result.data, hasMore: result.hasMore, generatedAt: new Date().toISOString() })
    }

    if (params.mode === "sessions") {
      const result = await fetchTrackingSessions({
        from: params.from,
        to: params.to,
        limitCount: params.limit,
      })
      return NextResponse.json({ data: result.data, hasMore: result.hasMore, generatedAt: new Date().toISOString() })
    }

    // mode === "metrics"
    const data = await fetchTrackingMetrics({ from: params.from, to: params.to })
    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
