# Migration Plan: Server-Side Firestore via Admin SDK

## Context

The dashboard currently reads Firestore **client-side** (from the browser), which makes it dependent on Firestore security rules managed in the separate `lotus-mobile/lotus-firebase` repo. Every time rules are deployed for the mobile app, the dashboard can break. The admin access requires both a UID allowlist AND a Firebase custom claim, creating a fragile two-step process that frequently fails (current issue: UID mismatch = locked out).

**Goal**: Move all Firestore reads to **server-side API routes** using Firebase Admin SDK with a **dedicated read-only service account**. This completely decouples the dashboard from the mobile app's Firestore rules. Zero files in `lotus-mobile/lotus-firebase` are touched.

**Impact on mobile app**: None. The Admin SDK bypasses Firestore rules entirely. The mobile app continues to use rules as before.

---

## Pre-requisite: Read-Only Service Account -- DONE

Service account already created and key downloaded:
- **File**: `secrets/lotus-9663d-ceb58f42049b.json`
- **Email**: `endora-dashboard-readonly@lotus-9663d.iam.gserviceaccount.com`
- **Project**: `lotus-9663d`
- **Role**: Cloud Datastore Viewer (Firestore read-only)
- `secrets/` is in `.gitignore`

**Still needed for production**: Add `FIREBASE_SERVICE_ACCOUNT` env var in Vercel with the JSON content.

---

## Step 1: Create `lib/firebase-admin.ts` (new file)

Server-side Firebase Admin SDK initialization. Singleton pattern.

- Reads service account from `secrets/lotus-9663d-ceb58f42049b.json` (local dev) or `FIREBASE_SERVICE_ACCOUNT` env var (Vercel)
- Exports `getAdminDb()` returning `Firestore` instance
- Exports a `verifyAuth(token)` helper that validates Firebase ID tokens
- **Only runs server-side** (Node.js), never in the browser

---

## Step 2: Create `lib/firestore-admin-queries.ts` (new file)

Port all query functions from `lib/firestore-queries.ts` to use Admin SDK. The logic stays the same, only the Firestore API surface changes:

| Client SDK (current) | Admin SDK (new) |
|---|---|
| `collection(db, "users")` | `db.collection("users")` |
| `query(ref, where(...), orderBy(...))` | `ref.where(...).orderBy(...)` |
| `getDocs(q)` | `ref.get()` |
| `doc(db, "users", id)` | `db.collection("users").doc(id)` |
| `getDoc(docRef)` | `docRef.get()` |
| `Timestamp.fromDate(d)` | `admin.firestore.Timestamp.fromDate(d)` |
| `toDate(ts)` | `ts.toDate()` (same) |

Functions to port (all from `lib/firestore-queries.ts`):
- `fetchUsers`, `fetchUserById`
- `fetchUserConversations`, `fetchConversations`, `fetchConversationMessages`
- `fetchChatSessionMessages`, `fetchUserChatSessions`, `fetchChatConversations`
- `fetchAppEvents`, `fetchBubbleEvents`
- `fetchTrackingEntries`, `fetchTrackingSessions`, `fetchTrackingMetrics`
- `fetchPhotos`
- `fetchOverviewMetrics`, `fetchSessionsForActivity`
- `calculateRetentionCurve`, `fetchRetentionData`
- `fetchLastLoginsForUsers`, `fetchLastActivitiesForUsers`, `fetchUserDailySessionTimes`
- `fetchAllConversationMessages`, `fetchTrackingForMeals`
- Helper: `dateRangeConstraints` (adapt to admin syntax)

---

## Step 3: Wire up API routes (existing files, replace mock data)

API routes already exist with the right structure and TODO comments. Replace mock data with real Admin SDK queries.

**Files to update:**

| Route file | Query functions to use |
|---|---|
| `app/api/users/route.ts` | `fetchUsers` |
| `app/api/users/[userId]/route.ts` | `fetchUserById`, `fetchTrackingEntries`, `fetchLastActivitiesForUsers` |
| `app/api/metrics/overview/route.ts` | `fetchOverviewMetrics` |
| `app/api/chats/route.ts` | `fetchConversations`, `fetchChatConversations` |
| `app/api/chats/[conversationId]/messages/route.ts` | `fetchConversationMessages` |
| `app/api/events/app/route.ts` | `fetchAppEvents` |
| `app/api/events/bubbles/route.ts` | `fetchBubbleEvents` |

**New API routes to create:**

| Route | Query functions |
|---|---|
| `app/api/tracking/route.ts` | `fetchTrackingMetrics`, `fetchTrackingEntries`, `fetchTrackingSessions` |
| `app/api/photos/route.ts` | `fetchPhotos` |
| `app/api/retention/route.ts` | `calculateRetentionCurve` |
| `app/api/users/sessions/route.ts` | `fetchSessionsForActivity`, `fetchUserDailySessionTimes` |
| `app/api/users/activities/route.ts` | `fetchLastActivitiesForUsers`, `fetchLastLoginsForUsers` |

Each API route:
1. Validates the Firebase ID token from `Authorization: Bearer <token>` header
2. Checks the user's email against `ADMIN_EMAILS` env var
3. Validates query params with zod
4. Calls the admin query function
5. Returns JSON

---

## Step 4: Create `lib/api-client.ts` (new file)

Client-side helper that wraps `fetch()` calls to the API routes:
- Automatically attaches the Firebase ID token as `Authorization: Bearer <token>`
- Handles errors consistently
- One function per API route (e.g., `apiClient.fetchUsers(options)`)

---

## Step 5: Update dashboard pages to use API client

Change all `"use client"` pages to call `apiClient.*` instead of `firestore-queries.*`:

| Page | Current import | New import |
|---|---|---|
| `app/(dashboard)/page.tsx` | `fetchOverviewMetrics, fetchSessionsForActivity, ...` | `apiClient.fetchOverviewMetrics(...)` |
| `app/(dashboard)/users/page.tsx` | `fetchUsers, fetchLastLoginsForUsers, ...` | `apiClient.fetchUsers(...)` |
| `app/(dashboard)/users/[userId]/page.tsx` | `fetchUserById, fetchTrackingEntries` + direct firebase imports | `apiClient.fetchUser(...)` |
| `app/(dashboard)/chats/page.tsx` | `fetchConversations` | `apiClient.fetchConversations(...)` |
| `app/(dashboard)/chats/[conversationId]/page.tsx` | `fetchConversationMessages` + direct firebase imports | `apiClient.fetchMessages(...)` |
| `app/(dashboard)/events/page.tsx` | `fetchAppEvents, fetchBubbleEvents` | `apiClient.fetchAppEvents(...)` |
| `app/(dashboard)/tracking/page.tsx` | `fetchTrackingMetrics` | `apiClient.fetchTrackingMetrics(...)` |
| `app/(dashboard)/photos/page.tsx` | `fetchPhotos` | `apiClient.fetchPhotos(...)` |
| `app/(dashboard)/users-analytics/page.tsx` | `fetchUsers` | `apiClient.fetchUsers(...)` |
| `app/(dashboard)/gamification/page.tsx` | `fetchUsers` | `apiClient.fetchUsers(...)` |
| `app/(dashboard)/routines/page.tsx` | Direct firebase imports | `apiClient.fetchRoutines(...)` |

---

## Step 6: Simplify auth

**`components/providers/auth-provider.tsx`:**
- Remove custom claim check (lines 143-151)
- Change `isAdmin()` check to email-based: `NEXT_PUBLIC_ADMIN_EMAILS=support@myendora.health`
- Keep Google sign-in as-is (no change to UX)

**`.env`:**
- Replace `NEXT_PUBLIC_ADMIN_UIDS=3Yz6itvHmeYcOSONeAwfVXQBbEv2` with `NEXT_PUBLIC_ADMIN_EMAILS=support@myendora.health`
- Update `SERVICE_ACCOUNT_PATH=secrets/lotus-9663d-ceb58f42049b.json`

**`lib/firebase.ts`:**
- Remove `ADMIN_UIDS` export and `isAdmin()` function
- Add `ADMIN_EMAILS` export and `isAdminEmail(email)` function
- Keep all client-side Firebase Auth exports (signIn, signOut, onAuthChange)
- Remove re-exports of Firestore query primitives (collection, query, where, etc.) — no longer needed client-side

---

## Step 7: Update CLAUDE.md

Update `CLAUDE.md` with:
- New architecture description (server-side Admin SDK, no dependency on lotus-firebase rules)
- Architecture diagram showing the data flow
- How auth works (Google sign-in + email allowlist, no custom claims)
- Key commands for local dev and deployment
- Service account setup instructions for new developers
- Explanation that `lotus-mobile/lotus-firebase` is NOT a dependency

Include this architecture diagram:

```
  Mobile App (Endora)                    Dashboard (Next.js)
  ==================                    ===================

  React Native app                      Browser (charts, tables)
       |                                      |
       | Firebase Client SDK                  | fetch("/api/...")
       | (user's auth token)                  |
       |                                      v
       v                               Next.js API Routes
  ┌─────────────┐                      (server-side)
  │  FIRESTORE  │                            |
  │             │                            | Firebase Admin SDK
  │  Security   │<------ FRONT DOOR          | (service account key)
  │  Rules      │        (rules apply)       |
  │  apply      │                            |
  │             │                            v
  │             │<------ BACK DOOR ----  Admin SDK
  │             │        (rules IGNORED)  read-only
  └─────────────┘

  Rules managed in:                    Service account:
  lotus-mobile/lotus-firebase/         endora-dashboard-readonly
  (NOT touched by dashboard)           (Cloud Datastore Viewer role)
```

Update the following sections in CLAUDE.md:
- **Architecture > Data Flow**: Replace "All data is fetched client-side from Firestore" with server-side API route description
- **Auth**: Replace UID-based admin with email-based admin
- **Key Files**: Add `lib/firebase-admin.ts`, `lib/firestore-admin-queries.ts`, `lib/api-client.ts`
- **Commands**: Add `SERVICE_ACCOUNT_PATH` setup instructions
- **Important Patterns**: Add "All Firestore queries go through API routes via Admin SDK"
- **Gotchas**: Remove notes about `setAdmin.js` and custom claims

---

## Step 8: Cleanup

- Delete `lib/firestore-queries.ts` (replaced by `lib/firestore-admin-queries.ts`)
- Delete `firebase/setAdmin.js` (no longer needed)
- Delete `firebase/firestore.rules` (dashboard no longer needs its own rules)
- Delete `secrets/lotus-9663d-firebase-adminsdk-fbsvc-da2a1cd525.json` (old full-access service account, replaced by read-only one)
- Empty `firebase.json` is already `{}` — keep as-is
- Remove all `"use client"` imports of `firebase/firestore` from page files

---

## Files Summary

| Action | File |
|---|---|
| **CREATE** | `lib/firebase-admin.ts` |
| **CREATE** | `lib/firestore-admin-queries.ts` |
| **CREATE** | `lib/api-client.ts` |
| **CREATE** | `app/api/tracking/route.ts` |
| **CREATE** | `app/api/photos/route.ts` |
| **CREATE** | `app/api/retention/route.ts` |
| **CREATE** | `app/api/users/sessions/route.ts` |
| **CREATE** | `app/api/users/activities/route.ts` |
| **MODIFY** | `app/api/users/route.ts` (replace mock with real queries) |
| **MODIFY** | `app/api/users/[userId]/route.ts` (replace mock) |
| **MODIFY** | `app/api/metrics/overview/route.ts` (replace mock) |
| **MODIFY** | `app/api/chats/route.ts` (replace mock) |
| **MODIFY** | `app/api/chats/[conversationId]/messages/route.ts` (replace mock) |
| **MODIFY** | `app/api/events/app/route.ts` (replace mock) |
| **MODIFY** | `app/api/events/bubbles/route.ts` (replace mock) |
| **MODIFY** | `components/providers/auth-provider.tsx` (simplify auth) |
| **MODIFY** | `lib/firebase.ts` (remove Firestore re-exports, email-based admin) |
| **MODIFY** | `.env` (ADMIN_EMAILS instead of ADMIN_UIDS) |
| **MODIFY** | All 11 page files under `app/(dashboard)/` (use apiClient) |
| **DELETE** | `lib/firestore-queries.ts` |
| **DELETE** | `firebase/setAdmin.js` |
| **DELETE** | `firebase/firestore.rules` |
| **NOT TOUCHED** | Everything in `lotus-mobile/lotus-firebase/` |

---

## Verification

1. Create the read-only service account in Google Cloud Console
2. Run `npm run dev` and sign in with Google
3. Verify each dashboard page loads real data from Firestore
4. Check browser Network tab: all data requests go to `/api/*` routes, no direct Firestore calls
5. Run `npm run build` to verify no build errors
6. Deploy to Vercel with `FIREBASE_SERVICE_ACCOUNT` env var
7. Verify production dashboard works
8. Deploy a Firestore rules change from `lotus-firebase` and confirm dashboard still works (the decoupling test)
