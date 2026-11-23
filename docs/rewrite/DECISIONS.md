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
- Implemented 2026-11-06 (6b): `/deal/<id>[/<step>]` is the entry link; the server redirects to `/?deal=<id>[#step]` because today's `index.html` loads its files with relative paths (the app must run at `/`). The address bar then shows `/?deal=<id>#<step>`.
- Additional: `/offer/:offerNumber` (read-only view of a sent offer).

## 007 — One draft per deal + revision history (ACCEPTED by owner, 2026-11-04)
- New collections: `deal_drafts` (current state, unique `dealId`) and `deal_draft_revisions` (append-only: who (initials/user id), when, changed fields as JSON patch, full snapshot every N revisions, restore pointer).
- Old `drafts` / `offers` stay exactly as they are and remain readable; a read-only view lists legacy drafts/offers per deal (link via `payload.auftragId` and the existing `by-deal` lookup) and can **copy** one into the new deal draft — the legacy document is never modified.
- Saving = autosave into the deal draft (+ revision); "Schnellspeichern"/"Speichern unter" go away in v2 (UX-CHANGES U-002).
- Offer numbers/locked offers keep today's semantics: sending still writes an immutable `offers` document (unchanged collection and fields).
- Production writes to the new collections happen only through v2 after cut-over (phase 8). Until then they exist only in the local replica / test DBs.
- **Implemented 2026-11-04** (`v2/apps/server/src/deal-drafts/`): `PUT /api/deals/:dealId/draft` (optimistic concurrency via `baseRevision` → 409 on conflict, unchanged payload = no revision), `GET …/draft`, `GET …/draft/revisions[/:rev]`, `POST …/draft/restore`, `POST …/draft/import` (legacy draft/offer copied, original untouched). Revisions store a JSON patch, plus a full snapshot at rev 1 and every 20 revisions. Indexes (`dealId` unique; `dealId+revision` unique) only via explicit `migrateDealDraftIndexes()` — never at boot.
- Known limitation: draft update and revision insert are two writes (the in-memory test DB has no transactions). `payloadAt` detects gaps; wrap both in a transaction on the replica-set deployment before cut-over (tracked in ROADMAP phase 8).

## 008 — Documents via Gotenberg (ACCEPTED by owner, 2026-11-05)
- Replace Puppeteer + LibreOffice + LaTeX (+ Adobe where possible) by one Gotenberg container (HTML→PDF, DOCX→PDF).
- Keep docxtemplater for DOCX templates. Gate: golden-master PDF comparison per document type.
- Pinned: `gotenberg/gotenberg:8.40.0` (digest `sha256:53073e798c8ef39ea2187e44cb67bab77894ea2509100b94c4fe3b461f7b2996`). Config `GOTENBERG_URL` (default `http://127.0.0.1:3000`), `GOTENBERG_TIMEOUT_MS`. Client: `apps/server/src/integrations/gotenberg.ts`. CI runs it as a service container.
- PDF gate (offer): every letter/digit token of the rendered DOCX appears in the Gotenberg PDF (6 golden cases). Byte equality with the old LibreOffice output is not a goal (different LibreOffice build/fonts).

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
- **Guard like ADR 001 for the DB:** outside `NODE_ENV=production` the config refuses a non-local `BITRIX_WEBHOOK_BASE` / `PLANNING_API_BASE_URL` (legacy defaulted to the production planning URL) (tests/dev can never move a real deal). Same rule will apply to SMTP, IMAP, OB24, planning, magic API.
- Email: same library (nodemailer/imapflow) and transport options as legacy → same MIME; send port configurable (`SMTP_SEND_PORT`, default 587 like legacy). PDF rendering and signing reach the email route through ports (`email/ports.ts`); until phase 5 / 4g they fail cleanly ("Send failed", nothing sent, deal lock released).
- `SMTP_HOST`/`IMAP_HOST`/`OB24_BASE_URL` fall under the same non-production guard; onlinebrief24 falls back to its real API URL only in production.
- Geocoder/router base URLs configurable (`GEO_PHOTON_URL`, `GEO_NOMINATIM_URL`, `GEO_ORS_URL`, `ROUTE_OSRM_URL`; defaults = the public services legacy hard-codes). Read-only services → no production guard. Legacy test runs redirect them via the test-only preload (`OC_TEST_FETCH_REWRITE`).
- Magic API (`EXTERNAL_API_BASE/USER/PASSWORD`): read-only product search, so no production guard. axios kept so query strings serialize like legacy. Token cache per client instance (legacy: module). Missing base URL → clear error, no call to `undefined/api/...`. `kind` lookup uses own keys only (legacy treats `"constructor"` as a path).
- Online signing: workflow ported; rendering behind `SigningRenderer` (phase 5). Signing mails keep legacy transport rules (`SMTP_PORT || 587`, `SMTP_SECURE`, password optional); `SMTP_PORT` therefore has no default in config (smtp-test applies `|| 465`). New keys `SMTP_SECURE`, `SIGNING_OFFICE_EMAIL`. Secure by design: only the token routes and `/sign/:token` are public — legacy's path gate also exposed `POST /api/signing/` (trailing slash) without login. Body limit 25 MB on all signing routes (legacy's 10 MB route parser never ran, the global 25 MB parser came first).
- External lookup (`/api/offers/external/*`, bau-formular): v2 requires `EXTERNAL_API_KEY`; unset → 503 (legacy: open until set). Key from `X-API-Key` or `?apiKey` (kept for compatibility), compared in constant time. Cut-over check in ROADMAP phase 8.
- Post errors no longer echo `debug` (legacy returned the raw request incl. recipient and file contents); message, stage, details and status unchanged.
- Small intended differences: unknown upload type `constructor`/`__proto__` → 400 (legacy: prototype lookup).
- **Proof:** the contract test points legacy AND v2 at a recording stub (`test/helpers/bitrix-stub.ts`); responses AND the outgoing calls (verb, method, encoded params in order) must be identical.

## 018 — Catalog edits only for admins (ACCEPTED by owner, 2026-11-05)
- `POST /api/products/bulk` and `/api/services/bulk` (catalog editor tab, product/service prices) require a user with role `admin` in v2 — same check as the admin panel. Normal users get 403 "Admin-Zugriff erforderlich", nothing is written. Legacy: any logged-in user.
- For admins the endpoints behave exactly like today (contract test). v2-only test proves 403/401 and that nothing is stored.
- Frontend (phase 6): show the catalog editor only to admins (UX-CHANGES U-005), so normal users never see a save that fails.
- Cut-over: make sure everyone who maintains the catalog has the admin role.

## 019 — Mechanical ports for fast-changing legacy modules (ACCEPTED, technical, 2026-11-05)
- Some legacy modules change on `main` almost daily (offer document mapping `docx-template.js`: 23 commits in 30 days; bathtub data `wanneSets.js`). Hand-written TS ports would drift constantly.
- These are ported by `v2/scripts/port-verbatim.mjs`: the legacy source is copied unchanged (`// @ts-nocheck`), only imports and runtime hooks are rewritten by explicit rules (models → v2 models, config → BusinessConfig, pricing → `@oc/pricing`, `process.cwd()` → `DOCUMENTS_ROOT`, `console` → pino, LibreOffice → PDF engine). A rule that no longer matches stops the port, so a main change is never ported blindly.
- Drift guard `test/verbatim-ports.test.ts` fails when main changed a ported file → re-run the script. Behaviour gate: the existing golden masters run against the v2 port (DOCX: 50 snapshots identical).
- Ported legacy Express handlers run unchanged under Fastify via `documents/express-adapter.ts` (legacy error bodies → v2 envelope).
- After cut-over (legacy retired) the ported files become the source and get typed step by step.

## 020 — Retire Adobe, LaTeX and /pdf-template exports (ACCEPTED by owner, 2026-11-06)
- Not ported: `/api/adobe-pdf/*` (Adobe PDF Services — external API, credentials, sends offer data to Adobe), `/latex-template/pdf` (needs pdflatex on the server; second, older offer PDF path), `/pdf-template` (always 500 in legacy).
- Gotenberg (ADR 008) produces the offer DOCX/PDF for every case these covered.
- v2 answers these URLs with **410 Gone** and a plain German hint („Diese Exportfunktion gibt es nicht mehr …“), and logs every call, so a leftover client is visible instead of failing silently (`apps/server/src/routes/retired.ts`).
- Frontend (phase 6): the Adobe buttons, the LaTeX export and the template-PDF export are not rebuilt (UX-CHANGES U-006). The current app on `main` is unchanged.

## 021 — Phase 6: v2 serves today's UI; new flows as add-ons; screens move only for real gains (ACCEPTED, technical, 2026-11-06)
- The current frontend is ~55k lines of vanilla JS + an 11k-line `index.html`, changed on `main` almost daily (2026-11-05: +665 lines in `script.js`). A rewrite would drift constantly and endanger "all UI functions stay the same" (ADR 004).
- So v2 serves the legacy frontend files unchanged (`src/public`, same paths, same security headers, same login redirect, same offline service worker). UI parity is by construction; main's UI changes flow in with each sync; the existing Playwright parity suite runs against v2 as the gate.
- Web-layer settings that live inline in legacy `app.js` (helmet/CSP options, CORS allowlist, public-asset rule) are extracted mechanically (ADR 019 style, drift-guarded) instead of copied by hand.
- New flows (ADR 006 deal URLs `/deal/:id`, ADR 007 one draft per deal + history + autosave) are added as small, separately tested modules that v2 injects into the served `index.html` (one script tag). They call existing UI functions and the v2 API; the legacy files stay untouched.
- Screens move to the new web app (`apps/web`) one at a time only where it buys a real improvement (phase 7, owner sign-off per screen).

## 022 — Phase 7 UX changes P7-1 … P7-5 (ACCEPTED by owner, 2026-11-06)
- Approved from the before/after page `docs/rewrite/ux-proposals.html`: P7-1 one „Öffnen“ field, P7-2 min. 16 px text / 48 px buttons / plain German, P7-3 fewer buttons in the Dokumentenstudio (Adobe card gone, developer tools for admins only, Kalkulation keeps all four exports), P7-4 in-page messages instead of browser pop-ups, P7-5 option **A**: „Schnellspeichern“/„Speichern unter“ removed, a button „An Planung übergeben“ moves the Bitrix deal to „Zuteilen“.
- Built as v2 add-ons (ADR 021) — today's app on `main` is unchanged. Parity suites keep comparing behaviour; v2-only specs check each change.
- Addendum 2026-11-06 (owner, option A): offers started without a deal number autosave under a temporary key `t-<24 hex>` (same `deal_drafts` storage, address `?entwurf=…`); `POST /api/deals/:deal/draft/adopt {from}` makes that state a new revision of the deal's draft (on top of any existing one, nothing lost) and marks the temporary draft `adoptedInto` (kept, not deleted). UX-CHANGES U-007.

## 023 — One record per send; a send is never lost and never goes out twice (ACCEPTED, technical, 2026-11-11 — owner said "start with v2")
**Context.** Audit 2026-11 (`docs/audit-2026-11/`): "sent" was not a recorded fact. The client gave up after 60 s while the server carried on (mail out, nothing recorded, a retry sent a second mail — send S-01); a failing log entry after the mail turned the answer into "Send failed" and skipped Bitrix (S-12); the documents that left the house were rebuilt later from whatever the code then was, and the price in the customer's PDF was not kept anywhere (send S-03, signing S-04/S-05).

**Decision.** Every send writes one record in a NEW collection `offer_sends` (legacy collections untouched; files in the GridFS bucket `offer_files`):
- who, when, channel, deal, offer number, recipient, subject;
- the offer payload and the computed price **as sent** (frozen);
- the exact files: offer PDF, product-image PDF, hand-edited DOCX, uploads, Bitrix-only documents (with SHA-256);
- the outcome of each step: `pdf`, `mail`, `sentCopy`, `emailLog`, `bitrix`;
- the answer given to the client.

Rules:
1. The client sends a `sendId` (add-on `send-guard.js`). The same id never sends twice: running → `409 SEND_IN_PROGRESS`; done → the stored answer with `duplicate: true`; failed or stale (10 min) → may run again.
2. The add-on removes the 60 s cut-off and, if the connection drops, asks `GET /api/sends/:sendId` until the send is finished, then hands the app the real answer.
3. The record never breaks a send: its own failures are logged only.
4. Without `sendId` the answer is byte-identical to legacy (contract test unchanged); the record is written anyway.
5. Indexes only through migration `003-offer-send-indexes` (cut-over list).

New read API: `GET /api/sends/:sendId`, `GET /api/offers/:offerNumber/sends`, `GET /api/sends/:sendId/files/:fileId`.

**Addendum 2026-11-11 — owner decisions, built the same day.**
- **A2 (built):** post writes the same record (`channel: "post"`, the letter exactly as handed to the printer, `provider` step); a failed Bitrix filing can be repeated from the stored files (`POST /api/sends/:sendId/retry-bitrix`, the add-on offers it right after the send).
- **B (owner):** a hand-edited offer gets **no online-signing link** — no signing request is created and the sentence with the link is dropped from the mail (`signingLink: "off-hand-edited"` in the answer, notice in the app). Follow-up wish: edit description and price per position on the Kosten page so the hand-edited DOCX is needed less (not built — see UX-CHANGES U-014).
- **C (owner):** a sent offer is immutable. `POST /api/offers`, the e-mail send and the post send compare the offer with the last completed send of that number (`sends/identity.ts`: offer number, Ansprechpartner, content hash that ignores key order, empty values and workflow sections). Unchanged → fine. Changed → `409 OFFER_CHANGED` with what differs; the app says: create a new version.
- **Sent by e-mail, later by post:** the app asks first (when, how, to whom, Ansprechpartner); the server checks the open offer against the sent one and posts the **exact PDF that was sent**; if the open offer differs the user may post the original as it was sent (`useSentOriginal`).
- Requests without `payload`/`sendId` (old client) behave exactly as before.

**Increment 3 (built 2026-11-11, owner: "finish remaining recorded items").**
- **On-site signing / signing link recorded.** `POST /api/signing` with a `sendId` (add-on `offer-record.js`) writes a send record (`onsite` / `signlink`) and the server itself makes sure the locked offer exists (pinned price) — before, that was the browser's best-effort save. On-site counts as "sent" from the **first signature** on (the rep may still adjust the offer while the customer watches); a mailed link at once.
- **Signature first.** The signature is stored atomically before anything else; the completion (signed PDFs, mail, Bitrix, stage move) runs exactly once per request (`signing_completions`), its outcome is recorded, and a failed or interrupted completion is run again by any retry — with the stored signature. An identical re-submit returns the first result (legacy: 409). Signature images are checked strictly (real PNG, ≤ 5 MB).
- **Signed PDFs stored.** At completion the signed PDFs are kept on the send record (GridFS, SHA-256) exactly as mailed; later uses (post download, admin view, manual Bitrix send) serve the stored file instead of rebuilding it.
- **Saving a changed offer.** Sent (send record, or the old app's mail/post/signing logs) → refused. Never sent → priced **fresh** (before, the old total stayed pinned to the new positions — audit create F01).
- **Offer numbers registered.** The app still mints the number on the device (offline). Online it registers it (`POST /api/offer-numbers/claim`, collection `offer_numbers`): free → reserved; held by another unsaved offer → the server hands out a new unique number and the form shows it. Residual gap: two devices offline in the same second, one of which saves before the other registers.
- **Versandverlauf** on the Angebotsversand page: what really went out, when, how, to whom, signed or not, Bitrix state (with "Ablage wiederholen"), stored document.
- New collections: `signing_completions`, `offer_numbers` (indexes in migration 003). Legacy collections: `offers` gains documents only (the same ones the browser used to save); `signingrequests` is written with the same fields as before.

**Addendum 2026-11-17 — audit of the sending flows, server-side findings (F1–F3, F8–F10).**
- **Which stored offer keeps its price (F1, F2; rule narrowed by the owner on 2026-11-18).** The stored flag `offers.locked` is still set by every save (download, before an on-site signature, after a send) and therefore only means "saved". Whether the stored price is **pinned** is decided in one place, `sends/pinned-price.ts`:
  - **stored by the old app** — every stored offer the React app did not create, including every save through today's UI → the stored price, **always**, with or without a provable send. Owner: in the old app a stored offer never changed its price; an old offer opened in the new app must show the total of the PDF the customer signed and returned. (The first version of this fix, 2026-11-17, priced a changed old offer fresh when no send could be proven — not accepted: a letter is logged once per deal, so old sends are not reliably provable.)
  - **created by the React app and sent** — a completed send record with an identity (e-mail, post, signing link, on-site from the first signature); the old app's logs count too → the stored price, always;
  - **created by the React app, never sent** (PDF download, a signing that was not completed) → the stored price while its content is unchanged (content hash of the send guard: key order, empty values and workflow sections do not count); **changed → priced fresh**. Before, the old total stayed on the changed positions and went out in the mail, the letter and the signing view;
  - drafts: unchanged.
  - **How the two apps are told apart** (`sends/origin.ts`): the React client says who it is — `client: "react"` in the body of `POST /api/offers` (also read from `POST /api/signing`, `POST /api/post/send` and as a form field of `POST /api/email/send-offer`, for the case that the server stores the offer of a send itself). Today's UI cannot be recognised by what it sends: it saves through the same route with the same fields, `clientSaveId` included (its offline queue adds it). The server notes the number in the NEW collection `offer_origins` (`_id` = offer number; the legacy `offers` schema is untouched) — only when the React app **creates** the offer. No entry = old-app offer: every offer that exists today, and an old offer that React saves again. Until the React client sends the field, every stored offer is pinned — the safe side.
  - Consequence, accepted with the rule: an old-app offer that was never sent can still be changed and saved or sent under its number, and then goes out with the changed positions and the stored total — as in the old app. For an old-app offer that WAS sent (send record or the old app's logs), changed content is refused.
  - The pricing core is untouched (it must stay identical to the old app's file): for the one case that is priced fresh the server hands it an offer model that reports the stored offer as not locked. The price endpoint, the documents and the save all use this engine.
  - The send guard (decision C) now knows the old app's sends everywhere: a changed offer under a number the old app sent is refused for e-mail, post and signing too (before: only for saving).
- **After a send the stored offer is the sent content (F8).** If another state is stored under the number (saved, then changed and sent without a save), it is replaced by what went out, with the price that went out. A repeated send of the same offer replaces nothing.
- **"Nur in Bitrix ablegen" is not a send (F9).** Channel `bitrix` never makes an offer immutable — also not for records written before today. The record itself stays (Versandverlauf).
- **"Original per Post senden" posts the stored original or nothing (F3).** The original is the offer PDF (or letter) of the last send; for an offer signed on site, the signed offer PDF. Nothing stored → `409 ORIGINAL_NOT_STORED`, nothing goes to the printer. Before, the PDF rendered from the changed offer was posted.
- **One open signing request per offer (F10).** The same offer (content hash and Ansprechpartner) uses the open request again — a resend by e-mail and a later on-site signature share one request. Every other open request of that number is closed (`status: "expired"`; its link answers 410 and offers "Neuen Link anfordern"): duplicates left by earlier resends, and the request for an older state of an offer that is not signed yet.
- **A hand-edited offer stays the document that went out (F4, server part).** An e-mail with a hand-edited DOCX keeps the DOCX hash in the send identity (`identity.handEdited`; a record without the field is not hand-edited). For an offer whose last send to the customer was hand-edited: `POST /api/signing` and an e-mail without that very DOCX → `409 HAND_EDITED_SENT` (the form data cannot reproduce what the customer has); the same DOCX again and the letter by post (the stored PDF) stay possible. The other way round — sent as the standard document, resent with an edited DOCX → `409 OFFER_CHANGED`.
- Tests: `apps/server/test/send-guard-audit.test.ts`; the contract test for "never sent → priced fresh" now uses a change that moves the price. One comparison with the old app says where v2 differs on purpose (the closed older signing request); prices are compared with the old app without exception.

**Addendum 2026-11-18, part 2 — an offer the old app sent, opened again in today's UI.**
- Measured on a local copy of the real data (`v2/scripts/audit-reopen-sent-offers.cjs`; 1222 stored offers, 275 of them sent): every stored offer keeps its total when priced again and when saved again with identical content. But today's UI rebuilds an opened offer from its form, and the rebuild never equals the stored offer — defaults for fields the old offer did not have, sealing and travel cost calculated again, sections dropped (1 to 49 differing values per offer). 39 of 39 sent offers (all types), opened and saved without a change, were refused with `OFFER_CHANGED`; e-mail, post and signing use the same check.
- Owner, 2026-11-18: for such an offer the stored offer is the offer. `sends/sent-original.ts`: when the request does not come from the React app, an offer is stored under the number, and the old app sent it (no send record, its own logs say so — remembered in `offer_origins` as `old-sent`, because the first send from here writes a send record), the server takes the content from the stored offer and only the workflow sections (mail, recipient, deal) from the request. Save: nothing is written. E-mail and signing: the stored offer is rendered. Post: compared and recorded as the stored offer.
- Unchanged: the React app (compares, refuses, offers "Neue Version erstellen"), offers never sent, offers this server sent.
- The same replay with the fix: 39 of 39 accepted, the 39 stored offers byte-identical to before.
- `_locked` (a flag of the price answer) is no longer stored with a saved offer's price.

**Still open.**
- `locked` is still set by every save (see addendum 2026-11-17: it no longer pins the price by itself); the old app's own "sent" bar and `freshNumberIfSent` (a draft saved from a stored offer gets a new number) still read the flag — the Versandverlauf is the reliable view.
- Offers this server sent from today's UI and that are opened there again later: the form's rebuild is refused as "changed" like any change (the server cannot tell a reopened form from an edited one). Sending is React's job for the rebuilt types; where today's UI still sends, "Neue Version" is the way out.
- The document routes (`/docx-template/*`, `/pdf`) and the letter of a Post send from today's UI still render what the form rebuilt, as in the old app — the request does not say which client asks.
- Client-side findings of the same audit (F4 page side, F5–F7, F11–F13: renumbering on download, "Neue Version" in React, failed draft save before a send) follow after the rebuild of the send page.
- E-mail-first offers: the app can put a different number into the PDF than it saves afterwards (audit create F06) — a fix belongs in the app's send code, not in an add-on.

## ADR 024 — Single positions can be reworded and repriced per offer (U-014, 2026-11-12)

**Decision (owner: "use your suggestions"):** everyone may change a position's description and net unit price for one offer, with a reason for price changes; warning (no limit) below −20 %; BU/BWT/HL/BL; block adjustment hidden for new offers; free positions later.

| Topic | How |
|---|---|
| Data | `payload.offerOverrides.lineEdits[]`: `{block, id, source, origLabel, label, unitPriceNet, origUnitPriceNet, reason}`. No DB change; unknown to old code = ignored. |
| Price | `lineEditDeltas()` in the pricing core (TS **and** the legacy copy the browser runs offline): (new − catalogue) × quantity moves the block like a hand-set adjustment — net, after Aufschlag, not discounted. The line keeps its catalogue price, so Aufschlag, Bestellliste and Kalkulation still see the real purchase cost. Result key `lineEdits` only when something applied (old results byte-identical). |
| Wording | one wording rule per reworded position (`wordingRules()`), applied to the finished document like the user's own rules → DOCX/PDF, preview and signing page agree. Quantity prefix stays live. |
| UI | add-on `kosten-edit.js`; two small edits in today's UI: `OfferOverrides.js` carries `lineEdits`, Kosten rows carry `data-line-id/-source`. |
| Audit | mail/Bitrix change note names each changed position, price, old price and reason. |
| Limits | description only for material lines printed once in the document; same product listed twice → first line carries the change; a sent offer is frozen (new version first). |

## ADR 025 — Local-first saving: the device is written first (2026-11-12)

**Why:** 10 Nov 2026, rep in a cellar without signal: iOS discarded the page, hours of work were gone. v2 autosave so far needed the server; offline the work lived only in the open page.

**Decision (owner: "start with local-first saving"):** every change goes to the device (IndexedDB `oc-local`) within 0.3 s, the server copy follows. No server or database change.

| Topic | How |
|---|---|
| Device copy | `local-store.js`: store `drafts` (one record per deal number / temporary key) and `history` (last 8 states per draft). Written on every change, on step change, and at once when the page is hidden or left. Also with autosave switched off. |
| Sync | `deal-draft.js`: server save as before (versioned, `baseRevision`). No connection or server error → stays `dirty` on the device, retried on `online`, on return to the app and every 20 s. Drafts that are not open are transferred in the background. |
| Reload / discarded page | The form is refilled by itself: device state if it is not on the server yet or the server cannot be reached, else the server state. Nothing is written to the device before that is decided (an empty form can never replace a saved state). |
| Start page | "Auf diesem Gerät gespeichert": drafts waiting for transfer plus the last 3 transferred ones; open (works offline) or delete from the device. |
| Changed elsewhere | Known base version → server answers 409 as before. Unknown base (draft started offline) and a draft exists on the server → conflict, unless that draft is the device's own save whose answer was lost (fingerprint `sentMark`). The user decides under "Versionen": load the newest state, or save the device state as a new version. Never a silent overwrite. |
| Versions offline | "Versionen" also lists the states kept on the device and works without a connection. |
| Clean-up | Transferred drafts untouched for 14 days are removed from the device; waiting ones never. |
| Limits | Storage is per browser/device. Safari may clear site data of a web page not used for 7 days unless the app is on the home screen (`navigator.storage.persist()` is requested). Sent-offer saving (`/api/offers`) and sending still need a connection. Today's "Sitzung wiederherstellen" banner stays as a second net. |

Tests: `tests/e2e/parity/v2-local-first.spec.cjs` (5), `tests/e2e/offline-sync/v2-local-first.spec.cjs` (real offline, page discarded twice).


## 026 — Every screen is rebuilt as a React module; backend grouped by topic (ACCEPTED by owner, 2026-11-12)
**Context.** Measured on `rewrite/v2@ac0ee22c` (Chromium, 834×1194, CPU throttled 6×, local preview): the UI that v2 serves blocks the main thread 5.4–6.8 s per tap (configurator tile, back to Hauptmenü, customer from the planning) and sends 30–33 `/api/price` requests each time. Causes: the offer lives in the form fields and is read back from 19 forms on every change; reset is `form.reset()` plus synthetic `change` events; 12 document-level `change` listeners plus the v2 add-ons (`quickwins.js` alone 2–3.8 s per tap); all 27 steps stay in the page. The React app (`v2/apps/web`) was a shell without screens. These causes cannot be removed with add-ons.

**Decision.** This replaces the rule of ADR 021 that screens move "only for real gains":
- Every screen is rebuilt as a React module, one at a time, behind a switch per screen; the old UI stays the default for a screen until the owner signs it off (ADR 004 still holds: same functions, same stored payload, same price).
- Order of offer types: BU, BWT, AH first (most used), then HL, BL.
- Rules for every React module: the offer is one typed object in one store; new offer / back to Hauptmenü is one assignment (`emptyOffer(type)`); derived values come from selectors; the price is computed locally with `@oc/pricing` and confirmed by at most one debounced, abortable server call; every configurator is a lazy route; only the active step is mounted; no `document`/`window` listeners in features.
- Pass mark per screen: under 200 ms blocked main thread per tap at 6× CPU throttle and at most one price call per change (`tests/e2e/perf`).
- Libraries added to `apps/web`: Zustand (offer store) and TanStack Query (server data).
- The backend is regrouped without behaviour change into `platform/` (config, db, auth gate, errors) and `modules/<topic>/` (`routes`, `service`, `repo`, `model`, `schema`, `index`); modules import each other only through `index.ts`. Guard: `v2/apps/server/test/module-boundaries.test.ts`.
- Plan and phases: `docs/rewrite/MODULARIZATION-PLAN.md`.

**Not part of this decision.** Session recording (main PR #325) stays unported until a later phase (owner, 2026-11-12).

## ADR 027 — Variants of an offer, and a second offer type for the same customer (owner, 2026-11-19; A: steps 1–3 built, B: steps 1–2 built)

Two features the owner asked for on 2026-11-19, with the answers to the open questions. Nothing is built; this entry is the brief. Both are built in the new app.

**A. Variants.** A button creates a new variant of the open offer: everything the same, the user changes what differs.

| Question | Owner's answer |
|---|---|
| Sending | One variant at a time, never several in one mail |
| After a signature | The other variants are marked as not chosen (kept, not deleted) |
| Name | The user names a variant; a default name is only the fallback |
| Amount in Bitrix | The signed variant's total; before a signature, the last sent one. A signature on an OLDER variant updates Bitrix too |

Working assumption (not yet confirmed by a design): variants are separate offers under the same deal, each with its own offer number; today the new app has one draft per deal (U-002), so the draft model grows from one to several per deal.

**B. A second offer type for the same customer** (for example a Badumbau customer also wants Alltagshilfe). Creating it creates a NEW deal in Bitrix.

| Question | Owner's answer |
|---|---|
| Combinations | Any type to any type |
| The new deal | Created in „Neue Anfragen“ first — Bitrix robots run there — and is moved on from there as usual. Building offers belong to the HD pipeline, Haushaltshilfe / Alltagshilfe offers to the AH pipeline; where a deal moves when sent or signed is already set in the OC and stays as it is |
| What is copied | Everything of the customer data: care level, insurance, address and the rest |
| Testing | A test pipeline in Bitrix — to be created if there is none (owner's OK given 2026-11-19) — and the first real creation together with the owner |

Open for the design: the new deal's title and responsible person; which fields of the first deal are copied to the new deal in Bitrix itself (contact link at least); how the two offers show their relation in the app.

**Order agreed:** (1) sync with main, (2) the React steps take over main's changes, (3) variants, (4) second offer type, (5) B3 and the remaining small gaps.

### ADR 027 A — design (owner 2026-11-19)

**Owner decisions.** (1) "Neue Version" and "Variante" both exist: a *version* is a correction of the same variant (renumbered in place, as today); a *variant* is an alternative beside the others. (2) When one variant is fully signed, the open signing links of the other variants are closed automatically. (3) The variant name is internal only — never on customer documents or mails.

**Model.** A variant is a separate offer under the same deal: its own draft and history, its own offer number (given at its first send, as today), its own sends. A deal has 1..n variants of the same offer type (a save with another type is refused while there are several: `VARIANT_TYPE_MISMATCH`). Id: the first variant is `v1`, later ones `v-` + 12 hex; name user-given, fallback „Variante N“ (the first one „Variante 1“ until renamed).

| Item | As built (step 1) |
|---|---|
| Storage | `deal_drafts` documents gain `variantId`, `variantName`, `notChosenAt`, `openedAt`, `deletedAt`, `copiedFrom`, `snapshotRev`. **Absent `variantId` = the first variant** — drafts saved before variants are not rewritten. Unique index `uniq_deal_variant {dealId, variantId}` (absent indexes as null) |
| History | `deal_draft_revisions` records gain `variantId` and `prev`. Revision numbers stay **unique per deal** (one sequence for all variants; `uniq_deal_revision` unchanged); the history of a variant is its own records, so its numbers have gaps when several variants are edited. Reconstruction checks the chain (`prev`; old records follow revision − 1) |
| Copy | Everything of the source variant except: offer number (none until the first send), `zusammenfassung.versand`, date (today, Berlin) and contact person (the creating user, via the server's Ansprechpartner rule). One shared rule with „Neue Version“: `@oc/domain` `newOfferPatch` / `variantCopyPayload`; the web's `newVersion` uses `newOfferPatch` |
| Rename | Any time, 1–60 characters |
| Delete | Only when never sent: no done send record, no legacy log (`emaillogs`, posted `postalsends` row) and no signing request for any of its numbers (`VARIANT_SENT`); never the only variant (`VARIANT_LAST`). Soft delete (`deletedAt`): hidden, kept |
| Status | Derived on read, never stored: `draft` / `sent` (date + channel of the last send that reached the customer; filing in Bitrix alone does not count; or `zusammenfassung.versand` of an old offer) / `signed` (a completed signing request or a signed send record) / `not-chosen` (`notChosenAt`, unless signed). Send records without `variantId` (older) belong to the variant whose current number they carry, else to the first variant |
| Not chosen | Field and read side now; `markOthersNotChosen(dealId, signedVariantId)` exists and is tested but is wired into signing in step 3 |

**Today's UI (no selector).** Its calls without `variant` act on the **variant opened last**: the live variant with the latest `openedAt`, which is set when a variant is created or opened with an explicit `?variant=` (React app); none set → the first variant. Reading without `variant` never moves it. Why `openedAt` and not the latest `updatedAt`: an autosave of another tab must not switch what today's UI edits. The revision check still protects two editors: because revision numbers are unique per deal, a save from today's UI that loaded variant A cannot match the revision of variant B if B became "opened last" in between — it is refused as `REVISION_CONFLICT` (the add-on reloads), never written into the wrong variant. Adopting a temporary draft carries every variant over under its id; the one opened last there becomes the one opened last in the deal.

**Send lock per variant, legacy index kept.** `emailsends` / `postalsends` keep their unique `dealId` index (the old app on `main` uses it until cutover). The lock row's key is the deal number for the **first** variant — exactly today's row, so the old app and today's behaviour are unchanged — and `<deal>#<variantId>` for every other variant. The index then locks per variant: B after A passes, A again within 24 h is refused (`ALREADY_SENT`). The variant of a send: the request's `variantId` (React app), else the variant whose current number is sent, else the variant opened last. Send records (`offer_sends`, also the signing hand-over record) carry `variantId`. Nothing has to be dropped or migrated in the legacy collections; after cutover a cleaner shape is possible, not needed.

**Build steps.** (1) Server — this PR: storage, API (`GET/POST /api/deals/:dealId/variants`, `PATCH/DELETE …/variants/:variantId`, `?variant=` on every draft call), migration 005, per-variant send lock, `markOthersNotChosen`. (2) React: variant selector, create / rename / delete, status per variant, device copies keyed by deal + variant. (3) Signature: mark the others not chosen, close their open signing links, the server sets the Bitrix amount / offer number / link to the signed variant, else to the last sent one.

**Step 2 as built (React, UX-CHANGES U-044).** Selector in the offer header (panel with name, total, status; create / rename / delete; „Variante erstellen“ also on the Versand page). **Address:** `?variante=<id>` on `/deal/:dealId/:type[/:step]` — the path is unchanged, so existing links, bookmarks and the step index keep working; without it the server's last-opened variant opens and the frame writes its id into the address (replace, same page). A gone variant (`VARIANT_NOT_FOUND`) opens the server's default with a notice. **Store:** `variantId`, `variantName`, `variantKnown`. **Snapshot keys:** `oc.snapshot.<deal>` for the first variant (today's key, existing device snapshots stay valid), `oc.snapshot.<deal>#<variantId>` otherwise. **What names the variant:** draft calls (`?variant=`) and sends (`variantId` in the mail form, the letter and signed-letter body, the signing body) once the server has named the variant (GET draft answered `variantId`, or it was created / opened by id); before that (a new offer, an older server) they act on the server's default, which for a deal without variants is the same draft — the revision check refuses anything else. A send names the variant only when it goes to the deal the draft is saved under (not for a temporary key). Switching saves the open variant first; a failed save stops it. Opening another variant by address (back button) keeps the open one's input (snapshot + save to its own variant). The list is asked only where shown (panel, Versand page, device list); after a send it is asked again. **Server fix in step 2:** the derived status counted the empty `zusammenfassung.versand` object of every new offer as "sent"; now an object counts only with `art` and `versendetAm` (the web's `isSent` rule), a non-empty text as before (test in `deal-variants.test.ts`).

**Step 3 as built (server; signature, Bitrix).** Nothing was run against the real Bitrix — stubs only; the owner and the developer check a test deal before go-live (checklist in the PR).

| Rule | As built |
|---|---|
| Which variant is signed | The completed request's send record `variantId` when it names a live variant, else the variant that carried the signed number (current number or a send record of it); a deal with ONE variant: that one. Several variants and the number belongs to none: nothing is marked or closed, the stage moves as today without amount fields, `VARIANT_OF_SIGNATURE_UNKNOWN` (warn). A deal without any draft (today's UI, contact requests): as before plus the amount fields |
| Who decides (race) | The first completion of a deal inserts `deal_variant_choices {_id: dealId, variantId, offerNumber, token, at}` — the `_id` makes it atomic without an index migration. The same variant again (a repeated completion after a failure, a newer version of it signed) is still the chosen one. Another variant completing later — near-simultaneously, or a variant created and signed after the first signature — is a **second signature**: its documents are completed as signed (stored PDFs, confirmation mail, timeline note), nothing is marked, **no deal update at all** (stage, amount, number, link stay with the first), the note says „⚠️ Zweite Unterschrift: … Betrag, Angebotsnummer und Angebotslink im Deal bleiben bei Variante „A“. Bitte mit dem Kunden klären.“, `VARIANT_SECOND_SIGNATURE` (warn), completion record `dealMove: "kept-first"`. The first signed variant is never marked not chosen |
| Marking | First signature: `markOthersNotChosen` (every other live variant gets `notChosenAt`; the signed one loses it if it had it) |
| Closing links | Every open request (`sent` / `opened` / `partially_signed`) of the other variants' numbers becomes `expired` (`expiresAt` now). The customer sees today's expired page („Dieser Link ist abgelaufen“, „Neuen Link anfordern“) — the page is today's UI and was not changed; the text is not wrong (the link is no longer valid) and names no variant. „Neuen Link anfordern“ on such a link still makes the office task, now with „Hinweis: Dieser Link wurde geschlossen, weil der Kunde ein anderes Angebot zu diesem Auftrag unterschrieben hat (Nr). Bitte vor einem neuen Link mit dem Kunden klären.“ (also on the timeline note). A closed request with signed documents: line „⚠️ Signatur-Link von Variante „B“ (Nr) geschlossen – dort waren bereits x von y Dokument(en) unterschrieben. Bitte prüfen.“ and `VARIANT_PARTIAL_SIGNING_CLOSED` (warn). The closed tokens are kept on the choice document |
| Timeline note | One variant: unchanged text. Several: the ✅ note gets „Variante „Name“ unterschrieben.“, „Nicht gewählt: …“ and one line per closed link — internal timeline only, never in a mail or document. No extra Bitrix call |
| Bitrix on signature | The existing `crm.item.update` (stage move) carries, for non-AH deals, `opportunity` + `isManualOpportunity=Y` + `currencyId=EUR` + `UF_CRM_1768391021079` (final total) = the signed offer's total **as sent**, `UF_CRM_1776156870205` = its number, `UF_CRM_1790772236055` = its OC link — also when it is older than the last sent variant. Total: the request's send record → another done send record of the same number (a sent offer is immutable) → the price stored with the offer (`offers.pricing.total`, written at the send/hand-over); never priced fresh. None found: amount fields left out (number + link still written), `SIGNING_AMOUNT_MISSING` (warn). KASSE: Kasse fields and Eigenanteil exactly as today. **AH (owner 2026-11-20):** AH stage + the AH fields the „ANG verschickt“ move writes (`buildAhBitrixFields`: Stunden pro Einsatz, Art der Leistung, Anfahrtspauschalen, monatlicher / tatsächlicher Stundenumfang, Regelmäßigkeit, Gesamtpreise / Gesamtbeträge AB / HnD / Anfahrt) built from the signed offer's payload **as sent** (send record → another done send of the number → stored offer), + the offer link; no amount and no offer number (the move writes neither for AH); the Anfahrtszone is never written at a signature (fill-once, set by the first move; reading it would cost a call). Sent payload missing: AH fields left out, link still written, `SIGNING_AMOUNT_MISSING` (warn). Also for one-variant AH deals. Calls per completion: 2 before, 2 after (✅ note + one update; `batch()` not used — it would merge the failure handling of note and stage move). A failed update: signature completed anyway, `SIGNING_DEAL_UPDATE_FAILED`, the failed call with all fields is in `bitrixlogs` for the admin replay (as today) |
| Bitrix on send | Unchanged before a signature: the „ANG verschickt“ move writes the total/number of the offer just sent (the dialog now also sends `variantId`), the send's filing sets the link of the number just sent — the last sent variant wins. **No stage fall-back after a signature (owner 2026-11-20):** once any offer of the deal is signed, `move-ang-verschickt` makes **no Bitrix call at all** — neither for another variant nor for a resend of the signed one — and answers `{ ok: true, stageKept: true, amountKept: true, signedOfferNumber }`; the dialog says „Der Deal bleibt in seiner Phase, weil bereits ein Angebot unterschrieben ist. Betrag bleibt beim unterschriebenen Angebot.“ „Signed“ = the recorded choice, a signed variant, or — deals signed before variants existed — a completed signing request filed on the deal (`status` index). `move-zuteilen` / `move-besichtigung` are not send moves and are unchanged. Mail, letter and the repeated filing (`retry-bitrix`) do not set the offer link when another variant is signed |
| AH amount (ADR 028, owner 2026-11-20) | AH deals now get an amount too: the „ANG verschickt“ move and the stage move after a signature write `opportunity` + `isManualOpportunity=Y` + `currencyId` = the offer's monthly amount (gross for a Selbstzahler, net for a Kassenkunde — not the Eigenanteil), from the one AH total function on the payload as sent; signed wins as for the other types. No final total and no offer number for AH (as before) |
| Not chosen | Mail (also „Nur in Bitrix ablegen“), offer letter and signing hand-over of a not-chosen variant are refused: 409 `VARIANT_NOT_CHOSEN`, „Diese Variante wurde nicht gewählt – zu diesem Auftrag ist bereits ein anderes Angebot unterschrieben. Sie kann nicht mehr versendet werden. Bitte erstellen Sie bei Bedarf eine neue Variante.“ (the web shows the server's text). A letter with the signed documents is not refused |
| Un-choosing | No path reverts a completed signing today (a completed request is never expired: the expiry gate, the admin lazy-expire and the "one open request" rule all skip `completed`). Nothing built; no "reactivate" control |
| Web | The variants list is asked again on window focus (the panel and the Versand page show „Unterschrieben“ / „Nicht gewählt“ after a customer signed elsewhere); U-045 |

**At cutover.** Run migration 005 (after 001–004, dry run first): it creates `uniq_deal_variant` and `deal_variant_revision`, then drops `uniq_dealId`; no document is rewritten, idempotent. Before it runs, a second variant is refused with `VARIANT_CREATE_FAILED` (503). The rollback export (`exportDealDraftsToLegacy`) writes one legacy draft per live variant.

**Deviations from the brief (step 1).** The deal number on the payload (`auftragId`, `mail.auftragId`, `postal.auftragId`) is **kept** in a copy: it is the Bitrix deal the variant belongs to, and the send and filing read it; resetting it would detach the variant from its deal. The first variant may be deleted when other variants exist and it was never sent.

### ADR 027 B — design (owner 2026-11-20)

From an open offer of one type the user starts an offer of **another** type for the same customer. The server creates a NEW Bitrix deal and a new offer under it with the customer data copied. Same type is not this feature (that is a variant): refused with `SECOND_OFFER_SAME_TYPE`. Afterwards the two deals are independent (own variants, sends, signature).

**Bitrix facts (live definitions read 2026-11-20, definitions only).** „Neue Anfragen“ is deal pipeline (category) 72, its first stage `C72:NEW` („[VI] Neu“). The automation rules of that stage run right after creation: they set the responsible person and write the title (`<ID> - Neuanfrage <Kategorie Neu> - <Auszuführende Tätigkeiten> - von <UF_CRM_1736426014>`, for some sources „… über <Quelle> zu …“). So the app sends **no responsible person** and only a neutral provisional title („Neuanfrage“). HD pipeline = 38, AH pipeline = 52: the existing send / sign moves force category and stage, so a deal created in 72 is moved by them unchanged. Required deal fields: `UF_CRM_1725458507816` „Kategorie Neu“ (enum, multiple), `UF_CRM_1725521281342` „Auszuführende Tätigkeiten“ (enum, multiple), `UF_CRM_1764764902076` „Zugehörigkeit“ (enum, single); `UF_CRM_1736426014` is a plain text field used by the title rule.

**Values (owner-confirmed; ONE table: `@oc/config` `SECOND_OFFER_DEAL_VALUES`, env override `SECOND_OFFER_VALUES_JSON`).**

| Target type | Kategorie Neu | Auszuführende Tätigkeiten |
|---|---|---|
| bu | 4334 Handwerkliche Dienstleistungen (Barrierefrei) | 7730 [HD] Badumbau |
| bwt | 4334 | 4704 [HD] Badewannentüre |
| hl | 4334 | 4034 [HD] Handläufe |
| bl | 4334 | 4158 Sonstige |
| ah | 4002 Alltagshilfe | 4566 [AH] Haushaltsnahe Dienstleistungen |

Zugehörigkeit always 8158 „Eigener Auftrag“ (not copied). Source `WEBFORM` („Bestandskunde“ in this Bitrix). `UF_CRM_1736426014` = „<Nachname>, <Vorname>“ of the customer (left out when both are empty). Contact: the same Bitrix contact as the first deal, linked as primary (`contactId` + `contactIds`) — from `Kundendaten.bitrixContactId` of the source offer, else the first deal's `CONTACT_ID` (one read); none → `SECOND_OFFER_NO_CONTACT` (no contact is created). Pipeline / stage / source / title are settings: `SECOND_OFFER_CATEGORY_ID` (72), `SECOND_OFFER_STAGE_ID` (`C72:NEW`), `SECOND_OFFER_SOURCE_ID` (`WEBFORM`), `SECOND_OFFER_TITLE` („Neuanfrage“).

**The create call.** `crm.item.add` with `entityTypeId=2`, `useOriginalUfNames=Y` — one request sets category, stage, title, source, contact, external id and the UF fields; the same family and field style as the existing stage moves (`crm.item.update`). apidocs.bitrix24.com (crm-item-add): „automation rules are triggered after saving“; answer `result.item.id`. `crm.deal.add` would do the same (its page documents no automation switch either); both are marked deprecated in favour of REST 3.0 — not yet used anywhere in the app. The id is checked like `ensurePartnerContact` does; an answer without id counts as an unknown outcome.

**Rules.**

| Rule | As built (step 1) |
|---|---|
| Endpoint | `POST /api/deals/:dealId/second-offer` `{ offerType, creationId, variantId?, checkBitrix? }` → `{ ok, creationId, sourceDealId, sourceVariantId, dealId (new), offerType, variantId: "v1", revision, comments: "ok"\|"failed", repeated }`. Source = the given variant, else the one opened last. A temporary key (`t-…`) is refused (`SECOND_OFFER_TEMP_DEAL`) |
| Exactly once | Claim `second_offer_creations {_id: creationId}` (atomic by `_id`, no migration) before any Bitrix call; states creating → finishing → done. A repeat with the same id answers the stored result (`repeated: true`), no Bitrix call. The same id for another deal / type: `SECOND_OFFER_ID_MISMATCH`. Busy: `SECOND_OFFER_RUNNING`; a run busy for over 10 min counts as cut off (creating → unclear, finishing → deal-created) |
| Definite failure | Bitrix answered with an error (also the rate limit after the retries), not configured, connection refused before sending, no contact: nothing was created, claim `failed`, the same id may be retried (`SECOND_OFFER_BITRIX_FAILED`, `SECOND_OFFER_NO_CONTACT`) |
| Unknown outcome | Timeout, connection lost after sending, malformed answer, answer without id: claim `unclear`, `SECOND_OFFER_UNCLEAR` („Bitte prüfen Sie in Bitrix unter „Neue Anfragen“ …“). Never retried by itself; a plain repeat answers the same code without a Bitrix call. Only a repeat with `checkBitrix: true` goes on: it first looks for the deal made by this creation id (`crm.item.list` filter `originatorId = "oc-second-offer"`, `originId = creationId` — both deal fields are documented as external-source ids, read/write and usable in `filter`, apidocs „CRM object fields“), takes it when found, and creates only when there is none |
| Draft write fails | The claim keeps the new deal id (`deal-created`), `SECOND_OFFER_DRAFT_FAILED` names it; a repeat with the same id writes the draft without creating another deal |
| Bitrix calls | At most one read (the contact, only when the offer has none), one create, ONE `batch` with the two timeline notes (new deal: „Angelegt aus OC als weiteres Angebot (<Art>) zum Auftrag <erster>“; first deal: „Weiteres Angebot (<Art>) angelegt: Auftrag <neuer>“), all through the queue / retry of `integrations/bitrix.ts`. A failed note: creation stands, `comments: "failed"`, `SECOND_OFFER_COMMENT_FAILED` (warn); notes are never posted twice |
| New offer | `emptyOffer(type)` + the source's Kundendaten by the „Kunde suchen“ rule (`restoreChanges`, moved unchanged from the web into `@oc/domain` `customer-data.ts`; the web re-exports it) + date today (Berlin) and the contact person by the server rule (signed-in user, `resolveAnsprechpartner`) + the new deal number in `auftragId`, `mail.auftragId`, `postal.auftragId` + `pricingRules` = today's settings. Not copied: products, prices, offer number, send status, the other steps, mail text. Saved as the new deal's first variant (history kind `import`) |
| Relation | `related: [{ dealId, offerType, role: "created"\|"source", createdAt, creationId }]` on both drafts (the source variant and the new draft), outside the payload, once per creation id. Read: the draft GET (`related`, all variants of the deal) and `GET /api/deals/:dealId/related` (with the other deal's status: signed > sent > draft, `null` without a draft). Symmetric (A lists B and C; B lists A), not transitive |
| Error log | Area `deals.second-offer`; ids only |

**Build steps.** (1) Server — this step: endpoint, claim, Bitrix create / lookup / notes, the shared fill rule, relation. (2) React: button „Weiteres Angebot für diesen Kunden“ in the header panel and on Versand, type choice (not the open type), confirmation dialog showing what will be created (a new Bitrix deal in „Neue Anfragen“, the type, the customer data that is copied), the relation as „Weitere Angebote dieses Kunden“; the planning screen opens this dialog instead of silently redirecting; the client keeps one `creationId` per dialog until success and shows `SECOND_OFFER_UNCLEAR` with a „In Bitrix prüfen“ action (`checkBitrix: true`). (3) The first real creation with the owner on a test contact (test pipeline via the settings if needed) — checklist in `CUTOVER.md`.

**Step 2 as built (React, UX-CHANGES U-046).** Button „Weiteres Angebot für diesen Kunden“ in the header's variants panel (section „Weitere Angebote dieses Kunden“, apart from the variant actions) and on the Versand page; disabled for a temporary key. One dialog (`SecondOffer.tsx`, rules `model/second-offer.ts`): type choice (the open type is left out; a related type is marked with „Öffnen“ first, „Trotzdem neu anlegen“ second) → confirmation → call. **creationId:** 32 hex per opened dialog; a double tap sends once (a ref, not state); kept while the outcome is open (unclear, draft failed, running, no answer) — also on the device (`localStorage oc.secondOffer.<source deal>`) so closing and reopening continues the same creation; given up after success or after closing on a definite outcome (refusal, `BITRIX_FAILED`). **Actions:** `UNCLEAR` → only „In Bitrix prüfen“ (`checkBitrix: true`, same id); `DRAFT_FAILED` / `BITRIX_FAILED` / no answer → „Erneut versuchen“ (same id); `RUNNING` → „Erneut prüfen“ (same id); refusals → the server's text, no retry; offline (`navigator.onLine`) → refused before anything is saved or sent. The open offer is saved first (`saveOpen(true)`, as „Variante erstellen“); a failed save stops it. Success → `/deal/<new>/<type>/Kundendaten` + notice. **Relations:** the draft GET's `related` is kept in the store (the header pill shows „+n“ without a request); `dealRelated` is asked where the list is shown (panel, dialog, planning) and again on window focus. **Planning:** the picker asks the deal's draft and relations when it opens; another type than the draft's → a choice (open the existing one / open the related deal of that type / create via the same confirmation with the existing draft as source) instead of the silent redirect; a direct address keeps the redirect with a one-line notice. **Web change outside the feature:** `ApiFailure` carries the further fields of the server's error object (`detail`, e.g. `newDealId`). No server change.

**Open assumptions.** bl → „Sonstige“ (4158); ah → only 4566 (not also Alltagsbegleitung); the „von …“ text field = the customer's name. The „Kunde suchen“ rule also copies the Kundendaten fields `aufschlag` (surcharge choice), `notes` and the internal list (`internalTodos[]`) — recommended to keep (same rule as the web), to be confirmed.

## ADR 028 — Alltagshilfe: one total for screen, documents, signing page and Bitrix (owner, 2026-11-20; built 2026-11-20)

**Problem.** Three places computed „the“ AH amount differently: the screen (`computeAhPricing`: Selbstzahler = net + 1,20 € Servicepauschale, no VAT; funding deducted for every payer except Selbstzahler), the offer document (`buildAhData`: funding only for payer exactly „Kassenkunde“, Selbstzahler net + 7 % MwSt), the signing page (net only) — and Bitrix got no amount for AH at all.

**Decision (owner 2026-11-20).**

| # | Rule |
|---|---|
| 1 | The Pflegegrad decides **defaults and warnings**, never the price: a new offer starts with nothing ticked; a Pflegegrad answer with a level (1–5, „beantragt“) ticks the Entlastungsbetrag of a Finanzierung that was never touched (= no `ahVerhinderungspflegeMonat` stored — today's page and v2 store it with every write; the automatic tick writes only `ahEntlastungsbetragNutzen`), „Nein“ unticks it; opening an offer never writes. A source ticked without a qualifying Pflegegrad shows a warning („Kein Pflegegrad hinterlegt“, „Erst ab Pflegegrad 2“, „Pflegegrad der 2. Person fehlt“) — nothing blocks (U-011) |
| 2 | **No payer chosen = Kassenkunde** everywhere (only „Selbstzahler“, case-insensitive, is a Selbstzahler) |
| 3 | **Selbstzahler**: net + 7 % MwSt = gross is the amount to pay, on the screen, in the DOCX (unchanged there), on the signing page and in the send record. **The Servicepauschale (1,20 €, HnD) is not in any total** — a note only (today's Kosten wording „Separate Direktrechnung — nicht im Gesamtbetrag …“), for both payers; the DOCX keeps not mentioning it. **Kassenkunde**: net, no VAT, minus the ticked funding = Eigenanteil. VAT and Eigenanteil rounded as the DOCX: vat = r2(net · 0,07), gross = r2(net + vat), deductions = r2(sum), Eigenanteil = r2(max(0, net − deductions)) |
| 4 | **Bitrix amount for AH**: at „ANG verschickt“ and at the signature, `opportunity` (manual, EUR) = the monthly „Leistungen und Anfahrt“ amount as the customer sees it — gross for a Selbstzahler, net for a Kassenkunde, **not the Eigenanteil**. The send record's `total` holds the same figure. The AH UF fields stay as they are |

**Built.** `@oc/pricing` `ahOfferTotals(input)` (`ah-totals.ts`) — the one function; result `{ payer, net, vatRate, vat, gross, deductions {entlastungsbetrag, verhinderungspflege, umwidmung, total}, eigenanteil, amountToPay, customerAmount, servicepauschaleNote {show, amount}, steuerabsetzJahr, detail }`. `computeAhPricing` stays the legacy-exact port (golden master of today's screen, 400 + 143 cases untouched); the only change in it is an optional `hours` on a time row that only the documents' reader sets. Readers: React screen (`offer/model/ah-price.ts` → shell total, Leistungen, Finanzierung, one summary block), offer DOCX (`documents/ah-offer-data.ts` `buildAhOfferData`, wired into the ported template by a rule in `port-verbatim.mjs`; the legacy `buildAhData` stays there as the test reference), signing page (`ahSigningTotalsHtml`, same rule mechanism for `signing-docs`), send record and mail answer (`AhBetragNum`), „ANG verschickt“ move and signature (`ahTotalsOfPayload`), the AH Bitrix UF numbers (`integrations/bitrix-deal.ts` `ahBitrixFromPayload`).

**Two readings of a stored offer — kept on purpose.** The documents read an offer as today (`ahDocumentInput`: services from `ah.services`, the saved zone `Arbeitszeit.ahTravelZone` first, durations also as decimals); the screen as today (`ahInputFromPayload`: `ahServicesJson`, the zone from the travel time with the Hof rule). Both feed the same function and agree for every offer v2 writes (zone and travel time written together) — tested on the 117 real offers whose saved zone matches their travel time. **Open question:** 26 of the 143 real offers have a saved zone that does not match their travel time (mostly older Hof offers: travel 0:11 saved as zone 2, the screen bills zone 1; older zone steps such as 0:20 → zone 3); 24 of them print a different net in the document than the screen shows (e.g. 127,10 € vs 112,45 €; 18 Kassenkunde, 6 Selbstzahler). Not changed here — the owner asked for no printed change for a Kassenkunde. Recommendation: let the documents follow the screen's reading (travel time + Hof rule) for offers sent from now on. → **Decided by the owner 2026-11-23, see the addendum below.**

**Golden comparison (DOCX fields `AhGesamtbetrag`, `AhEntlastungsbetrag`, `AhEigenanteil`, Konditionen rows, `AhBitrix` — every field of the document data).** 543 stored offers (`v2/apps/server/test/fixtures/ah-golden-offers.json`: 143 real anonymised + the 400 controlled cases as stored offers), `ah-offer-data.test.ts`: all 302 Kassenkunde and all 133 Selbstzahler cases byte-identical (key order included); the 108 offers without a payer now deduct their ticked funding exactly like the same offer with payer Kassenkunde — 47 of them print a deduction line and „Ihr Eigenanteil“ they did not print before (all in the controlled set; the 2 real offers without a payer have no funding ticked): ah-ctl-0000, ah-ctl-0013, ah-ctl-0020, ah-ctl-0038, ah-ctl-0044, ah-ctl-0059, ah-ctl-0063, ah-ctl-0070, ah-ctl-0074, ah-ctl-0083, ah-ctl-0085, ah-ctl-0092, ah-ctl-0119, ah-ctl-0122, ah-ctl-0124, ah-ctl-0126, ah-ctl-0127, ah-ctl-0129, ah-ctl-0139, ah-ctl-0151, ah-ctl-0191, ah-ctl-0202, ah-ctl-0205, ah-ctl-0207, ah-ctl-0211, ah-ctl-0220, ah-ctl-0221, ah-ctl-0244, ah-ctl-0256, ah-ctl-0261, ah-ctl-0262, ah-ctl-0270, ah-ctl-0273, ah-ctl-0289, ah-ctl-0294, ah-ctl-0309, ah-ctl-0313, ah-ctl-0315, ah-ctl-0323, ah-ctl-0326, ah-ctl-0334, ah-ctl-0347, ah-ctl-0357, ah-ctl-0370, ah-ctl-0378, ah-ctl-0393, ah-ctl-0396. Not printed but changed: the send record's `total` and the mail answer's `offerTotal` of every Selbstzahler (net → gross), the screen total of every Selbstzahler (net + 1,20 € → net + 7 %), and the Bitrix amount of every AH deal (none → the monthly amount).

**Against the legacy app (`src/public`, unchanged):** its screen still shows a Selbstzahler net + 1,20 € and deducts funding without a payer while its documents (served by v2) follow this ADR; the React screen is the one that matches the documents.

**Known, not fixed (listed for the owner):** the AH UF fields „Gesamtbetrag HnD“ and „Gesamtbetrag AB“ each include the combined Anfahrt (double count, legacy). The DOCX prints the deduction uncapped (−131,00 € on a 34,10 € offer, Eigenanteil 0,00 €); the screen caps its minus lines so they add up. `PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT` (40 %) is still unused — the Umwidmung amount has no upper limit, as today.

### ADR 028 — addendum 2026-11-23: the zone reading of the documents (owner)

**Decision (owner 2026-11-23).** An AH offer sent **from now on** is read with the **screen's zone** (travel time + Hof-postcode rule, `ahInputFromPayload`) by every app-facing total: offer DOCX/PDF, signing page, mail answer, send record `total`, Bitrix amount (move and signature) and the AH Bitrix UF fields incl. „Anfahrtszone“ (`UF_CRM_1711019971`, still written only when the deal has none). An offer that **already went out stays exactly as it went out** (the documents' reading: saved `Arbeitszeit.ahTravelZone` first). Stored offers are not rewritten. (Services: see „Services reading“ below — the screen reading covers them too.)

**Mechanism — the reading is decided once per offer number and kept on the send record.** `@oc/pricing`: `AhZoneReading = "document" | "screen"`, `ahScreenZone(payload)`, optional `reading` on `ahDocTravel` / `ahDocumentInput` (default `"document"` — every existing caller and golden test unchanged). Server: `modules/sends/zone-reading.ts` `ahZoneReadingOf(offerNumber)`:

| # | Rule | Reading |
|---|---|---|
| 1 | a send record of the number carries `ahZoneReading` | that marker (the earliest record's; every marker is computed by these rules, so one number has one marker) |
| 2 | a completed send record without a marker (not „Nur in Bitrix ablegen“), the old app's logs (e-mail log, posted letter, signed request), or any signing request of the number | `"document"` — it reached the customer before markers existed |
| 3 | none of these (also a „Neue Version“: new number) | `"screen"` |
| — | no database / the check fails | `"document"` (never changes what a customer has) |

The marker is written on **every new send record**: centrally in `beginSend` (mail, „Nur in Bitrix ablegen“, post), on the hand-over record of `POST /api/signing` (computed **before** the signing request is created, so the request itself does not count as „sent before“) and on the record given to an old signing request at completion. Readers: the DOCX/PDF (`mapData` → `buildAhOfferDataFor`, port rule in `port-verbatim.mjs`; non-AH offers keep `"document"`, their AH fields are unused) — and through it the mail answer, send record total, signing page and signed PDF; the „ANG verschickt“ move and the signature completion (`ahTotalsOfPayload(…, reading)`, `buildAhBitrixFields(…, reading)`, `SignedOffer.ahZoneReading`). Why not the „price pinned“ rule of ADR 023: it pins every offer the old app stored (also never sent), and „sent“ alone cannot tell a send before this change from one after it — a resend of an offer first sent with the screen's figure would flip back. The marker can.

**Golden proof** (`test/ah-offer-data.test.ts`, 543 stored offers): (a) as ALREADY SENT every document field stays byte-identical to the legacy reference for Kassenkunde and Selbstzahler (the guarantees above unchanged); (b) as NEW the document's zone, net, gross, Eigenanteil and every detail row equal the screen's for **all 543**. **108 offers print other figures** in the two readings, all pinned with both numbers: 24 real (18 Kassenkunde, 6 Selbstzahler) — 22 with a saved zone that does not match the travel time (e.g. Hof, travel 0:11 saved as zone 2: 127,10 € → 112,45 €; ah-offer-114d7198 Selbstzahler 843,31 € → 755,31 € gross), ah-offer-4cfe26f6 (no saved zone, travel 0:14 billed unrounded 205,69 € → zone 2 211,47 € gross), ah-draft-91fcd12b (time rows nested in the tasks: 0,00 € → 196,58 € gross) — and 84 controlled synthetic cases (services shapes, below). Route tests: `test/ah-zone-reading.test.ts` (send, resend, download, signing page, signature, move with amount and Anfahrtszone; a record without marker, an e-mail log only, an on-site request from before the change; „Neue Version“; a nested-schedules offer new and sent before).

**Services reading (owner 2026-11-23, same day).** The screen reading covers the **services** too: under `"screen"` the document input is exactly `ahInputFromPayload` (services from `ahServicesJson`, the legacy single-service format, time rows nested in task objects lifted as ADR 014 does for the screen, an untyped service = Alltagsbegleitung, durations „H:MM“); the service rows, Konditionen rows and the AH Bitrix UF fields (hours per visit, rhythm, monthly hours, number of Anfahrtspauschalen, per-service totals) are built from the same services (`ahDocServices(payload, "screen")`, `ahDocHoursFor`). The marker `ahZoneReading` keeps its name and now means „zone **and** services reading“. Under `"document"` nothing changes. `ahOfferTotals` is untouched (the React screen and the Kosten page read it through `ahInputFromPayload` as before).

**React Arbeitszeit.** `derived` writes `ahTravelZone` = the screen's zone (`zoneOf`, same Hof rule) with every travel-time write (route, zone button, typing). One gap found and closed: the address changed (e.g. into a Hof postcode) and no new route came — the travel time stayed, the saved zone kept the old postcode's zone. The zone is now re-derived in that case (`auto-route.ts` `refitAhZone`; only after a real address change, opening an offer still writes nothing). No printed figure depended on it any more (new offers read the screen's zone).

**Not guaranteed, left as is:** a send whose record could not be started (`beginSend` failed — the send goes on without a record, ADR 023) has no marker; it renders with the screen's figure but later counts as „sent before“ through its e-mail log → `"document"`. A signing request handed over without a `sendId` (clients that send none; today's UI and React send one) has no record → its page and signature use `"document"` consistently. An offer body without `offerNumber` is rendered with `"screen"`.

