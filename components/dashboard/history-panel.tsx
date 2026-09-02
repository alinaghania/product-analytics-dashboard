"use client"

import type React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/date-utils"
import { History, Trash2 } from "lucide-react"

// One display row, mapped by the caller from its own domain entry.
export interface HistoryRow {
  id: string
  createdAt: Date
  createdBy: string
  primary: React.ReactNode
  secondary?: React.ReactNode
}

interface HistoryPanelProps {
  title: string
  description?: string
  rows: HistoryRow[]
  isLoading: boolean
  /** Dashboard DB not reachable — shows a setup hint instead of the list. */
  unavailable?: boolean
  emptyLabel: string
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
  /** Row currently being deleted (its trash button is disabled). */
  deletingId?: string | null
}

// Generic "recent runs" list backed by the dashboard-owned Firestore database.
// Each row replays a past run when clicked and can be removed. Shared by the
// Ask page and the campaign simulator.
export function HistoryPanel({
  title,
  description,
  rows,
  isLoading,
  unavailable,
  emptyLabel,
  onSelect,
  onDelete,
  deletingId,
}: HistoryPanelProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
          {rows.length > 0 && (
            <Badge variant="outline" className="font-normal">
              {rows.length}
            </Badge>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : unavailable ? (
          <p className="text-sm text-muted-foreground">
            Base « dashboard » indisponible — vérifier la configuration GCP (base Firestore nommée +
            droits d'écriture du service account).
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className="-mx-2 min-w-0 flex-1 space-y-0.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="truncate text-sm font-medium text-foreground">{row.primary}</div>
                  {row.secondary && (
                    <div className="text-xs text-muted-foreground">{row.secondary}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)} · {row.createdBy}
                  </div>
                </button>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === row.id}
                    onClick={() => onDelete(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Supprimer</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
