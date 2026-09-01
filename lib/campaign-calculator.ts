// Pure influencer-campaign profitability math (no React). Formulas come from
// the team's "Calculer la rentabilité d'une campagne avec un influenceur" doc.
// Percent inputs are in percent points (0.2 = 0,20 %); every ratio guards its
// denominator and returns null instead of NaN/Infinity.

export interface CampaignInputs {
  views: number
  costMode: "cpm" | "fixed"
  /** € per 1000 views (used in "cpm" mode). */
  cpm: number
  /** Flat price asked by the influencer (used in "fixed" mode). */
  fixedPrice: number
  /** Percent points, e.g. 0.2 = 0,20 %. */
  viewToInstallPct: number
  /** Percent points, e.g. 2 = 2 %. */
  installToPaidPct: number
  /** € net per paying user. */
  arpu: number
}

export interface CampaignResults {
  cost: number
  /** Fixed mode: price/(views/1000), null if views = 0. CPM mode: the input CPM. */
  effectiveCpm: number | null
  installs: number
  payingUsers: number
  revenue: number
  profit: number
  roas: number | null
  cpi: number | null
  cacPaying: number | null
  /** « Valeur maximale d'une installation » = t_p × ARPU (breakeven CPI). */
  breakevenCpi: number
  /** cpi <= breakevenCpi; null when cpi is undefined. */
  cpiIsProfitable: boolean | null
  /** CPM maximal rentable = 1000 × t_i × t_p × ARPU. */
  maxProfitableCpm: number
  /** Percent points; null when effectiveCpm is unknown or t_p × ARPU = 0. */
  requiredViewToInstallPct: number | null
  requiredInstalls: number | null
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

export function computeCampaign(inputs: CampaignInputs): CampaignResults {
  const { views, arpu } = inputs
  const viewToInstall = inputs.viewToInstallPct / 100
  const installToPaid = inputs.installToPaidPct / 100

  const cost = inputs.costMode === "cpm" ? (views / 1000) * inputs.cpm : inputs.fixedPrice
  const effectiveCpm = inputs.costMode === "cpm" ? inputs.cpm : ratio(inputs.fixedPrice * 1000, views)

  const installs = views * viewToInstall
  const payingUsers = installs * installToPaid
  const revenue = payingUsers * arpu
  const profit = revenue - cost

  const cpi = ratio(cost, installs)
  const breakevenCpi = installToPaid * arpu

  const requiredViewToInstall =
    effectiveCpm !== null && breakevenCpi > 0 ? effectiveCpm / (1000 * breakevenCpi) : null

  return {
    cost,
    effectiveCpm,
    installs,
    payingUsers,
    revenue,
    profit,
    roas: ratio(revenue, cost),
    cpi,
    cacPaying: ratio(cost, payingUsers),
    breakevenCpi,
    cpiIsProfitable: cpi === null ? null : cpi <= breakevenCpi,
    maxProfitableCpm: 1000 * viewToInstall * breakevenCpi,
    requiredViewToInstallPct: requiredViewToInstall === null ? null : requiredViewToInstall * 100,
    requiredInstalls: requiredViewToInstall === null ? null : views * requiredViewToInstall,
  }
}

export interface RoasVerdict {
  label: string
  description: string
  variant: "danger" | "warning" | "success"
}

export function roasVerdict(roas: number | null): RoasVerdict | null {
  if (roas === null || !Number.isFinite(roas)) return null
  if (roas < 0.95)
    return {
      label: "Non rentable",
      description: "Chaque euro dépensé rapporte moins d'un euro de revenu.",
      variant: "danger",
    }
  if (roas <= 1.05)
    return {
      label: "Au seuil de rentabilité",
      description: "Les revenus couvrent tout juste le coût de la campagne.",
      variant: "warning",
    }
  if (roas < 1.5)
    return {
      label: "Rentable",
      description: "Les revenus dépassent le coût de la campagne.",
      variant: "success",
    }
  return {
    label: "Rentable avec marge de sécurité",
    description: "ROAS ≥ 1,5 : la campagne reste rentable même si les hypothèses sont un peu optimistes.",
    variant: "success",
  }
}

/** Scenario presets for « taux vue → installation », rates in percent points. */
export const SCENARIOS = [
  { label: "Prudent", defaultRatePct: "0,10" },
  { label: "Central", defaultRatePct: "0,20" },
  { label: "Très bon", defaultRatePct: "0,50" },
  { label: "Exceptionnel", defaultRatePct: "1,00" },
] as const
