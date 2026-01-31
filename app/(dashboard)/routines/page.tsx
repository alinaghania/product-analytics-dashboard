"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { LineChart } from "@/components/charts/line-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { getFirebaseDb, collection, query, orderBy, limit, getDocs } from "@/lib/firebase"
import { bucketByDay } from "@/lib/analytics"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"

async function fetchRoutines(from: string, to: string) {
  const db = getFirebaseDb()
  const routinesRef = collection(db, "routines")

  const fromDate = new Date(from + "T00:00:00")
  const toDate = new Date(to + "T23:59:59")

  const q = query(routinesRef, orderBy("createdAt", "desc"), limit(1000))

  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        userId: data.userId || "",
        createdAt: toDate(data.createdAt) || new Date(),
        type: data.type || "unknown",
        usageCount: data.usageCount || 0,
        lastUsed: data.lastUsed ? toDate(data.lastUsed) : undefined,
      }
    })
    .filter((r) => r.createdAt >= fromDate && r.createdAt <= toDate)
}

export default function RoutinesPage() {
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
    data: routines,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["routines", dateRange.from, dateRange.to],
    queryFn: () => fetchRoutines(dateRange.from, dateRange.to),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const routinesList = routines || []

  // R1: Routines created per day
  const routinesByDay = routinesList.length > 0 ? bucketByDay(routinesList.map((r) => r.createdAt)) : new Map()
  const routinesPerDayData = Array.from(routinesByDay.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // R2: Type distribution
  const typeCounts: Record<string, number> = {}
  routinesList.forEach((r) => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1
  })
  const typeData = Object.entries(typeCounts).map(([name, count]) => ({ name, count }))

  // R3: UsageCount buckets
  const usageBuckets = [
    { range: "0", count: routinesList.filter((r) => r.usageCount === 0).length },
    { range: "1-2", count: routinesList.filter((r) => r.usageCount >= 1 && r.usageCount <= 2).length },
    { range: "3-5", count: routinesList.filter((r) => r.usageCount >= 3 && r.usageCount <= 5).length },
    { range: "6+", count: routinesList.filter((r) => r.usageCount >= 6).length },
  ]

  const routinesWithUsageCount = routinesList.filter((r) => r.usageCount !== undefined && r.usageCount !== null).length
  const dataCompleteness = routinesList.length > 0 ? (routinesWithUsageCount / routinesList.length) * 100 : 0

  return (
    <div className="flex flex-col">
      <Header
        title="Routines Analytics"
        description="Routine creation and usage patterns"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Routines"
            value={routinesList.length.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard
            label="Sleep Routines"
            value={routinesList.filter((r) => r.type === "sleep").length.toString()}
            isLoading={isLoading}
            variant="info"
          />
          <KpiCard
            label="Sport Routines"
            value={routinesList.filter((r) => r.type === "sport").length.toString()}
            isLoading={isLoading}
            variant="success"
          />
          <KpiCard
            label="Meal Routines"
            value={routinesList.filter((r) => r.type === "meal").length.toString()}
            isLoading={isLoading}
            variant="warning"
          />
        </div>

        {dataCompleteness < 50 && routinesList.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Data incomplete:</strong> Only {dataCompleteness.toFixed(0)}% of routines have usageCount data.
              Usage statistics may not be representative.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Routines Created Per Day</span>
                <InfoTooltip
                  title="Routines Created"
                  description="Number of new routines created daily (from routines.createdAt)"
                  howToRead="Shows when users set up automation. Higher values = more adoption."
                  limitations="Only includes routines with valid createdAt timestamp."
                  dataCoverage={`Computed from ${routinesList.length} routines`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <LineChart data={routinesPerDayData} xKey="day" lines={[{ key: "count", color: "#22D3EE" }]} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Routine Type Distribution</span>
                <InfoTooltip
                  title="Routine Types"
                  description="Distribution by type: sleep, sport, meal (from routines.type field)"
                  howToRead="Shows which types of routines are most popular with users."
                  limitations="Types depend on app feature availability."
                  dataCoverage={`Computed from ${routinesList.length} routines`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={typeData} />
          </ChartCard>
        </div>

        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Usage Count Distribution</span>
              <InfoTooltip
                title="Usage Count"
                description="How many times each routine has been used (from routines.usageCount)"
                howToRead="Shows engagement. Higher buckets = routines being actively used."
                limitations="usageCount may be missing for many routines. Check data completeness alert above."
                dataCoverage={`Computed from ${routinesWithUsageCount} routines with usageCount out of ${routinesList.length} total`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={usageBuckets} xKey="range" yKey="count" color="#7C3AED" />
        </ChartCard>
      </div>
    </div>
  )
}
