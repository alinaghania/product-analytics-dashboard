"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { AreaChart } from "@/components/charts/area-chart"
import { getDefaultDateRange, formatDuration } from "@/lib/date-utils"
import { fetchTrackingMetrics } from "@/lib/firestore-queries"

export default function TrackingPage() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const {
    data: metrics,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["tracking-metrics", dateRange.from, dateRange.to],
    queryFn: () => fetchTrackingMetrics(dateRange),
    enabled: true,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  const handleReload = async () => {
    console.log("[v0] 📝 Tracking: Reload clicked")
    console.log("[v0] Date range:", dateRange)
    await refetch()
    setLastUpdated(new Date())
    console.log("[v0] ✅ Tracking: Reload completed")
  }

  const totalEntries = metrics?.totalEntries ?? 0
  const totalSessions = metrics?.totalSessions ?? 0
  const avgCompleteness = metrics?.avgCompleteness ?? 0
  const avgSessionDuration = metrics?.avgSessionDuration ?? 0
  const completenessDistribution = metrics?.completenessDistribution ?? []
  const entryMethodDistribution = metrics?.entryMethodDistribution ?? []
  const topSymptoms = metrics?.topSymptoms ?? []
  const sleepAvgDuration = metrics?.sleepMetrics?.avgDuration ?? 0
  const sleepAvgQuality = metrics?.sleepMetrics?.avgQuality ?? 0
  const digestiveAvgBloated = metrics?.digestiveMetrics?.avgBloated ?? 0
  const digestiveAvgPain = metrics?.digestiveMetrics?.avgPain ?? 0
  const sportAvgDuration = metrics?.sportMetrics?.avgDuration ?? 0
  const dailyEntries = metrics?.dailyEntries ?? []

  return (
    <div className="flex flex-col">
      <Header
        title="Tracking Analytics"
        description="Health tracking metrics, completion rates, and symptom analysis"
        lastUpdated={lastUpdated}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Date Range */}
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Entries"
            value={totalEntries.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard
            label="Total Sessions"
            value={totalSessions.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard
            label="Avg Completeness"
            value={`${Math.round(avgCompleteness)}%`}
            isLoading={isLoading}
            onReload={handleReload}
            variant="success"
          />
          <KpiCard
            label="Avg Session Duration"
            value={formatDuration(avgSessionDuration * 1000)}
            isLoading={isLoading}
            onReload={handleReload}
            variant="info"
          />
        </div>

        {/* Health Metrics KPIs */}
        <div className="grid grid-cols-5 gap-4">
          <KpiCard
            label="Avg Sleep Duration"
            value={`${sleepAvgDuration.toFixed(1)}h`}
            isLoading={isLoading}
            variant="info"
          />
          <KpiCard
            label="Avg Sleep Quality"
            value={`${sleepAvgQuality.toFixed(1)}/5`}
            isLoading={isLoading}
            variant="success"
          />
          <KpiCard
            label="Avg Bloating"
            value={`${digestiveAvgBloated.toFixed(1)}/5`}
            isLoading={isLoading}
            variant="warning"
          />
          <KpiCard label="Avg Pain" value={`${digestiveAvgPain.toFixed(1)}/5`} isLoading={isLoading} variant="danger" />
          <KpiCard
            label="Avg Sport Duration"
            value={`${Math.round(sportAvgDuration)}min`}
            isLoading={isLoading}
            variant="success"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title="Tracking Entries Over Time"
            description="Daily tracking entries"
            isLoading={isLoading}
            onReload={handleReload}
          >
            <AreaChart data={dailyEntries} xKey="date" yKey="count" color="#3B82F6" />
          </ChartCard>

          <ChartCard
            title="Completeness Distribution"
            description="Distribution of tracking completion rates"
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={completenessDistribution} xKey="range" yKey="count" color="#2ED47A" />
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-3 gap-6">
          <ChartCard
            title="Entry Methods"
            description="How users enter tracking data"
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart
              data={entryMethodDistribution.map((d) => ({
                name: d.method,
                value: d.count,
              }))}
              innerRadius={40}
            />
          </ChartCard>

          <ChartCard
            title="Top Symptoms"
            description="Most frequently logged symptoms"
            isLoading={isLoading}
            onReload={handleReload}
            className="col-span-2"
          >
            <BarChart data={topSymptoms} xKey="name" yKey="count" layout="vertical" color="#FF5C5C" />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
