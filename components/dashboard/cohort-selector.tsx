"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Plus } from "lucide-react"
import type { CohortDefinition } from "@/lib/types"
import { format } from "date-fns"

interface CohortSelectorProps {
  cohorts: CohortDefinition[]
  onEditCohort: (cohort: CohortDefinition) => void
  onRemoveCohort: (cohortId: string) => void
  onAddCohort: () => void
  cohortMetadata?: Record<string, { cohortSize: number; error?: string }>
  maxCohorts?: number
}

export function CohortSelector({
  cohorts,
  onEditCohort,
  onRemoveCohort,
  onAddCohort,
  cohortMetadata = {},
  maxCohorts = 6,
}: CohortSelectorProps) {
  const canAddMore = cohorts.length < maxCohorts

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Cohorts to Compare</h3>
        <span className="text-xs text-muted-foreground">
          {cohorts.length} / {maxCohorts}
        </span>
      </div>

      <div className="space-y-2">
        {cohorts.map((cohort) => {
          const metadata = cohortMetadata[cohort.id]
          const hasError = metadata?.error
          const cohortSize = metadata?.cohortSize

          return (
            <div
              key={cohort.id}
              className="flex items-center justify-between rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-center gap-3 flex-1">
                {/* Color indicator */}
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cohort.color }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{cohort.label}</span>
                    {cohortSize !== undefined && !hasError && (
                      <Badge variant="secondary" className="text-xs">
                        {cohortSize} users
                      </Badge>
                    )}
                    {hasError && (
                      <Badge variant="destructive" className="text-xs">
                        Error
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(cohort.startDate), "MMM d, yyyy")} -{" "}
                    {format(new Date(cohort.endDate), "MMM d, yyyy")}
                  </div>
                  {hasError && (
                    <div className="text-xs text-destructive mt-1">{metadata.error}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEditCohort(cohort)}
                  title="Edit cohort"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onRemoveCohort(cohort.id)}
                  disabled={cohorts.length <= 1}
                  title={cohorts.length <= 1 ? "Cannot remove last cohort" : "Remove cohort"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {canAddMore && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onAddCohort}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Cohort
        </Button>
      )}

      {!canAddMore && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum of {maxCohorts} cohorts reached
        </p>
      )}
    </div>
  )
}
