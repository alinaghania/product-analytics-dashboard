import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(Number).default("50"),
  search: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      cursor: searchParams.get("cursor") || undefined,
      limit: searchParams.get("limit") || "50",
      search: searchParams.get("search") || undefined,
    })

    // TODO: Replace with actual Firebase Admin SDK queries
    // const { db } = getFirebaseAdmin()
    // let query = db.collection('users').orderBy('createdAt', 'desc').limit(params.limit)
    // if (params.cursor) query = query.startAfter(params.cursor)
    // if (params.search) query = query.where('email', '>=', params.search)

    // Mock response
    const mockUsers = Array.from({ length: params.limit }, (_, i) => ({
      id: `user_${i + 1}`,
      email: `user${i + 1}@example.com`,
      username: `user_${i + 1}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        lastLoginAt: new Date(Date.now() - i * 3600000).toISOString(),
        platform: i % 2 === 0 ? "iOS" : "Android",
        appVersion: i % 3 === 0 ? "2.4.0" : "2.3.5",
      },
      flags: {
        onboardingCompleted: i % 4 !== 0,
        registrationCompleted: true,
        profileCompletion: 50 + Math.floor(Math.random() * 50),
      },
    }))

    return NextResponse.json({
      data: mockUsers,
      cursor: `cursor_${params.limit}`,
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
