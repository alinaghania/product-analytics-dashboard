import { getAdminDb, getAdminDbPool } from "./firebase-admin"
import { fetchContactedUserIdSet } from "./firestore-dashboard-queries"
import { Timestamp } from "firebase-admin/firestore"
import { format as formatDate } from "date-fns"
import {
  labelize,
  ACQUISITION_SOURCE_LABELS,
  PRIMARY_OBJECTIVE_LABELS,
  SITUATION_LABELS,
  APP_EXPECTATIONS_V2_LABELS,
  TRACKING_PRIORITIES_LABELS,
  REMINDER_PREFERENCES_LABELS,
  CYCLE_TRACKING_GOALS_LABELS,
  SYMPTOM_TIMING_LABELS,
  MAIN_SYMPTOMS_LABELS,
  WHAT_WEIGHS_MOST_LABELS,
  ENDO_TYPES_LABELS,
  HAS_ENDOMETRIOSIS_LABELS,
  LIFE_STAGE_LABELS,
  PERIOD_FREQUENCY_LABELS,
} from "./onboarding-labels"
import type {
  User,
  ChatConversation,
  ChatMessage,
  AppEvent,
  BubbleEvent,
  Photo,
  TrackingEntry,
  TrackingSession,
  LastActivity,
  OnboardingAnalytics,
  AcquisitionMetrics,
  ActiveUsersByVersion,
  CountSlice,
} from "./types"

// Recursively convert Firestore Timestamps (and Dates) to ISO strings, so
// JSON.stringify produces readable output instead of `{ _seconds, _nanoseconds }`.
export function serializeTimestamps(value: any): any {
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return value
  if (typeof value.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeTimestamps)
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = serializeTimestamps(v)
  }
  return out
}

// Helper to convert Firestore timestamp to Date
function toDate(timestamp: any): Date | undefined {
  if (!timestamp) return undefined
  if (timestamp.toDate) return timestamp.toDate()
  if (timestamp instanceof Date) return timestamp
  if (typeof timestamp === "string") return new Date(timestamp)
  if (typeof timestamp === "number") return new Date(timestamp)
  return undefined
}

// Normalize the many role spellings the mobile app has used over time.
function normalizeMessageRole(data: any): ChatMessage["role"] {
  const rawRole = String(data.role ?? data.sender ?? data.type ?? data.author ?? data.from ?? "").toLowerCase()
  if (["user", "client", "human"].includes(rawRole)) return "user"
  if (["assistant", "bot", "ai", "endora"].includes(rawRole)) return rawRole === "endora" ? "endora" : "assistant"
  if (rawRole === "system") return "system"
  return "assistant"
}

// Pull plain text out of the various message content shapes (string, array of
// blocks, or { text|content|message } object), trying the known field names.
function extractMessageContent(data: any): string {
  const extract = (value: unknown): string => {
    if (typeof value === "string") return value
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item
          if (item && typeof item === "object") {
            const candidate = (item as any).text ?? (item as any).content ?? (item as any).message
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
  return extract(data.text) || extract(data.content) || extract(data.message) || extract(data.body) || ""
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
  const date = new Date(dateStr + "T00:00:00Z")
  date.setUTCDate(date.getUTCDate() + days)
  return toDayKey(date)
}

// ============= USERS =============

function mapUserDoc(id: string, data: FirebaseFirestore.DocumentData): User {
  const rawPhone = data.registrationData?.phone
  const phone =
    typeof rawPhone === "string" && rawPhone.trim().length > 0 ? rawPhone.trim() : undefined

  return {
    id,
    email: data.email || "",
    username: data.username || data.registrationData?.username || "",
    displayName: data.displayName,
    phone,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    birthDate: data.registrationData?.birthDate || data.birthDate,
    onboardingCompletedAt: toDate(data.onboardingCompletedAt),
    metadata: {
      lastLoginAt: toDate(data.metadata?.lastLoginAt),
      lastLoginDate: toDate(data.metadata?.lastLoginDate),
      platform: data.metadata?.platform,
      appVersion: data.metadata?.appVersion,
      accountCreatedDate: toDate(data.metadata?.accountCreatedDate),
    },
    flags: {
      onboardingCompleted:
        data.flags?.onboardingCompleted ?? data.onboardingCompleted ?? false,
      registrationCompleted:
        data.flags?.registrationCompleted ?? data.registrationCompleted ?? false,
      registrationStep:
        data.flags?.registrationStep ?? data.registrationStep,
      profileCompletion:
        data.flags?.profileCompletion ?? data.metadata?.profileCompleteness ?? 0,
    },
    subscriptionStatus: data.subscriptionStatus,
    consents: data.consents ? { marketing: data.consents.marketing === true } : undefined,
    registrationData: data.registrationData,
  }
}

export async function fetchUsers(options: {
  limitCount?: number
  search?: string
  startAfter?: string
  from?: string // YYYY-MM-DD inclusive lower bound on createdAt
  to?: string // YYYY-MM-DD inclusive upper bound on createdAt
  platform?: "ios" | "android"
  premium?: boolean
  contacted?: boolean // has at least one outreach entry (dashboard DB)
  churned?: boolean // had a RevenueCat subscription event but is no longer premium
  inactive?: boolean // lastLoginDate older than 1 month (or absent)
}): Promise<{ data: User[]; hasMore: boolean; lastCreatedAt?: string }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 50
  const search = options.search?.trim()

  // Direct lookup when the search term looks like a Firebase UID — the substring
  // filter below only sees the current paginated page, so users outside it would
  // otherwise be unreachable by ID.
  if (search && /^[a-zA-Z0-9]{28}$/.test(search)) {
    const user = await fetchUserById(search)
    if (user) {
      return { data: [user], hasMore: false }
    }
  }

  let ref: FirebaseFirestore.Query = db.collection("users").orderBy("createdAt", "desc")

  // Date range on createdAt — single-field range + orderBy on same field, no
  // composite index required.
  if (options.from) {
    ref = ref.where("createdAt", ">=", new Date(`${options.from}T00:00:00`))
  }
  if (options.to) {
    ref = ref.where("createdAt", "<=", new Date(`${options.to}T23:59:59`))
  }

  if (options.startAfter) {
    ref = ref.startAfter(new Date(options.startAfter))
  }

  const hasClientFilters = !!(
    search ||
    options.platform ||
    options.premium !== undefined ||
    options.contacted !== undefined ||
    options.churned ||
    options.inactive
  )

  // The contacted-IDs set lives in the dashboard DB. Fails loudly if that DB
  // isn't set up — the filter is unusable without it, unlike the passive
  // "Contacté" column which degrades to "—".
  const contactedSet =
    options.contacted !== undefined ? await fetchContactedUserIdSet() : null

  const inactiveCutoff = new Date()
  inactiveCutoff.setMonth(inactiveCutoff.getMonth() - 1)

  const applyFilters = (batch: User[]): User[] => {
    if (search) {
      const searchLower = search.toLowerCase()
      batch = batch.filter(
        (u) => u.email?.toLowerCase().includes(searchLower) || u.username?.toLowerCase().includes(searchLower),
      )
    }
    if (options.platform) {
      batch = batch.filter((u) => u.metadata?.platform?.toLowerCase() === options.platform)
    }
    if (options.premium !== undefined) {
      batch = batch.filter((u) => Boolean(u.subscriptionStatus?.isPremium) === options.premium)
    }
    if (contactedSet) {
      batch = batch.filter((u) => contactedSet.has(u.id) === options.contacted)
    }
    if (options.churned) {
      // Best available churn proxy: subscriptionStatus is only written on
      // RevenueCat subscription events, so its presence with isPremium=false
      // means "had a subscription or trial, no longer premium".
      batch = batch.filter(
        (u) => u.subscriptionStatus !== undefined && u.subscriptionStatus.isPremium === false,
      )
    }
    if (options.inactive) {
      // Based on users.metadata.lastLoginDate — same source as the list's
      // "Last Login" column, so the filter and the column stay consistent.
      batch = batch.filter((u) => {
        const lastLogin = u.metadata?.lastLoginDate ?? u.metadata?.lastLoginAt
        return !lastLogin || lastLogin < inactiveCutoff
      })
    }
    return batch
  }

  if (!hasClientFilters) {
    const snapshot = await ref.limit(limitCount).get()
    const lastDoc = snapshot.docs[snapshot.docs.length - 1]
    return {
      data: snapshot.docs.map((doc) => mapUserDoc(doc.id, doc.data())),
      hasMore: snapshot.docs.length === limitCount,
      lastCreatedAt: lastDoc?.data()?.createdAt?.toDate?.()?.toISOString(),
    }
  }

  // Filtered path: scan forward in batches until the page fills (plus one
  // extra match to place the cursor) or the scan cap is hit. A single capped
  // over-fetch isn't enough for sparse filters — e.g. "inactive" can never
  // match accounts created within the last month, so the newest several
  // hundred docs in createdAt order contain zero matches.
  const BATCH_SIZE = 300
  const MAX_SCANNED = 1500
  const users: User[] = []
  let scanned = 0
  let exhausted = false
  let lastScannedDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined

  while (users.length <= limitCount && scanned < MAX_SCANNED && !exhausted) {
    const batchRef = lastScannedDoc ? ref.startAfter(lastScannedDoc) : ref
    const snapshot = await batchRef.limit(BATCH_SIZE).get()
    scanned += snapshot.docs.length
    exhausted = snapshot.docs.length < BATCH_SIZE
    if (snapshot.docs.length > 0) lastScannedDoc = snapshot.docs[snapshot.docs.length - 1]
    users.push(...applyFilters(snapshot.docs.map((doc) => mapUserDoc(doc.id, doc.data()))))
  }

  const trimmed = users.slice(0, limitCount)

  if (users.length > limitCount) {
    // Matches beyond this page exist: resume from the last returned match so
    // the surplus isn't skipped by a cursor pointing past it.
    return {
      data: trimmed,
      hasMore: true,
      lastCreatedAt: trimmed[trimmed.length - 1].createdAt.toISOString(),
    }
  }
  // Page not filled: every match found so far is returned, so resume the scan
  // from the last doc read (the page may be short or even empty while more
  // docs remain — same as paging past a sparse stretch).
  return {
    data: trimmed,
    hasMore: !exhausted,
    lastCreatedAt: lastScannedDoc?.data()?.createdAt?.toDate?.()?.toISOString(),
  }
}

export async function fetchUserById(userId: string): Promise<User | null> {
  const db = getAdminDb()
  const doc = await db.collection("users").doc(userId).get()
  if (!doc.exists) return null
  return mapUserDoc(doc.id, doc.data()!)
}

// Total user count via Firestore aggregation — costs 1 read regardless of
// collection size. Use this instead of `fetchUsers().data.length` when the
// caller only needs the KPI number.
export async function fetchTotalUserCount(): Promise<number> {
  const db = getAdminDb()
  const snapshot = await db.collection("users").count().get()
  return snapshot.data().count
}

// Activity KPIs (Avg DAU / WAU / MAU / Stickiness) for the selected range.
// Server still scans `tracking_sessions` over the date range but returns just
// 4 numbers — the client doesn't download every session.
export async function fetchActivityMetrics(options: {
  from: string
  to: string
}): Promise<{ avgDau: number; wau: number; mau: number; stickiness: number }> {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)

  // Fetch only the fields we need — slimmer payload, same number of reads.
  const snapshot = await db
    .collection("tracking_sessions")
    .where("startedAt", ">=", fromTs)
    .where("startedAt", "<=", toTs)
    .select("userId", "startedAt")
    .limit(5000)
    .get()

  const dailyUsers = new Map<string, Set<string>>()
  const wauSet = new Set<string>()
  const mauSet = new Set<string>()

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const userId: string | undefined = data.userId
    const startedAt: Date | undefined = data.startedAt?.toDate?.()
    if (!userId || !startedAt) continue

    const dayKey = `${startedAt.getFullYear()}-${startedAt.getMonth()}-${startedAt.getDate()}`
    if (!dailyUsers.has(dayKey)) dailyUsers.set(dayKey, new Set())
    dailyUsers.get(dayKey)!.add(userId)

    if (startedAt >= sevenDaysAgo) wauSet.add(userId)
    if (startedAt >= thirtyDaysAgo) mauSet.add(userId)
  }

  const avgDau =
    dailyUsers.size > 0
      ? Math.round(
          [...dailyUsers.values()].reduce((sum, set) => sum + set.size, 0) / dailyUsers.size,
        )
      : 0
  const wau = wauSet.size
  const mau = mauSet.size
  const stickiness = mau > 0 ? Math.min(Math.round((avgDau / mau) * 100), 100) : 0

  return { avgDau, wau, mau, stickiness }
}

// Daily count of Firestore user signups (users.createdAt) in the given range.
// Fetches only the `createdAt` field via select() and buckets server-side, so
// the client just receives an array of `{ date, count }` — no doc download.
export async function fetchDailySignups(options: {
  from: string
  to: string
}): Promise<Array<{ date: string; count: number }>> {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  const snapshot = await db
    .collection("users")
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<=", toTs)
    .orderBy("createdAt", "asc")
    .select("createdAt")
    .limit(10000)
    .get()

  const byDay = new Map<string, number>()
  for (const doc of snapshot.docs) {
    const ts: Date | undefined = doc.data().createdAt?.toDate?.()
    if (!ts) continue
    const dayKey = ts.toISOString().slice(0, 10)
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1)
  }

  return [...byDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Acquisition over the selected window: where signups came from, per day.
// Answers "How did you hear about Endora?" (registrationData.acquisitionSource,
// onboarding step U4_SOURCE). Reads only the nested source field + createdAt via
// select() — no full doc download. Returns the stacked-chart rows (one per day,
// keyed by human source label), the source totals, and the answered count.
export async function fetchAcquisitionMetrics(options: {
  from: string
  to: string
}): Promise<AcquisitionMetrics> {
  const db = getAdminDb()
  const { fromTs, toTs } = dateRangeTimestamps(options.from, options.to)

  const snapshot = await db
    .collection("users")
    .where("createdAt", ">=", fromTs)
    .where("createdAt", "<=", toTs)
    .orderBy("createdAt", "asc")
    .select("createdAt", "registrationData.acquisitionSource")
    .limit(20000)
    .get()

  const totals: Counter = {}
  const byDay = new Map<string, Counter>() // dayKey → source label → count

  for (const doc of snapshot.docs) {
    const ts: Date | undefined = doc.data().createdAt?.toDate?.()
    const reg = doc.data().registrationData as Record<string, unknown> | undefined
    const code = typeof reg?.acquisitionSource === "string" ? reg.acquisitionSource.trim() : ""
    if (!ts || !code) continue

    const label = labelize(ACQUISITION_SOURCE_LABELS, code)
    totals[label] = (totals[label] || 0) + 1

    const dayKey = ts.toISOString().slice(0, 10)
    const dayCounter = byDay.get(dayKey) ?? {}
    dayCounter[label] = (dayCounter[label] || 0) + 1
    byDay.set(dayKey, dayCounter)
  }

  const sources = Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, perSource]) => {
      const row: Record<string, number | string> = { date }
      let total = 0
      for (const [label, count] of Object.entries(perSource)) {
        row[label] = count
        total += count
      }
      row.total = total
      return row
    })

  return {
    daily,
    sources,
    answered: sources.reduce((sum, s) => sum + s.count, 0),
  }
}

// Monthly count of user signups (users.createdAt) across the whole user base.
// Fetches only `createdAt` and buckets server-side into "YYYY-MM" keys
// (Europe/Paris, matching the dashboard's timezone) so the client receives a
// compact array — no doc download. Docs missing createdAt are dropped by the
// orderBy and can't be bucketed anyway.
export async function fetchMonthlySignups(): Promise<Array<{ month: string; count: number }>> {
  const db = getAdminDb()
  const snapshot = await db
    .collection("users")
    .orderBy("createdAt", "asc")
    .select("createdAt")
    .limit(50000)
    .get()

  const monthFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  })

  const byMonth = new Map<string, number>()
  for (const doc of snapshot.docs) {
    const ts: Date | undefined = doc.data().createdAt?.toDate?.()
    if (!ts) continue
    const monthKey = monthFmt.format(ts).slice(0, 7) // "YYYY-MM"
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1)
  }

  return [...byMonth.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

// Average age from users.registrationData.age (or birthDate) without
// downloading the entire users collection — server reads only the registration
// fields it needs and returns the average.
export async function fetchAvgAge(): Promise<{ avgAge: number; sampleSize: number }> {
  const db = getAdminDb()
  const snapshot = await db
    .collection("users")
    .select("registrationData", "birthDate")
    .limit(10000)
    .get()

  const now = new Date()
  let sum = 0
  let count = 0
  for (const doc of snapshot.docs) {
    const d = doc.data() as any
    let age: number | undefined
    const rawAge = d.registrationData?.age
    if (typeof rawAge === "number") age = rawAge
    else if (typeof rawAge === "string" && rawAge.trim()) {
      const n = parseInt(rawAge, 10)
      if (Number.isFinite(n)) age = n
    } else {
      const bd = d.registrationData?.birthDate || d.birthDate
      if (typeof bd === "string") {
        const birth = new Date(bd)
        if (!Number.isNaN(birth.getTime())) {
          const yrs = now.getFullYear() - birth.getFullYear()
          const before =
            now.getMonth() < birth.getMonth() ||
            (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
          age = before ? yrs - 1 : yrs
        }
      }
    }
    if (typeof age === "number" && age > 0 && age < 120) {
      sum += age
      count++
    }
  }

  const avgAge = count > 0 ? Math.round(sum / count) : 0
  return { avgAge, sampleSize: count }
}

// Photo count via Firestore aggregation — 1 read regardless of how many docs
// match. Supports the same date range + filter shape as `fetchPhotos` so KPIs
// can be computed without downloading the underlying docs.
export async function fetchPhotoCount(options?: {
  from?: string
  to?: string
  time?: "morning" | "evening"
  bloated?: boolean
}): Promise<number> {
  const db = getAdminDb()
  let ref: FirebaseFirestore.Query = db.collection("photos")
  if (options?.from && options?.to) {
    ref = ref
      .where("timestamp", ">=", Timestamp.fromDate(new Date(`${options.from}T00:00:00`)))
      .where("timestamp", "<=", Timestamp.fromDate(new Date(`${options.to}T23:59:59`)))
  }
  if (options?.time) {
    ref = ref.where("time", "==", options.time)
  }
  if (options?.bloated !== undefined) {
    ref = ref.where("bloated", "==", options.bloated)
  }
  const snapshot = await ref.count().get()
  return snapshot.data().count
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
      title: typeof data.title === "string" ? data.title : undefined,
      topics: data.topics || (data.topic ? [data.topic] : []),
      topic: data.topic,
      entryPoint: data.entryPoint,
      startedAt: toDate(data.startedAt),
      createdAt,
      updatedAt,
      lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : undefined,
      lastMessageSnippet:
        typeof data.lastMessage === "string"
          ? data.lastMessage
          : typeof data.lastMessageSnippet === "string"
            ? data.lastMessageSnippet
            : undefined,
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
      title: typeof data.title === "string" ? data.title : undefined,
      topics: data.topics || [],
      entryPoint: data.entryPoint,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : undefined,
      lastMessageSnippet:
        typeof data.lastMessage === "string"
          ? data.lastMessage
          : typeof data.lastMessageSnippet === "string"
            ? data.lastMessageSnippet
            : undefined,
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

    const role = normalizeMessageRole(data)
    const content = extractMessageContent(data)

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
    const lastMessageString =
      typeof data.lastMessage === "string"
        ? data.lastMessage
        : typeof data.lastMessageSnippet === "string"
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
      title: typeof data.title === "string" ? data.title : undefined,
      topics: data.topics || (data.topic ? [data.topic] : []),
      topic: data.topic,
      entryPoint: data.entryPoint,
      startedAt: toDate(data.startedAt),
      createdAt,
      updatedAt,
      lastMessageAt,
      lastMessage: lastMessageString,
      lastMessageSnippet: lastMessageString,
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

// ============= CONVERSATION INSIGHTS CORPUS =============
//
// Assembles a corpus of recent, non-onboarding conversations for the LLM
// "interesting conversations" panel on the Users page. Unlike
// fetchConversationMessages (which drops entryPoint/topic), this reader keeps
// the per-message markers needed to detect and strip the Endora intro flow.

export interface InsightsConversation {
  conversationId: string
  userId: string
  messages: { role: ChatMessage["role"]; content: string }[]
}

export interface InsightsCorpusMeta {
  conversationsAnalyzed: number
  onboardingExcluded: number
  truncated: boolean
}

interface RawInsightMessage {
  // Firestore message doc id — kept so the "Ask" feature can cite a precise
  // message and deep-link to it. Optional because classification never needs it.
  messageId?: string
  role: ChatMessage["role"]
  content: string
  entryPoint?: string
  topic?: string
}

const INSIGHTS_DEFAULTS = {
  fetchCount: 400, // conversations to scan (createdAt desc)
  keepCount: 200, // most-recent non-onboarding conversations to keep
  maxMessagesPerConv: 50,
  maxCharsPerMessage: 2000,
  maxTotalChars: 300_000,
  concurrency: 10,
} as const

// A message belongs to the Endora intro flow when the mobile app tagged it as
// such (source: lotus-mobile/src/intro-flow/persistence.ts). The conversation
// doc does NOT store these — they live on individual messages.
const isIntroMessage = (m: RawInsightMessage): boolean =>
  m.entryPoint === "intro_flow" || m.topic === "intro_flow"
const isNonEmptyMessage = (m: RawInsightMessage): boolean => m.content.trim().length > 0

// Fallback for legacy data with no intro markers: the scripted intro opens with
// this assistant line and contains only canned user replies (no real request).
const INTRO_OPENER_RE = /^Bonjour\b.*je suis Endora/i

// The intro conversation is created with this exact title (FR + EN variants,
// verified in production). Note: the title is NOT updated when the chat later
// turns into a real conversation, so it can corroborate "intro-flavoured" but
// can NEVER alone decide exclusion — hence it's gated on "no real user request".
const INTRO_TITLE_RE = /^(bienvenue sur endora|welcome to endora)$/i

// Canned user replies in the intro script — normalized (lowercase, no accents,
// no punctuation). A user message matching one of these is NOT a real request.
function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
// The full set of canned user replies in the intro script (verified against
// production message data). A partial onboarding is a prefix of this sequence,
// so its replies are always a subset — keeping it complete is what lets the
// fallback exclude both partial and completed markerless onboarding.
const INTRO_SCRIPT_REPLIES = new Set(
  [
    "Ravie de te rencontrer",
    "Mais c'est génial, je vais en apprendre plus sur moi",
    "J'aurais des choses à montrer à mon médecin",
    "J'adore le concept",
    "Bon à savoir",
    "Ça va me faciliter mon suivi",
  ].map(normalizeReply),
)

// Classify a conversation's messages: either exclude it as onboarding, or keep
// it with the residual intro messages stripped from the transcript. `title` is
// the conversation-doc title (corroborating signal for the markerless fallback).
function classifyConversation(
  messages: RawInsightMessage[],
  title?: string,
): { excluded: true } | { excluded: false; messages: RawInsightMessage[] } {
  const hasMarker = messages.some(isIntroMessage)

  if (hasMarker) {
    // Structured marker (recent data): exclude only if EVERY non-empty message
    // is intro; otherwise keep the conversation but drop the intro messages.
    // (The title is deliberately ignored here: onboarding-then-real chats keep
    // the "Bienvenue sur Endora" title, and we must keep their real part.)
    const nonEmpty = messages.filter(isNonEmptyMessage)
    if (nonEmpty.length > 0 && nonEmpty.every(isIntroMessage)) return { excluded: true }
    return { excluded: false, messages: messages.filter((m) => !isIntroMessage(m)) }
  }

  // Content/title fallback (legacy data, no markers): exclude only when the
  // intro opener OR the intro title is present AND there is no real user request
  // anywhere. The "no real request" gate prevents over-excluding a chat that
  // started as onboarding (same title) but became a genuine conversation.
  const firstAssistant = messages.find((m) => m.role !== "user" && isNonEmptyMessage(m))
  const opensWithIntro =
    (!!firstAssistant && INTRO_OPENER_RE.test(firstAssistant.content.trim())) ||
    (!!title && INTRO_TITLE_RE.test(title.trim()))
  if (!opensWithIntro) return { excluded: false, messages }

  const hasRealUserRequest = messages.some(
    (m) => m.role === "user" && isNonEmptyMessage(m) && !INTRO_SCRIPT_REPLIES.has(normalizeReply(m.content)),
  )
  return hasRealUserRequest ? { excluded: false, messages } : { excluded: true }
}

// Read a conversation's messages while preserving entryPoint/topic markers.
// Messages store their time in `timestamp` (NOT `createdAt`), so we order by
// that and also sort in memory by a derived timestamp — guaranteeing chrono
// order even for the unordered fallback or legacy docs with a different field.
async function fetchRawInsightMessages(conversationId: string, limitCount: number): Promise<RawInsightMessage[]> {
  const db = getAdminDb()
  const base = db.collection("chat_conversations").doc(conversationId).collection("messages")
  let snapshot = await base.orderBy("timestamp", "asc").limit(limitCount).get()
  if (snapshot.empty) snapshot = await base.limit(limitCount).get()

  return snapshot.docs
    .map((doc, index) => {
      const data = doc.data()
      const ts = toDate(data.timestamp) || toDate(data.createdAt) || toDate(data.sentAt) || toDate(data.time)
      return {
        sortKey: ts ? ts.getTime() : index,
        messageId: doc.id,
        role: normalizeMessageRole(data),
        content: extractMessageContent(data),
        entryPoint: typeof data.entryPoint === "string" ? data.entryPoint : undefined,
        topic: typeof data.topic === "string" ? data.topic : undefined,
      }
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey, ...message }) => message)
}

// Build the insights corpus: scan recent conversations, exclude onboarding,
// keep the most-recent non-onboarding ones, and cap size for the LLM.
export async function fetchRecentConversationsForInsights(opts?: {
  fetchCount?: number
  keepCount?: number
}): Promise<{ conversations: InsightsConversation[]; meta: InsightsCorpusMeta }> {
  const cfg = { ...INSIGHTS_DEFAULTS, ...opts }
  const { data: conversations } = await fetchConversations({ limitCount: cfg.fetchCount })

  // Read messages + classify, in bounded-concurrency batches. Stop early once
  // we have enough non-onboarding conversations.
  const kept: { conversationId: string; userId: string; messages: RawInsightMessage[] }[] = []
  // Counts onboarding conversations seen *while collecting* the keepCount slots.
  // The loop stops early once keepCount non-onboarding are found, so this is the
  // exclusion count over the scanned prefix, not the full fetched set — a
  // deliberate trade to avoid reading subcollections we don't need.
  let onboardingExcluded = 0

  for (let i = 0; i < conversations.length && kept.length < cfg.keepCount; i += cfg.concurrency) {
    const batch = conversations.slice(i, i + cfg.concurrency)
    const classified = await Promise.all(
      batch.map(async (conv) => ({
        conv,
        result: classifyConversation(await fetchRawInsightMessages(conv.id, cfg.maxMessagesPerConv), conv.title),
      })),
    )
    for (const { conv, result } of classified) {
      if (kept.length >= cfg.keepCount) break
      if (result.excluded) {
        onboardingExcluded++
        continue
      }
      if (result.messages.some(isNonEmptyMessage)) {
        kept.push({ conversationId: conv.id, userId: conv.userId, messages: result.messages })
      }
    }
  }

  // Cap content: truncate long messages and enforce a global character budget.
  let totalChars = 0
  let truncated = false
  const out: InsightsConversation[] = []
  for (const conv of kept) {
    if (totalChars >= cfg.maxTotalChars) {
      truncated = true
      break
    }
    const messages: { role: ChatMessage["role"]; content: string }[] = []
    for (const m of conv.messages) {
      if (!isNonEmptyMessage(m)) continue
      let content = m.content.trim()
      if (content.length > cfg.maxCharsPerMessage) {
        content = content.slice(0, cfg.maxCharsPerMessage) + "…"
        truncated = true
      }
      if (totalChars + content.length > cfg.maxTotalChars) {
        truncated = true
        break
      }
      totalChars += content.length
      messages.push({ role: m.role, content })
    }
    if (messages.length > 0) out.push({ conversationId: conv.conversationId, userId: conv.userId, messages })
  }

  return {
    conversations: out,
    meta: { conversationsAnalyzed: out.length, onboardingExcluded, truncated },
  }
}

// ============= ASK-CONVERSATIONS CORPUS =============
//
// Same recent/non-onboarding corpus as the insights reader, but each kept
// message carries its real Firestore messageId. The "Ask" feature needs that id
// to cite a precise message and deep-link to it (/chats/{id}#msg-{messageId}),
// and to verify — server-side — that every cited id actually exists.

export interface AskConversation {
  conversationId: string
  userId: string
  messages: { messageId: string; role: ChatMessage["role"]; content: string }[]
}

export async function fetchConversationsForAsk(opts?: {
  fetchCount?: number
  keepCount?: number
}): Promise<{ conversations: AskConversation[]; meta: InsightsCorpusMeta }> {
  const cfg = { ...INSIGHTS_DEFAULTS, ...opts }
  const { data: conversations } = await fetchConversations({ limitCount: cfg.fetchCount })

  const kept: { conversationId: string; userId: string; messages: RawInsightMessage[] }[] = []
  let onboardingExcluded = 0

  for (let i = 0; i < conversations.length && kept.length < cfg.keepCount; i += cfg.concurrency) {
    const batch = conversations.slice(i, i + cfg.concurrency)
    const classified = await Promise.all(
      batch.map(async (conv) => ({
        conv,
        result: classifyConversation(await fetchRawInsightMessages(conv.id, cfg.maxMessagesPerConv), conv.title),
      })),
    )
    for (const { conv, result } of classified) {
      if (kept.length >= cfg.keepCount) break
      if (result.excluded) {
        onboardingExcluded++
        continue
      }
      if (result.messages.some(isNonEmptyMessage)) {
        kept.push({ conversationId: conv.id, userId: conv.userId, messages: result.messages })
      }
    }
  }

  // Cap content (same budget as insights), keeping only messages with a real id.
  let totalChars = 0
  let truncated = false
  const out: AskConversation[] = []
  for (const conv of kept) {
    if (totalChars >= cfg.maxTotalChars) {
      truncated = true
      break
    }
    const messages: { messageId: string; role: ChatMessage["role"]; content: string }[] = []
    for (const m of conv.messages) {
      if (!isNonEmptyMessage(m) || !m.messageId) continue
      let content = m.content.trim()
      if (content.length > cfg.maxCharsPerMessage) {
        content = content.slice(0, cfg.maxCharsPerMessage) + "…"
        truncated = true
      }
      if (totalChars + content.length > cfg.maxTotalChars) {
        truncated = true
        break
      }
      totalChars += content.length
      messages.push({ messageId: m.messageId, role: m.role, content })
    }
    if (messages.length > 0) out.push({ conversationId: conv.conversationId, userId: conv.userId, messages })
  }

  return {
    conversations: out,
    meta: { conversationsAnalyzed: out.length, onboardingExcluded, truncated },
  }
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

function mapTrackingDoc(id: string, data: FirebaseFirestore.DocumentData): TrackingEntry {
  const createdAt = toDate(data.createdAt) || new Date()
  const fallbackDate = createdAt.toISOString().split("T")[0]
  return {
    id,
    date: id.split("_")[1] || fallbackDate,
    userId: data.userId || id.split("_")[0] || "",
    completeness: data.completeness || 0,
    entryMethod: data.entryMethod || "manual",
    sleep: data.sleep,
    meals: data.meals,
    sport: data.sport,
    digestive: data.digestive,
    period: data.period,
    symptoms: data.symptoms || [],
    sections: data.sections || [],
    stress: data.stress,
    createdAt,
    updatedAt: toDate(data.updatedAt) || createdAt,
  }
}

export async function fetchTrackingEntries(options: {
  from: string
  to: string
  userId?: string
  limitCount?: number
}): Promise<{ data: TrackingEntry[]; hasMore: boolean }> {
  const db = getAdminDb()
  const limitCount = options.limitCount || 100

  // When scoped to a single user, use the (userId + date DESC) composite index
  // that's already deployed in Firestore.
  if (options.userId) {
    const snapshot = await db
      .collection("tracking")
      .where("userId", "==", options.userId)
      .where("date", ">=", options.from)
      .where("date", "<=", options.to)
      .orderBy("date", "desc")
      .limit(limitCount)
      .get()

    const entries = snapshot.docs.map((doc) => mapTrackingDoc(doc.id, doc.data()))
    return { data: entries, hasMore: snapshot.docs.length === limitCount }
  }

  const snapshot = await db.collection("tracking").orderBy("createdAt", "desc").limit(limitCount).get()
  const entries: TrackingEntry[] = snapshot.docs
    .map((doc) => {
      const entry = mapTrackingDoc(doc.id, doc.data())
      const docDate = entry.date || entry.createdAt.toISOString().split("T")[0]
      if (docDate < options.from || docDate > options.to) return null
      return entry
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

export async function fetchChatConversations(_dateRange?: { from?: string; to?: string }) {
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
      title: typeof data.title === "string" ? data.title : "",
      topic: data.topic || "",
      entryPoint: data.entryPoint || "",
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      messageCount: data.messageCount || 0,
      topics: data.topics || [],
      lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : undefined,
    }
  })

  const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0)
  return { conversations, totalMessages }
}

// Fetches (userId, date) pairs of one activity collection over [from, to],
// plus any `extraFields` the caller needs (returned under `extra`).
// The scan is split into two-week chunks spread over the client pool: one
// gRPC channel streams only ~2k docs/s, so the ~140k app_events a 3-month
// window can hold take ~60s on a single client vs ~12s pooled. select()
// trims each doc to just the requested fields.
async function fetchActivityDocs(
  collection: string,
  dateField: string,
  from: Date,
  to: Date,
  extraFields: string[] = [],
): Promise<Array<{ userId?: string; date?: Date; extra: Record<string, unknown> }>> {
  const CHUNK_MS = 14 * 24 * 3600 * 1000
  const pool = getAdminDbPool()
  const chunkQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = []
  for (let start = from.getTime(), i = 0; start <= to.getTime(); start += CHUNK_MS, i++) {
    // Half-open [start, end) chunks so no doc is double-counted; +1ms on the
    // final boundary keeps docs stamped exactly at `to` (inclusive like the
    // rest of this file's range queries).
    const end = Math.min(start + CHUNK_MS, to.getTime() + 1)
    chunkQueries.push(
      pool[i % pool.length]
        .collection(collection)
        .where(dateField, ">=", Timestamp.fromMillis(start))
        .where(dateField, "<", Timestamp.fromMillis(end))
        .select("userId", dateField, ...extraFields)
        .get(),
    )
  }
  const snapshots = await Promise.all(chunkQueries)
  return snapshots.flatMap((snap) =>
    snap.docs.map((doc) => {
      const data = doc.data()
      const extra: Record<string, unknown> = {}
      for (const field of extraFields) extra[field] = data[field]
      return { userId: data.userId, date: data[dateField]?.toDate?.(), extra }
    }),
  )
}

// Daily unique active users split by app version, for the Overview stacked
// chart. `app_events` is the version source: the mobile app stopped writing
// appVersion on tracking_sessions (~June 2026) while every recent app_event
// still carries it (an OTA bundle version — "1.0.0" predates "0.1.1", so
// versions are never sorted semantically). A user is "active" on a day if
// they emitted ≥1 app_event; one who updates mid-day counts once per version
// that day, so a day's `total` can slightly exceed true daily uniques.
export async function fetchActiveUsersByVersion(options: {
  from: string
  to: string
}): Promise<ActiveUsersByVersion> {
  // Must stay <= VERSION_PALETTE length in app/(dashboard)/page.tsx so every
  // kept version gets a distinct color.
  const TOP_VERSIONS = 6
  const MAX_RANGE_DAYS = 185

  if (getDaysDiff(options.from, options.to) > MAX_RANGE_DAYS) {
    return {
      daily: [],
      versions: [],
      totalActiveUsers: 0,
      error: `Narrow date range to compute version activity (max ${MAX_RANGE_DAYS} days)`,
    }
  }

  const docs = await fetchActivityDocs(
    "app_events",
    "createdAt",
    new Date(options.from + "T00:00:00"),
    new Date(options.to + "T23:59:59"),
    ["appVersion"],
  )

  const seen = new Set<string>() // "day|version|userId" — one count per user, version and day
  const byDay = new Map<string, Counter>() // dayKey → version → unique users
  const versionUsers = new Map<string, Set<string>>() // version → unique users over the range
  const allUsers = new Set<string>()

  for (const { userId, date, extra } of docs) {
    if (!userId || !date) continue
    const raw = typeof extra.appVersion === "string" ? extra.appVersion.trim() : ""
    const version = raw || "Unknown"
    const day = toDayKey(date)
    const dedupKey = `${day}|${version}|${userId}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const dayCounter = byDay.get(day) ?? {}
    dayCounter[version] = (dayCounter[version] || 0) + 1
    byDay.set(day, dayCounter)

    if (!versionUsers.has(version)) versionUsers.set(version, new Set())
    versionUsers.get(version)!.add(userId)
    allUsers.add(userId)
  }

  // Keep the top versions by range-wide unique users; fold the rest into
  // "Other" so the stack and its legend stay readable. "Other" always last.
  const totalsDesc = [...versionUsers.entries()]
    .map(([name, users]) => ({ name, count: users.size }))
    .sort((a, b) => b.count - a.count)
  const keptVersions = new Set(totalsDesc.slice(0, TOP_VERSIONS).map((v) => v.name))

  const versions: CountSlice[] = totalsDesc.filter((v) => keptVersions.has(v.name))
  const otherUsers = new Set<string>()
  for (const [name, users] of versionUsers) {
    if (keptVersions.has(name)) continue
    for (const userId of users) otherUsers.add(userId)
  }
  if (otherUsers.size > 0) versions.push({ name: "Other", count: otherUsers.size })

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, perVersion]) => {
      const row: Record<string, number | string> = { date }
      let total = 0
      for (const [version, count] of Object.entries(perVersion)) {
        const label = keptVersions.has(version) ? version : "Other"
        row[label] = ((row[label] as number) || 0) + count
        total += count
      }
      row.total = total
      return row
    })

  return { daily, versions, totalActiveUsers: allUsers.size }
}

export async function calculateRetentionCurve(
  cohortStart: string,
  cohortEnd: string,
  maxWeeks: number = 8,
): Promise<{
  curve: Array<{ week: number; retentionPct: number; retainedCount: number }>
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
  const maxSessionDate = new Date(cohortEnd + "T23:59:59Z")
  maxSessionDate.setUTCDate(maxSessionDate.getUTCDate() + maxWeeks * 7 + 6)
  const sessionEndDate = maxSessionDate < today ? maxSessionDate : today

  // "Active" on a given day = at least one tracking session OR one app_event
  // (chat, meal analysis, photos, missions…). Tracking sessions alone undercount
  // users who get value from non-tracking features; app_events alone miss
  // activity from before event instrumentation shipped — so the two are unioned.
  const [sessionActivity, appEventActivity] = await Promise.all([
    fetchActivityDocs("tracking_sessions", "startedAt", new Date(cohortStart + "T00:00:00"), sessionEndDate),
    fetchActivityDocs("app_events", "createdAt", new Date(cohortStart + "T00:00:00"), sessionEndDate),
  ])

  const activeDaysByUser = new Map<string, Set<string>>()
  for (const activity of [sessionActivity, appEventActivity]) {
    for (const { userId, date } of activity) {
      if (!userId || !date) continue
      if (!activeDaysByUser.has(userId)) activeDaysByUser.set(userId, new Set())
      activeDaysByUser.get(userId)!.add(toDayKey(date))
    }
  }

  const curve: { week: number; retentionPct: number; retainedCount: number }[] = []
  const todayKey = toDayKey(today)

  // Weekly cohort retention: a user is "retained" in week w if they had at least
  // one active day within the 7-day window [signup + w*7 … signup + w*7 + 6].
  // We only emit a Wn point once the WHOLE cohort has had that full window elapse
  // (the latest signup — cohortEnd — must be mature), so partially-elapsed weeks
  // are never plotted artificially low. Denominator is always the full cohortSize.
  for (let w = 0; w <= maxWeeks; w++) {
    if (addDaysToDateString(cohortEnd, w * 7 + 6) > todayKey) break

    let retainedCount = 0
    for (const user of cohortUsers) {
      const activeDays = activeDaysByUser.get(user.id)
      if (!activeDays) continue
      for (let k = 0; k < 7; k++) {
        if (activeDays.has(addDaysToDateString(user.signupDay, w * 7 + k))) {
          retainedCount++
          break
        }
      }
    }

    const retentionPct = (retainedCount / cohortSize) * 100
    curve.push({ week: w, retentionPct: Math.round(retentionPct * 10) / 10, retainedCount })
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

// ============= PER-USER AGGREGATES =============

// Many of these queries combine `where("userId", "==", id)` with `orderBy(...)`,
// which requires a composite index Firestore may not have provisioned in prod.
// We try the indexed query first and gracefully fall back to a scan + JS sort
// when Firestore complains. The fallback may return an arbitrary slice of the
// user's docs (not the most recent N) when they exceed the limit — callers must
// surface that in the UI when an index error is reported.
async function queryUserDocsWithFallback(
  collection: string,
  userId: string,
  orderField: string,
  limitCount: number,
): Promise<{ docs: FirebaseFirestore.QueryDocumentSnapshot[]; error: string | null }> {
  const db = getAdminDb()
  try {
    const snapshot = await db
      .collection(collection)
      .where("userId", "==", userId)
      .orderBy(orderField, "desc")
      .limit(limitCount)
      .get()
    return { docs: snapshot.docs, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const snapshot = await db.collection(collection).where("userId", "==", userId).limit(limitCount).get()
    const docs = snapshot.docs.slice().sort((a, b) => {
      const aTs = toDate(a.data()[orderField])?.getTime() ?? 0
      const bTs = toDate(b.data()[orderField])?.getTime() ?? 0
      return bTs - aTs
    })
    return { docs, error: message }
  }
}

export async function fetchUserPhotos(
  userId: string,
  limitCount: number = 200,
): Promise<{ data: Photo[]; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const { docs, error } = await queryUserDocsWithFallback("photos", userId, "timestamp", limitCount)
  const data: Photo[] = docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      userId: d.userId || "",
      pain: typeof d.pain === "number" ? d.pain : undefined,
      bloated: typeof d.bloated === "boolean" ? d.bloated : typeof d.bloated === "number" ? d.bloated : undefined,
      time: d.time,
      notes: typeof d.notes === "string" ? d.notes : undefined,
      downloadURL: typeof d.downloadURL === "string" ? d.downloadURL : undefined,
      storagePath: typeof d.storagePath === "string" ? d.storagePath : undefined,
      photoId: typeof d.photoId === "string" ? d.photoId : undefined,
      timestamp: toDate(d.timestamp),
      createdAt: toDate(d.createdAt) || toDate(d.timestamp) || new Date(),
    }
  })
  return { data, error }
}

export async function fetchUserAppEvents(
  userId: string,
  limitCount: number = 200,
): Promise<{ data: AppEvent[]; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const { docs, error } = await queryUserDocsWithFallback("app_events", userId, "createdAt", limitCount)
  const data: AppEvent[] = docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      userId: d.userId || "",
      name: d.name || "",
      screen: d.screen,
      platform: d.platform,
      appVersion: d.appVersion,
      params: d.params,
      createdAt: toDate(d.createdAt) || new Date(),
    }
  })
  return { data, error }
}

export async function fetchUserBubbleEvents(
  userId: string,
  limitCount: number = 200,
): Promise<{ data: BubbleEvent[]; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const { docs, error } = await queryUserDocsWithFallback("bubble_events", userId, "createdAt", limitCount)
  const data: BubbleEvent[] = docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      userId: d.userId || "",
      event: d.event || "",
      screen: d.screen,
      viewDurationMs: d.viewDurationMs,
      platform: d.platform,
      appVersion: d.appVersion,
      createdAt: toDate(d.createdAt) || new Date(),
    }
  })
  return { data, error }
}

export async function fetchUserTrackingSessions(
  userId: string,
  limitCount: number = 100,
): Promise<{ data: TrackingSession[]; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const { docs, error } = await queryUserDocsWithFallback("tracking_sessions", userId, "startedAt", limitCount)
  const data: TrackingSession[] = docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      userId: d.userId || "",
      startedAt: toDate(d.startedAt) || new Date(),
      completedAt: toDate(d.completedAt),
      durationMs: d.durationMs || 0,
      sections: d.sections || [],
      entryPoint: d.entryPoint,
      hasExistingRecord: d.hasExistingRecord || false,
      entryMethod: d.entryMethod,
      createdAt: toDate(d.createdAt),
    }
  })
  return { data, error }
}

export async function fetchUserTrackingEntries(
  userId: string,
  options?: { from?: string; to?: string; limitCount?: number },
): Promise<{ data: TrackingEntry[]; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const db = getAdminDb()
  const limitCount = options?.limitCount ?? 200

  // Uses the existing (userId + date DESC) composite index. The previous
  // documentId() range approach required a separate index Firestore wouldn't
  // build implicitly, so it failed silently and returned empty for every user.
  try {
    let ref: FirebaseFirestore.Query = db
      .collection("tracking")
      .where("userId", "==", userId)
    if (options?.from) ref = ref.where("date", ">=", options.from)
    if (options?.to) ref = ref.where("date", "<=", options.to)
    const snapshot = await ref.orderBy("date", "desc").limit(limitCount).get()
    const data = snapshot.docs.map((doc) => mapTrackingDoc(doc.id, doc.data()))
    return { data, error: null }
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function fetchUserRoutines(
  userId: string,
  limitCount: number = 100,
): Promise<{ data: Array<Record<string, unknown>>; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const { docs, error } = await queryUserDocsWithFallback("routines", userId, "createdAt", limitCount)
  const data = docs.map((doc) => {
    const d = doc.data()
    // Spread raw fields first so explicit mapped values (Dates) take precedence
    // — otherwise raw Firestore Timestamps would overwrite the converted Date.
    return {
      ...d,
      id: doc.id,
      userId: d.userId || "",
      title: d.title,
      name: d.name,
      type: d.type,
      sections: d.sections,
      usageCount: d.usageCount || 0,
      createdAt: toDate(d.createdAt),
      updatedAt: toDate(d.updatedAt),
      lastUsed: toDate(d.lastUsed),
    }
  })
  return { data, error }
}

export async function fetchUserFoodTrials(
  userId: string,
  limitCount: number = 200,
): Promise<{ data: Array<Record<string, unknown>>; error: string | null }> {
  if (!userId) return { data: [], error: null }
  const db = getAdminDb()
  try {
    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("foodTrials")
      .limit(limitCount)
      .get()
    const data = snapshot.docs.map((doc) => {
      const d = doc.data()
      // Spread raw first so the explicitly converted Dates win over raw Timestamps.
      return {
        ...d,
        id: doc.id,
        foodName:
          d.foodName ||
          d.name ||
          d.food ||
          d.label ||
          undefined,
        category: d.category || d.type || undefined,
        status: d.status || undefined,
        result: d.result || d.outcome || d.conclusion || undefined,
        createdAt: toDate(d.createdAt),
        startedAt: toDate(d.startedAt || d.startDate),
        endedAt: toDate(d.endedAt || d.endDate || d.completedAt),
        updatedAt: toDate(d.updatedAt),
      }
    })
    // Sort newest-first by best-available date.
    data.sort((a: any, b: any) => {
      const aTs = (a.createdAt || a.startedAt || a.updatedAt)?.getTime?.() ?? 0
      const bTs = (b.createdAt || b.startedAt || b.updatedAt)?.getTime?.() ?? 0
      return bTs - aTs
    })
    return { data, error: null }
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function fetchUserRawDoc(userId: string): Promise<Record<string, unknown> | null> {
  if (!userId) return null
  const db = getAdminDb()
  const doc = await db.collection("users").doc(userId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...doc.data() }
}

// ============= ONBOARDING ANALYTICS =============

/** Mutable count accumulator: stored code -> running total. */
type Counter = Record<string, number>

/** Increment the counter for a single string value (ignores blanks). */
function tally(counter: Counter, value: unknown): void {
  if (typeof value !== "string") return
  const v = value.trim()
  if (!v) return
  counter[v] = (counter[v] || 0) + 1
}

/**
 * Count a selection field that may be stored as a single string (single-select
 * steps, e.g. appExpectationsV2) or an array (multi-select steps). Non-string
 * items are skipped. This tolerance avoids miscounts when a step's select-type
 * differs from what the field name suggests.
 */
function tallyAny(counter: Counter, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) tally(counter, item)
  } else {
    tally(counter, value)
  }
}

/**
 * Turn a counter into sorted `{ name, count }` slices, decoding each code to a
 * human label via the given map. `topN` keeps only the most common entries.
 */
function toSlices(counter: Counter, labels: Record<string, string>, topN?: number): CountSlice[] {
  const slices = Object.entries(counter)
    .map(([code, count]) => ({ name: labelize(labels, code), count }))
    .sort((a, b) => b.count - a.count)
  return topN ? slices.slice(0, topN) : slices
}

/**
 * Aggregate onboarding selections across the whole `users` collection.
 *
 * Reads only `registrationData` via select(), counts every tracked field
 * server-side, and returns compact, display-ready slices — the
 * client never downloads the user docs. Legacy (V3) and current (V4) field
 * names are coalesced so both cohorts are counted. Values are decoded to the
 * app's English labels; unknown / legacy free-text passes through readably.
 *
 * Note: onboarding fires no analytics events (the account is created only at
 * the end), so the funnel below is a field-presence proxy, not real step
 * tracking.
 */
export async function fetchOnboardingAnalytics(): Promise<OnboardingAnalytics> {
  const db = getAdminDb()
  const snapshot = await db.collection("users").select("registrationData").limit(20000).get()

  const totalUsers = snapshot.size
  let usersWithRegistration = 0

  // Intent
  const objective: Counter = {}
  const situation: Counter = {}
  const appExpectations: Counter = {}
  const trackingPriorities: Counter = {}
  const reminderPreferences: Counter = {}
  const cycleTrackingGoals: Counter = {}
  const mainSymptoms: Counter = {}
  const whatWeighsMost: Counter = {}
  const symptomTiming: Counter = {}
  // Profile
  const healthGoals: Counter = {}
  const lifeStage: Counter = {}
  const symptoms: Counter = {}
  const medicalConditions: Counter = {}
  const endoStatus: Counter = {}
  const endoTypes: Counter = {}
  const diagnosisYear: Counter = {}
  const periodsStatus: Counter = {}
  const periodFrequency: Counter = {}
  const periodSymptoms: Counter = {}
  const menstrualPain: Counter = {}
  // Demographics
  const country: Counter = {}
  const cities: Counter = {}
  const platform: Counter = {}

  // Funnel (field-presence proxy) + KPI helpers
  let hasHealthGoals = 0
  let hasSymptoms = 0
  let hasMedicalConditions = 0
  let hasEndoStatus = 0
  let hasPeriodInfo = 0
  let hasCity = 0
  let hasEndoYes = 0
  let notifYes = 0
  let notifNo = 0
  let ageSum = 0
  let ageCount = 0
  const ageBucketCounts = { "<18": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45+": 0 }

  const nonEmptyArray = (v: unknown) => Array.isArray(v) && v.length > 0

  for (const doc of snapshot.docs) {
    const reg = doc.data().registrationData as Record<string, unknown> | undefined
    if (!reg || typeof reg !== "object") continue
    usersWithRegistration++

    // ── Intent (single-select fields are strings, multi-select are arrays) ──
    tallyAny(objective, reg.primaryObjective)
    tallyAny(situation, reg.situationsConcerned)
    tallyAny(appExpectations, reg.appExpectationsV2)
    tallyAny(trackingPriorities, reg.trackingPriorities)
    tallyAny(reminderPreferences, reg.reminderPreferences)
    tallyAny(cycleTrackingGoals, reg.cycleTrackingGoals)
    tallyAny(mainSymptoms, reg.mainSymptoms)
    tallyAny(whatWeighsMost, reg.whatWeighsMost)
    tallyAny(symptomTiming, reg.symptomTiming)

    // ── Profile (coalesce legacy + V4 names) ───────────────────────────────
    tallyAny(healthGoals, reg.healthGoals ?? reg.appExpectations)
    tallyAny(lifeStage, reg.lifeStage)
    tallyAny(symptoms, reg.symptoms)
    tallyAny(medicalConditions, reg.medicalConditions ?? reg.healthConditions)
    tallyAny(endoStatus, reg.hasEndometriosis)
    tallyAny(endoTypes, reg.endometriosisTypes ?? reg.endoTypes)
    tally(diagnosisYear, reg.diagnosisYear == null ? undefined : String(reg.diagnosisYear))
    tallyAny(periodsStatus, reg.hasPeriods)
    tallyAny(periodFrequency, reg.periodFrequency)
    tallyAny(periodSymptoms, reg.periodSymptoms)
    if (reg.menstrualPain != null && reg.menstrualPain !== "") {
      tally(menstrualPain, `Level ${reg.menstrualPain}`)
    }

    // ── Demographics ────────────────────────────────────────────────────────
    tallyAny(country, reg.location)
    tallyAny(cities, reg.city)
    tally(platform, (reg.deviceInfo as Record<string, unknown> | undefined)?.platform)

    // ── Funnel + KPI tallies ──────────────────────────────────────────────
    if (nonEmptyArray(reg.healthGoals ?? reg.appExpectations)) hasHealthGoals++
    if (nonEmptyArray(reg.symptoms) || nonEmptyArray(reg.mainSymptoms)) hasSymptoms++
    if (nonEmptyArray(reg.medicalConditions ?? reg.healthConditions)) hasMedicalConditions++
    if (reg.hasEndometriosis) hasEndoStatus++
    if (reg.hasPeriods || reg.bleedingStatus) hasPeriodInfo++
    if (typeof reg.city === "string" && reg.city.trim()) hasCity++
    if (reg.hasEndometriosis === "yes") hasEndoYes++

    const notif = (reg.preferences as Record<string, unknown> | undefined)?.notifications
    if (notif === true) notifYes++
    else if (notif === false) notifNo++

    const rawAge = reg.age
    const age =
      typeof rawAge === "number"
        ? rawAge
        : typeof rawAge === "string" && rawAge.trim()
          ? parseInt(rawAge, 10)
          : NaN
    if (Number.isFinite(age) && age > 0 && age < 120) {
      ageSum += age
      ageCount++
      if (age < 18) ageBucketCounts["<18"]++
      else if (age <= 24) ageBucketCounts["18-24"]++
      else if (age <= 34) ageBucketCounts["25-34"]++
      else if (age <= 44) ageBucketCounts["35-44"]++
      else ageBucketCounts["45+"]++
    }
  }

  const completionRate =
    totalUsers > 0 ? Math.round((usersWithRegistration / totalUsers) * 100) : 0
  const hasEndoPercent =
    usersWithRegistration > 0 ? Math.round((hasEndoYes / usersWithRegistration) * 100) : 0

  // Diagnosis year reads best chronologically rather than by frequency.
  const diagnosisYearSlices = Object.entries(diagnosisYear)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Menstrual pain (Level 0..4) reads best in order.
  const menstrualPainSlices = Object.entries(menstrualPain)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    totalUsers,
    usersWithRegistration,
    completionRate,
    avgAge: ageCount > 0 ? Math.round(ageSum / ageCount) : 0,
    hasEndoPercent,
    funnel: [
      { name: "Account Created", value: totalUsers },
      { name: "Registration Data", value: usersWithRegistration },
      { name: "Health Goals", value: hasHealthGoals },
      { name: "Symptoms", value: hasSymptoms },
      { name: "Medical Conditions", value: hasMedicalConditions },
      { name: "Endo Status", value: hasEndoStatus },
      { name: "Period Info", value: hasPeriodInfo },
      { name: "City & Location", value: hasCity },
    ],

    objective: toSlices(objective, PRIMARY_OBJECTIVE_LABELS),
    situation: toSlices(situation, SITUATION_LABELS),
    appExpectations: toSlices(appExpectations, APP_EXPECTATIONS_V2_LABELS),
    trackingPriorities: toSlices(trackingPriorities, TRACKING_PRIORITIES_LABELS),
    reminderPreferences: toSlices(reminderPreferences, REMINDER_PREFERENCES_LABELS),
    cycleTrackingGoals: toSlices(cycleTrackingGoals, CYCLE_TRACKING_GOALS_LABELS),
    mainSymptoms: toSlices(mainSymptoms, MAIN_SYMPTOMS_LABELS, 12),
    whatWeighsMost: toSlices(whatWeighsMost, WHAT_WEIGHS_MOST_LABELS, 12),
    symptomTiming: toSlices(symptomTiming, SYMPTOM_TIMING_LABELS, 12),

    healthGoals: toSlices(healthGoals, {}, 12),
    lifeStage: toSlices(lifeStage, LIFE_STAGE_LABELS),
    symptoms: toSlices(symptoms, {}, 12),
    medicalConditions: toSlices(medicalConditions, {}, 12),
    endoStatus: toSlices(endoStatus, HAS_ENDOMETRIOSIS_LABELS),
    endoTypes: toSlices(endoTypes, ENDO_TYPES_LABELS, 10),
    diagnosisYear: diagnosisYearSlices,
    periodsStatus: toSlices(periodsStatus, {}),
    periodFrequency: toSlices(periodFrequency, PERIOD_FREQUENCY_LABELS).filter(
      (s) => s.name && s.name !== "Unknown",
    ),
    periodSymptoms: toSlices(periodSymptoms, {}, 12),
    menstrualPain: menstrualPainSlices,

    ageBuckets: Object.entries(ageBucketCounts).map(([name, count]) => ({ name, count })),
    country: toSlices(country, {}, 10),
    topCities: toSlices(cities, {}, 15),
    platform: toSlices(platform, {}),
    notifications: [
      { name: "Enabled", count: notifYes },
      { name: "Disabled", count: notifNo },
      { name: "Unknown", count: Math.max(0, usersWithRegistration - notifYes - notifNo) },
    ],

    generatedAt: new Date().toISOString(),
  }
}
