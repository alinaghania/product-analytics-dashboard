"use client"

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface LineChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  lines: Array<{
    key: string
    color: string
    label?: string
  }>
  showLegend?: boolean
}

export function LineChart({ data, xKey, lines, showLegend = false }: LineChartProps) {
  const chartData = data || []
  // Auto-enable legend for multi-line charts
  const shouldShowLegend = showLegend || lines.length > 1

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsLineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#6B7694", fontSize: 11 }}
          axisLine={{ stroke: "#1F2A44" }}
          tickLine={false}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fill: "#6B7694", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          label={lines.length > 1 ? { value: "Retention %", angle: -90, position: "insideLeft", style: { fill: "#6B7694", fontSize: 11 } } : undefined}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#141E33",
            border: "1px solid #1F2A44",
            borderRadius: "8px",
            color: "#FFFFFF",
          }}
        />
        {shouldShowLegend && (
          <Legend
            wrapperStyle={{ paddingTop: "10px" }}
            iconType="line"
            iconSize={20}
            formatter={(value) => (
              <span style={{ color: "#9AA4BF", fontSize: "12px", marginLeft: "4px" }}>{value}</span>
            )}
          />
        )}
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label || line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: line.color }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
