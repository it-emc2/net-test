# OC Rewrite — Decision Log (ADR)

Status: `ACCEPTED` = decided · `PROPOSED` = needs owner OK before it goes live · `OPEN` = not decided.
Every rewrite session reads this first. Never silently change an ACCEPTED decision.

| # | Decision | Status | Date |
|---|---|---|---|
| 001 | Production DB is never written by rewrite work | ACCEPTED | 2026-11-04 |
| 002 | Keep MongoDB; existing collections/fields/documents untouched | ACCEPTED | 2026-11-04 |
| 003 | Stack: TypeScript end-to-end (Option B) | ACCEPTED | 2026-11-04 |
| 004 | UI behaviour parity with current OC | ACCEPTED | 2026-11-04 |
| 005 | Nothing reaches `main` without owner approval | ACCEPTED | 2026-11-04 |
| 006 | Deal URLs `/deal/:dealId` | ACCEPTED (requirement) | 2026-11-04 |
| 007 | One draft per deal + revision history in NEW collections | ACCEPTED (owner) | 2026-11-04 |
| 008 | Documents via Gotenberg | PROPOSED | 2026-11-04 |
| 009 | Self-hosting target | PROPOSED | 2026-11-04 |
| 010 | App DB user least-privilege (replace `atlasAdmin`) | PROPOSED | 2026-11-04 |
| 011 | HMS / WD offer types: drop from the new app | ACCEPTED (owner) | 2026-11-04 |
| 012 | Concrete v2 toolchain (React, versions, layout) | ACCEPTED | 2026-11-04 |
| 013 | Pricing port strategy: 1:1 mechanical port, then tighten | ACCEPTED | 2026-11-04 |
| 014 | Fix both AH restore bugs in v2 | ACCEPTED (owner) | 2026-11-04 |
| 015 | API contract rules for the backend port | ACCEPTED | 2026-11-04 |
| 016 | Fix B-1: customers without customer number | ACCEPTED (owner) | 2026-11-05 |

---

## 001 — Production DB is never written
- Dev/test only against the local replica (`scripts/replica/`, `127.0.0.1:27018`).
- Prod access only via read-only Atlas user (`rewriteUser`, role `readAnyDatabase`), guarded by `guard-readonly.mjs` before every use.
- Mongoose `autoIndex` is a hidden write → must be `false` for any connection that could ever reach prod.
- Config refuses to start in dev/test if the DB URI is not localhost.

## 002 — Keep MongoDB, data untouched
- `Offer.payload`, `Draft.payload`, `Customer.kundendaten` etc. are `Mixed`; old documents must load unchanged.
- New code *describes* old shapes (TS types + Zod with `.passthrough()`); it never rewrites old docs.
- Collection names are kept exactly (incl. custom ones like `ProductsHassman`, `net_signing_requests`).
- New features may add **new** collections only (see 007).

## 003 — Stack
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language browser+server; pricing must run offline in browser |
| Runtime | Node 24 LTS | Current LTS |
| Backend | Fastify | Simple, fast, schema-first, easy to self-host |
| DB | Mongoose 8 (same schemas) + Zod | Zero data migration |
| Frontend | Vite SPA (Vue 3 or React — decided in phase 2 spike) + Workbox PWA | Offline/iPad shell stays |
| Shared | `packages/pricing` (pure TS) used by server + browser | Single source of truth |
| Tests | Vitest (unit), Playwright (E2E parity), golden-master (pricing + PDFs) | Parity proof |
| Logging | pino (JSON) + self-hosted GlitchTip (Sentry-compatible) | Every error logged with context |
| Monorepo | npm workspaces: `apps/server`, `apps/web`, `packages/*` | |

## 004 — UI parity
- Feature inventory (`FEATURE-INVENTORY.md`) is the checklist.
- Playwright tests are written against the **current** app first, then must pass on the new app.
- UX simplifications for elderly users (larger controls, autosave, fewer steps) are allowed only where the function stays the same; each one is listed in `UX-CHANGES.md` for owner sign-off.

## 005 — Release gate
- Push to `main` auto-deploys to Fly.io today. Rewrite lives on its own branch; merge only with explicit owner OK.
- `main` is watched daily (`oc-main-watcher` → `~/emc2-local/main-sync/`); every HIGH/MED change goes into the parity list.

## 006 — Deal URLs
- `/deal/:dealId` opens (or creates) the deal's draft directly; deep-linkable from Bitrix24.
- Additional: `/offer/:offerNumber` (read-only view of a sent offer).

## 007 — One draft per deal + revision history (ACCEPTED by owner, 2026-11-04)
- New collections: `deal_drafts` (current state, unique `dealId`) and `deal_draft_revisions` (append-only: who (initials/user id), when, changed fields as JSON patch, full snapshot every N revisions, restore pointer).
- Old `drafts` / `offers` stay exactly as they are and remain readable; a read-only view lists legacy drafts/offers per deal (link via `payload.auftragId` and the existing `by-deal` lookup) and can **copy** one into the new deal draft — the legacy document is never modified.
- Saving = autosave into the deal draft (+ revision); "Schnellspeichern"/"Speichern unter" go away in v2 (UX-CHANGES U-002).
- Offer numbers/locked offers keep today's semantics: sending still writes an immutable `offers` document (unchanged collection and fields).
- Production writes to the new collections happen only through v2 after cut-over (phase 8). Until then they exist only in the local replica / test DBs.
- **Implemented 2026-11-04** (`v2/apps/server/src/deal-drafts/`): `PUT /api/deals/:dealId/draft` (optimistic concurrency via `baseRevision` → 409 on conflict, unchanged payload = no revision), `GET …/draft`, `GET …/draft/revisions[/:rev]`, `POST …/draft/restore`, `POST …/draft/import` (legacy draft/offer copied, original untouched). Revisions store a JSON patch, plus a full snapshot at rev 1 and every 20 revisions. Indexes (`dealId` unique; `dealId+revision` unique) only via explicit `migrateDealDraftIndexes()` — never at boot.
- Known limitation: draft update and revision insert are two writes (the in-memory test DB has no transactions). `payloadAt` detects gaps; wrap both in a transaction on the replica-set deployment before cut-over (tracked in ROADMAP phase 8).

## 008 — Documents via Gotenberg (PROPOSED)
- Replace Puppeteer + LibreOffice + LaTeX (+ Adobe where possible) by one Gotenberg container (HTML→PDF, DOCX→PDF).
- Keep docxtemplater for DOCX templates. Gate: golden-master PDF comparison per document type.

## 009 — Self-hosting (PROPOSED)
- Docker Compose; Coolify or Dokploy as PaaS; Caddy for TLS; German VPS (Hetzner) or on-prem.
- Phase 1: app self-hosted, DB stays on Atlas. Phase 2 (optional): MongoDB 8 replica set self-hosted + nightly off-site `mongodump`.

## 010 — Least-privilege app user (PROPOSED)
- Live app currently connects as `atlasAdmin` (full cluster admin). Replace with `readWrite@KonfiguratorDB` + `read@vigor`.
- Owner action in Atlas; no code change needed except env.

## 011 — HMS / WD dropped from the new app (ACCEPTED by owner, 2026-11-04)
- Facts: pages reuse AH field ids, no pricing logic anywhere, zero HMS/WD offers/drafts in production (`DATA-SHAPES.md`).
- v2 has no HMS/WD tiles, pages or pricing. The current app on `main` is not changed by this decision.
- Reading stays tolerant: legacy resolvers in `@oc/domain` still recognise `hms`/`wd` so any old document would load (none exist).
- Parity: HMS/WD navigation snapshots remain as documentation of the current app but are not a v2 requirement (UX-CHANGES U-001).

## 012 — Concrete v2 toolchain (ACCEPTED, technical — owner may override)
| Choice | Decision | Why |
|---|---|---|
| Location | `v2/` = own npm workspace (own lockfile) | Current app, its Dockerfile and deploy stay untouched; no lockfile churn on `main` |
| Frontend framework | **React 19 + React Router 8 + Vite 8** | Largest ecosystem and hiring/AI-tooling pool; data router fits URL-first navigation (ADR 006); Vue would also work — no hard blocker either way |
| Backend | Fastify 5, pino 10, Mongoose 8 | ADR 003 |
| Validation | zod 4 (`looseObject` for reads, strict for new writes) | ADR 002: reads never reject old docs |
| TypeScript | 5.9 (not 7 yet) | TS 7 (native compiler) is new; adopt once lint/editor tooling caught up — mechanical upgrade |
| Tests | Vitest 5 (all packages), Testing Library, mongodb-memory-server; Playwright parity suite stays at repo root | One runner for v2 |
| Node | ≥ 24 LTS | CI uses 24 |
| Error tracking | reporter hook in `buildApp`; GlitchTip SDK wired with self-hosting (ADR 009) | No external service before hosting is decided |
| Legacy rule duplicates | Kept as separately named functions (e.g. three offer-type resolvers) | Parity first; consolidation = explicit future ADR |

## 013 — Pricing port strategy (ACCEPTED)
- **Stage 1 (done):** `v2/packages/pricing/src/core.ts` = legacy `pricing-core.js` (main@dad76f0) with type annotations only; package compiles with `strict:false`. Diff to legacy is reviewed: 7 annotation lines + header.
- **Proof of equivalence:** (a) golden master 117/117 on the TS port; (b) differential test legacy JS vs TS: 20 seeded mutations × 115 real cases = 2,300 comparisons of result, mutated input and fingerprint; (c) mutation sanity check — a planted 1-cent rounding bug fails 218/232 tests.
- **Legacy quirks kept:** input payload is mutated; three offer-type resolvers; hard-coded fallbacks next to `CONFIG_SCHEMA`. Changing any of them = rule change → golden rebuild + ADR.
- **Stage 2 (done 2026-11-04):** whole package `strict:true`. Every typing step proven type-only by `v2/scripts/compare-emit.mjs` (types erased → JS byte-identical to the previous commit), plus golden + differential green. Rule stays: no logic edits in typing commits.
- **Sync with main:** when `oc-main-watcher` reports a change to `src/logic/pricing-core.js`, re-port the diff into `core.ts` and update the source commit in the header; the differential test fails until both match.

## 014 — Fix both AH restore bugs in v2 (ACCEPTED by owner, 2026-11-04)
- #1 Saved travel zone is used when no travel time is stored → travel/Anfahrt billed again.
- #2 Older AH format (schedules nested in task objects) is read: schedules lifted to service level, task ids kept.
- Implementation: `ahInputFromPayload(payload, config)` = fixed (v2 default); `ahInputFromPayloadLegacy` keeps the old behaviour and is still tested against all 144 real restores, so the fixes provably change only the affected cases.
- Effect in the real sample: 1 offer + 2 drafts 298.13 € → 386.01 € (zone 3); 1 draft 0 € → 184.92 €. All other 140 cases unchanged.
- Sent (locked) offers keep their stored documents/prices; this only affects what the app computes when an AH offer is re-opened. The current app on `main` is unchanged.
- Assumption for #2: each nested task schedule counts as its own visit (same as top-level schedules). Only 1 draft affected.

## 015 — API contract rules for the backend port (ACCEPTED, technical)
- **Success responses identical to legacy** (same fields, same values) — proven per endpoint by `v2/apps/server/test/contract.test.ts`, which runs the legacy Express app as a real process and v2 against the same in-memory DB.
- **Errors:** unified v2 format `{ error: { code, message, requestId } }`; status code and German `message` identical to legacy's `{ error: "<message>" }`.
- **Sessions:** token/cookie format unchanged; with the same `AUTH_SECRET` a legacy session is valid in v2 (tested) → cut-over without re-login.
- **Security fixes by design (intentional differences, tested):** every route private unless `config.public`; admin routes via one role check (`config.admin`); `/admin/api/config/public` requires a login; no path-pattern allowlist (no case/slash/suffix bypass); user search input escaped before RegExp; production refuses to start without a real `AUTH_SECRET`.

## 016 — Fix B-1: customers without customer number (ACCEPTED by owner, 2026-11-05)
- v2 stores a missing `customerNumber` as **absent** instead of `""` (`routes/group3.ts`), so the unique *sparse* index no longer blocks every second customer without number. Contract test proves: legacy → 500, v2 → 200 for any number of such customers; re-saving the same person updates (no duplicate).
- Migration `002-unset-empty-customer-number` (`apps/server/src/migrations/`) removes the one existing `""` value — dry run by default, idempotent, touches only exact `""`; run at cut-over with owner OK after a backup.
- The current app on `main` keeps the bug.

## 017 — Integrations behind replaceable clients; real systems only in production (ACCEPTED, technical, 2026-11-05)
- Every external system gets one client class with injectable transport (`fetch`, clock, sleep) — Bitrix first: `apps/server/src/integrations/bitrix.ts` (same wire format, 1 s global throttle, 4× retry on "Too many requests", failures → `bitrixlogs`, fire-and-forget like legacy).
- **No hard-coded credentials/fallbacks** (legacy had a fallback Bitrix webhook token in code). Missing config → clear error + log entry, never a silent call to production.
- **Guard like ADR 001 for the DB:** outside `NODE_ENV=production` the config refuses a non-local `BITRIX_WEBHOOK_BASE` (tests/dev can never move a real deal). Same rule will apply to SMTP, IMAP, OB24, planning, magic API.
- **Proof:** the contract test points legacy AND v2 at a recording stub (`test/helpers/bitrix-stub.ts`); responses AND the outgoing calls (verb, method, encoded params in order) must be identical.
