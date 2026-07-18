"use client"

import { getFirebaseAuth } from "./firebase"
import type {
  AcquisitionMetrics,
  ContactChannel,
  ContactEntry,
  OnboardingAnalytics,
  UserContactSummary,
} from "./types"

async function getAuthToken(): Promise<string> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new Error("Not authenticated")
  return user.getIdToken()
}

async function apiFetch<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const token = await getAuthToken()

  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, value)
    })
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || `API error: ${response.status}`)
  }

  return response.json()
}

// POST twin of apiFetch (JSON body, same auth + error handling).
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAuthToken()

  const response = await fetch(new URL(path, window.location.origin).toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(errorBody.error || `API error: ${response.status}`)
  }

  return response.json()
}

// DELETE twin of apiPost (no body).
async function apiDelete<T>(path: string): Promise<T> {
  const token = await getAuthToken()

  const response = await fetch(new URL(path, window.location.origin).toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(errorBody.error || `API error: ${response.status}`)
  }

  return response.json()
}

// ============= Users =============

export async function fetchUsers(options: {
  limitCount?: number
  search?: string
  startAfter?: string
  from?: string
  to?: string
  platform?: "ios" | "android"
  premium?: boolean
  contacted?: boolean
  churned?: boolean
  inactive?: boolean
}): Promise<{ data: any[]; hasMore: boolean; lastCreatedAt?: string }> {
  const result = await apiFetch<any>("/api/users", {
    limit: options.limitCount?.toString(),
    search: options.search,
    startAfter: options.startAfter,
    from: options.from,
    to: options.to,
    platform: options.platform,
    premium: options.premium === undefined ? undefined : String(options.premium),
    contacted: options.contacted === undefined ? undefined : String(options.contacted),
    churned: options.churned ? "true" : undefined,
    inactive: options.inactive ? "true" : undefined,
  })
  return {
    data: (result.data || []).map((u: any) => ({
      ...u,
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
    })),
    hasMore: result.hasMore,
    lastCreatedAt: result.lastCreatedAt,
  }
}

export async function fetchUserById(userId: string) {
  const result = await apiFetch<any>(`/api/users/${userId}`)
  return result.data
}

// ============= Admin outreach (relances) =============

function reviveSummary(raw: any): UserContactSummary | null {
  if (!raw) return null
  return { ...raw, lastContactedAt: new Date(raw.lastContactedAt) }
}

function reviveEntry(raw: any): ContactEntry {
  return { ...raw, contactedAt: new Date(raw.contactedAt), createdAt: new Date(raw.createdAt) }
}

export async function fetchContactsForUsers(
  userIds: string[],
): Promise<Record<string, UserContactSummary | null>> {
  if (userIds.length === 0) return {}
  const result = await apiFetch<{ data: Record<string, any> }>("/api/users/contacts", {
    userIds: userIds.join(","),
  })
  return Object.fromEntries(
    Object.entries(result.data || {}).map(([id, raw]) => [id, reviveSummary(raw)]),
  )
}

export async function fetchUserContacts(
  userId: string,
): Promise<{ data: ContactEntry[]; error: string | null }> {
  const result = await apiFetch<{ data: any[]; error: string | null }>(
    `/api/users/${userId}/contacts`,
  )
  return { data: (result.data || []).map(reviveEntry), error: result.error ?? null }
}

export async function addUserContact(
  userId: string,
  input: { channel: ContactChannel; note: string; contactedAt?: string },
): Promise<{ entry: ContactEntry; summary: UserContactSummary }> {
  const result = await apiPost<{ data: { entry: any; summary: any } }>(
    `/api/users/${userId}/contacts`,
    input,
  )
  return {
    entry: reviveEntry(result.data.entry),
    summary: reviveSummary(result.data.summary)!,
  }
}

export async function deleteUserContact(
  userId: string,
  entryId: string,
): Promise<{ summary: UserContactSummary | null }> {
  const result = await apiDelete<{ data: { summary: any } }>(
    `/api/users/${userId}/contacts/${entryId}`,
  )
  return { summary: reviveSummary(result.data.summary) }
}

export interface ConversationInsights {
  summary: string
  bestConversation: { conversationId: string; userId: string; reason: string } | null
  // Unit = conversation (a userId may repeat); deduped by conversationId, ≤ 30.
  interestingConversations: { conversationId: string; userId: string; reason: string }[]
  meta: {
    conversationsAnalyzed: number
    onboardingExcluded: number
    truncated: boolean
    hallucinationsFiltered: number
  }
}

export async function generateConversationInsights(): Promise<ConversationInsights> {
  const result = await apiPost<{ data: ConversationInsights }>("/api/users/conversation-insights", {})
  return result.data
}

export interface Citation {
  conversationId: string
  messageId: string
  userId: string
  snippet: string
  reason: string
}

export interface AskResult {
  answer: string
  // Each citation has been verified server-side against the analyzed corpus, so
  // its (conversationId, messageId) deep-link always points to a real message.
  citations: Citation[]
  meta: {
    conversationsAnalyzed: number
    onboardingExcluded: number
    truncated: boolean
    hallucinationsFiltered: number
  }
}

export async function askConversations(question: string): Promise<AskResult> {
  const result = await apiPost<{ data: AskResult }>("/api/conversations/ask", { question })
  return result.data
}

export async function fetchTotalUserCount(): Promise<number> {
  const result = await apiFetch<{ count: number }>("/api/users/count")
  return result.count
}

export async function fetchActivityMetrics(opts: {
  from: string
  to: string
}): Promise<{ avgDau: number; wau: number; mau: number; stickiness: number }> {
  const result = await apiFetch<{ data: { avgDau: number; wau: number; mau: number; stickiness: number } }>(
    "/api/metrics/activity",
    { from: opts.from, to: opts.to },
  )
  return result.data
}

export async function fetchAvgAge(): Promise<{ avgAge: number; sampleSize: number }> {
  const result = await apiFetch<{ data: { avgAge: number; sampleSize: number } }>("/api/metrics/avg-age")
  return result.data
}

export async function fetchOnboardingAnalytics(): Promise<OnboardingAnalytics> {
  const result = await apiFetch<{ data: OnboardingAnalytics }>("/api/metrics/onboarding")
  return result.data
}

export async function fetchAcquisitionMetrics(opts: {
  from: string
  to: string
}): Promise<AcquisitionMetrics> {
  const result = await apiFetch<{ data: AcquisitionMetrics }>("/api/metrics/acquisition", {
    from: opts.from,
    to: opts.to,
  })
  return result.data
}

export async function fetchDailySignups(opts: {
  from: string
  to: string
}): Promise<Array<{ date: string; count: number }>> {
  const result = await apiFetch<{ data: Array<{ date: string; count: number }> }>(
    "/api/metrics/daily-signups",
    { from: opts.from, to: opts.to },
  )
  return result.data
}

export async function fetchMonthlySignups(): Promise<Array<{ month: string; count: number }>> {
  const result = await apiFetch<{ data: Array<{ month: string; count: number }> }>(
    "/api/metrics/monthly-signups",
  )
  return result.data
}

export interface Ga4ActivityMetricsResponse {
  active1Day: number
  active7Day: number
  active28Day: number
  stickiness: number
  asOfDate: string
}

// Returns null when GA4 is unavailable (not configured, missing permissions,
// API not enabled). The caller can then fall back to legacy metrics.
export async function fetchGa4ActivityMetrics(): Promise<Ga4ActivityMetricsResponse | null> {
  try {
    const result = await apiFetch<{ data: Ga4ActivityMetricsResponse }>("/api/metrics/ga4-activity")
    return result.data
  } catch {
    return null
  }
}

export interface Ga4DailyActivityRow {
  date: string
  dau: number
  sessions: number
  newUsers: number
}

export async function fetchGa4DailyActivity(opts: {
  from: string
  to: string
}): Promise<Ga4DailyActivityRow[] | null> {
  try {
    const result = await apiFetch<{ data: Ga4DailyActivityRow[] }>("/api/metrics/ga4-daily", {
      from: opts.from,
      to: opts.to,
    })
    return result.data
  } catch {
    return null
  }
}

function reviveDates<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const out: any = { ...obj }
  for (const key of keys) {
    if (out[key]) out[key] = new Date(out[key])
  }
  return out
}

export interface UserFullProfile {
  user: any
  raw: { userDoc: Record<string, unknown> | null }
  sections: {
    trackingEntries: { data: any[]; error: string | null }
    trackingSessions: { data: any[]; error: string | null }
    conversations: { data: any[]; error: string | null }
    photos: { data: any[]; error: string | null }
    appEvents: { data: any[]; error: string | null }
    bubbleEvents: { data: any[]; error: string | null }
    routines: { data: any[]; error: string | null }
    foodTrials: { data: any[]; error: string | null }
    lastActivity: { data: { timestamp: Date; type: string; description: string } | null; error: string | null }
  }
}

export async function fetchUserFullProfile(userId: string): Promise<UserFullProfile> {
  const result = await apiFetch<any>(`/api/users/${userId}/full`)
  const d = result.data

  const user = d.user
    ? reviveDates(d.user, ["createdAt", "updatedAt", "onboardingCompletedAt"])
    : d.user
  if (user?.metadata) {
    user.metadata = reviveDates(user.metadata, [
      "lastLoginAt",
      "lastLoginDate",
      "accountCreatedDate",
    ])
  }

  const wrap = (section: any, dateKeys: string[]) => ({
    data: (section?.data || []).map((row: any) => reviveDates(row, dateKeys)),
    error: section?.error ?? null,
  })

  return {
    user,
    raw: { userDoc: d.raw?.userDoc ?? null },
    sections: {
      trackingEntries: wrap(d.sections?.trackingEntries, ["createdAt", "updatedAt"]),
      trackingSessions: wrap(d.sections?.trackingSessions, [
        "startedAt",
        "completedAt",
        "createdAt",
      ]),
      conversations: wrap(d.sections?.conversations, [
        "createdAt",
        "updatedAt",
        "startedAt",
        "lastMessageAt",
      ]),
      photos: wrap(d.sections?.photos, ["timestamp", "createdAt"]),
      appEvents: wrap(d.sections?.appEvents, ["createdAt"]),
      bubbleEvents: wrap(d.sections?.bubbleEvents, ["createdAt"]),
      routines: wrap(d.sections?.routines, ["createdAt", "updatedAt", "lastUsed"]),
      foodTrials: wrap(d.sections?.foodTrials, ["createdAt", "startedAt", "endedAt", "updatedAt"]),
      lastActivity: {
        data: d.sections?.lastActivity?.data
          ? {
              ...d.sections.lastActivity.data,
              timestamp: new Date(d.sections.lastActivity.data.timestamp),
            }
          : null,
        error: d.sections?.lastActivity?.error ?? null,
      },
    },
  }
}

// ============= User activities =============

export async function fetchLastLoginsForUsers(userIds: string[]): Promise<Record<string, Date | null>> {
  if (userIds.length === 0) return {}
  const result = await apiFetch<any>("/api/users/activities", {
    userIds: userIds.join(","),
    mode: "logins",
  })
  // Convert date strings back to Date objects
  const data: Record<string, Date | null> = {}
  for (const [key, value] of Object.entries(result.data)) {
    data[key] = value ? new Date(value as string) : null
  }
  return data
}

export async function fetchLastActivitiesForUsers(
  userIds: string[],
): Promise<Record<string, { timestamp: Date; type: string; description: string } | null>> {
  if (userIds.length === 0) return {}
  const result = await apiFetch<any>("/api/users/activities", {
    userIds: userIds.join(","),
    mode: "activities",
  })
  const data: Record<string, any> = {}
  for (const [key, value] of Object.entries(result.data)) {
    if (value && (value as any).timestamp) {
      data[key] = { ...(value as any), timestamp: new Date((value as any).timestamp) }
    } else {
      data[key] = null
    }
  }
  return data
}

export async function fetchUserDailySessionTimes(
  userIds: string[],
): Promise<Record<string, { avgDailyTimeMinutes: number; totalSessions: number }>> {
  if (userIds.length === 0) return {}
  const result = await apiFetch<any>("/api/users/sessions", {
    userIds: userIds.join(","),
  })
  return result.data
}

// ============= User chats =============

export async function checkUserHasChats(userId: string): Promise<boolean> {
  const result = await apiFetch<any>("/api/users/chats", {
    userId,
    mode: "check",
  })
  return result.data
}

export async function fetchUserChatSessions(userId: string) {
  const result = await apiFetch<any>("/api/users/chats", {
    userId,
    mode: "sessions",
  })
  // Convert date strings back to Date objects
  return (result.data || []).map((session: any) => ({
    ...session,
    createdAt: session.createdAt ? new Date(session.createdAt) : new Date(),
    updatedAt: session.updatedAt ? new Date(session.updatedAt) : new Date(),
    startedAt: session.startedAt ? new Date(session.startedAt) : undefined,
    lastMessageAt: session.lastMessageAt ? new Date(session.lastMessageAt) : undefined,
  }))
}

export async function fetchChatSessionMessages(conversationId: string) {
  const result = await apiFetch<any>("/api/users/chats", {
    userId: "_", // not used in messages mode
    mode: "messages",
    conversationId,
  })
  return (result.data || []).map((msg: any) => ({
    ...msg,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
  }))
}

// ============= Sessions & Activity =============

export async function fetchSessionsForActivity(from: string, to: string) {
  const result = await apiFetch<any>("/api/sessions", { from, to })
  return (result.data || []).map((s: any) => ({
    ...s,
    startedAt: s.startedAt ? new Date(s.startedAt) : new Date(),
  }))
}

// ============= Conversations =============

export async function fetchConversations(options: {
  from?: string
  to?: string
  limitCount?: number
}): Promise<{ data: any[]; hasMore: boolean }> {
  const result = await apiFetch<any>("/api/chats", {
    from: options.from,
    to: options.to,
    limit: options.limitCount?.toString(),
    mode: "list",
  })
  return {
    data: (result.data || []).map((c: any) => ({
      ...c,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    })),
    hasMore: result.hasMore,
  }
}

export async function fetchChatConversations(dateRange?: { from?: string; to?: string }) {
  const result = await apiFetch<any>("/api/chats", {
    from: dateRange?.from,
    to: dateRange?.to,
    mode: "analytics",
  })
  return {
    conversations: (result.data || []).map((c: any) => ({
      ...c,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    })),
    totalMessages: result.totalMessages || 0,
  }
}

export async function fetchConversationData(conversationId: string) {
  const result = await apiFetch<any>(`/api/chats/${conversationId}/messages`)
  const conversation = result.conversation
    ? {
        ...result.conversation,
        createdAt: new Date(result.conversation.createdAt),
        updatedAt: new Date(result.conversation.updatedAt),
      }
    : null
  const messages = (result.messages || []).map((msg: any) => ({
    ...msg,
    createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
  }))
  return { conversation, messages }
}

// ============= Events =============

export async function fetchAppEvents(options: {
  from: string
  to: string
  name?: string
  platform?: string
  version?: string
  limitCount?: number
}): Promise<{ data: any[]; hasMore: boolean }> {
  const result = await apiFetch<any>("/api/events/app", {
    from: options.from,
    to: options.to,
    name: options.name,
    platform: options.platform,
    version: options.version,
    limit: options.limitCount?.toString(),
  })
  return {
    data: (result.data || []).map((e: any) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    })),
    hasMore: result.hasMore,
  }
}

export async function fetchBubbleEvents(options: {
  from: string
  to: string
  event?: string
  screen?: string
  limitCount?: number
}): Promise<{ data: any[]; hasMore: boolean }> {
  const result = await apiFetch<any>("/api/events/bubbles", {
    from: options.from,
    to: options.to,
    event: options.event,
    screen: options.screen,
    limit: options.limitCount?.toString(),
  })
  return {
    data: (result.data || []).map((e: any) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    })),
    hasMore: result.hasMore,
  }
}

// ============= Tracking =============

export async function fetchTrackingMetrics(dateRange: { from: string; to: string }) {
  const result = await apiFetch<any>("/api/tracking", {
    from: dateRange.from,
    to: dateRange.to,
    mode: "metrics",
  })
  return result.data
}

export async function fetchTrackingEntries(options: {
  from: string
  to: string
  userId?: string
  limitCount?: number
}): Promise<{ data: any[]; hasMore: boolean }> {
  const result = await apiFetch<any>("/api/tracking", {
    from: options.from,
    to: options.to,
    mode: "entries",
    userId: options.userId,
    limit: options.limitCount?.toString(),
  })
  return {
    data: (result.data || []).map((e: any) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
    })),
    hasMore: result.hasMore,
  }
}

// ============= Photos =============

export async function fetchPhotos(from?: string, to?: string) {
  const result = await apiFetch<any>("/api/photos", { from, to })
  return (result.data || []).map((p: any) => ({
    ...p,
    timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
  }))
}

export async function fetchPhotoCount(options?: {
  from?: string
  to?: string
  time?: "morning" | "evening"
  bloated?: boolean
}): Promise<number> {
  const result = await apiFetch<{ count: number }>("/api/photos/count", {
    from: options?.from,
    to: options?.to,
    time: options?.time,
    bloated: options?.bloated === undefined ? undefined : String(options.bloated),
  })
  return result.count
}

// ============= Retention =============

export interface RetentionCurvePoint {
  week: number
  retentionPct: number
  retainedCount: number
}

export interface RetentionCurveResult {
  curve: RetentionCurvePoint[]
  cohortSize: number
  periodStart: string
  periodEnd: string
  error?: string
}

export async function calculateRetentionCurve(
  cohortStart: string,
  cohortEnd: string,
  maxWeeks?: number,
): Promise<RetentionCurveResult> {
  const result = await apiFetch<{ data: RetentionCurveResult }>("/api/retention", {
    cohortStart,
    cohortEnd,
    maxWeeks: maxWeeks?.toString(),
  })
  return result.data
}

// ============= Event date helpers =============

function mapEventDates(events: any[]): any[] {
  return (events || []).map((e: any) => ({
    ...e,
    createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
  }))
}

// ============= Tracking Behavior Events =============

export async function fetchTrackingBehaviorEvents(from: string, to: string): Promise<{
  started: any[]
  sectionSaved: any[]
  completed: any[]
}> {
  const result = await apiFetch<any>("/api/events/tracking-behavior", { from, to })
  return {
    started: mapEventDates(result.started),
    sectionSaved: mapEventDates(result.sectionSaved),
    completed: mapEventDates(result.completed),
  }
}

// ============= Endora AI Events =============

export async function fetchEndoraEvents(from: string, to: string): Promise<{
  sent: any[]
  received: any[]
  failed: any[]
  screenOpened: any[]
  conversationStarted: any[]
  limitReached: any[]
}> {
  const result = await apiFetch<any>("/api/events/endora", { from, to })
  return {
    sent: mapEventDates(result.sent),
    received: mapEventDates(result.received),
    failed: mapEventDates(result.failed),
    screenOpened: mapEventDates(result.screenOpened),
    conversationStarted: mapEventDates(result.conversationStarted),
    limitReached: mapEventDates(result.limitReached),
  }
}

// ============= Meal AI Events =============

export async function fetchMealAiEvents(from: string, to: string): Promise<{
  started: any[]
  completed: any[]
}> {
  const result = await apiFetch<any>("/api/events/meal-ai", { from, to })
  return {
    started: mapEventDates(result.started),
    completed: mapEventDates(result.completed),
  }
}

// ============= Routines =============

export async function fetchRoutines(from: string, to: string) {
  const result = await apiFetch<any>("/api/routines", { from, to })
  return (result.data || []).map((r: any) => ({
    ...r,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    lastUsed: r.lastUsed ? new Date(r.lastUsed) : undefined,
  }))
}
