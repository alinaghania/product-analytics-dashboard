"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { format as formatDate, subDays } from "date-fns"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { FunnelChart } from "@/components/charts/funnel-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { fetchUsers } from "@/lib/api-client"

function countArrayField(users: any[], field: string, topN = 10) {
  const counts: Record<string, number> = {}
  users.forEach((u) => {
    const values = u.registrationData?.[field] as string[]
    if (Array.isArray(values)) {
      values.forEach((v) => {
        if (v) counts[v] = (counts[v] || 0) + 1
      })
    }
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }))
}

function countStringField(users: any[], field: string, unknownLabel = "Unknown", normalize?: Record<string, string>) {
  const counts: Record<string, number> = {}
  users.forEach((u) => {
    let value = u.registrationData?.[field] as string
    if (value) {
      if (normalize) value = normalize[value] || value
      counts[value] = (counts[value] || 0) + 1
    } else {
      counts[unknownLabel] = (counts[unknownLabel] || 0) + 1
    }
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
}

const LIFE_STAGE_EN: Record<string, string> = {
  "Gestion endométriose/OPK": "Endometriosis/PCOS management",
  "Suivi des règles": "Period tracking",
  "Suivi de la contraception": "Birth control monitoring",
  "Planification de grossesse": "Pregnancy planning",
  "Suivi de la ménopause": "Menopause tracking",
}

const PERIOD_FREQUENCY_EN: Record<string, string> = {
  "Tous les mois": "Every month",
  "Irrégulier": "Irregular",
  "Toutes les 3 semaines": "Every 3 weeks",
  "Toutes les 2 semaines": "Every 2 weeks",
  "Toutes les 5 semaines": "Every 5 weeks",
}

export default function OnboardingPage() {
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date()
    const from = subDays(to, 90)
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
    queryKey: ["onboarding-analytics", dateRange.from, dateRange.to],
    queryFn: () => fetchUsers({ limitCount: 5000 }),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  useEffect(() => {
    const loadInitialData = async () => {
      await refetch()
      setLastUpdated(new Date())
    }
    loadInitialData()
  }, [])

  const users = usersData?.data || []
  const usersWithReg = users.filter((u) => u.registrationData)

  // ============= KPIs =============
  // flags.onboardingCompleted/registrationCompleted are not set in Firestore,
  // so we use presence of registrationData as proxy for completion
  const completionRate = users.length > 0 ? Math.round((usersWithReg.length / users.length) * 100) : 0

  const ages = usersWithReg
    .map((u) => Number.parseInt(u.registrationData?.age as string))
    .filter((age) => !isNaN(age) && age > 0 && age < 120)
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((sum, a) => sum + a, 0) / ages.length) : 0

  // ============= Field Completion Funnel =============
  const fieldCompletionData = [
    { name: "Account Created", value: users.length },
    { name: "Registration Data", value: usersWithReg.length },
    { name: "Health Goals", value: users.filter((u) => Array.isArray(u.registrationData?.healthGoals) && (u.registrationData.healthGoals as string[]).length > 0).length },
    { name: "Symptoms", value: users.filter((u) => Array.isArray(u.registrationData?.symptoms) && (u.registrationData.symptoms as string[]).length > 0).length },
    { name: "Medical Conditions", value: users.filter((u) => Array.isArray(u.registrationData?.medicalConditions)).length },
    { name: "Endo Status", value: users.filter((u) => u.registrationData?.hasEndometriosis).length },
    { name: "Period Info", value: users.filter((u) => u.registrationData?.hasPeriods).length },
    { name: "City & Location", value: users.filter((u) => u.registrationData?.city).length },
  ]

  // ============= Demographics =============
  const ageBuckets = [
    { range: "<18", count: ages.filter((a) => a < 18).length },
    { range: "18-24", count: ages.filter((a) => a >= 18 && a <= 24).length },
    { range: "25-34", count: ages.filter((a) => a >= 25 && a <= 34).length },
    { range: "35-44", count: ages.filter((a) => a >= 35 && a <= 44).length },
    { range: "45+", count: ages.filter((a) => a >= 45).length },
  ]

  const topCities = countStringField(usersWithReg, "city")
    .filter((c) => c.name !== "Unknown")
    .slice(0, 15)

  const locationData = countStringField(usersWithReg, "location")
    .filter((c) => c.name !== "Unknown")
    .slice(0, 10)

  const platformCounts: Record<string, number> = {}
  usersWithReg.forEach((u) => {
    const platform = (u.registrationData as any)?.deviceInfo?.platform as string
    if (platform) platformCounts[platform] = (platformCounts[platform] || 0) + 1
  })
  const platformData = Object.entries(platformCounts).map(([name, count]) => ({ name, count }))

  // ============= Health Profile =============
  const endoStatusData = countStringField(usersWithReg, "hasEndometriosis")
  const endoTypesData = countArrayField(usersWithReg, "endometriosisTypes", 8)
  const medicalConditionsData = countArrayField(usersWithReg, "medicalConditions", 10)
  const symptomsData = countArrayField(usersWithReg, "symptoms", 10)

  // Diagnosis year distribution
  const diagYearCounts: Record<string, number> = {}
  usersWithReg.forEach((u) => {
    const year = (u.registrationData as any)?.diagnosisYear as number
    if (year) diagYearCounts[String(year)] = (diagYearCounts[String(year)] || 0) + 1
  })
  const diagYearData = Object.entries(diagYearCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))

  // ============= Period & Menstrual =============
  const periodsStatusData = countStringField(usersWithReg, "hasPeriods")
  const periodFrequencyData = countStringField(usersWithReg, "periodFrequency", "Unknown", PERIOD_FREQUENCY_EN).filter((d) => d.name !== "" && d.name !== "Unknown")
  const periodSymptomsData = countArrayField(usersWithReg, "periodSymptoms", 10)

  // Menstrual pain distribution
  const painCounts: Record<string, number> = {}
  usersWithReg.forEach((u) => {
    const pain = (u.registrationData as any)?.menstrualPain
    if (pain !== undefined && pain !== null) {
      painCounts[String(pain)] = (painCounts[String(pain)] || 0) + 1
    }
  })
  const painData = Object.entries(painCounts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([name, count]) => ({ name: `Level ${name}`, count }))

  // ============= Goals & Life Stage =============
  const healthGoalsData = countArrayField(usersWithReg, "healthGoals", 10)
  const lifeStageData = countStringField(usersWithReg, "lifeStage", "Unknown", LIFE_STAGE_EN).filter((d) => d.name !== "Unknown")

  // ============= Preferences =============
  const notificationsYes = usersWithReg.filter((u) => (u.registrationData as any)?.preferences?.notifications === true).length
  const notificationsNo = usersWithReg.filter((u) => (u.registrationData as any)?.preferences?.notifications === false).length
  const notificationsData = [
    { name: "Enabled", count: notificationsYes },
    { name: "Disabled", count: notificationsNo },
    { name: "Unknown", count: usersWithReg.length - notificationsYes - notificationsNo },
  ]

  return (
    <div className="flex flex-col">
      <Header
        title="Onboarding Analytics"
        description="Registration funnel, user choices during onboarding, and health profiles"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Total Users" value={users.length.toLocaleString()} isLoading={isLoading} onReload={handleReload} />
          <KpiCard label="Registration %" value={`${completionRate}%`} isLoading={isLoading} variant="success" />
          <KpiCard label="Avg Age" value={avgAge.toString()} isLoading={isLoading} />
          <KpiCard
            label="Has Endo"
            value={`${usersWithReg.length > 0 ? Math.round((users.filter((u) => u.registrationData?.hasEndometriosis === "yes").length / usersWithReg.length) * 100) : 0}%`}
            isLoading={isLoading}
            variant="info"
          />
        </div>

        {/* Registration Funnel */}
        <ChartCard
          title={
            <div className="flex items-center gap-2">
              <span>Registration Funnel</span>
              <InfoTooltip
                title="Registration Funnel"
                description="Shows how many users completed each stage of the onboarding flow"
                howToRead="Each bar shows users who reached that step. Percentage shows step-to-step conversion."
                limitations="Based on field presence in registrationData, not actual step tracking."
                dataCoverage={`Computed from ${users.length} users`}
              />
            </div>
          }
          isLoading={isLoading}
          onReload={handleReload}
        >
          <FunnelChart data={fieldCompletionData} />
        </ChartCard>

        {/* Health Goals & Life Stage */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Health Goals</span>
                <InfoTooltip
                  title="Health Goals"
                  description="Reasons users gave for downloading the app, from registrationData.healthGoals"
                  howToRead="Users can select multiple goals. Higher bars = more popular motivation."
                  limitations="Multiple selections per user, so totals exceed user count."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={healthGoalsData} xKey="name" yKey="count" layout="vertical" color="#7C3AED" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Life Stage</span>
                <InfoTooltip
                  title="Life Stage"
                  description="User's current life stage or primary reason for using the app"
                  howToRead="Shows the distribution of user segments by life stage."
                  limitations="Single selection per user."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={lifeStageData} showLabel={false} />
          </ChartCard>
        </div>

        {/* Symptoms & Medical Conditions */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Symptoms (Top 10)</span>
                <InfoTooltip
                  title="Reported Symptoms"
                  description="Symptoms users selected during onboarding, from registrationData.symptoms"
                  howToRead="Multiple selections per user. Shows most common symptoms."
                  limitations="Self-reported during onboarding, may change over time."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={symptomsData} xKey="name" yKey="count" layout="vertical" color="#F59E0B" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Medical Conditions (Top 10)</span>
                <InfoTooltip
                  title="Medical Conditions"
                  description="Self-reported chronic conditions from registrationData.medicalConditions"
                  howToRead="Multiple conditions per user. Shows prevalence of conditions in user base."
                  limitations="Self-reported. Empty arrays count as 'no conditions'."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={medicalConditionsData} xKey="name" yKey="count" layout="vertical" color="#3B82F6" />
          </ChartCard>
        </div>

        {/* Endometriosis */}
        <div className="grid grid-cols-3 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Endometriosis Status</span>
                <InfoTooltip
                  title="Endometriosis Status"
                  description="Whether user has endometriosis: yes, suspected, or no"
                  howToRead="Pie chart shows distribution across all users."
                  limitations="Self-reported during onboarding."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={endoStatusData} showLabel={false} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Endometriosis Types</span>
                <InfoTooltip
                  title="Endometriosis Types"
                  description="Specific types/stages reported by users with endometriosis"
                  howToRead="Only includes users who reported having endometriosis."
                  limitations="Self-reported staging. Multiple types can be selected."
                  dataCoverage={`Computed from ${endoTypesData.reduce((s, d) => s + d.count, 0)} responses`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={endoTypesData} showLabel={false} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Diagnosis Year</span>
                <InfoTooltip
                  title="Diagnosis Year"
                  description="Year of endometriosis diagnosis from registrationData.diagnosisYear"
                  howToRead="Shows when users were diagnosed. Recent years may have more users."
                  limitations="Only users with endometriosis who provided a year (65% of users)."
                  dataCoverage={`Computed from ${diagYearData.reduce((s, d) => s + d.count, 0)} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={diagYearData} xKey="name" yKey="count" color="#22D3EE" />
          </ChartCard>
        </div>

        {/* Period & Menstrual */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Period Status</span>
                <InfoTooltip
                  title="Period Status"
                  description="Whether users have periods and contraception status"
                  howToRead="Categories: yes, yes_on_contraception, no_on_contraception, no_menopause."
                  limitations="Self-reported during onboarding."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={periodsStatusData} showLabel={false} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Period Frequency</span>
                <InfoTooltip
                  title="Period Frequency"
                  description="How often users get their periods from registrationData.periodFrequency"
                  howToRead="Shows cycle regularity. 'Irrégulier' indicates irregular cycles."
                  limitations="Self-reported. Some values may be empty."
                  dataCoverage={`Computed from ${periodFrequencyData.reduce((s, d) => s + d.count, 0)} users with data`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={periodFrequencyData} showLabel={false} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Period Symptoms (Top 10)</span>
                <InfoTooltip
                  title="Period Symptoms"
                  description="Menstrual symptoms selected during onboarding from registrationData.periodSymptoms"
                  howToRead="Multiple selections per user. Shows most common period-related symptoms."
                  limitations="Self-reported. Users can select multiple symptoms."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={periodSymptomsData} xKey="name" yKey="count" layout="vertical" color="#FF5C5C" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Menstrual Pain Level</span>
                <InfoTooltip
                  title="Menstrual Pain Level"
                  description="Self-reported pain level from 0 to 4 from registrationData.menstrualPain"
                  howToRead="0 = no pain, 4 = severe pain. Shows pain distribution across users."
                  limitations="Subjective scale. Reported at registration time."
                  dataCoverage={`Computed from ${painData.reduce((s, d) => s + d.count, 0)} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={painData} xKey="name" yKey="count" color="#EF4444" />
          </ChartCard>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Age Distribution</span>
                <InfoTooltip
                  title="Age Distribution"
                  description="Self-reported age during onboarding from registrationData.age"
                  howToRead="Shows age groups. Higher bars indicate more users in that range."
                  limitations="Some users may not have provided age."
                  dataCoverage={`Computed from ${ages.length} users with valid age data`}
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
                <span>Country</span>
                <InfoTooltip
                  title="Country Distribution"
                  description="User's country from registrationData.location"
                  howToRead="Shows geographic distribution by country."
                  limitations="Only countries provided during onboarding."
                  dataCoverage={`Computed from ${locationData.reduce((s, d) => s + d.count, 0)} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={locationData} xKey="name" yKey="count" layout="vertical" color="#2ED47A" />
          </ChartCard>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Top Cities</span>
                <InfoTooltip
                  title="City Distribution"
                  description="Top 15 cities from registrationData.city"
                  howToRead="Shows geographic concentration."
                  limitations="Only cities provided during onboarding."
                  dataCoverage={`Computed from ${topCities.reduce((s, d) => s + d.count, 0)} users with city data`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={topCities} xKey="name" yKey="count" layout="vertical" color="#3B82F6" />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Platform</span>
                <InfoTooltip
                  title="Platform Distribution"
                  description="iOS vs Android from registrationData.deviceInfo.platform"
                  howToRead="Shows mobile platform split."
                  limitations="Based on device used during registration."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={platformData} showLabel={false} />
          </ChartCard>

          <ChartCard
            title={
              <div className="flex items-center gap-2">
                <span>Notifications</span>
                <InfoTooltip
                  title="Notifications Opt-in"
                  description="Push notification preferences from registrationData.preferences.notifications"
                  howToRead="Shows user permission for notifications."
                  limitations="Set during onboarding. Users may change settings later."
                  dataCoverage={`Computed from ${usersWithReg.length} users`}
                />
              </div>
            }
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={notificationsData} showLabel={false} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
