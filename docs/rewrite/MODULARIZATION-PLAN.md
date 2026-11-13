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

### Phase 1 status (2026-11-12)

Done, without behaviour change (files moved, imports and paths adjusted; all v2 tests and the build green):

- `apps/server/src` now holds only `app.ts`, `server.ts`, `compose.ts` (composition root, no routes), `cli/`, `migrations/`, `platform/`, `integrations/` and `modules/`. The old `routes/` folder is gone.
- `platform/`: `auth`, `auth-gate`, `db`, `business-config`, `models`.
- `modules/`: `admin`, `auth`, `bitrix`, `catalog`, `deal-drafts`, `documents`, `email`, `misc`, `offers`, `planning`, `post`, `pricing`, `sends`, `signing`, `web`. Each has an `index.ts`; cross-module imports go through it (guard green).
- Tool for further moves: `v2/scripts/move-files.mjs`.

Also done (second round):

- Models: one file per topic in `platform/models/` behind the barrel `platform/models.ts`. They stay in `platform/` on purpose: most collections are read by many modules (offers 7, products 6, users 6), so module-owned models would only create import cycles. This replaces the "`model.ts` per module" idea of section 2.2.
- `misc` dissolved: Vigour prices and bulk import → `catalog`, submissions → `pricing`, external lookup → `offers`, API-key guard → `platform/external-key.ts`, `/health` → `app.ts`.
- `admin` split into `guard`, `settings`, `logs`, `users`; customers are their own module.
- Every `index.ts` lists exactly the names other code uses (no `export *`).

Still open in phase 1:

- Inside the modules, routes, rules and database access are still in the same files (`routes` / `service` / `repo` split) — do it module by module when a module is touched for the React rebuild, starting with `offers`, `pricing` and `catalog`.
- `modules/documents/ported/docx-template.ts` (generated copy, 2,700 lines) stays as it is until main stops changing the original.

### Phase 2 status (2026-11-12)

Done:

- **Typed offer** in `@oc/domain` (`offer.ts`): the offer of the React app IS the stored wizard payload, strictly typed — not a second model with converters (the pricing engine, the documents and old offers all read this shape). Types and defaults come from what today's UI stores for a new offer: `packages/domain/src/empty/<type>.json`, written by `v2/scripts/capture-empty-offers.cjs` (add-ons blocked; repeatable). `emptyOffer(type, context)` returns a fresh copy; day-, user- and settings-dependent values (date, contact person, signature user, `pricingRules`, mail text) are not defaults and come from the context. `withSection()` replaces fields of one section without changing the offer.
- **`@oc/api-contract`** (new package): shapes of the endpoints the React app needs first (login, session, version, price, price inputs, deal draft) plus `pathOf()`. The server's login, version and price-input routes are typed against it.
- Tests: every empty offer parses losslessly, carries nothing personal, and is priced by the engine as it is.

Changed against the plan:

- **`pricing/src/core.ts` is not split.** It is generated from main's `src/logic/pricing-core.js` and guarded to compile to exactly that file (`sync-with-legacy.test.ts`); a hand-made split would break every main sync. Split it after the cut-over, when main no longer changes the original — same rule as for `docx-template.ts`.
- Values the UI derives and stores (e.g. `Arbeitszeit.travelCostDebug`) are left out of the empty offer; each React screen adds its derived values through selectors and its parity test compares the stored payload with today's.

### Phase 3 status (2026-11-12)

Done — the foundation of the React app (`v2/apps/web/src`):

- `app/`: entry, providers, route table with lazy feature chunks, error and not-found pages. Addresses: `/` Hauptmenü, `/neu/:type/:step`, `/deal/:dealId/:type/:step`.
- `features/offer`: the offer store (Zustand; `start`, `load`, `close`, `patch`, narrow selectors), the price hook (TanStack Query; changes are collected for 250 ms, a running request is aborted when the offer changes), the step lists per offer type (guarded against the Playwright snapshots of today's UI) and the frame around the steps (only the active step is mounted).
- `features/home`, `features/auth`: Hauptmenü with the five offer types; login form in place of a page when not logged in.
- `shared/`: API client typed by `@oc/api-contract`, UI kit (page, field, button, notice, tile), formatting.
- v2 serves the built app under **`/app`** (`modules/web/register.ts`, Dockerfile); today's UI stays at `/` and is the default. A step without a React screen shows a link to the same step in today's UI.
- Measured (preview, 834×1194, CPU 6×): BU tile 52 ms blocked, 1 price request; back to Hauptmenü 0 ms, 0 requests; first load 213 ms blocked. Initial script 138 kB gzip (limit 150 kB).

Still open in phase 3:

- **Offline layer** (`shared/offline`): local-first saving (ADR 025), autosave to the deal draft, service worker for `/app`.
- **Price in the browser**: today the hook asks the server once per change; computing with `@oc/pricing` locally (server only confirms) comes with the first screens that change prices.
- **Offer context**: `emptyOffer` gets only the date so far; contact person, signature user and `pricingRules` are filled when Kundendaten is rebuilt.
- **Switch per screen**: there is no switch yet because no screen is rebuilt; the first rebuilt step (phase 4) adds it to `BUILT_STEPS` and the link from today's UI.
- The Hauptmenü chunk also loads the offer chunk (it needs the store and the titles) — 5.6 kB gzip, acceptable; split if it grows.

### Phase 4 status (2026-11-12) — first screen: Kundendaten, part 1

Today's Kundendaten page has about 130 inputs in 11 sections, so it is rebuilt in slices. Each slice is proven against what today's UI stores for the same inputs.

Done:

- **Shared draft between both UIs** (`features/offer/model/draft.ts`): opening an offer loads its deal draft (`/api/deals/:id/draft`), every change is saved 2.5 s after the last one, a draft changed elsewhere is never overwritten (409 → the user is told to reload). An offer without a deal number gets a temporary key `t-…` in the address, exactly like today's UI. This is the switch between the UIs: both read and write the same draft.
- **Handover to today's UI**: the link saves first, tells today's UI which offer type and step are open (session storage `konfigurator_state_v1`, the key today's UI itself uses) and opens `/?deal=…#step` or `/?entwurf=…#step`. Checked in a real browser in both directions; today's UI fills in the values the new app leaves blank (mail text, price settings, contact person).
- **Kundendaten, slice 1** (`features/steps/kundendaten`): contact, address, customer type, contact person. Reference: `apps/web/test/fixtures/kundendaten-contact.json`, recorded from today's UI by `v2/scripts/capture-kundendaten.cjs` (three scenarios); `test/kundendaten.test.tsx` types the same inputs into the React screen and compares the stored `Kundendaten`. Reproduced on purpose: switching "Ansprechpartner vorhanden" back to "Nein" empties only the name.
- Measured (preview, 834×1194, CPU 6×): typing 15 characters blocks 0 ms and causes 1 price request.

- **Kundendaten, slice 2**: payer and insurance details. Recorded for all five offer types (`kundendaten-payer.json`, 20 scenarios): Selbstzahler stores no insurance details and no `wohnumfeldDone`, stores the care-level/budget/Pflegekasse answers blank and deselects Abtretung and Vollmacht (also as letter attachments); back to Kassenkunde brings the entries back (not `wohnumfeldDone`, as today). The whole switch is one change of the offer. Birth date and insurance number are asked for every type except BU.

- **Kundendaten, slice 3**: care level and budget options (`care.ts`), recorded for all offer types (`kundendaten-care.json`, 68 scenarios). Only one of maximal / 2 Personen / Premium; co-payment needs one of them; the readout "Anrechenbares Budget" is display only. For two persons, name and greeting of both follow the entered names unless changed by hand. Not for Alltagshilfe: the budget options. Quirks of today's UI reproduced on purpose: "Premium" stays ticked when the care level is switched to "Nein"; when another option replaces "2 Personen", the empty fields of the second person stay stored; after Selbstzahler → Kassenkunde the care level and "Premium" are back, the other budget ticks are gone.
- **What Kundendaten fills in elsewhere** (found while recording, now recorded in `kundendaten-contact.json` as `outside`): the mail recipient follows the e-mail address; the letter recipient takes name and address when the field is left, but only while the letter's own field is still empty.
- Recorder: `CAPTURE_ONLY=<part>` records one file; every scenario now records the changes outside `Kundendaten`.

Findings about today's UI (not changed here):

- A corrected name or address is **not** carried to the letter recipient once that field was filled (fill-if-empty). The React screen does the same for now.
- After a reload, today's UI with the v2 draft add-on shows an **empty letter recipient** (and country "DE" instead of "Deutschland") although the draft has it — seen with today's UI alone, independent of the new app.

- **Kundendaten, slices 4 and 5**: the second person (`kundendaten-partner.json`, 16 recordings) and funding, property and notes (`kundendaten-object.json`, 50 recordings). "Miete" sets "Genehmigung des Vermieters erforderlich" to Ja by itself, "Eigentum" to Nein; "liegt vor" is asked and stored only for a rented home. Unticking "2 Personen" removes the second person's entries (the Anrede stays); ticking it again brings them back.

- **Kundendaten, slices 6 and 7**: Wohnumfeld (amounts of the subsidy already used) and the internal list (`kundendaten-extras.json`, 47 recordings; `extras.ts`), and what "Weiter" asks for (`kundendaten-next.json`, 66 recordings; `required.ts`). The amounts are stored only while the answer is "Ja"; the rows stay as entered. "Weiter" checks the markup first (Badumbau, Badewannentür, Handlauf: the user is taken to Aufschlag / Rabatt, as today), fills an empty date with today's, then names the missing fields in a message and puts the focus on the first. Steps register their check with `setStepCheck` (`features/offer/steps.ts`); the frame around the steps does not know the screens.
- Findings about today's UI (not changed there): with a contact person, their name **and address** are required; today's message names the care level "1" and the e-mail field "Email" — the React message uses the labels on the page; an amount typed with a comma into the amount field counts as 0.

- **Arbeitszeit** (`features/steps/arbeitszeit`): recorded for all five offer types (`arbeitszeit.json`, 103 recordings, `v2/scripts/capture-arbeitszeit.cjs`; the route service is answered by a fixed reply). Entered are distance, nights, time on site, travel time and the second worker's rate; work days, totals, travel days, the Alltagshilfe zone and `travelCostDebug` follow from them in the same change (`rules.ts`, `derived`). Measured at 834 × 1194 with 6x CPU throttle: 0 ms blocked, one price call per change.
- **Fixed on the way:** `emptyOffer` had no `Arbeitszeit.travelSecondWorkerRate`, so an offer started in the React app was priced with 25 €/h for the second worker's travel time instead of today's 35 €/h. The empty offers now carry the rate and `travelCostDebug`, as today's UI stores them.
- Deliberate differences on Arbeitszeit: "Weiter" names the missing fields in a message (today the browser marks one field); a duration can be deleted character by character (today the colon comes back); the preview lines write "Rückfahrt ×" instead of "Rueckfahrt x".

- **Arbeiten** (`features/steps/arbeiten`, Badumbau): 21 recordings (`arbeiten.json`, `v2/scripts/capture-arbeiten.cjs` — real clicks, because today's automatic ticking ignores scripted events). A change of the tasks writes `duschwanne` and the suggestion fields of `Arbeitszeit` in ONE change. Measured at 834 × 1194 with 6x CPU throttle: 0 ms blocked, one price call per change.
- **Fixed on the way:** an offer started in the React app stored an empty `pricingRules`. Today's UI stores a snapshot of the business settings with every new offer (task minutes, BWT free limits, Neukundenbonus) so later admin changes do not reprice it. `pricingRulesOf(config)` in `@oc/domain` builds the same snapshot from `GET /admin/api/config/public`; the recording compares it with today's.

- **Duschwanne** (`features/steps/duschwanne`, Badumbau): recorded with the answers of the tray search (`duschwanne.json`, `v2/scripts/capture-duschwanne.cjs`), so the test replays the same product lists. Off stores no tray, accessories or free item; the page keeps them and they are back when switched on. A picked tray (or a free item) ticks "Einbau der Duschwanne" while an Umbauart is chosen — the first product-driven rule of `WORK_RULES` in React (`syncTasks` in `arbeiten/rules.ts`, run after every change of these steps, as today).
- Findings about today's UI on Duschwanne (kept as they are): changing the product line drops the picked tray without asking; the stored size label (`traySize`) stays from the dropped tray after a line change; "Weiter" checks nothing on this step.

- **Fußboden** (`features/steps/fussboden`, Badumbau): 32 recordings (`fussboden.json`, `v2/scripts/capture-fussboden.cjs`) with the answers of the price list and the panel lines of the price. Every change writes `duschwanne` (with `computed`: adhesive packs, sealing set and rolls) and the flooring row of the work-time suggestion in ONE change. The number of panels is read from the price, as today — not computed in the browser.
- Findings about today's UI on Fußboden (kept as they are): picked values are stored twice (`flooringProduct` and `flooringProduct[]`, also adhesive and sealing); `addFlooring` is `true` but `addWallCladding` is the text "on"; after a change of the product line no covering is picked until the area changes, while the price still counts the Premium panels; changing the mode empties the mode that is left.

- **Wandverkleidung, slice 1** (`features/steps/wandverkleidung`, Badumbau): today's step has about 2,500 lines of logic, so it is built in slices. 38 recordings (`wandverkleidung.json`, `v2/scripts/capture-wandverkleidung.cjs`) for the frame and the line winwall. The catalogue names of the decors and the sealing sets come from `@oc/pricing` (the same functions the price uses).
- Findings about today's UI on Wandverkleidung (kept as they are): off keeps every entry (only `wvEnabled` is false); each product line stores only its own fields, the others are removed while it is not chosen and come back with it; every change of the rows overwrites the suggested adhesive and connecting profiles, also after they were changed by hand; "Weiter" asks for nothing on this step (its check is wired to a step name that does not exist).

- **Wandverkleidung, slice 2 — wall calculator** (`wandverkleidung/calc.ts`, `Drawing.tsx`): 23 recordings (`wandrechner.json`, `v2/scripts/capture-wandrechner.cjs`), line winwall. The plan of the plates is `winwallPanelPlan` from `@oc/pricing` — the function the price uses — so drawing, rows and price cannot disagree. Measured at 834 × 1194 with 6x CPU throttle: at most 108 ms blocked, one price call per change.
- Findings about today's calculator (kept as they are): the suggested connecting profiles are measured against the plan as it was BEFORE the change that wrote the rows; a plate added by hand to a row the walls made is lost with the next change of a width; today's page has no result line and no "take over" button on the line winwall (the code for them is there, the fields are not).

- **Wandverkleidung, slice 3 — line VIGOUR** (`wandverkleidung/vigour.ts`): 36 recordings (`wv-vigour.json`, `v2/scripts/capture-wv-vigour.cjs`, resumable with `RESUME=1` because this machine crashes at random). The rows are a view of the older fields, which stay the data (`panelConfigs`, `extraColors`, `wvColor`, `wvColor_<width>`, `wvQty<width>`). The wall calculator is now shared by the lines (a small "kit" per line: tiles, plan, texture, rows); VIGOUR plans with `vigourPanelPlan` and the purchase prices of the colour's two articles. The work-time suggestion now computes the panel and silicone rows from the stored panel table.
- Findings about today's UI on the line VIGOUR (kept as they are): tapping another row marks it but folds the tiles — only a second tap opens it; the adhesive is recomputed with every change of the rows, also after it was changed or switched off by hand; connecting profiles are never suggested on this line; after VIGOUR rows, changing to winwall keeps the panels in the stored panel table (without colours) and in the work-time suggestion, changing to Badolux empties the table but leaves `wvSupplier` on "hm"; the row order follows the fields (997 before 1497), not the order of entry.
- **Wandverkleidung, slice 4 — line Badolux** (`wandverkleidung/keramico.ts`): 35 recordings (`wv-badolux.json`, `v2/scripts/capture-wv-badolux.cjs`; `RESUME=1` also adds new scenarios to a finished recording). The rows (`wvKRows`) are the data; the first row names `wvColor` and the colour of the stored VIGOUR panel table. With every change of the rows: adhesive 2 per panel, connecting profiles panels − 1 (winwall accessories, shared). The first panel switches the four consumables on, the last one going switches them off. The work-time row `wvKeramico` (30 min per panel, fixed) is now computed in `arbeiten/rules.ts` and only counts on the line Badolux. Measured at 834×1194 with 6x CPU throttle: ≤53 ms blocked, 1 price call per change.
- Findings about today's UI on the line Badolux: the calculator shows no introduction text on this line (React shows it); the field "Anzahl Paneele manuell" (`wvKQty`) is never visible and is only read for old offers without rows — not rebuilt; the motif scroller writes `wvMotif`, which the price ignores as soon as rows exist (the row's name is used) — not rebuilt, the name field is; the decor tiles are loaded from the product list today, in React they are a fixed list of the seven WP products (a new Badolux decor needs a code change); leaving Badolux with rows blanks `wvColor`, the panel table and the consumables, and coming back does not restore the colour until the rows change; after Keramico rows the VIGOUR quantities start as "0" instead of empty.
- **Duschabtrennung, slice 1** (`duschabtrennung/{engine,wizard,rules,sketch}.ts`): 35 recordings (`duschabtrennung.json`, `v2/scripts/capture-duschabtrennung.cjs`). The engine and the drawings are today's code, ported unchanged to TypeScript. The VIGOUR catalogue (`GET /api/da-config/model/vigour`, about 10 MB) is loaded only once the switch is on; the test uses the real catalogue with the articles only of the enclosures the recordings reach (`da-model-vigour.json`, 320 kB). The cards are remembered while the offer is open; the offer gets `quickAdd` lines and `configurator` from an effect once every card's catalogue is loaded. Measured at 834×1194 with 6x CPU throttle: ≤58 ms blocked, ≤1 price call per change.
- **Duschabtrennung, slice 2**: the audit entry is sent directly and a failure is ignored (today it also waits in the offline queue — that comes with the offline layer); the server stores event, deal and offer type and drops the message text, today as well. Measured at 834×1194 with 6x CPU throttle: ≤69 ms blocked; lightbox and door animation cause no price call.
- Findings about today's UI on Duschabtrennung (kept, except where noted): the configuration is stored only while at least one card is complete — an offer saved with an unfinished enclosure reopens empty; a part that is sized by itself completes the card one drawing late, so "Neu konfigurieren" is missing until the next tap (React shows it at once); the page has no "Weiter" button and no check of its own; every answer on a second card re-prices the offer once the first card is complete (the stored answers change); only one of the ten widening profiles is offered; the quarter-circle trays and their stock texts are a fixed list in the code, not catalogue data.
- **Duschvorhang** (`duschvorhang/{plan,rules,drawing}.ts`): 31 recordings (`duschvorhang.json`, `v2/scripts/capture-duschvorhang.cjs`, with the catalogue the page loaded). Plan and drawing are today's code, ported unchanged to TypeScript (the plan no longer changes its input). New contract endpoint `vorhangProducts`. The curtain's lines are the last entries of `duschabtrennung.quickAdd` (group "Duschvorhang"); the enclosure step keeps them there. Measured at 834×1194 with 6x CPU throttle: ≤104 ms blocked, ≤1 price call per change.
- Findings about today's UI on Duschvorhang (kept): switching on puts the pair of rosettes (32 € net) into the offer at once, before any length is entered; clearing the length keeps rosettes and rings in the offer; the rings come back with every new length after they were switched off, and couplings / bends set by hand are overwritten by the next plan; the configuration is stored only while it has lines; the page has no "Weiter" button and no check of its own. React writes a typed length at once (today: 0.3 s after the last key).

Still open for Kundendaten: see the BU build order below.

Not yet: a link from today's UI into the new app (the way back is the address `/app/deal/<id>/<type>/<step>`), local-first saving on the device (ADR 025) in the new app.

### UI kit (owner decision 2026-11-12: shadcn/ui)

- `apps/web` uses **Tailwind CSS 4** and **shadcn/ui-style components** in `src/shared/ui/` (button, input/label, card, alert, toaster, plus `Page`, `Field`, `Tile`, `Choices`). They are our own files; a further shadcn component is added by copying its source into `shared/ui/` and importing `cn` from `../lib/cn.js`.
- **Theme** (`src/styles.css`): today's colours as CSS variables — default purple `#7c3aed`, the per-offer accents with today's names (`wohnen` for BU, `gesundheit` for BWT, `pflege` for AH and HL), light/dark via `<html data-mode>`. The mode is read from the same storage key as today's UI (`emc2.mode`), so the choice made there applies in the new app. Filled buttons use the strong accent so white text stays readable.
- **Sidebar**: today's progress marks (steps before the open one are done) and the numbered groups for BU, BWT and HL.
- **Toasts** (sonner): a failed or conflicting save and a failed handover are shown as a toast that stays until closed, in addition to the inline message. The toast library is its own chunk.
- **Size**: start script 142 kB gzip (limit 150 kB). To stay under it, `cn` is `clsx` only — no `tailwind-merge` — so a component's own classes and a passed `className` must not set the same property.
- Not chosen: Material UI (size, runtime-injected styles, Google look).
- **Header** (`app/Header.tsx`, as today's since U-008): logo and title; on the right the save state while an offer is open (and the "Speichern" button when automatic saving is off) and one user menu — name and e-mail, Farbthema, Dunkler Modus, Automatisch speichern, Zur bisherigen Ansicht, App neu laden, Abmelden. The menu is a native popover (no library in the start script; needs Safari 17 or newer).
- **Preferences** (`shared/lib/prefs.ts`): theme, dark mode and automatic saving are stored under today's keys (`emc2.theme`, `emc2.mode`, `oc.autosave`), so a choice made in either UI applies in both. Theme "Je Angebotsart" (nothing stored) follows today's default per offer type.
- **Sidebar**: stays in view on wide screens; on narrow screens the step list folds behind a button that names the open step.
- Still to match: the "Versionen" button (list and restore of saved versions), icons of the Hauptmenü tiles.

### BU (Badumbau) build order (owner 2026-11-12: build the whole BU section)

Sizes are today's page in `index.html`. Small pages with few inputs (Duschabtrennung, Duschvorhang, Kosten, Angebotscheck) hold most of their content in script-built widgets, so the input count understates them. Each step is built in slices; a slice is done when the recorded scenarios of today's UI match (stored data, changes elsewhere, visible parts) and it holds the pass mark at 6× CPU throttle.

| # | Step | Today | State |
|---|---|---|---|
| 1 | Kundendaten | 922 lines, 152 inputs | **Built:** contact, address, contact person, payer and insurance, care level and budget, second person, funding/property/notes, markup (Badelift only — see step 10). **Built too:** Wohnumfeld, internal list, the check on "Weiter". **Open:** uploads (Kasse, Vermieter), internal to-dos, preparation checklist, customer/draft search, Bitrix contact load, required-field check on "Weiter" |
| 2 | Arbeitszeit | 243 lines, 9 inputs | **Built:** way to the customer (distance, route suggestion, nights away; Alltagshilfe: travel zone), time on site, travel time with the second worker's rate, extra work (Badewannentür), check on "Weiter". **Open:** cost overview of the times, automatic suggestion (needs the steps that follow), route suggestion by itself when the address changes. |
| 3 | Arbeiten | 384 lines, 37 inputs | **Built:** Umbauart with automatic ticking, the 28 tasks in 7 groups with counts, dry-wall positions (+2 h each), free tasks, the automatic work-time suggestion from the ticked tasks. **Open:** ticking a task because its product was chosen (follows with the product steps; today's rules: `WORK_RULES` in `angebotscheck.js`), "Vorschlag übernehmen" on Arbeitszeit. |
| 4 | Duschwanne | 173 lines, 23 inputs | **Built:** switch, product line, size search in both lines, pick, cheaper Standard offer, dropped pick with "previous size", Slate colour, accessories, free item, "Ihre Auswahl"; the tray ticks "Einbau der Duschwanne" on Arbeiten. **Open:** offline search from the cached product list, large view of the reference photos. |
| 5 | Fußboden | 363 lines, 53 inputs | **Built:** switch and the two modes, mode "Fußboden": product line (with the question before a picked covering is dropped), scope, area with the area calculator, covering (Premium tiles, Standard from the price list), panels from the price, adhesive, sealing, "Ihre Auswahl", check on "Weiter". **Open:** mode "Wandverkleidung als Fußboden" (decor, panel format, rests of the wall cladding) — follows with Wandverkleidung. |
| 6 | Wandverkleidung | 787 lines, 104 inputs | **Built (slice 1):** switch, product line (each line keeps its own fields), Ausführung with the shower-area task, line winwall: rows of decor / format / number, decor by number, accessories with suggestions, sealing sets. **Built (slice 2):** wall calculator of the line winwall (situation, decor and width per wall, height, drawing, cut list; the walls write the plate rows). **Built (slice 3):** line VIGOUR (rows of colour / width / number, Sonderdruck, accessories and profiles, its calculator). **Built (slice 4):** line Badolux (Keramico rows of decor / number, Sonder-Dekor with motif name, winwall accessories without cutting service, Badolux accessories, its calculator). **Open (next slices):** sketch and note, and with them the Fußboden mode "Wandverkleidung als Fußboden". |
| 7 | Duschabtrennung | 134 lines + configurator (1,650 lines of script) | **Built (slice 1):** switch, cards (one enclosure each, VIGOUR or Badolux, add / remove), the wizard (structure → finish → sizes, answered rows, back, new configuration), widening profile, matching quarter-circle tray, pictures, Badolux drawings and product info, "Ihre Auswahl", the stored lines and configuration. **Built (slice 2):** picture lightbox (arrows, keys, swipe), the door animation of the drawing (tap, mouse over, once after the door or side was picked; none with reduced motion), the audit log entry per answer (`POST /api/bitrix/log-action`), a notice with a link to the old view when an offer has picks of the older page "Hassmann Duschsysteme". **Not rebuilt on purpose:** the older Hassmann page itself — today it is hidden unless an admin switch is on or an offer has picks from it; its picks stay in the offer and are priced. |
| 8 | Duschvorhang | 19 lines + configurator (550 lines of script) | **Built:** switch, situation (niche, corner, U-shape) with side lengths and drawing, the plan (curtain, rods, couplings, bends, ceiling supports, rings), every article with switch and quantity, other sizes, ceiling-support length, "Ihre Auswahl", the stored lines and configuration. |
| 9 | Optionale Produkte | 1,411 lines, 217 inputs | open — largest catalog |
| 10 | Aufschlag / Rabatt | 128 lines, 6 inputs | **Built:** markup (value, quick buttons, slider, minimum with reason, target-price search). **Open:** discount, Neukundenbonus, Haltegriff bonus, switch for old offers (Kleinmaterial rule) |
| 11 | Kosten | script-built | open — incl. line edits (ADR 024) |
| 12 | Angebotscheck | script-built | open |
| 13 | Angebotsversand | 605 lines, 31 inputs | open — mail, letter, signing, documents |
| 14 | Checkliste | 41 lines, 4 inputs | open |
| 15–16 | Referenzbilder (Vorher / Nachher) | — | open |

Steps 2–16 open in today's UI from the new app (same draft), so the offer can be finished at any time.

### Markup (Aufschlag) — where it lives

Recorded (`kundendaten-markup.json`, 40 recordings): for Badumbau, Badewannentür and Handlauf today's UI shows and stores the markup on the **Aufschlag / Rabatt** step (`rabatt.sonderaufschlagValue`); only Badelift, which has no such step, has it in Kundendaten (`Kundendaten.sonderaufschlagValue`). The value the price uses is `Kundendaten.aufschlag` in both cases. The React component `features/steps/markup` is used in both places. The target-price search is today's algorithm unchanged; on a real offer in the preview it returned the same markup as today's own function (23.4595 %, total one cent under the target).

### iPad Pro 11" portrait (834 × 1194)

- Below 1024 px the **sidebar is closed**: the form has the full width (798 px, two columns). A slim bar under the header names the step ("Schritt 1 von 16 · Kundendaten"), shows the total and opens the step list on demand; the list closes again when a step is chosen.
- From 1024 px (iPad landscape, desktop) the sidebar stays in view as before.
- "Weiter" and "Zurück" under every step lead through the offer without the sidebar. They do not check required fields yet.
- Checked at 834 × 1194 with touch: no control under 44 px, no sideways scrolling.

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
