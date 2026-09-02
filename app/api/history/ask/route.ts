import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api-utils"
import { serializeTimestamps } from "@/lib/firestore-admin-queries"
import {
  addAskHistory,
  fetchAskHistory,
  isDashboardDbUnavailable,
} from "@/lib/firestore-dashboard-queries"

const citationSchema = z.object({
  conversationId: z.string().default(""),
  messageId: z.string().default(""),
  userId: z.string().default(""),
  snippet: z.string().default(""),
  reason: z.string().default(""),
})

const metaSchema = z.object({
  conversationsAnalyzed: z.number(),
  onboardingExcluded: z.number(),
  truncated: z.boolean(),
  hallucinationsFiltered: z.number(),
})

const postSchema = z.object({
  question: z.string().trim().min(1, "La question est vide.").max(2000),
  answer: z.string().max(20000).default(""),
  citations: z.array(citationSchema).max(100).default([]),
  meta: metaSchema,
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const data = await fetchAskHistory()
      return NextResponse.json({ data: serializeTimestamps(data), error: null })
    } catch (error) {
      // Dashboard DB not set up yet — the history panel shows a setup hint.
      if (!isDashboardDbUnavailable(error)) throw error
      console.error("[API] ask history unavailable:", error)
      return NextResponse.json({ data: [], error: "dashboard database unavailable" })
    }
  })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (auth) => {
    const body = postSchema.parse(await request.json())
    // createdBy is always the authenticated admin — never taken from the body.
    const entry = await addAskHistory(body, auth.email)
    return NextResponse.json({ data: serializeTimestamps(entry) }, { status: 201 })
  })
}
