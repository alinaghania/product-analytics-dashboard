# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with this codebase.

## Commands

- `npm run dev` - Start dev server (uses `next dev --webpack`)
- `npm run build` - Production build (TypeScript errors are ignored via `next.config.mjs`)
- `npm run lint` - ESLint
- `npm run postinstall` - Runs `scripts/fix-firebase-exports.mjs` (runs automatically after `npm install`)
- `firebase deploy --only firestore:rules` - Deploy Firestore rules

## Architecture

Next.js 16 App Router with React 19. All pages are client-side rendered ("use client"). UI uses shadcn/ui (Radix primitives + Tailwind 4). Charts use Recharts.

### Data Flow

**All data is fetched client-side from Firestore** via functions in `lib/firestore-queries.ts`. The API routes under `app/api/` contain only mock/placeholder data and are NOT used by the app.

### Auth

Google Sign-In via Firebase Auth. Admin access requires either a custom claim (`admin: true`) OR inclusion in the `ADMIN_UIDS` env var allowlist (checked in `lib/firebase.ts`). `AuthProvider` (`components/providers/auth-provider.tsx`) wraps the entire app in `app/layout.tsx`.

### React Query

`QueryProvider` (`components/providers/query-provider.tsx`) sets all auto-refresh off globally:
- `refetchOnWindowFocus: false`, `refetchOnMount: false`, `refetchOnReconnect: false`
- `staleTime: Infinity`, `retry: false`
- Data is fetched manually, not auto-refreshed

## Key Files

- `lib/firebase.ts` - Firebase init, auth helpers, `ADMIN_UIDS`, `isAdmin()`
- `lib/firestore-queries.ts` - All Firestore data fetching functions
- `lib/types.ts` - TypeScript types for all data models
- `components/providers/auth-provider.tsx` - Auth context and login/access-denied screens
- `components/providers/query-provider.tsx` - React Query client config
- `app/(dashboard)/layout.tsx` - Dashboard layout with sidebar
- `app/(dashboard)/page.tsx` - Overview dashboard
- `firebase.json` - Points to `firebase/firestore.rules`
- `firebase/setAdmin.js` - Script to set admin custom claims
- `next.config.mjs` - `ignoreBuildErrors: true`, unoptimized images

## Firestore Collections

`users`, `tracking_sessions`, `tracking`, `chat_conversations` (subcollection: `messages`), `app_events`, `bubble_events`, `photos`

## Important Patterns

- All Firestore queries go in `lib/firestore-queries.ts` - never query Firestore directly from components
- Firestore timestamps must be converted with `toDate()` helper (from `lib/firebase.ts`)
- Date handling uses `date-fns` with `date-fns-tz` for Europe/Paris timezone
- Pages are organized under `app/(dashboard)/` route group

## Gotchas

- TypeScript build errors are **ignored** (`ignoreBuildErrors: true` in `next.config.mjs`)
- No test suite exists
- API routes (`app/api/`) are mock-only stubs - all real data comes from client-side Firestore queries
- The `postinstall` script patches Firebase SDK exports - run `npm install` if Firebase imports break
