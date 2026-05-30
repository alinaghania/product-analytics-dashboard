import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchGa4DailyActivity } from "@/lib/google-analytics"

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

    try {
      const data = await fetchGa4DailyActivity(params)
      return NextResponse.json({ data, source: "ga4", generatedAt: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[ga4-daily] failed:", message)
      return NextResponse.json({ error: message, source: "ga4" }, { status: 503 })
    }
  })
}
