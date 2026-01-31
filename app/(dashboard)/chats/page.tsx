"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Header } from "@/components/dashboard/header"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ChartCard } from "@/components/dashboard/chart-card"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { DataTable } from "@/components/tables/data-table"
import { BarChart } from "@/components/charts/bar-chart"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/date-utils"
import { fetchConversations } from "@/lib/firestore-queries"
import type { ChatConversation } from "@/lib/types"
import type { ColumnDef } from "@tanstack/react-table"
import { ExternalLink } from "lucide-react"
import { format as formatDate, subDays } from "date-fns"

export default function ChatsPage() {
  const router = useRouter()
  const [dateRange, setDateRange] = useState(() => {
    const to = new Date()
    const from = subDays(to, 14)
    return {
      from: formatDate(from, "yyyy-MM-dd"),
      to: formatDate(to, "yyyy-MM-dd"),
    }
  })
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>()
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["chats", dateRange.from, dateRange.to],
    queryFn: () => fetchConversations({ from: dateRange.from, to: dateRange.to, limitCount: 50 }),
    enabled: false, // Manual reload only
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })

  const handleReload = async () => {
    await refetch()
    setLastUpdated(new Date())
  }

  const conversations: ChatConversation[] = data?.data || []

  const totalConversations = conversations.length
  const totalMessages = conversations.reduce((sum, c) => sum + (c.messageCount || 0), 0)

  const topicCounts: Record<string, number> = {}
  const entryPointCounts: Record<string, number> = {}
  conversations.forEach((c) => {
    c.topics?.forEach((t) => {
      topicCounts[t] = (topicCounts[t] || 0) + 1
    })
    if (c.entryPoint) {
      entryPointCounts[c.entryPoint] = (entryPointCounts[c.entryPoint] || 0) + 1
    }
  })

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const topEntryPoints = Object.entries(entryPointCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const columns: ColumnDef<ChatConversation>[] = [
    {
      accessorKey: "id",
      header: "Conversation",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.id.slice(0, 12)}...</span>
          <span className="text-xs text-muted-foreground">User: {row.original.userId.slice(0, 8)}...</span>
        </div>
      ),
    },
    {
      accessorKey: "messageCount",
      header: "Messages",
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.messageCount}</span>,
    },
    {
      accessorKey: "topics",
      header: "Topics",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.topics?.slice(0, 2).map((topic) => (
            <Badge key={topic} variant="secondary" className="text-xs">
              {topic}
            </Badge>
          ))}
          {(row.original.topics?.length || 0) > 2 && (
            <Badge variant="outline" className="text-xs">
              +{(row.original.topics?.length || 0) - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "entryPoint",
      header: "Entry Point",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.entryPoint || "-"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Started",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/chats/${row.original.id}`)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          View <ExternalLink className="h-3 w-3" />
        </button>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      <Header
        title="Chat Analytics"
        description="Endora conversation performance and insights"
        lastUpdated={lastUpdated}
        onReloadAll={handleReload}
      />

      <div className="flex-1 space-y-6 p-6">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />

        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Total Conversations"
            value={totalConversations.toLocaleString()}
            isLoading={isLoading}
            onReload={handleReload}
          />
          <KpiCard label="Total Messages" value={totalMessages.toLocaleString()} isLoading={isLoading} />
          <KpiCard
            label="Avg Messages/Conv"
            value={totalConversations > 0 ? Math.round(totalMessages / totalConversations).toString() : "0"}
            isLoading={isLoading}
            variant="info"
          />
          <KpiCard
            label="Unique Topics"
            value={Object.keys(topicCounts).length.toString()}
            isLoading={isLoading}
            variant="success"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ChartCard
            title="Top Topics"
            description="Most discussed topics"
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={topTopics} xKey="name" yKey="count" layout="vertical" />
          </ChartCard>

          <ChartCard
            title="Entry Points"
            description="How users start conversations"
            isLoading={isLoading}
            onReload={handleReload}
          >
            <BarChart data={topEntryPoints} xKey="name" yKey="count" layout="vertical" />
          </ChartCard>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">Recent Conversations</h3>
          <DataTable
            columns={columns}
            data={conversations}
            pageCount={data?.hasMore ? pagination.pageIndex + 2 : pagination.pageIndex + 1}
            pagination={pagination}
            onPaginationChange={setPagination}
            isLoading={isLoading}
            onReload={handleReload}
            emptyMessage="No conversations found. Click Reload to fetch data."
          />
        </div>
      </div>
    </div>
  )
}
