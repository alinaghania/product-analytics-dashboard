// Deep analysis, step 1: five deterministic dossiers built by code (no LLM).
// Each gathers the numbers of one domain, computes rates/verdicts/values, and
// pre-builds its charts. Analysts only read them — they can't invent a figure
// or a chart point.

import "server-only"
import { fetchAcquisitionConversion } from "@/lib/firestore-admin-queries"
import type { ChartSpec } from "./chart-spec"
import { fetchChart, isoDay, round, type RcChart } from "./rc-data"
import { compareGroups } from "./analyses"
import { acquisition, comparePeriods, reviews, usage } from "./tools"
import { currentAscPrice, productTimeline } from "./timeline"
import {
  annualSubscriberValue,
  compareProportions,
  monthlySubscriberValue,
  variationPct,
} from "./stats"

/** RevenueCat data starts when the project was created. */
const HISTORY_START = "2025-12-01"
const PRICE_CHANGE = "2026-07-27"
const FREE_TRIAL_START = "2026-08-19"
const PRICE_TEST_START = "2026-07-23"
const PLANS = { P1M: "mensuel", P1Y: "annuel" } as const

export type DossierId = "offres" | "retention" | "conversion" | "acquisition" | "produit"

export interface Dossier {
  id: DossierId
  titre: string
  donnees: Record<string, unknown>
  graphiques: Record<string, ChartSpec>
  warnings: string[]
}

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const pct = (x: number, n: number) => (n ? round((x / n) * 100, 1) : null)

// Key events drawn on time charts (month-level charts snap to the month).
const KEY_EVENTS = [
  { x: PRICE_TEST_START, label: "Test prix FR" },
  { x: PRICE_CHANGE, label: "Hausse des prix" },
  { x: FREE_TRIAL_START, label: "Essai gratuit 7 j" },
]
// Events falling in the same month share one marker ("Test prix FR + Hausse des prix").
const monthAnnotations = (months: string[]) => {
  const byMonth = new Map<string, string[]>()
  for (const e of KEY_EVENTS) {
    const month = e.x.slice(0, 7)
    if (months.includes(month)) byMonth.set(month, [...(byMonth.get(month) ?? []), e.label])
  }
  return [...byMonth.entries()].map(([x, labels]) => ({ x, label: labels.join(" + ").slice(0, 40) }))
}

// ── RevenueCat chart readers ────────────────────────────────────────────────

function measureIndex(chart: RcChart, prefix: string): number {
  return (chart.measures ?? []).findIndex((m) => m.display_name.startsWith(prefix))
}

interface MonthRow {
  mois: string
  incomplet?: boolean
  [key: string]: string | number | boolean | null | undefined
}

/** Month-resolution chart → rows {mois, <column>: value}. Segments become columns. */
async function monthly(
  chart: Parameters<typeof fetchChart>[0]["chart"],
  measures: Record<string, string>, // column → measure name prefix
  options: { byPlan?: boolean; conversion_days?: number } = {},
): Promise<MonthRow[]> {
  const data = await fetchChart({
    chart,
    start_date: HISTORY_START,
    end_date: today(),
    resolution: "month",
    ...(options.byPlan ? { segment: "product_duration" as const } : {}),
    ...(options.conversion_days ? { conversion_days: options.conversion_days } : {}),
  })
  const segments = data.segments ?? null
  const columns = Object.entries(measures).map(([column, prefix]) => ({ column, index: measureIndex(data, prefix) }))
  const rows = new Map<string, MonthRow>()
  for (const v of data.values) {
    const seg = segments && v.segment !== undefined ? segments[v.segment] : null
    if (seg?.is_total) continue
    const col = columns.find((c) => c.index === v.measure)
    if (!col || typeof v.cohort !== "number") continue
    const mois = isoDay(v.cohort).slice(0, 7)
    const row = rows.get(mois) ?? { mois }
    const planName = seg ? (PLANS[seg.display_name as keyof typeof PLANS] ?? seg.display_name) : null
    row[planName ? `${col.column}_${planName}` : col.column] = round(v.value)
    if (v.incomplete) row.incomplet = true
    rows.set(mois, row)
  }
  return [...rows.values()].sort((a, b) => a.mois.localeCompare(b.mois))
}

/** Today's auto-renew status per plan (snapshot chart, no dates). */
async function renewalStatus() {
  const data = await fetchChart({
    chart: "subscription_status",
    start_date: daysAgo(2),
    end_date: daysAgo(1),
    resolution: "day",
    segment: "product_duration",
  })
  const out: Record<string, { actives: number; renouvellement_active: number; renouvellement_coupe: number; coupe_pct: number | null }> = {}
  const segments = data.segments ?? []
  const total = measureIndex(data, "Total Active Subscriptions")
  const renew = measureIndex(data, "Active Subscriptions Set to Renew")
  const cancel = measureIndex(data, "Active Subscriptions Set to Cancel")
  for (const v of data.values) {
    const plan = PLANS[segments[v.segment ?? -1]?.display_name as keyof typeof PLANS]
    if (!plan) continue
    const row = (out[plan] ??= { actives: 0, renouvellement_active: 0, renouvellement_coupe: 0, coupe_pct: null })
    if (v.measure === total) row.actives = v.value
    if (v.measure === renew) row.renouvellement_active = v.value
    if (v.measure === cancel) row.renouvellement_coupe = v.value
  }
  for (const row of Object.values(out)) row.coupe_pct = pct(row.renouvellement_coupe, row.actives)
  return out
}

/** Monthly-plan retention: overall survival curve + month-1 retention before/after the price change. */
async function monthlyPlanRetention() {
  const data = await fetchChart({
    chart: "subscription_retention",
    start_date: HISTORY_START,
    end_date: today(),
    resolution: "month",
    filter: { dimension: "product_duration", values: ["P1M"] },
  })
  const periods = (data.periods ?? []).map((p) => p.display_name)
  const cohorts = new Map<string, Record<string, number | string>>()
  for (const v of data.values) {
    const name = typeof v.cohort === "number" || /^\d+$/.test(String(v.cohort)) ? isoDay(Number(v.cohort)).slice(0, 7) : String(v.cohort)
    const row = cohorts.get(name) ?? {}
    row[periods[v.period ?? 0] ?? `p${v.period}`] = v.value
    cohorts.set(name, row)
  }

  // Overall curve: "Month k rate" (share that reached paid month k among those
  // who had the chance), up to the first incomplete/empty month.
  const total = cohorts.get("Total") ?? {}
  const survival: number[] = []
  for (let k = 1; k <= 11; k++) {
    const rate = total[`Month ${k} rate`]
    if (typeof rate !== "number" || rate <= 0) break
    survival.push(rate / 100)
  }

  // Month-1 retention per cohort group, from absolute counts of complete cohorts.
  const group = (filter: (mois: string) => boolean) => {
    let subs = 0
    let kept = 0
    for (const [mois, row] of cohorts) {
      if (mois === "Total" || !filter(mois) || typeof row["Month 1 rate"] !== "number") continue
      subs += Number(row.Subscriptions ?? 0)
      kept += Number(row["Month 1"] ?? 0)
    }
    return { subs, kept }
  }
  const before = group((m) => m < PRICE_CHANGE.slice(0, 7))
  const after = group((m) => m > PRICE_CHANGE.slice(0, 7))

  return {
    courbe_survie_pct: survival.map((s, i) => ({ mois: `M${i + 1}`, encore_abonnees_pct: round(s * 100, 1) })),
    survival,
    abonnements_total: Number(total.Subscriptions ?? 0),
    retention_m1_avant_apres_hausse: compareProportions(before.kept, before.subs, after.kept, after.subs),
    cohortes: [...cohorts.entries()]
      .filter(([m]) => m !== "Total")
      .map(([mois, row]) => ({
        mois,
        abonnements: row.Subscriptions,
        m1_pct: row["Month 1 rate"],
        m2_pct: row["Month 2 rate"],
        m3_pct: row["Month 3 rate"],
      }))
      .filter((c) => Number(c.abonnements) > 0),
  }
}

/** Refund rate per plan over the whole history, with a verdict. */
async function refundsByPlan() {
  const data = await fetchChart({
    chart: "refund_rate",
    start_date: HISTORY_START,
    end_date: today(),
    resolution: "month",
    segment: "product_duration",
  })
  const segments = data.segments ?? []
  const tx = measureIndex(data, "Transactions")
  const refunded = measureIndex(data, "Refunded Transactions")
  const sums: Record<string, { achats: number; rembourses: number }> = {}
  const byMonth = new Map<string, Record<string, number>>()
  for (const v of data.values) {
    const plan = PLANS[segments[v.segment ?? -1]?.display_name as keyof typeof PLANS]
    if (!plan) continue
    const s = (sums[plan] ??= { achats: 0, rembourses: 0 })
    if (v.measure === tx) s.achats += v.value
    if (v.measure === refunded) s.rembourses += v.value
    if (typeof v.cohort === "number" && (v.measure === tx || v.measure === refunded)) {
      const mois = isoDay(v.cohort).slice(0, 7)
      const row = byMonth.get(mois) ?? {}
      row[`${v.measure === tx ? "achats" : "rembourses"}_${plan}`] = v.value
      byMonth.set(mois, row)
    }
  }
  const m = sums.mensuel ?? { achats: 0, rembourses: 0 }
  const y = sums.annuel ?? { achats: 0, rembourses: 0 }
  return {
    mensuel: { ...m, taux_pct: pct(m.rembourses, m.achats) },
    annuel: { ...y, taux_pct: pct(y.rembourses, y.achats) },
    comparaison_mensuel_vs_annuel: compareProportions(m.rembourses, m.achats, y.rembourses, y.achats),
    // Refunds are dated by purchase month: shows whether they started with a given change.
    par_mois_d_achat: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, r]) => (r.achats_annuel ?? 0) + (r.achats_mensuel ?? 0) > 0)
      .map(([mois, r]) => ({
        mois,
        achats_annuel: r.achats_annuel ?? 0,
        rembourses_annuel: r.rembourses_annuel ?? 0,
        rembourses_annuel_pct: pct(r.rembourses_annuel ?? 0, r.achats_annuel ?? 0),
        achats_mensuel: r.achats_mensuel ?? 0,
        rembourses_mensuel: r.rembourses_mensuel ?? 0,
      })),
  }
}

// ── Dossier 1: offers & prices ──────────────────────────────────────────────

async function dossierOffres(): Promise<Dossier> {
  const warnings: string[] = []
  const mrr = await monthly("mrr", { mrr: "MRR" }, { byPlan: true })
  const revenue = await monthly("revenue", { revenu: "Revenue", achats: "Transactions" }, { byPlan: true })
  const newPaid = await monthly("actives_new", { nouvelles_abonnees: "Total Paid Subscriptions" }, { byPlan: true })
  const actives = await monthly("actives", { actives: "Actives" }, { byPlan: true })
  const timeline = await productTimeline({ start_date: HISTORY_START, end_date: today() })
  const priceTest = await compareGroups({
    chart: "paywall_conversion",
    start_date: PRICE_TEST_START,
    end_date: today(),
    segment: "offering_identifier",
    filter: { dimension: "first_country", values: ["FR"] },
    reference: "default",
  })

  const mix = newPaid.map((r) => {
    const m = Number(r.nouvelles_abonnees_mensuel ?? 0)
    const y = Number(r.nouvelles_abonnees_annuel ?? 0)
    return { mois: r.mois, mensuel: m, annuel: y, part_annuel_pct: pct(y, m + y), ...(r.incomplet ? { incomplet: true } : {}) }
  })
  const months = mrr.map((r) => r.mois)

  return {
    id: "offres",
    titre: "Offres & prix (mensuel vs annuel, test de prix)",
    donnees: {
      prix_actuels: timeline.currentPrices,
      changements_de_prix: timeline.events.filter((e) => e.type === "price" || (e.type === "paywall" && e.source === "App Store Connect")),
      mrr_par_offre_par_mois: mrr,
      revenu_brut_par_offre_par_mois: revenue,
      abonnees_actives_par_offre_par_mois: actives,
      mix_nouvelles_abonnees_par_mois: mix,
      test_de_prix_france: priceTest,
      a_savoir:
        "MRR = revenu ramené au mois (un annuel à 59,99 € compte ~5 €/mois). Le revenu brut, lui, encaisse l'annuel d'un coup : il gonfle le mois d'achat. Pour comparer les offres, regarder le MRR et la valeur sur 12 mois (dossier rétention), pas le revenu du mois.",
    },
    graphiques: {
      mrr_par_offre: {
        type: "line",
        title: "MRR par offre",
        unit: "EUR",
        x: months,
        series: [
          { name: "Mensuel", values: mrr.map((r) => (r.mrr_mensuel as number) ?? null) },
          { name: "Annuel", values: mrr.map((r) => (r.mrr_annuel as number) ?? null) },
        ],
        annotations: monthAnnotations(months),
        source: "RevenueCat · MRR par durée d'abonnement",
      },
      part_annuel: {
        type: "bar",
        title: "Part de l'annuel chez les nouvelles abonnées",
        unit: "percent",
        x: mix.map((r) => r.mois),
        series: [{ name: "Annuel (%)", values: mix.map((r) => r.part_annuel_pct) }],
        annotations: monthAnnotations(mix.map((r) => r.mois)),
        source: "RevenueCat · nouvelles abonnées payantes par durée",
      },
    },
    warnings: [...warnings, ...timeline.warnings],
  }
}

// ── Dossier 2: retention & value ────────────────────────────────────────────

async function dossierRetention(): Promise<Dossier> {
  const warnings: string[] = []
  const retention = await monthlyPlanRetention()
  const status = await renewalStatus()
  const refunds = await refundsByPlan()
  const churn = await monthly("churn", { actives: "Actives", desabonnees: "Churned Actives" }, { byPlan: true })
  const [monthlyPrice, annualPrice] = await Promise.all([
    currentAscPrice("endora_monthly", "FRA"),
    currentAscPrice("endora_yearly", "FRA"),
  ])
  if (monthlyPrice === null || annualPrice === null) warnings.push("Prix App Store indisponibles : valeur sur 12 mois non calculée.")

  const monthlyValue =
    monthlyPrice !== null ? monthlySubscriberValue(monthlyPrice, retention.survival, (refunds.mensuel.taux_pct ?? 0) / 100) : null
  const annualValue =
    annualPrice !== null
      ? annualSubscriberValue(annualPrice, (refunds.annuel.taux_pct ?? 0) / 100, 1 - (status.annuel?.coupe_pct ?? 0) / 100)
      : null
  if (retention.survival.length < 3) warnings.push("Moins de 3 mois de rétention observés sur le mensuel : projection fragile.")
  warnings.push("Aucune annuelle n'a encore atteint son 1er renouvellement (offre créée en déc. 2025) : la rétention annuelle réelle est inconnue, seul le renouvellement automatique programmé est visible.")

  const churnRates = churn.map((r) => ({
    mois: r.mois,
    churn_mensuel_pct: pct(Number(r.desabonnees_mensuel ?? 0), Number(r.actives_mensuel ?? 0)),
    churn_annuel_pct: pct(Number(r.desabonnees_annuel ?? 0), Number(r.actives_annuel ?? 0)),
    desabonnees_mensuel: r.desabonnees_mensuel,
    desabonnees_annuel: r.desabonnees_annuel,
    ...(r.incomplet ? { incomplet: true } : {}),
  }))

  return {
    id: "retention",
    titre: "Rétention & valeur d'une abonnée",
    donnees: {
      prix_fr_utilises: { mensuel: monthlyPrice, annuel: annualPrice },
      valeur_12_mois_par_abonnee: { mensuel: monthlyValue, annuel: annualValue },
      retention_mensuel: retention,
      renouvellement_automatique_aujourdhui: status,
      remboursements: refunds,
      churn_par_mois: churnRates,
      a_savoir:
        "Valeur 12 mois = ce que rapporte en moyenne UNE nouvelle abonnée sur sa première année (brut, prix actuels FR). « Renouvellement coupé » = l'abonnée reste abonnée jusqu'à la fin de sa période payée mais ne sera pas reprélevée.",
    },
    graphiques: {
      survie_mensuel: {
        type: "line",
        title: "Abonnées mensuelles encore là",
        unit: "percent",
        x: ["M0", ...retention.courbe_survie_pct.map((p) => p.mois)],
        series: [{ name: "Encore abonnées (%)", values: [100, ...retention.courbe_survie_pct.map((p) => p.encore_abonnees_pct)] }],
        annotations: [],
        source: "RevenueCat · rétention des abonnements mensuels",
      },
      ...(monthlyValue && annualValue
        ? {
            valeur_12_mois: {
              type: "bar" as const,
              title: "Valeur d'une abonnée sur 12 mois",
              unit: "EUR" as const,
              x: ["Mensuel", "Annuel"],
              series: [{ name: "Valeur 12 mois (€)", values: [monthlyValue.valeur_12m, annualValue.valeur_12m] }],
              annotations: [],
              source: "Calcul code · prix App Store × rétention RevenueCat − remboursements",
            },
          }
        : {}),
      renouvellement_coupe: {
        type: "bar",
        title: "Renouvellement automatique coupé",
        unit: "percent",
        x: ["Mensuel", "Annuel"],
        series: [{ name: "Coupé (%)", values: [status.mensuel?.coupe_pct ?? null, status.annuel?.coupe_pct ?? null] }],
        annotations: [],
        source: "RevenueCat · statut des abonnements actifs aujourd'hui",
      },
    },
    warnings,
  }
}

// ── Dossier 3: conversion ───────────────────────────────────────────────────

async function dossierConversion(): Promise<Dossier> {
  const warnings: string[] = []
  const payers = await monthly("conversion_to_paying", { nouvelles_clientes: "New Customers", payantes_14j: "Paying Customers" }, { conversion_days: 14 })
  const trials = await monthly("trial_conversion", { nouvelles_clientes: "New Customers", essais_demarres: "Started Trials", essais_convertis: "Converted Trials" })
  const newByPlan = await monthly(
    "actives_new",
    { via_essai: "Trial Conversions", achat_direct: "Direct Subscriptions" },
    { byPlan: true },
  )
  const trialEffect = await comparePeriods({ chart: "conversion_to_paying", pivot_date: FREE_TRIAL_START, window_days: 21, conversion_days: 14 })
  const priceEffect = await comparePeriods({ chart: "conversion_to_paying", pivot_date: PRICE_CHANGE, window_days: 21, conversion_days: 14 })

  const funnel = payers.map((p) => {
    const t = trials.find((r) => r.mois === p.mois) ?? ({} as MonthRow)
    const n = Number(p.nouvelles_clientes ?? 0)
    const started = Number(t.essais_demarres ?? 0)
    return {
      mois: p.mois,
      nouvelles_clientes: n,
      payantes_14j: p.payantes_14j,
      payantes_14j_pct: pct(Number(p.payantes_14j ?? 0), n),
      essais_demarres: started,
      essais_demarres_pct: pct(started, Number(t.nouvelles_clientes ?? 0)),
      essais_convertis: t.essais_convertis,
      essais_convertis_pct: pct(Number(t.essais_convertis ?? 0), started),
      ...(p.incomplet || t.incomplet ? { incomplet: true } : {}),
    }
  })
  const months = funnel.map((f) => f.mois)
  if (funnel.some((f) => f.incomplet)) warnings.push("Mois récents incomplets : les conversions vont encore monter (essais en cours).")

  return {
    id: "conversion",
    titre: "Conversion (inscrite → essai → payante, paywalls)",
    donnees: {
      entonnoir_par_mois: funnel,
      nouvelles_payantes_par_offre_et_chemin: newByPlan.filter((r) => Object.keys(r).some((k) => k.startsWith("via_") || k.startsWith("achat_"))),
      effet_essai_gratuit_19_08: trialEffect,
      effet_hausse_prix_27_07: priceEffect,
      a_savoir:
        "nouvelles_payantes_par_offre_et_chemin : par mois et par offre (mensuel/annuel), payantes venues d'un essai gratuit (via_essai) ou d'un achat direct sans essai (achat_direct). Fenêtre de 14 jours : avec l'essai gratuit de 7 j, le 1er paiement tombe au 8e jour. Les fenêtres autour du 27/07 s'arrêtent avant l'essai gratuit (19/08) pour ne pas mélanger les deux changements.",
    },
    graphiques: {
      entonnoir: {
        type: "line",
        title: "Conversion par mois",
        unit: "percent",
        x: months,
        series: [
          { name: "Payantes sous 14 j (%)", values: funnel.map((f) => f.payantes_14j_pct) },
          { name: "Démarrent un essai (%)", values: funnel.map((f) => f.essais_demarres_pct) },
          { name: "Essais convertis (%)", values: funnel.map((f) => f.essais_convertis_pct) },
        ],
        annotations: monthAnnotations(months),
        source: "RevenueCat · conversion_to_paying (14 j) et trial_conversion",
      },
    },
    warnings,
  }
}

// ── Dossier 4: acquisition & growth ─────────────────────────────────────────

async function dossierAcquisition(): Promise<Dossier> {
  const newCustomers = await monthly("customers_new", { nouvelles_clientes: "New Customers" })
  const growth = newCustomers.map((r, i): MonthRow => ({
    ...r,
    croissance_vs_mois_precedent_pct: i ? variationPct(Number(newCustomers[i - 1].nouvelles_clientes), Number(r.nouvelles_clientes)) : null,
  }))
  const sources = await acquisition({ start_date: daysAgo(90), end_date: today() })
  const weekly = await fetchAcquisitionConversion({ from: daysAgo(84), to: today() })

  const topSources = sources.par_source.slice(0, 4).map((s) => s.source)
  const weeks = [...new Set(weekly.rows.map((r) => r.week))].sort()
  const series = topSources.map((source) => ({
    name: source,
    values: weeks.map((w) => weekly.rows.find((r) => r.week === w && r.source === source)?.signups ?? 0),
  }))
  const months = growth.map((r) => r.mois)

  return {
    id: "acquisition",
    titre: "Acquisition & croissance",
    donnees: {
      nouvelles_clientes_par_mois: growth,
      sources_90_derniers_jours: sources,
      inscriptions_par_source_par_semaine: weeks.map((w, i) => ({ semaine: w, ...Object.fromEntries(series.map((s) => [s.name, s.values[i]])) })),
      a_savoir:
        "Nouvelles clientes = comptes vus par RevenueCat (≈ installations actives). Sources = réponse à « où nous as-tu connues ? » (Firestore). premium = premium aujourd'hui (essais inclus), pas « a payé ».",
    },
    graphiques: {
      nouvelles_clientes: {
        type: "bar",
        title: "Nouvelles clientes par mois",
        unit: "count",
        x: months,
        series: [{ name: "Nouvelles clientes", values: growth.map((r) => Number(r.nouvelles_clientes)) }],
        annotations: monthAnnotations(months),
        source: "RevenueCat · customers_new",
      },
      sources_par_semaine: {
        type: "line",
        title: "Inscriptions par source",
        unit: "count",
        x: weeks,
        series,
        annotations: [],
        source: "Firestore · source d'inscription, 12 dernières semaines",
      },
    },
    warnings: [],
  }
}

// ── Dossier 5: product & engagement ─────────────────────────────────────────

async function dossierProduit(): Promise<Dossier> {
  const timeline = await productTimeline({ start_date: "2026-04-01", end_date: today() })
  // Stop at the last complete week (Sunday) so a half-week doesn't read as a drop.
  const lastSunday = new Date()
  lastSunday.setUTCDate(lastSunday.getUTCDate() - ((lastSunday.getUTCDay() + 7) % 7 || 7))
  const weekly = await usage({ start_date: daysAgo(84), end_date: lastSunday.toISOString().slice(0, 10) })
  const appReviews = await reviews({ start_date: "2026-06-01", end_date: today() }).catch((e) => ({ error: String(e) }))
  const weeks = weekly.semaines.map((s) => s.semaine)
  const releases = timeline.events.filter((e) => e.type === "release" && e.date >= (weeks[0] ?? ""))

  return {
    id: "produit",
    titre: "Produit & engagement",
    donnees: {
      chronologie: timeline.events,
      usage_par_semaine: weekly,
      avis_app_store: appReviews,
    },
    graphiques: {
      actives_par_semaine: {
        type: "line",
        title: "Utilisatrices actives par semaine",
        unit: "count",
        x: weeks,
        series: [
          { name: "Actives (suivi)", values: weekly.semaines.map((s) => s.actives) },
          { name: "Inscrites", values: weekly.semaines.map((s) => s.inscrites) },
        ],
        annotations: releases.slice(-6).map((r) => ({ x: r.date, label: r.label.replace(/ \(.*\)$/, "") })),
        source: "Firestore · tracking_sessions et users",
      },
    },
    warnings: timeline.warnings,
  }
}

export const DOSSIER_BUILDERS: Record<DossierId, () => Promise<Dossier>> = {
  offres: dossierOffres,
  retention: dossierRetention,
  conversion: dossierConversion,
  acquisition: dossierAcquisition,
  produit: dossierProduit,
}
