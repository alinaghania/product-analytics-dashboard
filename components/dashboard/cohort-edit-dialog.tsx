"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CohortDefinition } from "@/lib/types"
import { getDaysDiff } from "@/lib/date-utils"
import { getCohortColor } from "@/lib/cohort-utils"

interface CohortEditDialogProps {
  cohort: CohortDefinition | null
  open: boolean
  onClose: () => void
  onSave: (cohort: CohortDefinition) => void
  cohortIndex?: number
}

const AVAILABLE_COLORS = [
  { value: "#2ED47A", label: "Green" },
  { value: "#7C3AED", label: "Purple" },
  { value: "#F59E0B", label: "Orange" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#EC4899", label: "Pink" },
  { value: "#10B981", label: "Emerald" },
]

export function CohortEditDialog({ cohort, open, onClose, onSave, cohortIndex = 0 }: CohortEditDialogProps) {
  const [label, setLabel] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [color, setColor] = useState(getCohortColor(cohortIndex))
  const [error, setError] = useState<string | null>(null)

  // Reset form when cohort changes
  useEffect(() => {
    if (cohort) {
      setLabel(cohort.label)
      setStartDate(cohort.startDate)
      setEndDate(cohort.endDate)
      setColor(cohort.color)
      setError(null)
    }
  }, [cohort])

  const handleSave = () => {
    setError(null)

    // Validation
    if (!label.trim()) {
      setError("Label is required")
      return
    }

    if (!startDate || !endDate) {
      setError("Both start and end dates are required")
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
      setError("End date must be after start date")
      return
    }

    const durationDays = getDaysDiff(startDate, endDate)
    if (durationDays > 30) {
      setError("Cohort period cannot exceed 30 days (retention analysis limit)")
      return
    }

    // Save cohort
    onSave({
      id: cohort?.id || `cohort-${Date.now()}`,
      label: label.trim(),
      startDate,
      endDate,
      color,
    })

    onClose()
  }

  const handleCancel = () => {
    setError(null)
    onClose()
  }

  if (!cohort) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Cohort</DialogTitle>
          <DialogDescription>
            Modify the cohort period and label. Maximum 30-day period allowed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Jan 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {startDate && endDate && (
            <div className="text-xs text-muted-foreground">
              Duration: {getDaysDiff(startDate, endDate)} days
              {getDaysDiff(startDate, endDate) > 30 && (
                <span className="text-destructive ml-2">⚠ Exceeds 30-day limit</span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {AVAILABLE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    color === c.value ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
