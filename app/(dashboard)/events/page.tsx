"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ChartCard } from "@/components/dashboard/chart-card"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { DataTable } from "@/components/tables/data-table"
import { AreaChart } from "@/components/charts/area-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { FunnelChart } from "@/components/charts/funnel-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDateTime } from "@/lib/date-utils"
import { fetchAppEvents, fetchBubbleEvents } from "@/lib/firestore-queries"
import type { AppEvent, BubbleEvent } from "@/lib/types"
import type { ColumnDef } from "@tanstack/react-table"
import { Search, Activity, Sparkles } from "lucide-react"

export default function EventsPage() {
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date()
    const from = subDays(to, 14)
    return {
      from: formatDate(from, "yyyy-MM-dd"),
      to: formatDate(to, "yyyy-MM-dd"),
    }
  })
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()
  const [eventSearch, setEventSearch] = useState("")
  const [platformFilter, setPlatformFilter] = useState<string>("")
  const [bubbleEventFilter, setBubbleEventFilter] = useState("")
  const [screenFilter, setScreenFilter] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  const {
    data: appData,
    isLoading: appLoading,
    refetch: refetchApp,
  } = useQuery({
    queryKey: ["appEvents", dateRange.from, dateRange.to, eventSearch, platformFilter],
    queryFn: () =>
      fetchAppEvents({
        from: dateRange.from,
        to: dateRange.to,
        name: eventSearch || undefined,
        platform: platformFilter && platformFilter !== "all" ? platformFilter : undefined,
        limitCount: 200,
      }),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const {
    data: bubbleData,
    isLoading: bubbleLoading,
    refetch: refetchBubble,
  } = useQuery({
    queryKey: ["bubbleEvents", dateRange.from, dateRange.to, bubbleEventFilter, screenFilter],
    queryFn: () =>
      fetchBubbleEvents({
        from: dateRange.from,
        to: dateRange.to,
        event: bubbleEventFilter && bubbleEventFilter !== "all" ? bubbleEventFilter : undefined,
        screen: screenFilter && screenFilter !== "all" ? screenFilter : undefined,
        limitCount: 200,
      }),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReloadApp = async () => {
    await refetchApp()
    setLastUpdated(new Date())
  }

  const handleReloadBubble = async () => {
    await refetchBubble()
    setLastUpdated(new Date())
  }

  const appEvents: AppEvent[] = appData?.data || []
  const bubbleEvents: BubbleEvent[] = bubbleData?.data || []

  const uniqueAppUsers = new Set(appEvents.map((e) => e.userId)).size
  const appEventCounts: Record<string, number> = {}
  const platformCounts: Record<string, number> = {}
  const versionCounts: Record<string, number> = {}
  const appEventsByDay: Record<string, number> = {}

  appEvents.forEach((e) => {
    appEventCounts[e.name] = (appEventCounts[e.name] || 0) + 1
    if (e.platform) platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1
    if (e.appVersion) versionCounts[e.appVersion] = (versionCounts[e.appVersion] || 0) + 1
    const day = e.createdAt.toISOString().split("T")[0]
    appEventsByDay[day] = (appEventsByDay[day] || 0) + 1
  })

  const topAppEvents = Object.entries(appEventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, count]) => ({ name, count }))

  const platformDistribution = Object.entries(platformCounts).map(([name, value]) => ({ name, value }))

  const versionDistribution = Object.entries(versionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }))

  const appEventsTimeSeries = Object.entries(appEventsByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  const uniqueBubbleUsers = new Set(bubbleEvents.map((e) => e.userId)).size
  const avgViewDuration =
    bubbleEvents.length > 0
      ? Math.round(bubbleEvents.reduce((sum, e) => sum + (e.viewDurationMs || 0), 0) / bubbleEvents.length / 100) / 10
      : 0

  const bubbleEventCounts: Record<string, number> = {}
  const screenCounts: Record<string, number> = {}
  const bubbleEventsByDay: Record<string, number> = {}

  bubbleEvents.forEach((e) => {
    bubbleEventCounts[e.event] = (bubbleEventCounts[e.event] || 0) + 1
    if (e.screen) screenCounts[e.screen] = (screenCounts[e.screen] || 0) + 1
    const day = e.createdAt.toISOString().split("T")[0]
    bubbleEventsByDay[day] = (bubbleEventsByDay[day] || 0) + 1
  })

  const bubbleFunnel = [
    { name: "bubble_generated", value: bubbleEventCounts["bubble_generated"] || 0, color: "#3B82F6" },
    { name: "bubble_viewed", value: bubbleEventCounts["bubble_viewed"] || 0, color: "#2ED47A" },
    { name: "endora_clicked", value: bubbleEventCounts["endora_clicked"] || 0, color: "#22D3EE" },
  ]

  const topScreens = Object.entries(screenCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  const bubbleEventsTimeSeries = Object.entries(bubbleEventsByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  const featureFunnel = [
    { name: "open_tracking", value: appEventCounts["open_tracking"] || 0, color: "#3B82F6" },
    { name: "save_tracking", value: appEventCounts["save_tracking"] || 0, color: "#2ED47A" },
    { name: "generate_report", value: appEventCounts["generate_report"] || 0, color: "#22D3EE" },
    { name: "share_report", value: appEventCounts["share_report"] || 0, color: "#FFB020" },
  ]

  const appEventColumns: ColumnDef<AppEvent>[] = [
    {
      accessorKey: "name",
      header: "Event",
      cell: ({ row }) => <Badge variant="secondary">{row.original.name}</Badge>,
    },
    {
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.userId.slice(0, 12)}...</span>,
    },
    {
      accessorKey: "screen",
      header: "Screen",
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.screen || "-"}</span>,
    },
    {
      accessorKey: "platform",
      header: "Platform",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.platform || "-"}
        </Badge>
      ),
    },
    {
      accessorKey: "appVersion",
      header: "Version",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.appVersion || "-"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
  ]

  const bubbleEventColumns: ColumnDef<BubbleEvent>[] = [
    {
      accessorKey: "event",
      header: "Event",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={
            row.original.event === "endora_clicked"
              ? "bg-success/20 text-success"
              : row.original.event === "bubble_viewed"
                ? "bg-primary/20 text-primary"
                : ""
          }
        >
          {row.original.event}
        </Badge>
      ),
    },
    {
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.userId.slice(0, 12)}...</span>,
    },
    {
      accessorKey: "screen",
      header: "Screen",
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.screen || "-"}</span>,
    },
    {
      accessorKey: "viewDurationMs",
      header: "View Duration",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.viewDurationMs ? `${(row.original.viewDurationMs / 1000).toFixed(1)}s` : "-"}
        </span>
      ),
    },
    {
      accessorKey: "platform",
      header: "Platform",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.platform || "-"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      <Header
        title="Events Analytics"
        description="App events and bubble engagement metrics"
        lastUpdated={lastUpdated}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        <Tabs defaultValue="app" className="space-y-6">
          <TabsList className="bg-card">
            <TabsTrigger value="app" className="gap-2">
              <Activity className="h-4 w-4" />
              App Events
            </TabsTrigger>
            <TabsTrigger value="bubbles" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Bubble Events
            </TabsTrigger>
          </TabsList>

          <TabsContent value="app" className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Total Events"
                value={appEvents.length.toLocaleString()}
                isLoading={appLoading}
                onReload={handleReloadApp}
              />
              <KpiCard label="Unique Users" value={uniqueAppUsers.toLocaleString()} isLoading={appLoading} />
              <KpiCard
                label="Avg Events/User"
                value={uniqueAppUsers > 0 ? (appEvents.length / uniqueAppUsers).toFixed(1) : "0"}
                isLoading={appLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Events Over Time</span>
                    <InfoTooltip
                      title="Events Over Time"
                      description="Daily count of app_events created"
                      howToRead="Shows event activity trends. Peaks indicate high user engagement."
                      dataCoverage={`Computed from ${appEvents.length} events`}
                    />
                  </div>
                }
                isLoading={appLoading}
                onReload={handleReloadApp}
              >
                <AreaChart data={appEventsTimeSeries} xKey="date" yKey="count" color="#3B82F6" />
              </ChartCard>

              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Top Events</span>
                    <InfoTooltip
                      title="Top Events"
                      description="Most frequent app_events by name field"
                      howToRead="Shows which features are most used"
                      limitations="Event names must be properly instrumented"
                      dataCoverage={`Top 7 events from ${appEvents.length} total`}
                    />
                  </div>
                }
                isLoading={appLoading}
                onReload={handleReloadApp}
              >
                <BarChart data={topAppEvents} xKey="name" yKey="count" layout="vertical" />
              </ChartCard>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Platform Distribution</span>
                    <InfoTooltip
                      title="Platform Distribution"
                      description="Events grouped by platform (iOS/Android)"
                      howToRead="Shows platform usage balance"
                      dataCoverage={`From ${appEvents.length} events`}
                    />
                  </div>
                }
                isLoading={appLoading}
                onReload={handleReloadApp}
              >
                <PieChart data={platformDistribution} innerRadius={40} />
              </ChartCard>

              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Version Distribution</span>
                    <InfoTooltip
                      title="Version Distribution"
                      description="Events by app version"
                      howToRead="Shows version adoption"
                      dataCoverage={`Top 5 versions from ${appEvents.length} events`}
                    />
                  </div>
                }
                isLoading={appLoading}
                onReload={handleReloadApp}
              >
                <BarChart data={versionDistribution} xKey="name" yKey="value" />
              </ChartCard>

              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Feature Funnel</span>
                    <InfoTooltip
                      title="Tracking Feature Funnel"
                      description="Conversion: open_tracking → save_tracking → generate_report → share_report"
                      howToRead="Drop-off shows where users abandon the flow"
                      limitations="Only works if these exact event names are instrumented"
                      dataCoverage={`From ${appEvents.length} events`}
                    />
                  </div>
                }
                isLoading={appLoading}
                onReload={handleReloadApp}
              >
                <FunnelChart data={featureFunnel} />
              </ChartCard>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter by event name..."
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    className="bg-card pl-9"
                  />
                </div>
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-[150px] bg-card">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="iOS">iOS</SelectItem>
                    <SelectItem value="Android">Android</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DataTable
                columns={appEventColumns}
                data={appEvents}
                pageCount={appData?.hasMore ? pagination.pageIndex + 2 : pagination.pageIndex + 1}
                pagination={pagination}
                onPaginationChange={setPagination}
                isLoading={appLoading}
                onReload={handleReloadApp}
                emptyMessage="No events found. Click Reload to fetch data."
              />
            </div>
          </TabsContent>

          <TabsContent value="bubbles" className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Total Bubble Events"
                value={bubbleEvents.length.toLocaleString()}
                isLoading={bubbleLoading}
                onReload={handleReloadBubble}
              />
              <KpiCard label="Unique Users" value={uniqueBubbleUsers.toLocaleString()} isLoading={bubbleLoading} />
              <KpiCard
                label="Avg View Duration"
                value={`${avgViewDuration}s`}
                isLoading={bubbleLoading}
                variant="info"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Bubble Funnel</span>
                    <InfoTooltip
                      title="Bubble Funnel"
                      description="Conversion: bubble_generated → bubble_viewed → endora_clicked from bubble_events collection"
                      howToRead="Shows engagement with Endora bubbles. Drop-off indicates where users lose interest."
                      limitations="All events must be in bubble_events collection, not mixed with app_events"
                      dataCoverage={`From ${bubbleEvents.length} bubble events`}
                    />
                  </div>
                }
                isLoading={bubbleLoading}
                onReload={handleReloadBubble}
              >
                <FunnelChart data={bubbleFunnel} />
              </ChartCard>

              <ChartCard
                title={
                  <div className="flex items-center gap-2">
                    <span>Top Screens</span>
                    <InfoTooltip
                      title="Top Screens for Bubbles"
                      description="Screens where bubbles appear most frequently (from bubble_events.screen)"
                      howToRead="Shows where users see Endora prompts. Top 10 screens by count."
                      dataCoverage={`From ${bubbleEvents.length} events`}
                    />
                  </div>
                }
                isLoading={bubbleLoading}
                onReload={handleReloadBubble}
              >
                <BarChart data={topScreens} xKey="name" yKey="count" layout="vertical" />
              </ChartCard>
            </div>

            <ChartCard
              title={
                <div className="flex items-center gap-2">
                  <span>Bubble Events Trend</span>
                  <InfoTooltip
                    title="Bubble Events Over Time"
                    description="Daily count of all bubble_events"
                    howToRead="Shows bubble interaction trends over time"
                    dataCoverage={`From ${bubbleEvents.length} events`}
                  />
                </div>
              }
              isLoading={bubbleLoading}
              onReload={handleReloadBubble}
              className="col-span-2"
            >
              <AreaChart data={bubbleEventsTimeSeries} xKey="date" yKey="count" color="#22D3EE" />
            </ChartCard>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Select value={bubbleEventFilter} onValueChange={setBubbleEventFilter}>
                  <SelectTrigger className="w-[180px] bg-card">
                    <SelectValue placeholder="Event type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="bubble_generated">Bubble Generated</SelectItem>
                    <SelectItem value="bubble_viewed">Bubble Viewed</SelectItem>
                    <SelectItem value="endora_clicked">Endora Clicked</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={screenFilter} onValueChange={setScreenFilter}>
                  <SelectTrigger className="w-[150px] bg-card">
                    <SelectValue placeholder="Screen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Screens</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="tracking">Tracking</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="profile">Profile</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DataTable
                columns={bubbleEventColumns}
                data={bubbleEvents}
                pageCount={bubbleData?.hasMore ? pagination.pageIndex + 2 : pagination.pageIndex + 1}
                pagination={pagination}
                onPaginationChange={setPagination}
                isLoading={bubbleLoading}
                onReload={handleReloadBubble}
                emptyMessage="No bubble events found. Click Reload to fetch data."
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
