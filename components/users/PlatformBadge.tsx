import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Colored platform badge — blue for iOS, green for Android (tinted theme
// colors so both stay readable in light and dark), neutral otherwise.
const PLATFORM_STYLES: Record<string, { label: string; className: string }> = {
  ios: { label: "iOS", className: "border-transparent bg-chart-1/15 text-chart-1" },
  android: { label: "Android", className: "border-transparent bg-success/15 text-success" },
}

export function PlatformBadge({ platform, className }: { platform?: string; className?: string }) {
  const style = platform ? PLATFORM_STYLES[platform.toLowerCase()] : undefined
  return (
    <Badge variant="secondary" className={cn(style?.className, className)}>
      {style?.label || platform || "Unknown"}
    </Badge>
  )
}
