import { z } from "zod"

// Chart the agent asks the UI to draw. Every y value must come from a tool
// result of the same run (checked server-side in tools.ts) — the model never
// invents or smooths a point.
export const chartSpecSchema = z.object({
  type: z.enum(["line", "bar"]),
  title: z.string().min(1).max(80),
  unit: z.enum(["EUR", "USD", "count", "percent"]),
  /** x labels (dates YYYY-MM-DD or categories), shared by every series. */
  x: z.array(z.string()).min(1).max(120),
  series: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        values: z.array(z.number().nullable()),
      }),
    )
    .min(1)
    .max(4),
  /** Vertical markers for timeline events (release, price, paywall…). */
  annotations: z
    .array(z.object({ x: z.string(), label: z.string().max(40) }))
    .max(6)
    .default([]),
  /** Short source line shown under the chart. */
  source: z.string().max(120),
})

export type ChartSpec = z.infer<typeof chartSpecSchema>
