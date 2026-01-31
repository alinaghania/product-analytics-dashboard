import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params

    // TODO: Replace with actual Firebase Admin SDK query
    // const { db } = getFirebaseAdmin()
    // const userDoc = await db.collection('users').doc(userId).get()

    // Mock response
    const mockUser = {
      id: userId,
      email: "alice@example.com",
      username: "alice_wonder",
      createdAt: new Date("2024-01-15").toISOString(),
      updatedAt: new Date("2024-12-20").toISOString(),
      metadata: {
        lastLoginAt: new Date("2024-12-20").toISOString(),
        platform: "iOS",
        appVersion: "2.4.0",
      },
      flags: {
        onboardingCompleted: true,
        registrationCompleted: true,
        profileCompletion: 85,
      },
      registrationData: {
        dietaryPreferences: ["vegetarian", "gluten-free"],
        healthGoals: ["improve_digestion", "reduce_bloating"],
      },
    }

    return NextResponse.json({
      data: mockUser,
      generatedAt: new Date().toISOString(),
      sourceReadsEstimate: 1,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
