import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchAppEvents } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().optional(),
  platform: z.string().optional(),
  version: z.string().optional(),
  limit: z.string().transform(Number).default("200"),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      name: searchParams.get("name") || undefined,
      platform: searchParams.get("platform") || undefined,
      version: searchParams.get("version") || undefined,
      limit: searchParams.get("limit") || "200",
    })

    const result = await fetchAppEvents({
      from: params.from,
      to: params.to,
      name: params.name,
      platform: params.platform,
      version: params.version,
      limitCount: params.limit,
    })

    return NextResponse.json({
      data: result.data,
      hasMore: result.hasMore,
      generatedAt: new Date().toISOString(),
    })
  })
}
