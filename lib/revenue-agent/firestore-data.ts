import "server-only"
import { fetchAcquisitionConversion, fetchWeeklyUsage } from "@/lib/firestore-admin-queries"
import { cachedValue } from "@/lib/server-cache"

// The agent's Firestore reads scan up to 20k users (and 60k tracking sessions
// for usage) per call, and the agent and the deep analysis often ask for the
// same periods: results are cached per period until midnight (lib/server-cache.ts).

type Period = { from: string; to: string }

export async function acquisitionConversion(period: Period) {
  return (await cachedValue("agent-acquisition", period, () => fetchAcquisitionConversion(period))).value
}

export async function weeklyUsage(period: Period) {
  return (await cachedValue("agent-usage", period, () => fetchWeeklyUsage(period))).value
}
