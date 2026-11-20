# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with this codebase.

## Commands

- `npm run dev` - Start dev server (uses `next dev --webpack`)
- `npm run build` - Production build (TypeScript errors are ignored via `next.config.mjs`)
- `npm run lint` - ESLint
- `npm run postinstall` - Runs `scripts/fix-firebase-exports.mjs` (runs automatically after `npm install`)

### Local Dev Setup

1. Place a Firebase service account key at `secrets/lotus-9663d-ceb58f42049b.json`
2. Set `SERVICE_ACCOUNT_PATH=secrets/lotus-9663d-ceb58f42049b.json` in `.env`
3. Set `ADMIN_EMAILS=your@email.com` in `.env` (server-only — never `NEXT_PUBLIC_`)
4. Run `npm install && npm run dev`

### Production (Cloud Run)

Hosted on Cloud Run (project `lotus-9663d`, europe-west1), infra in Terraform — runbook in `infra/README.md`. Vercel is no longer used (its deploy workflow and `vercel.json` were removed).

- Deploy: push to `main` → `.github/workflows/deploy-cloudrun.yml` builds the Docker image and deploys it (keyless, Workload Identity Federation)
- The service runs **keyless** as `endora-dashboard-readonly`: `lib/service-account.ts` only allows Application Default Credentials when `K_SERVICE` is set (Cloud Run) — never locally, where ADC points to an unrelated account
- Config: non-secret env vars (`ADMIN_EMAILS`, …) in `infra/terraform/terraform.tfvars` (git-ignored, the repo is public); secrets in Secret Manager (`endora-dashboard-*`)
- Terraform always runs through `infra/terraform/tf.sh` (authenticates as support@myendora.health)
- Every resource is labelled `app=endora-dashboard`; `infra/terraform/teardown.sh` deletes the whole stack

### Server cache (cost control)

`lib/server-cache.ts` caches API results until midnight Europe/Paris, shared by every admin: process memory, then the bucket `CACHE_BUCKET` (set on Cloud Run only, so local runs never write to it). Entries are namespaced by Cloud Run revision (a deploy starts empty); the cache is off under `next dev`.

- New GET routes for non-Overview pages: wrap the computation in `cachedJson(request, scope, key, compute)` — `key` = the parsed params in a stable order, `compute` must throw on failure (errors are never cached); `cacheIf` keeps partial results out
- Server-side data reused across requests (LLM corpus, agent tools): `cachedValue(scope, key, compute)` — the value goes through JSON, so no `Date`/`Map`/Timestamp in it
- Never cached: Overview data (live by design; only `/api/retention` is cached, once its activity window is over), reads of the `dashboard` database (admins write to it — e.g. the users list with the `contacted` filter), auth, writes
- `?fresh=1` recomputes. Client side (`lib/data-freshness.ts`): reload buttons (Header, ChartCard, KpiCard, DataTable, ConversationViewer) send it for the requests whose data the page already shows — so a reload handler must call its `refetch()`es before any `await` — while data the page never loaded still comes from the cache; the Header shows the cache date. `RequestOptions.fresh` overrides it: the Overview passes `{ fresh: true }` on routes it shares with cached pages and `{ fresh: false }` for the retention curve

## Architecture

Next.js 16 App Router with React 19. All pages are client-side rendered ("use client"). UI uses shadcn/ui (Radix primitives + Tailwind 4). Charts use Recharts.

```
  Mobile App (Endora)                    Dashboard (Next.js)
  ==================                    ===================

  React Native app                      Browser (charts, tables)
       |                                      |
       | Firebase Client SDK                  | fetch("/api/...")
       | (user's auth token)                  |
       |                                      v
       v                               Next.js API Routes
  +-----------+                        (server-side)
  | FIRESTORE |                              |
  |           |                              | Firebase Admin SDK
  | Security  |<------ FRONT DOOR           | (service account key)
  | Rules     |        (rules apply)         |
  | apply     |                              |
  |           |                              v
  |           |<------ BACK DOOR ----  Admin SDK
  |           |        (rules IGNORED)  read-only
  +-----------+

  Rules managed in:                    Service account:
  lotus-mobile/lotus-firebase/         endora-dashboard-readonly
  (NOT touched by dashboard)           (Cloud Datastore Viewer role)
```

### Data Flow

**All data flows through server-side API routes** using Firebase Admin SDK:

1. Browser pages call `lib/api-client.ts` functions (which call `/api/*` routes)
2. API routes (`app/api/`) validate the Firebase ID token + check admin email
3. API routes call `lib/firestore-admin-queries.ts` (Admin SDK, bypasses Firestore rules)
4. Data is returned as JSON to the browser

The dashboard is **completely decoupled** from the mobile app's Firestore security rules. Changes to rules in `lotus-mobile/lotus-firebase` do NOT affect the dashboard.

### Auth

Google Sign-In via Firebase Auth. Admin access is email-based: the user's email must be in the server-only `ADMIN_EMAILS` env var (comma-separated). No custom claims or UID allowlists needed.

- Server side (the real gate): `verifyAuth()` in `lib/firebase-admin.ts` verifies the ID token, requires `sign_in_provider === "google.com"` AND `email_verified === true`, then checks the email against `ADMIN_EMAILS`. Never trust the `email` claim alone — anyone can create an unverified email/password account with an admin's address.
- Client side (UX only): `AuthProvider` calls `GET /api/auth/me` (`fetchAdminSession()`) — 200 = admin, otherwise the access-denied screen. The allowlist is never shipped to the browser.

### React Query

`QueryProvider` (`components/providers/query-provider.tsx`) sets all auto-refresh off globally:
- `refetchOnWindowFocus: false`, `refetchOnMount: false`, `refetchOnReconnect: false`
- `staleTime: Infinity`, `retry: false`
- Data is fetched manually, not auto-refreshed

### Onboarding journal

The Onboarding page reads the journal the mobile app writes since 0.1.12 (`onboarding_sessions` + `onboarding_events`), in three steps:

1. `GET /api/onboarding/journal?from&to` reads the journeys started in the range (`fetchOnboardingSessions`), then their events 240 journeys at a time (`fetchOnboardingEvents`), and reduces each batch to one `Journey` per session (`lib/onboarding-journal/digest.ts`, server-only). Cached per date range.
2. The browser filters and aggregates the journeys (`report.ts`, `moments.ts`, `segments.ts`, `insights.ts`): a filter or a parcours never calls the server. Only the period does, and the comparison (one more call, for the period just before).
3. `components/onboarding/` renders one tab per way of looking at them.

- Statistics only count journeys the journal covers from their first screen (`coverage: "full"`); the others stay visible in the Sessions tab
- Screens are discovered from the data, never hardcoded: a new or moved screen shows up by itself. Their order is what the journeys agree on pair by pair (`flowOrder` in `report.ts`): a logged `stepIndex` only compares within a journey, since conditional screens shift it
- Their texts (question, options) come from `lib/onboarding-journal/catalog.json`, generated from the app: after a change of the app's onboarding, run `node scripts/generate-onboarding-catalog.mjs <path to a lotus-mobile checkout>`. A screen missing from the catalog is shown under its raw id
- An answer is what was validated on its screen (`StepVisit.answer`), not what sits in `answers` of the session: the form also keeps a value picked and never validated. On a single choice the first logged value is the pick: the app may log after it values it derives from it (`chosenOptions` in `report.ts`)
- The journal is not read literally: `digest.ts` reads through what the app logs oddly (a failed Apple/Google sign-in is a `register_cancel` followed by a `register_error`; `hold_cancel` is logged again after `hold_complete`; `registeredAt` is rewritten by every later sign-in; a `session_start` can follow the end of the onboarding; a lost batch can drop a `step_view`). Before trusting a new figure, recount it from raw events
- The "Profil des inscrites" tab is the older view: answers stored in `users.registrationData`, all time (`/api/metrics/onboarding`)

## Key Files

- `lib/firebase.ts` - Client-side Firebase init, auth helpers
- `lib/firebase-admin.ts` - Server-side Admin SDK init, `verifyAuth()`, `getAdminDb()`
- `lib/service-account.ts` - Service-account key loading (`FIREBASE_SERVICE_ACCOUNT` / `SERVICE_ACCOUNT_PATH`) and `isCloudRun()`, shared by Firebase Admin and GA4
- `lib/firestore-admin-queries.ts` - All Firestore data fetching functions (server-side, Admin SDK)
- `lib/api-client.ts` - Client-side fetch wrappers for API routes (attaches auth token)
- `lib/api-utils.ts` - Server-side `withAuth()` helper for API route auth
- `lib/server-cache.ts` - Server cache of API results until midnight (memory + bucket), `cachedJson()` / `cachedValue()`
- `lib/data-freshness.ts` - Client side of the cache: per-page cache dates, reload buttons that force `?fresh=1` (state dropped on navigation by `components/dashboard/page-cache-scope.tsx`)
- `lib/types.ts` - TypeScript types for all data models
- `lib/onboarding-journal/` - Onboarding page: journal types, server-side digest, browser-side statistics (see "Onboarding journal")
- `components/providers/auth-provider.tsx` - Auth context and login/access-denied screens
- `components/providers/query-provider.tsx` - React Query client config
- `app/(dashboard)/layout.tsx` - Dashboard layout with sidebar
- `app/(dashboard)/page.tsx` - Overview dashboard
- `next.config.mjs` - `output: "standalone"`, `ignoreBuildErrors: true`, unoptimized images
- `Dockerfile` / `.dockerignore` - Cloud Run image (Next standalone server on port 8080)
- `infra/terraform/` - Cloud Run, Artifact Registry, Secret Manager, GitHub WIF, budget (see `infra/README.md`)

## Dashboard Pages

```
app/(dashboard)/
├── page.tsx                        # Overview dashboard (/)
├── onboarding/page.tsx             # Onboarding tunnel, from the onboarding journal
├── users/page.tsx                  # Users list with data table
├── users/[userId]/page.tsx         # Individual user detail
├── users-analytics/page.tsx        # User analytics deep dive
├── events/page.tsx                 # Event tracking analytics
├── tracking/page.tsx               # Health tracking analytics
├── chats/page.tsx                  # Chat conversations list
├── chats/[conversationId]/page.tsx # Message viewer
├── photos/page.tsx                 # Photo tracking analytics
├── gamification/page.tsx           # Gamification metrics
└── routines/page.tsx               # User routines analytics
```

## Firestore Collections

`users`, `tracking_sessions`, `tracking`, `chat_conversations` (subcollection: `messages`), `app_events`, `bubble_events`, `photos`, `routines`, `onboarding_sessions`, `onboarding_events`

### Dashboard-owned database (`dashboard`)

Besides the mobile app's `(default)` database (read-only for the dashboard), a second **named Firestore database `dashboard`** holds dashboard-owned data. The same service account has write access on it ONLY, via a conditional IAM binding (`roles/datastore.user` with condition `resource.name.startsWith("projects/lotus-9663d/databases/dashboard")`). Access it with `getDashboardDb()` from `lib/firebase-admin.ts`; all queries/writes live in `lib/firestore-dashboard-queries.ts` — the ONLY file allowed to write to Firestore.

- **`user_contacts/{userId}`** — outreach (relance) summary: `lastContactedAt`, `lastChannel: "email"|"phone"`, `lastContactedBy` (admin email), `contactCount`, `updatedAt`
- **`user_contacts/{userId}/entries/{autoId}`** — one doc per contact attempt: `contactedAt`, `channel`, `note`, `contactedBy`, `createdAt`

Churn proxy used by the users list filter: `subscriptionStatus` is only written on RevenueCat subscription events, so `subscriptionStatus` present + `isPremium === false` ≈ "had a subscription/trial, no longer premium". Note: `users.metadata.lastLoginAt` is empty in practice — `metadata.lastLoginDate` (Timestamp) is the populated field.

### Collection Schemas

**`users`** — User accounts and profiles
- `id`, `email`, `username?`, `displayName?`, `createdAt`, `updatedAt`, `birthDate?`
- `metadata`: `{ lastLoginAt?, lastLoginDate?, platform?: "ios"|"android", appVersion?, accountCreatedDate? }`
- `flags`: `{ onboardingCompleted?, registrationCompleted?, registrationStep?, profileCompletion? }`
- `subscriptionStatus?`: `{ isPremium?, source? }`
- `registrationData?`: `{ age?, birthDate?, email?, name?, firstName?, lastName?, username?, deviceInfo? }`

**`tracking_sessions`** — Health tracking sessions (source of truth for DAU/WAU/MAU)
- `id`, `userId`, `startedAt`, `completedAt?`, `durationMs`, `sections: string[]`
- `entryPoint?`, `hasExistingRecord`, `entryMethod?: "manual"|"routine"|"auto"`, `createdAt?`

**`tracking`** — Daily health entries (doc ID: `{userId}_{date}`)
- `id`, `userId`, `date` (YYYY-MM-DD), `completeness` (0-100), `entryMethod?`, `sections?`, `symptoms?`
- `sleep?`: `{ duration, quality }`, `meals?`: `{ calories, water }`, `sport?`: `{ totalDuration, totalCalories }`
- `digestive?`: `{ morningBloated?, eveningBloated?, morningPain?, eveningPain?, bloated?, pain?, time? }`
- `period?`: `{ active, pain, flow }`, `stress?`, `createdAt`, `updatedAt`

**`chat_conversations`** — AI chat sessions
- `id`, `userId`, `messageCount`, `topics?`, `topic?`, `entryPoint?`
- `startedAt?`, `createdAt`, `updatedAt`, `lastMessageAt?`, `lastMessageSnippet?`

**`chat_conversations/{id}/messages`** — Individual messages
- `id`, `conversationId`, `role: "user"|"assistant"|"system"|"endora"`, `agent?`
- `content`, `status?: "success"|"error"|"pending"`, `errorMessage?`, `latencyMs?`, `retryCount?`, `createdAt`
- `feedback?: "up"|"down"|null`, `feedbackAt?` — 👍/👎 left by the user on an assistant answer (current state only; charted on the Ask Conversations page via `/api/chats/feedback`). Read with one query per conversation (`fetchChatFeedbackStats()`): a collection-group query would need an index in the mobile app's Firebase config, which stays untouched

**`app_events`** — Custom app events
- `id`, `userId`, `name`, `screen?`, `platform?`, `appVersion?`, `params?`, `createdAt`

**`bubble_events`** — Screen view/navigation events
- `id`, `userId`, `event`, `screen?`, `viewDurationMs?`, `platform?`, `appVersion?`, `createdAt`

**`photos`** — Photo uploads for visual symptom tracking
- `id`, `userId`, `pain` (0-10), `bloated` (0-10), `time: "morning"|"evening"`, `viewCount`, `timestamp`, `createdAt`

**`onboarding_sessions`** — One record per onboarding journey (app ≥ 0.1.12; doc ID = `sessionId`)
- `sessionId`, `flow: "onboarding"|"reonboarding"`, `status: "in_progress"|"completed"|"registered"`, `platform`, `appVersion`, `lang`, `branch?` (parcours)
- `startedAt`, `completedAt?`, `registeredAt?`, `paywallAt?` (ms, phone clock), `updatedAt` (Timestamp)
- `lastStepId?`, `lastStepType?`, `lastStepIndex?`, `stepCount?`, `screensViewed?`, `activeMs?`, `answers?` (the registration form as filled so far)
- `userId?`, `registerMethod?`, `paywallResult?: "purchased"|"restored"|"cancelled"|"already_premium"`, `screenW?`, `screenH?`, `fontScale?`, `osVersion?`

**`onboarding_events`** — Every action of those journeys (~120 per journey)
- `sessionId`, `name` (`step_view`, `step_leave`, `option_select`, `permission_result`, `register_error`, `paywall_result`… — the list is `ONBOARDING_EVENTS` in lotus-mobile/src/constants/analyticsEvents.ts)
- `t` (ms, phone clock) + `seq` order the events of a journey; `createdAt` (Timestamp, server)
- `stepId?`, `stepType?`, `stepIndex?`, `stepCount?`, `branch?`, `via?`, `value?`, `detail?`, `count?`, `selected?`, `durationMs?`
- `platform`, `appVersion`, `lang`, `flow` on every event; `screenW`, `screenH`, `fontScale`, `osVersion` on `session_start`
- Written by phones and never validated by the dashboard: read every field of both collections defensively

## Important Patterns

- All Firestore queries go through API routes via Admin SDK - never query Firestore directly from client components
- New query functions go in `lib/firestore-admin-queries.ts`, exposed via API routes, consumed via `lib/api-client.ts`
- API routes use `withAuth()` wrapper from `lib/api-utils.ts` for auth + error handling
- Non-Overview GET routes return `cachedJson(...)` from `lib/server-cache.ts` (see "Server cache")
- Date handling uses `date-fns` with `date-fns-tz` for Europe/Paris timezone
- Pages are organized under `app/(dashboard)/` route group
- JSON serialization: Date objects are serialized as ISO strings by API routes; `api-client.ts` converts them back to Date objects

## Post-Task Workflow

After completing any task:
1. Create an agent which is a senior full-stack developer (readability, reuse, best practices) and fix any issues found and make sure the code is clean and maintainable. Refactor if necessary.

## Gotchas

- TypeScript build errors are **ignored** (`ignoreBuildErrors: true` in `next.config.mjs`)
- The `postinstall` script patches Firebase SDK exports - run `npm install` if Firebase imports break
- `lotus-mobile/lotus-firebase` is NOT a dependency - the dashboard bypasses Firestore rules entirely via Admin SDK
- The `secrets/` directory is in `.gitignore` - service account keys are never committed
- Next's standalone build copies `.env` into its output: `.dockerignore` must keep excluding `.env*` and `secrets/` (only the CI-generated `.env.production`, public `NEXT_PUBLIC_*` values, enters the image), plus `gha-creds-*.json`, the credentials file `google-github-actions/auth` writes into the CI workspace (the build cache of this public repo would otherwise carry it)
- `maxDuration` route exports only apply on Vercel; on Cloud Run the request timeout is 600s (`infra/terraform/cloud-run.tf`)
