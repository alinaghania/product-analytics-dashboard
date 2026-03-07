import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import { fetchConversationMessages } from "@/lib/firestore-admin-queries"
import { getAdminDb } from "@/lib/firebase-admin"

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  return withAuth(request, async () => {
    const { conversationId } = await params

    const db = getAdminDb()
    const convDoc = await db.collection("chat_conversations").doc(conversationId).get()

    let conversation = null
    if (convDoc.exists) {
      const data = convDoc.data()!
      const toDate = (ts: any) => ts?.toDate?.() || (ts ? new Date(ts) : undefined)
      conversation = {
        id: convDoc.id,
        userId: data.userId || "",
        messageCount: data.messageCount || 0,
        topics: data.topics || [],
        entryPoint: data.entryPoint,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
      }
    }

    const { data: messages } = await fetchConversationMessages(conversationId, { limitCount: 100 })

    return NextResponse.json({
      conversation,
      messages,
      generatedAt: new Date().toISOString(),
    })
  })
}
