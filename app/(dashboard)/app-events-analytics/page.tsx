"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { LineChart } from "@/components/charts/line-chart"
import { AreaChart } from "@/components/charts/area-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { FunnelChart } from "@/components/charts/funnel-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { getDefaultDateRange } from "@/lib/date-utils"
import { fetchTrackingBehaviorEvents, fetchEndoraEvents, fetchMealAiEvents } from "@/lib/api-client"

// ─── Helpers ───

function groupByDay(events: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {}
  for (const e of events) {
    const day = formatDate(e.createdAt, "yyyy-MM-dd")
    ;(groups[day] ??= []).push(e)
  }
  return groups
}

function allDaysInRange(from: string, to: string): string[] {
  const days: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(formatDate(d, "yyyy-MM-dd"))
  }
  return days
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.floor(sortedValues.length * p)
  return sortedValues[Math.min(index, sortedValues.length - 1)]
}

// ─── Page ───

export default function AppEventsAnalyticsPage() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  // Tracking Behavior data
  const {
    data: trackingData,
    isLoading: trackingLoading,
    refetch: refetchTracking,
  } = useQuery({
    queryKey: ["tracking-behavior-events", dateRange.from, dateRange.to],
    queryFn: () => fetchTrackingBehaviorEvents(dateRange.from, dateRange.to),
    enabled: true,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  // Endora data
  const {
    data: endoraData,
    isLoading: endoraLoading,
    refetch: refetchEndora,
  } = useQuery({
    queryKey: ["endora-events", dateRange.from, dateRange.to],
    queryFn: () => fetchEndoraEvents(dateRange.from, dateRange.to),
    enabled: true,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  // Meal AI data
  const {
    data: mealData,
    isLoading: mealLoading,
    refetch: refetchMeal,
  } = useQuery({
    queryKey: ["meal-ai-events", dateRange.from, dateRange.to],
    queryFn: () => fetchMealAiEvents(dateRange.from, dateRange.to),
    enabled: true,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  const handleReloadTracking = async () => {
    await refetchTracking()
    setLastUpdated(new Date())
  }

  const handleReloadEndora = async () => {
    await refetchEndora()
    setLastUpdated(new Date())
  }

  const handleReloadMeal = async () => {
    await refetchMeal()
    setLastUpdated(new Date())
  }

  const handleReloadAll = async () => {
    await Promise.all([refetchTracking(), refetchEndora(), refetchMeal()])
    setLastUpdated(new Date())
  }

  // ─── Shared date range ───

  const days = useMemo(() => allDaysInRange(dateRange.from, dateRange.to), [dateRange])

  // ─── Tracking Behavior computed data ───

  const trackingKpis = useMemo(() => {
    if (!trackingData) return { sessionsStarted: 0, completionRate: 0, avgSectionsPerSession: 0 }

    const sessionsStarted = trackingData.started.length
    const sessionsCompleted = trackingData.completed.length
    const completionRate = sessionsStarted > 0 ? Math.round((sessionsCompleted / sessionsStarted) * 100) : 0

    const sectionsArrays = trackingData.completed
      .map((e: any) => e.params?.sections)
      .filter((s: any) => Array.isArray(s))
    const avgSectionsPerSession =
      sectionsArrays.length > 0
        ? Math.round((sectionsArrays.reduce((sum: number, s: string[]) => sum + s.length, 0) / sectionsArrays.length) * 10) / 10
        : 0

    return { sessionsStarted, completionRate, avgSectionsPerSession }
  }, [trackingData])

  const sectionData = useMemo(() => {
    if (!trackingData?.sectionSaved) return []
    const counts: Record<string, number> = {}
    trackingData.sectionSaved.forEach((e: any) => {
      const section = e.params?.section
      if (section) counts[section] = (counts[section] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [trackingData])

  const trackingEntryPointData = useMemo(() => {
    if (!trackingData?.started) return []
    const counts: Record<string, number> = {}
    trackingData.started.forEach((e: any) => {
      const entryPoint = e.params?.entry_point || "unknown"
      counts[entryPoint] = (counts[entryPoint] || 0) + 1
    })
    return Object.entries(counts).map(([name, count]) => ({ name, count }))
  }, [trackingData])

  const trackingFunnelData = useMemo(() => {
    if (!trackingData) return []
    const startedUsers = new Set(trackingData.started.map((e: any) => e.userId))
    const savedUsers = new Set(trackingData.sectionSaved.map((e: any) => e.userId))
    const completedUsers = new Set(trackingData.completed.map((e: any) => e.userId))
    return [
      { name: "Session Started", value: startedUsers.size, color: "#3B82F6" },
      { name: "Section Saved", value: savedUsers.size, color: "#2ED47A" },
      { name: "Session Completed", value: completedUsers.size, color: "#22D3EE" },
    ]
  }, [trackingData])

  // ─── Endora AI computed data ───

  const sent = endoraData?.sent ?? []
  const received = endoraData?.received ?? []
  const failed = endoraData?.failed ?? []
  const screenOpened = endoraData?.screenOpened ?? []
  const conversationStarted = endoraData?.conversationStarted ?? []
  const limitReached = endoraData?.limitReached ?? []

  const endoraKpis = useMemo(() => {
    const totalSent = sent.length
    const allLatencies = received
      .map((e: any) => e.params?.latency_ms)
      .filter((v: any): v is number => typeof v === "number")
    const avgLatency = allLatencies.length > 0 ? allLatencies.reduce((a: number, b: number) => a + b, 0) / allLatencies.length : 0
    const errorRate = totalSent > 0 ? (failed.length / totalSent) * 100 : 0
    const limitUsers = new Set(limitReached.map((e: any) => e.userId)).size
    return { totalSent, avgLatency, errorRate, limitUsers }
  }, [sent, received, failed, limitReached])

  // E1: Messages per day
  const messagesPerDay = useMemo(() => {
    const byDay = groupByDay(sent)
    return days.map((day) => {
      const events = byDay[day] ?? []
      return {
        date: day,
        count: events.length,
        uniqueUsers: new Set(events.map((e: any) => e.userId)).size,
      }
    })
  }, [sent, days])

  // E2: Latency per day
  const latencyPerDay = useMemo(() => {
    const byDay = groupByDay(received)
    return days.map((day) => {
      const events = byDay[day] ?? []
      const latencies = events
        .map((e: any) => e.params?.latency_ms)
        .filter((v: any): v is number => typeof v === "number")
        .sort((a: number, b: number) => a - b)
      return {
        date: day,
        p50: Math.round(percentile(latencies, 0.5)),
        p95: Math.round(percentile(latencies, 0.95)),
        avg: latencies.length > 0 ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length) : 0,
      }
    })
  }, [received, days])

  // E3: Error rate over time
  const errorRatePerDay = useMemo(() => {
    const sentByDay = groupByDay(sent)
    const failedByDay = groupByDay(failed)
    return days.map((day) => {
      const s = sentByDay[day]?.length ?? 0
      const f = failedByDay[day]?.length ?? 0
      return {
        date: day,
        errorRate: s > 0 ? Number(((f / s) * 100).toFixed(1)) : 0,
      }
    })
  }, [sent, failed, days])

  // E4: Conversation funnel
  const endoraFunnelData = useMemo(() => [
    { name: "Screen Opened", value: screenOpened.length, color: "#3B82F6" },
    { name: "Conversation Started", value: conversationStarted.length, color: "#2ED47A" },
    { name: "Message Sent", value: sent.length, color: "#22D3EE" },
    { name: "Message Received", value: received.length, color: "#FFB020" },
  ], [screenOpened, conversationStarted, sent, received])

  // E5: Limit reached per day
  const limitPerDay = useMemo(() => {
    const byDay = groupByDay(limitReached)
    return days.map((day) => {
      const events = byDay[day] ?? []
      return {
        date: day,
        uniqueUsers: new Set(events.map((e: any) => e.userId)).size,
      }
    })
  }, [limitReached, days])

  // E6: Entry points
  const endoraEntryPointData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of sent) {
      const ep = (e as any).params?.entry_point || "unknown"
      counts[ep] = (counts[ep] || 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [sent])

  // ─── Meal AI computed data ───

  const mealStarted = mealData?.started ?? []
  const mealCompleted = mealData?.completed ?? []

  const mealKpis = useMemo(() => {
    const totalAnalyses = mealStarted.length
    const successfulCompleted = mealCompleted.filter((e: any) => e.params?.success === true)
    const successRate = mealCompleted.length > 0 ? (successfulCompleted.length / mealCompleted.length) * 100 : 0
    const durations = mealCompleted
      .map((e: any) => e.params?.duration_ms)
      .filter((v: any): v is number => typeof v === "number")
    const avgDuration = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0
    const uniqueUsers = new Set(mealStarted.map((e: any) => e.userId)).size
    return { totalAnalyses, successRate, avgDuration, uniqueUsers }
  }, [mealStarted, mealCompleted])

  // M1: Analyses per day
  const mealAnalysesPerDay = useMemo(() => {
    const byDay = groupByDay(mealStarted)
    return days.map((day) => ({
      date: day,
      count: (byDay[day] ?? []).length,
    }))
  }, [mealStarted, days])

  // M2: Success rate over time
  const mealSuccessPerDay = useMemo(() => {
    const byDay = groupByDay(mealCompleted)
    return days.map((day) => {
      const events = byDay[day] ?? []
      const success = events.filter((e: any) => e.params?.success === true).length
      return {
        date: day,
        successRate: events.length > 0 ? Number(((success / events.length) * 100).toFixed(1)) : 0,
      }
    })
  }, [mealCompleted, days])

  // M3: Duration distribution
  const mealDurationDistribution = useMemo(() => {
    const buckets = [
      { range: "<2s", min: 0, max: 2000, count: 0 },
      { range: "2-5s", min: 2000, max: 5000, count: 0 },
      { range: "5-10s", min: 5000, max: 10000, count: 0 },
      { range: "10s+", min: 10000, max: Infinity, count: 0 },
    ]
    for (const e of mealCompleted) {
      const d = (e as any).params?.duration_ms
      if (typeof d !== "number") continue
      const bucket = buckets.find((b) => d >= b.min && d < b.max)
      if (bucket) bucket.count++
    }
    return buckets.map(({ range, count }) => ({ range, count }))
  }, [mealCompleted])

  // M4: Source breakdown
  const mealSourceData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of mealStarted) {
      const src = (e as any).params?.source || "unknown"
      counts[src] = (counts[src] || 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [mealStarted])

  return (
    <div className="flex flex-col">
      <Header
        title="App Events Analytics"
        description="Endora AI, Meal AI, and tracking behavior metrics"
        lastUpdated={lastUpdated}
        onReloadAll={handleReloadAll}
      />

      <div className="flex-1 space-y-8 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        {/* ═══════════════ Endora AI Section ═══════════════ */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Endora AI</h2>

          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Total Messages Sent"
              value={endoraKpis.totalSent.toLocaleString()}
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            />
            <KpiCard
              label="Avg Latency"
              value={`${Math.round(endoraKpis.avgLatency).toLocaleString()}ms`}
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
              variant="info"
            />
            <KpiCard
              label="Error Rate"
              value={`${endoraKpis.errorRate.toFixed(1)}%`}
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
              variant={endoraKpis.errorRate > 5 ? "danger" : endoraKpis.errorRate > 2 ? "warning" : "success"}
            />
            <KpiCard
              label="Users Hit Limit"
              value={endoraKpis.limitUsers.toLocaleString()}
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
              variant="warning"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title="Endora Messages Per Day"
              description="Message count and unique users"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <BarChart
                data={messagesPerDay}
                xKey="date"
                yKey="count"
                maxBars={15}
                stacks={[
                  { key: "count", color: "#3B82F6", label: "Messages" },
                  { key: "uniqueUsers", color: "#2ED47A", label: "Unique Users" },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Endora Latency (p50 / p95 / avg)"
              description="Response time in milliseconds"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <LineChart
                data={latencyPerDay}
                xKey="date"
                lines={[
                  { key: "p50", color: "#2ED47A", label: "p50" },
                  { key: "p95", color: "#FF5C5C", label: "p95" },
                  { key: "avg", color: "#3B82F6", label: "avg" },
                ]}
                tooltipFormatter={(value) => `${value}ms`}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title="Endora Error Rate Over Time"
              description="Percentage of failed messages per day"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <LineChart
                data={errorRatePerDay}
                xKey="date"
                lines={[{ key: "errorRate", color: "#FF5C5C", label: "Error Rate %" }]}
                tooltipFormatter={(value) => `${value}%`}
              />
            </ChartCard>

            <ChartCard
              title="Endora Conversation Funnel"
              description="Drop-off from screen open to message received"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <FunnelChart data={endoraFunnelData} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title="Message Limit Reached Per Day"
              description="Unique users hitting the message limit"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <AreaChart data={limitPerDay} xKey="date" yKey="uniqueUsers" color="#FFB020" />
            </ChartCard>

            <ChartCard
              title="Endora Entry Points"
              description="Where users access Endora from"
              isLoading={endoraLoading}
              onReload={handleReloadEndora}
            >
              <PieChart data={endoraEntryPointData} valueKey="value" innerRadius={40} />
            </ChartCard>
          </div>
        </div>

        {/* ═══════════════ Meal AI Section ═══════════════ */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Meal AI</h2>

          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Total Analyses"
              value={mealKpis.totalAnalyses.toLocaleString()}
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            />
            <KpiCard
              label="Success Rate"
              value={`${mealKpis.successRate.toFixed(1)}%`}
              isLoading={mealLoading}
              onReload={handleReloadMeal}
              variant={mealKpis.successRate >= 90 ? "success" : mealKpis.successRate >= 70 ? "warning" : "danger"}
            />
            <KpiCard
              label="Avg Duration"
              value={`${(mealKpis.avgDuration / 1000).toFixed(1)}s`}
              isLoading={mealLoading}
              onReload={handleReloadMeal}
              variant="info"
            />
            <KpiCard
              label="Unique Users"
              value={mealKpis.uniqueUsers.toLocaleString()}
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title="Meal Analyses Per Day"
              description="Daily analysis volume"
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            >
              <BarChart data={mealAnalysesPerDay} xKey="date" yKey="count" color="#3B82F6" maxBars={15} />
            </ChartCard>

            <ChartCard
              title="Meal AI Success Rate Over Time"
              description="Percentage of successful analyses per day"
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            >
              <LineChart
                data={mealSuccessPerDay}
                xKey="date"
                lines={[{ key: "successRate", color: "#2ED47A", label: "Success Rate %" }]}
                tooltipFormatter={(value) => `${value}%`}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title="Meal AI Duration Distribution"
              description="Analysis time buckets"
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            >
              <BarChart data={mealDurationDistribution} xKey="range" yKey="count" color="#22D3EE" />
            </ChartCard>

            <ChartCard
              title="Meal AI Source Breakdown"
              description="Camera vs gallery usage"
              isLoading={mealLoading}
              onReload={handleReloadMeal}
            >
              <PieChart data={mealSourceData} valueKey="value" innerRadius={40} />
            </ChartCard>
          </div>
        </div>

        {/* ═══════════════ Tracking Behavior Section ═══════════════ */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Tracking Behavior</h2>

          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Sessions Started"
              value={trackingKpis.sessionsStarted.toLocaleString()}
              isLoading={trackingLoading}
              onReload={handleReloadTracking}
              tooltipTitle="Tracking Sessions Started"
              tooltipDescription="Total tracking_session_started events in the selected period"
              tooltipHowToRead="Shows how many tracking sessions were initiated"
            />
            <KpiCard
              label="Completion Rate"
              value={trackingKpis.completionRate > 0 ? `${trackingKpis.completionRate}%` : "N/A"}
              isLoading={trackingLoading}
              onReload={handleReloadTracking}
              variant="success"
              tooltipTitle="Session Completion Rate"
              tooltipDescription="tracking_session_completed / tracking_session_started * 100"
              tooltipHowToRead="Higher = users finish their tracking sessions. Low rate means users start but abandon."
            />
            <KpiCard
              label="Avg Sections/Session"
              value={trackingKpis.avgSectionsPerSession > 0 ? trackingKpis.avgSectionsPerSession.toString() : "N/A"}
              isLoading={trackingLoading}
              onReload={handleReloadTracking}
              variant="info"
              tooltipTitle="Average Sections Per Session"
              tooltipDescription="Average number of sections in the sections array of tracking_session_completed events"
              tooltipHowToRead="Higher = users fill more health categories per session"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ChartCard
              title={
                <div className="flex items-center gap-2">
                  <span>Most Tracked Sections</span>
                  <InfoTooltip
                    title="Most Tracked Sections"
                    description="Counts of tracking_section_saved events grouped by params.section"
                    howToRead="Taller bars = more frequently tracked sections."
                    dataCoverage={`From ${trackingData?.sectionSaved?.length || 0} section save events`}
                  />
                </div>
              }
              isLoading={trackingLoading}
              onReload={handleReloadTracking}
            >
              <BarChart data={sectionData} xKey="name" yKey="count" layout="vertical" color="#7C3AED" />
            </ChartCard>

            <ChartCard
              title={
                <div className="flex items-center gap-2">
                  <span>Session Entry Points</span>
                  <InfoTooltip
                    title="Tracking Entry Points"
                    description="Where users start their tracking sessions from, based on tracking_session_started params.entry_point"
                    howToRead="Shows which triggers drive tracking engagement."
                    dataCoverage={`From ${trackingData?.started?.length || 0} session start events`}
                  />
                </div>
              }
              isLoading={trackingLoading}
              onReload={handleReloadTracking}
            >
              <PieChart data={trackingEntryPointData} showLabel={false} />
            </ChartCard>
          </div>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Tracking Completion Funnel</span>
                <InfoTooltip
                  title="Tracking Completion Funnel"
                  description="Unique users at each stage: started a session -> saved at least one section -> completed the session"
                  howToRead="Drop-off between stages shows where users abandon."
                  limitations="Based on unique users, not session count."
                  dataCoverage={`From ${trackingData?.started?.length || 0} started, ${trackingData?.sectionSaved?.length || 0} saved, ${trackingData?.completed?.length || 0} completed events`}
                />
              </div>
            }
            isLoading={trackingLoading}
            onReload={handleReloadTracking}
          >
            <FunnelChart data={trackingFunnelData} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
