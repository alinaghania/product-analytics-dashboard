"use client"

import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"
import { format, subDays, parseISO } from "date-fns"
import { useState } from "react"

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

const presets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
]

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<number | null>(30)

  const handlePresetClick = (days: number) => {
    const toDate = new Date()
    const fromDate = subDays(toDate, days)
    onChange(format(fromDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd"))
    setActivePreset(days)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {presets.map((preset) => (
          <Button
            key={preset.days}
            variant={activePreset === preset.days ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handlePresetClick(preset.days)}
            className="text-xs"
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground">
          {format(parseISO(from), "MMM d")} - {format(parseISO(to), "MMM d, yyyy")}
        </span>
      </div>
    </div>
  )
}
