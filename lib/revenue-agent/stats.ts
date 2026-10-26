// Pure, deterministic statistics for the revenue agent. No I/O, no LLM: every
// verdict the agent states about "real vs chance" or "what drove a change"
// comes from these functions.

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits

// ── Two-proportion comparison ───────────────────────────────────────────────

function logFactorial(n: number): number {
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log(i)
  return s
}

/** Two-sided Fisher exact test on the 2×2 table [[x1, n1-x1], [x2, n2-x2]]. */
export function fisherExactPValue(x1: number, n1: number, x2: number, n2: number): number {
  const total = n1 + n2
  const successes = x1 + x2
  const logDenominator = logFactorial(total) - logFactorial(successes) - logFactorial(total - successes)
  const probability = (a: number) =>
    Math.exp(
      logFactorial(n1) - logFactorial(a) - logFactorial(n1 - a) +
        logFactorial(n2) - logFactorial(successes - a) - logFactorial(n2 - successes + a) -
        logDenominator,
    )
  const observed = probability(x1)
  let p = 0
  for (let a = Math.max(0, successes - n2); a <= Math.min(n1, successes); a++) {
    const pa = probability(a)
    if (pa <= observed * (1 + 1e-7)) p += pa
  }
  return Math.min(1, p)
}

// Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7).
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

export type Verdict = "écart probablement réel" | "peut-être le hasard" | "trop peu de données"

export interface ProportionComparison {
  taux_a_pct: number | null
  taux_b_pct: number | null
  x_a: number
  n_a: number
  x_b: number
  n_b: number
  ecart_points: number | null
  p_value: number | null
  verdict: Verdict
  /** People needed per group to tell this gap from chance (80 % power, 5 %). */
  personnes_necessaires_par_groupe: number | null
}

/**
 * Is the gap between two rates (x_a/n_a vs x_b/n_b) likely real? Uses Fisher's
 * exact test when counts are small (any expected cell < 5), else a pooled z-test.
 */
export function compareProportions(x_a: number, n_a: number, x_b: number, n_b: number): ProportionComparison {
  const base = { x_a, n_a, x_b, n_b }
  if (n_a <= 0 || n_b <= 0) {
    return { ...base, taux_a_pct: null, taux_b_pct: null, ecart_points: null, p_value: null, verdict: "trop peu de données", personnes_necessaires_par_groupe: null }
  }
  const pa = x_a / n_a
  const pb = x_b / n_b
  const pooled = (x_a + x_b) / (n_a + n_b)
  const minExpected = Math.min(n_a * pooled, n_a * (1 - pooled), n_b * pooled, n_b * (1 - pooled))

  let p: number
  if (minExpected < 5) {
    p = fisherExactPValue(Math.round(x_a), Math.round(n_a), Math.round(x_b), Math.round(n_b))
  } else {
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    p = se === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(pa - pb) / se))
  }

  // Sample size per group for the observed gap (two-sided α=5 %, power 80 %).
  const gap = Math.abs(pa - pb)
  const needed = gap > 0 ? Math.ceil(((1.96 + 0.8416) ** 2 * (pa * (1 - pa) + pb * (1 - pb))) / gap ** 2) : null

  // Fewer than 5 successes in total: no test can say anything useful.
  const verdict: Verdict = x_a + x_b < 5 ? "trop peu de données" : p < 0.05 ? "écart probablement réel" : "peut-être le hasard"

  return {
    ...base,
    taux_a_pct: round(pa * 100, 1),
    taux_b_pct: round(pb * 100, 1),
    ecart_points: round((pb - pa) * 100, 1),
    p_value: round(p, 3),
    verdict,
    personnes_necessaires_par_groupe: needed,
  }
}

// ── Change decomposition ────────────────────────────────────────────────────

export interface ProductDecomposition {
  avant: number
  apres: number
  variation: number
  /** Part of the change due to factor 1 (volume), at constant factor 2. */
  effet_facteur1: number
  /** Part of the change due to factor 2 (rate/price), at the new volume. */
  effet_facteur2: number
}

/**
 * Splits the change of Y = F1 × F2 into two additive effects that sum EXACTLY
 * to ΔY: (F1b − F1a)·F2a + F1b·(F2b − F2a). E.g. revenue = purchases × basket,
 * new payers = signups × conversion.
 */
export function decomposeProduct(f1a: number, f2a: number, f1b: number, f2b: number): ProductDecomposition {
  const effet1 = (f1b - f1a) * f2a
  const effet2 = f1b * (f2b - f2a)
  return {
    avant: round(f1a * f2a),
    apres: round(f1b * f2b),
    variation: round(f1b * f2b - f1a * f2a),
    effet_facteur1: round(effet1),
    effet_facteur2: round(effet2),
  }
}

export function variationPct(before: number, after: number): number | null {
  return before ? round(((after - before) / before) * 100, 1) : null
}
