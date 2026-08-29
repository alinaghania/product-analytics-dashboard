#!/usr/bin/env node
// Read-only diagnostic: who has connected Apple Health / Google Health Connect?
// Surveys app_events for health-related event names, inspects their params,
// and scans user docs for health-related fields.
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

const HEALTH_RE = /health|healthkit|health_connect|apple.?health|google.?fit|hk[_A-Z]/i

// 1) Full distinct event-name catalog for app_events (projection on name only)
console.log("=== 1) app_events — full event-name catalog ===")
const total = (await db.collection("app_events").count().get()).data().count
console.log(`  total app_events docs: ${total}`)
const nameCounts = new Map()
let last = null
let scanned = 0
while (true) {
  let q = db.collection("app_events").orderBy("__name__").select("name").limit(10000)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  for (const doc of snap.docs) {
    const n = doc.get("name") || "(no-name)"
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1)
  }
  scanned += snap.docs.length
  last = snap.docs[snap.docs.length - 1]
  if (snap.docs.length < 10000) break
}
console.log(`  scanned ${scanned} docs, ${nameCounts.size} distinct names`)
const healthNames = [...nameCounts.entries()].filter(([n]) => HEALTH_RE.test(n))
console.log("  health-related event names:")
for (const [n, c] of healthNames.sort((a, b) => b[1] - a[1])) console.log(`    ${c.toString().padStart(6)}  ${n}`)
if (healthNames.length === 0) console.log("    (none)")

// 2) For each health event name: distinct users, date range, sample params
console.log("\n=== 2) Health events — distinct users + params ===")
const usersByEvent = new Map()
for (const [name] of healthNames) {
  const snap = await db.collection("app_events").where("name", "==", name).get()
  const users = new Set()
  const paramSamples = new Map() // JSON key-set -> sample
  let min = null
  let max = null
  for (const doc of snap.docs) {
    const d = doc.data()
    if (d.userId) users.add(d.userId)
    const t = d.createdAt?.toDate?.()
    if (t) {
      if (!min || t < min) min = t
      if (!max || t > max) max = t
    }
    const pj = JSON.stringify(d.params ?? null)
    if (!paramSamples.has(pj) && paramSamples.size < 6) paramSamples.set(pj, true)
  }
  usersByEvent.set(name, users)
  console.log(`\n  "${name}": ${snap.docs.length} events, ${users.size} distinct users`)
  console.log(`    range: ${min?.toISOString()?.slice(0, 10)} → ${max?.toISOString()?.slice(0, 10)}`)
  for (const pj of paramSamples.keys()) console.log(`    params: ${pj?.slice(0, 200)}`)
}

// 3) Scan user docs for health-related field names (deep key scan)
console.log("\n=== 3) users — health-related fields ===")
const totalUsers = (await db.collection("users").count().get()).data().count
console.log(`  total users: ${totalUsers}`)
const fieldCounts = new Map()
const fieldSamples = new Map()
function walk(obj, prefix, hit) {
  if (!obj || typeof obj !== "object" || obj.toDate || Array.isArray(obj)) return
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (HEALTH_RE.test(k) && k !== "healthGoals" && k !== "healthConditions") {
      hit(p, v)
    }
    if (v && typeof v === "object" && !v.toDate && !Array.isArray(v) && prefix.split(".").length < 3) walk(v, p, hit)
  }
}
let lastU = null
while (true) {
  let q = db.collection("users").orderBy("__name__").limit(2000)
  if (lastU) q = q.startAfter(lastU)
  const snap = await q.get()
  if (snap.empty) break
  for (const doc of snap.docs) {
    walk(doc.data(), "", (p, v) => {
      fieldCounts.set(p, (fieldCounts.get(p) || 0) + 1)
      if (!fieldSamples.has(p)) fieldSamples.set(p, JSON.stringify(v)?.slice(0, 200))
    })
  }
  lastU = snap.docs[snap.docs.length - 1]
  if (snap.docs.length < 2000) break
}
if (fieldCounts.size === 0) console.log("  (no health-related fields on user docs)")
for (const [p, c] of [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.toString().padStart(6)}  ${p}   sample: ${fieldSamples.get(p)}`)
}

// 4) users/{uid}/weights — does it carry a source (HealthKit / Health Connect)?
console.log("\n=== 4) users/*/weights subcollection — sample docs (source field?) ===")
const wSnap = await db.collectionGroup("weights").limit(10).get()
console.log(`  ${wSnap.docs.length} sample docs`)
for (const doc of wSnap.docs.slice(0, 6)) {
  console.log(`  - ${doc.ref.path}`)
  console.log(`    ${JSON.stringify(doc.data())?.slice(0, 250)}`)
}

// 5) tracking sleep/sport — any source/provenance field?
console.log("\n=== 5) tracking — sleep/sport source fields? ===")
const tSnap = await db.collection("tracking").orderBy("createdAt", "desc").limit(300).get()
const keyHits = new Map()
for (const doc of tSnap.docs) {
  const d = doc.data()
  for (const section of ["sleep", "sport", "meals"]) {
    const s = d[section]
    if (s && typeof s === "object") {
      for (const k of Object.keys(s)) {
        if (/source|origin|provider|sync|auto|health/i.test(k)) {
          const p = `${section}.${k}`
          keyHits.set(p, (keyHits.get(p) || 0) + 1)
        }
      }
    }
  }
}
if (keyHits.size === 0) console.log("  (no source/sync/provider keys in recent tracking docs)")
for (const [p, c] of keyHits.entries()) console.log(`  ${c.toString().padStart(6)}  ${p}`)

// Summary: union of users across "granted/connected"-looking events
console.log("\n=== SUMMARY ===")
const union = new Set()
for (const [name, users] of usersByEvent.entries()) {
  if (/grant|accept|connect|enabl|success|sync/i.test(name)) for (const u of users) union.add(u)
}
console.log(`  distinct users across grant/connect-like health events: ${union.size}`)

process.exit(0)
