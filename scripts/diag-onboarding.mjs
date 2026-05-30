// Read-only diagnostic: surveys registrationData across all users to confirm
// which onboarding fields (V4 vs legacy) are actually populated, and the value
// distributions for the key intent fields.
//   Aggregate (all users): node scripts/diag-onboarding.mjs
//   Single user:           node scripts/diag-onboarding.mjs <userId>
import dotenv from "dotenv"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env") })
const sa = JSON.parse(fs.readFileSync(path.resolve(root, process.env.SERVICE_ACCOUNT_PATH), "utf-8"))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

// Single-user mode: pass a userId to inspect one user's registration /
// onboarding / symptom fields. With no argument, fall through to the
// all-users aggregate survey below.
const USER_ID = process.argv[2]
if (USER_ID) {
  const doc = await db.collection("users").doc(USER_ID).get()
  if (!doc.exists) {
    console.error(`User ${USER_ID} not found.`)
    process.exit(1)
  }
  const d = doc.data()
  console.log(`User: ${USER_ID}`)
  console.log("registrationData keys:", Object.keys(d.registrationData || {}))
  console.log("mainSymptoms:", JSON.stringify(d.registrationData?.mainSymptoms))
  console.log("symptoms:", JSON.stringify(d.registrationData?.symptoms))
  console.log("registrationCompleted:", d.flags?.registrationCompleted ?? d.registrationCompleted)
  console.log("onboardingCompleted:", d.flags?.onboardingCompleted ?? d.onboardingCompleted)
  console.log("onboardingCompletedAt:", d.onboardingCompletedAt?.toDate?.()?.toISOString())
  console.log("metadata.lastLoginAt:", d.metadata?.lastLoginAt?.toDate?.()?.toISOString())
  process.exit(0)
}

const snap = await db.collection("users").select("registrationData").get()
const total = snap.size
let withReg = 0

const keyPresence = {} // registrationData key -> count of docs where present & non-empty
const valueDist = {} // field -> { value -> count } for the key intent fields
const TRACK = [
  "primaryObjective",
  "situationsConcerned",
  "appExpectationsV2",
  "healthGoals",
  "appExpectations",
  "trackingPriorities",
  "reminderPreferences",
  "cycleTrackingGoals",
  "endometriosisTypes",
  "endoTypes",
  "medicalConditions",
  "healthConditions",
  "symptoms",
  "mainSymptoms",
  "lifeStage",
  "hasEndometriosis",
]

function bump(obj, k) {
  obj[k] = (obj[k] || 0) + 1
}

for (const doc of snap.docs) {
  const reg = doc.data().registrationData
  if (!reg || typeof reg !== "object") continue
  withReg++
  for (const [k, v] of Object.entries(reg)) {
    const empty = v == null || (Array.isArray(v) && v.length === 0) || v === ""
    if (!empty) bump(keyPresence, k)
  }
  for (const f of TRACK) {
    const v = reg[f]
    if (v == null) continue
    valueDist[f] ??= {}
    if (Array.isArray(v)) v.forEach((x) => bump(valueDist[f], String(x)))
    else bump(valueDist[f], String(v))
  }
}

console.log(`\n=== Users: ${total} | with registrationData: ${withReg} ===\n`)

console.log("--- registrationData key presence (non-empty), sorted ---")
Object.entries(keyPresence)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, c]) => console.log(`  ${String(c).padStart(5)}  ${k}`))

console.log("\n--- value distributions for tracked intent fields ---")
for (const f of TRACK) {
  const dist = valueDist[f]
  if (!dist) {
    console.log(`\n[${f}] — not present`)
    continue
  }
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
  console.log(`\n[${f}] (${entries.length} distinct values)`)
  entries.slice(0, 25).forEach(([v, c]) => console.log(`  ${String(c).padStart(5)}  ${v}`))
}

process.exit(0)
