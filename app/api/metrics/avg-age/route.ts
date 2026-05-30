import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchAvgAge } from "@/lib/firestore-admin-queries"

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const data = await fetchAvgAge()
    return NextResponse.json({ data, generatedAt: new Date().toISOString() })
  })
}
