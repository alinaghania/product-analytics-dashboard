import type { NextRequest } from "next/server"
import { z } from "zod"
import { parisDayRange } from "@/lib/analytics"
import { withAuth } from "@/lib/api-utils"
import { fetchOnboardingEvents, fetchOnboardingSessions } from "@/lib/firestore-admin-queries"
import { onboardingDatasetBuilder } from "@/lib/onboarding-journal/digest"
import type { OnboardingDataset } from "@/lib/onboarding-journal/types"
import { cachedJson } from "@/lib/server-cache"
import type { DateRange } from "@/lib/types"

const DAY = /^\d{4}-\d{2}-\d{2}$/
// Every journey of the range is read with its ~120 events: a wider range is a typo, not a need.
const MAX_RANGE_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

const querySchema = z.object({ from: z.string().regex(DAY), to: z.string().regex(DAY) }).refine(
  ({ from, to }) => {
    // Also rejects days that do not exist ("2026-02-30"): their bounds are NaN.
    const { fromMs, toMs } = parisDayRange(from, to)
    return fromMs <= toMs && toMs - fromMs < MAX_RANGE_DAYS * DAY_MS
  },
  { message: `"from" and "to" must be real days, in order, at most ${MAX_RANGE_DAYS} days apart` },
)

// Journeys digested at a time: their events come from 8 queries in flight, one
// per client of the scan pool, and are dropped once reduced — about 30 000 raw
// events in memory, however long the range.
const SESSIONS_PER_BATCH = 240

async function buildDataset(range: DateRange): Promise<OnboardingDataset> {
  const sessions = await fetchOnboardingSessions(parisDayRange(range.from, range.to))
  const builder = onboardingDatasetBuilder(range)
  for (let i = 0; i < sessions.length; i += SESSIONS_PER_BATCH) {
    const batch = sessions.slice(i, i + SESSIONS_PER_BATCH)
    builder.add(batch, await fetchOnboardingEvents(batch.map((session) => session.id)))
  }
  return builder.build()
}

// The onboarding journeys started between two Europe/Paris days, one digest per
// journey: the Onboarding page filters and aggregates them in the browser.
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({ from: searchParams.get("from"), to: searchParams.get("to") })

    return cachedJson(request, "onboarding-journal", params, async () => ({ data: await buildDataset(params) }))
  })
}
