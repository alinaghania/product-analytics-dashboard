"use client"

import { Button } from "@/components/ui/button"
import { RefreshCcw } from "lucide-react"
import { cn } from "@/lib/utils"

interface ReloadButtonProps {
  onClick: () => void
  isLoading?: boolean
  label?: string
  size?: "sm" | "default" | "lg"
}

export function ReloadButton({ onClick, isLoading, label = "Reload", size = "sm" }: ReloadButtonProps) {
  const handleClick = () => {
    console.log("[v0] 🔘 ReloadButton clicked:", label)
    onClick()
  }

  return (
    <Button variant="outline" size={size} onClick={handleClick} disabled={isLoading} className="gap-2 bg-transparent">
      <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      {label}
    </Button>
  )
}
