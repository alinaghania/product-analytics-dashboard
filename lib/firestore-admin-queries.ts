import { getAdminDb } from "./firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { format as formatDate } from "date-fns"
import type {
  User,
  ChatConversation,
  ChatMessage,
  AppEvent,
  BubbleEvent,
  TrackingEntry,
  TrackingSession,
  LastActivity,
} from "./types"

// Helper to convert Firestore timestamp to Date
function toDate(timestamp: any): Date | undefined {
  if (!timestamp) return undefined
  if (timestamp.toDate) return timestamp.toDate()
  if (timestamp instanceof Date) return timestamp
  if (typeof timestamp === "string") return new Date(timestamp)
  if (typeof timestamp === "number") return new Date(timestamp)
  return undefined
}

// Helper to build date range constraints
function dateRangeTimestamps(from: string, to: string) {
  return {
    fromTs: Timestamp.fromDate(new Date(from + "T00:00:00")),
    toTs: Timestamp.fromDate(new Date(to + "T23:59:59")),
  }
}

function toDayKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

function getDaysDiff(from: string, to: string): number {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24))
}

function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00")
  date.setDate(date.getDate() + days)
  return toDayKey(date)
}

// ============= USERS =============

function mapUserDoc(id: string, data: FirebaseFirestore.DocumentData): User {
  return {
    id,
    email: data.email || "",
    username: data.username || data.registrationData?.username || "",
    displayName: data.displayName,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    birthDate: data.registrationData?.birthDate || data.birthDate,
    metadata: {
      lastLoginAt: toDate(data.metadata?.lastLoginAt),
      lastLoginDate: toDate(data.metadata?.lastLoginDate),
      platform: data.metadata?.platform,
      appVersion: data.metadata?.appVersion,
      accountCreatedDate: toDate(data.metadata?.accountCreatedDate),
    },
    flags: {
      onboardingCompleted: data.flags?.onboardingCompleted || false,
      registrationCompleted: data.flags?.registrationCompleted || false,
      registrationStep: data.flags?.registrationStep,
      profileCompletion: data.flags?.profileCompletion || 0,
    },
    subscriptionStatus: data.subscriptionStatus,
    registrationData: data.registrationData,
  }
}

export async function fetchUsers(options: {
  limitCount?: number
  search?: string
}): Promise<{ data: User[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 50

  let ref: FirebaseFirestore.Query = db.collection("users").orderBy("createdAt", "desc").limit(limitCount)
  const snapshot = await ref.get()

  let users: User[] = snapshot.docs.map((doc) => mapUserDoc(doc.id, doc.data()))

  if (options.search) {
    const searchLower = options.search.toLowerCase()
    users = users.filter(
      (u) => u.email?.toLowerCase().includes(searchLower) || u.username?.toLowerCase().includes(searchLower),
    )
  }

  const hasMore = snapshot.docs.length === limitCount
  return { data: users, hasMore }
}

export async function fetchUserById(userId: string): Promise<User | null> {
  const db = getAdminDb()
  const doc = await db.collection("users").doc(userId).get()
  if (!doc.exists) return null
  return mapUserDoc(doc.id, doc.data()!)
}

// ============= CONVERSATIONS =============

export async function fetchUserConversations(
  userId: string,
  options?: { limitCount?: number },
): Promise<{ data: ChatConversation[]; hasMore: boolean }> {
  if (!userId) return { data: [], hasMore: false }

  const db = getAdminDb()
  const limitCount = options?.limitCount || 50

  // Try ordering by updatedAt first, fallback to createdAt
  const sampleSnap = await db.collection("chat_conversations").where("userId", "==", userId).limit(1).get()
  const orderField = sampleSnap.docs[0]?.data().updatedAt ? "updatedAt" : "createdAt"

  const snapshot = await db
    .collection("chat_conversations")
    .where("userId", "==", userId)
    .orderBy(orderField, "desc")
    .limit(limitCount)
    .get()

  const conversations: ChatConversation[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAt = toDate(data.createdAt) || toDate(data.startedAt) || new Date()
    const updatedAt = toDate(data.updatedAt) || createdAt
    return {
      id: doc.id,
      userId: data.userId || "",
      messageCount: data.messageCount || 0,
      topics: data.topics || (data.topic ? [data.topic] : []),
      topic: data.topic,
      entryPoint: data.entryPoint,
      startedAt: toDate(data.startedAt),
      createdAt,
      updatedAt,
    }
  })

  return { data: conversations, hasMore: snapshot.docs.length === limitCount }
}

export async function fetchConversations(options: {
  from?: string
  to?: string
  limitCount?: number
}): Promise<{ data: ChatConversation[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 50

  let ref: FirebaseFirestore.Query = db.collection("chat_conversations").orderBy("createdAt", "desc").limit(limitCount)

  if (options.from && options.to) {
    const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)
    ref = db
      .collection("chat_conversations")
      .where("createdAt", ">=", fromTs)
      .where("createdAt", "<=", toTs)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
  }

  const snapshot = await ref.get()

  const conversations: ChatConversation[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      messageCount: data.messageCount || 0,
      topics: data.topics || [],
      entryPoint: data.entryPoint,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    }
  })

  return { data: conversations, hasMore: snapshot.docs.length === limitCount }
}

export async function fetchConversationMessages(
  conversationId: string,
  options?: { limitCount?: number },
): Promise<{ data: ChatMessage[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options?.limitCount || 100

  const ref = db
    .collection("chat_conversations")
    .doc(conversationId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(limitCount)

  let snapshot = await ref.get()
  if (snapshot.empty) {
    // Fallback: try without ordering
    snapshot = await db.collection("chat_conversations").doc(conversationId).collection("messages").limit(limitCount).get()
  }

  const mapped = snapshot.docs.map((doc, index) => {
    const data = doc.data()
    const toDateLoose = (value: unknown) => {
      const converted = toDate(value)
      if (converted) return converted
      return typeof value === "number" ? new Date(value) : undefined
    }
    const timestamp =
      toDateLoose(data.createdAt) || toDateLoose(data.timestamp) || toDateLoose(data.sentAt) || toDateLoose(data.time)

    const rawRole = String(data.role ?? data.sender ?? data.type ?? data.author ?? data.from ?? "").toLowerCase()
    let role: ChatMessage["role"] = "assistant"
    if (["user", "client", "human"].includes(rawRole)) role = "user"
    else if (["assistant", "bot", "ai", "endora"].includes(rawRole))
      role = rawRole === "endora" ? "endora" : "assistant"
    else if (rawRole === "system") role = "system"

    const extractText = (value: unknown): string => {
      if (typeof value === "string") return value
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            if (typeof item === "string") return item
            if (item && typeof item === "object") {
              const candidate =
                (item as any).text ?? (item as any).content ?? (item as any).message
              return typeof candidate === "string" ? candidate : ""
            }
            return ""
          })
          .filter(Boolean)
          .join("\\n")
      }
      if (value && typeof value === "object") {
        const candidate = (value as any).text ?? (value as any).content ?? (value as any).message
        return typeof candidate === "string" ? candidate : ""
      }
      return value ? String(value) : ""
    }

    const content =
      extractText(data.text) || extractText(data.content) || extractText(data.message) || extractText(data.body) || ""

    return {
      message: {
        id: doc.id,
        conversationId,
        role,
        content,
        createdAt: timestamp || new Date(0),
        createdAtMissing: !timestamp,
        agent: data.agent,
        status: data.status,
        latencyMs: data.latencyMs,
        errorMessage: data.errorMessage,
        retryCount: data.retryCount,
      } as ChatMessage,
      timestamp,
      index,
    }
  })

  const messages = mapped
    .sort((a, b) => {
      if (a.timestamp && b.timestamp) return a.timestamp.getTime() - b.timestamp.getTime()
      if (a.timestamp && !b.timestamp) return -1
      if (!a.timestamp && b.timestamp) return 1
      return a.index - b.index
    })
    .map((item) => item.message)

  return { data: messages, hasMore: snapshot.docs.length === limitCount }
}

export async function checkUserHasChats(userId: string): Promise<boolean> {
  if (!userId) return false
  const db = getAdminDb()
  const snapshot = await db.collection("chat_conversations").where("userId", "==", userId).limit(1).get()
  return !snapshot.empty
}

export async function fetchUserChatSessions(userId: string): Promise<ChatConversation[]> {
  if (!userId) return []
  const db = getAdminDb()
  const snapshot = await db.collection("chat_conversations").where("userId", "==", userId).get()

  const sessionsWithSort = snapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAtValue = toDate(data.createdAt) || toDate(data.startedAt) || toDate(data.lastMessageAt)
    const updatedAtValue = toDate(data.updatedAt)
    const lastMessageAt = toDate(data.lastMessageAt)
    const createdAt = createdAtValue || new Date(0)
    const updatedAt = updatedAtValue || createdAt
    const lastMessageSnippet =
      typeof data.lastMessageSnippet === "string"
        ? data.lastMessageSnippet
        : typeof data.lastMessagePreview === "string"
          ? data.lastMessagePreview
          : typeof data.lastMessage?.text === "string"
            ? data.lastMessage.text
            : typeof data.lastMessage?.content === "string"
              ? data.lastMessage.content
              : typeof data.lastMessage?.message === "string"
                ? data.lastMessage.message
                : undefined

    const session: ChatConversation = {
      id: doc.id,
      userId: data.userId || "",
      messageCount: data.messageCount || 0,
      topics: data.topics || (data.topic ? [data.topic] : []),
      topic: data.topic,
      entryPoint: data.entryPoint,
      startedAt: toDate(data.startedAt),
      createdAt,
      updatedAt,
      lastMessageAt,
      lastMessageSnippet,
    }
    const sortDate = updatedAtValue || createdAtValue || lastMessageAt
    return { session, sortDate }
  })

  return sessionsWithSort
    .sort((a, b) => {
      if (a.sortDate && b.sortDate) return b.sortDate.getTime() - a.sortDate.getTime()
      if (a.sortDate) return -1
      if (b.sortDate) return 1
      return b.session.id.localeCompare(a.session.id)
    })
    .map((item) => item.session)
}

export async function fetchChatSessionMessages(conversationId: string): Promise<ChatMessage[]> {
  const result = await fetchConversationMessages(conversationId, { limitCount: 500 })
  return result.data
}

// ============= APP EVENTS =============

export async function fetchAppEvents(options: {
  from: string
  to: string
  name?: string
  platform?: string
  version?: string
  limitCount?: number
}): Promise<{ data: AppEvent[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 1000
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  let ref: FirebaseFirestore.Query = db
    .collection("app_events")
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<=", toTs)

  if (options.name) ref = ref.where("name", "==", options.name)
  if (options.platform) ref = ref.where("platform", "==", options.platform)

  ref = ref.orderBy("createdAt", "desc").limit(limitCount)
  const snapshot = await ref.get()

  const events: AppEvent[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      name: data.name || "",
      params: data.params,
      screen: data.screen,
      platform: data.platform,
      appVersion: data.appVersion,
      createdAt: toDate(data.createdAt) || new Date(),
    }
  })

  return { data: events, hasMore: snapshot.docs.length === limitCount }
}

// ============= BUBBLE EVENTS =============

export async function fetchBubbleEvents(options: {
  from: string
  to: string
  event?: string
  screen?: string
  limitCount?: number
}): Promise<{ data: BubbleEvent[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 1000
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  let ref: FirebaseFirestore.Query = db
    .collection("bubble_events")
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<=", toTs)

  if (options.event) ref = ref.where("event", "==", options.event)
  if (options.screen) ref = ref.where("screen", "==", options.screen)

  ref = ref.orderBy("createdAt", "desc").limit(limitCount)
  const snapshot = await ref.get()

  const events: BubbleEvent[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      event: data.event || "",
      screen: data.screen,
      viewDurationMs: data.viewDurationMs,
      platform: data.platform,
      appVersion: data.appVersion,
      createdAt: toDate(data.createdAt) || new Date(),
    }
  })

  return { data: events, hasMore: snapshot.docs.length === limitCount }
}

// ============= TRACKING =============

export async function fetchTrackingEntries(options: {
  from: string
  to: string
  userId?: string
  limitCount?: number
}): Promise<{ data: TrackingEntry[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 100

  const ref = db.collection("tracking").orderBy("createdAt", "desc").limit(limitCount)
  const snapshot = await ref.get()

  const entries: TrackingEntry[] = snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const createdAt = toDate(data.createdAt) || new Date()
      const docDate = createdAt.toISOString().split("T")[0]

      if (docDate < options.from || docDate > options.to) return null
      if (options.userId && data.userId !== options.userId) return null

      return {
        id: doc.id,
        date: doc.id.split("_")[1] || docDate,
        userId: data.userId || doc.id.split("_")[0] || "",
        completeness: data.completeness || 0,
        entryMethod: data.entryMethod || "manual",
        sleep: data.sleep,
        meals: data.meals,
        sport: data.sport,
        digestive: data.digestive,
        period: data.period,
        symptoms: data.symptoms || [],
        createdAt,
        updatedAt: toDate(data.updatedAt) || createdAt,
      }
    })
    .filter(Boolean) as TrackingEntry[]

  return { data: entries, hasMore: snapshot.docs.length === limitCount }
}

export async function fetchTrackingSessions(options: {
  from: string
  to: string
  limitCount?: number
}): Promise<{ data: TrackingSession[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 100
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  const ref = db
    .collection("tracking_sessions")
    .where("startedAt", ">=", fromTs)
    .where("startedAt", "<=", toTs)
    .orderBy("startedAt", "desc")
    .limit(limitCount)

  const snapshot = await ref.get()

  const sessions: TrackingSession[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      startedAt: toDate(data.startedAt) || new Date(),
      completedAt: toDate(data.completedAt),
      durationMs: data.durationMs || 0,
      sections: data.sections || [],
      entryPoint: data.entryPoint,
      hasExistingRecord: data.hasExistingRecord || false,
    }
  })

  return { data: sessions, hasMore: snapshot.docs.length === limitCount }
}

// ============= ANALYTICS QUERIES =============

export async function fetchSessionsForActivity(from: string, to: string) {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(from, to)

  const snapshot = await db
    .collection("tracking_sessions")
    .where("startedAt", ">=", fromTs)
    .where("startedAt", "<=", toTs)
    .orderBy("startedAt", "asc")
    .limit(5000)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      userId: data.userId || "",
      startedAt: toDate(data.startedAt) || new Date(),
      durationMs: data.durationMs || 0,
      platform: data.platform,
      appVersion: data.appVersion,
    }
  })
}

export async function fetchTrackingMetrics(dateRange: { from: string; to: string }) {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(dateRange.from, dateRange.to)

  const snapshot = await db
    .collection("tracking")
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<=", toTs)
    .orderBy("createdAt", "desc")
    .limit(1000)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      date: toDate(data.date) || new Date(),
      createdAt: toDate(data.createdAt) || new Date(),
      completeness: data.completeness || 0,
      entryMethod: data.entryMethod || "manual",
      symptoms: data.symptoms || [],
      sleep: data.sleep,
      digestive: data.digestive,
      sport: data.sport,
      contraception: data.contraception,
    }
  })
}

export async function fetchOverviewMetrics(dateRange: { from: string; to: string }) {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(dateRange.from, dateRange.to)

  const [usersSnapshot, sessionsSnapshot, eventsSnapshot, bubbleEventsSnapshot] = await Promise.all([
    db.collection("users").get(),
    db
      .collection("tracking_sessions")
      .where("startedAt", ">=", fromTs)
      .where("startedAt", "<=", toTs)
      .get(),
    db
      .collection("app_events")
      .where("createdAt", ">=", fromTs)
      .where("createdAt", "<=", toTs)
      .get(),
    db
      .collection("bubble_events")
      .where("createdAt", ">=", fromTs)
      .where("createdAt", "<=", toTs)
      .get(),
  ])

  const users = usersSnapshot.docs.map((doc) => ({
    id: doc.id,
    createdAt: toDate(doc.data().createdAt) || new Date(),
    ...doc.data(),
  }))

  const sessions = sessionsSnapshot.docs.map((doc) => ({
    id: doc.id,
    userId: doc.data().userId,
    startedAt: toDate(doc.data().startedAt) || new Date(),
    platform: doc.data().platform,
    appVersion: doc.data().appVersion,
  }))

  const events = eventsSnapshot.docs.map((doc) => ({
    id: doc.id,
    name: doc.data().name,
    userId: doc.data().userId,
  }))

  const bubbleEvents = bubbleEventsSnapshot.docs.map((doc) => ({
    id: doc.id,
    event: doc.data().event,
    userId: doc.data().userId,
  }))

  const uniqueActiveUserIds = new Set(sessions.map((s) => s.userId))
  const dau = uniqueActiveUserIds.size

  const newUsers = users.filter((u) => {
    const created = new Date(u.createdAt)
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to)
    return created >= from && created <= to
  }).length

  const returningUsers = users.filter((u) => {
    const created = new Date(u.createdAt)
    const from = new Date(dateRange.from)
    const hasSession = sessions.some((s) => s.userId === u.id)
    return created < from && hasSession
  }).length

  return {
    dau,
    totalUsers: users.length,
    newUsers,
    returningUsers,
    totalSessions: sessions.length,
    sessions,
    events,
    bubbleEvents,
    users,
  }
}

export async function fetchChatConversations(dateRange?: { from?: string; to?: string }) {
  const db = getAdminDb()

  // Detect which field to use for ordering
  const sampleSnapshot = await db.collection("chat_conversations").limit(1).get()
  const orderField = sampleSnapshot.docs[0]?.data().startedAt ? "startedAt" : "createdAt"

  const snapshot = await db.collection("chat_conversations").orderBy(orderField, "desc").limit(1000).get()

  const conversations = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      topic: data.topic || "",
      entryPoint: data.entryPoint || "",
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      messageCount: data.messageCount || 0,
      topics: data.topics || [],
    }
  })

  const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0)
  return { conversations, totalMessages }
}

export async function calculateRetentionCurve(
  cohortStart: string,
  cohortEnd: string,
): Promise<{
  curve: { day: number; retentionPct: number }[]
  cohortSize: number
  periodStart: string
  periodEnd: string
  error?: string
}> {
  const db = getAdminDb()
  const cohortDays = getDaysDiff(cohortStart, cohortEnd)

  if (cohortDays > 30) {
    return {
      curve: [],
      cohortSize: 0,
      periodStart: cohortStart,
      periodEnd: cohortEnd,
      error: "Narrow date range to compute retention (max 30 days)",
    }
  }

  const usersSnapshot = await db
    .collection("users")
    .where("createdAt", ">=", Timestamp.fromDate(new Date(cohortStart + "T00:00:00")))
    .where("createdAt", "<=", Timestamp.fromDate(new Date(cohortEnd + "T23:59:59")))
    .get()

  const cohortUsers = usersSnapshot.docs.map((doc) => {
    const createdAt = doc.data().createdAt?.toDate?.() || new Date()
    return { id: doc.id, signupDay: toDayKey(createdAt) }
  })

  const cohortSize = cohortUsers.length

  if (cohortSize > 2000) {
    return {
      curve: [],
      cohortSize,
      periodStart: cohortStart,
      periodEnd: cohortEnd,
      error: "Narrow date range to compute retention (max 2000 users)",
    }
  }

  if (cohortSize === 0) {
    return { curve: [], cohortSize: 0, periodStart: cohortStart, periodEnd: cohortEnd }
  }

  const today = new Date()
  const maxSessionDate = new Date(cohortEnd)
  maxSessionDate.setDate(maxSessionDate.getDate() + 30)
  const sessionEndDate = maxSessionDate < today ? maxSessionDate : today

  const sessionsSnapshot = await db
    .collection("tracking_sessions")
    .where("startedAt", ">=", Timestamp.fromDate(new Date(cohortStart + "T00:00:00")))
    .where("startedAt", "<=", Timestamp.fromDate(sessionEndDate))
    .orderBy("startedAt", "asc")
    .get()

  const activeDaysByUser = new Map<string, Set<string>>()
  sessionsSnapshot.docs.forEach((doc) => {
    const data = doc.data()
    const userId = data.userId
    const sessionDate = data.startedAt?.toDate?.()
    if (userId && sessionDate) {
      const dayKey = toDayKey(sessionDate)
      if (!activeDaysByUser.has(userId)) activeDaysByUser.set(userId, new Set())
      activeDaysByUser.get(userId)!.add(dayKey)
    }
  })

  const curve: { day: number; retentionPct: number }[] = []
  const todayKey = toDayKey(today)

  for (let d = 0; d <= 30; d++) {
    let retainedCount = 0
    let usersWithDataAvailable = 0

    for (const user of cohortUsers) {
      const targetDay = addDaysToDateString(user.signupDay, d)
      if (targetDay > todayKey) continue
      usersWithDataAvailable++
      const activeDays = activeDaysByUser.get(user.id)
      if (activeDays && activeDays.has(targetDay)) retainedCount++
    }

    if (usersWithDataAvailable > 0) {
      const retentionPct = (retainedCount / cohortSize) * 100
      curve.push({ day: d, retentionPct: Math.round(retentionPct * 10) / 10 })
    }
  }

  return { curve, cohortSize, periodStart: cohortStart, periodEnd: cohortEnd }
}

export async function fetchPhotos(options: { from?: string; to?: string }) {
  const db = getAdminDb()
  let ref: FirebaseFirestore.Query = db.collection("photos").orderBy("timestamp", "asc")

  if (options.from && options.to) {
    const fromTs = Timestamp.fromDate(new Date(options.from + "T00:00:00"))
    const toTs = Timestamp.fromDate(new Date(options.to + "T23:59:59"))
    ref = db
      .collection("photos")
      .where("timestamp", ">=", fromTs)
      .where("timestamp", "<=", toTs)
      .orderBy("timestamp", "asc")
  }

  const snapshot = await ref.get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId,
      timestamp: data.timestamp?.toDate?.() || new Date(),
      time: data.time,
      pain: data.pain,
      bloated: data.bloated,
    }
  })
}

export async function fetchLastLoginsForUsers(userIds: string[]): Promise<Record<string, Date | null>> {
  if (userIds.length === 0) return {}

  const db = getAdminDb()
  const lastLogins: Record<string, Date | null> = {}

  const snapshot = await db.collection("tracking_sessions").orderBy("startedAt", "desc").limit(1000).get()

  const userSessionMap: Record<string, Date> = {}
  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const userId = data.userId
    const startedAt = toDate(data.startedAt)
    if (userId && userIds.includes(userId) && startedAt && !userSessionMap[userId]) {
      userSessionMap[userId] = startedAt
    }
  })

  userIds.forEach((userId) => {
    lastLogins[userId] = userSessionMap[userId] || null
  })

  return lastLogins
}

export async function fetchLastActivitiesForUsers(userIds: string[]): Promise<Record<string, LastActivity | null>> {
  if (userIds.length === 0) return {}

  const db = getAdminDb()
  const result: Record<string, LastActivity | null> = {}
  userIds.forEach((userId) => {
    result[userId] = null
  })

  const [trackingDocs, photosDocs, chatDocs, eventsDocs, bubbleDocs] = await Promise.all([
    db.collection("tracking").orderBy("updatedAt", "desc").limit(200).get().catch(() => ({ docs: [] as any[] })),
    db.collection("photos").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] as any[] })),
    db
      .collection("chat_conversations")
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get()
      .catch(() => ({ docs: [] as any[] })),
    db.collection("app_events").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] as any[] })),
    db.collection("bubble_events").orderBy("createdAt", "desc").limit(200).get().catch(() => ({ docs: [] as any[] })),
  ])

  trackingDocs.docs.forEach((doc: any) => {
    const data = doc.data()
    const userId = data.userId
    if (!userId || !userIds.includes(userId)) return
    const timestamp = toDate(data.updatedAt || data.createdAt)
    if (!timestamp) return
    if (!result[userId] || timestamp > result[userId]!.timestamp) {
      result[userId] = { timestamp, type: "tracking", description: "Tracked symptoms" }
    }
  })

  photosDocs.docs.forEach((doc: any) => {
    const data = doc.data()
    const userId = data.userId
    if (!userId || !userIds.includes(userId)) return
    const timestamp = toDate(data.createdAt)
    if (!timestamp) return
    if (!result[userId] || timestamp > result[userId]!.timestamp) {
      result[userId] = { timestamp, type: "photo", description: "Uploaded a photo" }
    }
  })

  for (const convDoc of chatDocs.docs as any[]) {
    const convData = convDoc.data()
    const userId = convData.userId
    if (!userId || !userIds.includes(userId)) continue
    try {
      const messagesSnapshot = await db
        .collection("chat_conversations")
        .doc(convDoc.id)
        .collection("messages")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get()

      const userMessages = messagesSnapshot.docs.filter((msgDoc: any) => {
        const msgData = msgDoc.data()
        return msgData.role === "user" || msgData.isUser === true
      })

      if (userMessages.length > 0) {
        const latestMessage = userMessages[0].data()
        const timestamp = toDate(latestMessage.createdAt)
        if (timestamp && (!result[userId] || timestamp > result[userId]!.timestamp)) {
          result[userId] = { timestamp, type: "chat", description: "Sent a message" }
        }
      }
    } catch {
      // Skip on error
    }
  }

  eventsDocs.docs.forEach((doc: any) => {
    const data = doc.data()
    const userId = data.userId
    if (!userId || !userIds.includes(userId)) return
    const timestamp = toDate(data.createdAt)
    if (!timestamp) return
    if (!result[userId] || timestamp > result[userId]!.timestamp) {
      result[userId] = { timestamp, type: "event", description: data.eventName || "App interaction" }
    }
  })

  bubbleDocs.docs.forEach((doc: any) => {
    const data = doc.data()
    const userId = data.userId
    if (!userId || !userIds.includes(userId)) return
    const timestamp = toDate(data.createdAt)
    if (!timestamp) return
    if (!result[userId] || timestamp > result[userId]!.timestamp) {
      result[userId] = { timestamp, type: "bubble", description: data.eventType || "Bubble interaction" }
    }
  })

  return result
}

export async function fetchUserDailySessionTimes(
  userIds: string[],
): Promise<Record<string, { avgDailyTimeMinutes: number; totalSessions: number }>> {
  if (userIds.length === 0) return {}

  const db = getAdminDb()
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const snapshot = await db
    .collection("tracking_sessions")
    .where("startedAt", ">=", ninetyDaysAgo)
    .orderBy("startedAt", "desc")
    .limit(10000)
    .get()

  const userDailyTimes: Record<string, Record<string, number>> = {}
  const userSessionCounts: Record<string, number> = {}

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const userId = data.userId
    if (!userIds.includes(userId)) return

    const startedAt = toDate(data.startedAt)
    if (!startedAt) return

    const day = formatDate(startedAt, "yyyy-MM-dd")
    const durationMs = data.durationMs || 0

    if (!userDailyTimes[userId]) userDailyTimes[userId] = {}
    userDailyTimes[userId][day] = (userDailyTimes[userId][day] || 0) + durationMs
    userSessionCounts[userId] = (userSessionCounts[userId] || 0) + 1
  })

  const result: Record<string, { avgDailyTimeMinutes: number; totalSessions: number }> = {}
  for (const userId of userIds) {
    const dailyTimes = userDailyTimes[userId]
    if (!dailyTimes) {
      result[userId] = { avgDailyTimeMinutes: 0, totalSessions: 0 }
      continue
    }
    const days = Object.keys(dailyTimes)
    const totalTimeMs = Object.values(dailyTimes).reduce((sum, time) => sum + time, 0)
    const avgDailyTimeMs = days.length > 0 ? totalTimeMs / days.length : 0

    result[userId] = {
      avgDailyTimeMinutes: Math.round(avgDailyTimeMs / (1000 * 60)),
      totalSessions: userSessionCounts[userId] || 0,
    }
  }

  return result
}

export async function fetchRoutines(from: string, to: string) {
  const db = getAdminDb()
  const fromDate = new Date(from + "T00:00:00")
  const toDateObj = new Date(to + "T23:59:59")

  const snapshot = await db.collection("routines").orderBy("createdAt", "desc").limit(1000).get()

  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const createdAt = toDate(data.createdAt) || new Date()
      return {
        id: doc.id,
        userId: data.userId || "",
        createdAt,
        type: data.type || "unknown",
        usageCount: data.usageCount || 0,
        lastUsed: data.lastUsed ? toDate(data.lastUsed) : undefined,
      }
    })
    .filter((r) => r.createdAt >= fromDate && r.createdAt <= toDateObj)
}
