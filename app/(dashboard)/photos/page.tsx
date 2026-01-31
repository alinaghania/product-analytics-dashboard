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
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { fetchPhotos } from "@/lib/firestore-queries"
import { bucketByDay } from "@/lib/analytics"

export default function PhotosPage() {
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
    data: photos,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["photos", dateRange.from, dateRange.to],
    queryFn: () => fetchPhotos(dateRange.from, dateRange.to),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const photosList = photos || []

  // P1: Photos per day
  const photosByDay = photosList.length > 0 ? bucketByDay(photosList.map((p) => p.timestamp)) : new Map()
  const photosPerDayData = Array.from(photosByDay.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // P2: Morning vs Evening
  const photosByDayAndTime: Map<string, { morning: number; evening: number }> = new Map()
  photosList.forEach((photo) => {
    const day = formatDate(photo.timestamp, "yyyy-MM-dd")
    if (!photosByDayAndTime.has(day)) {
      photosByDayAndTime.set(day, { morning: 0, evening: 0 })
    }
    const entry = photosByDayAndTime.get(day)!
    if (photo.time === "morning") entry.morning++
    else if (photo.time === "evening") entry.evening++
  })

  const morningVsEveningData = Array.from(photosByDayAndTime.entries())
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // P3: Pain distribution
  const painCounts = [1, 2, 3, 4, 5].map((level) => ({
    name: `Pain ${level}`,
    count: photosList.filter((p) => p.pain === level).length,
  }))

  // P4: Bloated rate
  const photosWithBloatedData = photosList.filter((p) => typeof p.bloated !== "undefined")
  const bloatedCount = photosList.filter((p) => p.bloated === true || p.bloated === 1).length
  const bloatedRate =
    photosWithBloatedData.length > 0 ? Math.round((bloatedCount / photosWithBloatedData.length) * 100) : 0

  return (
    <div className="flex flex-col">
      <Header
        title="Photos Analytics (Endobelly)"
        description="Belly photo tracking insights"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Photos"
            value={photosList.length.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard
            label="Morning Photos"
            value={photosList.filter((p) => p.time === "morning").length.toString()}
            isLoading={isLoading}
            variant="info"
          />
          <KpiCard
            label="Evening Photos"
            value={photosList.filter((p) => p.time === "evening").length.toString()}
            isLoading={isLoading}
            variant="success"
          />
          <KpiCard label="Bloated Rate" value={`${bloatedRate}%`} isLoading={isLoading} variant="warning" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Photos Saved Per Day</span>
                <InfoTooltip
                  title="Photos Per Day"
                  description="Number of belly photos saved in Endobelly tracker (from photos collection)"
                  howToRead="Shows daily tracking activity. Higher values indicate consistent usage."
                  limitations="Only includes photos with valid timestamp in selected date range."
                  dataCoverage={`Computed from ${photosList.length} photos`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <LineChart data={photosPerDayData} xKey="day" lines={[{ key: "count", color: "#7C3AED" }]} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Morning vs Evening</span>
                <InfoTooltip
                  title="Morning vs Evening"
                  description="Stacked count of photos by time of day (photos.time field: 'morning' or 'evening')"
                  howToRead="Stacked bars show distribution. Users may track once or twice daily."
                  limitations="Only includes photos with time field populated."
                  dataCoverage={`Computed from ${photosList.length} photos`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={morningVsEveningData} xKey="day" yKey="morning" color="#F59E0B" />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Pain Distribution</span>
                <InfoTooltip
                  title="Pain Distribution"
                  description="Count of photos by self-reported pain level 1-5 (photos.pain field)"
                  howToRead="Shows pain severity distribution. Higher numbers = more severe pain."
                  limitations="Only includes photos with pain field populated. Null values excluded."
                  dataCoverage={`Computed from ${photosList.filter((p) => p.pain > 0).length} photos with pain data`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={painCounts} xKey="name" yKey="count" color="#FF5C5C" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Bloated Status</span>
                <InfoTooltip
                  title="Bloated Rate"
                  description="Percentage of photos where user reported feeling bloated (photos.bloated: true or 1)"
                  howToRead="Shows % of time users feel bloated when tracking belly. Higher = more symptoms."
                  limitations="Only includes photos where bloated field is explicitly set (true/false or 1/0)."
                  dataCoverage={`Computed from ${photosWithBloatedData.length} photos with bloated data`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <div className="flex h-[200px] flex-col items-center justify-center gap-4">
              <div className="text-5xl font-bold text-primary">{bloatedRate}%</div>
              <div className="text-sm text-muted-foreground">
                {bloatedCount} out of {photosWithBloatedData.length} photos
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
