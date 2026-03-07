import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchConversations, fetchChatConversations } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.string().transform(Number).default("50"),
  mode: z.enum(["list", "analytics"]).default("list"),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      limit: searchParams.get("limit") || "50",
      mode: searchParams.get("mode") || "list",
    })

    if (params.mode === "analytics") {
      const result = await fetchChatConversations(
        params.from && params.to ? { from: params.from, to: params.to } : undefined,
      )
      return NextResponse.json({
        data: result.conversations,
        totalMessages: result.totalMessages,
        generatedAt: new Date().toISOString(),
      })
    }

    const result = await fetchConversations({
      from: params.from,
      to: params.to,
      limitCount: params.limit,
    })

    return NextResponse.json({
      data: result.data,
      hasMore: result.hasMore,
      generatedAt: new Date().toISOString(),
    })
  })
}
