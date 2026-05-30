"use client"

import { useState, useMemo, isValidElement } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Header } from "@/components/dashboard/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChartCard } from "@/components/dashboard/chart-card"
import { AreaChart } from "@/components/charts/area-chart"
import { UserChatsPanel } from "@/components/users/UserChatsPanel"
import { formatDateTime, formatDuration } from "@/lib/date-utils"
import { fetchUserFullProfile } from "@/lib/api-client"
import {
  UserIcon,
  Activity,
  BarChart3,
  MessageSquare,
  ArrowLeft,
  ListTree,
  CalendarCheck,
} from "lucide-react"

function FieldRow({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return null
  }

  let rendered: React.ReactNode
  if (typeof value === "string" || typeof value === "number") {
    rendered = String(value)
  } else if (typeof value === "boolean") {
    rendered = value ? "Yes" : "No"
  } else if (isValidElement(value)) {
    rendered = value
  } else if (typeof value === "object") {
    // Plain object or array of objects — registrationData has nested shapes like
    // medicalJourney = { consultedDoctors, ... }. Render as compact JSON instead
    // of crashing React's "Objects are not valid as a React child" error.
    rendered = (
      <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  } else {
    rendered = String(value)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground">{rendered}</div>
    </div>
  )
}

function TagList({ values }: { values: unknown }) {
  if (!Array.isArray(values) || values.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v, i) => (
        <Badge key={`${String(v)}-${i}`} variant="secondary" className="font-normal">
          {String(v).replace(/_/g, " ")}
        </Badge>
      ))}
    </div>
  )
}

function maskToken(token: unknown): string {
  if (typeof token !== "string" || !token) return "—"
  if (token.length <= 12) return "•".repeat(token.length)
  return `${token.slice(0, 6)}…${token.slice(-4)}`
}

function calculateAge(birthDateStr?: string, registrationAge?: string): string | undefined {
  if (registrationAge) return registrationAge
  if (!birthDateStr) return undefined
  try {
    const birthDate = new Date(birthDateStr)
    if (Number.isNaN(birthDate.getTime())) return undefined
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
    return String(age)
  } catch {
    return undefined
  }
}

export default function UserDetailPage() {
  const params = useParams()
  const userId = params.userId as string
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["userFullProfile", userId],
    queryFn: () => fetchUserFullProfile(userId),
    enabled: Boolean(userId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const user = data?.user
  const rawDoc = (data?.raw?.userDoc as Record<string, any>) || {}
  const sections = data?.sections
  const reg = (user?.registrationData as Record<string, any>) || {}

  const trackingEntries = sections?.trackingEntries.data || []
  const trackingSessions = sections?.trackingSessions.data || []
  const conversations = sections?.conversations.data || []
  const appEvents = sections?.appEvents.data || []
  const bubbleEvents = sections?.bubbleEvents.data || []
  const routines = sections?.routines.data || []
  const foodTrials = sections?.foodTrials?.data || []
  const lastActivity = sections?.lastActivity.data

  // Tracking stats
  const sortedDates = useMemo(
    () => [...trackingEntries].map((e: any) => e.date).filter(Boolean).sort(),
    [trackingEntries],
  )
  const { currentStreak, bestStreak } = useMemo(() => {
    let best = 0
    let temp = 0
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        temp = 1
      } else {
        const prev = new Date(sortedDates[i - 1])
        const curr = new Date(sortedDates[i])
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
        temp = diffDays === 1 ? temp + 1 : 1
      }
      best = Math.max(best, temp)
    }
    let current = 0
    if (sortedDates.length > 0) {
      const lastDate = new Date(sortedDates[sortedDates.length - 1])
      const today = new Date()
      const diffDays = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays <= 1) current = temp
    }
    return { currentStreak: current, bestStreak: best }
  }, [sortedDates])

  const avgCompleteness = useMemo(() => {
    if (trackingEntries.length === 0) return 0
    return Math.round(
      trackingEntries.reduce((sum: number, e: any) => sum + (e.completeness || 0), 0) / trackingEntries.length,
    )
  }, [trackingEntries])

  const trackingChartData = useMemo(
    () =>
      [...trackingEntries]
        .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""))
        .map((e: any) => ({ date: e.date, completeness: e.completeness })),
    [trackingEntries],
  )

  // Aggregate meals data (calories / water) and food triggers from registration
  // + food trials subcollection for the Alimentation section.
  const foodStats = useMemo(() => {
    let calorieDays = 0
    let calorieTotal = 0
    let waterDays = 0
    let waterTotal = 0
    for (const entry of trackingEntries as Array<{ meals?: { calories?: number; water?: number } }>) {
      const m = entry.meals
      if (!m) continue
      if (typeof m.calories === "number" && m.calories > 0) {
        calorieDays++
        calorieTotal += m.calories
      }
      if (typeof m.water === "number" && m.water > 0) {
        waterDays++
        waterTotal += m.water
      }
    }
    const statusCounts = new Map<string, number>()
    const categoryCounts = new Map<string, number>()
    const outcomeCounts = new Map<string, number>()
    for (const t of foodTrials as Array<Record<string, any>>) {
      if (t.status) statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1)
      if (t.category) categoryCounts.set(t.category, (categoryCounts.get(t.category) || 0) + 1)
      if (t.result) outcomeCounts.set(t.result, (outcomeCounts.get(t.result) || 0) + 1)
    }
    return {
      avgCalories: calorieDays > 0 ? Math.round(calorieTotal / calorieDays) : null,
      calorieDays,
      avgWater: waterDays > 0 ? Math.round((waterTotal / waterDays) * 10) / 10 : null,
      waterDays,
      statusCounts: [...statusCounts.entries()].sort((a, b) => b[1] - a[1]),
      categoryCounts: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]),
      outcomeCounts: [...outcomeCounts.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [trackingEntries, foodTrials])

  // Aggregate symptoms logged across all tracking entries — frequency map +
  // a per-day timeline of the most recent occurrences.
  const symptomStats = useMemo(() => {
    const counts = new Map<string, number>()
    const byEntry: Array<{ date: string; symptoms: string[] }> = []
    for (const entry of trackingEntries as Array<{ date: string; symptoms?: unknown }>) {
      const list = Array.isArray(entry.symptoms) ? (entry.symptoms as unknown[]) : []
      const cleaned = list.filter((s): s is string => typeof s === "string" && s.length > 0)
      if (cleaned.length === 0) continue
      byEntry.push({ date: entry.date, symptoms: cleaned })
      for (const s of cleaned) counts.set(s, (counts.get(s) || 0) + 1)
    }
    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
    const totalLogged = ranked.reduce((sum, r) => sum + r.count, 0)
    const recent = [...byEntry].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
    return { ranked, totalLogged, recent, maxCount: ranked[0]?.count ?? 0 }
  }, [trackingEntries])

  // Activity stats
  const activityByDay = useMemo(() => {
    const byDay: Record<string, { events: number }> = {}
    for (const e of [...appEvents, ...bubbleEvents]) {
      if (!e.createdAt) continue
      const day = e.createdAt.toISOString().split("T")[0]
      if (!byDay[day]) byDay[day] = { events: 0 }
      byDay[day].events++
    }
    return Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }))
  }, [appEvents, bubbleEvents])

  const fullName = [reg.firstName, reg.lastName].filter(Boolean).join(" ").trim()
  const displayedName = fullName || user?.username || user?.displayName || user?.email || userId
  const age = calculateAge(reg.birthDate || user?.birthDate, reg.age)

  const totalMessages = conversations.reduce((sum: number, c: any) => sum + (c.messageCount || 0), 0)

  if (isError || (!isLoading && !user)) {
    return (
      <div className="flex flex-col">
        <Header title="User Detail" description={userId} />
        <div className="flex-1 space-y-4 p-6">
          <Link
            href="/users"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Link>
          <Card className="border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive-foreground">
            User not found, or failed to load profile.
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Header
        title="User Detail"
        description={user?.email || userId}
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <Link
          href="/users"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>

        {/* Header card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <UserIcon className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-lg text-foreground">{displayedName}</CardTitle>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {user?.email && <span>{user.email}</span>}
                    {user?.phone && (
                      <a href={`tel:${user.phone}`} className="text-primary hover:underline">
                        {user.phone}
                      </a>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {userId}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {user?.metadata?.platform && (
                  <Badge variant="secondary">{user.metadata.platform}</Badge>
                )}
                {user?.metadata?.appVersion && <Badge variant="outline">v{user.metadata.appVersion}</Badge>}
                {user?.subscriptionStatus?.isPremium ? (
                  <Badge className="bg-success text-success-foreground">Premium</Badge>
                ) : (
                  <Badge variant="secondary">Free</Badge>
                )}
                {user?.flags?.onboardingCompleted && (
                  <Badge className="bg-success text-success-foreground">Onboarded</Badge>
                )}
                {reg.lifeStage && <Badge variant="outline">{String(reg.lifeStage).replace(/_/g, " ")}</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium text-foreground">
                  {user?.createdAt ? formatDateTime(user.createdAt) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Login</p>
                <p className="text-sm font-medium text-foreground">
                  {user?.metadata?.lastLoginAt ? formatDateTime(user.metadata.lastLoginAt) : "Never"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Profile Completion</p>
                <p className="text-sm font-medium text-foreground">{user?.flags?.profileCompletion || 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Activity</p>
                <p className="text-sm font-medium text-foreground">
                  {lastActivity ? (
                    <>
                      {formatDateTime(lastActivity.timestamp)}{" "}
                      <span className="italic text-muted-foreground">— {lastActivity.description}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="bg-card">
            <TabsTrigger value="profile" className="gap-2">
              <UserIcon className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="tracking" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Tracking
            </TabsTrigger>
            <TabsTrigger value="conversations" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversations
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="routines" className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              Routines
            </TabsTrigger>
          </TabsList>

          {/* PROFILE */}
          <TabsContent value="profile" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm">Personal</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <FieldRow label="First Name" value={reg.firstName} />
                  <FieldRow label="Last Name" value={reg.lastName} />
                  <FieldRow label="Age" value={age} />
                  <FieldRow label="Sex" value={reg.sex} />
                  <FieldRow label="Birth Date" value={reg.birthDate || user?.birthDate} />
                  <FieldRow label="City" value={reg.city} />
                  <FieldRow label="Location" value={reg.location} />
                  <FieldRow label="Language" value={reg.language} />
                  <FieldRow label="Weight (kg)" value={rawDoc.weightKg} />
                  <FieldRow label="Food Region" value={rawDoc.foodRegion} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm">Health Profile</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <FieldRow label="Life Stage" value={reg.lifeStage} />
                  <FieldRow label="Has Periods" value={typeof reg.hasPeriods === "boolean" ? (reg.hasPeriods ? "Yes" : "No") : reg.hasPeriods} />
                  <FieldRow
                    label="Has Recurring Periods"
                    value={
                      typeof reg.hasRecurringPeriods === "boolean"
                        ? reg.hasRecurringPeriods
                          ? "Yes"
                          : "No"
                        : reg.hasRecurringPeriods
                    }
                  />
                  <FieldRow label="Menstrual Pain" value={reg.menstrualPain} />
                  <FieldRow label="Period Frequency" value={reg.periodFrequency} />
                  <FieldRow label="Menopause Stage" value={reg.menopauseStage} />
                  <FieldRow label="Bleeding Status" value={reg.bleedingStatus} />
                  <FieldRow label="Bleeding Ongoing" value={reg.bleedingOngoing} />
                  <FieldRow label="Family History (Endo)" value={reg.familyHistoryEndo} />
                  <FieldRow label="Period Symptoms" value={<TagList values={reg.periodSymptoms} />} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Symptoms &amp; Conditions</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <FieldRow label="Main Burden" value={reg.mainBurden} />
                  <FieldRow label="Symptom Timing" value={reg.symptomTiming} />
                  <FieldRow label="Main Symptoms" value={<TagList values={reg.mainSymptoms} />} />
                  <FieldRow label="Symptoms" value={<TagList values={reg.symptoms} />} />
                  <FieldRow label="Medical Conditions" value={<TagList values={reg.medicalConditions} />} />
                  <FieldRow label="Endometriosis Types" value={<TagList values={reg.endometriosisTypes} />} />
                  <FieldRow label="Endo Locations" value={<TagList values={reg.endoLocations} />} />
                  <FieldRow label="Endo Stage" value={reg.endoStage} />
                  <FieldRow label="Adeno Form" value={reg.adenoForm} />
                  <FieldRow label="Adeno Uterus Location" value={reg.adenoUterusLocation} />
                  <FieldRow label="PCOS Impacts" value={<TagList values={reg.pcosImpacts} />} />
                  <FieldRow label="Fibro Impacts" value={<TagList values={reg.fibroImpacts} />} />
                  <FieldRow label="Suspected Reason" value={reg.suspectedReason} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Treatments &amp; Medical</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <FieldRow label="Current Treatments" value={<TagList values={reg.currentTreatments} />} />
                  <FieldRow label="Treatment Status" value={reg.currentTreatmentStatus} />
                  <FieldRow label="Contraception" value={reg.contraceptionName} />
                  <FieldRow label="Hormonal Modifier" value={reg.hormonalModifier} />
                  <FieldRow label="Medical Follow Up" value={reg.medicalFollowUp} />
                  <FieldRow label="Medical Journey" value={reg.medicalJourney} />
                  <FieldRow label="Diagnosis Method" value={reg.diagnosisMethod} />
                  <FieldRow label="Exams Completed" value={<TagList values={reg.examsCompleted} />} />
                  <FieldRow label="Surgery History" value={reg.surgeryHistory} />
                  <FieldRow label="What Doctor Said" value={reg.whatDoctorSaid} />
                  <FieldRow label="What Weighs Most" value={reg.whatWeighsMost} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm">Goals &amp; Preferences</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <FieldRow label="Primary Objective" value={reg.primaryObjective} />
                  <FieldRow label="Health Goals" value={<TagList values={reg.healthGoals} />} />
                  <FieldRow label="Tracking Priorities" value={<TagList values={reg.trackingPriorities} />} />
                  <FieldRow label="Food Triggers" value={<TagList values={reg.foodTriggers} />} />
                  <FieldRow label="Upcoming Events" value={<TagList values={reg.upcomingEvents} />} />
                  <FieldRow
                    label="Reminder Preferences"
                    value={
                      reg.reminderPreferences && typeof reg.reminderPreferences === "object" ? (
                        <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(reg.reminderPreferences, null, 2)}
                        </pre>
                      ) : (
                        reg.reminderPreferences
                      )
                    }
                  />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm">Auth &amp; Device</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <FieldRow label="Providers" value={<TagList values={rawDoc.providers} />} />
                  <FieldRow label="Push Token" value={maskToken(rawDoc.pushToken)} />
                  <FieldRow label="App Version" value={user?.metadata?.appVersion} />
                  <FieldRow label="Platform" value={user?.metadata?.platform} />
                  <FieldRow label="Registration Branch" value={reg.registrationBranch} />
                  <FieldRow label="Onboarding Version" value={reg.onboardingVersion} />
                  <FieldRow
                    label="Onboarded At"
                    value={user?.onboardingCompletedAt ? formatDateTime(user.onboardingCompletedAt) : undefined}
                  />
                  <FieldRow
                    label="Device Info"
                    value={
                      reg.deviceInfo && typeof reg.deviceInfo === "object" ? (
                        <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(reg.deviceInfo, null, 2)}
                        </pre>
                      ) : undefined
                    }
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TRACKING */}
          <TabsContent value="tracking" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Current Streak</p>
                <p className="text-2xl font-bold text-success">{currentStreak} days</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Best Streak</p>
                <p className="text-2xl font-bold text-foreground">{bestStreak} days</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Avg Completeness</p>
                <p className="text-2xl font-bold text-primary">{avgCompleteness}%</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Entries Loaded</p>
                <p className="text-2xl font-bold text-foreground">{trackingEntries.length}</p>
              </Card>
            </div>

            <ChartCard
              title="Tracking Completeness"
              description="Daily tracking completion percentage"
              isLoading={isLoading}
              onReload={handleReload}
            >
              <AreaChart data={trackingChartData} xKey="date" yKey="completeness" color="#22D3EE" />
            </ChartCard>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Symptoms Logged</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {symptomStats.totalLogged} logged · {symptomStats.ranked.length} unique
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {symptomStats.ranked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No symptoms logged in the loaded entries.</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {symptomStats.ranked.map(({ name, count }) => {
                        const pct = symptomStats.maxCount > 0 ? (count / symptomStats.maxCount) * 100 : 0
                        return (
                          <div key={name} className="flex items-center gap-3">
                            <span className="w-44 truncate text-xs text-foreground">
                              {name.replace(/_/g, " ")}
                            </span>
                            <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted/40">
                              <div
                                className="absolute inset-y-0 left-0 bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                              {count}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {symptomStats.recent.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                          Most recent entries
                        </p>
                        <div className="space-y-1.5">
                          {symptomStats.recent.map((entry) => (
                            <div key={entry.date} className="flex flex-wrap items-center gap-2">
                              <span className="w-24 text-xs text-muted-foreground">{entry.date}</span>
                              <div className="flex flex-wrap gap-1">
                                {entry.symptoms.map((s) => (
                                  <Badge key={s} variant="secondary" className="text-[10px] font-normal">
                                    {s.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Alimentation</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {foodTrials.length} food trials
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Meals summary from tracking entries */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avg Calories / day</p>
                    <p className="text-lg font-semibold text-foreground">
                      {foodStats.avgCalories != null ? `${foodStats.avgCalories} kcal` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{foodStats.calorieDays} days</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avg Water / day</p>
                    <p className="text-lg font-semibold text-foreground">
                      {foodStats.avgWater != null ? `${foodStats.avgWater} L` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{foodStats.waterDays} days</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Food Trials</p>
                    <p className="text-lg font-semibold text-foreground">{foodTrials.length}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Food Triggers (declared)</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Array.isArray(reg.foodTriggers) && reg.foodTriggers.length > 0 ? (
                        reg.foodTriggers.slice(0, 6).map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[10px] font-normal">
                            {String(t).replace(/_/g, " ")}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status / category / outcome breakdown */}
                {(foodStats.statusCounts.length > 0 ||
                  foodStats.categoryCounts.length > 0 ||
                  foodStats.outcomeCounts.length > 0) && (
                  <div className="grid gap-3 md:grid-cols-3">
                    {foodStats.statusCounts.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">By status</p>
                        <div className="flex flex-wrap gap-1">
                          {foodStats.statusCounts.map(([name, count]) => (
                            <Badge key={name} variant="secondary" className="text-[10px] font-normal">
                              {name} ({count})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {foodStats.categoryCounts.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">By category</p>
                        <div className="flex flex-wrap gap-1">
                          {foodStats.categoryCounts.map(([name, count]) => (
                            <Badge key={name} variant="outline" className="text-[10px] font-normal">
                              {name} ({count})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {foodStats.outcomeCounts.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">By outcome</p>
                        <div className="flex flex-wrap gap-1">
                          {foodStats.outcomeCounts.map(([name, count]) => (
                            <Badge key={name} variant="secondary" className="text-[10px] font-normal">
                              {name} ({count})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recent food trials list */}
                {foodTrials.length > 0 ? (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      Recent food trials
                    </p>
                    <div className="space-y-1.5">
                      {foodTrials.slice(0, 30).map((t: any) => {
                        const dateLabel = t.createdAt || t.startedAt
                        return (
                          <div
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 p-3"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium text-foreground">
                                {t.foodName || t.id}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {dateLabel ? formatDateTime(dateLabel) : "no date"}
                                {t.endedAt && ` → ${formatDateTime(t.endedAt)}`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {t.category && (
                                <Badge variant="outline" className="text-[10px]">
                                  {t.category}
                                </Badge>
                              )}
                              {t.status && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {t.status}
                                </Badge>
                              )}
                              {t.result && (
                                <Badge className="bg-primary/15 text-primary text-[10px]">
                                  {t.result}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : foodStats.calorieDays === 0 && foodStats.waterDays === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No meals data or food trials logged for this user.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm">Recent Tracking Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                {trackingSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tracking sessions found.</p>
                ) : (
                  <div className="space-y-2">
                    {trackingSessions.slice(0, 30).map((session: any) => (
                      <div
                        key={session.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 p-3"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-foreground">{formatDateTime(session.startedAt)}</span>
                          <span className="text-xs text-muted-foreground">
                            {session.durationMs ? formatDuration(session.durationMs) : "—"}
                            {session.entryMethod && ` · ${session.entryMethod}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(session.sections || []).map((s: string) => (
                            <Badge key={s} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONVERSATIONS */}
          <TabsContent value="conversations" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Conversations</p>
                <p className="text-2xl font-bold text-foreground">{conversations.length}</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Messages</p>
                <p className="text-2xl font-bold text-foreground">{totalMessages}</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Avg Msgs / Conv</p>
                <p className="text-2xl font-bold text-primary">
                  {conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0}
                </p>
              </Card>
            </div>

            <Card className="flex h-[600px] flex-col border-border bg-card">
              <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                <UserChatsPanel userId={userId} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACTIVITY */}
          <TabsContent value="activity" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">App Events Loaded</p>
                <p className="text-2xl font-bold text-foreground">{appEvents.length}</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Bubble Events Loaded</p>
                <p className="text-2xl font-bold text-foreground">{bubbleEvents.length}</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Days With Activity</p>
                <p className="text-2xl font-bold text-primary">{activityByDay.length}</p>
              </Card>
            </div>

            <ChartCard
              title="Events Per Day"
              description="App + Bubble events combined"
              isLoading={isLoading}
              onReload={handleReload}
            >
              <AreaChart data={activityByDay} xKey="date" yKey="events" color="#3B82F6" />
            </ChartCard>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListTree className="h-4 w-4" />
                  Recent Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                {[...appEvents, ...bubbleEvents].length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events found.</p>
                ) : (
                  <div className="space-y-2">
                    {[...appEvents.map((e: any) => ({ ...e, _kind: "app" })), ...bubbleEvents.map((e: any) => ({ ...e, _kind: "bubble" }))]
                      .sort((a: any, b: any) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
                      .slice(0, 50)
                      .map((e: any) => (
                        <div key={`${e._kind}-${e.id}`} className="rounded-lg bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {e._kind}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">
                                {e.name || e.event || "(unnamed)"}
                              </span>
                              {e.screen && (
                                <span className="text-xs text-muted-foreground">→ {e.screen}</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {e.createdAt ? formatDateTime(e.createdAt) : "—"}
                            </span>
                          </div>
                          {e.params && Object.keys(e.params).length > 0 && (
                            <pre className="mt-2 max-h-32 overflow-auto rounded bg-background/50 p-2 text-[11px] text-muted-foreground">
                              {JSON.stringify(e.params, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ROUTINES */}
          <TabsContent value="routines" className="space-y-4">
            {routines.length === 0 ? (
              <Card className="border-border bg-card p-6 text-sm text-muted-foreground">
                No routines found for this user.
              </Card>
            ) : (
              <div className="space-y-2">
                {routines.map((r: any) => (
                  <Card key={r.id} className="border-border bg-card">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {r.title || r.name || r.type || r.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created {r.createdAt ? formatDateTime(r.createdAt) : "—"}
                            {r.lastUsed && ` · Last used ${formatDateTime(r.lastUsed)}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {typeof r.usageCount === "number" && (
                            <Badge variant="outline" className="text-[10px]">
                              {r.usageCount} uses
                            </Badge>
                          )}
                          {Array.isArray(r.sections) && r.sections.length > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {r.sections.length} sections
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
