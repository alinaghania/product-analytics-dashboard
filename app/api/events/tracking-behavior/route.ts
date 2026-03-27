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

    const [startedResult, sectionSavedResult, completedResult] = await Promise.all([
      fetchAppEvents({ from: params.from, to: params.to, name: "tracking_session_started", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "tracking_section_saved", limitCount: 5000 }),
      fetchAppEvents({ from: params.from, to: params.to, name: "tracking_session_completed", limitCount: 5000 }),
    ])

    return NextResponse.json({
      started: startedResult.data,
      sectionSaved: sectionSavedResult.data,
      completed: completedResult.data,
      generatedAt: new Date().toISOString(),
    })
  })
}
