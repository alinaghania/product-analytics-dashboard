import { format, subDays, startOfDay, endOfDay, differenceInDays, parseISO } from "date-fns"

export function getDefaultDateRange() {
  const to = endOfDay(new Date())
  const from = startOfDay(subDays(new Date(), 30))
  return {
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  }
}

export function formatDate(date: Date | string, formatStr = "MMM d, yyyy") {
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, formatStr)
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, "MMM d, yyyy HH:mm")
}

export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, "HH:mm:ss")
}

export function getDaysDiff(from: string, to: string) {
  return differenceInDays(parseISO(to), parseISO(from))
}

export function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function formatLatency(ms: number) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}
