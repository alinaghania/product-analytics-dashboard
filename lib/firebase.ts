import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth"
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  type Firestore,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore"

// Admin UID allowlist - users who can access the dashboard
export const ADMIN_UIDS = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Map from EXPO_PUBLIC_* to NEXT_PUBLIC_* for compatibility
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
}

export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId)
}

export function getMissingConfig(): string[] {
  const missing: string[] = []
  if (!firebaseConfig.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY")
  if (!firebaseConfig.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
  return missing
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let initialized = false

function initializeFirebase(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("FIREBASE_NOT_CONFIGURED")
  }
  
  if (!initialized) {
    const existingApps = getApps()
    if (existingApps.length > 0) {
      app = existingApps[0]
    } else {
      app = initializeApp(firebaseConfig)
    }
    initialized = true
  }
  
  return app!
}

export function getFirebaseApp(): FirebaseApp {
  return initializeFirebase()
}

export function getFirebaseAuth(): Auth {
  const firebaseApp = initializeFirebase()
  if (!auth) {
    auth = getAuth(firebaseApp)
  }
  return auth
}

export function getFirebaseDb(): Firestore {
  const firebaseApp = initializeFirebase()
  if (!db) {
    db = getFirestore(firebaseApp)
  }
  return db
}

// Check if user is admin
export function isAdmin(user: User | null): boolean {
  if (!user) {
    console.log("[v0] isAdmin check: No user")
    return false
  }

  console.log("[v0] isAdmin check:")
  console.log("[v0] - User UID:", user.uid)
  console.log("[v0] - User email:", user.email)
  console.log("[v0] - ADMIN_UIDS list:", ADMIN_UIDS)
  console.log("[v0] - ADMIN_UIDS length:", ADMIN_UIDS.length)
  console.log("[v0] - Is admin?:", ADMIN_UIDS.includes(user.uid))

  return ADMIN_UIDS.includes(user.uid)
}

// Google Sign-In with popup and retry logic
export async function signInWithGoogle() {
  const auth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()

  console.log("[v0] signInWithGoogle called (popup mode)")
  console.log("[v0] Current domain:", typeof window !== "undefined" ? window.location.hostname : "SSR")
  console.log("[v0] Firebase authDomain:", firebaseConfig.authDomain)
  console.log("[v0] Firebase projectId:", firebaseConfig.projectId)

  provider.setCustomParameters({
    prompt: "select_account",
  })

  try {
    const result = await signInWithPopup(auth, provider)
    console.log("[v0] Sign in successful:", result.user.email)
    return result
  } catch (error: any) {
    console.error("[v0] Sign in error:", error.message)
    console.error("[v0] Error code:", error.code)

    if (error.code === "auth/missing-or-invalid-nonce" || error.code === "auth/popup-blocked") {
      console.log("[v0] Retrying sign in with fresh state...")
      try {
        // Sign out first to clear any state
        await firebaseSignOut(auth).catch(() => {})
        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 500))
        // Retry
        const retryResult = await signInWithPopup(auth, provider)
        console.log("[v0] Retry successful:", retryResult.user.email)
        return retryResult
      } catch (retryError: any) {
        console.error("[v0] Retry failed:", retryError.message)
        throw retryError
      }
    }

    throw error
  }
}

// No-op for popup flow, keeping for compatibility
export async function handlePopupResult() {
  return null
}

export async function signOut() {
  const auth = getFirebaseAuth()
  return firebaseSignOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth()
  return onAuthStateChanged(auth, callback)
}

// Helper to convert Firestore timestamp to Date
export function toDate(timestamp: Timestamp | Date | string | undefined | null): Date | undefined {
  if (!timestamp) return undefined
  if (timestamp instanceof Timestamp) return timestamp.toDate()
  if (timestamp instanceof Date) return timestamp
  if (typeof timestamp === "string") return new Date(timestamp)
  return undefined
}

// Re-export for convenience
export {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  type QueryConstraint,
  type DocumentData,
  type User,
}
