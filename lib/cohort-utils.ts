import {  format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, subQuarters } from "date-fns"
import type { CohortDefinition, CohortRetentionData } from "./types"
import { getDaysDiff } from "./date-utils"

// Color palette for cohorts (6 colors max)
const COHORT_COLORS = [
  "#2ED47A", // Green - current retention color
  "#7C3AED", // Purple - current DAU color
  "#F59E0B", // Orange - current hour chart color
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#10B981", // Emerald
]

/**
 * Get cohort color by index
 */
export function getCohortColor(index: number): string {
  return COHORT_COLORS[index % COHORT_COLORS.length]
}

/**
 * Assign colors to an array of cohorts
 */
export function assignCohortColors(cohorts: Omit<CohortDefinition, "color">[]): CohortDefinition[] {
  return cohorts.map((cohort, index) => ({
    ...cohort,
    color: getCohortColor(index),
  }))
}

/**
 * Generate smart cohorts based on date range duration
 * - 7-14 days → weekly cohorts
 * - 15-90 days → monthly cohorts
 * - 90+ days → quarterly cohorts
 */
export function generateSmartCohorts(from: string, to: string, count: number = 3): CohortDefinition[] {
  const durationDays = getDaysDiff(from, to)

  if (durationDays <= 14) {
    return generateWeeklyCohorts(to, count)
  } else if (durationDays <= 90) {
    return generateMonthlyCohorts(to, count)
  } else {
    return generateQuarterlyCohorts(to, count)
  }
}

/**
 * Generate N monthly cohorts going backwards from endDate
 * Example: endDate = "2026-03-31", count = 3
 * → ["Jan 2026", "Feb 2026", "Mar 2026"]
 */
export function generateMonthlyCohorts(endDate: string, count: number): CohortDefinition[] {
  const cohorts: Omit<CohortDefinition, "color">[] = []
  const end = new Date(endDate)

  for (let i = count - 1; i >= 0; i--) {
    const monthDate = subMonths(end, i)
    const start = startOfMonth(monthDate)
    const finish = endOfMonth(monthDate)

    cohorts.push({
      id: `cohort-${format(start, "yyyy-MM")}`,
      label: format(start, "MMM yyyy"),
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(finish, "yyyy-MM-dd"),
    })
  }

  return assignCohortColors(cohorts)
}

/**
 * Generate N weekly cohorts going backwards from endDate
 * Example: endDate = "2026-02-07", count = 3
 * → ["Week of Jan 18", "Week of Jan 25", "Week of Feb 1"]
 */
export function generateWeeklyCohorts(endDate: string, count: number): CohortDefinition[] {
  const cohorts: Omit<CohortDefinition, "color">[] = []
  const end = new Date(endDate)

  for (let i = count - 1; i >= 0; i--) {
    const weekDate = subWeeks(end, i)
    const start = startOfWeek(weekDate, { weekStartsOn: 1 }) // Monday
    const finish = endOfWeek(weekDate, { weekStartsOn: 1 })

    cohorts.push({
      id: `cohort-week-${format(start, "yyyy-MM-dd")}`,
      label: `Week of ${format(start, "MMM d")}`,
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(finish, "yyyy-MM-dd"),
    })
  }

  return assignCohortColors(cohorts)
}

/**
 * Generate N quarterly cohorts going backwards from endDate
 * Example: endDate = "2026-03-31", count = 3
 * → ["Q1 2026", "Q2 2026", "Q3 2026"]
 */
export function generateQuarterlyCohorts(endDate: string, count: number): CohortDefinition[] {
  const cohorts: Omit<CohortDefinition, "color">[] = []
  const end = new Date(endDate)

  for (let i = count - 1; i >= 0; i--) {
    const quarterDate = subQuarters(end, i)
    const start = startOfQuarter(quarterDate)
    const finish = endOfQuarter(quarterDate)

    const quarter = Math.floor(start.getMonth() / 3) + 1
    const year = start.getFullYear()

    cohorts.push({
      id: `cohort-Q${quarter}-${year}`,
      label: `Q${quarter} ${year}`,
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(finish, "yyyy-MM-dd"),
    })
  }

  return assignCohortColors(cohorts)
}

/**
 * Format a cohort label based on start/end dates and type
 */
export function formatCohortLabel(
  startDate: string,
  endDate: string,
  type: "weekly" | "monthly" | "quarterly",
): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  switch (type) {
    case "weekly":
      return `Week of ${format(start, "MMM d")}`
    case "monthly":
      return format(start, "MMM yyyy")
    case "quarterly": {
      const quarter = Math.floor(start.getMonth() / 3) + 1
      return `Q${quarter} ${start.getFullYear()}`
    }
    default:
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
  }
}

/**
 * Merge multiple retention curves into a single chart-ready dataset
 *
 * Input: Array of cohort retention data
 * Output: Array of data points where each point has day + retention% for each cohort
 *
 * Example:
 * Input: [
 *   { cohort: {label: "Jan"}, data: { curve: [{day: 0, retentionPct: 100}, {day: 1, retentionPct: 42}] }},
 *   { cohort: {label: "Feb"}, data: { curve: [{day: 0, retentionPct: 100}, {day: 1, retentionPct: 45}] }}
 * ]
 *
 * Output: [
 *   { day: 0, "Jan": 100, "Feb": 100 },
 *   { day: 1, "Jan": 42, "Feb": 45 }
 * ]
 */
export function mergeRetentionCurves(cohortsData: CohortRetentionData[]): Record<string, number | string>[] {
  const merged = new Map<number, Record<string, number | string>>()

  cohortsData.forEach(({ cohort, data }) => {
    // Skip cohorts with errors or no data
    if (data.error || !data.curve || data.curve.length === 0) {
      return
    }

    data.curve.forEach(({ day, retentionPct }) => {
      if (!merged.has(day)) {
        merged.set(day, { day })
      }
      const dayData = merged.get(day)!
      dayData[cohort.label] = retentionPct
    })
  })

  return Array.from(merged.values()).sort((a, b) => (a.day as number) - (b.day as number))
}

/**
 * Create a new cohort with unique ID
 */
export function createNewCohort(startDate: string, endDate: string, existingCohorts: CohortDefinition[]): CohortDefinition {
  const id = `cohort-custom-${Date.now()}`
  const label = `${format(new Date(startDate), "MMM d")} - ${format(new Date(endDate), "MMM d, yyyy")}`
  const color = getCohortColor(existingCohorts.length)

  return { id, label, startDate, endDate, color }
}
