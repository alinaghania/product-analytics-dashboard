#!/usr/bin/env node
/**
 * Smoke-tests the new /api/users/[userId]/full route against the running dev server.
 *
 * 1. Mint a custom token for an admin email via Admin SDK.
 * 2. Exchange it for an ID token via Firebase Auth REST.
 * 3. Hit /api/users (list) and /api/users/[id]/full.
 * 4. Validate the shape and print key fields so we can spot regressions.
 *
 * Run: SERVICE_ACCOUNT_PATH=secrets/lotus-9663d-ceb58f42049b.json node scripts/test-user-detail.mjs
 */
import dotenv from "dotenv"
import { initializeApp, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env") })

const SERVER = process.env.SERVER_URL || "http://localhost:3000"
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",")[0].trim()

if (!API_KEY) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY required")
if (!ADMIN_EMAIL) throw new Error("NEXT_PUBLIC_ADMIN_EMAILS required (first one used)")

const serviceAccountPath = path.resolve(root, process.env.SERVICE_ACCOUNT_PATH || "secrets/lotus-9663d-ceb58f42049b.json")
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"))
const app = initializeApp({ credential: cert(serviceAccount) })
const auth = getAuth(app)
const db = getFirestore(app)

console.log(`> Server: ${SERVER}`)
console.log(`> Admin email: ${ADMIN_EMAIL}`)

// Ensure an Auth user exists so the ID token has an email claim
let user
try {
  user = await auth.getUserByEmail(ADMIN_EMAIL)
} catch {
  user = await auth.createUser({ email: ADMIN_EMAIL, emailVerified: true })
}
console.log(`> Auth uid: ${user.uid}`)

// Mint a custom token with email claim
const customToken = await auth.createCustomToken(user.uid, { email: ADMIN_EMAIL })

// Exchange for an ID token via REST
const signInResp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
)
const signInBody = await signInResp.json()
if (!signInResp.ok) {
  console.error("signInWithCustomToken failed", signInBody)
  process.exit(1)
}

// signInWithCustomToken returns an idToken but the email claim may be missing — refresh once.
const refreshResp = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: signInBody.refreshToken }),
})
const refreshBody = await refreshResp.json()
if (!refreshResp.ok) {
  console.error("refresh failed", refreshBody)
}

let idToken = refreshBody.id_token || signInBody.idToken

// Decode + verify email is present
const decoded = await auth.verifyIdToken(idToken)
console.log(`> Token email: ${decoded.email || "(none)"}`)
if (!decoded.email) {
  // Set email on the user, then re-sign-in
  await auth.updateUser(user.uid, { email: ADMIN_EMAIL })
  const retryCustom = await auth.createCustomToken(user.uid)
  const retryResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: retryCustom, returnSecureToken: true }),
    },
  )
  const retryBody = await retryResp.json()
  idToken = retryBody.idToken
  const retryDecoded = await auth.verifyIdToken(idToken)
  console.log(`> Retry token email: ${retryDecoded.email || "(still none)"}`)
}

const headers = { Authorization: `Bearer ${idToken}` }

// ----- TEST 1: /api/users (list) -----
console.log("\n=== GET /api/users ===")
const usersResp = await fetch(`${SERVER}/api/users?limit=5`, { headers })
const usersBody = await usersResp.json()
console.log(`status: ${usersResp.status}`)
if (!usersResp.ok) {
  console.error(usersBody)
  process.exit(1)
}
console.log(`returned ${usersBody.data.length} users`)
const userWithPhone = usersBody.data.find((u) => u.phone)
const userMissingPhone = usersBody.data.find((u) => !u.phone)
console.log(`first user phone: ${usersBody.data[0]?.phone || "(none)"}`)
console.log(`first user flags:`, usersBody.data[0]?.flags)

// Find a user with phone for the full test
let targetUserId = userWithPhone?.id
if (!targetUserId) {
  // Fall back: query Firestore directly for someone with a phone
  console.log(`\n> No user with phone in first page, searching Firestore...`)
  const snap = await db.collection("users").limit(50).get()
  for (const doc of snap.docs) {
    if (doc.data().registrationData?.phone) {
      targetUserId = doc.id
      break
    }
  }
  if (!targetUserId) targetUserId = snap.docs[0]?.id
}
console.log(`> Test user id: ${targetUserId}`)

// ----- TEST 2: /api/users/[id]/full -----
console.log(`\n=== GET /api/users/${targetUserId}/full ===`)
const fullResp = await fetch(`${SERVER}/api/users/${targetUserId}/full`, { headers })
const fullBodyText = await fullResp.text()
console.log(`status: ${fullResp.status}`)
let fullBody
try {
  fullBody = JSON.parse(fullBodyText)
} catch (e) {
  console.error("invalid JSON response:")
  console.error(fullBodyText.slice(0, 500))
  process.exit(1)
}

if (!fullResp.ok) {
  console.error(fullBody)
  process.exit(1)
}

const d = fullBody.data
console.log(`user.email: ${d.user.email}`)
console.log(`user.phone: ${d.user.phone || "(none)"}`)
console.log(`user.flags: ${JSON.stringify(d.user.flags)}`)
console.log(`raw.userDoc present: ${!!d.raw?.userDoc}`)
console.log(`raw.userDoc keys: ${Object.keys(d.raw?.userDoc || {}).slice(0, 20).join(", ")}`)

for (const [name, section] of Object.entries(d.sections)) {
  if (name === "lastActivity") {
    console.log(`section ${name}: error=${section.error || "none"}, has=${!!section.data}`)
    continue
  }
  const count = Array.isArray(section.data) ? section.data.length : 0
  console.log(`section ${name}: count=${count}, error=${section.error ? section.error.slice(0, 80) : "none"}`)
}

// Spot-check timestamp serialization
const sampleTs = d.user.createdAt
console.log(`\nuser.createdAt sample: ${JSON.stringify(sampleTs)}`)
console.log(`sourceReadsEstimate: ${fullBody.sourceReadsEstimate}`)

// Spot-check conversations title/lastMessage
const convSample = d.sections.conversations.data?.[0]
if (convSample) {
  console.log(`\nfirst conversation:`)
  console.log(`  title: ${convSample.title || "(none)"}`)
  console.log(`  lastMessage: ${(convSample.lastMessage || convSample.lastMessageSnippet || "").slice(0, 60) || "(none)"}`)
  console.log(`  messageCount: ${convSample.messageCount}`)
}

// Spot-check photo schema
const photoSample = d.sections.photos.data?.[0]
if (photoSample) {
  console.log(`\nfirst photo keys: ${Object.keys(photoSample).join(", ")}`)
  console.log(`  bloated type: ${typeof photoSample.bloated} (value: ${photoSample.bloated})`)
  console.log(`  pain: ${photoSample.pain ?? "(undefined)"}`)
}

console.log("\n✓ Tests completed")
