import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import { withAuth } from "@/lib/api-utils"
import { fetchRevenueCatMetrics, RevenueCatConfigError } from "@/lib/revenuecat"

const querySchema = z.object({
  // Calendar month to analyze; defaults to the previous full month.
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const params = querySchema.parse({
      month: request.nextUrl.searchParams.get("month") || undefined,
    })

    // Everything stays in server-local time: the explicit month is parsed as
    // local midnight (no "Z") so startOfMonth/endOfMonth/format agree with it,
    // and "previous month" is anchored on Europe/Paris like the rest of the app.
    const monthStart = params.month
      ? new Date(`${params.month}-01T00:00:00`)
      : startOfMonth(subMonths(toZonedTime(new Date(), "Europe/Paris"), 1))

    try {
      const result = await fetchRevenueCatMetrics(
        format(startOfMonth(monthStart), "yyyy-MM-dd"),
        format(endOfMonth(monthStart), "yyyy-MM-dd"),
      )
      return NextResponse.json(result)
    } catch (error) {
      if (error instanceof RevenueCatConfigError) {
        return NextResponse.json({ error: error.message }, { status: 502 })
      }
      throw error
    }
  })
}
