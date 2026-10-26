// Deterministic cross-analyses. These do the "why did it change" and "is A
// better than B" work in code, so the model only narrates verdicts it was
// handed — it never ranks factors or judges significance itself.

import "server-only"
import { fetchAcquisitionConversion } from "@/lib/firestore-admin-queries"
import { fetchChart, MAX_SEGMENTS, round, sumWindow, type ChartQuery } from "./rc-data"
import { compareProportions, decomposeProduct, variationPct, type ProportionComparison } from "./stats"
import { productTimeline } from "./timeline"

interface Period {
  start: string
  end: string
}

const DAY_MS = 86_400_000
const CONVERSION_DAYS = 14
const days = (p: Period) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / DAY_MS) + 1
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

/** Fetches a day-resolution chart over a period and sums it (single segment). */
async function totals(chart: ChartQuery["chart"], p: Period, extra: Partial<ChartQuery> = {}) {
  const data = await fetchChart({ chart, start_date: p.start, end_date: p.end, resolution: "day", ...extra })
  const sums = sumWindow(data, p.start, p.end)
  return { sums: sums.values.get("") ?? {}, bySegment: sums.values, incomplete: sums.incomplete }
}

/** Measure value by name prefix (RevenueCat suffixes some names, e.g. "(7 days)"). */
function pick(sums: Record<string, number>, prefix: string): number {
  const key = Object.keys(sums).find((k) => k.startsWith(prefix))
  return key ? sums[key] : 0
}

// ── explain_change ──────────────────────────────────────────────────────────

/**
 * Why did revenue move between period A and period B? Decomposes the change
 * exactly (purchases × basket; signups × conversion), tests rate changes, lists
 * acquisition shifts and product events, and ranks factors by size — in code.
 */
export async function explainChange(input: { period_a: Period; period_b: Period }) {
  const warnings: string[] = []
  let a = input.period_a
  let b = input.period_b
  if (a.start > b.start) [a, b] = [b, a]

  // Equal lengths, otherwise every total is biased by the day count.
  const len = Math.min(days(a), days(b))
  const today = new Date().toISOString().slice(0, 10)
  if (days(a) !== days(b)) {
    a = { start: a.start, end: addDays(a.start, len - 1) }
    b = { start: b.start, end: addDays(b.start, len - 1) }
    warnings.push(`Périodes ramenées à ${len} jours chacune pour être comparables.`)
  }
  if (b.end > today) warnings.push("La période B n'est pas finie : chiffres provisoires.")

  // Sequential on purpose (RevenueCat ~25 chart requests/min).
  const revA = await totals("revenue", a)
  const revB = await totals("revenue", b)
  const mixA = await totals("revenue", a, { segment: "product_duration" })
  const mixB = await totals("revenue", b, { segment: "product_duration" })
  // 14 days, not 7: since 19/08/2026 a 7-day free trial delays the first
  // payment to day 8, so a 7-day window misses almost every trial conversion.
  const convA = await totals("conversion_to_paying", a, { conversion_days: CONVERSION_DAYS })
  const convB = await totals("conversion_to_paying", b, { conversion_days: CONVERSION_DAYS })
  const trialA = await totals("trial_conversion", a)
  const trialB = await totals("trial_conversion", b)
  if (convB.incomplete || trialB.incomplete) warnings.push("Conversions de la période B pas encore mûres (essais en cours) : provisoire.")

  // Revenue = purchases × average basket.
  const purchasesA = pick(revA.sums, "Transactions")
  const purchasesB = pick(revB.sums, "Transactions")
  const revenueA = pick(revA.sums, "Revenue")
  const revenueB = pick(revB.sums, "Revenue")
  const basketA = purchasesA ? revenueA / purchasesA : 0
  const basketB = purchasesB ? revenueB / purchasesB : 0
  const revenueSplit = decomposeProduct(purchasesA, basketA, purchasesB, basketB)

  // New payers (14 days) = new customers × conversion.
  const newA = pick(convA.sums, "New Customers")
  const newB = pick(convB.sums, "New Customers")
  const payA = pick(convA.sums, "Paying Customers")
  const payB = pick(convB.sums, "Paying Customers")
  const payersSplit = decomposeProduct(newA, newA ? payA / newA : 0, newB, newB ? payB / newB : 0)
  const conversion = compareProportions(payA, newA, payB, newB)
  const trialStart = compareProportions(pick(trialA.sums, "Started Trials"), pick(trialA.sums, "New Customers"), pick(trialB.sums, "Started Trials"), pick(trialB.sums, "New Customers"))
  const trialConv = compareProportions(pick(trialA.sums, "Converted Trials"), pick(trialA.sums, "Started Trials"), pick(trialB.sums, "Converted Trials"), pick(trialB.sums, "Started Trials"))

  const mix = (m: typeof mixA, duration: string) => ({
    revenu: round(pick(m.bySegment.get(duration) ?? {}, "Revenue")),
    achats: pick(m.bySegment.get(duration) ?? {}, "Transactions"),
  })
  const annualA = mix(mixA, "P1Y")
  const annualB = mix(mixB, "P1Y")

  // Acquisition shifts per source (Firestore).
  const [acqA, acqB] = await Promise.all([
    fetchAcquisitionConversion({ from: a.start, to: a.end }),
    fetchAcquisitionConversion({ from: b.start, to: b.end }),
  ])
  const signupsBySource = (rows: typeof acqA.rows) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.source, (m.get(r.source) ?? 0) + r.signups)
    return m
  }
  const srcA = signupsBySource(acqA.rows)
  const srcB = signupsBySource(acqB.rows)
  const sources = [...new Set([...srcA.keys(), ...srcB.keys()])]
    .map((source) => {
      const va = srcA.get(source) ?? 0
      const vb = srcB.get(source) ?? 0
      return { source, inscrites_a: va, inscrites_b: vb, variation: vb - va, variation_pct: variationPct(va, vb) }
    })
    .sort((x, y) => Math.abs(y.variation) - Math.abs(x.variation))

  const [eventsA, eventsB] = await Promise.all([
    productTimeline({ start_date: a.start, end_date: a.end }),
    productTimeline({ start_date: b.start, end_date: b.end }),
  ])

  // Factors ranked by size of change — the model must keep this order.
  const factor = (facteur: string, va: number, vb: number, verdict?: string) => ({
    facteur,
    a: round(va),
    b: round(vb),
    variation_pct: variationPct(va, vb),
    ...(verdict ? { verdict } : {}),
  })
  const facteurs = [
    factor("nouvelles clientes (RevenueCat)", newA, newB),
    factor("conversion en payante sous 14 j (%)", conversion.taux_a_pct ?? 0, conversion.taux_b_pct ?? 0, conversion.verdict),
    factor("démarrage d'essai (%)", trialStart.taux_a_pct ?? 0, trialStart.taux_b_pct ?? 0, trialStart.verdict),
    factor("essais convertis (%)", trialConv.taux_a_pct ?? 0, trialConv.taux_b_pct ?? 0, trialConv.verdict),
    factor("nombre d'achats", purchasesA, purchasesB),
    factor("panier moyen (€)", basketA, basketB),
    factor("achats annuels", annualA.achats, annualB.achats),
  ].sort((x, y) => Math.abs(y.variation_pct ?? 0) - Math.abs(x.variation_pct ?? 0))

  return {
    periode_a: a,
    periode_b: b,
    jours: len,
    revenu_brut: {
      a: round(revenueA),
      b: round(revenueB),
      variation: revenueSplit.variation,
      variation_pct: variationPct(revenueA, revenueB),
      // effet_nombre_achats + effet_panier_moyen = variation (exact).
      effet_nombre_achats: revenueSplit.effet_facteur1,
      effet_panier_moyen: revenueSplit.effet_facteur2,
      achats: { a: purchasesA, b: purchasesB },
      panier_moyen: { a: round(basketA), b: round(basketB) },
      annuels: { a: annualA, b: annualB },
      mensuels: { a: mix(mixA, "P1M"), b: mix(mixB, "P1M") },
    },
    nouvelles_payantes_14j: {
      a: payA,
      b: payB,
      variation: payersSplit.variation,
      // effet_nombre_inscrites + effet_conversion = variation (exact).
      effet_nombre_inscrites: payersSplit.effet_facteur1,
      effet_conversion: payersSplit.effet_facteur2,
      conversion,
    },
    essais: { demarrage: trialStart, conversion: trialConv },
    facteurs_classes: facteurs,
    acquisition_par_source: sources.slice(0, 6),
    evenements_periode_a: eventsA.events,
    evenements_periode_b: eventsB.events,
    note: "Revenu brut (avant commission Apple), achats = nouveaux abonnements + renouvellements.",
    warnings: [...warnings, ...eventsB.warnings],
  }
}

// ── compare_groups ──────────────────────────────────────────────────────────

const GROUP_RATES: Partial<Record<ChartQuery["chart"], { numerator: string; denominator: string }>> = {
  paywall_conversion: { numerator: "Initial Conversions", denominator: "Paywall Viewers" },
  conversion_to_paying: { numerator: "Paying Customers", denominator: "New Customers" },
  trial_conversion: { numerator: "Converted Trials", denominator: "Started Trials" },
}

/**
 * Is group X better than group Y? Rate per segment (paywall/price test,
 * country, version…) over one period, each group tested against a reference
 * (the biggest group unless given) with Fisher / z-test.
 */
export async function compareGroups(input: {
  chart: "paywall_conversion" | "conversion_to_paying" | "trial_conversion"
  start_date: string
  end_date: string
  segment: NonNullable<ChartQuery["segment"]>
  filter?: ChartQuery["filter"]
  reference?: string
  conversion_days?: number
}) {
  const rate = GROUP_RATES[input.chart]!
  const chart = await fetchChart({
    chart: input.chart,
    start_date: input.start_date,
    end_date: input.end_date,
    resolution: "day",
    segment: input.segment,
    filter: input.filter,
    conversion_days: input.conversion_days,
  })
  const sums = sumWindow(chart, input.start_date, input.end_date)

  const groups = [...sums.values.entries()]
    .map(([groupe, m]) => ({ groupe, x: pick(m, rate.numerator), n: pick(m, rate.denominator) }))
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_SEGMENTS)
  if (groups.length < 2) return { error: "Moins de 2 groupes avec des données sur cette période." }

  const ref = groups.find((g) => g.groupe === input.reference) ?? groups[0]
  const comparisons: Array<{ groupe: string; reference: string } & ProportionComparison> = groups
    .filter((g) => g !== ref)
    .map((g) => ({ groupe: g.groupe, reference: ref.groupe, ...compareProportions(ref.x, ref.n, g.x, g.n) }))

  return {
    taux: `${rate.numerator} / ${rate.denominator}`,
    periode: { start: input.start_date, end: input.end_date },
    groupes: groups.map((g) => ({ ...g, taux_pct: round((g.x / g.n) * 100, 1) })),
    // a = référence, b = groupe ; verdict calculé (Fisher / z-test).
    comparaisons: comparisons,
    ...(sums.incomplete ? { warning: "Données récentes pas encore mûres : provisoire." } : {}),
  }
}
