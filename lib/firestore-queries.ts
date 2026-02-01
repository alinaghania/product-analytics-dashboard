"use client"

import {
  getFirebaseDb,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  toDate,
  type DocumentData,
} from "./firebase"
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
import { format as formatDate } from "date-fns"

// Helper to build date range query constraints
function dateRangeConstraints(field: string, from: string, to: string) {
  const fromDate = Timestamp.fromDate(new Date(from + "T00:00:00"))
  const toTimestamp = Timestamp.fromDate(new Date(to + "T23:59:59"))
  return [where(field, ">=", fromDate), where(field, "<=", toTimestamp)]
}

function toTimestampValue(value: Date | string) {
  if (value instanceof Date) return Timestamp.fromDate(value)
  return Timestamp.fromDate(new Date(value))
}

// Helper to extract date key from Date object
function toDayKey(date: Date): string {
  return date.toISOString().split("T")[0]
}

// Helper to calculate the difference in days between two dates
function getDaysDiff(from: string, to: string): number {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const timeDiff = toDate.getTime() - fromDate.getTime()
  return Math.floor(timeDiff / (1000 * 3600 * 24))
}

function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00")
  date.setDate(date.getDate() + days)
  return toDayKey(date)
}

// ============= USERS =============

export async function fetchUsers(options: {
  limitCount?: number
  cursor?: DocumentData | null
  search?: string
}): Promise<{ data: User[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  console.log("[v0] fetchUsers called with options:", options)

  const db = getFirebaseDb()
  console.log("[v0] Got Firestore DB instance:", !!db)

  const usersRef = collection(db, "users")

  const constraints = [orderBy("createdAt", "desc"), limit(options.limitCount || 50)]

  if (options.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(usersRef, ...constraints)

  console.log("[v0] Executing users query...")
  const snapshot = await getDocs(q)
  console.log("[v0] Users query returned:", snapshot.docs.length, "documents")

  const users: User[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      email: data.email || "",
      username: data.username || data.registrationData?.username || "",
      displayName: data.displayName, // Added displayName
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      birthDate: data.registrationData?.birthDate || data.birthDate,
      metadata: {
        lastLoginAt: toDate(data.metadata?.lastLoginAt),
        lastLoginDate: toDate(data.metadata?.lastLoginDate), // Added lastLoginDate fallback
        platform: data.metadata?.platform,
        appVersion: data.metadata?.appVersion,
        accountCreatedDate: toDate(data.metadata?.accountCreatedDate), // Added account created date
      },
      flags: {
        onboardingCompleted: data.flags?.onboardingCompleted || false,
        registrationCompleted: data.flags?.registrationCompleted || false,
        registrationStep: data.flags?.registrationStep,
        profileCompletion: data.flags?.profileCompletion || 0,
      },
      subscriptionStatus: data.subscriptionStatus, // Added subscription status
      registrationData: data.registrationData,
    }
  })

  // Filter by search if provided (client-side for flexibility)
  let filteredUsers = users
  if (options.search) {
    const searchLower = options.search.toLowerCase()
    filteredUsers = users.filter(
      (u) => u.email?.toLowerCase().includes(searchLower) || u.username?.toLowerCase().includes(searchLower),
    )
  }

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options.limitCount || 50)

  return { data: filteredUsers, lastDoc, hasMore }
}

export async function fetchUserById(userId: string): Promise<User | null> {
  const db = getFirebaseDb()
  const userDoc = await getDoc(doc(db, "users", userId))

  if (!userDoc.exists()) return null

  const data = userDoc.data()
  return {
    id: userDoc.id,
    email: data.email || "",
    username: data.username || data.registrationData?.username || "",
    displayName: data.displayName, // Added displayName
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    birthDate: data.registrationData?.birthDate || data.birthDate,
    metadata: {
      lastLoginAt: toDate(data.metadata?.lastLoginAt),
      lastLoginDate: toDate(data.metadata?.lastLoginDate), // Added lastLoginDate fallback
      platform: data.metadata?.platform,
      appVersion: data.metadata?.appVersion,
      accountCreatedDate: toDate(data.metadata?.accountCreatedDate), // Added account created date
    },
    flags: {
      onboardingCompleted: data.flags?.onboardingCompleted || false,
      registrationCompleted: data.flags?.registrationCompleted || false,
      registrationStep: data.flags?.registrationStep,
      profileCompletion: data.flags?.profileCompletion || 0,
    },
    subscriptionStatus: data.subscriptionStatus, // Added subscription status
    registrationData: data.registrationData,
  }
}

// ============= CONVERSATIONS =============

export async function fetchUserConversations(
  userId: string,
  options?: { limitCount?: number; cursor?: DocumentData | null },
): Promise<{ data: ChatConversation[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  const db = getFirebaseDb()
  const chatsRef = collection(db, "chat_conversations")

  if (!userId) {
    return { data: [], lastDoc: null, hasMore: false }
  }

  const baseConstraints = [where("userId", "==", userId)]
  const sampleQuery = query(chatsRef, ...baseConstraints, limit(1))
  const sampleSnapshot = await getDocs(sampleQuery)
  const orderField = sampleSnapshot.docs[0]?.data().updatedAt ? "updatedAt" : "createdAt"

  const constraints: ReturnType<typeof where | typeof orderBy | typeof limit | typeof startAfter>[] = [
    ...baseConstraints,
    orderBy(orderField, "desc"),
    limit(options?.limitCount || 50),
  ]

  if (options?.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(chatsRef, ...constraints)
  const snapshot = await getDocs(q)

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

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options?.limitCount || 50)

  return { data: conversations, lastDoc, hasMore }
}

export async function fetchConversations(options: {
  from?: string
  to?: string
  limitCount?: number
  cursor?: DocumentData | null
}): Promise<{ data: ChatConversation[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  const db = getFirebaseDb()
  const chatsRef = collection(db, "chat_conversations")

  const constraints: ReturnType<typeof where | typeof orderBy | typeof limit>[] = [
    orderBy("createdAt", "desc"),
    limit(options.limitCount || 50),
  ]

  if (options.from && options.to) {
    constraints.unshift(...dateRangeConstraints("createdAt", options.from, options.to))
  }

  if (options.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(chatsRef, ...constraints)
  const snapshot = await getDocs(q)

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

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options.limitCount || 50)

  return { data: conversations, lastDoc, hasMore }
}

export async function fetchConversationMessages(
  conversationId: string,
  options?: {
    startDate?: Date | string
    endDate?: Date | string
    limitCount?: number
    cursor?: DocumentData | null
    order?: "asc" | "desc"
  },
): Promise<{ data: ChatMessage[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  // Filtering uses createdAt range; pagination uses startAfter(cursor) with limitCount.
  const db = getFirebaseDb()
  const messagesRef = collection(db, "chat_conversations", conversationId, "messages")

  const constraints: ReturnType<typeof where | typeof orderBy | typeof limit | typeof startAfter>[] = []

  if (options?.startDate) {
    constraints.push(where("createdAt", ">=", toTimestampValue(options.startDate)))
  }

  if (options?.endDate) {
    constraints.push(where("createdAt", "<=", toTimestampValue(options.endDate)))
  }

  const orderDirection = options?.order || "asc"
  constraints.push(orderBy("createdAt", orderDirection))
  constraints.push(limit(options?.limitCount || 100))

  if (options?.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(messagesRef, ...constraints)
  const snapshot = await getDocs(q)

  const messages: ChatMessage[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAt =
      toDate(data.createdAt) ||
      toDate(data.timestamp) ||
      toDate(data.sentAt)

    const rawRole = typeof data.role === "string" ? data.role.toLowerCase() : ""
    const role: ChatMessage["role"] =
      rawRole === "user" || rawRole === "assistant" || rawRole === "system" || rawRole === "endora"
        ? (rawRole as ChatMessage["role"])
        : "user"

    const content = typeof data.content === "string" ? data.content : data.content ? String(data.content) : ""

    return {
      id: doc.id,
      conversationId,
      role,
      content,
      createdAt: createdAt || new Date(),
      createdAtMissing: !createdAt,
      agent: data.agent,
      status: data.status,
      latencyMs: data.latencyMs,
      errorMessage: data.errorMessage,
      retryCount: data.retryCount,
    }
  })

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options?.limitCount || 100)

  return { data: messages, lastDoc, hasMore }
}

export async function checkUserHasChats(userId: string): Promise<boolean> {
  if (!userId) return false
  const db = getFirebaseDb()
  const chatsRef = collection(db, "chat_conversations")
  const q = query(chatsRef, where("userId", "==", userId), limit(1))
  const snapshot = await getDocs(q)
  return !snapshot.empty
}

export async function fetchUserChatSessions(userId: string): Promise<ChatConversation[]> {
  if (!userId) return []
  const db = getFirebaseDb()
  const chatsRef = collection(db, "chat_conversations")
  const q = query(chatsRef, where("userId", "==", userId))
  const snapshot = await getDocs(q)

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
  if (!conversationId) return []
  const db = getFirebaseDb()
  const messagesRef = collection(db, "chat_conversations", conversationId, "messages")
  const orderedQuery = query(messagesRef, orderBy("createdAt", "asc"))
  let snapshot = await getDocs(orderedQuery)
  if (snapshot.empty) {
    snapshot = await getDocs(messagesRef)
  }

  const mapped = snapshot.docs.map((doc, index) => {
    const data = doc.data()
    const toDateLoose = (value: unknown) => {
      const converted = toDate(value as Timestamp | Date | string | undefined | null)
      if (converted) return converted
      return typeof value === "number" ? new Date(value) : undefined
    }
    const timestamp =
      toDateLoose(data.createdAt) ||
      toDateLoose(data.timestamp) ||
      toDateLoose(data.sentAt) ||
      toDateLoose(data.time)

    const rawRole = String(data.role ?? data.sender ?? data.type ?? data.author ?? data.from ?? "").toLowerCase()
    let role: ChatMessage["role"] = "assistant"
    if (["user", "client", "human"].includes(rawRole)) role = "user"
    else if (["assistant", "bot", "ai", "endora"].includes(rawRole)) role = rawRole === "endora" ? "endora" : "assistant"
    else if (rawRole === "system") role = "system"

    const extractText = (value: unknown): string => {
      if (typeof value === "string") return value
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            if (typeof item === "string") return item
            if (item && typeof item === "object") {
              const candidate =
                (item as { text?: unknown }).text ??
                (item as { content?: unknown }).content ??
                (item as { message?: unknown }).message
              return typeof candidate === "string" ? candidate : ""
            }
            return ""
          })
          .filter(Boolean)
          .join("\\n")
      }
      if (value && typeof value === "object") {
        const candidate =
          (value as { text?: unknown }).text ??
          (value as { content?: unknown }).content ??
          (value as { message?: unknown }).message
        return typeof candidate === "string" ? candidate : ""
      }
      return value ? String(value) : ""
    }

    const content =
      extractText(data.text) ||
      extractText(data.content) ||
      extractText(data.message) ||
      extractText(data.body) ||
      ""

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
      },
      timestamp,
      index,
    }
  })

  return mapped
    .sort((a, b) => {
      if (a.timestamp && b.timestamp) return a.timestamp.getTime() - b.timestamp.getTime()
      if (a.timestamp && !b.timestamp) return -1
      if (!a.timestamp && b.timestamp) return 1
      return a.index - b.index
    })
    .map((item) => item.message)
}

// ============= APP EVENTS =============

export async function fetchAppEvents(options: {
  from: string
  to: string
  name?: string
  platform?: string
  version?: string
  limitCount?: number
  cursor?: DocumentData | null
}): Promise<{ data: AppEvent[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  console.log("[v0] 🎯 fetchAppEvents called")
  console.log("[v0] Date range:", options)

  try {
    const db = getFirebaseDb()
    console.log("[v0] Firestore DB instance:", !!db)

    const eventsRef = collection(db, "app_events")

    const constraints: ReturnType<typeof where | typeof orderBy | typeof limit>[] = [
      ...dateRangeConstraints("createdAt", options.from, options.to),
      orderBy("createdAt", "desc"),
      limit(options.limitCount || 1000),
    ]

    if (options.name) {
      constraints.unshift(where("name", "==", options.name))
    }
    if (options.platform) {
      constraints.unshift(where("platform", "==", options.platform))
    }

    if (options.cursor) {
      constraints.push(startAfter(options.cursor))
    }

    const q = query(eventsRef, ...constraints)
    const snapshot = await getDocs(q)

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

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
    const hasMore = snapshot.docs.length === (options.limitCount || 1000)

    console.log("[v0] Event names found:", [...new Set(events.map((e) => e.name))].join(", "))
    console.log("[v0] ✅ fetchAppEvents completed, returning", events.length, "events")

    return { data: events, lastDoc, hasMore }
  } catch (error: any) {
    console.error("[v0] ❌ fetchAppEvents ERROR:", error.message)
    throw error
  }
}

// ============= BUBBLE EVENTS =============

export async function fetchBubbleEvents(options: {
  from: string
  to: string
  event?: string
  screen?: string
  limitCount?: number
  cursor?: DocumentData | null
}): Promise<{ data: BubbleEvent[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  console.log("[v0] 🫧 fetchBubbleEvents called")
  console.log("[v0] Date range:", options)

  try {
    const db = getFirebaseDb()
    console.log("[v0] Firestore DB instance:", !!db)

    const eventsRef = collection(db, "bubble_events")

    const constraints: ReturnType<typeof where | typeof orderBy | typeof limit>[] = [
      ...dateRangeConstraints("createdAt", options.from, options.to),
      orderBy("createdAt", "desc"),
      limit(options.limitCount || 1000),
    ]

    if (options.event) {
      constraints.unshift(where("event", "==", options.event))
    }
    if (options.screen) {
      constraints.unshift(where("screen", "==", options.screen))
    }

    if (options.cursor) {
      constraints.push(startAfter(options.cursor))
    }

    const q = query(eventsRef, ...constraints)
    const snapshot = await getDocs(q)

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

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
    const hasMore = snapshot.docs.length === (options.limitCount || 1000)

    console.log("[v0] Event types found:", [...new Set(events.map((e) => e.event))].join(", "))
    console.log("[v0] ✅ fetchBubbleEvents completed, returning", events.length, "events")

    return { data: events, lastDoc, hasMore }
  } catch (error: any) {
    console.error("[v0] ❌ fetchBubbleEvents ERROR:", error.message)
    throw error
  }
}

// ============= TRACKING =============

export async function fetchTrackingEntries(options: {
  from: string
  to: string
  userId?: string
  limitCount?: number
  cursor?: DocumentData | null
}): Promise<{ data: TrackingEntry[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  const db = getFirebaseDb()
  const trackingRef = collection(db, "tracking")

  // tracking docId = userId_date, so we query by createdAt or filter by docId pattern
  const constraints: ReturnType<typeof where | typeof orderBy | typeof limit>[] = [
    orderBy("createdAt", "desc"),
    limit(options.limitCount || 100),
  ]

  if (options.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(trackingRef, ...constraints)
  const snapshot = await getDocs(q)

  const entries: TrackingEntry[] = snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const createdAt = toDate(data.createdAt) || new Date()

      // Filter by date range client-side since docId contains date
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

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options.limitCount || 100)

  return { data: entries, lastDoc, hasMore }
}

export async function fetchTrackingSessions(options: {
  from: string
  to: string
  limitCount?: number
  cursor?: DocumentData | null
}): Promise<{ data: TrackingSession[]; lastDoc: DocumentData | null; hasMore: boolean }> {
  const db = getFirebaseDb()
  const sessionsRef = collection(db, "tracking_sessions")

  const constraints: ReturnType<typeof where | typeof orderBy | typeof limit>[] = [
    ...dateRangeConstraints("startedAt", options.from, options.to),
    orderBy("startedAt", "desc"),
    limit(options.limitCount || 100),
  ]

  if (options.cursor) {
    constraints.push(startAfter(options.cursor))
  }

  const q = query(sessionsRef, ...constraints)
  const snapshot = await getDocs(q)

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

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  const hasMore = snapshot.docs.length === (options.limitCount || 100)

  return { data: sessions, lastDoc, hasMore }
}

// ============= ANALYTICS QUERIES =============

// A1: Fetch tracking sessions for DAU/Sessions analysis
export async function fetchSessionsForActivity(from: string, to: string) {
  console.log("[v0] 🔄 fetchSessionsForActivity CALLED - from:", from, "to:", to)
  const db = getFirebaseDb()
  const sessionsRef = collection(db, "tracking_sessions")

  const q = query(sessionsRef, ...dateRangeConstraints("startedAt", from, to), orderBy("startedAt", "asc"), limit(5000))

  const snapshot = await getDocs(q)
  console.log("[v0] ✅ fetchSessionsForActivity COMPLETED -", snapshot.docs.length, "sessions")
  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      userId: data.userId || "",
      startedAt: toDate(data.startedAt) || new Date(),
      platform: data.platform,
      appVersion: data.appVersion,
    }
  })
}

// A6: Fetch users + sessions for retention calculation
export async function fetchRetentionData(cohortStart: string, cohortEnd: string, toDate: string) {
  const db = getFirebaseDb()

  // Fetch users in cohort
  const usersRef = collection(db, "users")
  const usersQuery = query(usersRef, ...dateRangeConstraints("createdAt", cohortStart, cohortEnd), limit(5000))
  const usersSnapshot = await getDocs(usersQuery)
  const users = usersSnapshot.docs.map((doc) => ({
    id: doc.id,
    createdAt: toDate(doc.data().createdAt) || new Date(),
  }))

  // Fetch all sessions from cohort start to toDate
  const sessionsRef = collection(db, "tracking_sessions")
  const sessionsQuery = query(
    sessionsRef,
    where("startedAt", ">=", Timestamp.fromDate(new Date(cohortStart + "T00:00:00"))),
    where("startedAt", "<=", Timestamp.fromDate(new Date(toDate + "T23:59:59"))),
    limit(10000),
  )
  const sessionsSnapshot = await getDocs(sessionsQuery)
  const sessions = sessionsSnapshot.docs.map((doc) => ({
    userId: doc.data().userId || "",
    startedAt: toDate(doc.data().startedAt) || new Date(),
  }))

  return { users, sessions }
}

// B1: Fetch tracking entries for meals analysis
export async function fetchTrackingForMeals(from: string, to: string) {
  const db = getFirebaseDb()
  const trackingRef = collection(db, "tracking")

  const q = query(trackingRef, orderBy("createdAt", "desc"), limit(1000))
  const snapshot = await getDocs(q)

  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const createdAt = toDate(data.createdAt) || new Date()
      const docDate = toDayKey(createdAt)

      // Filter by date range
      if (docDate < from || docDate > to) return null

      return {
        date: docDate,
        meals: data.meals || {},
        waterIntake: data.waterIntake || 0,
        completeness: data.completeness || 0,
        entryMethod: data.entryMethod || "manual",
      }
    })
    .filter(Boolean)
}

// B5: Fetch photos for endobelly tracking
export async function fetchPhotos(options: { from?: string; to?: string }): Promise<any[]> {
  console.log("[v0] 📷 fetchPhotos called")
  console.log("[v0] Date range:", options)

  const db = getFirebaseDb()
  const photosRef = collection(db, "photos")

  try {
    const constraints: ReturnType<typeof where | typeof orderBy>[] = [orderBy("timestamp", "asc")]

    if (options.from && options.to) {
      const fromTimestamp = Timestamp.fromDate(new Date(options.from + "T00:00:00"))
      const toTimestamp = Timestamp.fromDate(new Date(options.to + "T23:59:59"))
      constraints.unshift(where("timestamp", ">=", fromTimestamp))
      constraints.unshift(where("timestamp", "<=", toTimestamp))
    }

    const q = query(photosRef, ...constraints)
    const snapshot = await getDocs(q)

    console.log("[v0] ✅ Photos fetched:", snapshot.docs.length, "documents")

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
  } catch (error: any) {
    console.error("[v0] ❌ fetchPhotos ERROR:", error.message)
    console.error("[v0] Error code:", error.code)
    throw error
  }
}

// C1: Already have fetchConversations

// C2: Fetch conversation messages for duration analysis
export async function fetchAllConversationMessages(conversationIds: string[]) {
  const db = getFirebaseDb()
  const results: { conversationId: string; createdAt: Date; messages: any[] }[] = []

  for (const convId of conversationIds.slice(0, 100)) {
    const messagesRef = collection(db, "chat_conversations", convId, "messages")
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(500))
    const snapshot = await getDocs(q)

    const messages = snapshot.docs.map((doc) => ({
      role: doc.data().role,
      createdAt: toDate(doc.data().createdAt) || new Date(),
      status: doc.data().status,
    }))

    if (messages.length > 0) {
      results.push({
        conversationId: convId,
        createdAt: messages[0].createdAt,
        messages,
      })
    }
  }

  return results
}

// D1: Already have fetchBubbleEvents

export async function fetchTrackingMetrics(dateRange: { from: string; to: string }) {
  console.log("[v0] 📝 fetchTrackingMetrics called")
  console.log("[v0] Date range:", dateRange)

  try {
    const db = getFirebaseDb()
    const trackingRef = collection(db, "tracking")

    const q = query(
      trackingRef,
      ...dateRangeConstraints("createdAt", dateRange.from, dateRange.to),
      orderBy("createdAt", "desc"),
      limit(1000),
    )

    console.log("[v0] 🔍 Querying tracking collection...")
    const snapshot = await getDocs(q)
    console.log("[v0] ✅ Tracking entries fetched:", snapshot.docs.length, "documents")

    const entries: TrackingEntry[] = snapshot.docs.map((doc) => {
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

    console.log(
      "[v0] Sample entry:",
      entries[0]
        ? {
            userId: entries[0].userId,
            completeness: entries[0].completeness,
            entryMethod: entries[0].entryMethod,
            hasSymptoms: !!entries[0].symptoms?.length,
            hasSleep: !!entries[0].sleep,
            hasDigestive: !!entries[0].digestive,
            hasSport: !!entries[0].sport,
          }
        : "No entries",
    )
    console.log("[v0] ✅ fetchTrackingMetrics completed, returning", entries.length, "entries")
    return entries
  } catch (error: any) {
    console.error("[v0] ❌ fetchTrackingMetrics ERROR:", error.message)
    throw error
  }
}

// Overview Metrics
export async function fetchOverviewMetrics(dateRange: { from: string; to: string }) {
  console.log("[v0] 📊 fetchOverviewMetrics called")
  console.log("[v0] Date range:", dateRange)

  try {
    const db = getFirebaseDb()
    console.log("[v0] Firestore DB instance:", !!db)

    // Fetch all users
    console.log("[v0] 🔍 Querying users collection...")
    const usersSnapshot = await getDocs(collection(db, "users"))
    console.log("[v0] ✅ Users fetched:", usersSnapshot.docs.length, "documents")

    // Fetch tracking sessions
    console.log("[v0] 🔍 Querying tracking_sessions collection...")
    const sessionsRef = collection(db, "tracking_sessions")
    const sessionsQuery = query(sessionsRef, ...dateRangeConstraints("startedAt", dateRange.from, dateRange.to))
    const sessionsSnapshot = await getDocs(sessionsQuery)
    console.log("[v0] ✅ Tracking sessions fetched:", sessionsSnapshot.docs.length, "documents")

    // Fetch app events
    console.log("[v0] 🔍 Querying app_events collection...")
    const eventsRef = collection(db, "app_events")
    const eventsQuery = query(eventsRef, ...dateRangeConstraints("createdAt", dateRange.from, dateRange.to))
    const eventsSnapshot = await getDocs(eventsQuery)
    console.log("[v0] ✅ App events fetched:", eventsSnapshot.docs.length, "documents")

    // Fetch bubble events
    console.log("[v0] 🔍 Querying bubble_events collection...")
    const bubbleEventsRef = collection(db, "bubble_events")
    const bubbleEventsQuery = query(bubbleEventsRef, ...dateRangeConstraints("createdAt", dateRange.from, dateRange.to))
    const bubbleEventsSnapshot = await getDocs(bubbleEventsQuery)
    console.log("[v0] ✅ Bubble events fetched:", bubbleEventsSnapshot.docs.length, "documents")

    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      createdAt: toDate(doc.data().createdAt) || new Date(),
      ...doc.data(),
    }))
    console.log("[v0] Parsed users:", users.length)

    const sessions = sessionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      userId: doc.data().userId,
      startedAt: toDate(doc.data().startedAt) || new Date(),
      platform: doc.data().platform,
      appVersion: doc.data().appVersion,
    }))
    console.log("[v0] Parsed sessions:", sessions.length)

    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      userId: doc.data().userId,
    }))
    console.log("[v0] Parsed events:", events.length)

    const bubbleEvents = bubbleEventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      event: doc.data().event,
      userId: doc.data().userId,
    }))
    console.log("[v0] Parsed bubble events:", bubbleEvents.length)

    // Calculate metrics
    console.log("[v0] 📈 Calculating metrics...")

    const uniqueActiveUserIds = new Set(sessions.map((s) => s.userId))
    const dau = uniqueActiveUserIds.size
    console.log("[v0] DAU:", dau, "unique users")

    const newUsers = users.filter((u) => {
      const created = new Date(u.createdAt)
      const from = new Date(dateRange.from)
      const to = new Date(dateRange.to)
      return created >= from && created <= to
    }).length
    console.log("[v0] New users in period:", newUsers)

    const returningUsers = users.filter((u) => {
      const created = new Date(u.createdAt)
      const from = new Date(dateRange.from)
      const hasSession = sessions.some((s) => s.userId === u.id)
      return created < from && hasSession
    }).length
    console.log("[v0] Returning users:", returningUsers)

    const result = {
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

    console.log("[v0] ✅ fetchOverviewMetrics completed successfully")
    console.log("[v0] Result summary:", {
      dau: result.dau,
      totalUsers: result.totalUsers,
      newUsers: result.newUsers,
      returningUsers: result.returningUsers,
      totalSessions: result.totalSessions,
    })

    return result
  } catch (error: any) {
    console.error("[v0] ❌ fetchOverviewMetrics ERROR:", error.message)
    console.error("[v0] Error code:", error.code)
    console.error("[v0] Full error:", error)
    throw error
  }
}

// Chat Conversations
export async function fetchChatConversations(dateRange?: { from?: string; to?: string }) {
  console.log("[v0] 💬 fetchChatConversations called")
  console.log("[v0] Date range:", dateRange)
  console.log("[v0] 🔍 Querying chat_conversations without date filter first...")

  try {
    const db = getFirebaseDb()
    const chatsRef = collection(db, "chat_conversations")

    // Detect which field to use for ordering by querying a sample doc
    const sampleQuery = query(chatsRef, limit(1))
    const sampleSnapshot = await getDocs(sampleQuery)
    const orderField = sampleSnapshot.docs[0]?.data().startedAt ? "startedAt" : "createdAt"

    console.log("[v0] Using order field:", orderField)
    console.log("[v0] 🔍 Querying chat_conversations with constraints...")

    const q = query(chatsRef, orderBy(orderField, "desc"), limit(1000))
    const snapshot = await getDocs(q)

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

    console.log("[v0] ✅ Conversations fetched:", conversations.length, "documents")
    console.log("[v0] 💬 Total messages calculated:", totalMessages)
    console.log("[v0] 💬 Sample conversation data:", conversations[0])
    console.log("[v0] ✅ fetchChatConversations completed, returning", conversations.length, "conversations")

    return { conversations, totalMessages }
  } catch (error: any) {
    console.error("[v0] ❌ fetchChatConversations ERROR:", error.message)
    console.error("[v0] Error code:", error.code)
    throw error
  }
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
  console.log("[v0] 🔄 calculateRetentionCurve CALLED")
  console.log("[v0] Cohort period:", cohortStart, "to", cohortEnd)

  const db = getFirebaseDb()

  // Calculate cohort period length in days
  const cohortDays = getDaysDiff(cohortStart, cohortEnd)

  if (cohortDays > 30) {
    console.log("[v0] ⚠️ Cohort period too large:", cohortDays, "days")
    return {
      curve: [],
      cohortSize: 0,
      periodStart: cohortStart,
      periodEnd: cohortEnd,
      error: "Narrow date range to compute retention (max 30 days)",
    }
  }

  // Query users in cohort (createdAt between cohortStart and cohortEnd)
  const usersRef = collection(db, "users")
  const usersQuery = query(
    usersRef,
    where("createdAt", ">=", Timestamp.fromDate(new Date(cohortStart + "T00:00:00"))),
    where("createdAt", "<=", Timestamp.fromDate(new Date(cohortEnd + "T23:59:59"))),
  )
  const usersSnapshot = await getDocs(usersQuery)

  const cohortUsers = usersSnapshot.docs.map((doc) => {
    const createdAt = doc.data().createdAt?.toDate?.() || new Date()
    return {
      id: doc.id,
      signupDay: toDayKey(createdAt), // Format: "2026-01-08" in Europe/Paris
    }
  })

  const cohortSize = cohortUsers.length
  console.log("[v0] 📊 Cohort size:", cohortSize)

  if (cohortSize > 2000) {
    console.log("[v0] ⚠️ Cohort too large:", cohortSize, "users")
    return {
      curve: [],
      cohortSize,
      periodStart: cohortStart,
      periodEnd: cohortEnd,
      error: "Narrow date range to compute retention (max 2000 users)",
    }
  }

  if (cohortSize === 0) {
    return {
      curve: [],
      cohortSize: 0,
      periodStart: cohortStart,
      periodEnd: cohortEnd,
    }
  }

  // Query all sessions from cohortStart to cohortEnd + 30 days (or today if sooner)
  const today = new Date()
  const maxSessionDate = new Date(cohortEnd)
  maxSessionDate.setDate(maxSessionDate.getDate() + 30)
  const sessionEndDate = maxSessionDate < today ? maxSessionDate : today

  const sessionsRef = collection(db, "tracking_sessions")
  const sessionsQuery = query(
    sessionsRef,
    where("startedAt", ">=", Timestamp.fromDate(new Date(cohortStart + "T00:00:00"))),
    where("startedAt", "<=", Timestamp.fromDate(sessionEndDate)),
    orderBy("startedAt", "asc"),
  )
  const sessionsSnapshot = await getDocs(sessionsQuery)

  const activeDaysByUser = new Map<string, Set<string>>()
  sessionsSnapshot.docs.forEach((doc) => {
    const data = doc.data()
    const userId = data.userId
    const sessionDate = data.startedAt?.toDate?.()
    if (userId && sessionDate) {
      const dayKey = toDayKey(sessionDate)
      if (!activeDaysByUser.has(userId)) {
        activeDaysByUser.set(userId, new Set())
      }
      activeDaysByUser.get(userId)!.add(dayKey)
    }
  })

  console.log("[v0] 📊 Fetched", sessionsSnapshot.docs.length, "sessions")
  console.log("[v0] 📊 Active days map covers", activeDaysByUser.size, "users")

  const curve: { day: number; retentionPct: number }[] = []
  const todayKey = toDayKey(today)

  for (let d = 0; d <= 30; d++) {
    let retainedCount = 0
    let usersWithDataAvailable = 0

    for (const user of cohortUsers) {
      const targetDay = addDaysToDateString(user.signupDay, d)

      if (targetDay > todayKey) {
        continue
      }

      usersWithDataAvailable++

      const activeDays = activeDaysByUser.get(user.id)
      if (activeDays && activeDays.has(targetDay)) {
        retainedCount++
      }
    }

    if (usersWithDataAvailable > 0) {
      const retentionPct = (retainedCount / cohortSize) * 100
      curve.push({
        day: d,
        retentionPct: Math.round(retentionPct * 10) / 10,
      })
    }
  }

  console.log("[v0] 📊 Retention curve calculated:", curve.slice(0, 5), "...")
  return {
    curve,
    cohortSize,
    periodStart: cohortStart,
    periodEnd: cohortEnd,
  }
}

// Helper function to add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export async function fetchLastLoginsForUsers(userIds: string[]): Promise<Record<string, Date | null>> {
  console.log("[v0] 🔄 fetchLastLoginsForUsers called for", userIds.length, "users")

  if (userIds.length === 0) {
    return {}
  }

  const db = getFirebaseDb()
  const lastLogins: Record<string, Date | null> = {}

  try {
    // Fetch all recent tracking sessions ordered by startedAt descending
    // Then filter and group by userId in memory (no composite index needed)
    const sessionsQuery = query(
      collection(db, "tracking_sessions"),
      orderBy("startedAt", "desc"),
      limit(1000), // Get last 1000 sessions, should cover all users
    )

    const snapshot = await getDocs(sessionsQuery)
    console.log("[v0] 📊 Fetched", snapshot.docs.length, "total tracking sessions")

    // Group sessions by userId and find the most recent for each
    const userSessionMap: Record<string, Date> = {}

    snapshot.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      const startedAt = toDate(data.startedAt)

      // Only process users we're interested in
      if (userId && userIds.includes(userId) && startedAt) {
        // Keep only the most recent session for each user (since ordered by desc)
        if (!userSessionMap[userId]) {
          userSessionMap[userId] = startedAt
        }
      }
    })

    // Build result map with null for users without sessions
    userIds.forEach((userId) => {
      lastLogins[userId] = userSessionMap[userId] || null
    })

    const foundCount = Object.values(lastLogins).filter((d) => d !== null).length
    console.log("[v0] 📊 Fetched last logins for", foundCount, "out of", userIds.length, "users")

    return lastLogins
  } catch (error) {
    console.error("[v0] ❌ Error fetching last logins:", error)
    // Return empty map on error
    userIds.forEach((userId) => {
      lastLogins[userId] = null
    })
    return lastLogins
  }
}

export async function fetchLastActivitiesForUsers(userIds: string[]): Promise<Record<string, LastActivity | null>> {
  if (userIds.length === 0) return {}

  console.log("[v0] ���� fetchLastActivitiesForUsers called for", userIds.length, "users")

  const db = getFirebaseDb()
  const result: Record<string, LastActivity | null> = {}

  // Initialize all users with null
  userIds.forEach((userId) => {
    result[userId] = null
  })

  try {
    // Fetch recent activities from multiple collections in parallel
    const [trackingDocs, photosDocs, chatDocs, eventsDocs, bubbleDocs] = await Promise.all([
      // 1. Tracking entries
      getDocs(query(collection(db, "tracking"), orderBy("updatedAt", "desc"), limit(200))).catch(() => ({ docs: [] })),

      // 2. Photos
      getDocs(query(collection(db, "photos"), orderBy("createdAt", "desc"), limit(200))).catch(() => ({ docs: [] })),

      // 3. Chat messages (sampling recent conversations)
      getDocs(query(collection(db, "chat_conversations"), orderBy("updatedAt", "desc"), limit(50))).catch(() => ({
        docs: [],
      })),

      // 4. App events
      getDocs(query(collection(db, "app_events"), orderBy("createdAt", "desc"), limit(200))).catch(() => ({
        docs: [],
      })),

      // 5. Bubble events
      getDocs(query(collection(db, "bubble_events"), orderBy("createdAt", "desc"), limit(200))).catch(() => ({
        docs: [],
      })),
    ])

    // Process tracking entries
    trackingDocs.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      if (!userId || !userIds.includes(userId)) return

      const timestamp = toDate(data.updatedAt || data.createdAt)
      if (!timestamp) return

      if (!result[userId] || timestamp > result[userId]!.timestamp) {
        result[userId] = {
          timestamp,
          type: "tracking",
          description: "Tracked symptoms",
        }
      }
    })

    // Process photos
    photosDocs.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      if (!userId || !userIds.includes(userId)) return

      const timestamp = toDate(data.createdAt)
      if (!timestamp) return

      if (!result[userId] || timestamp > result[userId]!.timestamp) {
        result[userId] = {
          timestamp,
          type: "photo",
          description: "Uploaded a photo",
        }
      }
    })

    // Avoid composite index by fetching all recent messages and filtering in memory
    for (const convDoc of chatDocs.docs) {
      const convData = convDoc.data()
      const userId = convData.userId
      if (!userId || !userIds.includes(userId)) continue

      try {
        // Fetch only most recent messages without role filter to avoid composite index
        const messagesSnapshot = await getDocs(
          query(collection(db, `chat_conversations/${convDoc.id}/messages`), orderBy("createdAt", "desc"), limit(10)),
        )

        // Filter for user messages in memory
        const userMessages = messagesSnapshot.docs.filter((msgDoc) => {
          const msgData = msgDoc.data()
          return msgData.role === "user" || msgData.isUser === true
        })

        if (userMessages.length > 0) {
          const latestMessage = userMessages[0].data()
          const timestamp = toDate(latestMessage.createdAt)

          if (timestamp && (!result[userId] || timestamp > result[userId]!.timestamp)) {
            result[userId] = {
              timestamp,
              type: "chat",
              description: "Sent a message",
            }
          }
        }
      } catch (error) {
        // Skip this conversation on error
        console.log(`[v0] Error fetching messages for conversation ${convDoc.id}:`, error)
      }
    }

    // Process app events
    eventsDocs.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      if (!userId || !userIds.includes(userId)) return

      const timestamp = toDate(data.createdAt)
      if (!timestamp) return

      if (!result[userId] || timestamp > result[userId]!.timestamp) {
        result[userId] = {
          timestamp,
          type: "app_event",
          description: data.eventName || "App interaction",
        }
      }
    })

    // Process bubble events
    bubbleDocs.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      if (!userId || !userIds.includes(userId)) return

      const timestamp = toDate(data.createdAt)
      if (!timestamp) return

      if (!result[userId] || timestamp > result[userId]!.timestamp) {
        result[userId] = {
          timestamp,
          type: "bubble_event",
          description: data.eventType || "Bubble interaction",
        }
      }
    })

    const foundCount = Object.values(result).filter((activity) => activity !== null).length
    console.log("[v0] ✅ Fetched last activities for", foundCount, "out of", userIds.length, "users")

    return result
  } catch (error) {
    console.error("[v0] ❌ Error in fetchLastActivitiesForUsers:", error)
    return result
  }
}

export async function fetchUserDailySessionTimes(
  userIds: string[],
): Promise<Record<string, { avgDailyTimeMinutes: number; totalSessions: number }>> {
  if (userIds.length === 0) return {}

  console.log("[v0] 🔄 fetchUserDailySessionTimes called for", userIds.length, "users")

  try {
    const db = getFirebaseDb()
    const sessionsRef = collection(db, "tracking_sessions")

    // Fetch recent sessions (last 90 days to get meaningful avg)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const q = query(sessionsRef, where("startedAt", ">=", ninetyDaysAgo), orderBy("startedAt", "desc"), limit(10000))

    const snapshot = await getDocs(q)
    console.log("[v0] Fetched", snapshot.docs.length, "sessions for daily time calculation")

    // Group sessions by user and day
    const userDailyTimes: Record<string, Record<string, number>> = {}

    snapshot.docs.forEach((doc) => {
      const data = doc.data()
      const userId = data.userId
      if (!userIds.includes(userId)) return

      const startedAt = toDate(data.startedAt)
      if (!startedAt) return

      // Convert to Europe/Paris timezone day
      const day = formatDate(startedAt, "yyyy-MM-dd")
      const durationMs = data.durationMs || 0

      if (!userDailyTimes[userId]) {
        userDailyTimes[userId] = {}
      }

      // Sum all sessions for this user on this day
      userDailyTimes[userId][day] = (userDailyTimes[userId][day] || 0) + durationMs
    })

    // Calculate avg daily time for each user
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
      const avgDailyTimeMinutes = Math.round(avgDailyTimeMs / (1000 * 60))

      result[userId] = {
        avgDailyTimeMinutes,
        totalSessions: snapshot.docs.filter((doc) => doc.data().userId === userId).length,
      }
    }

    console.log("[v0] ✅ Calculated daily session times for", Object.keys(result).length, "users")
    return result
  } catch (error) {
    console.error("[v0] ❌ Error fetching user daily session times:", error)
    return {}
  }
}
