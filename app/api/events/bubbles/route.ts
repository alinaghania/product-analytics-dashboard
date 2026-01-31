import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event: z.string().optional(),
  screen: z.string().optional(),
  limit: z.string().transform(Number).default("50"),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      event: searchParams.get("event") || undefined,
      screen: searchParams.get("screen") || undefined,
      limit: searchParams.get("limit") || "50",
    })

    // TODO: Replace with actual Firebase Admin SDK queries
    // const { db } = getFirebaseAdmin()

    // Mock response
    const mockEvents = Array.from({ length: params.limit }, (_, i) => ({
      id: `be_${i + 1}`,
      userId: `user_${Math.floor(Math.random() * 100)}`,
      event: ["bubble_generated", "bubble_viewed", "endora_clicked"][Math.floor(Math.random() * 3)],
      screen: ["home", "tracking", "report", "profile"][Math.floor(Math.random() * 4)],
      viewDurationMs: Math.floor(2000 + Math.random() * 5000),
      platform: i % 2 === 0 ? "iOS" : "Android",
      appVersion: ["2.4.0", "2.3.5", "2.3.4"][Math.floor(Math.random() * 3)],
      createdAt: new Date(Date.now() - i * 60000).toISOString(),
    }))

    const mockMetrics = {
      totalEvents: 24680,
      uniqueBubbles: 1842,
      avgViewDuration: 4.2,
    }

    return NextResponse.json({
      data: mockEvents,
      metrics: mockMetrics,
      hasMore: true,
      generatedAt: new Date().toISOString(),
      sourceReadsEstimate: params.limit,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid parameters", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
