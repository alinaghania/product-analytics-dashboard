import { type NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-utils"
import {
  fetchUserById,
  fetchUserRawDoc,
  fetchUserTrackingEntries,
  fetchUserTrackingSessions,
  fetchUserChatSessions,
  fetchUserPhotos,
  fetchUserAppEvents,
  fetchUserBubbleEvents,
  fetchUserRoutines,
  fetchUserFoodTrials,
  serializeTimestamps,
} from "@/lib/firestore-admin-queries"

type Section<T> = { data: T; error: string | null }

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<Section<T>> {
  try {
    const data = await fn()
    return { data, error: null }
  } catch (err) {
    return {
      data: fallback,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// Some per-user queries already return `{ data, error }`. Normalize them so the
// route always exposes the same `{ data, error }` shape per section.
async function wrapSection<T>(
  promise: Promise<{ data: T; error: string | null }>,
  fallback: T,
): Promise<Section<T>> {
  try {
    return await promise
  } catch (err) {
    return {
      data: fallback,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return withAuth(request, async () => {
    const { userId } = await params

    const user = await fetchUserById(userId)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const [
      rawDoc,
      trackingEntries,
      trackingSessions,
      conversations,
      photos,
      appEvents,
      bubbleEvents,
      routines,
      foodTrials,
    ] = await Promise.all([
      safeQuery(() => fetchUserRawDoc(userId), null as Record<string, unknown> | null),
      wrapSection(fetchUserTrackingEntries(userId, { limitCount: 200 }), []),
      wrapSection(fetchUserTrackingSessions(userId, 100), []),
      safeQuery(() => fetchUserChatSessions(userId), [] as Awaited<ReturnType<typeof fetchUserChatSessions>>),
      wrapSection(fetchUserPhotos(userId, 200), []),
      wrapSection(fetchUserAppEvents(userId, 200), []),
      wrapSection(fetchUserBubbleEvents(userId, 200), []),
      wrapSection(fetchUserRoutines(userId, 100), []),
      wrapSection(fetchUserFoodTrials(userId, 200), []),
    ])

    // Derive lastActivity from already-fetched per-user sections — avoids a
    // separate 1000-doc scan + N+1 message lookup via fetchLastActivitiesForUsers.
    type ActivityCandidate = { timestamp: Date; type: string; description: string } | null
    const pickLatest = (
      list: Array<{ createdAt?: any; updatedAt?: any; startedAt?: any; timestamp?: any }>,
      type: string,
      description: string,
    ): ActivityCandidate => {
      let best: Date | null = null
      for (const row of list) {
        const ts = row.updatedAt || row.createdAt || row.startedAt || row.timestamp
        if (ts instanceof Date && (!best || ts > best)) best = ts
      }
      return best ? { timestamp: best, type, description } : null
    }
    const candidates: ActivityCandidate[] = [
      pickLatest(trackingEntries.data as any, "tracking", "Tracked symptoms"),
      pickLatest(trackingSessions.data as any, "session", "Tracking session"),
      pickLatest(photos.data as any, "photo", "Uploaded a photo"),
      pickLatest(appEvents.data as any, "event", "App interaction"),
      pickLatest(bubbleEvents.data as any, "bubble", "Bubble interaction"),
      pickLatest(conversations.data as any, "chat", "Chat conversation"),
    ]
    const lastActivity = candidates
      .filter((c): c is { timestamp: Date; type: string; description: string } => c !== null)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0] || null

    const sourceReadsEstimate =
      (Array.isArray(trackingEntries.data) ? trackingEntries.data.length : 0) +
      (Array.isArray(trackingSessions.data) ? trackingSessions.data.length : 0) +
      (Array.isArray(conversations.data) ? conversations.data.length : 0) +
      (Array.isArray(photos.data) ? photos.data.length : 0) +
      (Array.isArray(appEvents.data) ? appEvents.data.length : 0) +
      (Array.isArray(bubbleEvents.data) ? bubbleEvents.data.length : 0) +
      (Array.isArray(routines.data) ? routines.data.length : 0) +
      (Array.isArray(foodTrials.data) ? foodTrials.data.length : 0) +
      1

    const payload = {
      data: {
        user,
        raw: {
          userDoc: rawDoc.data,
        },
        sections: {
          trackingEntries,
          trackingSessions,
          conversations,
          photos,
          appEvents,
          bubbleEvents,
          routines,
          foodTrials,
          lastActivity: { data: lastActivity, error: null },
        },
      },
      generatedAt: new Date().toISOString(),
      sourceReadsEstimate,
    }

    return NextResponse.json(serializeTimestamps(payload))
  })
}
