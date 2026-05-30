import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchTotalUserCount } from "@/lib/firestore-admin-queries"

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const count = await fetchTotalUserCount()
    return NextResponse.json({ count, generatedAt: new Date().toISOString(), sourceReadsEstimate: 1 })
  })
}
