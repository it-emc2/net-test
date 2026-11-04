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
- **Stage 2 (open):** tighten to `strict:true` function by function; every step must keep golden + differential green. No logic edits mixed into typing commits.
- **Sync with main:** when `oc-main-watcher` reports a change to `src/logic/pricing-core.js`, re-port the diff into `core.ts` and update the source commit in the header; the differential test fails until both match.
