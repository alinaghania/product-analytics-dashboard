"use client"

import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { useIsMobile } from "@/hooks/use-mobile"
import { ChartLegend } from "./chart-legend"

interface PieChartProps {
  data: Array<{ name: string; value?: number; count?: number }>
  nameKey?: string
  valueKey?: string
  colors?: string[]
  innerRadius?: number
  showLegend?: boolean
  showLabel?: boolean
}

const defaultColors = ["#3B82F6", "#2ED47A", "#22D3EE", "#FFB020", "#FF5C5C"]

export function PieChart({
  data,
  nameKey = "name",
  valueKey = "count",
  colors = defaultColors,
  innerRadius = 0,
  showLegend = true,
  showLabel = true,
}: PieChartProps) {
  const isMobile = useIsMobile()

  const normalizedData = data.map((item) => ({
    name: item.name,
    value: (item[valueKey as keyof typeof item] as number) || 0,
  }))

  // On mobile the in-chart legend (many wrapped rows) would overlap the pie —
  // render it below the chart instead so the pie keeps the full 200px.
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <RechartsPieChart>
          <Pie
            data={normalizedData}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={showLabel ? ({ name, value }: { name: string; value: number }) => `${name}: ${value}` : false}
          >
            {normalizedData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#141E33",
              border: "1px solid #1F2A44",
              borderRadius: "8px",
              color: "#FFFFFF",
            }}
          />
          {showLegend && !isMobile && (
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              wrapperStyle={{ fontSize: "12px" }}
              formatter={(value) => <span style={{ color: "#9AA4BF" }}>{value}</span>}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
      {showLegend && isMobile && (
        <ChartLegend items={normalizedData.map((d, i) => ({ label: d.name, color: colors[i % colors.length] }))} />
      )}
    </>
  )
}
