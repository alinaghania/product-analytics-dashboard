import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchUsers } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  limit: z.string().transform(Number).default("50"),
  search: z.string().optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      limit: searchParams.get("limit") || "50",
      search: searchParams.get("search") || undefined,
    })

    const result = await fetchUsers({
      limitCount: params.limit,
      search: params.search,
    })

    return NextResponse.json({
      data: result.data,
      hasMore: result.hasMore,
      generatedAt: new Date().toISOString(),
    })
  })
}
