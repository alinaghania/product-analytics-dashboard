#!/usr/bin/env node
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

// 1) Sample app_events — get distinct event names + most common
console.log("=== 1) app_events — distinct event names (top 20) ===")
const sampleSize = 2000
const snap = await db.collection("app_events").orderBy("createdAt", "desc").limit(sampleSize).get()
console.log(`  sampled ${snap.docs.length} recent docs`)
const nameCounts = new Map()
for (const doc of snap.docs) {
  const name = doc.data().name || "(no-name)"
  nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
}
const sortedNames = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])
for (const [name, count] of sortedNames.slice(0, 25)) {
  console.log(`  ${count.toString().padStart(5)}  ${name}`)
}

// 2) Print 2 sample app_events docs with each candidate "open" name
console.log("\n=== 2) Sample docs for likely 'app open' events ===")
const candidates = ["app_open", "app_opened", "session_start", "session_started", "app_launched", "screen_view", "page_view"]
for (const name of candidates) {
  const s = await db.collection("app_events").where("name", "==", name).limit(2).get()
  if (s.docs.length > 0) {
    console.log(`\n  ✓ "${name}" — ${s.docs.length} sample(s):`)
    for (const doc of s.docs) {
      const d = doc.data()
      console.log(`    keys: ${Object.keys(d).join(", ")}`)
      console.log(`    userId: ${d.userId}, createdAt: ${d.createdAt?.toDate?.()?.toISOString()}, params: ${JSON.stringify(d.params).slice(0, 150)}`)
    }
  }
}

// 3) daily_engagement
console.log("\n=== 3) daily_engagement collection ===")
const de = await db.collection("daily_engagement").limit(5).get()
console.log(`  ${de.docs.length} sample docs`)
for (const doc of de.docs) {
  const d = doc.data()
  console.log(`  - id="${doc.id}" keys=${Object.keys(d).join(",")}`)
  console.log(`    full: ${JSON.stringify(d, null, 2).slice(0, 400)}`)
}

// 4) bubble_events for nav events
console.log("\n=== 4) bubble_events — distinct event names ===")
const be = await db.collection("bubble_events").orderBy("createdAt", "desc").limit(500).get()
console.log(`  ${be.docs.length} sample docs`)
const beNames = new Map()
for (const doc of be.docs) {
  const name = doc.data().event || doc.data().name || "(no-name)"
  beNames.set(name, (beNames.get(name) || 0) + 1)
}
for (const [n, c] of [...beNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${c.toString().padStart(4)}  ${n}`)
}

// 5) users/{uid}/daily-engagement-history subcollection (from audit earlier)
console.log("\n=== 5) Check users/{uid}/daily-engagement-history subcollection ===")
const usersSnap = await db.collection("users").limit(10).get()
for (const u of usersSnap.docs) {
  const subs = await u.ref.listCollections()
  if (subs.length > 0) {
    console.log(`  ${u.id}: ${subs.map((c) => c.id).join(", ")}`)
    const hist = subs.find((c) => c.id === "daily-engagement-history")
    if (hist) {
      const histSnap = await hist.limit(3).get()
      console.log(`    daily-engagement-history: ${histSnap.docs.length} docs`)
      for (const h of histSnap.docs) {
        console.log(`      - id="${h.id}" data=${JSON.stringify(h.data()).slice(0, 200)}`)
      }
      break
    }
  }
}

process.exit(0)
