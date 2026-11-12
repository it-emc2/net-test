# Modularization plan — v2 frontend and backend

Status: PROPOSAL (2026-11-12), based on `rewrite/v2@1270b82d`. Nothing here is implemented.

## 1. Where we are

| Area | Today | Problem |
|---|---|---|
| React app `v2/apps/web` | 96-line shell, placeholder pages | No configurator exists in React yet |
| UI that v2 serves | Old UI from `src/public` (one `script.js`, 34k lines; `index.html`, 11k lines) plus 10 add-on scripts in `apps/server/src/web/addons` | One page, 27 steps, state lives in the DOM; 5–7 s blocked per tap on a throttled iPad profile |
| Backend `v2/apps/server` | 17k lines TypeScript, Fastify | Routes grouped by porting order, not by topic (`group3.ts`, `misc.ts`, `post.ts`, `api.ts`); all Mongoose models in one `models.ts`; `documents/ported/docx-template.ts` has 2,712 lines |
| Packages | `config`, `domain`, `pricing` | `pricing/src/core.ts` has 3,669 lines; `domain` only has a lenient read schema, no typed offer |

This plan replaces the "serve today's UI, move screens only for real gains" rule of ADR 021 with "rebuild every screen as a React module, one at a time". That needs a new ADR and owner sign-off before phase 3.

## 2. Target structure

### 2.1 Frontend — `v2/apps/web/src`

```
app/                 router, providers, layout, error boundary, auth guard
features/
  home/              Hauptmenü, "Öffnen" field, today's planning, quick search
  offer/             wizard shell: sidebar, step navigation, total widget, offer store
  steps/             steps shared by all offer types
    kundendaten/  arbeitszeit/  rabatt/  kosten/  angebotscheck/  versand/  checkliste/
  configurators/     one folder per offer type, each its own lazy chunk
    bu/              arbeiten, duschwanne, fussboden, wandverkleidung,
                     duschabtrennung, duschvorhang, optional
    bwt/  hl/ (incl. Flexofit)  bl/  ah/ (incl. Finanzierung)
  drafts/            local-first saving, versions, restore
  documents/         Dokumentenstudio, PDF preview, Kalkulation exports
  signing/           online signature, signing dashboard
  planning/          week calendar, Bitrix deal import
  admin/             users, prices, settings
  auth/              login, session recovery
shared/
  ui/                buttons, fields, tiles, dialog, notice (16 px text, 48 px targets)
  api/               typed HTTP client, one file per backend module
  lib/               formatting, dates, money
  offline/           service worker registration, local store, sync queue
```

Each feature folder has the same inner layout: `components/`, `model/` (state, selectors), `api.ts`, `routes.tsx`, `index.ts` (the only file other features may import), and `*.test.tsx`.

Rules that prevent the old performance problems:

| Rule | Replaces |
|---|---|
| An offer is one typed object in one store; components read it through narrow selectors | Reading 19 forms from the DOM on every change |
| New offer and "back to Hauptmenü" are one assignment: `offer = emptyOffer(type)` | `form.reset()` plus synthetic `change` events |
| Price, work time, mail text and Angebotscheck are derived by selectors, computed once per state change | 12 document-level `change` listeners and 9 `pricing:updated` subscribers |
| The price is computed locally with `@oc/pricing`; at most one debounced, abortable server call confirms it | 30–45 `/api/price` calls per tap |
| Every configurator and every heavy screen is a lazy route | One 1.3 MB script for everything |
| Only the active step is mounted | 27 pages hidden with `hidden`, still recalculating |
| No feature registers `document` or `window` listeners | Global listeners in `script.js` and the add-ons |

Libraries (recommendation): Zustand for the offer store, TanStack Query for server data, React Router lazy routes. Everything else stays plain React.

### 2.2 Backend — `v2/apps/server/src`

```
platform/            config, db, logger, errors, auth gate, security headers, migrations
modules/
  auth/              login, session, users            (from routes/api.ts, group3.ts, auth.ts)
  offers/            offers, legacy drafts, search    (offers-read.ts, offers-write.ts, misc.ts, legacy/search.ts)
  deal-drafts/       one draft per deal, versions     (deal-drafts/*)
  sends/             send records, offer numbers      (sends/*)
  pricing/           /api/price, price inputs         (routes/api.ts, business-config.ts)
  catalog/           products, trays, bathtubs, DA config, Vorhang, Vigour prices
                                                      (routes/catalog.ts, misc.ts, catalog/*, vigor.ts)
  documents/         DOCX, Kalkulation, Arbeitsbericht, material overview, PDF preview
                                                      (routes/documents.ts, documents/*)
  email/             offer mail, templates            (routes/email.ts, email/*)
  signing/           signing requests, sign page      (routes/signing.ts, signing/*)
  post/              letters via onlinebrief24        (routes/post.ts)
  bitrix/            deal and contact read/write      (routes/bitrix-read.ts, bitrix-write.ts)
  planning/          planning, calendar, routing      (routes/routing.ts, routing/*, todays-customers.ts)
  admin/             admin API                        (group3.ts, parts of signing.ts and bitrix-write.ts)
  web/               static files, add-ons, deal links (web/*) — shrinks as screens move to React
integrations/        outbound adapters only: bitrix, mail, gotenberg, onlinebrief24, magic, planning
```

Each module has the same inner layout: `routes.ts` (HTTP only), `service.ts` (rules), `repo.ts` (database), `model.ts` (its own Mongoose models, split out of `models.ts`), `schema.ts` (request and response shapes), `index.ts` (registers the module), and tests next to the code. A module may import `platform/`, `integrations/`, packages and another module's `index.ts` — never another module's internals.

### 2.3 Packages — `v2/packages`

| Package | Change |
|---|---|
| `domain` | Add the strict typed `Offer` per offer type, `emptyOffer(type)`, and converters to and from the stored legacy payload. The lenient read schema stays for old documents (ADR 002). |
| `pricing` | Split `core.ts` into one file per section (duschwanne, wandverkleidung, duschabtrennung, optional, bwt, hl, bl, arbeitszeit, rabatt) behind the same `index.ts`. The golden price tests stay unchanged and are the gate. |
| `api-contract` (new) | Request and response schemas shared by server routes and the web client, so both sides are typed from one source. |
| `config` | Unchanged. |

## 3. Phases

Every phase is one or more PRs into `rewrite/v2`. Nothing merges into `main` without owner OK.

| Phase | Work | Done when |
|---|---|---|
| 0. Preparation | Sync `main` into `rewrite/v2` (brings the iPad fix, PR #333). Add lint rules for module boundaries. Add the throttled tap measurement as a repeatable script with a budget. New ADR replacing the ADR 021 rule. | Sync merged; boundary lint and perf script run in CI; ADR accepted by the owner |
| 1. Backend modules | Move files into `platform/` and `modules/*` mechanically, no behaviour change. Split `models.ts`, `group3.ts`, `misc.ts`, `api.ts` by topic. Split `docx-template.ts` into data, rendering and template steps. | Route-parity guard reports 0 differences; all contract and parity tests green; no file in `routes/` left |
| 2. Shared packages | Typed `Offer` and `emptyOffer` in `domain`; `api-contract`; split `pricing/core.ts`. | Golden price tests identical; server and web compile against `api-contract` |
| 3. Frontend foundation | App shell, lazy router, offer store, API client, UI kit, offline layer. v2 serves the React app per screen behind a switch; the old UI stays the default. | Shell loads under 150 kB gzip; a deal URL opens in React and falls back to the old UI for screens not yet moved |
| 4. Screens, one at a time | Order: Hauptmenü → shared steps (Kundendaten, Arbeitszeit, Kosten, Versand) → BL → BWT → AH → HL → BU → Rabatt, Angebotscheck, Checkliste → Dokumente, Signing, Planning, Admin. | Per screen: same stored payload and same price as the old UI for the golden cases; tap blocks under 200 ms at 6x throttle; at most 1 price call per change; owner sign-off |
| 5. Retire the old UI | Per offer type, switch the default to React, then remove its add-ons and rewrites. When the last type is moved, v2 stops serving `src/public`. | No request reaches `src/public`; add-ons folder deleted; Playwright suites run against React only |

BL comes first among the offer types because it has the fewest steps; BU comes last because it has the most (15) and the largest catalogs.

### Phase 0 status (2026-11-12)

- Done: `main@1a35c453` synced (PR #335, merged); ADR 026; module-boundary guard (`v2/scripts/module-boundaries.mjs`, `apps/server/test/module-boundaries.test.ts`); tap measurement `npm run test:perf` (report-only step in the CI job "UI parity against v2").
- Baseline of the old UI as v2 serves it, 6× CPU throttle, 834×1194:

| Tap | Before the sync (`ac0ee22c`) | After the sync (with main's iPad fix) |
|---|---|---|
| BU tile | 6.2 s blocked, 33 price calls | 2.0 s blocked, 8 price calls |
| Back to Hauptmenü | 5.4 s, 30 | 1.7 s, 7 |
| Customer from the planning | 6.8 s, 32 | 1.7 s, 7 |

The two columns come from different harnesses (local preview vs. the Playwright test stack), so they show the order of magnitude, not an exact comparison. The pass mark for React screens stays 200 ms and one price call.

## 4. Risks

| Risk | Mitigation |
|---|---|
| `main` changes the old UI almost daily, so rebuilt screens drift | Move one screen at a time; freeze that screen on `main` while it moves; parity test per screen compares stored payload and price |
| Old offers must stay readable (ADR 002) | Converters between the typed `Offer` and the legacy payload, tested against the golden fixtures |
| Two UIs in parallel during phase 4 | The switch is per screen and per user; the old UI stays the default until sign-off |
| Local-first saving (ADR 025) lives in add-ons today | It becomes `shared/offline` in phase 3 with the same server endpoints, before any configurator moves |

## 5. Owner decisions (2026-11-12)

1. Approved: every screen is rebuilt in React, one at a time. This replaces the ADR 021 rule; a new ADR records it.
2. Approved: Zustand and TanStack Query.
3. Order of offer types in phase 4: BU, BWT and AH first (most used), then HL and BL. This overrides the order in the phase table above.
4. Phase 0 starts with syncing `main` into the branch.
5. During phase 1 the other session pauses its changes on `rewrite/v2` until the backend move is merged.
