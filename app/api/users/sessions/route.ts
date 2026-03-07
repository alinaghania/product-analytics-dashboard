import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { fetchUserDailySessionTimes } from "@/lib/firestore-admin-queries"

const querySchema = z.object({
  userIds: z.string(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      userIds: searchParams.get("userIds"),
    })

    const userIds = params.userIds.split(",").filter(Boolean)
    const data = await fetchUserDailySessionTimes(userIds)

    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
