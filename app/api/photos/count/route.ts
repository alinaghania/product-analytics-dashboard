import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchPhotoCount } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.enum(["morning", "evening"]).optional(),
  bloated: z.enum(["true", "false"]).optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      time: searchParams.get("time") || undefined,
      bloated: searchParams.get("bloated") || undefined,
    })

    const count = await fetchPhotoCount({
      from: params.from,
      to: params.to,
      time: params.time,
      bloated: params.bloated === undefined ? undefined : params.bloated === "true",
    })

    return NextResponse.json({ count, generatedAt: new Date().toISOString(), sourceReadsEstimate: 1 })
  })
}
