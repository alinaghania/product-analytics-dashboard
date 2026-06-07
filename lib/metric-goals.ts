// Benchmark targets that turn raw KPI numbers into "value vs objective"
// scorecards on the Overview dashboard. The goal is to give the team a clear
// target to push toward, with a traffic-light color showing how close they are.
//
// Sources (see PR discussion):
// - Stickiness (DAU/MAU): >20% = "sticky", >30% = exceptional
//   (Geckoboard / Gainsight / CleverTap).
// - Retention milestones use health & wellness app benchmarks
//   (D1 ~25%, D7 ~15%, D30 ~10%) — daily-habit apps like ours.
//
// These are benchmark-based, not team-set: they apply regardless of user-base
// size, which is why DAU/WAU/MAU (size-dependent) deliberately have no target.

export type GoalStatus = "danger" | "warning" | "success"

export interface MetricGoal {
  /** The value (in the metric's own unit) the team is aiming for. */
  target: number
  /** Short objective label shown under the value, e.g. "Goal 20%". */
  label: string
}

export const GOALS = {
  stickiness: { target: 20, label: "Goal 20%" },
  retentionD1: { target: 25, label: "Goal 25%" },
  retentionD7: { target: 15, label: "Goal 15%" },
  retentionD30: { target: 10, label: "Goal 10%" },
} as const satisfies Record<string, MetricGoal>

// Team-set monthly user-acquisition targets — unlike the benchmark ratios
// above, these are absolute signup headcounts the team commits to for a given
// calendar month. Keyed by "YYYY-MM". Drives the goal bars on the "Monthly
// Signups vs Goal" chart on the Overview. Add a new entry each month.
export const MONTHLY_SIGNUP_GOALS: Record<string, number> = {
  "2026-06": 1000,
  "2026-07": 1500,
  "2026-08": 2000,
}

// Cumulative "Total Users" target for a given calendar month: the running total
// at the START of that month + the month's acquisition goal. The base advances
// automatically as the calendar moves (July picks up June's actual signups,
// August picks up July's, …) so only a new MONTHLY_SIGNUP_GOALS entry is needed
// each month. Returns null when the month has no goal set, so the card simply
// hides its goal bar.
export function totalUsersGoalForMonth(
  monthlySignups: Array<{ month: string; count: number }>,
  month: string, // "YYYY-MM"
): MetricGoal | null {
  const monthGoal = MONTHLY_SIGNUP_GOALS[month]
  if (monthGoal === undefined) return null
  const baseAtMonthStart = monthlySignups
    .filter((m) => m.month < month)
    .reduce((sum, m) => sum + m.count, 0)
  const target = baseAtMonthStart + monthGoal
  return { target, label: `Goal ${target.toLocaleString()}` }
}

// Map a value against its target to a traffic-light status:
//   >= 100% of target -> success (at/above goal)
//   >=  50% of target -> warning (approaching)
//   <   50% of target -> danger  (well below)
// The 50% cut-off lines up with the stickiness tiers (target 20% => 10% is the
// amber/red boundary, matching the "below 10% needs work" benchmark).
export function goalStatus(value: number, target: number): GoalStatus {
  if (target <= 0) return "warning"
  const ratio = value / target
  if (ratio >= 1) return "success"
  if (ratio >= 0.5) return "warning"
  return "danger"
}

// Progress toward the target as a 0-100 percentage, capped so the bar never
// overflows when the team beats the goal.
export function goalProgress(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.round((value / target) * 100), 100)
}
