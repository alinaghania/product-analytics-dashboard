import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchUserById, fetchTrackingEntries, fetchLastActivitiesForUsers } from "@/lib/firestore-admin-queries"

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return withAuth(request, async () => {
    const { userId } = await params

    const [user, lastActivities] = await Promise.all([
      fetchUserById(userId),
      fetchLastActivitiesForUsers([userId]),
    ])

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        user,
        lastActivity: lastActivities[userId] || null,
      },
      generatedAt: new Date().toISOString(),
    })
  })
}
