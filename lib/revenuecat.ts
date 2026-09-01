// Server-side RevenueCat API v2 client — only ever imported from API routes.
// Requires REVENUECAT_API_KEY (v2 secret key, "sk_…"). REVENUECAT_PROJECT_ID is
// optional: when absent the project is auto-discovered via GET /projects, which
// needs the `project_configuration:projects:read` permission on the key.

import "server-only"
import { format, subMonths } from "date-fns"
import type { RevenueCatMetricsSummary } from "./types"

const BASE_URL = "https://api.revenuecat.com/v2"

/** Conversion window for the new → paying rate ("0_days" … "30_days", "unbounded"). */
const CONVERSION_TIMEFRAME = "30_days"
const CONVERSION_TIMEFRAME_LABEL = "30 jours"

/**
 * Realized-LTV window for the ARPPU (RevenueCat `customer_lifetime` selector).
 * "3_months" matches the horizon the team's campaign doc recommends.
 */
const ARPPU_LIFETIME = "3_months"
/** How many monthly cohorts to aggregate for the ARPPU (ending at the requested month). */
const ARPPU_COHORT_MONTHS = 6

/**
 * Configuration problem (missing key/permission/project) whose message is safe
 * and useful to show in the dashboard UI — API routes surface it as-is.
 */
export class RevenueCatConfigError extends Error {}

async function rcFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const apiKey = process.env.REVENUECAT_API_KEY
  if (!apiKey) throw new Error("REVENUECAT_API_KEY is not set")

  const url = new URL(BASE_URL + path)
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    if (response.status === 401 || response.status === 403) {
      // RevenueCat's error JSON has a clean human "message" (e.g. which
      // permission is missing) — safe to surface, unlike the raw body.
      let detail = ""
      try {
        detail = (JSON.parse(body) as { message?: string }).message ?? ""
      } catch {}
      throw new RevenueCatConfigError(
        `RevenueCat (${path}) : ${detail || "clé API invalide ou permission manquante"}`,
      )
    }
    throw new Error(`RevenueCat ${path} → ${response.status}: ${body.slice(0, 300)}`)
  }

  return response.json() as Promise<T>
}

let cachedProjectId: string | null = null

async function getProjectId(): Promise<string> {
  const fromEnv = process.env.REVENUECAT_PROJECT_ID
  if (fromEnv) return fromEnv
  if (cachedProjectId) return cachedProjectId

  let list: { items?: Array<{ id: string }> }
  try {
    list = await rcFetch<{ items?: Array<{ id: string }> }>("/projects", { limit: "1" })
  } catch (error) {
    throw new RevenueCatConfigError(
      "Projet RevenueCat introuvable : ajoutez REVENUECAT_PROJECT_ID au .env (visible dans l'URL " +
        "du dashboard RevenueCat, app.revenuecat.com/projects/…) ou donnez à la clé API la " +
        `permission project_configuration:projects:read. (${error instanceof Error ? error.message : error})`,
    )
  }
  const id = list.items?.[0]?.id
  if (!id) {
    throw new RevenueCatConfigError(
      "Aucun projet RevenueCat visible avec cette clé — définissez REVENUECAT_PROJECT_ID",
    )
  }
  cachedProjectId = id
  return id
}

// Observed chart_data row shape (realtime/v3 charts): one object per
// (cohort, measure) pair, `measure` indexing into the chart's `measures` array.
interface ChartRow {
  cohort?: number
  incomplete?: boolean
  measure?: number
  value?: number
}

interface ChartData {
  values?: unknown
  summary?: unknown
}

function chartRows(chart: ChartData): ChartRow[] {
  if (!Array.isArray(chart.values)) return []
  return chart.values.filter(
    (row): row is ChartRow => !!row && typeof row === "object" && !Array.isArray(row),
  )
}

/** Last data point of a given measure — with a one-month range there is exactly one. */
function measureValue(
  chart: ChartData,
  measureIndex: number,
): { value: number; incomplete: boolean } | null {
  const rows = chartRows(chart).filter(
    (row) => row.measure === measureIndex && typeof row.value === "number" && Number.isFinite(row.value),
  )
  if (rows.length === 0) return null
  const last = rows[rows.length - 1]
  return { value: last.value as number, incomplete: last.incomplete === true }
}

/**
 * Weighted realized LTV per paying customer over COMPLETE cohorts only
 * (Σ realized LTV / Σ paying customers) — incomplete cohorts would understate
 * the LTV. Measures: 0 = New Paying Customers, 1 = Realized LTV, 2 = ratio.
 */
function extractGrossArppu(chart: ChartData): { arppu: number; paying: number } | null {
  const byCohort = new Map<number, { paying?: number; ltv?: number; incomplete: boolean }>()
  for (const row of chartRows(chart)) {
    if (typeof row.cohort !== "number" || typeof row.value !== "number") continue
    const entry = byCohort.get(row.cohort) ?? { incomplete: false }
    if (row.incomplete) entry.incomplete = true
    if (row.measure === 0) entry.paying = row.value
    if (row.measure === 1) entry.ltv = row.value
    byCohort.set(row.cohort, entry)
  }

  const complete = [...byCohort.values()].filter(
    (c) => !c.incomplete && c.paying !== undefined && c.ltv !== undefined,
  )
  const paying = complete.reduce((sum, c) => sum + (c.paying ?? 0), 0)
  const ltv = complete.reduce((sum, c) => sum + (c.ltv ?? 0), 0)
  return paying > 0 ? { arppu: ltv / paying, paying: Math.round(paying) } : null
}

/**
 * One calendar month of RevenueCat data for the campaign calculator:
 * - net revenue (proceeds) of the month, for context;
 * - conversion new → paying within CONVERSION_TIMEFRAME (≈ taux installation → payante);
 * - ARPPU net: realized LTV per paying customer (ARPPU_LIFETIME window) over the
 *   last ARPPU_COHORT_MONTHS complete cohorts — the metric RevenueCat documents
 *   as the one to compare against acquisition cost. The chart is gross of store
 *   commission/taxes, so it is scaled by the project's observed proceeds/gross ratio.
 */
export async function fetchRevenueCatMetrics(
  startDate: string,
  endDate: string,
): Promise<RevenueCatMetricsSummary> {
  const projectId = await getProjectId()
  const warnings: string[] = []
  const monthParams = { start_date: startDate, end_date: endDate, resolution: "2" }
  // Cohort window for the ARPPU: the requested month and the 5 before it.
  const cohortStart = format(subMonths(new Date(`${startDate}T00:00:00`), ARPPU_COHORT_MONTHS - 1), "yyyy-MM-dd")

  const revenuePromise = rcFetch<{ value: number; currency: string }>(
    `/projects/${projectId}/metrics/revenue`,
    { start_date: startDate, end_date: endDate, revenue_type: "proceeds", currency: "EUR" },
  )

  const conversionPromise = rcFetch<ChartData>(`/projects/${projectId}/charts/conversion_to_paying`, {
    ...monthParams,
    selectors: JSON.stringify({ conversion_timeframe: CONVERSION_TIMEFRAME }),
  }).then(
    (chart) => {
      // Measures: 0 = New Customers, 1 = Paying Customers (window), 2 = Conversion Rate (%).
      const newCustomers = measureValue(chart, 0)
      const payingCustomers = measureValue(chart, 1)
      const rate = measureValue(chart, 2)
      if (rate === null) {
        warnings.push("Taux installation → payante non extractible de la réponse RevenueCat")
      } else if (rate.incomplete) {
        warnings.push(`Fenêtre de conversion de ${CONVERSION_TIMEFRAME_LABEL} encore incomplète pour ce mois`)
      }
      return {
        newCustomers: newCustomers ? Math.round(newCustomers.value) : null,
        payingCustomers: payingCustomers ? Math.round(payingCustomers.value) : null,
        installToPaidPct: rate ? rate.value : null,
      }
    },
    (error) => {
      console.error("[revenuecat] conversion_to_paying failed:", error)
      warnings.push(
        "Taux installation → payante indisponible côté RevenueCat" +
          (error instanceof RevenueCatConfigError ? ` (${error.message})` : ""),
      )
      return { newCustomers: null, payingCustomers: null, installToPaidPct: null }
    },
  )

  const grossArppuPromise = rcFetch<ChartData>(`/projects/${projectId}/charts/ltv_per_paying_customer`, {
    start_date: cohortStart,
    end_date: endDate,
    resolution: "2",
    currency: "EUR",
    selectors: JSON.stringify({ customer_lifetime: ARPPU_LIFETIME }),
  }).then(
    (chart) => {
      const result = extractGrossArppu(chart)
      if (result === null) {
        warnings.push("Aucune cohorte complète avec des payantes pour la LTV — ARPU non pré-rempli")
      }
      return result
    },
    (error) => {
      console.error("[revenuecat] ltv_per_paying_customer failed:", error)
      warnings.push(
        "LTV par payante indisponible côté RevenueCat" +
          (error instanceof RevenueCatConfigError ? ` (${error.message})` : ""),
      )
      return null
    },
  )

  // Observed proceeds/gross ratio over the same cohort window, used to net the
  // gross LTV chart down (RevenueCat documents that chart as pre-commission/tax).
  const netRatioPromise = Promise.all([
    rcFetch<{ value: number }>(`/projects/${projectId}/metrics/revenue`, {
      start_date: cohortStart,
      end_date: endDate,
      revenue_type: "revenue",
      currency: "EUR",
    }),
    rcFetch<{ value: number }>(`/projects/${projectId}/metrics/revenue`, {
      start_date: cohortStart,
      end_date: endDate,
      revenue_type: "proceeds",
      currency: "EUR",
    }),
  ]).then(
    ([gross, proceeds]) =>
      Number.isFinite(gross.value) && Number.isFinite(proceeds.value) && gross.value > 0
        ? proceeds.value / gross.value
        : null,
    (error) => {
      console.error("[revenuecat] net ratio failed:", error)
      return null
    },
  )

  const [revenue, conversion, grossArppu, netRatio] = await Promise.all([
    revenuePromise,
    conversionPromise,
    grossArppuPromise,
    netRatioPromise,
  ])

  if (!Number.isFinite(revenue.value)) {
    throw new RevenueCatConfigError("Réponse RevenueCat inattendue : montant de revenu manquant")
  }
  if (grossArppu !== null && netRatio === null) {
    warnings.push("Ratio net/brut indisponible — LTV par payante laissée en brut")
  }

  const round2 = (v: number) => Math.round(v * 100) / 100

  return {
    startDate,
    endDate,
    currency: revenue.currency,
    netRevenue: round2(revenue.value),
    arppu: grossArppu === null ? null : round2(grossArppu.arppu * (netRatio ?? 1)),
    arppuGross: grossArppu === null ? null : round2(grossArppu.arppu),
    arppuPayingCustomers: grossArppu?.paying ?? null,
    arppuLifetime: ARPPU_LIFETIME,
    netRatio,
    ...conversion,
    conversionTimeframe: CONVERSION_TIMEFRAME,
    warning: warnings.length > 0 ? warnings.join(" · ") : undefined,
  }
}
