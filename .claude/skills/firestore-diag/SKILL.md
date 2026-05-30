---
name: firestore-diag
description: Run the repo's read-only Firestore diagnostic scripts (scripts/diag-*.mjs) to inspect the data behind the dashboard — event catalogs, onboarding/registration fields, per-user deep dives, and food-trial analysis. Use when investigating what data actually exists in Firestore, debugging a dashboard metric/query, verifying a collection's shape or field population, or inspecting a single user. All scripts are read-only (Viewer-only service account).
---

# Firestore diagnostics

Read-only scripts that query Firestore via the Admin SDK (bypassing security
rules) to answer "what does the data actually look like?" — the questions that
come up when building or debugging dashboard queries in
`lib/firestore-admin-queries.ts`.

## Prerequisites

- `.env` must define `SERVICE_ACCOUNT_PATH` pointing to the service-account key
  (e.g. `secrets/lotus-9663d-ceb58f42049b.json`). All scripts load `.env` and
  read that key. The account is **Viewer-only — these scripts never write.**
- `test-user-detail.mjs` additionally needs a running dev server
  (`npm run dev`) and `NEXT_PUBLIC_FIREBASE_API_KEY` in `.env`.
- Output is printed to stdout. Pipe to a file if you want to keep it.

## Which script answers which question

| Question | Script |
|---|---|
| What `app_events` / `bubble_events` exist, event names, sample docs, `daily_engagement`? | `diag-app-open.mjs` |
| Which onboarding/`registrationData` fields are populated, and value distributions? | `diag-onboarding.mjs` |
| Everything about **one** user (which collections/subcollections hold their data)? | `diag-tracking.mjs <userId>` |
| One user's onboarding/symptom fields specifically? | `diag-onboarding.mjs <userId>` |
| Food-trials usage across all users | `analyze-food-trials.mjs` |
| Does the `/api/users/[userId]/full` route still return the right shape? | `test-user-detail.mjs` |

## Commands

```bash
# Aggregate / collection-wide (no arguments)
node scripts/diag-app-open.mjs             # app_events/bubble_events names + sample docs
node scripts/diag-onboarding.mjs           # registrationData field survey (all users)
node scripts/analyze-food-trials.mjs       # foodTrials subcollection analysis

# Per-user — userId is REQUIRED (see note below)
node scripts/diag-tracking.mjs <userId>    # deep dive: doc, collections, subcollections
node scripts/diag-onboarding.mjs <userId>  # one user's onboarding/symptom fields

# API smoke test — needs `npm run dev` running first
node scripts/test-user-detail.mjs
```

## Rules

- **Never hardcode a real `userId`** in a committed script — always pass it as a
  CLI argument (`process.argv[2]`). Real user identifiers are PII and must not
  enter git history. `diag-tracking` / `diag-onboarding` already require/accept
  the id as an argument; follow that pattern for any new diagnostic.
- Keep new diagnostics **read-only** — the service account has no write access,
  and these scripts exist to observe, not mutate.
- Find a userId to test with using one of the aggregate scripts, or the
  `/users` page in the dashboard.
