import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchUsers } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  limit: z.string().transform(Number).default("50"),
  search: z.string().optional(),
  startAfter: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
  premium: z.enum(["true", "false"]).optional(),
  contacted: z.enum(["true", "false"]).optional(),
  churned: z.enum(["true"]).optional(),
  inactive: z.enum(["true"]).optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      limit: searchParams.get("limit") || "50",
      search: searchParams.get("search") || undefined,
      startAfter: searchParams.get("startAfter") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      platform: searchParams.get("platform") || undefined,
      premium: searchParams.get("premium") || undefined,
      contacted: searchParams.get("contacted") || undefined,
      churned: searchParams.get("churned") || undefined,
      inactive: searchParams.get("inactive") || undefined,
    })

    const result = await fetchUsers({
      limitCount: params.limit,
      search: params.search,
      startAfter: params.startAfter,
      from: params.from,
      to: params.to,
      platform: params.platform,
      premium: params.premium === undefined ? undefined : params.premium === "true",
      contacted: params.contacted === undefined ? undefined : params.contacted === "true",
      churned: params.churned === "true" || undefined,
      inactive: params.inactive === "true" || undefined,
    })

    return NextResponse.json({
      data: result.data,
      hasMore: result.hasMore,
      lastCreatedAt: result.lastCreatedAt,
      generatedAt: new Date().toISOString(),
    })
  })
}
