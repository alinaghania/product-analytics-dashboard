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

/** Ratio display, e.g. ROAS → "1,25×". */
export function formatMultiplier(value: number | null | undefined, decimals = 2): string {
  if (!isDisplayable(value)) return EM_DASH
  return `${formatNumber(value, decimals)}×`
}

/** Parses user input accepting both "," and "." decimals and grouping spaces. Null if empty/invalid. */
export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".")
  if (cleaned === "") return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
