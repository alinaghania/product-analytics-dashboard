"use client"

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
}

const defaultColors = ["#3B82F6", "#2ED47A", "#22D3EE", "#FFB020", "#FF5C5C"]

export function BarChart({
  data,
  xKey,
  yKey,
  color,
  colors = defaultColors,
  layout = "horizontal",
  showLabels = true,
}: BarChartProps) {
  const isVertical = layout === "vertical"

  const chartData = isVertical
    ? data.filter((item) => {
        const value = item[yKey]
        return typeof value === "number" && value > 0
      })
    : data

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
            />
            <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "#141E33",
            border: "1px solid #1F2A44",
            borderRadius: "8px",
            color: "#FFFFFF",
          }}
        />
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
