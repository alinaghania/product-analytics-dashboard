// Firestore Document Types based on the collections

export interface User {
  id: string
  email: string
  username?: string
  displayName?: string // Added fallback field for last login
  createdAt: Date
  updatedAt: Date
  birthDate?: string // ISO date string
  metadata: {
    lastLoginAt?: Date
    lastLoginDate?: Date // Added fallback field for last login
    platform?: string
    appVersion?: string
    accountCreatedDate?: Date // Added fallback for created date
  }
  flags: {
    onboardingCompleted?: boolean
    registrationCompleted?: boolean
    registrationStep?: number
    profileCompletion?: number
  }
  subscriptionStatus?: {
    // Added subscription status for payment info
    isPremium?: boolean
    source?: string
  }
  registrationData?: {
    age?: string
    birthDate?: string
    email?: string
    name?: string
    firstName?: string
    lastName?: string
    username?: string
    deviceInfo?: {
      platform?: string
    }
    [key: string]: unknown
  }
}

export interface TrackingEntry {
  id: string
  userId: string
  date: string // userId_date format
  completeness: number
  entryMethod?: "manual" | "routine" | "auto"
  sections?: string[]
  symptoms?: string[]
  sleep?: {
    duration: number
    quality: number
  }
  meals?: {
    calories: number
    water: number
  }
  sport?: {
    totalDuration: number
    totalCalories: number
  }
  digestive?: {
    morningBloated?: number
    eveningBloated?: number
    morningPain?: number
    eveningPain?: number
    bloated?: number
    pain?: number
    time?: "morning" | "evening"
  }
  period?: {
    active: boolean
    pain: number
    flow: number
  }
  stress?: number
  createdAt: Date
  updatedAt: Date
}

export interface TrackingSession {
  id: string
  userId: string
  startedAt: Date
  completedAt?: Date
  durationMs: number
  sections: string[]
  entryPoint?: string
  hasExistingRecord: boolean
  entryMethod?: "manual" | "routine" | "auto"
  createdAt?: Date
}

export interface Photo {
  id: string
  userId: string
  pain: number
  bloated: number
  time: string
  viewCount: number
  createdAt: Date
}

export interface ChatConversation {
  id: string
  userId: string
  messageCount: number
  topics?: string[]
  topic?: string
  entryPoint?: string
  startedAt?: Date
  createdAt: Date
  updatedAt: Date
  lastMessageAt?: Date
  lastMessageSnippet?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system" | "endora"
  agent?: string
  content: string
  status?: "success" | "error" | "pending"
  errorMessage?: string
  latencyMs?: number
  retryCount?: number
  createdAt: Date
  createdAtMissing?: boolean
}

export interface AppEvent {
  id: string
  userId: string
  name: string
  screen?: string
  platform?: string
  appVersion?: string
  params?: Record<string, unknown>
  createdAt: Date
}

export interface BubbleEvent {
  id: string
  userId: string
  event: string
  screen?: string
  viewDurationMs?: number
  platform?: string
  appVersion?: string
  createdAt: Date
}

export interface LastActivity {
  timestamp: Date
  type: "tracking" | "photo" | "chat" | "session" | "event" | "bubble"
  description: string
}

// API Response Types
export interface ApiResponse<T> {
  data: T
  generatedAt: string
  sourceReadsEstimate?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  cursor?: string
  hasMore: boolean
  generatedAt: string
  sourceReadsEstimate?: number
}

// Metrics Types
export interface OverviewMetrics {
  dau: number
  wau: number
  mau: number
  newUsers: number
  returningUsers: number
  retention: {
    d1: number
    d7: number
    d30: number
  }
  sessions: {
    count: number
    avgDurationMs: number
  }
  onboardingCompleted: number
  registrationCompleted: number
  topEvents: Array<{ name: string; count: number }>
  dailyActiveUsers: Array<{ date: string; count: number }>
  platformShare: Array<{ platform: string; count: number }>
  appVersionShare: Array<{ version: string; count: number }>
}

export interface DateRange {
  from: string
  to: string
}

export interface TrackingMetrics {
  totalEntries: number
  totalSessions: number
  avgCompleteness: number
  avgSessionDuration: number
  completenessDistribution: Array<{ range: string; count: number }>
  entryMethodDistribution: Array<{ method: string; count: number }>
  topSymptoms: Array<{ name: string; count: number }>
  sleepMetrics: { avgDuration: number; avgQuality: number }
  digestiveMetrics: { avgBloated: number; avgPain: number }
  sportMetrics: { avgDuration: number }
  dailyEntries: Array<{ date: string; count: number }>
}

// Cohort Comparison Types
export interface CohortDefinition {
  id: string
  label: string
  startDate: string
  endDate: string
  color: string
}

export interface CohortRetentionData {
  cohort: CohortDefinition
  data: {
    curve: { day: number; retentionPct: number }[]
    cohortSize: number
    periodStart: string
    periodEnd: string
    error?: string
  }
}
