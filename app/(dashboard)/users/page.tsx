"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { Header } from "@/components/dashboard/header"
import { DataTable } from "@/components/tables/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserChatsDrawer } from "@/components/users/UserChatsDrawer"
import { ConversationInsightsPanel } from "@/components/users/ConversationInsightsPanel"
import { ContactDialog } from "@/components/users/ContactDialog"
import { formatDateTime } from "@/lib/date-utils"
import {
  checkUserHasChats,
  fetchUsers,
  fetchContactsForUsers,
  fetchLastLoginsForUsers,
  fetchLastActivitiesForUsers,
  fetchUserDailySessionTimes,
} from "@/lib/api-client"
import { CONTACT_CHANNEL_LABELS, type User } from "@/lib/types"
import { Mail, MessageSquare, Phone, Search, UserPlus, X } from "lucide-react"

type PlatformFilter = "all" | "ios" | "android"
type PremiumFilter = "all" | "premium" | "free"
type ContactFilter = "all" | "contacted" | "not_contacted"
type ChurnFilter = "all" | "churned"
type ActivityFilter = "all" | "inactive"

// Per-row shortcut to read a user's conversations without leaving the list.
// Only renders for users that actually have chats so the column stays sparse.
function UserChatAction({ user, onOpen }: { user: User; onOpen: (user: User) => void }) {
  const { data: hasChats } = useQuery({
    queryKey: ["userHasChats", user.id],
    queryFn: () => checkUserHasChats(user.id),
    enabled: Boolean(user.id),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  if (!hasChats) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={(e) => {
        // Stop the row's onClick (navigate to user detail) from also firing.
        e.stopPropagation()
        onOpen(user)
      }}
    >
      <MessageSquare className="h-4 w-4" />
      <span className="sr-only">Open chats</span>
    </Button>
  )
}

// Wrap any CSV cell so embedded commas, quotes, and newlines don't break the row.
const csvEscape = (v: unknown): string => {
  const s = v == null ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function UsersPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search, 350)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all")
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>("all")
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all")
  const [churnFilter, setChurnFilter] = useState<ChurnFilter>("all")
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all")
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })
  const [pageCursors, setPageCursors] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [chatDrawerUser, setChatDrawerUser] = useState<{ id: string; email: string } | null>(null)
  const [contactDialogUser, setContactDialogUser] = useState<{ id: string; email: string } | null>(null)

  const filtersActive =
    !!search ||
    !!fromDate ||
    !!toDate ||
    platformFilter !== "all" ||
    premiumFilter !== "all" ||
    contactFilter !== "all" ||
    churnFilter !== "all" ||
    activityFilter !== "all"

  // Reset pagination and cursors whenever any filter changes — the cursor
  // stack from the previous filter combination is no longer valid.
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 50 })
    setPageCursors([])
  }, [debouncedSearch, fromDate, toDate, platformFilter, premiumFilter, contactFilter, churnFilter, activityFilter])

  const startAfter = pagination.pageIndex > 0 ? pageCursors[pagination.pageIndex - 1] : undefined

  const platformParam = platformFilter === "all" ? undefined : platformFilter
  const premiumParam =
    premiumFilter === "all" ? undefined : premiumFilter === "premium"
  const contactedParam =
    contactFilter === "all" ? undefined : contactFilter === "contacted"

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "users",
      debouncedSearch,
      fromDate,
      toDate,
      platformFilter,
      premiumFilter,
      contactFilter,
      churnFilter,
      activityFilter,
      pagination.pageSize,
      pagination.pageIndex,
    ],
    queryFn: () =>
      fetchUsers({
        limitCount: pagination.pageSize,
        search: debouncedSearch,
        startAfter,
        from: fromDate || undefined,
        to: toDate || undefined,
        platform: platformParam,
        premium: premiumParam,
        contacted: contactedParam,
        churned: churnFilter === "churned" || undefined,
        inactive: activityFilter === "inactive" || undefined,
      }),
    enabled: pagination.pageIndex === 0 || !!startAfter,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  })

  const resetFilters = () => {
    setSearch("")
    setFromDate("")
    setToDate("")
    setPlatformFilter("all")
    setPremiumFilter("all")
    setContactFilter("all")
    setChurnFilter("all")
    setActivityFilter("all")
  }

  // Store cursor for the current page when data arrives
  useEffect(() => {
    if (data?.lastCreatedAt) {
      setPageCursors((prev) => {
        const next = [...prev]
        next[pagination.pageIndex] = data.lastCreatedAt!
        return next
      })
    }
  }, [data?.lastCreatedAt, pagination.pageIndex])

  const users: User[] = data?.data || []
  const userIds = users.map((u) => u.id)

  const { data: lastLoginsMap } = useQuery({
    queryKey: ["lastLogins", userIds],
    queryFn: () => fetchLastLoginsForUsers(userIds),
    enabled: userIds.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: lastActivitiesMap } = useQuery({
    queryKey: ["lastActivities", userIds],
    queryFn: () => fetchLastActivitiesForUsers(userIds),
    enabled: userIds.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: userSessionTimes } = useQuery({
    queryKey: ["userSessionTimes", userIds],
    queryFn: () => fetchUserDailySessionTimes(userIds),
    enabled: userIds.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const { data: contactSummaries } = useQuery({
    queryKey: ["contactSummaries", userIds],
    queryFn: () => fetchContactsForUsers(userIds),
    enabled: userIds.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })

  const handleReload = async () => {
    setPagination({ pageIndex: 0, pageSize: 50 })
    setPageCursors([])
    await refetch()
    setLastUpdated(new Date())
  }

  // Shared chats-drawer opener: callers may have only a userId (e.g. the
  // insights panel) or a full User (the Chats column).
  const openChatsForUser = (userId: string, email = "") => {
    setChatDrawerUser({ id: userId, email })
    setChatDrawerOpen(true)
  }
  const handleOpenChats = (user: User) => openChatsForUser(user.id, user.email)

  const handleCloseChats = () => {
    setChatDrawerOpen(false)
    setChatDrawerUser(null)
  }

  const handleExport = () => {
    if (!data?.data) return
    const headers = [
      "Email",
      "Name",
      "Phone",
      "Created At",
      "Last Login",
      "Last Activity",
      "Platform",
      "Age",
      "Avg Daily Time",
      "Payment",
      "Last Contact",
    ]
    const csv = [
      headers.map(csvEscape).join(","),
      ...data.data.map((user: User) => {
        const name = user.username || user.displayName || user.registrationData?.name || "-"
        const phone = user.phone || "—"
        const createdAt = user.createdAt?.toISOString() || ""
        const lastLogin = lastLoginsMap?.[user.id]
        const lastLoginStr = lastLogin ? formatDateTime(lastLogin) : "—"

        const lastActivity = lastActivitiesMap?.[user.id]
        const lastActivityStr = lastActivity
          ? `${formatDateTime(lastActivity.timestamp)} - "${lastActivity.description}"`
          : "—"

        const platform = user.metadata?.platform || "Unknown"

        let age = "-"
        if (user.registrationData?.age) {
          age = user.registrationData.age
        } else if (user.registrationData?.birthDate || user.birthDate) {
          const birthDateStr = user.registrationData?.birthDate || user.birthDate
          if (birthDateStr) {
            const birthDate = new Date(birthDateStr)
            const today = new Date()
            const calculatedAge = today.getFullYear() - birthDate.getFullYear()
            age = calculatedAge.toString()
          }
        }

        const payment = user.subscriptionStatus?.isPremium ? "Premium" : "Free"

        const sessionTime = userSessionTimes?.[user.id]
        const avgDailyTimeStr = sessionTime?.avgDailyTimeMinutes
          ? `${sessionTime.avgDailyTimeMinutes} min (${sessionTime.totalSessions} sessions)`
          : "—"

        const contact = contactSummaries?.[user.id]
        const lastContactStr = contact
          ? `${CONTACT_CHANNEL_LABELS[contact.lastChannel]} ${formatDateTime(
              contact.lastContactedAt,
            )} par ${contact.lastContactedBy} (x${contact.contactCount})`
          : "—"

        return [
          user.email,
          name,
          phone,
          createdAt,
          lastLoginStr,
          lastActivityStr,
          platform,
          age,
          avgDailyTimeStr,
          payment,
          lastContactStr,
        ]
          .map(csvEscape)
          .join(",")
      }),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `users-export-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const calculateAge = (user: User): string => {
    if (user.registrationData?.age) {
      return user.registrationData.age
    }

    const birthDateStr = user.registrationData?.birthDate || user.birthDate
    if (birthDateStr) {
      try {
        const birthDate = new Date(birthDateStr)
        const today = new Date()
        const age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          return (age - 1).toString()
        }
        return age.toString()
      } catch {
        return "-"
      }
    }

    return "-"
  }

  // Calculate total page count for pagination
  const pageCount = useMemo(() => {
    if (!data) return 1 // No data yet = show 1 page
    if (data.hasMore) {
      // More data exists = at least current page + 1 more
      return pagination.pageIndex + 2
    }
    // No more data = current page is the last
    return pagination.pageIndex + 1
  }, [data, pagination.pageIndex])

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.email}</span>,
    },
    {
      accessorKey: "username",
      header: "Name",
      cell: ({ row }) => {
        const name = row.original.username || row.original.displayName || row.original.registrationData?.name || "-"
        return <span className="text-sm text-muted-foreground">{name}</span>
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      accessorKey: "lastLogin",
      header: "Last Login",
      cell: ({ row }) => {
        const lastLogin = lastLoginsMap?.[row.original.id]
        return <span className="text-sm text-muted-foreground">{lastLogin ? formatDateTime(lastLogin) : "—"}</span>
      },
    },
    {
      accessorKey: "lastActivity",
      header: "Last Activity",
      cell: ({ row }) => {
        const activity = lastActivitiesMap?.[row.original.id]
        if (!activity) {
          return <span className="text-sm text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">{formatDateTime(activity.timestamp)}</span>
            <span className="text-xs text-muted-foreground italic">"{activity.description}"</span>
          </div>
        )
      },
    },
    {
      accessorKey: "metadata.platform",
      header: "Platform",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {row.original.metadata?.platform || "Unknown"}
        </Badge>
      ),
    },
    {
      accessorKey: "age",
      header: "Age",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{calculateAge(row.original)}</span>,
    },
    {
      accessorKey: "avgDailyTime",
      header: "Avg Daily Time",
      cell: ({ row }) => {
        const sessionTime = userSessionTimes?.[row.original.id]
        if (!sessionTime || sessionTime.avgDailyTimeMinutes === 0) {
          return <span className="text-sm text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">{sessionTime.avgDailyTimeMinutes} min</span>
            <span className="text-xs text-muted-foreground">{sessionTime.totalSessions} sessions</span>
          </div>
        )
      },
    },
    {
      accessorKey: "subscriptionStatus.isPremium",
      header: "Payment",
      cell: ({ row }) => {
        const isPremium = row.original.subscriptionStatus?.isPremium
        return (
          <Badge
            variant={isPremium ? "default" : "secondary"}
            className={isPremium ? "bg-success text-success-foreground" : ""}
          >
            {isPremium ? "Premium" : "Free"}
          </Badge>
        )
      },
    },
    {
      id: "contacted",
      header: "Contacté",
      cell: ({ row }) => {
        const summary = contactSummaries?.[row.original.id]
        return (
          <div className="flex items-center gap-1">
            {summary ? (
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  {summary.lastChannel === "phone" ? (
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {formatDateTime(summary.lastContactedAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {summary.lastContactedBy.split("@")[0]}
                  {summary.contactCount > 1 && ` (x${summary.contactCount})`}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                // Stop the row's onClick (navigate to user detail) from also firing.
                e.stopPropagation()
                setContactDialogUser({ id: row.original.id, email: row.original.email })
              }}
            >
              <UserPlus className="h-4 w-4" />
              <span className="sr-only">Enregistrer un contact</span>
            </Button>
          </div>
        )
      },
    },
    {
      id: "chats",
      header: "Chats",
      cell: ({ row }) => <UserChatAction user={row.original} onOpen={handleOpenChats} />,
    },
  ]

  return (
    <div className="flex flex-col">
      <Header title="Users" description="Manage and analyze user data" lastUpdated={lastUpdated} />

      <div className="flex-1 space-y-6 p-6">
        <ConversationInsightsPanel onOpenChats={openChatsForUser} />

        {/* Search + Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email, username, or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card pl-9"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Signup from
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 w-[160px] bg-card"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Signup to
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 w-[160px] bg-card"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Platform
              </label>
              <Select
                value={platformFilter}
                onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}
              >
                <SelectTrigger className="h-9 w-[140px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subscription
              </label>
              <Select
                value={premiumFilter}
                onValueChange={(v) => setPremiumFilter(v as PremiumFilter)}
              >
                <SelectTrigger className="h-9 w-[140px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Contacté
              </label>
              <Select
                value={contactFilter}
                onValueChange={(v) => setContactFilter(v as ContactFilter)}
              >
                <SelectTrigger className="h-9 w-[150px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="contacted">Contactés</SelectItem>
                  <SelectItem value="not_contacted">Non contactés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Churn
              </label>
              <Select
                value={churnFilter}
                onValueChange={(v) => setChurnFilter(v as ChurnFilter)}
              >
                <SelectTrigger className="h-9 w-[150px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="churned">Churned (ex-premium/essai)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Activité
              </label>
              <Select
                value={activityFilter}
                onValueChange={(v) => setActivityFilter(v as ActivityFilter)}
              >
                <SelectTrigger className="h-9 w-[160px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="inactive">Inactifs +1 mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5">
                <X className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={users}
          pageCount={pageCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          isLoading={isLoading}
          onReload={handleReload}
          onExport={handleExport}
          onRowClick={(user) => router.push(`/users/${user.id}`)}
          emptyMessage="No users found. Click Reload to fetch data."
        />
      </div>

      <UserChatsDrawer
        open={chatDrawerOpen}
        onClose={handleCloseChats}
        userId={chatDrawerUser?.id || ""}
        userEmail={chatDrawerUser?.email || ""}
      />

      <ContactDialog
        // Remount per user so form state never leaks from one row to another.
        key={contactDialogUser?.id || "none"}
        open={Boolean(contactDialogUser)}
        onOpenChange={(open) => !open && setContactDialogUser(null)}
        userId={contactDialogUser?.id || ""}
        userLabel={contactDialogUser?.email || ""}
      />
    </div>
  )
}
