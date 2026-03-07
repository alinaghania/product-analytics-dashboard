import { NextResponse } from "next/server"
import { verifyAuth, AuthError } from "./firebase-admin"
import { z } from "zod"

export async function withAuth(
  request: Request,
  handler: (auth: { uid: string; email: string }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const auth = await verifyAuth(request)
    return await handler(auth)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid parameters", details: error.errors }, { status: 400 })
    }
    console.error("[API] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
