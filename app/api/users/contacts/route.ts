import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { serializeTimestamps } from "@/lib/firestore-admin-queries"
import {
  fetchContactSummariesForUsers,
  isDashboardDbUnavailable,
} from "@/lib/firestore-dashboard-queries"

const querySchema = z.object({
  userIds: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .refine((arr) => arr.length > 0 && arr.length <= 100, {
      message: "userIds must contain between 1 and 100 ids",
    }),
})

// Batch contact summaries for the users list "Contacté" column.
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const params = querySchema.parse({
      userIds: request.nextUrl.searchParams.get("userIds") || "",
    })

    try {
      const data = await fetchContactSummariesForUsers(params.userIds)
      return NextResponse.json({
        data: serializeTimestamps(data),
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      // Dashboard DB missing or IAM not set up yet — degrade to an empty map
      // so the users list still renders (column shows "—").
      if (!isDashboardDbUnavailable(error)) throw error
      console.error("[API] contacts summaries unavailable:", error)
      return NextResponse.json({
        data: {},
        warning: "dashboard database unavailable",
        generatedAt: new Date().toISOString(),
      })
    }
  })
}
