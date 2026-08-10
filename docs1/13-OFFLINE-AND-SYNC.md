# Offline & Synchronization

The configurator is a **partially local-first PWA**. A technician who loaded
the app while online can keep working after losing signal, survive a reload or
a tab discard, and have their work sync automatically when connectivity
returns.

This document describes what exists **today**. For the planned extensions
(offline "heutige Planung" prefill, offline reopen of unsynced work, and the
iPad/WKWebView shell) see `docs/plan-ipad-local-first.md`.

---

## Design rules

Three rules explain most of the decisions below:

1. **A wrong number is worse than no number.** The service worker never caches
   API responses. Offline totals are computed by the server's own rules, not by
   a re-implementation, and are flagged so they can never be frozen into a
   quote.
2. **Never lose a user's save.** A failed write is queued, not dropped. Replay
   is idempotent, so retrying is always safe.
3. **Never restore silently.** Recovered state is always offered, never applied
   automatically — a silent restore over a deliberate fresh start is its own
   bug.

---

## Components

| File | Responsibility |
|------|----------------|
| `src/public/manifest.webmanifest` | PWA manifest (name, icons, `display: standalone`) |
| `src/public/sw.js` | Offline app shell — caches shell + images, never API data |
| `src/public/sw-register.js` | Registers `sw.js?v=<buildId>`, requests persistent storage |
| `src/public/OfflineSaveQueue.js` | IndexedDB write queue + reconnect replay + conflict handling |
| `src/public/PlanningCache.js` | Caches the "Heutige Planung" week + per-appointment Bitrix enrichment |
| `src/public/session-recovery.js` | Debounced work-in-progress snapshot |
| `src/public/pricing-cache.js` | Caches `GET /api/price/inputs` |
| `src/public/pricing-client.js` | Runs `src/logic/pricing-core.js` in the browser |
| `src/logic/pricing-core.js` | Dependency-injected pricing rules — runs on **both** server and browser |

iOS-specific meta lives in `index.html:14-20` (`apple-mobile-web-app-capable`,
`apple-touch-icon`, …) because iOS ignores the manifest's `display` mode.

---

## Client-side storage

| Store | Type | Key | Contents |
|-------|------|-----|----------|
| `nt-offline-save-queue` | IndexedDB | `id` (uuid) | Queued draft + offer POSTs |
| `nt-planning-cache` → `snapshot` | IndexedDB | `"current"` | `{payload, fetchedAt}` — the whole planned week |
| `nt-planning-cache` → `enrichment` | IndexedDB | `key` | Per-appointment Bitrix fields (Anrede, contact) |
| `nt-session-recovery` | IndexedDB | `"current"` | `{payload, offerType, step, savedAt}` |
| `nt-pricing-inputs` | IndexedDB | `"current"` | `{buildId, config, products, cachedAt}` |
| `nt-shell-<buildId>` | Cache Storage | request URL | App shell, JS modules, product images |
| `konfigurator_state_v1` | sessionStorage | — | `{offerType, step}` — **does not survive restart** |
| various | localStorage | — | Scattered widget state (`ahServices:v1`, `dw_tray_selection`, …) |

> **All IndexedDB and Cache Storage data is evictable.**
> `navigator.storage.persist()` is a no-op on Safari, which
> `sw-register.js` documents explicitly. Chrome grants it silently for
> installed PWAs. This is the main durability risk and the primary motivation
> for the native iPad shell.

---

## The service worker (`sw.js`)

Cache name is derived from `?v=` on the worker's own URL, which
`sw-register.js` fills from `GET /api/version` (`APP_BUILD_ID` — the Fly image
ref in production, the git HEAD hash locally). A deploy therefore changes the
worker's URL, the browser sees a new worker, and old caches are dropped on
`activate`.

**Routing rules:**

| Request | Strategy |
|---------|----------|
| Non-`GET` | **Not intercepted at all** |
| Same-origin `/api/*`, `/admin/*` | **Never cached** |
| `mode: navigate` | Network-first, cache fallback |
| Other same-origin | Stale-while-revalidate |
| `media.onlineplus.store` images | Cache-first |
| Other cross-origin | Not intercepted |

Two subtleties worth preserving:

- **Non-`GET` requests are deliberately untouched.** `OfflineSaveQueue` decides
  to queue by letting `fetch` reject. Synthesising any response in the worker
  would silently break offline saving entirely.
- **Only a real, first-party page may become the offline shell.** A redirect
  (`authGate` bouncing an expired session to `/login`) or an error page is
  never cached, or offline users would be stranded on it.

`warmShell()` on `activate` fetches `/` so the shell is available from the
*first* visit, not the second.

### What gets precached, and why it is discovered rather than listed

`install` caches three sets:

1. **Discovered from `index.html`** (`discoverShellAssets`) — the worker fetches
   `/`, regexes every `src`/`href` ending in `.js`/`.mjs`/`.css`, and caches the
   same-origin ones. This covers `style.css`, `script.js`, `ThemeManager.js`,
   `header-auth.js`, `admin-modal.js`, `ansprechpartner.js` and the whole
   `/configurator/` sub-app **without anyone maintaining a list**.
2. **Fonts found inside those stylesheets** (`discoverFontsFrom`) — icon fonts
   are referenced from CSS, not HTML, so a second pass extracts `url(...)`
   entries ending in `woff2`/`woff`/`ttf`. Without it Font Awesome renders as a
   giant black magnifying glass offline.
3. **The explicit `PRECACHE` list** — only modules reached through a dynamic
   `import()`, which no amount of HTML parsing can find, plus `/assets/logo.png`.

Images are deliberately **not** discovered: `index.html` references 118 of them
and they are almost all product photos, which the runtime cache picks up as
they are used. The header logo is the one exception.

**Why the runtime cache cannot replace this.** The worker does not control the
load that registers it, so those subresources never reach a `fetch` handler. On
every later load they are served from the HTTP/memory cache, so they never
reach one either — they would never enter Cache Storage at all. This was not
theoretical: `/style.css` was missing, and an offline relaunch on an iPad
rendered the whole app unstyled while every byte of user data was intact.
See the Phase 0 results in `docs/plan-ipad-local-first.md`.

**Kill switch** — if the worker ever ships broken, deploy a `sw.js` whose only
content is `self.addEventListener("install", () => self.registration.unregister())`
and remove the register call.

---

## Offline saving (`OfflineSaveQueue.js`)

`trySaveOrQueue({kind, offerKey, url, body})` is the **only** entry point call
sites use for a save.

```
trySaveOrQueue()
  ├─ stamp body with savedAt (user's save time) + clientSaveId (uuid)
  ├─ POST it
  │    ├─ response (any status) ──► return { queued:false, res }
  │    └─ fetch throws (offline) ─► store in IndexedDB, show badge,
  │                                 return { queued:true, id }
  │
retryAll()   ← on window "online", and on every page load
  ├─ read all records, SORT BY createdAt
  └─ for each: POST
       ├─ 2xx  ──► delete record, count as synced
       ├─ 409 draft ──► rename "<name>-offline-<id6>", retry, notify user
       ├─ 409 offer ──► delete + notify (real conflict, don't retry forever)
       └─ still offline ──► leave queued for the next sweep
```

**Why the sort matters:** IndexedDB `getAll()` returns primary-key order, and
the primary key is a random UUID. Replaying in that order lets an older save
land last and win. Sorting by `createdAt` makes the server see saves in the
order the user actually made them.

**Why 409 handling differs by kind:** a replayed save that already landed is
matched on `clientSaveId` server-side and answers 200, so a 409 on a draft is
always a collision with a genuinely *different* draft — renaming preserves the
user's payload. Offers upsert by `offerNumber`, so a 409 there is a rare but
real conflict that must be surfaced, not silently dropped.

**Current call sites:**

| Call site | Kind |
|-----------|------|
| `DraftsManager.js:235` (`quickSaveDraft`) | `draft` |
| `script.js:16056` (`saveFinalOfferSnapshot`) | `offer` |

> ⚠️ `ExportManager.js:386` posts to `/api/offers` with a **raw `fetch`**,
> bypassing the queue. That save is lost offline. Tracked as Gap 2 in
> `docs/plan-ipad-local-first.md`.

**Known ceiling:** there is no backoff or retry cap. A permanently failing
record retries quietly on every reconnect and page load.

---

## Session recovery (`session-recovery.js`)

Motivated by a real field report: a technician saved the survey, switched to
MagicPlan (LiDAR, memory-hungry), and iOS discarded the Safari tab. The
configurator holds its state **in the DOM**, so returning reloaded an almost
empty form.

- Snapshots `window.buildPayload()` on `input`/`change`, debounced 1200 ms
- Flushes on `visibilitychange → hidden` and `pagehide` — on iOS
  `beforeunload` frequently never runs when a tab is discarded
- Compares against a "pristine" baseline captured at init, so an untouched form
  never produces a restore prompt
- On next load, offers a banner: **Wiederherstellen / Verwerfen**. Never
  auto-applies
- Restores through the same path `DraftsManager` uses:
  `applyWizardState({offerType, step})` then
  `restoreConfiguratorFromSnapshot({payload})`
- Writes `offerNumber` back **last**, because boot mints a fresh one

Guard worth knowing about: if the user starts typing before the async init
resolves, the banner is suppressed for that load (the baseline would wrongly
include their live input) and the snapshot is kept for the next boot.

---

## Offline pricing

```
POST /api/price
   │
   ├─ succeeds ──────────────► server result
   └─ fetch throws (offline) ─► import("./pricing-client.js")
                                  └─ computePricesLocally(payload)
                                       ├─ loadInputs()  ← nt-pricing-inputs
                                       └─ pricingCore(productModelFrom(rows), {
                                            cfg: cfgFrom(config),
                                            fetchVigourNetPrices: () => new Map()
                                          })
                                  └─ { ...result, _local: true }
```

`GET /api/price/inputs` returns everything the browser needs to compute a total
without the server: every `CONFIG_SCHEMA` key plus the product table
(`productId`, `name`, `price`). Refreshed on every boot with signal; failure is
silent because an older snapshot beats none.

Three properties that must be preserved:

1. **Same code, not a re-implementation.** `pricing-client.js` imports
   `/logic/pricing-core.js` — the identical file the server uses. Two numbers
   that disagree would be worse than no number.
2. **`pricing-core.js` must never import mongoose** or anything server-only. It
   takes `ProductModel`, `cfg` and `fetchVigourNetPrices` by injection.
   `pricing-client.js` satisfies `ProductModel` with a `Map` behind the two
   query shapes the core actually uses (`find({productId:{$in}})`, `findOne`).
3. **`_local: true` results can never be frozen or locked.** A price freeze
   needs a figure the server confirmed. Live vigor net prices are unavailable
   offline, so the core falls back to configurator snapshot prices — exactly
   what it does server-side during a vigor outage.

---

## Offline "Heutige Planung" prefill

The primary field workflow: pick a planned appointment, pick an offer type, and
get the customer's Bitrix data prefilled. Two things stand between that and a
device with no signal.

**1. The appointment list.** `GET /api/planning/current` already returns the
**whole planned week** in one payload (`planning.days[].customers[]` plus
`planning.futurePlanned[]`), which the app fetches on every load. So the cache
is a single record:

```
fetchTodayPlanningSnapshot()
  ├─ 200 ─► render ─► PlanningCache.saveSnapshot(payload)   (fire-and-forget,
  │                └─ warmPlanningEnrichment(payload)         after rendering)
  └─ throws ─► PlanningCache.loadSnapshot()
                 ├─ hit  ─► applyTodayPlanningPayload(payload)  ← same render path
                 └─ miss ─► the existing "Fehler beim Laden" state
```

The payload is stored **verbatim**, after the Bitrix appointment times have
been merged into it in place, so a cache hit renders through exactly the same
code as a live response. There is no second mapping layer to keep in sync.

`updateTodayPlanningMeta` appends `· Offline – Stand <when>` whenever the
rendered week came from the cache. A stale plan presented as current would be
a worse failure than an error message.

**2. The Anrede.** The route-planning service carries no `HONORIFIC` field at
all, which is why `enrichPlanningAppointmentFromBitrix` exists — it fetches
`/api/bitrix/deal/:id` (or `/contact/:id`) and fills the salutation plus any
field the planning service left blank.

That is the one genuinely per-customer call, so it is warmed for the whole week
while the device still has signal:

```
warmPlanningEnrichment(payload)   — sequential, TTL-guarded (12 h)
  for each appointment:  fetchPlanningEnrichment() ─► saveEnrichment(key, fields)

enrichPlanningAppointmentFromBitrix(entry, generation)
  ├─ live answer  ─► saveEnrichment()  (refresh the cache)
  └─ no answer    ─► loadEnrichment()  (the on-site path)
       └─ applyPlanningEnrichment(fields)   ← same DOM writes either way
```

`planningEnrichmentFromContact()` is deliberately pure — no DOM, no network —
so the cached shape and the live shape are identical by construction.

The warm is **capped at `PLANNING_WARM_MAX_PER_LOAD` (25) fetches per page
load**, today's appointments first. Bitrix rate-limits: an uncapped sweep of a
real week reproducibly draws `Error: Too many requests` from
`routes/bitrix.js`, which then retries with backoff and slows the whole page.
Anything skipped is logged and picked up on the next load.

The enrichment key prefers the deal (`d:<dealId>`, else `c:<contactId>`),
mirroring the order the live lookup resolves in, so writes and reads agree.

**Not cached:** deal stages from `/api/bitrix/deals/stages`. They only hide
already-completed deals from the list, and an unknown stage already falls
through to "show it" — absent behaves the same as stale.

**Stream:** `connectTodayPlanningStream()` stays closed while
`navigator.onLine === false` (EventSource would otherwise retry in a loop
against a server that is not there) and is reconnected by the `online`
listener, which also re-fetches the week.

---

## Auth behaviour offline

`header-auth.js` calls `GET /api/auth/me` on load. If that request **throws**
(never reached the server), it deliberately does **not** redirect to `/login`:
the login page needs the network anyway, so a redirect would strand a
technician mid-visit, and with the shell cached it loops, re-encoding `next`
each hop. The session is re-checked on the next load that has signal.

Note the session token TTL is **7 days** with no refresh mechanism.

---

## Testing

Two layers:

**Unit** — `tests/unit/offline-save-queue.test.js` with an IndexedDB stub
(`tests/helpers/idb-stub.js`).

**End-to-end** — `tests/e2e/offline-sync/`, run with:

```bash
npx playwright test -c playwright.offline.config.cjs
```

This config owns its whole stack: `global-setup.cjs` spins up a throwaway
MongoDB (`mongodb-memory-server`) plus the real app, and it is the one suite
where `serviceWorkers: "allow"` — the offline shell must actually run.

| Spec | Covers |
|------|--------|
| `offline-sync.spec.cjs` | Queue ordering + replay against a **real** IndexedDB engine |
| `offline-pricing.spec.cjs` | Local pricing fallback |
| `offline-planning.spec.cjs` | Planning cache + prefill across a reload with the APIs down |
| `session-recovery.spec.cjs` | Snapshot + restore banner |
| `pwa-install.spec.cjs` | Manifest + service-worker registration |

> **Test-harness quirk — dynamic `import()` under Chromium offline
> emulation.** In `offline-planning.spec.cjs` the network is cut by aborting
> `**/api/**` rather than with `context.setOffline(true)`. Under a full
> Chromium offline emulation, *every* dynamic `import()` fails after a reload
> — `/pricing-client.js`, `/OfflineSaveQueue.js`, `/PlanningCache.js` — even
> though all are in `PRECACHE`, the service worker is controlling, and a plain
> `fetch()` for the same URL returns 200 from cache.
>
> **This is a CDP emulation artifact, not real behaviour.** Verified on
> 2026-08-10 in a WKWebView on an iPad simulator (iOS 18.6): with the server
> killed and the app force-quit and relaunched, all four modules imported
> fine. See the Phase 0 results in `docs/plan-ipad-local-first.md`. Keep the
> abort-based approach in the spec; do not "fix" it back to `setOffline`.

Unit coverage for the planning cache:

| Spec | Covers |
|------|--------|
| `tests/unit/planning-cache.test.js` | Store semantics: snapshot round-trip, key derivation, TTL, IndexedDB refusal |
| `tests/unit/planning-offline-prefill.test.js` | The prefill itself, driven through the real `script.js`: Anrede fills from cache offline, live answers are cached, a mid-flight form reset is discarded |

The unit suite's central claim — that `getAll()` hands back primary-key order —
is only ever asserted against a stub written to behave that way. The e2e suite
exists to check it against a real engine.

---

## What is *not* offline today

- Listing or reopening drafts (`GET /api/drafts/search`, `/api/drafts/:id`)
- All document generation (PDF/DOCX/LaTeX — needs LibreOffice, Chromium, texlive)
- Email sending, signing-link creation, CRM writes
- Product search, routing/distance suggestion, admin config
- Wizard position across an app restart (`sessionStorage`)
