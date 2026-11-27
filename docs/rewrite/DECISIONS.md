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

**Known, not fixed (listed for the owner):** the AH UF fields „Gesamtbetrag HnD“ and „Gesamtbetrag AB“ each include the combined Anfahrt (double count, legacy) — **fixed 2026-11-25 (U-072): each carries its own Anfahrt.** The DOCX prints the deduction uncapped (−131,00 € on a 34,10 € offer, Eigenanteil 0,00 €); the screen caps its minus lines so they add up. `PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT` (40 %) is still unused — the Umwidmung amount has no upper limit, as today.

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


## ADR 029 — winwall als Fußboden: further Dekors (owner, 2026-11-25; phase 1 built: pricing, storage, tests — screen follows)

**Decision (owner 2026-11-25).** The floor's „Wandverkleidung als Fußboden“ on the line winwall gets „+ weiteres Dekor“ like the Wandverkleidung step's winwall view. The price per plate depends on the format only.

| Topic | How |
|---|---|
| Data | First Dekor unchanged: `duschwanne.wallCladdingWwDecor`, `wallCladdingWwDecorCustom`, `wallCladdingWwQty` (and `wallCladdingQty` / `wallCladdingPanelSize` as today = the first Dekor). Further Dekors: ONE new optional field `duschwanne.wallCladdingWwMore` = JSON text (like `wallCladdingWwQty` / `wvWwRows`) of `[{ "decor": "WS229", "decorCustom": "", "qty": {"13":1,"15":0,"16":0,"17":1} }]` — `decor`/`decorCustom` mean what the first Dekor's two fields mean (`"custom"` + typed number), `qty` what `wallCladdingWwQty` means. Pricing also reads a real array. Absent, `""`, `"[]"` = no further Dekor. No DB change, no migration, no index: payloads are free-form (`Offer.payload` Mixed, `Draft.payload` Object, contract `z.record(unknown)`), so drafts, variants, sent offers and „Versionen“ keep it (test: `apps/server/test/deal-drafts.test.ts`). |
| Price | `winwallFloorMore()` + the floor block in the pricing core — TS **and** the legacy copy (`src/logic/pricing-core.js`, used by today's UI offline and kept identical by `sync-with-legacy.test.ts`), as in ADR 024. One group per Dekor (first, then the further ones; the same Dekor twice = one line per format), one line per Dekor and format in today's wording `- n Stk Aluverbundplatte <mm> — Dekor: <Name> (<WS 229>)`, list price per format. The Flächenkleber without a typed area counts the plates of every Dekor; with a typed area it stays area-based. „Reste anrechnen“ counts as „leftover only“ only when no Dekor has plates. An entry without a valid Dekor-Nr. or without plates is left out (like a wall row). `computeFingerprint` drops an empty `wallCladdingWwMore`. Without the field every result is byte-identical (golden 117/117, differential 115/115, new `packages/pricing/test/winwall-floor-more.test.ts`). |
| Downstream | Angebot/PDF, Kosten, signing page, Bestellliste, winwall cart (merges per article) and Bitrix amounts all read the priced lines — nothing else to change. The Arbeitszeit floor row is by `wallCladdingArea`, not by plates. |
| Old app (`main`, Fly) | Does not know the field. Opening such an offer shows and prices the first Dekor only; its form-built payload (`buildPayload`) drops the field on the next save, and its server recompute of a stored draft/offer (main's `pricing-core.js`) bills the first Dekor only. Same for today's UI served by v2 (classic view): its autosave sends `buildPayload()` → the field is lost there too. Consequence (open for the owner): offers with further floor Dekors must be edited in the React app only, or the old app must learn the field. |

## ADR 030 — „Angebotsart wechseln“: another offer type on the SAME deal (owner, 2026-11-26; built 2026-11-26)

A rep opened a deal as one offer type (e.g. Badumbau) and wants the same deal as another type (e.g. Badewannentür) — without a new Bitrix deal. Different from ADR 027 B („Weiteres Angebot“: a NEW deal). Changes ADR 027 A's "a deal has variants of ONE type".

**Owner rules.** Any type to any other type (the list of „Weiteres Angebot“: `SECOND_OFFER_TYPES` bu/bwt/hl/bl/ah — no hard reason found to widen it; Winterdienst / Hausmeister-Service stay a possible source only, `TYPE_SWITCH_TYPE_INVALID`). Same deal, **no Bitrix call at all** in this step. Copied: the Kundendaten only. The old offer is kept untouched as its own variant; the new type is a new variant, default name = the type's title (`OFFER_TYPE_TITLES`, editable). Exactly once per `creationId`. Allowed with sent offers; refused with a signed offer. Old app and sending behaviour unchanged.

| Item | As built |
|---|---|
| Endpoint | `POST /api/deals/:dealId/type-switch` `{ offerType, creationId, variantId? }` → `{ ok, creationId, dealId, sourceVariantId, variantId, variantName, offerType, revision, repeated }` (`@oc/api-contract` `switchOfferType`). Source = the given variant, else the one opened last. Server: `deal-drafts/type-switch.ts`, one route in `routes.ts` |
| Copy | ONE pure function for both features: `@oc/domain` `offerWithCustomerData` (empty offer of the target type + Kundendaten by the „Kunde suchen“ rule `restoreChanges` + date today + contact person = signed-in user + deal number in `auftragId` / `mail` / `postal`). `secondOfferPayload` now calls it; the contact-person step is shared too (`contactFieldsOf`). A customer field the target type does not store is skipped by `restoreChanges` (e.g. the Wohnumfeld answer for Alltagshilfe). Tested: both features on the same source store the same offer (only the deal number differs) |
| Exactly once | The new variant's id = `v-` + 12 hex of SHA-256(`type-switch|deal|creationId`): the existing unique index `uniq_deal_variant {dealId, variantId}` makes it atomic — no claim collection, no new index, no migration. A repeat answers the stored variant (`repeated: true`); the same id for another type / source: `TYPE_SWITCH_ID_MISMATCH`; the variant deleted meanwhile: `VARIANT_NOT_FOUND`. The variant document records `typeSwitch: { creationId, fromVariantId, fromOfferType, at }` (outside the payload) |
| Refusals | temporary key `TYPE_SWITCH_TEMP_DEAL`; the source's own type `TYPE_SWITCH_SAME_TYPE` (that is a variant); no draft / unknown variant `TYPE_SWITCH_SOURCE_MISSING`; **signed** (`dealSignature`: the recorded choice, a signed variant, or a completed signing request of the deal — also the old app's) → 409 `TYPE_SWITCH_SIGNED` |
| History | the new variant's first revision is kind `import`, note „Angebotsart gewechselt: Badumbau → Badewannentür (Kundendaten aus „Variante 1“)“; it becomes the variant opened last |
| Web | `SecondOffer.tsx`: type → **how** (`model/type-switch.ts`): „Auf diesem Deal (Angebotsart wechseln)“ / „Als neuer Deal (weiteres Angebot)“, one sentence each; the second is today's confirmation, unchanged. The planning's „Weiteres Angebot (…)“ now opens on „how“. „Auf diesem Deal“ is disabled with the reason when the variant list shows a signed offer (the server checks again). The open offer is saved first; success → `/deal/<id>/<type>/<first step>?variante=<new>` + notice. One creation id per dialog; kept on the device (`oc.typeSwitch.<deal>`) while the outcome is unknown. Also offered in the deal overview (U-073) |

**Places that assumed one type per deal — and what they do now.**

| Place | Before | Now |
|---|---|---|
| Server `assertSameType` (PUT draft, import) | a save with another type refused while there are several variants (`VARIANT_TYPE_MISMATCH`) | `assertKeepsType`: with several variants, a save / import / **restore** may not change an existing variant's OWN type; a one-variant deal may change its type as before. Protects today's UI (calls without variant act on the variant opened last) from writing another tile over a variant. Restore of a version of another type in a multi-variant deal is now refused too (before: unchecked); the Versionen panel shows the server's message |
| Storage | `offerType` per draft document already | unchanged; `liveVariants`, `listVariants` (`DealVariant.offerType`), revision history, send lock per variant, `resolveSendVariant` are type-free |
| Web address | path type = the deal's type; another type redirected with „Auftrag … hat bereits ein Angebot …“ | variant panel / overview open a variant on ITS type (`variantHref`: same step for the same type, else the type's start); an address naming the variant follows its type silently; an address of a type without variant opens the deal's variant of that type if there is one (`variantOfType`), else as before |
| Variant panel | name / status / total | + the type per row when the deal's types differ |
| Deal overview intro | „ein Angebot <Typ> in N Varianten“ | mixed: „Angebote Badumbau und Badewannentür in 2 Varianten“; rows already showed the type; a long name wraps the „zuletzt geöffnet“ note instead of breaking the word |
| Planning picker | overview only when the last-opened draft has the picked type | also when ANY variant has it |
| Old-app signing attribution (`variants.ts` `sameType`) | an unmatched old-app signing is shown on the deal's ONLY variant if same type | unchanged (mixed deals have ≥ 2 variants → not shown on any; the deal still counts as signed) |
| Signing: `markOthersNotChosen` + closing other links | every other variant | unchanged, type-blind by the owner's rule: a signed deal's other variants — of any type — are "not chosen" (hence the refusal above) |

**Findings, not changed (owner decision needed).**

- **Bitrix on send** (`modules/bitrix/write.ts`): `move-ang-verschickt` picks the pipeline only from the request's `offerType` (`write.ts:92` `isAh`, `:115` target): AH → `C52:UC_SNAVG8` (category 52), else `C38:UC_2ZDNEZ` (38) (`integrations/bitrix-deal.ts:10-11`); the deal's current category is not read. So on a deal whose first offer was Badumbau (HD, 38), **sending an Alltagshilfe variant moves the deal to the AH pipeline 52**, overwrites `opportunity` with the AH amount and writes the AH fields (`buildAhBitrixFields`); the HD fields of the earlier send (offer number `UF_CRM_1776156870205`, final total `UF_CRM_1768391021079`, Umbautage) stay as they were. The reverse (AH deal, then a building offer sent) moves it to 38 and leaves the AH fields stale. Between building types (bu/bwt/hl/bl) the pipeline is the same (38); amount / number / final total of the last sent offer win, as for variants. Kategorie Neu / Auszuführende Tätigkeiten (set when the deal was created) are written by no send / sign move — they keep naming the first type. The offer link (`UF_CRM_1790772236055`) follows the last sent offer (unless another is signed). After any signature `move-ang-verschickt` makes no call (`write.ts:84` `dealSignature`). **Recommendation for the owner:** decide whether a type switch between building ↔ Alltagshilfe on one deal is allowed to move the pipeline, or should be steered to „Als neuer Deal“ (e.g. allow the switch only within building types, or keep the deal's pipeline on send).
- **Bitrix on signature** (`modules/signing/routes.ts:423`, `bitrix-deal.ts:14-16, 204`): the stage follows the SIGNED offer's type (`isAhOffer`): AH → `C52:UC_7NLTX7`, else `C38:UC_ON3GS1` / `C38:UC_5DII17` — same pipeline consequence as above.
- **Old app** (`main`): does not read or write `deal_drafts` at all (no reference in `src/`); „Bitrix Deal laden“ (`src/public/script.js` `loadDeal` → `/api/offers/by-deal/:dealId`, `src/routes/offers.js:249`) lists only legacy `drafts` / `offers`, so it neither shows nor can overwrite or lose a v2 variant of either type. After a rollback export (`exportDealDraftsToLegacy`) each variant is its own legacy draft with its own `offerType` — two types do not collide (legacy unique index is (offerType, name)).
- **Today's UI served by v2** (`modules/web/addons/deal-draft.js`): its draft calls carry no variant (`:117`, `:189`); it opens the variant opened last with that variant's type (after a switch: the new type) and saves with the UI's current type. A different tile on a multi-variant deal is now refused (409, shown as its generic conflict message) — never written over the variant.

**Owner decision 2026-11-26 (pipeline).** Nothing in Bitrix changes at the switch — no move, no field. The deal changes only when the user SENDS an offer of the new type: the send then moves and writes as it does for that type today (above). All type combinations stay allowed, also building ↔ Alltagshilfe. Not decided: whether that send should also clear the first type's fields that stay with old values (HD offer number, final total, Umbautage; or the AH fields in the other direction).

**Not verified.** No real Bitrix call (none is made by the switch); the pipeline behaviour above is read from code, not observed. The dialog screenshots come from a harness with faked API answers.

## ADR 031 — Floor made only of leftovers: an unpriced plate line in the offer (owner, 2026-11-26; built 2026-11-26)

**Why.** Fußboden → „Wandverkleidung als Fußboden“ with „Reste anrechnen“ and no plate bought (`wcLeftoverOnly`: `wallCladdingUseLeftover`, plate quantity 0 for every Dekor incl. ADR 029's further ones, area typed) priced the Flächenkleber for the floor but listed no floor panel — the customer saw glue without a floor. Owner: show the plate, change no price; the user sees that it comes from the leftovers, the customer does not.

**Rule.** Applies to both floor lines (winwall, VIGOUR) only when leftover-only; with plates bought (with or without a partial leftover credit) nothing changes.

| Where | What |
|---|---|
| Offer DOCX/PDF, signing page (customer) | under FUSSBODEN, before the floor's Flächenkleber: winwall `- 1 Stk Aluverbundplatte — Dekor: <Name> (<WS 229>)`, VIGOUR `- 1 Stk Aluverbundplatte (<Farbe>)` — the floor's own Dekor / colour, none set → `- 1 Stk Aluverbundplatte`. No format (none was bought), no price (the BU material list prints no per-line price anyway; the block total is unchanged), no word about leftovers |
| App (user) | Fußboden „Ihre Auswahl“: row „Aluverbundplatte (aus Resten der Wandverkleidung)“ · `<Dekor/Farbe> · 1 Stück`, no price. Kosten: the same line under FUSSBODEN with quantity 1, empty Einzelpreis/Gesamt and the bracket note. The note is internal (`<Internal>`): hidden in Kundenmodus, the row stays |
| Not affected | totals, net, VAT, Aufschlag base, Eigenanteil, Zuschuss, discounts, Bitrix amounts, labour time, Flächenkleber quantity, `materials.lines`, `materialsDisplayUI` (Kosten sums, Angebotscheck, send questions), Materialübersicht/Bestellliste, Hassmann CSV, winwall/Badolux carts, product images, supplier codes, stock, plate counts, Wandverkleidung leftover maths, ADR 029 |

**Mechanism — one explicit flag, document copy only.** `@oc/pricing` `wallCladdingLeftoverOnly(dusch)` is now the one rule (the priced floor block uses it too), `floorLeftoverLine(dusch)` builds the line `{ productId: null, qty: 1, unitPrice: 0, lineTotal: 0, category: "Fußboden", label, name, color, displayOnly: true, note: "aus Resten der Wandverkleidung" }`, `withFloorLeftoverLine()` inserts it into **`materialsDisplayDocx` only** (computePrices, after the docx copy is built). Every order/cost consumer reads `materials.lines` and never sees it; the readers of `materialsDisplayDocx` were checked one by one: offer/signing (`mapData` MaterialsLines: shows it), Arbeitsbericht (shows the customer wording — it is the offer's list), Kalkulation (`buildCostLinesFromMaterials` skips `displayOnly` — one condition in `src/routes/kalkulation.js`, re-ported verbatim), BWT/CL60 lookups by article id (no id → no match), ExportManager label sanitising (text only). No magic product id. TS core and the legacy copy (`src/logic/pricing-core.js`) identical (`sync-with-legacy.test.ts`); sent (locked) offers return their stored snapshot, so their documents stay as sent.

**Golden masters — deliberate difference, recordings kept.** The fixtures stay the old app's recording. `tests/golden/deliberate-differences.mjs` lists the cases that must differ by exactly this line: pricing `offers-bu-KK-d43bbe`, `drafts-bu-KK-aeba4d`, `drafts-bu-KK-aeb927` (VIGOUR, Marmor weiß, 4 m²; the line inserted into `materialsDisplayDocx.lines`, everything else — totals to the cent — as recorded) and the DOCX snapshot `offers-bu-KK-d43bbe__offer` (one paragraph after FUSSBODEN); its `__material` snapshot is not listed and stays identical. Used by the TS and legacy pricing goldens and both DOCX goldens; the differential test (legacy vs TS) needs nothing. The web replay `fussboden-wand.test.tsx` lists its five leftover-only scenarios the same way (row inserted before the rest's row, else before the adhesive).

**Old app (`main`, Fly).** Unchanged: such an offer shows the Flächenkleber and no plate line. Today's UI served by v2 (classic view) computes with the same engine copy: its Kosten and Angebotscheck read `materialsDisplayUI` (no line); its documents are rendered by the v2 server (line present).

Tests: `packages/pricing/test/floor-leftover-line.test.ts`, `apps/server/test/floor-leftover-docs.test.ts`, `apps/web/test/fussboden-reste-zeile.test.tsx`.

## ADR 032 — Wandverkleidung „Ausführung“: two further answers; the wall-mounted WC's Vorwand plate (owner, 2026-11-27 „use best judgement“; built 2026-11-27)

**(A) Ausführung (`wandverkleidung.wvKind`).** Seven tiles from the smallest to the largest area, 4 per row on the iPad, 2 on a phone, each with its own sketch (`KindSketch.tsx`). Two new stored values, known only to the React app:

| Value | Tile / full text | Offer work note (`computeWorkNotes`, TS core **and** legacy copy, identical) |
|---|---|---|
| `Fliesenspiegel-Duschbereich` | Fliesenspiegel Duschbereich / „Fliesenspiegel im Dusch-/Wannenbereich“ | „Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich“ (the sentence `Fliesenspiegel` already prints) |
| `alle-Bad-Wände-halbhoch` | Alle Wände halbhoch / „Alle Bad-Wände halbhoch“ + field „Alle Bad-Wände bis Höhe … cm“ (`wandverkleidung.wvKindHoehe`, shown only for this answer, kept when another answer is chosen) | „Verkleidung aller Bad-Wände bis in einer Höhe von <cm> cm“, without a height „Verkleidung halbhoch aller Bad-Wände“ |

`wvKind` drives nothing but the work note and the Angebotscheck's „Art der Wandverkleidung fehlt“ (any value counts) — no price, no work time, no material (checked: pricing core, `arbeiten/rules.ts`, `arbeitszeit`, Angebotscheck, both UIs). Not added: „Alle Bad-Wände in Höhe des Duschbereichs“ (= halbhoch with that height) and „Duschbereich bis Höhe … cm“ (that is the existing Arbeiten task `wandverkleidung_duschbereich` + `duschwanne.wandverkleidungHoehe`, which stays a separate row and can be combined with any answer). Old values, texts and results unchanged: golden 117/117, differential 115/115, sync-with-legacy green; `packages/pricing/test/wv-kind-notes.test.ts`.

**(B) Wand-WC → 1 winwall plate 100 × 250 cm for the Vorwand.** The WC (Optionale Produkte → WC) mounted on the wall with the Conel VIS element `CVIS3WCT112` (quantity > 0) shows a card. Explicit, never silent (the automatic Arbeiten pattern does not fit cleanly: the plate merges into the rows of its Dekor, and the wall calculator / classic rows rewrite rows):

| Topic | How |
|---|---|
| Add | „Im Dekor der Wandverkleidung hinzufügen“: +1 plate format 15 in the first Dekor's row (`wvWwRows` via `fromRows`, so the existing suggestions follow: 2 bags of adhesive per plate; a connecting profile per extra plate while no wall plan is entered). „Anderes Dekor wählen“: the plate as a further Dekor (placeholder = the first palette Dekor not used), the Wandverkleidung step opens with it active and a note „bitte unten das Dekor wählen“. Wandverkleidung off: the card says so and the add switches it on |
| Track | `wandverkleidung.wvWcPlate` = `{ decor, count, note, picked, orphan }` (object, v2 only). `count` = plates 100 × 250 of that Dekor right after adding; another number later = changed by the user. A Dekor change of those plates (palette, typed number, row Dekor) moves the mark along (`followPlate`, inside `wvChanges`) |
| Remove | „Entfernen“ on the card: −1 plate of the marked Dekor, mark gone. The WC no longer wall-mounted / removed: unchanged plate removed automatically with a toast; a changed plate stays, a toast once, and the Wandverkleidung step asks „Platte entfernen“ / „Behalten“ |
| Arbeiten note | one line in „Weitere Arbeiten“ (`duschwanne.extraTasks`): „Verkleidung der Vorwand des Wand-WCs mit Wandverkleidung (1 Platte 100 × 250 cm)“ — added once (never twice, an identical line typed by the user is not taken over), removed with the plate only when the card added it and the text is unchanged. Free lines carry no time; the line is printed in the offer's „Auszuführende Arbeiten“ like every free line |
| VIGOUR / Badolux | hint only („bitte 1 Paneel 997 × 2550 mm“ / „1 Wandpaneel Keramico 950 × 2550 mm ergänzen“), nothing added: their panels have colour/quantity fields of their own and a VIGOUR panel adds 30 min through the Arbeitszeit rule |

**Old app (`main`) / today's UI served by v2.** Its radio group has no input for the two new values: such an offer opens with no Ausführung ticked, its „Weiter“ asks for the Art der Wandverkleidung, its Angebotscheck shows „Art der Wandverkleidung fehlt“, and its next save (`buildPayload`, form-built) **drops `wvKind`, `wvKindHoehe` and `wvWcPlate`**. The plate itself (a normal `wvWwRows` row) and the Arbeiten line (`extraTasks`) survive and print as usual. Open for the owner: edit such offers in the React app only, or teach the old app the values.

Tests: `apps/web/test/wv-wc-platte.test.tsx`, `apps/web/test/choice-tiles.test.tsx`, `packages/pricing/test/wv-kind-notes.test.ts`.

## ADR 033 — The deal's main contact follows the insured person; a contact is never overwritten with another person (owner, 2026-11-27; built 2026-11-27)

**Problem.** A deal's Bitrix contact is often a family member or other contact person, not the insured person the offer is for. Deal and main contact must carry the insured person; the other person is the Ansprechpartner.

**Decision.** The React app asks when Kundendaten is left (U-099) and writes to Bitrix right after the answer — not on send, because on-site signing and Heutige Planung read the deal before any send. Route `POST /api/bitrix/deal/:id/main-contact` (v2 only), logic in `integrations/bitrix-deal.ts` `changeMainContact`.

| Mode | Bitrix calls, in order |
|---|---|
| `replace` | `crm.deal.get` → `crm.contact.get` (old) → `crm.contact.list` NAME + LAST_NAME (old contact left out, PLZ rule of `ensurePartnerContact`) → none found: `crm.contact.add`; one found: reused unchanged; several: 409 `MAIN_CONTACT_AMBIGUOUS`, nothing written → `crm.deal.contact.items.get` → `crm.deal.contact.items.set` (new contact primary, every linked contact kept, old contact always kept) → `crm.timeline.comment.add` |
| `rename` | `crm.deal.get` → `crm.contact.get` → `crm.contact.update` NAME + LAST_NAME only → `crm.timeline.comment.add` |

Rules:
- **Another person never overwrites a contact.** The old contact keeps its name, numbers, history and other deals. Overwriting was rejected: the family member's phone and e-mail would sit under the insured person's name, and every other deal of that contact would be renamed unasked.
- **Phone / e-mail** go onto a new contact only when they differ from the old contact's (phone by digits, e-mail lower case): the family member's number is not copied onto the insured person.
- **The deal is read fresh first**; another contact than the one the user saw → 409 `MAIN_CONTACT_CHANGED`, nothing written.
- **Deal title and all other deal fields stay untouched.**
- **Bitrix never blocks the offer**: on failure the dialog offers „Trotzdem weiter“. A failed timeline comment does not fail the change (`commentFailed`).
- **„Nicht ändern“** is stored at the offer's top level (`mainContactKept` = contact id + typed name), outside Kundendaten: it reaches no document, price, customer record or customer copy. Today's UI may drop it when it saves the offer; the dialog then asks once more.
- Every user may answer; each write goes to `UserActionLog` (`main_contact_changed` / `main_contact_failed`).

**Known gaps.** (1) Not yet run against the real portal: the item shape of `crm.deal.contact.items.get/set`, that `items.set` moves the deal's `CONTACT_ID`, and that `HONORIFIC` is accepted by `crm.contact.add`. (2) `crm.contact.add` succeeding and `items.set` failing leaves an unlinked contact (answer 502; a retry reuses it by name). (3) With „Andere Person“ the Ansprechpartner fields are filled even when Bitrix then fails; the dialog returns on the next leave.

Tests: `apps/server/test/main-contact.test.ts`, `apps/web/test/main-contact.test.ts`, `apps/web/test/kundendaten-hauptkontakt.test.tsx`.

## ADR 034 — Supplier Kürzel per product line instead of per section heading (owner, 2026-11-27; built 2026-11-27)

**Decision.** `lineSupplierCode(line, payload)` (TS core and legacy copy, identical) gives the Kürzel of ONE material line or null. The offer document (`docx-template`, legacy original + verbatim port) and the Kosten step both call it; no new field on the price result, so the price goldens are byte-identical and a locked offer's stored price snapshot works unchanged. `supplierCodes()` (one code per section) stays for the Bitrix field „Material-Kürzel“, the material overview and the order list.

| Line | Kürzel | Read from |
|---|---|---|
| winwall plates, profiles, Abdichtungsset, Zuschnitt (`WS…`/`NW…`), in any of the four sections | WV-WW | productId |
| VIGOUR wall panels `V3WV…`/`V3WVK…` (also a floor plate ordered as one), profiles `V3A`/`V3V`, TRINNITY Wandabdichtung `TRWDSET…` | WV-HM | productId, hassmannArticle |
| Keramico panels `WP…`, Badolux wall accessories | WV-BX | productId |
| Leftover floor plate without price (ADR 031, no id) | WV-WW / WV-HM | payload `wallCladdingSupplier` |
| Catalogue tray `SLA…` / `DW…` / other | DW-SL / DW-BX / DW-HM | payload `chosenTrayProductId` |
| Any other Duschwanne line (Freier Posten) | DW-FP | payload |
| Everything else: Ramsauer adhesive, floor panels `V5FB…`, Hydroträgerplatte `BP…`, floor sealing `TRBDSET…`/`TRDB…`, all Duschabtrennung lines, Aluprofil für Trockenbau | none | — |

Only the sections Fußboden, Wandverkleidung, Duschwanne, Duschabtrennung; only Badumbau, as before. „Qualität und Normen“: once per distinct Kürzel of the section that has a sentence, after its rows.

**Deliberately without a Kürzel.** (1) Duschabtrennung: none is defined; the maker of a configurator line is in `configurator.state[].__supplier`, not on the price line. (2) Floor panels and floor sealing: WV-HM / WV-BX would print the wall panels' „Brandklasse B2“ sentence under FUSSBODEN, which is not established for those products. Both wait for the owner.

**Assumed.** TRINNITY Wandabdichtung counts as WV-HM (Haßmann product in the VIGOUR wall system).

**Differences to the recorded documents** (`tests/golden/deliberate-differences.mjs`, „Kürzel je Produkt“): five offer snapshots — headings lose the Kürzel, coded lines gain it; one gains „Qualität und Normen: Brandklasse B2“ under FUSSBODEN (VIGOUR leftover plate). A locked offer printed again shows the new form. The old app on `main` is unchanged; today's UI served by v2 shows no Kürzel on its Kosten page, its documents come from the v2 server and carry them.

Tests: `packages/pricing/test/line-supplier-code.test.ts`, `apps/server/test/line-codes-docs.test.ts`, `apps/web/test/kosten-kuerzel.test.tsx`.
