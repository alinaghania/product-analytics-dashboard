#!/usr/bin/env node
// Read-only drill-down on users.healthSync / registrationData.healthDataSyncEnabled
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

const stats = {
  totalUsers: 0,
  healthSyncPresent: 0,
  healthSyncEnabled: 0,
  healthSyncDisabled: 0,
  regSyncTrue: 0,
  regSyncFalse: 0,
  enabledByPlatform: new Map(),
  enabledPremium: 0,
  backfilledMetricCounts: new Map(), // metric -> count of enabled users with backfilled true
  lastUpdatedMonths: new Map(),
  enabledUserIds: new Set(),
}
let sampleEnabled = null

let last = null
while (true) {
  let q = db.collection("users").orderBy("__name__").limit(2000)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  for (const doc of snap.docs) {
    stats.totalUsers++
    const d = doc.data()
    const hs = d.healthSync
    if (hs && typeof hs === "object") {
      stats.healthSyncPresent++
      if (hs.enabled === true) {
        stats.healthSyncEnabled++
        stats.enabledUserIds.add(doc.id)
        const platform = d.metadata?.platform || "(unknown)"
        stats.enabledByPlatform.set(platform, (stats.enabledByPlatform.get(platform) || 0) + 1)
        if (d.subscriptionStatus?.isPremium === true) stats.enabledPremium++
        const bm = hs.backfilledMetrics
        if (bm && typeof bm === "object") {
          for (const [m, v] of Object.entries(bm)) {
            if (v === true) stats.backfilledMetricCounts.set(m, (stats.backfilledMetricCounts.get(m) || 0) + 1)
          }
        }
        const lu = hs.lastUpdated
        const luDate = typeof lu === "string" ? new Date(lu) : lu?.toDate?.()
        if (luDate && !isNaN(luDate)) {
          const mo = luDate.toISOString().slice(0, 7)
          stats.lastUpdatedMonths.set(mo, (stats.lastUpdatedMonths.get(mo) || 0) + 1)
        }
        if (!sampleEnabled) sampleEnabled = JSON.stringify(hs, null, 2)
      } else {
        stats.healthSyncDisabled++
      }
    }
    const rs = d.registrationData?.healthDataSyncEnabled
    if (rs === true) stats.regSyncTrue++
    if (rs === false) stats.regSyncFalse++
  }
  last = snap.docs[snap.docs.length - 1]
  if (snap.docs.length < 2000) break
}

console.log(`total users: ${stats.totalUsers}`)
console.log(`\nusers.healthSync present: ${stats.healthSyncPresent}`)
console.log(`  enabled === true : ${stats.healthSyncEnabled}`)
console.log(`  enabled !== true : ${stats.healthSyncDisabled}`)
console.log(`\nregistrationData.healthDataSyncEnabled: true=${stats.regSyncTrue}  false=${stats.regSyncFalse}`)
console.log(`\nenabled users by platform:`)
for (const [p, c] of [...stats.enabledByPlatform.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.toString().padStart(5)}  ${p}`)
console.log(`\nenabled users currently premium: ${stats.enabledPremium}`)
console.log(`\nbackfilled metrics among enabled users:`)
for (const [m, c] of [...stats.backfilledMetricCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.toString().padStart(5)}  ${m}`)
console.log(`\nhealthSync.lastUpdated by month (enabled users):`)
for (const [m, c] of [...stats.lastUpdatedMonths.entries()].sort()) console.log(`  ${m}: ${c}`)
console.log(`\nsample healthSync object:\n${sampleEnabled}`)

// health_prompt_accepted split by params.granted
const pa = await db.collection("app_events").where("name", "==", "health_prompt_accepted").get()
const grantedUsers = new Set()
const notGrantedUsers = new Set()
for (const doc of pa.docs) {
  const d = doc.data()
  if (d.params?.granted === true) grantedUsers.add(d.userId)
  else notGrantedUsers.add(d.userId)
}
console.log(`\nhealth_prompt_accepted: granted=true users: ${grantedUsers.size}, granted=false users: ${notGrantedUsers.size}`)

// overlap: prompt-granted vs healthSync.enabled
const overlap = [...grantedUsers].filter((u) => stats.enabledUserIds.has(u)).length
console.log(`overlap (granted ∩ healthSync.enabled): ${overlap}`)

process.exit(0)
