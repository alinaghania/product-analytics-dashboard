# Product Analytics Dashboard

Internal dashboard for the Endora app. It reads Firestore (read-only) and shows user, retention and activity metrics. Built with Next.js.

## Setup

You need a Firebase service account key and a `.env` file.

1. Put the service account key in `secrets/`.
2. In `.env`, set `SERVICE_ACCOUNT_PATH` (path to that key) and `NEXT_PUBLIC_ADMIN_EMAILS` (your email).
3. Optional: set `GA4_PROPERTY_ID` to show real Google Analytics numbers (otherwise the app falls back to tracking-session metrics).

## Run

```
npm install
npm run dev
```

The app runs on http://localhost:3000. Sign in with a Google account listed in `NEXT_PUBLIC_ADMIN_EMAILS`.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — lint
