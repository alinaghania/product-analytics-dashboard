import type { NextRequest } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
import { fetchOnboardingAnalytics } from "@/lib/firestore-admin-queries"

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return cachedJson(request, "onboarding", null, async () => ({
      data: await fetchOnboardingAnalytics(),
      generatedAt: new Date().toISOString(),
    }))
  })
}
