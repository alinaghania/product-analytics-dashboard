import type { NextRequest } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
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

    return cachedJson(request, "events-meal-ai", params, async () => {
      const [started, completed] = await Promise.all([
        fetchAppEvents({ from: params.from, to: params.to, name: "meal_ai_analysis_started", limitCount: 5000 }),
        fetchAppEvents({ from: params.from, to: params.to, name: "meal_ai_analysis_completed", limitCount: 5000 }),
      ])
      return { started: started.data, completed: completed.data, generatedAt: new Date().toISOString() }
    })
  })
}
