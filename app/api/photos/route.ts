import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchPhotos } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    })

    const data = await fetchPhotos({ from: params.from, to: params.to })

    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
