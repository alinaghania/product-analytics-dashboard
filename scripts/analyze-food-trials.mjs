import dotenv from "dotenv"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ─── Setup ───

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")

dotenv.config({ path: path.join(projectRoot, ".env") })

const serviceAccountPath = path.resolve(projectRoot, process.env.SERVICE_ACCOUNT_PATH)
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"))
const app = initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore(app)

const PAGE_SIZE = 500

// ─── Helpers ───

function toISOString(val) {
  if (!val) return null
  if (typeof val.toDate === "function") return val.toDate().toISOString()
  if (val instanceof Date) return val.toISOString()
  if (typeof val === "string") return val
  return null
}

function toDayKey(isoString) {
  if (!isoString) return null
  return isoString.slice(0, 10)
}

// ─── Fetch all users (paginated) ───

async function fetchAllUserIds() {
  const ids = []
  let lastDoc = null

  while (true) {
    let query = db.collection("users").select().orderBy("__name__").limit(PAGE_SIZE)
    if (lastDoc) query = query.startAfter(lastDoc)

    const snapshot = await query.get()
    if (snapshot.empty) break

    ids.push(...snapshot.docs.map((doc) => doc.id))
    console.log(`  Users discovered: ${ids.length}`)

    lastDoc = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.docs.length < PAGE_SIZE) break
  }

  return ids
}

// ─── Fetch foodTrials for one user ───

async function fetchFoodTrials(userId) {
  const snapshot = await db.collection("users").doc(userId).collection("foodTrials").get()
  if (snapshot.empty) return []

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

// ─── Main ───

async function main() {
  console.log("🔍 Analyzing foodTrials usage...\n")

  // 1. Fetch all user IDs
  console.log("Fetching user IDs...")
  const userIds = await fetchAllUserIds()
  console.log(`Total users: ${userIds.length}\n`)

  // 2. Fetch foodTrials per user
  console.log("Fetching foodTrials subcollections...")
  const usersWithTrials = []
  const allTrials = []
  let processed = 0

  for (const userId of userIds) {
    const trials = await fetchFoodTrials(userId)
    if (trials.length > 0) {
      usersWithTrials.push({ userId, trials })
      allTrials.push(...trials.map((t) => ({ ...t, userId })))
    }
    processed++
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${userIds.length} users — ${usersWithTrials.length} with foodTrials`)
    }
  }

  console.log(`\nDone fetching. ${usersWithTrials.length} users have foodTrials (${allTrials.length} total trials)\n`)

  // 3. Analyze

  // --- Field discovery (print all unique keys across all docs) ---
  const fieldCounts = {}
  for (const trial of allTrials) {
    for (const key of Object.keys(trial)) {
      fieldCounts[key] = (fieldCounts[key] || 0) + 1
    }
  }

  // --- Distribution: trials per user ---
  const trialsPerUser = usersWithTrials.map((u) => u.trials.length)
  trialsPerUser.sort((a, b) => a - b)
  const avgTrials = trialsPerUser.length > 0 ? trialsPerUser.reduce((s, v) => s + v, 0) / trialsPerUser.length : 0
  const medianTrials = trialsPerUser.length > 0 ? trialsPerUser[Math.floor(trialsPerUser.length / 2)] : 0
  const maxTrials = trialsPerUser.length > 0 ? trialsPerUser[trialsPerUser.length - 1] : 0

  const trialsDistribution = {}
  for (const count of trialsPerUser) {
    const bucket = count >= 10 ? "10+" : String(count)
    trialsDistribution[bucket] = (trialsDistribution[bucket] || 0) + 1
  }

  // --- Status distribution ---
  const statusDistribution = {}
  for (const trial of allTrials) {
    const status = trial.status || "unknown"
    statusDistribution[status] = (statusDistribution[status] || 0) + 1
  }

  // --- Food name frequency (top 30) ---
  const foodNames = {}
  for (const trial of allTrials) {
    const name = (trial.foodName || trial.name || trial.food || trial.label || "unknown").toString().toLowerCase().trim()
    foodNames[name] = (foodNames[name] || 0) + 1
  }
  const topFoods = Object.entries(foodNames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }))

  // --- Category distribution ---
  const categories = {}
  for (const trial of allTrials) {
    const cat = (trial.category || trial.type || "unknown").toString().toLowerCase().trim()
    categories[cat] = (categories[cat] || 0) + 1
  }
  const categoryDistribution = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }))

  // --- Result/outcome distribution ---
  const outcomes = {}
  for (const trial of allTrials) {
    const outcome = (trial.result || trial.outcome || trial.conclusion || "unknown").toString().toLowerCase().trim()
    outcomes[outcome] = (outcomes[outcome] || 0) + 1
  }
  const outcomeDistribution = Object.entries(outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([outcome, count]) => ({ outcome, count }))

  // --- Timeline: creation by day ---
  const creationByDay = {}
  for (const trial of allTrials) {
    const day = toDayKey(toISOString(trial.createdAt || trial.startedAt || trial.timestamp))
    if (day) {
      creationByDay[day] = (creationByDay[day] || 0) + 1
    }
  }
  const dailyCreation = Object.entries(creationByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))

  // --- Timeline: creation by week ---
  const creationByWeek = {}
  for (const trial of allTrials) {
    const iso = toISOString(trial.createdAt || trial.startedAt || trial.timestamp)
    if (iso) {
      const d = new Date(iso)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay() + 1) // Monday
      const weekKey = weekStart.toISOString().slice(0, 10)
      creationByWeek[weekKey] = (creationByWeek[weekKey] || 0) + 1
    }
  }
  const weeklyCreation = Object.entries(creationByWeek)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, count]) => ({ weekOf, count }))

  // --- Duration analysis (if trials have start/end dates) ---
  const durations = []
  for (const trial of allTrials) {
    const start = toISOString(trial.startedAt || trial.startDate || trial.createdAt)
    const end = toISOString(trial.endedAt || trial.endDate || trial.completedAt)
    if (start && end) {
      const durationDays = Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24))
      if (durationDays >= 0) durations.push(durationDays)
    }
  }
  durations.sort((a, b) => a - b)

  const durationStats =
    durations.length > 0
      ? {
          count: durations.length,
          avgDays: Math.round((durations.reduce((s, v) => s + v, 0) / durations.length) * 10) / 10,
          medianDays: durations[Math.floor(durations.length / 2)],
          minDays: durations[0],
          maxDays: durations[durations.length - 1],
          p25Days: durations[Math.floor(durations.length * 0.25)],
          p75Days: durations[Math.floor(durations.length * 0.75)],
        }
      : null

  // --- Sample documents (first 3, for schema discovery) ---
  const sampleDocs = allTrials.slice(0, 3).map((trial) => {
    const cleaned = {}
    for (const [key, value] of Object.entries(trial)) {
      if (typeof value?.toDate === "function") {
        cleaned[key] = value.toDate().toISOString()
      } else {
        cleaned[key] = value
      }
    }
    return cleaned
  })

  // --- Top users by trial count ---
  const topUsers = usersWithTrials
    .map((u) => ({ userId: u.userId, trialCount: u.trials.length }))
    .sort((a, b) => b.trialCount - a.trialCount)
    .slice(0, 20)

  // 4. Build report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalUsers: userIds.length,
      usersWithFoodTrials: usersWithTrials.length,
      adoptionRate: `${((usersWithTrials.length / userIds.length) * 100).toFixed(1)}%`,
      totalFoodTrials: allTrials.length,
      avgTrialsPerUser: Math.round(avgTrials * 10) / 10,
      medianTrialsPerUser: medianTrials,
      maxTrialsPerUser: maxTrials,
    },
    trialsPerUserDistribution: trialsDistribution,
    statusDistribution,
    categoryDistribution,
    outcomeDistribution,
    topFoods,
    durationStats,
    dailyCreation,
    weeklyCreation,
    topUsers,
    fieldSchema: fieldCounts,
    sampleDocuments: sampleDocs,
  }

  // 5. Write output
  const exportsDir = path.join(projectRoot, "exports")
  fs.mkdirSync(exportsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filepath = path.join(exportsDir, `food-trials-analysis-${timestamp}.json`)
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8")

  // 6. Print summary to console
  console.log("═══════════════════════════════════════")
  console.log("        FOOD TRIALS ANALYSIS")
  console.log("═══════════════════════════════════════")
  console.log(`Total users:            ${report.summary.totalUsers}`)
  console.log(`Users with foodTrials:  ${report.summary.usersWithFoodTrials}`)
  console.log(`Adoption rate:          ${report.summary.adoptionRate}`)
  console.log(`Total food trials:      ${report.summary.totalFoodTrials}`)
  console.log(`Avg per user:           ${report.summary.avgTrialsPerUser}`)
  console.log(`Median per user:        ${report.summary.medianTrialsPerUser}`)
  console.log(`Max per user:           ${report.summary.maxTrialsPerUser}`)
  console.log("")
  console.log("Status distribution:", JSON.stringify(statusDistribution, null, 2))
  console.log("")
  console.log("Top 10 foods:", topFoods.slice(0, 10).map((f) => `${f.name} (${f.count})`).join(", "))
  if (durationStats) {
    console.log("")
    console.log(`Duration: avg ${durationStats.avgDays}d, median ${durationStats.medianDays}d, range ${durationStats.minDays}-${durationStats.maxDays}d`)
  }
  console.log("")
  console.log(`Full report: ${filepath}`)

  process.exit(0)
}

main().catch((err) => {
  console.error("Analysis failed:", err)
  process.exit(1)
})
