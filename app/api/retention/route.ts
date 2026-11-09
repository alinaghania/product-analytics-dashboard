import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { toDayKey } from "@/lib/analytics"
import { withAuth } from "@/lib/api-utils"
import { calculateRetentionCurve, retentionWindowEnd } from "@/lib/firestore-admin-queries"
import { cachedJson } from "@/lib/server-cache"

// The activity scan reads app_events over up to ~3 months (100k+ docs) — needs
// more than Vercel's default function timeout. maxDuration is Vercel-only; on
// Cloud Run the limit is the service timeout (infra/terraform/cloud-run.tf).
export const maxDuration = 60

const querySchema = z.object({
  cohortStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cohortEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxWeeks: z.coerce.number().refine((v) => [4, 8, 12].includes(v)).optional().default(8),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      cohortStart: searchParams.get("cohortStart"),
      cohortEnd: searchParams.get("cohortEnd"),
      maxWeeks: searchParams.get("maxWeeks") ?? undefined,
    })

    const compute = async () => ({
      data: await calculateRetentionCurve(params.cohortStart, params.cohortEnd, params.maxWeeks),
      generatedAt: new Date().toISOString(),
    })

    // Overview data stays live, except this curve once every day it measures
    // is over: it can't change before midnight, when the cache entry expires.
    // The Overview's default cohort always ends that window yesterday.
    if (retentionWindowEnd(params.cohortEnd, params.maxWeeks) >= toDayKey(new Date())) {
      return NextResponse.json(await compute())
    }
    return cachedJson(request, "retention", params, compute)
  })
}
