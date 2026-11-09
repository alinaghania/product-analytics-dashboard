import { initializeApp, getApps, cert, applicationDefault, type App, type Credential } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAuth, type Auth } from "firebase-admin/auth"
import { getStorage } from "firebase-admin/storage"
import { isCloudRun, readServiceAccountKey } from "./service-account"

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>

let app: App | undefined
let db: Firestore | undefined
let dashboardDb: Firestore | undefined
let auth: Auth | undefined
let cacheBucket: Bucket | undefined

// Named Firestore database owned by the dashboard. The service account only
// has write access on this database (conditional IAM binding) — the mobile
// app's "(default)" database stays read-only at the infrastructure level.
const DASHBOARD_DB_ID = "dashboard"

// A JSON key when one is configured (local dev); otherwise, on Cloud Run, the
// service's runtime identity (endora-dashboard-readonly) through Application
// Default Credentials — no key involved. The project ID then comes from
// GOOGLE_CLOUD_PROJECT (set by Terraform) or the metadata server.
function getCredential(): Credential {
  const key = readServiceAccountKey()
  if (key) {
    return cert({ projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key })
  }
  if (isCloudRun()) return applicationDefault()

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

  app = initializeApp({ credential: getCredential() })
  return app
}

export function getAdminDb(): Firestore {
  const adminApp = initAdmin()
  if (!db) {
    db = getFirestore(adminApp)
  }
  return db
}

// Pool of Firestore clients on extra named apps, for large chunked scans
// (100k+ docs). A single client multiplexes everything over one gRPC channel,
// which caps streaming at ~2k docs/s no matter how many queries run "in
// parallel"; one channel per client restores real parallelism (~5x measured
// on the retention activity scan). Lazy — apps are only created on first use.
const SCAN_POOL_SIZE = 8
let scanPool: Firestore[] | undefined

export function getAdminDbPool(): Firestore[] {
  initAdmin() // keep the default app as getApps()[0] before adding named ones
  if (!scanPool) {
    const credential = getCredential()
    scanPool = Array.from({ length: SCAN_POOL_SIZE }, (_, i) => {
      const name = `scan-pool-${i}`
      const existing = getApps().find((a) => a.name === name)
      return getFirestore(existing ?? initializeApp({ credential }, name))
    })
  }
  return scanPool
}

export function getDashboardDb(): Firestore {
  const adminApp = initAdmin()
  if (!dashboardDb) {
    dashboardDb = getFirestore(adminApp, DASHBOARD_DB_ID)
  }
  return dashboardDb
}

export function getAdminAuth(): Auth {
  const adminApp = initAdmin()
  if (!auth) {
    auth = getAuth(adminApp)
  }
  return auth
}

// Private bucket holding the server-side cache (lib/server-cache.ts). Only set
// on Cloud Run (CACHE_BUCKET, from Terraform); null elsewhere, so local runs
// never write into the production cache.
export function getCacheBucket(): Bucket | null {
  const name = process.env.CACHE_BUCKET
  if (!name) return null
  if (!cacheBucket) {
    cacheBucket = getStorage(initAdmin()).bucket(name)
  }
  return cacheBucket
}

// Admin emails allowed to access the dashboard. Server-only env var (no
// NEXT_PUBLIC_ prefix) so the allowlist is never shipped in the client bundle.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// Verify Firebase ID token and check admin email.
// The email claim alone is not proof of ownership: anyone can create an
// email/password Firebase account with an admin's address. We therefore only
// accept tokens issued by Google Sign-In (the dashboard's only login method)
// whose email Google has verified.
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

    if (decoded.firebase.sign_in_provider !== "google.com" || decoded.email_verified !== true) {
      throw new AuthError("Access denied: a verified Google account is required", 403)
    }

    if (!isAdminEmail(email)) {
      throw new AuthError("Access denied: email not in admin list", 403)
    }

    return { uid: decoded.uid, email: email! }
  } catch (error) {
    if (error instanceof AuthError) throw error
    // Expired tokens and infrastructure failures (credentials, project ID,
    // network) both land here: log the cause so a misconfiguration doesn't
    // masquerade as a session problem.
    console.warn("[auth] ID token verification failed:", error instanceof Error ? error.message : error)
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
