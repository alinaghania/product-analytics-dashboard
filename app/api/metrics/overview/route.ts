import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    })

    // TODO: Replace with actual Firebase Admin SDK queries
    // This is a placeholder implementation
    // const { db } = getFirebaseAdmin()
    // const usersRef = db.collection('users')
    // const eventsRef = db.collection('app_events')

    // For now, return mock data
    const mockData = {
      dau: 1247,
      wau: 4832,
      mau: 12456,
      newUsers: 342,
      returningUsers: 905,
      retention: { d1: 68.5, d7: 42.3, d30: 28.7 },
      sessions: { count: 8934, avgDurationMs: 245000 },
      onboardingCompleted: 78.4,
      registrationCompleted: 92.1,
      topEvents: [
        { name: "open_tracking", count: 5420 },
        { name: "save_tracking", count: 4180 },
        { name: "view_report", count: 3250 },
        { name: "start_chat", count: 2840 },
        { name: "add_photo", count: 1920 },
      ],
      dailyActiveUsers: Array.from({ length: 30 }, (_, i) => ({
        date: `Day ${i + 1}`,
        count: Math.floor(800 + Math.random() * 600),
      })),
      platformShare: [
        { platform: "iOS", count: 7245 },
        { platform: "Android", count: 5211 },
      ],
      appVersionShare: [
        { version: "2.4.0", count: 5420 },
        { version: "2.3.5", count: 4120 },
        { version: "2.3.4", count: 2916 },
      ],
    }

    return NextResponse.json({
      data: mockData,
      generatedAt: new Date().toISOString(),
      sourceReadsEstimate: 0, // Will be actual count when using Firebase
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid parameters", details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
