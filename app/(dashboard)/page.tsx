"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
  fetchChatConversations,
  fetchPhotos,
  calculateRetentionCurve,
} from "@/lib/api-client"
import { bucketByDay, bucketByHour, toDayKey, uniqueUsersByDay } from "@/lib/analytics"

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

  const queryClient = useQueryClient()

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

  // Refetch date-dependent data when date range changes (after initial load)
  useEffect(() => {
    if (!globalInitialLoadDone) return
    refetchSessions()
    refetchPhotos()
  }, [dateRange.from, dateRange.to])

  useEffect(() => {
    const loadInitialData = async () => {
      // Check if we've EVER loaded the data (global flag)
      if (globalInitialLoadDone) {
        console.log("[v0] ✅ Using cached data from previous load")
        return
      }

      // Check TanStack Query cache
      const hasCachedSessions = queryClient.getQueryData(["sessions-activity", dateRange.from, dateRange.to])
      const hasCachedUsers = queryClient.getQueryData(["all-users"])
      const hasCachedChats = queryClient.getQueryData(["chat-conversations"])

      if (hasCachedSessions || hasCachedUsers || hasCachedChats) {
        console.log("[v0] ✅ Found existing cache, skipping fetch")
        globalInitialLoadDone = true
        return
      }

      console.log("[v0] 🎯 First load ever: Fetching data...")
      await Promise.all([refetchSessions(), refetchUsers(), refetchRetention(), refetchChats(), refetchPhotos()])
      globalInitialLoadDone = true
      setLastUpdated(new Date())
    }

    loadInitialData()
  }, []) // Empty deps is correct - we only want this on first mount

  const handleReloadAll = async () => {
    console.log("[v0] 🔄 Reload All clicked - forcing fresh data fetch...")
    await Promise.all([refetchSessions(), refetchUsers(), refetchRetention(), refetchChats(), refetchPhotos()])
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
    if (!allUsers?.data) return []
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to)
    to.setHours(23, 59, 59, 999)

    const filteredDates = allUsers.data
      .map((u) => new Date(u.createdAt))
      .filter((d) => d >= from && d <= to)

    const signupsByDay = bucketByDay(filteredDates)

    return Array.from(signupsByDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }, [allUsers, dateRange.from, dateRange.to])

  const dailyData = useMemo(() => {
    const dauByDay = sessionData
      ? uniqueUsersByDay(sessionData.map((s) => ({ userId: s.userId, date: s.startedAt })))
      : new Map()
    const sessionsByDay = sessionData ? bucketByDay(sessionData.map((s) => s.startedAt)) : new Map()
    return Array.from(dauByDay.entries())
      .map(([day, dau]) => ({ day, dau, sessions: sessionsByDay.get(day) || 0 }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }, [sessionData])

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
            label="Avg. DAU"
            value={calculatedDau.toLocaleString()}
            isLoading={sessionsLoading}
            tooltipTitle="Avg. DAU (Daily Active Users)"
            tooltipDescription="Question: 'Combien d'utilisatrices sont actives?' | Who is counted: ✅ All active users ✅ New + returning ❌ No seniority distinction | Definition: Average daily unique users over the selected period | Calculation: For each day in range, count unique userIds with ≥1 tracking_session, then average"
            tooltipHowToRead="Higher = more daily active users"
            tooltipDataCoverage={`From ${sessionData?.length || 0} sessions`}
          />
          <KpiCard
            label="WAU (7 days)"
            value={wau.toLocaleString()}
            isLoading={sessionsLoading}
            tooltipTitle="WAU (Weekly Active Users)"
            tooltipDescription="Question: 'Combien d'utilisatrices sont actives?' | Who is counted: ✅ All active users ✅ New + returning ❌ No seniority distinction | Definition: Active at least once in last 7 days | Calculation: ≥1 tracking_session in 7-day window, count by unique userId"
            tooltipHowToRead="Higher = more weekly engagement"
            tooltipDataCoverage={`From ${sessionData?.length || 0} sessions`}
          />
          <KpiCard
            label="MAU (30 days)"
            value={mau.toLocaleString()}
            isLoading={sessionsLoading}
            tooltipTitle="MAU (Monthly Active Users)"
            tooltipDescription="Question: 'Combien d'utilisatrices sont actives?' | Who is counted: ✅ All active users ✅ New + returning ❌ No seniority distinction | Definition: Active at least once in last 30 days | Calculation: ≥1 tracking_session in 30-day window, count by unique userId"
            tooltipHowToRead="Higher = more monthly engagement"
            tooltipDataCoverage={`From ${sessionData?.length || 0} sessions`}
          />
          <KpiCard
            label="Stickiness"
            value={stickiness > 0 ? `${stickiness}%` : "N/A"}
            isLoading={sessionsLoading}
            tooltipTitle="Stickiness (DAU/MAU)"
            tooltipDescription="Question: 'À quelle fréquence reviennent-elles?' | Who is counted: Based on active users, includes new + returning, not a people count but a ratio | Definition: Stickiness = DAU / MAU | Interpretation: % of monthly users who use the app each day"
            tooltipHowToRead="Higher means users come back more frequently. >20% = very good engagement, >30% = highly sticky product"
            tooltipLimitations="Based on tracking sessions only (does not count passive app opens)"
            tooltipDataCoverage={`Avg. DAU: ${calculatedDau}, MAU: ${mau}`}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            label="Total Users"
            value={(allUsers?.data.length || 0).toLocaleString()}
            isLoading={usersLoading}
            tooltipTitle="Total Users"
            tooltipDescription="Total registered users in the system"
            tooltipHowToRead="Shows user base size"
          />
          <KpiCard
            label="Avg Age"
            value={avgAge > 0 ? `${avgAge} yrs` : "N/A"}
            isLoading={usersLoading}
            tooltipTitle="Average Age"
            tooltipDescription="Average age from users.registrationData.age or birthDate"
            tooltipHowToRead="Shows demographic profile"
            tooltipLimitations="Only users with age/birthDate data"
            tooltipDataCoverage={`${usersWithAge.length} users have age data`}
          />
          <KpiCard
            label="Total Photos"
            value={(photosData?.length || 0).toLocaleString()}
            isLoading={photosLoading}
            tooltipTitle="Total Photos"
            tooltipDescription="Total photos in the photos collection (Endobelly tracking)"
            tooltipHowToRead="Shows photo tracking usage"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Daily New Signups</span>
                <InfoTooltip
                  title="Daily New Signups"
                  description="Number of new users who signed up each day, based on users.createdAt within the selected date range"
                  howToRead="Higher bars indicate more signups that day"
                  dataCoverage={`From ${allUsers?.data.length || 0} total users`}
                />
              </div>
            }
            isLoading={usersLoading}
          >
            <BarChart data={dailySignupsData} xKey="day" yKey="count" color="#7C3AED" maxBars={30} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>{showSessionsChart ? "Sessions per day" : "Daily Active Users (DAU)"}</span>
                <InfoTooltip
                  title={showSessionsChart ? "Sessions per day" : "Daily Active Users"}
                  description={showSessionsChart
                    ? "Total tracking_sessions started each day"
                    : "Number of unique users who started at least one tracking session that day"}
                  howToRead="Higher values indicate more active usage"
                  dataCoverage={`From ${sessionData?.length || 0} sessions`}
                />
                <button
                  onClick={() => setShowSessionsChart(!showSessionsChart)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Toggle
                </button>
              </div>
            }
            isLoading={sessionsLoading}
          >
            <LineChart data={dailyData} xKey="day" lines={[{ key: showSessionsChart ? "sessions" : "dau", color: "#7C3AED" }]} />
          </ChartCard>
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
      </div>
    </div>
  )
}
