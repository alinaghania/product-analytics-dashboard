import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { calculateRetentionCurve } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  cohortStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cohortEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      cohortStart: searchParams.get("cohortStart"),
      cohortEnd: searchParams.get("cohortEnd"),
    })

    const data = await calculateRetentionCurve(params.cohortStart, params.cohortEnd)

    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
