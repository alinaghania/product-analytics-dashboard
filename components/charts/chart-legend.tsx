interface ChartLegendProps {
  items: Array<{ label: string; color: string }>
}

/** Compact HTML legend rendered below a chart, so it never eats into the plot area. */
export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-2">
      {items.map((item, index) => (
        // Index-composite key: labels come from arbitrary data and may collide; the list is static.
        <span key={`${index}-${item.label}`} className="flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
