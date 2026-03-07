import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAuth, type Auth } from "firebase-admin/auth"
import * as path from "path"
import * as fs from "fs"

let app: App | undefined
let db: Firestore | undefined
let auth: Auth | undefined

function getServiceAccountCredential() {
  // Option 1: FIREBASE_SERVICE_ACCOUNT env var (Vercel production)
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (envJson) {
    try {
      return cert(JSON.parse(envJson))
    } catch (e) {
      throw new Error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON")
    }
  }

  // Option 2: SERVICE_ACCOUNT_PATH file (local dev)
  const filePath = process.env.SERVICE_ACCOUNT_PATH
  if (filePath) {
    const resolved = path.resolve(filePath)
    if (fs.existsSync(resolved)) {
      return cert(JSON.parse(fs.readFileSync(resolved, "utf-8")))
    }
    throw new Error(`Service account file not found: ${resolved}`)
  }

  throw new Error(
    "No Firebase service account configured. Set FIREBASE_SERVICE_ACCOUNT env var or SERVICE_ACCOUNT_PATH.",
  )
}

function initAdmin(): App {
  if (app) return app

  const existing = getApps()
  if (existing.length > 0) {
    app = existing[0]
    return app
  }

  app = initializeApp({
    credential: getServiceAccountCredential(),
  })
  return app
}

export function getAdminDb(): Firestore {
  const adminApp = initAdmin()
  if (!db) {
    db = getFirestore(adminApp)
  }
  return db
}

export function getAdminAuth(): Auth {
  const adminApp = initAdmin()
  if (!auth) {
    auth = getAuth(adminApp)
  }
  return auth
}

// Admin emails allowed to access the dashboard
export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// Verify Firebase ID token and check admin email
export async function verifyAuth(request: Request): Promise<{ uid: string; email: string }> {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401)
  }

  const token = authHeader.slice(7)
  const adminAuth = getAdminAuth()

  try {
    const decoded = await adminAuth.verifyIdToken(token)
    const email = decoded.email

    if (!isAdminEmail(email)) {
      throw new AuthError("Access denied: email not in admin list", 403)
    }

    return { uid: decoded.uid, email: email! }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError("Invalid or expired token", 401)
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = "AuthError"
  }
}
