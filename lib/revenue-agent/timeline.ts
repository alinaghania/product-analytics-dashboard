// Product timeline: hand-curated events + live App Store Connect data
// (releases, subscription price changes, intro offers / free trials).

import "server-only"
import { fetchAscPricing, fetchAscVersions } from "@/lib/app-store-connect"
import { TIMELINE_SEED, type TimelineEvent } from "./timeline-seed"
import { errorMessage } from "./rc-data"

// ASC data changes a few times a week; one fetch per 10 min per instance is
// plenty (pricing alone is ~10 requests).
const ASC_TTL_MS = 10 * 60 * 1000
let ascCache: { at: number; data: Promise<[PromiseSettledResult<AscVersions>, PromiseSettledResult<AscPricing>]> } | null = null
type AscVersions = Awaited<ReturnType<typeof fetchAscVersions>>
type AscPricing = Awaited<ReturnType<typeof fetchAscPricing>>

function ascData() {
  if (!ascCache || Date.now() - ascCache.at > ASC_TTL_MS) {
    ascCache = { at: Date.now(), data: Promise.allSettled([fetchAscVersions(), fetchAscPricing()]) }
  }
  return ascCache.data
}

export async function productTimeline(input: { start_date: string; end_date: string }) {
  const events: TimelineEvent[] = [...TIMELINE_SEED]
  const warnings: string[] = []
  const [versions, pricing] = await ascData()
  if (versions.status === "rejected" || pricing.status === "rejected") ascCache = null // retry next call

  if (versions.status === "fulfilled") {
    for (const v of versions.value) {
      events.push({ date: v.createdDate, type: "release", label: `Version ${v.version} (${v.state})`, source: "App Store Connect" })
    }
  } else warnings.push(`Releases App Store indisponibles : ${errorMessage(versions.reason)}`)

  let currentPrices: Record<string, string> | undefined
  if (pricing.status === "fulfilled") {
    currentPrices = {}
    const sorted = [...pricing.value.prices].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
    const previous = new Map<string, number>()
    for (const p of sorted) {
      const key = `${p.productId} ${p.territory}`
      const currency = p.territory === "USA" ? "$" : "€"
      if (p.startDate) {
        const before = previous.get(key)
        events.push({
          date: p.startDate,
          type: "price",
          label: `${p.productId} ${p.territory} : ${before ?? "?"} → ${p.price} ${currency}`,
          source: "App Store Connect",
        })
      }
      previous.set(key, p.price)
      if (!p.startDate || p.startDate <= new Date().toISOString().slice(0, 10)) {
        currentPrices[key] = `${p.price} ${currency}`
      }
    }
    const intro = new Set<string>()
    for (const o of pricing.value.introOffers) {
      if (!o.startDate || intro.has(o.startDate + o.duration)) continue
      intro.add(o.startDate + o.duration)
      events.push({ date: o.startDate, type: "paywall", label: `Offre d'intro ${o.mode} ${o.duration}`, source: "App Store Connect" })
    }
  } else warnings.push(`Prix App Store indisponibles : ${errorMessage(pricing.reason)}`)

  return {
    events: events
      .filter((e) => e.date >= input.start_date && e.date <= input.end_date)
      .sort((a, b) => a.date.localeCompare(b.date)),
    currentPrices,
    note: "Date de release = création de la version dans App Store Connect (≈ soumission, mise en ligne 1-3 j après).",
    warnings,
  }
}

/** Current customer price of a product in a territory (App Store Connect, cached). */
export async function currentAscPrice(productId: string, territory: string): Promise<number | null> {
  const [, pricing] = await ascData()
  if (pricing.status !== "fulfilled") return null
  const today = new Date().toISOString().slice(0, 10)
  const applicable = pricing.value.prices
    .filter((p) => p.productId === productId && p.territory === territory && (!p.startDate || p.startDate <= today))
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
  return applicable.length ? applicable[applicable.length - 1].price : null
}
