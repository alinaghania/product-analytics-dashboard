#!/usr/bin/env node
// Read-only: find intro/onboarding conversations in recent data and discover
// WHERE the intro signal actually lives — message-level fields, conversation-doc
// fields, or only inferable from content. No writes; no hardcoded userId.
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
const app = initializeApp({ credential: cert(sa) })
const db = getFirestore(app)

const SCAN = Number(process.argv[2] || 80)
console.log(`Scanning ${SCAN} most-recent chat_conversations\n`)

const normRole = (d) => {
  const r = String(d.role ?? d.sender ?? d.type ?? d.author ?? d.from ?? "").toLowerCase()
  if (["user", "client", "human"].includes(r)) return "user"
  if (["assistant", "bot", "ai", "endora"].includes(r)) return r === "endora" ? "endora" : "assistant"
  if (r === "system") return "system"
  return "assistant"
}
const text = (d) => {
  const v = d.text ?? d.content ?? d.message ?? d.body
  return (typeof v === "string" ? v : "").trim()
}
const INTRO_RE = /^Bonjour\b.*je suis Endora/i
const INTRO_TITLE_RE = /^(bienvenue sur endora|welcome to endora)$/i

// --- Replica of lib/firestore-admin-queries.ts classifyConversation (to verify
// the production exclusion against real data). Keep in sync. ---
const isIntroMsg = (m) => m.entryPoint === "intro_flow" || m.topic === "intro_flow"
const nonEmpty = (m) => text(m).length > 0
const normReply = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
const SCRIPT = new Set(
  [
    "Ravie de te rencontrer",
    "Mais c'est génial, je vais en apprendre plus sur moi",
    "J'aurais des choses à montrer à mon médecin",
    "J'adore le concept",
    "Bon à savoir",
    "Ça va me faciliter mon suivi",
  ].map(normReply),
)
function classify(msgs, title) {
  if (msgs.some(isIntroMsg)) {
    const ne = msgs.filter(nonEmpty)
    if (ne.length > 0 && ne.every(isIntroMsg)) return "excluded"
    return "kept(stripped)"
  }
  const firstAssistant = msgs.find((m) => normRole(m) !== "user" && nonEmpty(m))
  const opens =
    (!!firstAssistant && INTRO_RE.test(text(firstAssistant))) || (!!title && INTRO_TITLE_RE.test((title || "").trim()))
  if (!opens) return "kept"
  const realRequest = msgs.some((m) => normRole(m) === "user" && nonEmpty(m) && !SCRIPT.has(normReply(text(m))))
  return realRequest ? "kept" : "excluded"
}

const snap = await db.collection("chat_conversations").orderBy("createdAt", "desc").limit(SCAN).get()

let withMessages = 0
let introByContent = 0
let printed = 0
const convFieldKeys = new Set()
const msgFieldKeys = new Set()
const subcollNames = new Set()
const classifyCounts = {}
const leaks = []

for (const doc of snap.docs) {
  const data = doc.data()
  Object.keys(data).forEach((k) => convFieldKeys.add(k))

  // Discover the real subcollection name(s) and read WITHOUT ordering (messages
  // may lack createdAt, which would make an ordered query return empty).
  const subs = await doc.ref.listCollections()
  subs.forEach((c) => subcollNames.add(c.id))
  let msgs = []
  for (const sub of subs) {
    const s = await sub.limit(60).get()
    msgs = msgs.concat(s.docs.map((m) => ({ __sub: sub.id, ...m.data() })))
  }
  if (msgs.length > 0) withMessages++
  msgs.forEach((m) => Object.keys(m).forEach((k) => msgFieldKeys.add(k)))

  const firstAssistant = msgs.find((m) => normRole(m) !== "user" && text(m).length > 0)
  const isIntro = !!firstAssistant && INTRO_RE.test(text(firstAssistant))
  if (isIntro) introByContent++

  const verdict = classify(msgs, data.title)
  classifyCounts[verdict] = (classifyCounts[verdict] || 0) + 1
  // Red flag: an intro-by-content conversation that we DON'T exclude.
  if (isIntro && verdict !== "excluded") leaks.push({ id: doc.id, verdict, msgs: msgs.length })

  if (isIntro && printed < 5) {
    printed++
    console.log(`--- INTRO conv ${doc.id} (msgs=${msgs.length}) ---`)
    console.log(`  conv-doc fields: ${JSON.stringify({ topic: data.topic, entryPoint: data.entryPoint, topics: data.topics, messageCount: data.messageCount })}`)
    for (const m of msgs.slice(0, 14)) {
      console.log(
        `  ${normRole(m).padEnd(9)} keys=[${Object.keys(m).join(",")}] entryPoint=${JSON.stringify(
          m.entryPoint,
        )} topic=${JSON.stringify(m.topic)} | ${text(m).slice(0, 45).replace(/\n/g, " ")}`,
      )
    }
    console.log("")
  }
}

console.log("=== SUMMARY ===")
console.log(`  scanned                         : ${snap.docs.length}`)
console.log(`  with ≥1 message                 : ${withMessages}`)
console.log(`  intro-by-content (Bonjour…Endora): ${introByContent}`)
console.log(`  subcollection names seen        : ${[...subcollNames].sort().join(", ") || "(none)"}`)
console.log(`  union of conversation-doc keys  : ${[...convFieldKeys].sort().join(", ")}`)
console.log(`  union of message keys           : ${[...msgFieldKeys].sort().join(", ")}`)
console.log(`  classify() verdicts             : ${JSON.stringify(classifyCounts)}`)
console.log(`  intro-by-content NOT excluded   : ${leaks.length} ${leaks.length ? JSON.stringify(leaks) : "✓ none leak"}`)

process.exit(0)
