"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Header } from "@/components/dashboard/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChartCard } from "@/components/dashboard/chart-card"
import { AreaChart } from "@/components/charts/area-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { formatDateTime, getDefaultDateRange } from "@/lib/date-utils"
import { fetchUserById, fetchTrackingEntries } from "@/lib/firestore-queries"
import { getFirebaseDb, collection, query, where, orderBy, limit, getDocs, toDate } from "@/lib/firebase"
import type { User, TrackingEntry, ChatConversation } from "@/lib/types"
import { UserIcon, Activity, BarChart3, Camera, MessageSquare, ArrowLeft } from "lucide-react"
import Link from "next/link"

async function fetchUserData(userId: string) {
  const db = getFirebaseDb()
  const dateRange = getDefaultDateRange()

  // Fetch user
  const user = await fetchUserById(userId)

  // Fetch user's tracking entries
  const { data: trackingEntries } = await fetchTrackingEntries({
    from: dateRange.from,
    to: dateRange.to,
    userId,
    limitCount: 100,
  })

  // Fetch user's conversations
  const conversationsRef = collection(db, "chat_conversations")
  const convQuery = query(conversationsRef, where("userId", "==", userId), orderBy("createdAt", "desc"), limit(10))
  const convSnapshot = await getDocs(convQuery)
  const conversations: ChatConversation[] = convSnapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      userId: data.userId || "",
      messageCount: data.messageCount || 0,
      topics: data.topics || [],
      entryPoint: data.entryPoint,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    }
  })

  // Fetch user's photos
  const photosRef = collection(db, "photos")
  const photosQuery = query(photosRef, where("userId", "==", userId), orderBy("createdAt", "desc"), limit(100))
  const photosSnapshot = await getDocs(photosQuery)
  const photos = photosSnapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      pain: data.pain || 0,
      bloated: data.bloated || 0,
      time: data.time || "",
      viewCount: data.viewCount || 0,
      createdAt: toDate(data.createdAt) || new Date(),
    }
  })

  // Fetch user's app events for activity
  const eventsRef = collection(db, "app_events")
  const eventsQuery = query(eventsRef, where("userId", "==", userId), orderBy("createdAt", "desc"), limit(200))
  const eventsSnapshot = await getDocs(eventsQuery)
  const events = eventsSnapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      name: data.name,
      createdAt: toDate(data.createdAt) || new Date(),
    }
  })

  return { user, trackingEntries, conversations, photos, events }
}

export default function UserDetailPage() {
  const params = useParams()
  const userId = params.userId as string
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUserData(userId),
    enabled: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const user: User = data?.user || {
    id: userId,
    email: "",
    username: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    flags: {},
  }

  const trackingEntries: TrackingEntry[] = data?.trackingEntries || []
  const conversations: ChatConversation[] = data?.conversations || []
  const photos = data?.photos || []
  const events = data?.events || []

  // Calculate activity data by day
  const activityByDay: Record<string, { events: number; sessions: number }> = {}
  events.forEach((e) => {
    const day = e.createdAt.toISOString().split("T")[0]
    if (!activityByDay[day]) activityByDay[day] = { events: 0, sessions: 0 }
    activityByDay[day].events++
  })
  const activityData = Object.entries(activityByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({ date, ...data }))

  // Calculate tracking data
  const trackingData = trackingEntries.map((e) => ({
    date: e.date,
    completeness: e.completeness,
  }))

  // Calculate streaks
  let currentStreak = 0
  let bestStreak = 0
  let tempStreak = 0
  const sortedDates = trackingEntries.map((e) => e.date).sort()
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      tempStreak = 1
    } else {
      const prev = new Date(sortedDates[i - 1])
      const curr = new Date(sortedDates[i])
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays === 1) {
        tempStreak++
      } else {
        tempStreak = 1
      }
    }
    bestStreak = Math.max(bestStreak, tempStreak)
  }
  // Check if current streak is active (last entry was today or yesterday)
  if (sortedDates.length > 0) {
    const lastDate = new Date(sortedDates[sortedDates.length - 1])
    const today = new Date()
    const diffDays = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 1) {
      currentStreak = tempStreak
    }
  }

  const avgCompleteness =
    trackingEntries.length > 0
      ? Math.round(trackingEntries.reduce((sum, e) => sum + e.completeness, 0) / trackingEntries.length)
      : 0

  // Calculate photo stats
  const painDistribution = [
    { name: "0-2", value: photos.filter((p) => p.pain >= 0 && p.pain <= 2).length },
    { name: "3-5", value: photos.filter((p) => p.pain >= 3 && p.pain <= 5).length },
    { name: "6-8", value: photos.filter((p) => p.pain >= 6 && p.pain <= 8).length },
    { name: "9-10", value: photos.filter((p) => p.pain >= 9 && p.pain <= 10).length },
  ]
  const bloatDistribution = [
    { name: "0-2", value: photos.filter((p) => p.bloated >= 0 && p.bloated <= 2).length },
    { name: "3-5", value: photos.filter((p) => p.bloated >= 3 && p.bloated <= 5).length },
    { name: "6-8", value: photos.filter((p) => p.bloated >= 6 && p.bloated <= 8).length },
    { name: "9-10", value: photos.filter((p) => p.bloated >= 9 && p.bloated <= 10).length },
  ]
  const avgPain = photos.length > 0 ? Math.round((photos.reduce((s, p) => s + p.pain, 0) / photos.length) * 10) / 10 : 0

  // Chat metrics
  const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0)

  return (
    <div className="flex flex-col">
      <Header title="User Detail" description={user.email || userId} lastUpdated={lastUpdated} />

      <div className="flex-1 space-y-6 p-6">
        {/* Back Link */}
        <Link
          href="/users"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>

        {/* User Overview Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <UserIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg text-foreground">{user.username || user.email || userId}</CardTitle>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{user.metadata?.platform || "Unknown"}</Badge>
                {user.metadata?.appVersion && <Badge variant="outline">v{user.metadata.appVersion}</Badge>}
                {user.flags?.onboardingCompleted && (
                  <Badge className="bg-success text-success-foreground">Onboarded</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium text-foreground">{formatDateTime(user.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Login</p>
                <p className="text-sm font-medium text-foreground">
                  {user.metadata?.lastLoginAt ? formatDateTime(user.metadata.lastLoginAt) : "Never"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Profile Completion</p>
                <p className="text-sm font-medium text-foreground">{user.flags?.profileCompletion || 0}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Registration Step</p>
                <p className="text-sm font-medium text-foreground">
                  {user.flags?.registrationCompleted ? "Completed" : `Step ${user.flags?.registrationStep || 0}`}
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
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="tracking" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Tracking
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-2">
              <Camera className="h-4 w-4" />
              Photos
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Registration Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.registrationData ? (
                  <>
                    {(user.registrationData as Record<string, unknown>).dietaryPreferences && (
                      <div>
                        <p className="text-xs text-muted-foreground">Dietary Preferences</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {((user.registrationData as Record<string, unknown>).dietaryPreferences as string[]).map(
                            (pref: string) => (
                              <Badge key={pref} variant="secondary">
                                {pref}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                    {(user.registrationData as Record<string, unknown>).healthGoals && (
                      <div>
                        <p className="text-xs text-muted-foreground">Health Goals</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {((user.registrationData as Record<string, unknown>).healthGoals as string[]).map(
                            (goal: string) => (
                              <Badge key={goal} variant="outline">
                                {goal.replace(/_/g, " ")}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No registration data available</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Flags & Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <span className="text-sm text-muted-foreground">Onboarding Completed</span>
                    <Badge variant={user.flags?.onboardingCompleted ? "default" : "secondary"}>
                      {user.flags?.onboardingCompleted ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <span className="text-sm text-muted-foreground">Registration Completed</span>
                    <Badge variant={user.flags?.registrationCompleted ? "default" : "secondary"}>
                      {user.flags?.registrationCompleted ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <ChartCard
              title="Activity Timeline"
              description="Events over time"
              isLoading={isLoading}
              onReload={handleReload}
            >
              <AreaChart data={activityData} xKey="date" yKey="events" color="#3B82F6" />
            </ChartCard>

            <Card className="border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Events (Last 30 days)</p>
              <p className="text-2xl font-bold text-foreground">{events.length}</p>
            </Card>
          </TabsContent>

          <TabsContent value="tracking" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
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
            </div>

            <ChartCard
              title="Tracking Completeness"
              description="Daily tracking completion percentage"
              isLoading={isLoading}
              onReload={handleReload}
            >
              <AreaChart data={trackingData} xKey="date" yKey="completeness" color="#22D3EE" />
            </ChartCard>

            {/* Tracking Calendar */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Tracking Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }, (_, i) => {
                    const entry = trackingEntries[i]
                    const completeness = entry ? entry.completeness / 100 : 0
                    let bgColor = "bg-muted/30"
                    if (completeness > 0.8) bgColor = "bg-success"
                    else if (completeness > 0.5) bgColor = "bg-success/60"
                    else if (completeness > 0.2) bgColor = "bg-warning/60"
                    else if (completeness > 0) bgColor = "bg-destructive/40"

                    return (
                      <div
                        key={i}
                        className={`aspect-square rounded ${bgColor}`}
                        title={entry ? `${entry.date}: ${entry.completeness}%` : "No data"}
                      />
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="h-3 w-3 rounded bg-muted/30" />
                    <div className="h-3 w-3 rounded bg-destructive/40" />
                    <div className="h-3 w-3 rounded bg-warning/60" />
                    <div className="h-3 w-3 rounded bg-success/60" />
                    <div className="h-3 w-3 rounded bg-success" />
                  </div>
                  <span>More</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total Photos</p>
                <p className="text-2xl font-bold text-foreground">{photos.length}</p>
              </Card>
              <Card className="border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Avg Pain Score</p>
                <p className="text-2xl font-bold text-warning">{avgPain}</p>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <ChartCard
                title="Pain Distribution"
                description="Pain scores across photos"
                isLoading={isLoading}
                onReload={handleReload}
              >
                <BarChart data={painDistribution} xKey="name" yKey="value" color="#FF5C5C" />
              </ChartCard>

              <ChartCard
                title="Bloat Distribution"
                description="Bloat scores across photos"
                isLoading={isLoading}
                onReload={handleReload}
              >
                <BarChart data={bloatDistribution} xKey="name" yKey="value" color="#FFB020" />
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
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
                <p className="text-xs text-muted-foreground">Avg Messages/Conv</p>
                <p className="text-2xl font-bold text-primary">
                  {conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0}
                </p>
              </Card>
            </div>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Recent Conversations</CardTitle>
              </CardHeader>
              <CardContent>
                {conversations.length > 0 ? (
                  <div className="space-y-2">
                    {conversations.slice(0, 5).map((conv) => (
                      <Link
                        key={conv.id}
                        href={`/chats/${conv.id}`}
                        className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{conv.id.slice(0, 16)}...</p>
                          <p className="text-xs text-muted-foreground">
                            {conv.messageCount} messages - {formatDateTime(conv.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {conv.topics?.slice(0, 2).map((topic) => (
                            <Badge key={topic} variant="secondary" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No conversations found. Click Reload to fetch data.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
