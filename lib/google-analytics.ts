import { BetaAnalyticsDataClient } from "@google-analytics/data"
import * as fs from "fs"
import * as path from "path"

let client: BetaAnalyticsDataClient | undefined

function getServiceAccountCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (envJson) {
    return JSON.parse(envJson)
  }
  const filePath = process.env.SERVICE_ACCOUNT_PATH
  if (filePath) {
    const resolved = path.resolve(filePath)
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, "utf-8"))
    }
  }
  throw new Error("No service account configured for Google Analytics")
}

export function getGa4Client(): BetaAnalyticsDataClient {
  if (client) return client
  const credentials = getServiceAccountCredentials()
  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  })
  return client
}

export function getGa4PropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID
  if (!id) {
    throw new Error("GA4_PROPERTY_ID env var is not set")
  }
  return id
}

export interface Ga4ActivityMetrics {
  // 1-day active users (Google's DAU as of "today")
  active1Day: number
  // 7-day active users (Google's WAU)
  active7Day: number
  // 28-day active users (Google's MAU — Google uses 28, not 30)
  active28Day: number
  // Stickiness ratio as a percentage (DAU / MAU * 100), rounded
  stickiness: number
  // Most recent date the data is computed for (YYYY-MM-DD)
  asOfDate: string
}

// Query GA4 for the standard activity KPIs in one runReport call.
export async function fetchGa4ActivityMetrics(): Promise<Ga4ActivityMetrics> {
  const ga4 = getGa4Client()
  const propertyId = getGa4PropertyId()

  // We ask for "yesterday" because GA4 publishes today's numbers throughout
  // the day but they aren't final until the next day. Using "yesterday" gives
  // a stable, fully-aggregated reading.
  const [response] = await ga4.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
    metrics: [
      { name: "active1DayUsers" },
      { name: "active7DayUsers" },
      { name: "active28DayUsers" },
      { name: "dauPerMau" },
    ],
  })

  const row = response.rows?.[0]
  const values = row?.metricValues?.map((m) => Number(m.value ?? 0)) || [0, 0, 0, 0]
  const [d1, d7, d28, dauPerMau] = values

  // GA4 returns dauPerMau as a fraction (0..1). Convert to percent and cap.
  const stickiness = dauPerMau > 0 ? Math.min(Math.round(dauPerMau * 100), 100) : 0

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const asOfDate = yesterday.toISOString().slice(0, 10)

  return {
    active1Day: d1 || 0,
    active7Day: d7 || 0,
    active28Day: d28 || 0,
    stickiness,
    asOfDate,
  }
}

export interface Ga4DailyActivityRow {
  date: string // YYYY-MM-DD
  dau: number
  sessions: number
  newUsers: number
}

// Daily DAU + sessions + new users over the given range. One GA4 runReport
// call returns everything needed for the Overview daily-activity chart and
// the daily signups chart, so we don't pay 2 round-trips.
export async function fetchGa4DailyActivity(options: {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}): Promise<Ga4DailyActivityRow[]> {
  const ga4 = getGa4Client()
  const propertyId = getGa4PropertyId()

  const [response] = await ga4.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: options.from, endDate: options.to }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "newUsers" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 365,
  })

  const rows = response.rows ?? []
  return rows.map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? ""
    // GA4 returns dates as "YYYYMMDD" — normalize to "YYYY-MM-DD" so the
    // existing chart components (which sort lexicographically) work as-is.
    const date =
      raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
    const dau = Number(row.metricValues?.[0]?.value ?? 0)
    const sessions = Number(row.metricValues?.[1]?.value ?? 0)
    const newUsers = Number(row.metricValues?.[2]?.value ?? 0)
    return { date, dau, sessions, newUsers }
  })
}
