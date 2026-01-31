"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { fetchUsers } from "@/lib/firestore-queries"

export default function UsersAnalyticsPage() {
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
    queryKey: ["users-analytics", dateRange.from, dateRange.to],
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

  // U1: Age analysis
  const ages = users
    .map((u) => Number.parseInt(u.registrationData?.age as string))
    .filter((age) => !isNaN(age) && age > 0 && age < 120)
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0

  const ageBuckets = [
    { range: "<18", count: ages.filter((a) => a < 18).length },
    { range: "18-24", count: ages.filter((a) => a >= 18 && a <= 24).length },
    { range: "25-34", count: ages.filter((a) => a >= 25 && a <= 34).length },
    { range: "35-44", count: ages.filter((a) => a >= 35 && a <= 44).length },
    { range: "45+", count: ages.filter((a) => a >= 45).length },
  ]

  // U2: City distribution (Top 15)
  const cityCounts: Record<string, number> = {}
  users.forEach((u) => {
    const city = u.registrationData?.city as string
    if (city) {
      cityCounts[city] = (cityCounts[city] || 0) + 1
    }
  })
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  // U3: Health goals (Top 10)
  const goalCounts: Record<string, number> = {}
  users.forEach((u) => {
    const goals = u.registrationData?.healthGoals as string[]
    if (Array.isArray(goals)) {
      goals.forEach((goal) => {
        if (goal) goalCounts[goal] = (goalCounts[goal] || 0) + 1
      })
    }
  })
  const topGoals = Object.entries(goalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // U4: Medical conditions
  const conditionCounts: Record<string, number> = {}
  users.forEach((u) => {
    const conditions = u.registrationData?.medicalConditions as string[]
    if (Array.isArray(conditions) && conditions.length > 0) {
      conditions.forEach((condition) => {
        if (condition) conditionCounts[condition] = (conditionCounts[condition] || 0) + 1
      })
    } else {
      conditionCounts["None/Empty"] = (conditionCounts["None/Empty"] || 0) + 1
    }
  })
  const topConditions = Object.entries(conditionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))

  const otherConditionsCount =
    Object.values(conditionCounts).reduce((sum, count) => sum + count, 0) -
    topConditions.reduce((sum, c) => sum + c.count, 0)
  if (otherConditionsCount > 0) {
    topConditions.push({ name: "Other", count: otherConditionsCount })
  }

  // U5: Endometriosis status
  const endoStatusCounts: Record<string, number> = { yes: 0, no: 0, unknown: 0 }
  users.forEach((u) => {
    const hasEndo = u.registrationData?.hasEndometriosis as string
    if (hasEndo === "yes") endoStatusCounts.yes++
    else if (hasEndo === "no") endoStatusCounts.no++
    else endoStatusCounts.unknown++
  })
  const endoData = Object.entries(endoStatusCounts).map(([name, count]) => ({ name, count }))

  // U6: Periods status
  const periodsStatusCounts: Record<string, number> = {}
  users.forEach((u) => {
    const hasPeriods = u.registrationData?.hasPeriods as string
    if (hasPeriods) {
      periodsStatusCounts[hasPeriods] = (periodsStatusCounts[hasPeriods] || 0) + 1
    } else {
      periodsStatusCounts["unknown"] = (periodsStatusCounts["unknown"] || 0) + 1
    }
  })
  const periodsData = Object.entries(periodsStatusCounts).map(([name, count]) => ({ name, count }))

  // U7: Onboarding completion
  const onboardingCompleted = users.filter((u) => u.flags?.onboardingCompleted).length
  const registrationCompleted = users.filter((u) => u.flags?.registrationCompleted).length
  const completionRate = users.length > 0 ? Math.round((onboardingCompleted / users.length) * 100) : 0

  // U8: Subscription status
  const premiumCount = users.filter((u) => (u.registrationData as any)?.subscriptionStatus?.isPremium).length
  const subscriptionData = [
    { name: "Premium", count: premiumCount },
    { name: "Free", count: users.length - premiumCount },
  ]

  // U9: Notifications opt-in
  const notificationsYes = users.filter((u) => (u.registrationData as any)?.preferences?.notifications === true).length
  const notificationsNo = users.filter((u) => (u.registrationData as any)?.preferences?.notifications === false).length
  const notificationsUnknown = users.length - notificationsYes - notificationsNo
  const notificationsData = [
    { name: "Enabled", count: notificationsYes },
    { name: "Disabled", count: notificationsNo },
    { name: "Unknown", count: notificationsUnknown },
  ]

  return (
    <div className="flex flex-col">
      <Header
        title="User & Onboarding Analytics"
        description="Demographics, health profiles, and onboarding insights"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Users"
            value={users.length.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard label="Avg Age" value={avgAge.toString()} isLoading={isLoading} />
          <KpiCard label="Onboarding %" value={`${completionRate}%`} isLoading={isLoading} variant="success" />
          <KpiCard label="Premium Users" value={premiumCount.toLocaleString()} isLoading={isLoading} variant="info" />
        </div>

        {/* Age Distribution */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Age Distribution</span>
                <InfoTooltip
                  title="Age Distribution"
                  description="Self-reported age during onboarding, parsed from string field registrationData.age"
                  howToRead="Shows age groups. Higher bars indicate more users in that range."
                  limitations="Some users may not have provided age. Ages outside 0-120 are filtered out."
                  dataCoverage={`Computed from ${ages.length} users with valid age data out of ${users.length} total`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={ageBuckets} xKey="range" yKey="count" color="#7C3AED" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Top Cities</span>
                <InfoTooltip
                  title="City Distribution"
                  description="Top 15 cities where users are located, from registrationData.city"
                  howToRead="Shows geographic concentration. Map visualization requires lat/lng data which is not available."
                  limitations="Only cities explicitly provided during onboarding are shown."
                  dataCoverage={`Computed from ${Object.keys(cityCounts).length} unique cities`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={topCities} xKey="name" yKey="count" layout="vertical" color="#3B82F6" />
          </ChartCard>
        </div>

        {/* Health Goals & Conditions */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Health Goals (Top 10)</span>
                <InfoTooltip
                  title="Health Goals"
                  description="Reasons users gave for downloading the app, from registrationData.healthGoals array"
                  howToRead="Shows why users joined. Multiple goals per user are counted separately."
                  limitations="Users can select multiple goals, so totals may exceed user count."
                  dataCoverage={`Computed from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={topGoals} xKey="name" yKey="count" layout="vertical" color="#22D3EE" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Medical Conditions</span>
                <InfoTooltip
                  title="Medical Conditions"
                  description="Self-reported chronic conditions from registrationData.medicalConditions array"
                  howToRead="Pie chart shows distribution. 'None/Empty' means no conditions reported."
                  limitations="Self-reported data. Users may report multiple conditions."
                  dataCoverage={`Top 6 conditions + Other, from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={topConditions} />
          </ChartCard>
        </div>

        {/* Endometriosis & Periods */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Endometriosis Status</span>
                <InfoTooltip
                  title="Endometriosis Status"
                  description="Whether user has endometriosis, from registrationData.hasEndometriosis"
                  howToRead="Pie chart shows yes/no/unknown distribution"
                  limitations="Self-reported during onboarding. 'Unknown' means field not populated."
                  dataCoverage={`Computed from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={endoData} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Contraception / Periods</span>
                <InfoTooltip
                  title="Periods Status"
                  description="Period status from registrationData.hasPeriods field"
                  howToRead="Shows different categories: yes, no_on_pills, etc."
                  limitations="Categories depend on onboarding flow design."
                  dataCoverage={`Computed from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={periodsData} />
          </ChartCard>
        </div>

        {/* Subscription & Notifications */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Subscription Status</span>
                <InfoTooltip
                  title="Subscription Status"
                  description="Premium vs Free users from subscriptionStatus.isPremium"
                  howToRead="Shows monetization. Premium users have paid subscription via RevenueCat."
                  limitations="Subscription source is RevenueCat. Some integrations may not sync instantly."
                  dataCoverage={`Computed from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={subscriptionData} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Notifications Opt-in</span>
                <InfoTooltip
                  title="Notifications Opt-in"
                  description="Push notification preferences from registrationData.preferences.notifications"
                  howToRead="Shows user permission for notifications. Important for engagement campaigns."
                  limitations="'Unknown' means preference not set or field missing."
                  dataCoverage={`Computed from ${users.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={notificationsData} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
