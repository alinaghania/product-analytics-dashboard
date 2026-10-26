// Hand-curated product timeline (source: lotus-mobile PRs/commits, audited
// 26/10/2026 — see ~/endora/plans/revenuecat-agent/02-timeline-produit.md).
// Releases and subscription prices are NOT listed here: they come live from
// App Store Connect (see tools.ts). Only add events git/ASC can't date.

export type TimelineType = "release" | "price" | "paywall" | "onboarding" | "feature" | "marketing"

export interface TimelineEvent {
  date: string // YYYY-MM-DD
  type: TimelineType
  label: string
  source: string
}

export const TIMELINE_SEED: TimelineEvent[] = [
  { date: "2025-12-15", type: "paywall", label: "RevenueCat intégré", source: "lotus-mobile d7976b3" },
  { date: "2025-12-19", type: "paywall", label: "Premier paywall", source: "lotus-mobile 21c533c" },
  { date: "2026-01-10", type: "paywall", label: "Bouton d'accès au paywall dans l'app", source: "lotus-mobile 08a694b" },
  { date: "2026-03-29", type: "paywall", label: "Offering RevenueCat default_version_2", source: "RevenueCat offerings.created_at" },
  { date: "2026-04-15", type: "onboarding", label: "Onboarding V2 + ré-onboarding des existantes", source: "lotus-mobile a3a9411" },
  { date: "2026-04-26", type: "onboarding", label: "Questions d'onboarding obligatoires", source: "lotus-mobile fe7f8aa" },
  { date: "2026-05-06", type: "feature", label: "Analyse repas par code-barres", source: "lotus-mobile 8d85451" },
  { date: "2026-06-05", type: "marketing", label: "Question « où nous as-tu connues ? » à l'inscription", source: "lotus-mobile 138f8dd" },
  { date: "2026-06-23", type: "feature", label: "Apple Health / Health Connect", source: "lotus-mobile e027899" },
  { date: "2026-06-30", type: "paywall", label: "Gratuit limité à 1 analyse repas/jour → paywall", source: "lotus-mobile 3c7ea0a" },
  { date: "2026-07-12", type: "feature", label: "Refonte des 115 articles", source: "lotus-mobile 8080c21" },
  { date: "2026-07-23", type: "price", label: "Test de prix FR 13,99 €/79,99 € (offering fr_price_test)", source: "RevenueCat offerings.created_at" },
  { date: "2026-08-14", type: "paywall", label: "FODMAP passe premium (fiche aliment)", source: "lotus-mobile #262" },
  { date: "2026-09-09", type: "feature", label: "Le chat peut écrire dans le Suivi", source: "lotus-mobile 06db51b" },
  { date: "2026-09-11", type: "paywall", label: "« Message du jour » verrouillé 1 jour sur 5", source: "lotus-mobile #286" },
  { date: "2026-09-18", type: "feature", label: "Retrait de la gamification", source: "lotus-mobile #319" },
  { date: "2026-09-30", type: "feature", label: "Appel vocal Endora", source: "lotus-mobile #339" },
  { date: "2026-10-04", type: "feature", label: "Widgets iOS", source: "lotus-mobile #329" },
  { date: "2026-10-15", type: "onboarding", label: "Tutoriel interactif post-onboarding", source: "lotus-mobile #361" },
]
