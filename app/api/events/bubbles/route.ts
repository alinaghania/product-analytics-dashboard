import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchBubbleEvents } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event: z.string().optional(),
  screen: z.string().optional(),
  limit: z.string().transform(Number).default("200"),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      event: searchParams.get("event") || undefined,
      screen: searchParams.get("screen") || undefined,
      limit: searchParams.get("limit") || "200",
    })

    const result = await fetchBubbleEvents({
      from: params.from,
      to: params.to,
      event: params.event,
      screen: params.screen,
      limitCount: params.limit,
    })

    return NextResponse.json({
      data: result.data,
      hasMore: result.hasMore,
      generatedAt: new Date().toISOString(),
    })
  })
}
