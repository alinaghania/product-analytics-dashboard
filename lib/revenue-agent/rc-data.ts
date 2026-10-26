// RevenueCat chart access shared by the agent tools and analyses: chart
// catalogue, cached fetch (rate limit ~25 req/min) and window aggregation.

import "server-only"
import { getProjectId, rcFetch } from "@/lib/revenuecat"

/** Below this many people a comparison is noise — the tools say so. */
export const MIN_N = 20

export const RESOLUTION = { day: "0", week: "1", month: "2" } as const
export type Resolution = keyof typeof RESOLUTION

// Charts whose value is a level at a point in time (averaged over a window),
// as opposed to flows (summed over a window).
export const STOCK_CHARTS = new Set<(typeof CHARTS)[number]>(["mrr", "actives", "trials"])

export const CHARTS = [
  "mrr",
  "revenue",
  "actives",
  "actives_new",
  "churn",
  "customers_new",
  "trials",
  "trials_new",
  "trial_conversion",
  "conversion_to_paying",
  "initial_conversion",
  "refund_rate",
  "subscription_retention",
  "paywall_conversion",
  "paywall_encounter",
  "ltv_per_paying_customer",
] as const

export const SEGMENTS = [
  "first_country",
  "offering_identifier",
  "product_id",
  "product_duration",
  "first_app_version",
  "install_month",
  "store",
  "placement_id",
] as const

export const MAX_SEGMENTS = 6

// ── RevenueCat chart fetch + normalization ──────────────────────────────────

export interface RcMeasure {
  display_name: string
  unit?: string
}
export interface RcChart {
  display_name: string
  display_type: "default" | "cohort"
  measures: RcMeasure[] | null
  periods: { display_name: string }[] | null
  segments: { display_name: string; is_total?: boolean }[] | null
  values: Array<{
    cohort: number | string
    measure?: number
    segment?: number
    period?: number
    value: number
    incomplete?: boolean
  }>
  yaxis_currency?: string
  user_selectors?: Record<string, string> | null
}

// Per-instance cache: RevenueCat allows ~25 chart requests/min, and the agent
// often re-asks the same series across turns.
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000

export async function cachedRc<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = path + JSON.stringify(params)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.data as T
  let data: T
  try {
    data = await rcFetch<T>(path, params)
  } catch (error) {
    // One retry after the rate-limit window when RevenueCat says 429.
    if (!(error instanceof Error && error.message.includes("→ 429"))) throw error
    await new Promise((r) => setTimeout(r, 15_000))
    data = await rcFetch<T>(path, params)
  }
  // Evict stale entries so the module-level cache can't grow unbounded on a
  // long-lived server.
  for (const [k, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(k)
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

export const isoDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10)
export const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface ChartQuery {
  chart: (typeof CHARTS)[number]
  start_date: string
  end_date: string
  resolution: Resolution
  segment?: (typeof SEGMENTS)[number]
  filter?: { dimension: (typeof SEGMENTS)[number]; values: string[] }
  conversion_days?: number
}

export async function fetchChart(q: ChartQuery): Promise<RcChart> {
  const projectId = await getProjectId()
  const params: Record<string, string> = {
    start_date: q.start_date,
    end_date: q.end_date,
    resolution: RESOLUTION[q.resolution],
    currency: "EUR",
  }
  if (q.segment) params.segment = q.segment
  if (q.filter) params.filters = JSON.stringify([{ name: q.filter.dimension, values: q.filter.values }])
  if (q.conversion_days) params.selectors = JSON.stringify({ conversion_timeframe: `${q.conversion_days}_days` })
  return cachedRc<RcChart>(`/projects/${projectId}/charts/${q.chart}`, params)
}

/** One measure summed over [start, end], per segment display name ("" = no segment). */
export interface WindowSums {
  /** segment → measure display name → sum */
  values: Map<string, Record<string, number>>
  incomplete: boolean
}

/**
 * Sums a day-resolution series chart over a date window, per segment (the
 * "Total" segment is skipped). Rates (unit "%") are NOT summed — recompute
 * them from their numerator/denominator.
 */
export function sumWindow(chart: RcChart, start: string, end: string): WindowSums {
  const measures = chart.measures ?? []
  const segments = chart.segments ?? null
  const values = new Map<string, Record<string, number>>()
  let incomplete = false
  for (const v of chart.values) {
    const measure = measures[v.measure ?? 0]
    if (!measure || measure.unit === "%") continue
    const seg = segments && v.segment !== undefined ? segments[v.segment] : null
    if (seg?.is_total) continue
    const date = isoDay(Number(v.cohort))
    if (date < start || date > end) continue
    const name = seg?.display_name ?? ""
    const row = values.get(name) ?? {}
    row[measure.display_name] = (row[measure.display_name] ?? 0) + v.value
    values.set(name, row)
    if (v.incomplete) incomplete = true
  }
  return { values, incomplete }
}
