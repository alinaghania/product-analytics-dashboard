"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { fetchUsers } from "@/lib/firestore-queries"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"

export default function GamificationPage() {
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date()
    const from = subDays(to, 14)
    return {
      from: formatDate(from, "yyyy-MM-dd"),
      to: formatDate(to, "yyyy-MM-dd"),
    }
  })
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const {
    data: usersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["gamification-analytics", dateRange.from, dateRange.to],
    queryFn: () => fetchUsers({ limitCount: 5000 }),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const users = usersData?.data || []

  // G1: Level distribution
  const levels = users
    .map((u) => {
      const data = u.registrationData as any
      return data?.gamification?.currentLevel ?? data?.gamification?.level ?? 0
    })
    .filter((level) => level > 0)

  const levelCounts: Record<string, number> = {}
  levels.forEach((level) => {
    const key = level >= 10 ? "10+" : level.toString()
    levelCounts[key] = (levelCounts[key] || 0) + 1
  })
  const levelData = Object.entries(levelCounts)
    .sort((a, b) => {
      if (a[0] === "10+") return 1
      if (b[0] === "10+") return -1
      return Number(a[0]) - Number(b[0])
    })
    .map(([name, count]) => ({ name: `Level ${name}`, count }))

  // G2: Mission completion
  const missionStats = users.map((u) => {
    const data = u.registrationData as any
    const activeMissions = data?.gamification?.activeMissions?.length || 0
    const completedMissions = data?.gamification?.completedMissions?.length || 0
    return { activeMissions, completedMissions }
  })

  const avgCompletedMissions =
    users.length > 0
      ? Math.round((missionStats.reduce((sum, s) => sum + s.completedMissions, 0) / users.length) * 10) / 10
      : 0

  const missionBuckets = [
    { range: "0", count: missionStats.filter((s) => s.completedMissions === 0).length },
    { range: "1-2", count: missionStats.filter((s) => s.completedMissions >= 1 && s.completedMissions <= 2).length },
    { range: "3-5", count: missionStats.filter((s) => s.completedMissions >= 3 && s.completedMissions <= 5).length },
    { range: "6+", count: missionStats.filter((s) => s.completedMissions >= 6).length },
  ]

  // G3: Meal analysis usage by month
  const mealAnalysisByMonth: Record<string, { totalCount: number; uniqueUsers: number }> = {}
  users.forEach((u) => {
    const data = u.registrationData as any
    const period = data?.mealAnalysisPeriod as string
    const count = data?.mealAnalysisCountMonthly as number
    if (period && count > 0) {
      if (!mealAnalysisByMonth[period]) {
        mealAnalysisByMonth[period] = { totalCount: 0, uniqueUsers: 0 }
      }
      mealAnalysisByMonth[period].totalCount += count
      mealAnalysisByMonth[period].uniqueUsers += 1
    }
  })
  const mealAnalysisData = Object.entries(mealAnalysisByMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({ month, ...stats }))

  // G4: Message usage by month
  const messagesByMonth: Record<string, { totalCount: number; uniqueUsers: number }> = {}
  users.forEach((u) => {
    const data = u.registrationData as any
    const period = data?.messagePeriod as string
    const count = data?.messageCountMonthly as number
    if (period && count > 0) {
      if (!messagesByMonth[period]) {
        messagesByMonth[period] = { totalCount: 0, uniqueUsers: 0 }
      }
      messagesByMonth[period].totalCount += count
      messagesByMonth[period].uniqueUsers += 1
    }
  })
  const messagesData = Object.entries(messagesByMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({ month, ...stats }))

  // Calculate total endolots
  const totalEndolots = users.reduce((sum, u) => {
    const data = u.registrationData as any
    return sum + (data?.gamification?.endolots || 0)
  }, 0)
  const avgEndolots = users.length > 0 ? Math.round(totalEndolots / users.length) : 0

  return (
    <div className="flex flex-col">
      <Header
        title="Gamification Analytics"
        description="Levels, missions, meal analysis, and message usage"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Users with Levels"
            value={levels.length.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard label="Avg Endolots" value={avgEndolots.toLocaleString()} isLoading={isLoading} variant="info" />
          <KpiCard
            label="Avg Missions Done"
            value={avgCompletedMissions.toString()}
            isLoading={isLoading}
            variant="success"
          />
          <KpiCard label="Total Users" value={users.length.toLocaleString()} isLoading={isLoading} />
        </div>

        {/* Level Distribution */}
        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Level Distribution</span>
              <InfoTooltip
                title="Level Distribution"
                description="User progression levels from gamification.currentLevel or gamification.level field"
                howToRead="Shows how many users are at each level. '10+' groups all users level 10 and above."
                limitations="Only users with level data are included. Field may be currentLevel or level depending on implementation."
                dataCoverage={`Computed from ${levels.length} users with level data out of ${users.length} total`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={levelData} xKey="name" yKey="count" color="#7C3AED" />
        </ChartCard>

        {/* Mission Completion */}
        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Mission Completion Distribution</span>
              <InfoTooltip
                title="Mission Completion"
                description="Distribution of completed missions per user from gamification.completedMissions array"
                howToRead="Shows engagement with mission system. Higher buckets indicate more active users."
                limitations="Only counts completed missions, not mission success rate or difficulty."
                dataCoverage={`Computed from ${users.length} users`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={missionBuckets} xKey="range" yKey="count" color="#22D3EE" />
        </ChartCard>

        {/* Meal Analysis Usage */}
        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Meal Analysis Usage by Month</span>
              <InfoTooltip
                title="Meal Analysis Usage"
                description="Monthly meal analysis counts from mealAnalysisCountMonthly and mealAnalysisPeriod fields"
                howToRead="Shows total analyses and unique users per month. Uses counter-based data stored on user documents."
                limitations="Counter may reset or be updated monthly. Historical data depends on counter retention."
                dataCoverage={`Computed from ${Object.keys(mealAnalysisByMonth).length} months with data`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          {mealAnalysisData.length > 0 ? (
            <BarChart data={mealAnalysisData} xKey="month" yKey="totalCount" color="#F59E0B" />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No meal analysis data available
            </div>
          )}
        </ChartCard>

        {/* Message Usage */}
        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Endora Messages Usage by Month</span>
              <InfoTooltip
                title="Message Usage"
                description="Monthly message counts from messageCountMonthly and messagePeriod fields"
                howToRead="Shows chat activity trends. Total messages and unique active users per month."
                limitations="Counter-based tracking. May not reflect real-time chat_conversations data."
                dataCoverage={`Computed from ${Object.keys(messagesByMonth).length} months with data`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          {messagesData.length > 0 ? (
            <BarChart data={messagesData} xKey="month" yKey="totalCount" color="#2ED47A" />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No message usage data available
            </div>
          )}
        </ChartCard>

        {/* Avatar Personalization Note */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Avatar personalization frequency:</strong> Cannot be computed reliably without event logging.
            Current adoption can be measured by checking if users.avatar.character exists, but change frequency is not
            tracked. Recommend logging an app_event "avatar_updated" for future tracking.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
