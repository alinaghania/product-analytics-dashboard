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
3. Set `NEXT_PUBLIC_ADMIN_EMAILS=your@email.com` in `.env`
4. Run `npm install && npm run dev`

### Production (Vercel)

- Set `FIREBASE_SERVICE_ACCOUNT` env var with the full JSON content of the service account key
- Set `NEXT_PUBLIC_ADMIN_EMAILS` with comma-separated admin emails

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

Google Sign-In via Firebase Auth. Admin access is email-based: the user's email must be in the `NEXT_PUBLIC_ADMIN_EMAILS` env var (comma-separated). No custom claims or UID allowlists needed.

- Client side: `AuthProvider` checks `isAdminEmail(user.email)` from `lib/firebase.ts`
- Server side: API routes verify the Firebase ID token and check email via `verifyAuth()` from `lib/firebase-admin.ts`

### React Query

`QueryProvider` (`components/providers/query-provider.tsx`) sets all auto-refresh off globally:
- `refetchOnWindowFocus: false`, `refetchOnMount: false`, `refetchOnReconnect: false`
- `staleTime: Infinity`, `retry: false`
- Data is fetched manually, not auto-refreshed

## Key Files

- `lib/firebase.ts` - Client-side Firebase init, auth helpers, `ADMIN_EMAILS`, `isAdminEmail()`
- `lib/firebase-admin.ts` - Server-side Admin SDK init, `verifyAuth()`, `getAdminDb()`
- `lib/firestore-admin-queries.ts` - All Firestore data fetching functions (server-side, Admin SDK)
- `lib/api-client.ts` - Client-side fetch wrappers for API routes (attaches auth token)
- `lib/api-utils.ts` - Server-side `withAuth()` helper for API route auth
- `lib/types.ts` - TypeScript types for all data models
- `components/providers/auth-provider.tsx` - Auth context and login/access-denied screens
- `components/providers/query-provider.tsx` - React Query client config
- `app/(dashboard)/layout.tsx` - Dashboard layout with sidebar
- `app/(dashboard)/page.tsx` - Overview dashboard
- `next.config.mjs` - `ignoreBuildErrors: true`, unoptimized images

## Firestore Collections

`users`, `tracking_sessions`, `tracking`, `chat_conversations` (subcollection: `messages`), `app_events`, `bubble_events`, `photos`, `routines`

## Important Patterns

- All Firestore queries go through API routes via Admin SDK - never query Firestore directly from client components
- New query functions go in `lib/firestore-admin-queries.ts`, exposed via API routes, consumed via `lib/api-client.ts`
- API routes use `withAuth()` wrapper from `lib/api-utils.ts` for auth + error handling
- Date handling uses `date-fns` with `date-fns-tz` for Europe/Paris timezone
- Pages are organized under `app/(dashboard)/` route group
- JSON serialization: Date objects are serialized as ISO strings by API routes; `api-client.ts` converts them back to Date objects

## Gotchas

- TypeScript build errors are **ignored** (`ignoreBuildErrors: true` in `next.config.mjs`)
- No test suite exists
- The `postinstall` script patches Firebase SDK exports - run `npm install` if Firebase imports break
- `lotus-mobile/lotus-firebase` is NOT a dependency - the dashboard bypasses Firestore rules entirely via Admin SDK
- The `secrets/` directory is in `.gitignore` - service account keys are never committed
