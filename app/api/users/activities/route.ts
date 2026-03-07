import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchLastActivitiesForUsers, fetchLastLoginsForUsers } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  userIds: z.string(),
  mode: z.enum(["activities", "logins"]).default("activities"),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      userIds: searchParams.get("userIds"),
      mode: searchParams.get("mode") || "activities",
    })

    const userIds = params.userIds.split(",").filter(Boolean)

    if (params.mode === "logins") {
      const data = await fetchLastLoginsForUsers(userIds)
      return NextResponse.json({ data, generatedAt: new Date().toISOString() })
    }

    const data = await fetchLastActivitiesForUsers(userIds)
    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
