import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"

// Admin check for the client: 200 if the caller passes verifyAuth(), 401/403 otherwise.
// Keeps the admin allowlist server-side instead of shipping it in the bundle.
export async function GET(request: NextRequest) {
  return withAuth(request, async ({ email }) => NextResponse.json({ email }))
}
