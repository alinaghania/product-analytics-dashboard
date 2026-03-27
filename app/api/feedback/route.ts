import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchAppEvents } from "@/lib/firestore-admin-queries"

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

    const [positiveResult, negativeResult] = await Promise.all([
      fetchAppEvents({ from: params.from, to: params.to, name: "user_feedback_positive", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "user_feedback_negative", limitCount: 5000 }),
    ])

    return NextResponse.json({
      positive: positiveResult.data,
      negative: negativeResult.data,
      generatedAt: new Date().toISOString(),
    })
  })
}
