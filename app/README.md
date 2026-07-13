# EmC² — TypeScript Rebuild (`app/`)

A clean, self-contained TypeScript rebuild of the frontend **and** backend, living
entirely under `app/`. It runs **alongside** the legacy app in `src/` — nothing
outside this folder is touched, and the `v3` production branch is unaffected.

## Stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Frontend | Vite + React + TypeScript, shadcn/ui + Tailwind, PWA          |
| Backend  | Express 5 + TypeScript, Mongoose (reuses the existing MongoDB) |
| Auth     | Existing session cookie (`net_session`) — scrypt + HMAC, ported verbatim |
| Layout   | npm workspaces: `apps/web`, `apps/api`, `packages/shared`     |

Because `authService` and the `User` model are faithful ports and the API reads
the **same** `MONGODB_URI` and `AUTH_SECRET`, existing users log in unchanged and
session tokens are interchangeable with the legacy backend.

## Structure

```
app/
├─ apps/
│  ├─ web/    # React SPA (PWA). Single index.html; reusable components in src/components
│  └─ api/    # Express + TS JSON API
└─ packages/
   └─ shared/ # TypeScript types shared by web + api (@emc2/shared)
```

## Setup

```bash
cd app
npm install
cp apps/api/.env.example apps/api/.env   # then fill in — use the SAME values as
                                         # the legacy .env (MONGODB_URI, AUTH_SECRET)
```

## Run (dev)

Two servers. The web dev server proxies `/api` → the API, so the session cookie
flows automatically.

```bash
# terminal 1 — API on :4000
npm run dev:api

# terminal 2 — web on :5173
npm run dev:web
```

Open http://localhost:5173. Unauthenticated visits redirect to `/login`.

## Build

```bash
npm run build   # shared → api → web (web emits a PWA service worker + manifest)
```

## What exists today (first slice)

- **Login** (`/login`) → `POST /api/auth/login`
- **Home** (`/`) with a persistent, theme-reactive **sidebar**
- **Admin** (`/admin`, role-gated) → `GET /api/admin/summary`
- Theme system ported 1:1: `data-theme` (base/wohnen/gesundheit/pflege/kfz) +
  `data-mode` (light/dark), same `localStorage` keys as the legacy app
- PWA: installable, offline app shell, API calls never cached

`/angebote` and `/kunden` are placeholders — the next slices to migrate.
```
