import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().optional(),
  platform: z.string().optional(),
  version: z.string().optional(),
  limit: z.string().transform(Number).default("50"),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      name: searchParams.get("name") || undefined,
      platform: searchParams.get("platform") || undefined,
      version: searchParams.get("version") || undefined,
      limit: searchParams.get("limit") || "50",
    })

    // TODO: Replace with actual Firebase Admin SDK queries
    // const { db } = getFirebaseAdmin()

    // Mock response
    const mockEvents = Array.from({ length: params.limit }, (_, i) => ({
      id: `ae_${i + 1}`,
      userId: `user_${Math.floor(Math.random() * 100)}`,
      name: ["open_tracking", "save_tracking", "view_report", "start_chat", "add_photo"][Math.floor(Math.random() * 5)],
      screen: ["home", "tracking", "report", "profile"][Math.floor(Math.random() * 4)],
      platform: i % 2 === 0 ? "iOS" : "Android",
      appVersion: ["2.4.0", "2.3.5", "2.3.4"][Math.floor(Math.random() * 3)],
      createdAt: new Date(Date.now() - i * 60000).toISOString(),
    }))

    const mockMetrics = {
      totalEvents: 48520,
      uniqueUsers: 8240,
      avgEventsPerUser: 5.9,
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
