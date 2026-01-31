"use client"

interface FunnelChartProps {
  data: Array<{ name: string; value: number; color?: string }>
}

const defaultColors = ["#3B82F6", "#2ED47A", "#22D3EE", "#FFB020", "#FF5C5C"]

export function FunnelChart({ data }: FunnelChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value))

  return (
    <div className="space-y-2 py-2">
      {data.map((item, index) => {
        const percentage = (item.value / maxValue) * 100
        const conversionRate = index > 0 ? ((item.value / data[index - 1].value) * 100).toFixed(1) : null
        const color = item.color || defaultColors[index % defaultColors.length]

        return (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{item.value.toLocaleString()}</span>
                {conversionRate && <span className="text-muted-foreground">({conversionRate}%)</span>}
              </div>
            </div>
            <div className="h-6 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
