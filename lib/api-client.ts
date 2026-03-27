"use client"

import { getFirebaseAuth } from "./firebase"

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

// ============= Users =============

export async function fetchUsers(options: {
  limitCount?: number
  search?: string
  startAfter?: string
}): Promise<{ data: any[]; hasMore: boolean; lastCreatedAt?: string }> {
  const result = await apiFetch<any>("/api/users", {
    limit: options.limitCount?.toString(),
    search: options.search,
    startAfter: options.startAfter,
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

// ============= Retention =============

export async function calculateRetentionCurve(cohortStart: string, cohortEnd: string, maxDays?: number) {
  const result = await apiFetch<any>("/api/retention", {
    cohortStart,
    cohortEnd,
    maxDays: maxDays?.toString(),
  })
  return result.data
}

// ============= Feedback =============

export async function fetchFeedback(from: string, to: string): Promise<{
  positive: any[]
  negative: any[]
}> {
  const result = await apiFetch<any>("/api/feedback", { from, to })
  return {
    positive: (result.positive || []).map((e: any) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    })),
    negative: (result.negative || []).map((e: any) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    })),
  }
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
