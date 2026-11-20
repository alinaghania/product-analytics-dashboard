// fr-FR number formatting for user-facing values. All formatters accept
// null/undefined/non-finite input and render EM_DASH so callers never have
// to guard against division-by-zero results themselves.

export const EM_DASH = "—"

function isDisplayable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function formatCurrency(value: number | null | undefined, decimals = 0): string {
  if (!isDisplayable(value)) return EM_DASH
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (!isDisplayable(value)) return EM_DASH
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Input is in percent points (0.2 means 0,20 %), not a fraction. */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (!isDisplayable(value)) return EM_DASH
  // Narrow no-break space before "%" per fr-FR convention (also avoids line wrap).
  return `${formatNumber(value, decimals)} %`
}

/** Share of a whole: "63 %" for 124 out of 197. An empty whole gives EM_DASH. */
export function formatShare(part: number, whole: number, decimals = 0): string {
  return formatPercent(whole > 0 ? (part / whole) * 100 : null, decimals)
}

/** Ratio display, e.g. ROAS → "1,25×". */
export function formatMultiplier(value: number | null | undefined, decimals = 2): string {
  if (!isDisplayable(value)) return EM_DASH
  return `${formatNumber(value, decimals)}×`
}

/** A duration read at a glance: "2,6 s", "45 s", "7 min 05", "2 h 10". */
export function formatMs(ms: number | null | undefined): string {
  if (!isDisplayable(ms)) return EM_DASH
  // One decimal as long as it does not round up to "10,0 s".
  if (ms < 9_950) return `${formatNumber(ms / 1000, 1)} s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const twoDigits = (value: number) => String(value).padStart(2, "0")
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${twoDigits(seconds % 60)}`
  const minutes = Math.round(seconds / 60)
  return `${Math.floor(minutes / 60)} h ${twoDigits(minutes % 60)}`
}

/** The form that agrees with a count: singular up to 1, as French does ("0 session", "2 sessions"). */
export function agree(count: number, singular: string, pluralForm: string): string {
  return count > 1 ? pluralForm : singular
}

/** A count with its noun: "13 sessions", "1 session". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${agree(count, singular, pluralForm)}`
}

/** Parses user input accepting both "," and "." decimals and grouping spaces. Null if empty/invalid. */
export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".")
  if (cleaned === "") return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
