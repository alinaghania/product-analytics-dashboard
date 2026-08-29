#!/usr/bin/env node
// Read-only diagnostic: reconstruct monthly AI-chat usage from Firestore to
// explain OpenAI cost evolution. Aggregates chat_conversations/{id}/messages
// by month: volume by role, content length (token proxy), errors/retries,
// agent mix, per-user concentration. Also counts photos per month.
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

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)
// Months are bucketed in UTC — deliberate deviation from the dashboard's
// Europe/Paris convention, to line up with OpenAI's UTC usage/billing buckets.
const monthKey = (v) => {
  const d = toDate(v)
  return d && !isNaN(d) ? d.toISOString().slice(0, 7) : "(no-date)"
}
// Message docs don't follow lib/types.ts: date lives in createdAt|timestamp|sentAt|time
// (sometimes a number), content in text|content|message|body (string or parts array).
const msgDate = (d) => toDate(d.createdAt) || toDate(d.timestamp) || toDate(d.sentAt) || toDate(d.time)
const msgContent = (d) => {
  const extract = (v) => {
    if (typeof v === "string") return v
    if (Array.isArray(v)) return v.map((i) => (typeof i === "string" ? i : i?.text ?? i?.content ?? i?.message ?? "")).join("\n")
    if (v && typeof v === "object") {
      const c = v.text ?? v.content ?? v.message
      return typeof c === "string" ? c : ""
    }
    return ""
  }
  return extract(d.text) || extract(d.content) || extract(d.message) || extract(d.body) || ""
}

// ─── 1) Fetch all conversations ───
console.log("=== 1) chat_conversations ===")
const convs = []
{
  let last = null
  while (true) {
    let q = db.collection("chat_conversations").orderBy("__name__").limit(500)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      const d = doc.data()
      convs.push({
        id: doc.id,
        userId: d.userId,
        messageCount: d.messageCount || 0,
        createdAt: toDate(d.createdAt),
      })
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < 500) break
  }
}
console.log(`  total conversations: ${convs.length}`)
console.log(`  sum of messageCount: ${convs.reduce((s, c) => s + c.messageCount, 0)}`)

const convsByMonth = new Map()
for (const c of convs) {
  const k = monthKey(c.createdAt)
  const m = convsByMonth.get(k) || { newConvs: 0, users: new Set() }
  m.newConvs++
  if (c.userId) m.users.add(c.userId)
  convsByMonth.set(k, m)
}
console.log("\n  month    | new convs | distinct users (new convs)")
for (const [k, m] of [...convsByMonth.entries()].sort()) {
  console.log(`  ${k}  | ${String(m.newConvs).padStart(9)} | ${m.users.size}`)
}

// ─── 2) Fetch all messages (per conversation, bounded concurrency) ───
console.log("\n=== 2) messages (full scan, per-conversation) ===")
const months = new Map()
const monthAgg = (k) => {
  let m = months.get(k)
  if (!m) {
    m = {
      total: 0,
      byRole: {},
      charsByRole: {},
      errors: 0,
      retries: 0,
      retryMsgs: 0,
      agents: {},
      latencySum: 0,
      latencyN: 0,
      convs: new Set(),
      users: new Set(),
      perUserMsgs: new Map(),
    }
    months.set(k, m)
  }
  return m
}

let fetched = 0
const CONCURRENCY = 25
const queue = [...convs]
async function worker() {
  while (queue.length) {
    const conv = queue.shift()
    const snap = await db.collection("chat_conversations").doc(conv.id).collection("messages").get()
    for (const doc of snap.docs) {
      const d = doc.data()
      const k = monthKey(msgDate(d))
      const m = monthAgg(k)
      const role = d.role || d.sender || d.type || "(none)"
      const len = msgContent(d).length
      m.total++
      m.byRole[role] = (m.byRole[role] || 0) + 1
      m.charsByRole[role] = (m.charsByRole[role] || 0) + len
      if (d.status === "error") m.errors++
      if (d.retryCount > 0) {
        m.retryMsgs++
        m.retries += d.retryCount
      }
      if (d.agent) m.agents[d.agent] = (m.agents[d.agent] || 0) + 1
      if (typeof d.latencyMs === "number" && role !== "user") {
        m.latencySum += d.latencyMs
        m.latencyN++
      }
      m.convs.add(conv.id)
      if (conv.userId) {
        m.users.add(conv.userId)
        m.perUserMsgs.set(conv.userId, (m.perUserMsgs.get(conv.userId) || 0) + 1)
      }
    }
    fetched += snap.docs.length
    if (fetched % 5000 < snap.docs.length) console.log(`  ...fetched ~${fetched} messages`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`  total messages fetched: ${fetched}`)

// ─── 3) Monthly usage table ───
console.log("\n=== 3) Monthly chat usage (UTC months; token proxy = chars/4; retry = msgsWithRetry/totalRetries) ===")
console.log(
  "  month    |   msgs | user msgs | asst msgs | convs | users | asst kTok~ | user kTok~ | err |     retry | avgLat(s)"
)
const sortedMonths = [...months.entries()].sort()
for (const [k, m] of sortedMonths) {
  const asst = (m.byRole["assistant"] || 0) + (m.byRole["endora"] || 0)
  const asstChars = (m.charsByRole["assistant"] || 0) + (m.charsByRole["endora"] || 0)
  const userChars = m.charsByRole["user"] || 0
  const lat = m.latencyN ? (m.latencySum / m.latencyN / 1000).toFixed(1) : "-"
  console.log(
    `  ${k}  | ${String(m.total).padStart(6)} | ${String(m.byRole["user"] || 0).padStart(9)} | ${String(asst).padStart(9)} | ${String(m.convs.size).padStart(5)} | ${String(m.users.size).padStart(5)} | ${String(Math.round(asstChars / 4 / 1000)).padStart(10)} | ${String(Math.round(userChars / 4 / 1000)).padStart(10)} | ${String(m.errors).padStart(3)} | ${`${m.retryMsgs}/${m.retries}`.padStart(9)} | ${lat}`
  )
}

// ─── 4) Role & agent mix per month ───
console.log("\n=== 4) Roles per month ===")
for (const [k, m] of sortedMonths) {
  console.log(`  ${k}: ${JSON.stringify(m.byRole)}`)
}
console.log("\n=== 5) Agents per month ===")
for (const [k, m] of sortedMonths) {
  const top = Object.entries(m.agents).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log(`  ${k}: ${top.map(([a, n]) => `${a}=${n}`).join(", ") || "(none)"}`)
}

// ─── 6) Avg message length per month (context growth proxy) ───
console.log("\n=== 6) Avg chars per message (by role) ===")
for (const [k, m] of sortedMonths) {
  const parts = Object.keys(m.byRole)
    .map((r) => `${r}=${Math.round((m.charsByRole[r] || 0) / m.byRole[r])}`)
    .join(", ")
  console.log(`  ${k}: ${parts}`)
}

// ─── 7) Per-user concentration ───
console.log("\n=== 7) Top users by messages (per month, last 3 months) ===")
for (const [k, m] of sortedMonths.slice(-3)) {
  const top = [...m.perUserMsgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const totalUserMsgs = [...m.perUserMsgs.values()].reduce((s, v) => s + v, 0)
  console.log(`  ${k} (total ${totalUserMsgs} msgs, ${m.perUserMsgs.size} users):`)
  for (const [uid, n] of top) {
    console.log(`    ${uid}  ${n} (${((n / totalUserMsgs) * 100).toFixed(1)}%)`)
  }
}

// ─── 8) Conversation length distribution per month (context re-send cost) ───
console.log("\n=== 8) Conversation size distribution (by conv createdAt month) ===")
const convSizeByMonth = new Map()
for (const c of convs) {
  const k = monthKey(c.createdAt)
  const arr = convSizeByMonth.get(k) || []
  arr.push(c.messageCount)
  convSizeByMonth.set(k, arr)
}
for (const [k, arr] of [...convSizeByMonth.entries()].sort()) {
  arr.sort((a, b) => a - b)
  const sum = arr.reduce((s, v) => s + v, 0)
  const p = (q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))]
  console.log(
    `  ${k}: n=${arr.length}, avg=${(sum / arr.length).toFixed(1)}, p50=${p(0.5)}, p90=${p(0.9)}, max=${arr[arr.length - 1]}`
  )
}

// ─── 9) Photos per month (vision cost candidate) ───
console.log("\n=== 9) photos per month ===")
{
  const photoMonths = new Map()
  let last = null
  let n = 0
  while (true) {
    let q = db.collection("photos").select("createdAt", "timestamp").orderBy("__name__").limit(1000)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      const d = doc.data()
      const k = monthKey(d.createdAt || d.timestamp)
      photoMonths.set(k, (photoMonths.get(k) || 0) + 1)
    }
    n += snap.docs.length
    last = snap.docs[snap.docs.length - 1]
    if (snap.docs.length < 1000) break
  }
  console.log(`  total photos: ${n}`)
  for (const [k, c] of [...photoMonths.entries()].sort()) console.log(`  ${k}: ${c}`)
}

process.exit(0)
