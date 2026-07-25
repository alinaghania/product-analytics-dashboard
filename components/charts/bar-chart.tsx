"use client"

import { useCallback, useMemo } from "react"
import { format, parse } from "date-fns"
import { useIsMobile } from "@/hooks/use-mobile"
import { ChartLegend } from "./chart-legend"
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
  Legend,
} from "recharts"

interface StackConfig {
  key: string
  color: string
  label: string
}

interface BarChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
  colors?: string[]
  layout?: "horizontal" | "vertical"
  showLabels?: boolean
  maxBars?: number
  stacks?: StackConfig[]
  /** Data key for a second, grouped "target/goal" bar drawn next to `yKey`. */
  compareKey?: string
  /** Fill color of the comparison bar. */
  compareColor?: string
  /** Legend label for the main `yKey` bar (shown only when comparing). */
  mainLabel?: string
  /** Legend label for the `compareKey` bar. */
  compareLabel?: string
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
  extraKeys?: string[],
): Array<Record<string, unknown>> {
  if (data.length <= maxBars) return data

  const bucketSize = Math.ceil(data.length / maxBars)
  const result: Array<Record<string, unknown>> = []
  const allValueKeys = extraKeys ? [yKey, ...extraKeys] : [yKey]

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize)
    const firstX = String(bucket[0][xKey])
    const lastX = String(bucket[bucket.length - 1][xKey])
    const label = bucket.length === 1 ? formatDateLabel(firstX) : formatDateRange(firstX, lastX)

    const entry: Record<string, unknown> = { [xKey]: label }
    for (const key of allValueKeys) {
      entry[key] = bucket.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
    }
    result.push(entry)
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
  stacks,
  compareKey,
  compareColor = "#2ED47A",
  mainLabel,
  compareLabel,
}: BarChartProps) {
  const isVertical = layout === "vertical"
  const isMobile = useIsMobile()
  // On phones, forcing every X tick makes date labels collide — let Recharts keep the endpoints.
  const tickInterval: number | "preserveStartEnd" = isMobile ? "preserveStartEnd" : 0

  const chartData = useMemo(() => {
    // The zero-value filter is a feature of the simple vertical bar list only —
    // grouped compare charts must keep rows where the main value is 0 but the
    // goal isn't (e.g. an upcoming month with a target but no signups yet).
    const filtered = isVertical && !compareKey
      ? data.filter((item) => {
          const value = item[yKey]
          return typeof value === "number" && value > 0
        })
      : data

    if (maxBars && !isVertical && filtered.length > maxBars) {
      const extraKeys = stacks?.map((s) => s.key).filter((k) => k !== yKey)
      return aggregateBars(filtered, xKey, yKey, maxBars, extraKeys)
    }

    return filtered
  }, [data, xKey, yKey, isVertical, maxBars, stacks, compareKey])

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

  if (isVertical && !compareKey) {
    if (chartData.length === 0) return null

    const maxValue = Math.max(...chartData.map((d) => Number(d[yKey]) || 0))
    const barColor = color || colors[0]

    return (
      <div className="space-y-2 py-2">
        {chartData.map((item, index) => {
          const name = String(item[xKey] ?? "")
          const value = Number(item[yKey]) || 0
          const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0

          return (
            <div key={`${name}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate mr-2" title={name}>{name}</span>
                <span className="font-medium text-foreground shrink-0">{value.toLocaleString()}</span>
              </div>
              <div className="h-5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderStackedTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload?: Record<string, unknown> }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const displayLabel = resolveTooltipLabel(payload, xKey, label)
    return (
      <div style={tooltipContainerStyle}>
        <p style={tooltipLabelStyle}>{displayLabel}</p>
        {payload.map((entry, i) => {
          const stackLabel = stacks?.find((s) => s.key === entry.name)?.label || entry.name
          return (
            <p key={i} style={{ ...tooltipValueStyle, color: entry.color }}>
              {stackLabel}: {entry.value}
            </p>
          )
        })}
      </div>
    )
  }, [xKey, stacks])

  const renderCompareTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload?: Record<string, unknown> }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const displayLabel = resolveTooltipLabel(payload, xKey, label)
    return (
      <div style={tooltipContainerStyle}>
        <p style={tooltipLabelStyle}>{displayLabel}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ ...tooltipValueStyle, color: entry.color }}>
            {entry.name}: {entry.value?.toLocaleString?.() ?? entry.value}
          </p>
        ))}
      </div>
    )
  }, [xKey])

  if (compareKey) {
    // layout="vertical" makes the bars extend horizontally (category on Y).
    const horizontal = isVertical
    const barRadius: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
    const labelPos = horizontal ? "right" : "top"
    const height = horizontal ? Math.max(220, chartData.length * 52) : 200
    const categoryFormatter = isAggregated
      ? undefined
      : (v: string) => (ISO_DATE_REGEX.test(v) ? formatDateLabel(v) : v)

    return (
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={chartData}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={horizontal ? { top: 8, right: 36, left: 8, bottom: 8 } : { top: 20, right: 5, left: -20, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <XAxis type="number" tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          ) : (
            <XAxis
              dataKey={xKey}
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={{ stroke: "#1F2A44" }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={tickInterval}
              tickFormatter={categoryFormatter}
            />
          )}
          {horizontal ? (
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={{ stroke: "#1F2A44" }}
              tickLine={false}
              width={72}
              interval={0}
              tickFormatter={categoryFormatter}
            />
          ) : (
            <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          )}
          <Tooltip content={renderCompareTooltip} cursor={false} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#9AA4BF" }} />
          <Bar dataKey={yKey} name={mainLabel ?? yKey} fill={color || colors[0]} radius={barRadius}>
            {showLabels && (
              <LabelList
                dataKey={yKey}
                position={labelPos}
                style={{ fill: "#9AA4BF", fontSize: 11, fontWeight: 500 }}
                formatter={(value: number) => (value > 0 ? value.toLocaleString() : "")}
              />
            )}
          </Bar>
          <Bar dataKey={compareKey} name={compareLabel ?? compareKey} fill={compareColor} fillOpacity={0.45} radius={barRadius}>
            {showLabels && (
              <LabelList
                dataKey={compareKey}
                position={labelPos}
                style={{ fill: "#6B7694", fontSize: 11, fontWeight: 500 }}
                formatter={(value: number) => (value > 0 ? value.toLocaleString() : "")}
              />
            )}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    )
  }

  if (stacks) {
    // Legend rendered as HTML chips below the chart (an in-chart legend with many
    // wrapped rows would eat into the plot area) — same display on all screen sizes.
    return (
      <>
        <ResponsiveContainer width="100%" height={240}>
          <RechartsBarChart
            data={chartData}
            margin={{ top: 20, right: 5, left: -20, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" horizontal vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fill: "#6B7694", fontSize: 11 }}
              axisLine={{ stroke: "#1F2A44" }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={tickInterval}
              tickFormatter={isAggregated ? undefined : (v: string) => (ISO_DATE_REGEX.test(v) ? formatDateLabel(v) : v)}
            />
            <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={renderStackedTooltip} cursor={false} />
            {stacks.map((stack, i) => (
              <Bar
                key={stack.key}
                dataKey={stack.key}
                stackId="a"
                fill={stack.color}
                radius={i === stacks.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              >
                {showLabels && i === stacks.length - 1 && (
                  <LabelList
                    dataKey={yKey}
                    position="top"
                    style={{ fill: "#9AA4BF", fontSize: 11, fontWeight: 500 }}
                    formatter={(value: number) => (value > 0 ? value : "")}
                  />
                )}
              </Bar>
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
        <ChartLegend items={stacks.map((s) => ({ label: s.label, color: s.color }))} />
      </>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart
        data={chartData}
        layout={layout}
        margin={{ top: 20, right: 5, left: -20, bottom: 40 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" horizontal vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#6B7694", fontSize: 11 }}
          axisLine={{ stroke: "#1F2A44" }}
          tickLine={false}
          angle={-45}
          textAnchor="end"
          height={60}
          interval={tickInterval}
          tickFormatter={isAggregated ? undefined : (v: string) => (ISO_DATE_REGEX.test(v) ? formatDateLabel(v) : v)}
        />
        <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={renderTooltip} cursor={false} />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={color || colors[index % colors.length]} />
          ))}
          {showLabels && (
            <LabelList
              dataKey={yKey}
              position="top"
              style={{ fill: "#9AA4BF", fontSize: 11, fontWeight: 500 }}
              formatter={(value: number) => (value > 0 ? value : "")}
            />
          )}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
