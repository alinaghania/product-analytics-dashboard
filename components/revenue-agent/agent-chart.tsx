"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipProps } from "recharts"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { ISO_DATE_REGEX, tooltipContainerStyle, tooltipLabelStyle, tooltipValueStyle } from "@/components/charts/chart-utils"
import type { ChartSpec } from "@/lib/revenue-agent/chart-spec"

// Fixed categorical order, validated on the dark card surface (#141e33) with
// the dataviz validator: pink first (Endora), then blue, green, amber. The
// legend is always shown for ≥ 2 series, so identity never relies on color alone.
const SERIES_COLORS = ["#ec4899", "#3b82f6", "#059669", "#d97706"]
const ANNOTATION_COLOR = "#9AA4BF"

function formatValue(value: number | null, unit: ChartSpec["unit"]): string {
  if (value === null || value === undefined) return "—"
  const n = value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  if (unit === "EUR") return `${n} €`
  if (unit === "USD") return `${n} $`
  if (unit === "percent") return `${n} %`
  return n
}

const MONTH_REGEX = /^\d{4}-\d{2}$/
const formatX = (x: string) =>
  ISO_DATE_REGEX.test(x)
    ? format(parseISO(x), "d MMM", { locale: fr })
    : MONTH_REGEX.test(x)
      ? format(parseISO(`${x}-01`), "MMM yy", { locale: fr })
      : x

// Events rarely fall exactly on a plotted point (weekly/monthly series): snap
// each annotation to the last x label on or before its date.
function snapToAxis(date: string, xs: string[]): string | null {
  if (xs.includes(date)) return date
  if (!ISO_DATE_REGEX.test(date) || !xs.every((x) => ISO_DATE_REGEX.test(x))) return null
  const before = xs.filter((x) => x <= date)
  return before.length ? before[before.length - 1] : null
}

/** Drops leading points where every series is empty or zero (pre-launch months). */
function trimLeadingEmpty(spec: ChartSpec): ChartSpec {
  const first = spec.x.findIndex((_, i) => spec.series.some((s) => (s.values[i] ?? 0) !== 0))
  if (first <= 0) return spec
  return { ...spec, x: spec.x.slice(first), series: spec.series.map((s) => ({ ...s, values: s.values.slice(first) })) }
}

export function AgentChart({ spec: rawSpec }: { spec: ChartSpec }) {
  const spec = trimLeadingEmpty(rawSpec)
  const data = spec.x.map((x, i) => {
    const row: Record<string, string | number | null> = { x }
    spec.series.forEach((s) => (row[s.name] = s.values[i]))
    return row
  })
  const annotations = spec.annotations
    .map((a) => ({ ...a, x: snapToAxis(a.x, spec.x) }))
    .filter((a): a is { x: string; label: string } => a.x !== null)
    // Labels in the right third grow leftwards so they aren't clipped.
    .map((a) => ({ ...a, rightSide: spec.x.indexOf(a.x) > (spec.x.length * 2) / 3 }))
  const multi = spec.series.length > 1

  const tooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null
    return (
      <div style={tooltipContainerStyle}>
        <p style={tooltipLabelStyle}>{formatX(String(label))}</p>
        {payload.map((entry) => (
          <p key={entry.name} style={tooltipValueStyle}>
            {multi && <span style={{ color: entry.color, marginRight: 6 }}>●</span>}
            {multi ? `${entry.name} : ` : ""}
            {formatValue(entry.value ?? null, spec.unit)}
          </p>
        ))}
      </div>
    )
  }

  // Recharts 2 ignores children wrapped in a Fragment: pass a flat keyed array.
  const axes = [
    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />,
    <XAxis key="x" dataKey="x" tickFormatter={formatX} tick={{ fill: "#9AA4BF", fontSize: 11 }} axisLine={false} tickLine={false} />,
    <YAxis
      key="y"
      tickFormatter={(v) => formatValue(v, spec.unit)}
      tick={{ fill: "#9AA4BF", fontSize: 11 }}
      axisLine={false}
      tickLine={false}
      width={64}
    />,
    <Tooltip key="tooltip" content={tooltip} cursor={{ stroke: "#1F2A44", fill: "#1F2A4466" }} />,
    ...(multi ? [<Legend key="legend" wrapperStyle={{ fontSize: 12, color: "#9AA4BF" }} />] : []),
    ...annotations.map((a, i) => (
      <ReferenceLine
        key={`ann-${a.x}-${i}`}
        x={a.x}
        stroke={ANNOTATION_COLOR}
        strokeDasharray="4 4"
        label={{ value: a.label, position: a.rightSide ? "insideTopRight" : "insideTopLeft", fill: ANNOTATION_COLOR, fontSize: 10, dy: i % 2 ? 14 : 0 }}
      />
    )),
  ]

  return (
    <figure className="space-y-2 rounded-lg border bg-muted/10 p-4">
      <figcaption className="text-sm font-medium text-foreground">{spec.title}</figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "bar" ? (
            <BarChart data={data} barGap={2} barCategoryGap="20%">
              {axes}
              {spec.series.map((s, i) => (
                <Bar key={s.name} dataKey={s.name} fill={SERIES_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data}>
              {axes}
              {spec.series.map((s, i) => (
                <Line
                  key={s.name}
                  dataKey={s.name}
                  stroke={SERIES_COLORS[i]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: SERIES_COLORS[i] }}
                  activeDot={{ r: 5, stroke: "#141e33", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">Source : {spec.source}</p>
    </figure>
  )
}
