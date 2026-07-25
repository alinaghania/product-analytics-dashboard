import { format, toZonedTime } from "date-fns-tz"

const TIMEZONE = "Europe/Paris"

// Convert Firestore Timestamp/Date to Europe/Paris DayKey (yyyy-MM-dd)
export function toDayKey(date: Date): string {
  const parisDate = toZonedTime(date, TIMEZONE)
  return format(parisDate, "yyyy-MM-dd", { timeZone: TIMEZONE })
}

// Get hour (0-23) in Europe/Paris
export function toHour(date: Date): number {
  const parisDate = toZonedTime(date, TIMEZONE)
  return parisDate.getHours()
}

// Bucket dates by day, return Map<dayKey, count>
export function bucketByDay(dates: Date[]): Map<string, number> {
  const map = new Map<string, number>()
  dates.forEach((date) => {
    const dayKey = toDayKey(date)
    map.set(dayKey, (map.get(dayKey) || 0) + 1)
  })
  return map
}

// Group records into a Map<dayKey, Set<userId>>
function userSetsByDay(records: { userId: string; date: Date }[]): Map<string, Set<string>> {
  const dayUserSets = new Map<string, Set<string>>()
  records.forEach(({ userId, date }) => {
    const dayKey = toDayKey(date)
    if (!dayUserSets.has(dayKey)) {
      dayUserSets.set(dayKey, new Set())
    }
    dayUserSets.get(dayKey)!.add(userId)
  })
  return dayUserSets
}

// Count unique users per day
export function uniqueUsersByDay(records: { userId: string; date: Date }[]): Map<string, number> {
  const result = new Map<string, number>()
  userSetsByDay(records).forEach((userSet, dayKey) => {
    result.set(dayKey, userSet.size)
  })
  return result
}

// Unique users over a rolling N-day window ending on each day present in the
// records. Days near the start of the dataset undercount: the window can only
// see days that were fetched.
export function rollingUniqueUsersByDay(
  records: { userId: string; date: Date }[],
  windowDays = 7,
): Map<string, number> {
  const dayUserSets = userSetsByDay(records)

  const result = new Map<string, number>()
  dayUserSets.forEach((_, dayKey) => {
    const windowUsers = new Set<string>()
    const dayStart = new Date(`${dayKey}T12:00:00Z`)
    for (let offset = 0; offset < windowDays; offset++) {
      const windowDay = new Date(dayStart.getTime() - offset * 24 * 60 * 60 * 1000)
      const windowKey = windowDay.toISOString().slice(0, 10)
      dayUserSets.get(windowKey)?.forEach((userId) => windowUsers.add(userId))
    }
    result.set(dayKey, windowUsers.size)
  })
  return result
}

// Bucket by hour (0-23), return array of 24 counts
export function bucketByHour(dates: Date[]): number[] {
  const hourCounts = new Array(24).fill(0)
  dates.forEach((date) => {
    const hour = toHour(date)
    hourCounts[hour]++
  })
  return hourCounts
}

// Get top N items by count
export function topNCounts<T>(
  values: T[],
  N: number,
  keyFn: (v: T) => string = (v) => String(v),
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  values.forEach((val) => {
    const key = keyFn(val)
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, N)
}

// Calculate retention for cohort
export function calculateRetention(
  users: { id: string; createdAt: Date }[],
  sessions: { userId: string; startedAt: Date }[],
  daysAfter: number,
): number {
  if (users.length === 0) return 0

  let retainedCount = 0
  users.forEach((user) => {
    const targetDayKey = toDayKey(new Date(user.createdAt.getTime() + daysAfter * 24 * 60 * 60 * 1000))
    const hasSessionOnTargetDay = sessions.some((s) => s.userId === user.id && toDayKey(s.startedAt) === targetDayKey)
    if (hasSessionOnTargetDay) retainedCount++
  })

  return Math.round((retainedCount / users.length) * 1000) / 10
}
