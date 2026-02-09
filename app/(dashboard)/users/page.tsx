"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import type { DocumentData } from "firebase/firestore"
import { Header } from "@/components/dashboard/header"
import { DataTable } from "@/components/tables/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserChatsDrawer } from "@/components/users/UserChatsDrawer"
import { formatDateTime } from "@/lib/date-utils"
import {
  checkUserHasChats,
  fetchUsers,
  fetchLastLoginsForUsers,
  fetchLastActivitiesForUsers,
  fetchUserDailySessionTimes,
} from "@/lib/firestore-queries"
import type { User } from "@/lib/types"
import { MessageSquare, Search } from "lucide-react"

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
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpen(user)}>
      <MessageSquare className="h-4 w-4" />
      <span className="sr-only">Open chats</span>
    </Button>
  )
}

export default function UsersPage() {
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false)
  const [chatDrawerUser, setChatDrawerUser] = useState<{ id: string; email: string } | null>(null)

  // Store Firestore cursors for each page
  const [cursors, setCursors] = useState<Map<number, DocumentData | null>>(
    new Map([[0, null]]) // Page 0 starts with no cursor (fetch from beginning)
  )

  // Get cursor for current page
  const currentCursor = cursors.get(pagination.pageIndex) ?? null

  // Reset pagination when search changes
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 50 })
    setCursors(new Map([[0, null]]))
  }, [search])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["users", search, currentCursor], // Removed pageIndex, added currentCursor
    queryFn: () => fetchUsers({
      limitCount: pagination.pageSize,
      cursor: currentCursor, // Pass cursor for pagination!
      search
    }),
    enabled: true,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  })

  // Store cursor for next page when data arrives
  useEffect(() => {
    if (data?.lastDoc && data?.hasMore && !cursors.has(pagination.pageIndex + 1)) {
      setCursors(prev => {
        const newCursors = new Map(prev)
        newCursors.set(pagination.pageIndex + 1, data.lastDoc)
        return newCursors
      })
    }
  }, [data, pagination.pageIndex, cursors])

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

  const handleReload = async () => {
    // Reset cursors when manually reloading
    setCursors(new Map([[0, null]]))
    setPagination({ pageIndex: 0, pageSize: 50 })
    await refetch()
    setLastUpdated(new Date())
  }

  const handleOpenChats = (user: User) => {
    setChatDrawerUser({ id: user.id, email: user.email })
    setChatDrawerOpen(true)
  }

  const handleCloseChats = () => {
    setChatDrawerOpen(false)
    setChatDrawerUser(null)
  }

  const handleExport = () => {
    if (!data?.data) return
    const csv = [
      [
        "Email",
        "Name",
        "Created At",
        "Last Login",
        "Last Activity",
        "Platform",
        "Age",
        "Avg Daily Time",
        "Payment",
      ].join(","),
      ...data.data.map((user: User) => {
        const name = user.username || user.displayName || user.registrationData?.name || "-"
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

        return [
          user.email,
          name,
          createdAt,
          lastLoginStr,
          lastActivityStr,
          platform,
          age,
          avgDailyTimeStr,
          payment,
        ].join(",")
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
      id: "chats",
      header: "Chats",
      cell: ({ row }) => (
        <UserChatAction user={row.original} onOpen={handleOpenChats} />
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      <Header title="Users" description="Manage and analyze user data" lastUpdated={lastUpdated} />

      <div className="flex-1 space-y-6 p-6">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-9"
          />
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
          emptyMessage="No users found. Click Reload to fetch data."
        />
      </div>

      <UserChatsDrawer
        open={chatDrawerOpen}
        onClose={handleCloseChats}
        userId={chatDrawerUser?.id || ""}
        userEmail={chatDrawerUser?.email || ""}
      />
    </div>
  )
}
