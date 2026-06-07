"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays, addDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { LineChart } from "@/components/charts/line-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings2 } from "lucide-react"
import {
  fetchSessionsForActivity,
  fetchUsers,
  fetchTotalUserCount,
  fetchActivityMetrics,
  fetchGa4ActivityMetrics,
  fetchGa4DailyActivity,
  fetchAvgAge,
  fetchDailySignups,
  fetchMonthlySignups,
  fetchChatConversations,
  fetchPhotos,
  fetchPhotoCount,
  calculateRetentionCurve,
} from "@/lib/api-client"
import { bucketByDay, bucketByHour, uniqueUsersByDay } from "@/lib/analytics"
import { GOALS, MONTHLY_SIGNUP_GOALS, totalUsersGoalForMonth } from "@/lib/metric-goals"

let globalInitialLoadDone = false

export default function OverviewPage() {
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date()
    const from = subDays(to, 30)
    return {
      from: formatDate(from, "yyyy-MM-dd"),
      to: formatDate(to, "yyyy-MM-dd"),
    }
  })
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  // Retention curve own controls
  const [retentionCohortStart, setRetentionCohortStart] = useState(dateRange.from)
  const [retentionCohortEnd, setRetentionCohortEnd] = useState(dateRange.to)
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90>(30)

  const [showSessionsChart, setShowSessionsChart] = useState(false)

  const {
    data: sessionData,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ["sessions-activity", dateRange.from, dateRange.to],
    queryFn: () => fetchSessionsForActivity(dateRange.from, dateRange.to),
    enabled: false,
  })

  const {
    data: allUsers,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => fetchUsers({ limitCount: 5000 }),
    enabled: false,
  })

  // Total user count via Firestore count() aggregation — 1 read, instant.
  // Auto-fetches on mount so the headline KPI shows before the heavy
  // `allUsers` query finishes downloading every doc.
  const {
    data: totalUserCount,
    isLoading: totalUserCountLoading,
    refetch: refetchTotalUserCount,
  } = useQuery({
    queryKey: ["users-count"],
    queryFn: () => fetchTotalUserCount(),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  // Total photos via count() — 1 read regardless of how many photos match.
  const {
    data: totalPhotoCount,
    isLoading: totalPhotoCountLoading,
    refetch: refetchTotalPhotoCount,
  } = useQuery({
    queryKey: ["photos-count", dateRange.from, dateRange.to],
    queryFn: () => fetchPhotoCount({ from: dateRange.from, to: dateRange.to }),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  // Activity KPIs (DAU/WAU/MAU/Stickiness) — server-side aggregation from
  // tracking_sessions. Used as the fallback if Firebase Analytics is offline.
  const {
    data: activityMetrics,
    isLoading: activityMetricsLoading,
    refetch: refetchActivityMetrics,
  } = useQuery({
    queryKey: ["activity-metrics", dateRange.from, dateRange.to],
    queryFn: () => fetchActivityMetrics({ from: dateRange.from, to: dateRange.to }),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  // Firebase Analytics (GA4) — the source of truth for "real" DAU/WAU/MAU
  // based on app_open / session_start events that the SDK collects on every
  // launch. Returns null when GA4 isn't reachable, in which case we fall back
  // to the tracking_sessions-based numbers above.
  const {
    data: ga4Metrics,
    isLoading: ga4MetricsLoading,
    refetch: refetchGa4Metrics,
  } = useQuery({
    queryKey: ["ga4-activity"],
    queryFn: () => fetchGa4ActivityMetrics(),
    refetchOnWindowFocus: false,
    staleTime: 15 * 60 * 1000,
  })

  // GA4 daily DAU + sessions, used to render the Daily Active Users chart with
  // real Firebase Analytics numbers. Falls back to the tracking_sessions
  // bucketing below when GA4 returns null.
  const {
    data: ga4Daily,
    isLoading: ga4DailyLoading,
    refetch: refetchGa4Daily,
  } = useQuery({
    queryKey: ["ga4-daily", dateRange.from, dateRange.to],
    queryFn: () => fetchGa4DailyActivity({ from: dateRange.from, to: dateRange.to }),
    refetchOnWindowFocus: false,
    staleTime: 15 * 60 * 1000,
  })

  // Avg Age — server fetches only the registration age field. Auto-fetches.
  const {
    data: avgAgeData,
    isLoading: avgAgeLoading,
    refetch: refetchAvgAge,
  } = useQuery({
    queryKey: ["avg-age"],
    queryFn: () => fetchAvgAge(),
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
  })

  // Daily Firestore signups (users who completed onboarding per day). Cheap:
  // single query, only `createdAt` field read. Drives the bottom stack of the
  // Daily New Downloads chart so we can show the onboarding-completion funnel.
  const {
    data: dailySignupsByDay,
    isLoading: dailySignupsLoading,
    refetch: refetchDailySignups,
  } = useQuery({
    queryKey: ["daily-signups", dateRange.from, dateRange.to],
    queryFn: () => fetchDailySignups({ from: dateRange.from, to: dateRange.to }),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  // Monthly Firestore signups across the whole user base (users.createdAt),
  // bucketed server-side. Drives the "Monthly Signups vs Goal" chart at the
  // bottom of the page. Cheap: only `createdAt` is read.
  const {
    data: monthlySignups,
    isLoading: monthlySignupsLoading,
    refetch: refetchMonthlySignups,
  } = useQuery({
    queryKey: ["monthly-signups"],
    queryFn: () => fetchMonthlySignups(),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: retentionData,
    isLoading: retentionLoading,
    refetch: refetchRetention,
  } = useQuery({
    queryKey: ["retention-curve", retentionCohortStart, retentionCohortEnd, retentionDays],
    queryFn: () => calculateRetentionCurve(retentionCohortStart, retentionCohortEnd, retentionDays),
  })

  const {
    data: chatsData,
    isLoading: chatsLoading,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => fetchChatConversations(),
    enabled: false,
  })

  const {
    data: photosData,
    isLoading: photosLoading,
    refetch: refetchPhotos,
  } = useQuery({
    queryKey: ["photos", dateRange.from, dateRange.to],
    queryFn: () => fetchPhotos(dateRange.from, dateRange.to),
    enabled: false,
  })

  // Heavy charts are lazy-loaded: nothing auto-fetches on mount except the
  // cheap Total Users count() above. The user explicitly triggers everything
  // else via the "Reload All" button, then date changes refetch the date-bound
  // queries (sessions, photos) as before.
  useEffect(() => {
    if (!globalInitialLoadDone) return
    refetchSessions()
    refetchPhotos()
  }, [dateRange.from, dateRange.to])

  const handleReloadAll = async () => {
    console.log("[v0] 🔄 Reload All clicked - forcing fresh data fetch...")
    await Promise.all([
      refetchTotalUserCount(),
      refetchTotalPhotoCount(),
      refetchActivityMetrics(),
      refetchGa4Metrics(),
      refetchGa4Daily(),
      refetchAvgAge(),
      refetchDailySignups(),
      refetchMonthlySignups(),
      refetchSessions(),
      refetchUsers(),
      refetchRetention(),
      refetchChats(),
      refetchPhotos(),
    ])
    globalInitialLoadDone = true
    setLastUpdated(new Date())
  }

  const hourChartData = useMemo(() => {
    const hourData = sessionData ? bucketByHour(sessionData.map((s) => s.startedAt)) : new Array(24).fill(0)
    return Array.from({ length: 24 }, (_, hour) => ({
      name: `${hour}h`,
      value: hourData[hour] || 0,
    }))
  }, [sessionData])

  const platformData = useMemo(() => {
    const userPlatformCounts =
      allUsers?.data.reduce(
        (acc, u) => {
          const platform = u.metadata?.platform || "unknown"
          acc[platform] = (acc[platform] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ) || {}
    return Object.entries(userPlatformCounts).map(([name, value]) => ({ name, value }))
  }, [allUsers])

  const dailySignupsData = useMemo(() => {
    // Build a per-day funnel row: { day, downloads, completed, incomplete }.
    // The chart stacks `completed` (bottom) and `incomplete` (top) so the
    // total height = downloads. `incomplete` is computed as max(0, dl - done)
    // because the two metrics can drift (a user can download on D1 and
    // complete on D2, so day-level counts aren't strictly nested).
    const downloadsByDay = new Map<string, number>()
    if (ga4Daily) {
      for (const row of ga4Daily) downloadsByDay.set(row.date, row.newUsers)
    }

    const completedByDay = new Map<string, number>()
    if (dailySignupsByDay) {
      for (const row of dailySignupsByDay) completedByDay.set(row.date, row.count)
    } else if (allUsers?.data) {
      // Fallback before the cheap query loads: derive from the heavy allUsers
      // fetch if it happens to be in the cache.
      const from = new Date(dateRange.from)
      const to = new Date(dateRange.to)
      to.setHours(23, 59, 59, 999)
      const dates = allUsers.data
        .map((u) => new Date(u.createdAt))
        .filter((d) => d >= from && d <= to)
      for (const [day, count] of bucketByDay(dates).entries()) {
        completedByDay.set(day, count)
      }
    }

    const allDays = new Set<string>([...downloadsByDay.keys(), ...completedByDay.keys()])
    return [...allDays]
      .sort()
      .map((day) => {
        const downloads = downloadsByDay.get(day) || 0
        const completed = completedByDay.get(day) || 0
        const incomplete = Math.max(0, downloads - completed)
        return { day, downloads, completed, incomplete }
      })
  }, [ga4Daily, dailySignupsByDay, allUsers, dateRange.from, dateRange.to])

  const monthlySignupsData = useMemo(() => {
    // One row per month: actual signups + the team's acquisition goal (when set).
    // Goal-only months with no signups yet (e.g. an upcoming month) are still
    // included so the upcoming target shows on the chart.
    const counts = new Map<string, number>()
    for (const row of monthlySignups ?? []) counts.set(row.month, row.count)

    const months = new Set<string>([...counts.keys(), ...Object.keys(MONTHLY_SIGNUP_GOALS)])
    return [...months].sort().map((month) => ({
      month,
      label: formatDate(new Date(`${month}-01T00:00:00`), "MMM yyyy"),
      signups: counts.get(month) ?? 0,
      goal: MONTHLY_SIGNUP_GOALS[month],
    }))
  }, [monthlySignups])

  // Total Users goal bar: the running total at the start of the current month
  // plus this month's acquisition goal. Recomputes automatically each month
  // from today's date. Null (no bar) until the monthly data has loaded.
  const totalUsersGoal = useMemo(() => {
    if (!monthlySignups) return null
    return totalUsersGoalForMonth(monthlySignups, formatDate(new Date(), "yyyy-MM"))
  }, [monthlySignups])

  const dailyData = useMemo(() => {
    // Prefer Firebase Analytics rows when available — that's the canonical
    // source for DAU. The legacy bucketing from tracking_sessions only kicks
    // in if GA4 isn't reachable.
    if (ga4Daily && ga4Daily.length > 0) {
      return ga4Daily
        .map((row) => ({ day: row.date, dau: row.dau, sessions: row.sessions }))
        .sort((a, b) => a.day.localeCompare(b.day))
    }
    const dauByDay = sessionData
      ? uniqueUsersByDay(sessionData.map((s) => ({ userId: s.userId, date: s.startedAt })))
      : new Map()
    const sessionsByDay = sessionData ? bucketByDay(sessionData.map((s) => s.startedAt)) : new Map()
    return Array.from(dauByDay.entries())
      .map(([day, dau]) => ({ day, dau, sessions: sessionsByDay.get(day) || 0 }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }, [ga4Daily, sessionData])

  const retentionChartData = useMemo(() => {
    if (!retentionData?.curve || retentionData.curve.length === 0) return []
    const cohortStartDate = new Date(retentionCohortStart + "T00:00:00")
    const cohortEndDate = new Date(retentionCohortEnd + "T00:00:00")
    return retentionData.curve.map((point) => {
      const rangeStart = addDays(cohortStartDate, point.day)
      const rangeEnd = addDays(cohortEndDate, point.day)
      const startMonth = formatDate(rangeStart, "MMM")
      const endMonth = formatDate(rangeEnd, "MMM")
      const startDay = formatDate(rangeStart, "d")
      const endDay = formatDate(rangeEnd, "d")
      const dateLabel = startMonth === endMonth
        ? `${startMonth} ${startDay}-${endDay}`
        : `${startMonth} ${startDay} - ${endMonth} ${endDay}`
      return {
        day: point.day,
        retentionPct: point.retentionPct,
        retainedCount: point.retainedCount,
        label: `D${point.day} (${dateLabel})`,
      }
    })
  }, [retentionData, retentionCohortStart, retentionCohortEnd])

  const retentionMetadata = useMemo(() => {
    if (!retentionData) return null

    if (retentionData.error) {
      return { error: retentionData.error }
    }

    return {
      cohortSize: retentionData.cohortSize,
      periodStart: retentionData.periodStart,
      periodEnd: retentionData.periodEnd,
      d1: retentionData.curve.find((r) => r.day === 1)?.retentionPct,
      d7: retentionData.curve.find((r) => r.day === 7)?.retentionPct,
      d30: retentionData.curve.find((r) => r.day === 30)?.retentionPct,
    }
  }, [retentionData])

  // Surface the D1/D7/D30 milestones from the retention curve as headline cards,
  // each scored against its health-app benchmark. d30 is only populated when the
  // retention window is ≥ 30 days; otherwise the card reads N/A (no goal bar).
  const retentionMilestones = [
    {
      label: "D1 Retention",
      pct: retentionMetadata?.d1,
      goal: GOALS.retentionD1,
      tooltipTitle: "Day 1 Retention",
      tooltipDescription: "% of the signup cohort active exactly 1 day after signing up.",
      tooltipHowToRead: "Measures the onboarding hook. Benchmark for daily-habit health apps ≈ 25%.",
    },
    {
      label: "D7 Retention",
      pct: retentionMetadata?.d7,
      goal: GOALS.retentionD7,
      tooltipTitle: "Day 7 Retention",
      tooltipDescription: "% of the signup cohort still active 7 days after signing up.",
      tooltipHowToRead: "The 'did the habit stick' check. Benchmark ≈ 15%.",
    },
    {
      label: "D30 Retention",
      pct: retentionMetadata?.d30,
      goal: GOALS.retentionD30,
      tooltipTitle: "Day 30 Retention",
      tooltipDescription: "% of the signup cohort still active 30 days after signing up.",
      tooltipHowToRead: "Long-term stickiness / PMF signal. Benchmark ≈ 10%. Needs a ≥30-day window.",
    },
  ]

  const {
    wau,
    mau,
    currentDau: calculatedDau,
  } = useMemo(() => {
    if (!sessionData) return { wau: 0, mau: 0, currentDau: 0 }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sevenDaysAgo = subDays(today, 7)
    const thirtyDaysAgo = subDays(today, 30)

    // Avg DAU = average unique users per day over the selected date range
    const dailyUsers = new Map<string, Set<string>>()
    sessionData.forEach((s) => {
      const sessionDate = new Date(s.startedAt)
      const dayKey = `${sessionDate.getFullYear()}-${sessionDate.getMonth()}-${sessionDate.getDate()}`
      if (!dailyUsers.has(dayKey)) dailyUsers.set(dayKey, new Set())
      dailyUsers.get(dayKey)!.add(s.userId)
    })
    const avgDau = dailyUsers.size > 0
      ? Math.round([...dailyUsers.values()].reduce((sum, users) => sum + users.size, 0) / dailyUsers.size)
      : 0

    // WAU = unique users with sessions in last 7 days
    const wauSet = new Set(sessionData.filter((s) => s.startedAt >= sevenDaysAgo).map((s) => s.userId))

    // MAU = unique users with sessions in last 30 days
    const mauSet = new Set(sessionData.filter((s) => s.startedAt >= thirtyDaysAgo).map((s) => s.userId))

    console.log("[v0] 📊 Activity metrics:", {
      avgDau,
      wau: wauSet.size,
      mau: mauSet.size,
      daysWithData: dailyUsers.size,
      sevenDaysAgo: sevenDaysAgo.toISOString(),
      thirtyDaysAgo: thirtyDaysAgo.toISOString(),
    })

    return {
      wau: wauSet.size,
      mau: mauSet.size,
      currentDau: avgDau,
    }
  }, [sessionData])

  const stickiness = useMemo(() => {
    if (mau === 0) return 0
    const ratio = (calculatedDau / mau) * 100
    // Cap at 100% to ensure it never exceeds maximum possible value
    return Math.min(Math.round(ratio), 100)
  }, [calculatedDau, mau])

  // Resolved stickiness shown on the KPI card (GA4 first, then tracking-session
  // fallbacks). Drives the goal bar against the 20% "sticky" benchmark.
  const stickinessValue = ga4Metrics?.stickiness ?? activityMetrics?.stickiness ?? stickiness

  const { avgAge, ageChartData, usersWithAge } = useMemo(() => {
    if (!allUsers?.data) {
      return { avgAge: 0, ageChartData: [], usersWithAge: [] }
    }

    const usersWithAgeData = allUsers.data.filter((u) => {
      if (u.registrationData?.age) return true
      if (u.birthDate) return true
      return false
    })

    const calculatedAvgAge =
      usersWithAgeData.length > 0
        ? Math.round(
            usersWithAgeData.reduce((sum, u) => {
              if (u.registrationData?.age) {
                const age = Number.parseInt(u.registrationData.age)
                return sum + (isNaN(age) ? 0 : age)
              }
              if (u.birthDate) {
                const age = new Date().getFullYear() - new Date(u.birthDate).getFullYear()
                return sum + age
              }
              return sum
            }, 0) / usersWithAgeData.length,
          )
        : 0

    const ageBuckets = ["<18", "18-24", "25-34", "35-44", "45+", "Unknown"]
    const ageDistribution = usersWithAgeData.reduce(
      (acc, u) => {
        let age = 0
        if (u.registrationData?.age) {
          age = Number.parseInt(u.registrationData.age)
        } else if (u.birthDate) {
          age = new Date().getFullYear() - new Date(u.birthDate).getFullYear()
        }

        if (age === 0 || isNaN(age)) {
          acc["Unknown"] = (acc["Unknown"] || 0) + 1
          return acc
        }

        const bucket = age < 18 ? "<18" : age < 25 ? "18-24" : age < 35 ? "25-34" : age < 45 ? "35-44" : "45+"
        acc[bucket] = (acc[bucket] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const chartData = ageBuckets
      .map((bucket) => ({
        name: bucket,
        value: ageDistribution[bucket] || 0,
      }))
      .filter((d) => d.value > 0)

    return {
      avgAge: calculatedAvgAge,
      ageChartData: chartData,
      usersWithAge: usersWithAgeData,
    }
  }, [allUsers])

  const { totalConversations, totalMessages, avgMessagesPerConv } = useMemo(() => {
    const convCount = chatsData?.conversations?.length || 0
    const msgCount = chatsData?.totalMessages || 0
    const avgMsg = convCount > 0 ? (msgCount / convCount).toFixed(1) : "0"
    return {
      totalConversations: convCount,
      totalMessages: msgCount,
      avgMessagesPerConv: avgMsg,
    }
  }, [chatsData])

  const { avgDailyTimePerActiveUser, avgSessionDuration } = useMemo(() => {
    if (!sessionData || sessionData.length === 0) {
      return { avgDailyTimePerActiveUser: 0, avgSessionDuration: 0 }
    }

    // 1. Calculate avg session duration
    const totalDurationMs = sessionData.reduce((sum, s) => sum + (s.durationMs || 0), 0)
    const avgSessionMs = totalDurationMs / sessionData.length
    const avgSessionMinutes = Math.round(avgSessionMs / (1000 * 60))

    // 2. Calculate avg daily time per active user
    // Group by user and day, sum durations per user-day
    const userDayTimes: Record<string, Record<string, number>> = {}

    sessionData.forEach((session) => {
      const userId = session.userId
      const day = formatDate(session.startedAt, "yyyy-MM-dd")
      const durationMs = session.durationMs || 0

      if (!userDayTimes[userId]) {
        userDayTimes[userId] = {}
      }
      userDayTimes[userId][day] = (userDayTimes[userId][day] || 0) + durationMs
    })

    // Count total user-day pairs with activity
    let totalUserDayPairs = 0
    let totalDailyTimeMs = 0

    Object.values(userDayTimes).forEach((dayTimes) => {
      Object.values(dayTimes).forEach((timeMs) => {
        if (timeMs > 0) {
          totalUserDayPairs++
          totalDailyTimeMs += timeMs
        }
      })
    })

    const avgDailyMs = totalUserDayPairs > 0 ? totalDailyTimeMs / totalUserDayPairs : 0
    const avgDailyMinutes = Math.round(avgDailyMs / (1000 * 60))

    console.log("[v0] 📊 Time metrics:", {
      avgSessionDuration: avgSessionMinutes,
      avgDailyTimePerActiveUser: avgDailyMinutes,
      totalUserDayPairs,
      totalSessions: sessionData.length,
    })

    return {
      avgDailyTimePerActiveUser: avgDailyMinutes,
      avgSessionDuration: avgSessionMinutes,
    }
  }, [sessionData])

  return (
    <div className="flex flex-col">
      <Header
        title="Overview"
        description="Key metrics and trends"
        lastUpdated={lastUpdated}
        onReloadAll={handleReloadAll}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="DAU"
            value={(ga4Metrics?.active1Day ?? activityMetrics?.avgDau ?? calculatedDau).toLocaleString()}
            isLoading={(ga4MetricsLoading || activityMetricsLoading) && !ga4Metrics && !activityMetrics}
            tooltipTitle="DAU (Daily Active Users)"
            tooltipDescription={
              ga4Metrics
                ? `Source: Firebase Analytics (GA4 active1DayUsers). Counts unique users who triggered any event (app_open/session_start) yesterday. As of ${ga4Metrics.asOfDate}.`
                : "Source: tracking_sessions (fallback). Counts unique users with ≥1 tracking_session per day, averaged over the selected range."
            }
            tooltipHowToRead="Higher = more daily active users. GA4 numbers reflect every app launch, not just tracking activity."
          />
          <KpiCard
            label="WAU (7 days)"
            value={(ga4Metrics?.active7Day ?? activityMetrics?.wau ?? wau).toLocaleString()}
            isLoading={(ga4MetricsLoading || activityMetricsLoading) && !ga4Metrics && !activityMetrics}
            tooltipTitle="WAU (Weekly Active Users)"
            tooltipDescription={
              ga4Metrics
                ? `Source: Firebase Analytics (GA4 active7DayUsers). Unique users active in the last 7 days as of ${ga4Metrics.asOfDate}.`
                : "Source: tracking_sessions (fallback). Unique userIds with ≥1 tracking_session in last 7 days."
            }
            tooltipHowToRead="Higher = more weekly engagement"
          />
          <KpiCard
            label="MAU (28 days)"
            value={(ga4Metrics?.active28Day ?? activityMetrics?.mau ?? mau).toLocaleString()}
            isLoading={(ga4MetricsLoading || activityMetricsLoading) && !ga4Metrics && !activityMetrics}
            tooltipTitle="MAU (Monthly Active Users)"
            tooltipDescription={
              ga4Metrics
                ? `Source: Firebase Analytics (GA4 active28DayUsers). Google uses 28 days (not 30) to align with calendar weeks. As of ${ga4Metrics.asOfDate}.`
                : "Source: tracking_sessions (fallback). Unique userIds with ≥1 tracking_session in last 30 days."
            }
            tooltipHowToRead="Higher = more monthly engagement"
          />
          <KpiCard
            label="Stickiness"
            value={stickinessValue > 0 ? `${stickinessValue}%` : "N/A"}
            numericValue={stickinessValue > 0 ? stickinessValue : undefined}
            target={stickinessValue > 0 ? GOALS.stickiness.target : undefined}
            goalLabel={GOALS.stickiness.label}
            isLoading={(ga4MetricsLoading || activityMetricsLoading) && !ga4Metrics && !activityMetrics}
            tooltipTitle="Stickiness (DAU / MAU)"
            tooltipDescription={
              ga4Metrics
                ? `Source: Firebase Analytics (GA4 dauPerMau). Ratio of daily to monthly active users as of ${ga4Metrics.asOfDate}.`
                : "Source: tracking_sessions (fallback). Computed Avg DAU / MAU."
            }
            tooltipHowToRead="Higher means users come back more frequently. >20% very good, >30% highly sticky."
            tooltipLimitations={
              ga4Metrics
                ? "GA4 stickiness can be slightly noisy on small audiences."
                : "Based on tracking sessions only — doesn't count passive app opens."
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            label="Total Users"
            value={(totalUserCount ?? allUsers?.data.length ?? 0).toLocaleString()}
            numericValue={totalUserCount ?? allUsers?.data.length}
            target={totalUsersGoal?.target}
            goalLabel={totalUsersGoal?.label}
            isLoading={totalUserCountLoading && !totalUserCount}
            tooltipTitle="Total Users"
            tooltipDescription="Total registered users in the system"
            tooltipHowToRead="Shows user base size. Goal = total users at the start of the current month + this month's acquisition target. It rolls forward automatically each month."
            tooltipDataCoverage={totalUsersGoal ? `This month's target: ${totalUsersGoal.target.toLocaleString()}` : undefined}
          />
          <KpiCard
            label="Avg Age"
            value={(() => {
              const v = avgAgeData?.avgAge ?? avgAge
              return v > 0 ? `${v} yrs` : "N/A"
            })()}
            isLoading={avgAgeLoading && !avgAgeData}
            tooltipTitle="Average Age"
            tooltipDescription="Average age from users.registrationData.age or birthDate"
            tooltipHowToRead="Shows demographic profile"
            tooltipLimitations="Only users with age/birthDate data"
            tooltipDataCoverage={`${avgAgeData?.sampleSize ?? usersWithAge.length} users have age data`}
          />
          <KpiCard
            label="Total Photos"
            value={(totalPhotoCount ?? photosData?.length ?? 0).toLocaleString()}
            isLoading={totalPhotoCountLoading && totalPhotoCount === undefined}
            tooltipTitle="Total Photos"
            tooltipDescription="Total photos in the photos collection (Endobelly tracking) in the selected date range"
            tooltipHowToRead="Shows photo tracking usage"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Daily New Downloads</span>
                <InfoTooltip
                  title="Daily New Downloads"
                  description="Funnel per day: total bar height = downloads (GA4 first_open events). Bottom segment = users who completed onboarding (users.createdAt). Top segment = downloaded but didn't finish onboarding."
                  howToRead="Bottom = registered users, top = drop-off after install"
                  dataCoverage={
                    ga4Daily
                      ? `GA4 · ${ga4Daily.length} days · Firestore signups: ${dailySignupsByDay?.length ?? 0} days`
                      : `Firestore signups only — GA4 unavailable`
                  }
                />
              </div>
            }
            isLoading={
              (ga4DailyLoading && !ga4Daily) || (dailySignupsLoading && !dailySignupsByDay)
            }
          >
            <BarChart
              data={dailySignupsData}
              xKey="day"
              yKey="downloads"
              maxBars={30}
              stacks={[
                { key: "completed", color: "#7C3AED", label: "Completed Onboarding" },
                { key: "incomplete", color: "#3B82F6", label: "Downloaded — No Onboarding" },
              ]}
            />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>{showSessionsChart ? "Sessions per day" : "Daily Active Users (DAU)"}</span>
                <InfoTooltip
                  title={showSessionsChart ? "Sessions per day" : "Daily Active Users"}
                  description={
                    ga4Daily
                      ? showSessionsChart
                        ? "Total Firebase Analytics sessions per day"
                        : "Firebase Analytics activeUsers per day (counts unique users with ≥1 engaged session)"
                      : showSessionsChart
                        ? "Total tracking_sessions started each day (fallback — GA4 unavailable)"
                        : "Unique users with ≥1 tracking_session per day (fallback — GA4 unavailable)"
                  }
                  howToRead="Higher values indicate more active usage"
                  dataCoverage={
                    ga4Daily
                      ? `Firebase Analytics · ${ga4Daily.length} days`
                      : `From ${sessionData?.length || 0} tracking sessions`
                  }
                />
                <button
                  onClick={() => setShowSessionsChart(!showSessionsChart)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Toggle
                </button>
              </div>
            }
            isLoading={(ga4DailyLoading && !ga4Daily) || (sessionsLoading && !ga4Daily)}
          >
            <LineChart data={dailyData} xKey="day" lines={[{ key: showSessionsChart ? "sessions" : "dau", color: "#7C3AED" }]} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {retentionMilestones.map((m) => (
            <KpiCard
              key={m.label}
              label={m.label}
              value={m.pct != null ? `${Math.round(m.pct)}%` : "N/A"}
              numericValue={m.pct != null ? m.pct : undefined}
              target={m.pct != null ? m.goal.target : undefined}
              goalLabel={m.goal.label}
              isLoading={retentionLoading}
              tooltipTitle={m.tooltipTitle}
              tooltipDescription={m.tooltipDescription}
              tooltipHowToRead={m.tooltipHowToRead}
              tooltipLimitations="Cohort-based. Set the cohort range and retention window in the Retention Curve settings below."
              tooltipDataCoverage={
                retentionMetadata?.cohortSize != null
                  ? `Cohort: ${retentionMetadata.cohortSize} users (${retentionMetadata.periodStart} → ${retentionMetadata.periodEnd})`
                  : retentionMetadata?.error || undefined
              }
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>{`Retention Curve (D0-D${retentionDays})`}</span>
                {retentionMetadata?.cohortSize != null && (
                  <span className="text-sm font-normal text-muted-foreground">
                    · {retentionMetadata.cohortSize} users
                  </span>
                )}
                <InfoTooltip
                  title="Retention Curve (D1/D7/D30)"
                  description="Question: 'Parmi celles inscrites à T0, combien reviennent à T+X?' | Who is counted: ✅ Only new signups from specific cohort ❌ Never existing users ❌ Never signups after T0 | Definition: Cohort = users signed up at given date/period. Retention D+X = % of cohort active exactly X days after signup | Calculation: users.createdAt ∈ cohort AND tracking_sessions.startedAt = createdAt + X days"
                  howToRead="Higher line = better retention. D0=signup day. Each point = % of original cohort still active. Look for D1, D7, D30 milestones."
                  dataCoverage={
                    retentionMetadata?.error
                      ? retentionMetadata.error
                      : retentionMetadata
                        ? `Cohort: ${retentionMetadata.cohortSize} users (${retentionMetadata.periodStart} to ${retentionMetadata.periodEnd}). Retention calculated on total cohort size.`
                        : "Loading..."
                  }
                  limitations="Max 30 days period, max 2000 users. Points only shown when data available (never 0% for missing data). Cohort-based metric, different from Returning Users."
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" aria-label="Retention settings">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto" align="end">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Cohort date range</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={retentionCohortStart}
                            onChange={(e) => setRetentionCohortStart(e.target.value)}
                            className="h-7 w-[130px] text-xs"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            type="date"
                            value={retentionCohortEnd}
                            onChange={(e) => setRetentionCohortEnd(e.target.value)}
                            className="h-7 w-[130px] text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Retention window</label>
                        <div className="flex items-center gap-1">
                          {([7, 30, 90] as const).map((d) => (
                            <Button
                              key={d}
                              variant={retentionDays === d ? "default" : "outline"}
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setRetentionDays(d)}
                            >
                              {d}d
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            }
            isLoading={retentionLoading}
          >
            {retentionMetadata?.error ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                {retentionMetadata.error}
              </div>
            ) : (
              <LineChart
                data={retentionChartData}
                xKey="label"
                lines={[{ key: "retentionPct", color: "#2ED47A" }]}
                tooltipFormatter={(value, point) => {
                  const retainedCount = typeof point.retainedCount === 'number' ? point.retainedCount : null
                  return `${value}%${retainedCount != null ? ` (${retainedCount} users)` : ""}`
                }}
              />
            )}
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Peak usage hour</span>
                <InfoTooltip
                  title="Peak usage hour"
                  description="Distribution of session start times by hour (Europe/Paris timezone)"
                  howToRead="Peaks show when users are most active"
                  dataCoverage={`From ${sessionData?.length || 0} sessions`}
                />
              </div>
            }
            isLoading={sessionsLoading}
          >
            <BarChart data={hourChartData} xKey="name" yKey="value" color="#F59E0B" />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Age Distribution</span>
                <InfoTooltip
                  title="Age Distribution"
                  description="Distribution of users by age brackets from registrationData.age or birthDate"
                  howToRead="Pie slices show age group proportions. Larger slice = more users in that age range."
                  limitations="Only users with age/birthDate data"
                  dataCoverage={`${usersWithAge.length} of ${allUsers?.data.length || 0} users have age data`}
                />
              </div>
            }
            isLoading={usersLoading}
          >
            <PieChart data={ageChartData} nameKey="name" valueKey="value" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Platform Distribution</span>
                <InfoTooltip
                  title="Platform Distribution"
                  description="Distribution of users by platform (iOS/Android) from users.metadata.platform"
                  howToRead="Pie slices show platform share. Larger slice = more users."
                  dataCoverage={`From ${allUsers?.data.length || 0} users`}
                />
              </div>
            }
            isLoading={usersLoading}
          >
            <PieChart data={platformData} nameKey="name" valueKey="value" />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <KpiCard
            label="Total Conversations"
            value={totalConversations.toLocaleString()}
            isLoading={chatsLoading}
            tooltipTitle="Total Conversations"
            tooltipDescription="Total chat conversations from chat_conversations collection"
            tooltipHowToRead="Shows chat engagement"
          />
          <KpiCard
            label="Total Messages"
            value={totalMessages.toLocaleString()}
            isLoading={chatsLoading}
            tooltipTitle="Total Messages"
            tooltipDescription="Total messages across all conversations"
            tooltipHowToRead="Shows chat volume"
          />
          <KpiCard
            label="Avg Messages/Conv"
            value={avgMessagesPerConv}
            isLoading={chatsLoading}
            tooltipTitle="Average Messages per Conversation"
            tooltipDescription="Average number of messages per conversation"
            tooltipHowToRead="Higher means longer conversations"
          />
          <KpiCard
            label="Avg Daily Time"
            value={avgDailyTimePerActiveUser > 0 ? `${avgDailyTimePerActiveUser} min` : "N/A"}
            isLoading={sessionsLoading}
            tooltipTitle="Average Daily Time per Active User"
            tooltipDescription="Formula: SUM(dailyTimeMs over all users and days) / COUNT(user-day pairs where dailyTimeMs > 0). Interpretation: On average, an active user spends X minutes per day in the app."
            tooltipHowToRead="Higher means users spend more time per day. Good engagement metric."
            tooltipDataCoverage={`From ${sessionData?.length || 0} sessions`}
          />
          <KpiCard
            label="Avg Session Duration"
            value={avgSessionDuration > 0 ? `${avgSessionDuration} min` : "N/A"}
            isLoading={sessionsLoading}
            tooltipTitle="Average Session Duration"
            tooltipDescription="Formula: AVG(durationMs) across all tracking sessions. Shows average length of a single app usage session."
            tooltipHowToRead="Higher means users spend more time per session. Indicates depth of engagement."
            tooltipDataCoverage={`From ${sessionData?.length || 0} sessions`}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Monthly Signups vs Goal</span>
                <InfoTooltip
                  title="Monthly Signups vs Goal"
                  description="New user signups per calendar month (users.createdAt, Europe/Paris) compared to the team's monthly acquisition target."
                  howToRead="Purple = users acquired that month. Green = the goal for that month. Goals are only shown for months that have a target set."
                  dataCoverage={`${monthlySignups?.length ?? 0} months with signups · goals: ${Object.keys(MONTHLY_SIGNUP_GOALS).join(", ")}`}
                />
              </div>
            }
            isLoading={monthlySignupsLoading && !monthlySignups}
          >
            <BarChart
              data={monthlySignupsData}
              xKey="label"
              yKey="signups"
              compareKey="goal"
              layout="vertical"
              color="#7C3AED"
              compareColor="#2ED47A"
              mainLabel="Signups"
              compareLabel="Goal"
            />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
