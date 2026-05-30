#!/usr/bin/env node
import dotenv from "dotenv"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore, FieldPath } from "firebase-admin/firestore"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env") })

const sa = JSON.parse(fs.readFileSync(path.resolve(root, process.env.SERVICE_ACCOUNT_PATH), "utf-8"))
const app = initializeApp({ credential: cert(sa) })
const db = getFirestore(app)

const USER_ID = process.argv[2]
if (!USER_ID) {
  console.error("Usage: node scripts/diag-tracking.mjs <userId>")
  console.error("  Deep-dives one user: doc, per-collection doc counts, subcollections, collection-group hits.")
  process.exit(1)
}
console.log(`Deep diag for user: ${USER_ID}\n`)

// 1) Does the user doc even exist?
console.log("=== 1) user doc exists ? ===")
const userDoc = await db.collection("users").doc(USER_ID).get()
console.log(`  exists: ${userDoc.exists}`)
if (userDoc.exists) {
  const d = userDoc.data()
  console.log(`  email=${d.email} username=${d.username}`)
  console.log(`  createdAt=${d.createdAt?.toDate?.()?.toISOString()}`)
  console.log(`  top-level keys: ${Object.keys(d).join(", ")}`)
}

// 2) List all top-level collections
console.log("\n=== 2) All top-level collections ===")
const cols = await db.listCollections()
console.log(`  ${cols.length} collections: ${cols.map((c) => c.id).join(", ")}`)

// 3) For each collection, count docs where userId == X
console.log(`\n=== 3) Per-collection doc count for userId == ${USER_ID} ===`)
for (const col of cols) {
  try {
    const snap = await col.where("userId", "==", USER_ID).limit(50).get()
    if (snap.docs.length > 0) {
      console.log(`  ✓ ${col.id}: ${snap.docs.length} docs`)
      // Print first doc id + sample keys
      const sample = snap.docs[0].data()
      console.log(`    sample id: ${snap.docs[0].id}`)
      console.log(`    sample keys: ${Object.keys(sample).slice(0, 15).join(", ")}`)
      if (sample.symptoms) console.log(`    symptoms: ${JSON.stringify(sample.symptoms).slice(0, 200)}`)
      if (sample.date) console.log(`    date: ${sample.date}`)
    } else {
      console.log(`  ✗ ${col.id}: 0`)
    }
  } catch (e) {
    console.log(`  ! ${col.id}: ${e.message.slice(0, 80)}`)
  }
}

// 4) Subcollections under users/USER_ID
console.log(`\n=== 4) Subcollections under users/${USER_ID} ===`)
const subs = await db.collection("users").doc(USER_ID).listCollections()
console.log(`  ${subs.length} subcollections: ${subs.map((c) => c.id).join(", ") || "(none)"}`)
for (const sub of subs) {
  const snap = await sub.limit(5).get()
  console.log(`  ${sub.id}: ${snap.docs.length} docs`)
  for (const d of snap.docs.slice(0, 2)) {
    console.log(`    - id=${d.id} keys=${Object.keys(d.data()).slice(0, 10).join(",")}`)
  }
}

// 5) Try collection group queries on common subcollection names
console.log(`\n=== 5) Collection group queries (any nested collection with userId/X) ===`)
for (const name of ["symptoms", "symptom_logs", "tracking_entries", "trackingEntries", "logs", "entries", "daily"]) {
  try {
    const snap = await db.collectionGroup(name).where("userId", "==", USER_ID).limit(5).get()
    console.log(`  ${name}: ${snap.docs.length} docs`)
    if (snap.docs.length > 0) {
      console.log(`    sample path: ${snap.docs[0].ref.path}`)
    }
  } catch (e) {
    console.log(`  ${name}: (error: ${e.message.slice(0, 60)})`)
  }
}

process.exit(0)
