"use client"

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface AreaChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
  gradient?: boolean
}

export function AreaChart({ data, xKey, yKey, color = "#3B82F6", gradient = true }: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsAreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#6B7694", fontSize: 11 }}
          axisLine={{ stroke: "#1F2A44" }}
          tickLine={false}
        />
        <YAxis tick={{ fill: "#6B7694", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#141E33",
            border: "1px solid #1F2A44",
            borderRadius: "8px",
            color: "#FFFFFF",
          }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fill={gradient ? `url(#gradient-${yKey})` : color}
          fillOpacity={gradient ? 1 : 0.2}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
