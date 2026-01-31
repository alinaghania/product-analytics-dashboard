import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await params

    // TODO: Replace with actual Firebase Admin SDK query
    // const { db } = getFirebaseAdmin()
    // const messagesRef = db.collection('chat_conversations').doc(conversationId).collection('messages')

    // Mock response
    const mockConversation = {
      id: conversationId,
      userId: "user_1",
      messageCount: 8,
      topics: ["nutrition", "digestion"],
      entryPoint: "bubble_tap",
      createdAt: new Date("2024-12-20T14:30:00").toISOString(),
      updatedAt: new Date("2024-12-20T14:45:00").toISOString(),
    }

    const mockMessages = [
      {
        id: "msg_1",
        conversationId,
        role: "user",
        content: "I've been feeling bloated after meals lately. What could be causing this?",
        createdAt: new Date("2024-12-20T14:30:00").toISOString(),
      },
      {
        id: "msg_2",
        conversationId,
        role: "assistant",
        agent: "endora-main",
        content:
          "Based on your tracking data, I notice you've been experiencing bloating mainly after dinner. This could be related to eating too quickly, certain food combinations, or specific trigger foods.",
        latencyMs: 1250,
        status: "success",
        createdAt: new Date("2024-12-20T14:30:05").toISOString(),
      },
      {
        id: "msg_3",
        conversationId,
        role: "user",
        content: "Yes, it's mostly after dinner. I usually eat quickly because I'm tired.",
        createdAt: new Date("2024-12-20T14:31:00").toISOString(),
      },
      {
        id: "msg_4",
        conversationId,
        role: "assistant",
        agent: "endora-main",
        content:
          "Eating quickly can definitely contribute to bloating. I'd recommend taking 20+ minutes for dinner and putting your fork down between bites.",
        latencyMs: 980,
        status: "success",
        createdAt: new Date("2024-12-20T14:31:08").toISOString(),
      },
    ]

    return NextResponse.json({
      conversation: mockConversation,
      messages: mockMessages,
      generatedAt: new Date().toISOString(),
      sourceReadsEstimate: mockMessages.length + 1,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
