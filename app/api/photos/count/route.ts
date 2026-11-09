import type { NextRequest } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
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

    return cachedJson(request, "photos-count", params, async () => {
      const count = await fetchPhotoCount({
        from: params.from,
        to: params.to,
        time: params.time,
        bloated: params.bloated === undefined ? undefined : params.bloated === "true",
      })
      return { count, generatedAt: new Date().toISOString(), sourceReadsEstimate: 1 }
    })
  })
}
