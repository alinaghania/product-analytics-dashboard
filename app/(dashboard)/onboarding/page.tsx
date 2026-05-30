"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ChartCard } from "@/components/dashboard/chart-card"
import { BarChart } from "@/components/charts/bar-chart"
import { PieChart } from "@/components/charts/pie-chart"
import { FunnelChart } from "@/components/charts/funnel-chart"
import { InfoTooltip } from "@/components/dashboard/info-tooltip"
import { fetchOnboardingAnalytics } from "@/lib/api-client"

interface ChartInfo {
  title: string
  description: string
  howToRead: string
  limitations: string
  dataCoverage: string
}

/** ChartCard + InfoTooltip wrapper to keep the (many) chart blocks declarative. */
function ChartBlock({
  title,
  info,
  isLoading,
  onReload,
  children,
}: {
  title: string
  info: ChartInfo
  isLoading: boolean
  onReload: () => void
  children: ReactNode
}) {
  return (
    <ChartCard
      title={
        <div className="flex items-center gap-2">
          <span>{title}</span>
          <InfoTooltip {...info} />
        </div>
      }
      isLoading={isLoading}
      onReload={onReload}
    >
      {children}
    </ChartCard>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

const PALETTE = {
  purple: "#7C3AED",
  blue: "#3B82F6",
  green: "#2ED47A",
  cyan: "#22D3EE",
  amber: "#F59E0B",
  red: "#FF5C5C",
}

export default function OnboardingPage() {
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["onboarding-analytics"],
    queryFn: fetchOnboardingAnalytics,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  useEffect(() => {
    const load = async () => {
      await refetch()
      setLastUpdated(new Date())
    }
    load()
  }, [])

  const regN = data?.usersWithRegistration ?? 0
  const v4Coverage = `Asked only in the new (V4) onboarding flow — newest user cohort`
  const regCoverage = `Computed from ${regN.toLocaleString()} users with registration data`

  return (
    <div className="flex flex-col">
      <Header
        title="Onboarding Analytics"
        description="What users want and select during onboarding — goals, situations, expectations, and health profile"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Users"
            value={(data?.totalUsers ?? 0).toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard
            label="Registration %"
            value={`${data?.completionRate ?? 0}%`}
            isLoading={isLoading}
            variant="success"
          />
          <KpiCard label="Avg Age" value={(data?.avgAge ?? 0).toString()} isLoading={isLoading} />
          <KpiCard
            label="Has Endo"
            value={`${data?.hasEndoPercent ?? 0}%`}
            isLoading={isLoading}
            variant="info"
          />
        </div>

        {/* Registration funnel */}
        <ChartBlock
          title="Registration Funnel"
          info={{
            title: "Registration Funnel",
            description: "How many users reached each stage of onboarding.",
            howToRead: "Each bar shows users who reached that step; percentage is step-to-step conversion.",
            limitations:
              "Onboarding fires no analytics events (the account is created only at the very end), so this is a field-presence proxy, not real step tracking.",
            dataCoverage: `Computed from ${(data?.totalUsers ?? 0).toLocaleString()} users`,
          }}
          isLoading={isLoading}
          onReload={handleReload}
        >
          <FunnelChart data={data?.funnel ?? []} />
        </ChartBlock>

        {/* ============================================================== */}
        {/* WHAT USERS WANT (V4 intent / preference selections)            */}
        {/* ============================================================== */}
        <SectionHeading
          title="What users want"
          subtitle="The goals and preferences users actively select during the new onboarding flow"
        />

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Primary Objective"
            info={{
              title: "Primary Objective",
              description: "The top-level reason users chose when starting onboarding (registrationData.primaryObjective).",
              howToRead: "Single selection per user. Shows the headline goal that drives them to the app.",
              limitations: "Single select.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.objective ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Situation / Parcours"
            info={{
              title: "Situation / Parcours",
              description: "The specific situation users identified with (registrationData.situationsConcerned).",
              howToRead: "Single selection; determines the onboarding branch they go through.",
              limitations: "Single select.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.situation ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.purple} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="App Expectations"
            info={{
              title: "App Expectations",
              description: "What users expect most from Endora (registrationData.appExpectationsV2).",
              howToRead: "Single selection. The clearest signal of what users want the product to do for them.",
              limitations: "Single select.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.appExpectations ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.blue} />
          </ChartBlock>

          <ChartBlock
            title="Tracking Priorities"
            info={{
              title: "Tracking Priorities",
              description: "What users most want to track (registrationData.trackingPriorities).",
              howToRead: "Up to 3 selections per user, so totals exceed the user count.",
              limitations: "Multi-select (max 3).",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.trackingPriorities ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.green} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Reminder Preferences"
            info={{
              title: "Reminder Preferences",
              description: "Whether and why users want reminders (registrationData.reminderPreferences).",
              howToRead: "Single selection. Shows appetite for proactive nudges.",
              limitations: "Single select.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.reminderPreferences ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Cycle Tracking Goals"
            info={{
              title: "Cycle Tracking Goals",
              description: "Goals for users on the cycle-tracking parcours (registrationData.cycleTrackingGoals).",
              howToRead: "Up to 3 selections. Only the cycle-tracking branch is asked this, so volume is low.",
              limitations: "Multi-select; small sample (cycle-tracking branch only).",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.cycleTrackingGoals ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.cyan} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="What Weighs Most (Top 12)"
            info={{
              title: "What Weighs Most",
              description: "The burdens that weigh most on users' daily lives (registrationData.whatWeighsMost).",
              howToRead: "Up to 3 selections per user. Surfaces the pains people most want relief from.",
              limitations: "Multi-select (max 3); endo-focused branches only.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.whatWeighsMost ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.amber} />
          </ChartBlock>

          <ChartBlock
            title="Main Symptoms (Top 12)"
            info={{
              title: "Main Symptoms",
              description: "Symptoms that bother users most (registrationData.mainSymptoms).",
              howToRead: "Up to 4 selections per user.",
              limitations: "Multi-select; diagnosed/suspected branches.",
              dataCoverage: v4Coverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.mainSymptoms ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.red} />
          </ChartBlock>
        </div>

        <ChartBlock
          title="Symptom Timing (Top 12)"
          info={{
            title: "Symptom Timing",
            description: "When users' symptoms tend to appear (registrationData.symptomTiming).",
            howToRead: "Multiple selections per user. Helps understand cycle vs. non-cycle patterns.",
            limitations: "Multi-select.",
            dataCoverage: v4Coverage,
          }}
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={data?.symptomTiming ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.blue} />
        </ChartBlock>

        {/* ============================================================== */}
        {/* HEALTH PROFILE (legacy + V4)                                    */}
        {/* ============================================================== */}
        <SectionHeading
          title="Health profile"
          subtitle="Self-reported health context across all users (legacy and current onboarding)"
        />

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Health Goals (Top 12)"
            info={{
              title: "Health Goals",
              description: "Reasons users gave for downloading the app (registrationData.healthGoals, legacy onboarding).",
              howToRead: "Multiple selections per user. The legacy equivalent of App Expectations.",
              limitations: "Free-text labels (mixed FR/EN) from the older flow.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.healthGoals ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.purple} />
          </ChartBlock>

          <ChartBlock
            title="Life Stage"
            info={{
              title: "Life Stage",
              description: "The life stage / care focus users selected (registrationData.lifeStage, legacy onboarding).",
              howToRead: "Single selection. Why they came to the app at this point in their life.",
              limitations: "Legacy field; FR labels are normalized to English.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.lifeStage ?? []} showLabel={false} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Symptoms (Top 12)"
            info={{
              title: "Reported Symptoms",
              description: "Symptoms selected during onboarding (registrationData.symptoms).",
              howToRead: "Multiple selections per user.",
              limitations: "Self-reported; mixed FR/EN labels from the legacy flow.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.symptoms ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.amber} />
          </ChartBlock>

          <ChartBlock
            title="Medical Conditions (Top 12)"
            info={{
              title: "Medical Conditions",
              description: "Self-reported chronic conditions (registrationData.medicalConditions).",
              howToRead: "Multiple conditions per user.",
              limitations: "Self-reported free text; many long-tail values are truncated to the top 12.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.medicalConditions ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.blue} />
          </ChartBlock>
        </div>

        <ChartBlock
          title="Diagnosis Year"
          info={{
            title: "Diagnosis Year",
            description: "Year of diagnosis (registrationData.diagnosisYear).",
            howToRead: "Chronological. Shows when diagnosed users received their diagnosis.",
            limitations: "Only users who reported a diagnosis year.",
            dataCoverage: regCoverage,
          }}
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={data?.diagnosisYear ?? []} xKey="name" yKey="count" color={PALETTE.cyan} />
        </ChartBlock>

        <div className="grid grid-cols-3 gap-6">
          <ChartBlock
            title="Endometriosis Status"
            info={{
              title: "Endometriosis Status",
              description: "Whether users have endometriosis (registrationData.hasEndometriosis).",
              howToRead: "yes / suspected / no across all users with data.",
              limitations: "Self-reported.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.endoStatus ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Endometriosis Types (Top 10)"
            info={{
              title: "Endometriosis Types",
              description: "Types/stages reported (registrationData.endometriosisTypes).",
              howToRead: "Multiple types can be selected.",
              limitations: "Mixed V4 codes and legacy FR/EN labels, so similar values may appear separately.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.endoTypes ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Menstrual Pain Level"
            info={{
              title: "Menstrual Pain Level",
              description: "Self-reported pain 0–4 (registrationData.menstrualPain).",
              howToRead: "0 = no pain, 4 = severe. Ordered by level.",
              limitations: "Subjective scale, reported at registration.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.menstrualPain ?? []} xKey="name" yKey="count" color={PALETTE.red} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Period Status"
            info={{
              title: "Period Status",
              description: "Whether users have periods (registrationData.hasPeriods).",
              howToRead: "Distribution of period status.",
              limitations: "Self-reported.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.periodsStatus ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Period Frequency"
            info={{
              title: "Period Frequency",
              description: "How often users get their periods (registrationData.periodFrequency).",
              howToRead: "Shows cycle regularity.",
              limitations: "Self-reported; legacy field.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.periodFrequency ?? []} showLabel={false} />
          </ChartBlock>
        </div>

        <ChartBlock
          title="Period Symptoms (Top 12)"
          info={{
            title: "Period Symptoms",
            description: "Menstrual symptoms selected during onboarding (registrationData.periodSymptoms).",
            howToRead: "Multiple selections per user.",
            limitations: "Self-reported; legacy field.",
            dataCoverage: regCoverage,
          }}
          isLoading={isLoading}
          onReload={handleReload}
        >
          <BarChart data={data?.periodSymptoms ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.red} />
        </ChartBlock>

        {/* ============================================================== */}
        {/* DEMOGRAPHICS                                                    */}
        {/* ============================================================== */}
        <SectionHeading title="Demographics" subtitle="Who the users are and where they come from" />

        <div className="grid grid-cols-2 gap-6">
          <ChartBlock
            title="Age Distribution"
            info={{
              title: "Age Distribution",
              description: "Self-reported age during onboarding (registrationData.age).",
              howToRead: "Age groups; higher bars = more users in that range.",
              limitations: "Some users did not provide an age.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.ageBuckets ?? []} xKey="name" yKey="count" color={PALETTE.purple} />
          </ChartBlock>

          <ChartBlock
            title="Country (Top 10)"
            info={{
              title: "Country Distribution",
              description: "User's country (registrationData.location).",
              howToRead: "Geographic distribution by country.",
              limitations: "Only countries provided during onboarding.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.country ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.green} />
          </ChartBlock>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <ChartBlock
            title="Top Cities"
            info={{
              title: "City Distribution",
              description: "Top 15 cities (registrationData.city).",
              howToRead: "Geographic concentration.",
              limitations: "Only cities provided during onboarding.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={data?.topCities ?? []} xKey="name" yKey="count" layout="vertical" color={PALETTE.blue} />
          </ChartBlock>

          <ChartBlock
            title="Platform"
            info={{
              title: "Platform Distribution",
              description: "iOS vs Android (registrationData.deviceInfo.platform).",
              howToRead: "Mobile platform split.",
              limitations: "Based on device used during registration.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.platform ?? []} showLabel={false} />
          </ChartBlock>

          <ChartBlock
            title="Notifications"
            info={{
              title: "Notifications Opt-in",
              description: "Push notification preference (registrationData.preferences.notifications).",
              howToRead: "Opt-in vs opt-out at onboarding.",
              limitations: "Set during onboarding; users may change settings later.",
              dataCoverage: regCoverage,
            }}
            isLoading={isLoading}
            onReload={handleReload}
          >
            <PieChart data={data?.notifications ?? []} showLabel={false} />
          </ChartBlock>
        </div>
      </div>
    </div>
  )
}
