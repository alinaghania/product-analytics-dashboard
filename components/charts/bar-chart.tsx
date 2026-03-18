"use client"

import { useCallback, useMemo } from "react"
import { format, parse } from "date-fns"
import { ISO_DATE_REGEX, REF_DATE, formatDateLabel, resolveTooltipLabel, tooltipContainerStyle, tooltipLabelStyle, tooltipValueStyle } from "./chart-utils"
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts"

interface BarChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
  colors?: string[]
  layout?: "horizontal" | "vertical"
  showLabels?: boolean
  maxBars?: number
}

const defaultColors = ["#3B82F6", "#2ED47A", "#22D3EE", "#FFB020", "#FF5C5C"]

function formatDateRange(startStr: string, endStr: string): string {
  try {
    const start = parse(startStr, "yyyy-MM-dd", REF_DATE)
    const end = parse(endStr, "yyyy-MM-dd", REF_DATE)
    return `${format(start, "MMM d")}-${format(end, "d")}`
  } catch {
    return `${startStr} - ${endStr}`
  }
}

function aggregateBars(
  data: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  maxBars: number,
): Array<Record<string, unknown>> {
  if (data.length <= maxBars) return data

  const bucketSize = Math.ceil(data.length / maxBars)
  const result: Array<Record<string, unknown>> = []

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize)
    const sum = bucket.reduce((acc, item) => acc + (Number(item[yKey]) || 0), 0)
    const firstX = String(bucket[0][xKey])
    const lastX = String(bucket[bucket.length - 1][xKey])
    const label = bucket.length === 1 ? formatDateLabel(firstX) : formatDateRange(firstX, lastX)

    result.push({ [xKey]: label, [yKey]: sum })
  }

  return result
}

export function BarChart({
  data,
  xKey,
  yKey,
  color,
  colors = defaultColors,
  layout = "horizontal",
  showLabels = true,
  maxBars,
}: BarChartProps) {
  const isVertical = layout === "vertical"

  const chartData = useMemo(() => {
    const filtered = isVertical
      ? data.filter((item) => {
          const value = item[yKey]
          return typeof value === "number" && value > 0
        })
      : data

    if (maxBars && !isVertical && filtered.length > maxBars) {
      return aggregateBars(filtered, xKey, yKey, maxBars)
    }

    return filtered
  }, [data, xKey, yKey, isVertical, maxBars])

  const isAggregated = !!(maxBars && !isVertical && data.length > maxBars)

  const renderTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload?: Record<string, unknown> }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const displayLabel = resolveTooltipLabel(payload, xKey, label)
    return (
      <div style={tooltipContainerStyle}>
        <p style={tooltipLabelStyle}>{displayLabel}</p>
        <p style={tooltipValueStyle}>{payload[0].value}</p>
      </div>
    )
  }, [xKey])

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart
        data={chartData}
        layout={layout}
        margin={{ top: 20, right: 5, left: isVertical ? 60 : -20, bottom: isVertical ? 5 : 40 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" horizontal={!isVertical} vertical={isVertical} />
        {isVertical ? (
          <>
            <XAxis
              type="number"
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={{ stroke: "#1F2A44" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={{ stroke: "#1F2A44" }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
              tickFormatter={isAggregated ? undefined : (v: string) => (ISO_DATE_REGEX.test(v) ? formatDateLabel(v) : v)}
            />
            <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} />
          </>
        )}
        <Tooltip content={renderTooltip} />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={color || colors[index % colors.length]} />
          ))}
          {showLabels && (
            <LabelList
              dataKey={yKey}
              position={isVertical ? "right" : "top"}
              style={{ fill: "#9AA4BF", fontSize: 11, fontWeight: 500 }}
              formatter={(value: number) => (value > 0 ? value : "")}
            />
          )}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
