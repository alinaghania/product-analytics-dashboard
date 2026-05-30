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
