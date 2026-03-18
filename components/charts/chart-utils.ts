import { format, parse } from "date-fns"

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
export const REF_DATE = new Date(2000, 0, 1)

export function formatDateLabel(dateStr: string): string {
  try {
    const parsed = parse(dateStr, "yyyy-MM-dd", REF_DATE)
    return format(parsed, "MMM d")
  } catch {
    return dateStr
  }
}

export function resolveTooltipLabel(payload: Array<{ payload?: Record<string, unknown> }> | undefined, xKey: string, label?: string): string {
  const rawLabel = payload?.[0]?.payload?.[xKey] ?? label
  const str = String(rawLabel)
  return ISO_DATE_REGEX.test(str) ? formatDateLabel(str) : str
}

export const tooltipContainerStyle = {
  backgroundColor: "#141E33",
  border: "1px solid #1F2A44",
  borderRadius: "8px",
  padding: "8px 12px",
} as const

export const tooltipLabelStyle = { color: "#9AA4BF", fontSize: 12, margin: 0 } as const
export const tooltipValueStyle = { color: "#FFFFFF", fontSize: 14, fontWeight: 600, margin: "4px 0 0" } as const
