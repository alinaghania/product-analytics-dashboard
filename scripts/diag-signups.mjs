// Read-only diagnostic: counts user signups (users.createdAt) grouped by
// calendar month, so we can answer "how many users arrived in month X".
// Months are bucketed in Europe/Paris time to match the rest of the dashboard.
//   node scripts/diag-signups.mjs            # full monthly breakdown
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

// Normalize the many shapes createdAt can take (Firestore Timestamp, ISO
// string, epoch millis, Date) into a JS Date — or null if unparseable.
function toDate(v) {
  if (!v) return null
  if (typeof v.toDate === "function") return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === "number") return new Date(v)
  if (typeof v === "string") {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// "YYYY-MM" bucket key in Europe/Paris.
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
})
function monthKey(date) {
  return fmt.format(date).slice(0, 7) // en-CA gives YYYY-MM-DD
}

const snap = await db.collection("users").select("createdAt").get()
const total = snap.size

const byMonth = {}
let missing = 0
for (const doc of snap.docs) {
  const d = toDate(doc.data().createdAt)
  if (!d) {
    missing++
    continue
  }
  const k = monthKey(d)
  byMonth[k] = (byMonth[k] || 0) + 1
}

console.log(`\n=== Signups by month (Europe/Paris) — total users: ${total}, missing createdAt: ${missing} ===\n`)
Object.keys(byMonth)
  .sort()
  .forEach((k) => console.log(`  ${k}   ${String(byMonth[k]).padStart(5)}`))

process.exit(0)
