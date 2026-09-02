import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { serializeTimestamps } from "@/lib/firestore-admin-queries"
import {
  addCampaignHistory,
  fetchCampaignHistory,
  isDashboardDbUnavailable,
} from "@/lib/firestore-dashboard-queries"

const inputsSchema = z.object({
  views: z.number(),
  costMode: z.enum(["cpm", "fixed"]),
  cpm: z.number(),
  fixedPrice: z.number(),
  viewToInstallPct: z.number(),
  installToPaidPct: z.number(),
  arpu: z.number(),
})

const resultsSchema = z.object({
  cost: z.number(),
  revenue: z.number(),
  profit: z.number(),
  roas: z.number().nullable(),
})

const postSchema = z.object({
  influencerName: z.string().trim().max(200).default(""),
  platform: z.string().trim().max(50).default(""),
  inputs: inputsSchema,
  results: resultsSchema,
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const data = await fetchCampaignHistory()
      return NextResponse.json({ data: serializeTimestamps(data), error: null })
    } catch (error) {
      // Dashboard DB not set up yet — the history panel shows a setup hint.
      if (!isDashboardDbUnavailable(error)) throw error
      console.error("[API] campaign history unavailable:", error)
      return NextResponse.json({ data: [], error: "dashboard database unavailable" })
    }
  })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (auth) => {
    const body = postSchema.parse(await request.json())
    // createdBy is always the authenticated admin — never taken from the body.
    const entry = await addCampaignHistory(body, auth.email)
    return NextResponse.json({ data: serializeTimestamps(entry) }, { status: 201 })
  })
}
