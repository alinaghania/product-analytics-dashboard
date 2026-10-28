import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchActiveSubscriptionsByPlan, RevenueCatConfigError } from "@/lib/revenuecat"

export const dynamic = "force-dynamic"

// Today's active subscriptions split monthly / annual (Overview KPIs).
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      return NextResponse.json(await fetchActiveSubscriptionsByPlan())
    } catch (error) {
      if (error instanceof RevenueCatConfigError) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }
      throw error
    }
  })
}
