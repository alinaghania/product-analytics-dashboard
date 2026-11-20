import type { NextRequest } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { cachedJson } from "@/lib/server-cache"
import { fetchChatFeedbackStats } from "@/lib/firestore-admin-queries"

// 👍/👎 left on the assistant's chat answers (Ask Conversations page).
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return cachedJson(request, "chat-feedback", null, async () => ({
      data: await fetchChatFeedbackStats(),
      generatedAt: new Date().toISOString(),
    }))
  })
}
