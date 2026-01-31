import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.string().transform(Number).default("50"),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const params = querySchema.parse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      limit: searchParams.get("limit") || "50",
    })

    // TODO: Replace with actual Firebase Admin SDK queries
    // const { db } = getFirebaseAdmin()

    // Mock response
    const mockConversations = Array.from({ length: Math.min(params.limit, 20) }, (_, i) => ({
      id: `conv_${i + 1}`,
      userId: `user_${Math.floor(Math.random() * 100)}`,
      messageCount: Math.floor(10 + Math.random() * 30),
      topics: ["nutrition", "digestion", "symptoms"].slice(0, Math.floor(Math.random() * 3) + 1),
      entryPoint: ["bubble_tap", "menu_button", "report_summary"][Math.floor(Math.random() * 3)],
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - i * 3600000 + 900000).toISOString(),
    }))

    const mockMetrics = {
      totalConversations: 1842,
      totalMessages: 24680,
      avgLatency: 1350,
      errorRate: 2.8,
      avgRetryCount: 0.4,
    }

    return NextResponse.json({
      data: mockConversations,
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
