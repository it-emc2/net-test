# Offline & Synchronization

The configurator is a **partially local-first PWA**. A technician who loaded
the app while online can keep working after losing signal, survive a reload or
a tab discard, and have their work sync automatically when connectivity
returns.

This document describes what exists **today**. For the planned extensions
(the iPad/WKWebView shell and the native bridge) see
`docs/plan-ipad-local-first.md`.

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
| `src/public/LocalDocsStore.js` | Drafts saved but not yet synced, so they can be found and reopened |
| `src/public/native-bridge.js` | Mirrors the save queue to the iPad shell so eviction cannot lose it. **Inert in a browser.** |
| `src/public/session-recovery.js` | Debounced work-in-progress snapshot |
| `src/public/pricing-cache.js` | Caches `GET /api/price/inputs` |
| `src/public/pricing-client.js` | Runs `src/logic/pricing-core.js` in the browser |
| `src/logic/pricing-core.js` | Dependency-injected pricing rules — runs on **both** server and browser |
| `src/public/tray-search-client.js` | Offline fallback for the Duschwanne suggestion boxes — runs `tray-search-core.js` against the cached `/api/price/inputs` snapshot |
| `src/logic/tray-search-core.js` | Dependency-injected tray matching/scoring/pricing rules — runs on **both** `routes/trays.js` and the browser |
| `src/public/auth-recovery.js` | Shared 401-on-save handler (flush session-recovery, toast, redirect to `/login`) — used by every save call site |

iOS-specific meta lives in `index.html:14-20` (`apple-mobile-web-app-capable`,
`apple-touch-icon`, …) because iOS ignores the manifest's `display` mode.

---

## Client-side storage

| Store | Type | Key | Contents |
|-------|------|-----|----------|
| `nt-offline-save-queue` | IndexedDB | `id` (uuid) | Queued draft + offer POSTs |
| `nt-planning-cache` → `snapshot` | IndexedDB | `"current"` | `{payload, fetchedAt}` — the whole planned week |
| `nt-planning-cache` → `enrichment` | IndexedDB | `key` | Per-appointment Bitrix fields (Anrede, contact) |
| `nt-local-docs` → `docs` | IndexedDB | queue `offerKey` | Not-yet-synced drafts, readable offline |
| `nt-session-recovery` | IndexedDB | `"current"` | `{payload, offerType, step, savedAt}` |
| `nt-pricing-inputs` | IndexedDB | `"current"` | `{buildId, config, products, cachedAt}` |
| `nt-shell-<buildId>` | Cache Storage | request URL | App shell, JS modules, product images |
| `konfigurator_state_v1` | sessionStorage | — | `{offerType, step}` — **does not survive restart** |
| various | localStorage | — | Scattered widget state (`ahServices:v1`, `dw_tray_selection`, …) |

> **All IndexedDB and Cache Storage data is evictable.**
> `navigator.storage.persist()` is a no-op on Safari, which
> `sw-register.js` documents explicitly, and `persisted()` returns **false**
> on the iPad — measured on the device, not assumed. Chrome grants it silently
> for installed PWAs.
>
> In a browser this remains a real risk. **Inside the iPad shell it is
> covered**: the save queue is mirrored to the app container and restored if
> the browser throws it away — see "Durability backstop" below.

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
   `import()`, which no amount of HTML parsing can find, plus a handful of
   fixed images (see below).

Images are deliberately **not** discovered: `index.html` references 118 of
them and they are almost all product photos, which the runtime cache picks up
as they are used. The exceptions, hardcoded into `PRECACHE` alongside
`/assets/logo.png`: the generic Duschwanne illustration shown under the tray
search, and the six Hassmann/Slate tray color swatches — all fixed, local,
always needed regardless of what was browsed before going offline, where a
miss reads as broken rather than "not yet viewed."

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
| `ExportManager.js` (final-offer save after export) | `offer` |

All four routed through `trySaveOrQueue` also share one auth-expiry path:
`auth-recovery.js`'s `handleSaveAuthExpired()` catches a 401 (session cookie
expired mid-edit), flushes the in-progress payload into session-recovery, and
redirects to `/login` with auto-resume — instead of surfacing a generic
"Speichern fehlgeschlagen" that gives no clue the work is still safe. This was
missing from `DraftsManager.js` and `ExportManager.js` until it was pulled out
of `script.js` into a shared module; check any *new* save call site actually
imports it rather than reimplementing 401 handling.

**Retry cap.** A record the *server* rejects (neither ok nor 409 — a malformed
payload, say) is counted, and after `MAX_ATTEMPTS` (5) it is marked `stuck`:
skipped by later sweeps, kept in the queue, and reported separately in the
badge as "N fehlgeschlagen". Without that it retried forever and the badge sat
permanently at "wird synchronisiert", which reads as a slow sync rather than a
failure. Being offline does not count towards the cap — `postRecord` returns
null then and the record is left untouched.

**Permanent connection/sync dot.** `#connStatus` in the page header (always
present, unlike the pending-count badge above which only exists inside a
summary widget once something is queued) shows one of three states, updated
by `renderBadge()` at the same trigger points as the badge — queue write,
retry sweep, and `online`/`offline` window events:

| State | Meaning |
|-------|---------|
| 🔴 offline | `navigator.onLine` is false — this is the OS interface check, so it can be briefly wrong on a captive portal; good enough for a status dot, where the native shell's `Reachability`-driven offline fallback screen is the thing that actually gates functionality |
| 🟠 syncing | online, queue has ≥1 non-`stuck` record |
| 🟢 synced | online, queue empty |

A `stuck` record alone does **not** turn the dot red or amber — that failure
mode is already covered by the "N fehlgeschlagen" badge text, so the dot
deliberately stays binary (network + pending-vs-not) rather than growing a
fourth state.

---

## Reopening work that has not synced yet

The queue guarantees a queued save is not lost. It cannot give the draft *back*
before it syncs: the drafts list and load both go through `/api/drafts`, so
with no signal the morning's work was invisible. Two customers before finding a
bar of signal is a normal morning.

`LocalDocsStore.js` (`nt-local-docs`) keeps a readable copy, keyed by the
queue's own `offerKey` so a record and the queued save it belongs to always
agree — and re-saving the same draft name overwrites rather than duplicating.

```
quickSaveDraft
  └─ trySaveOrQueue()  queued? ─► LocalDocsStore.save()

drafts list
  ├─ server reachable ─► /api/drafts/search  ⊕ local pending   (merged)
  └─ fetch throws     ─► local pending only

loadById("local:<key>") ─► LocalDocsStore.get() ─► same restore path as a
                                                   server draft

retryAll → 2xx ─► LocalDocsStore.markSynced()  (deletes it)
```

**Scope is deliberately narrow: only work that has not reached the server.**
Once synced, the normal search finds it, so the local record is deleted. The
store holds the backlog, not an archive — which is why it needs no index and
no pagination.

Local rows are merged into the list even when online: between saving and the
sweep landing, the server does not have the draft and the local store does, so
without the merge it would briefly vanish from the list. They are labelled
**"nur lokal"**, because "not yet visible to the office" is a real difference
to the person reading the list.

The bookkeeping is wrapped in its own `try`: it runs *after* the queue has
accepted the save, so a failure there must never be reported as a lost save.
Worst case the draft cannot be reopened until it syncs.

**Not covered:** offers. Reopening a pending *offer* is not a workflow anyone
asked for, and the pending count is already visible in the badge.

## Durability backstop (iPad only)

Everything IndexedDB holds is evictable and WebKit grants no persistent
storage, so a queued-but-unsynced save could in principle be reclaimed under
storage pressure — precisely the one thing the queue exists to prevent. Inside
the native shell the queue is therefore mirrored outside the web view.

```
queue changes ─► OfflineSaveQueue.onQueueChanged
                   └─ native-bridge.js ─► webkit.messageHandlers.durability
                        └─ DurabilityMirror.swift
                             └─ Application Support/offline-queue-mirror.json

next launch  ─► WKUserScript sets window.__nativeQueueMirror (documentStart)
                   └─ native-bridge.js: queue empty? restoreRecords()
                        ├─ rebuild the "nur lokal" drafts from the payloads
                        └─ retryAll()
```

Scope, deliberately narrow:

- **Only the save queue.** Its records carry the full payload of every unsynced
  draft and offer, so restoring it restores the work — and `nt-local-docs` is
  rebuilt from those same records. The planning and pricing caches are
  re-fetchable; losing them costs a round trip, not a day's work.
- **Existing records win.** The live queue is at least as fresh as a mirror
  taken earlier, so a restore never overwrites what is already there.
- **Not a backup.** It lives in the app container and goes when the app is
  deleted. It survives eviction, nothing more.
- **`native-bridge.js` is a no-op in a browser.** Without `window.webkit`
  nothing runs, so the office web app is unaffected.

**Verified on the device** (2026-08-11, iPad Pro 11" simulator): a draft saved
with the server down was queued and mirrored (9.6 KB with its payload);
`Library/WebKit` was then deleted to simulate eviction; on the next launch the
record was restored and synced. The resulting `Draft` in MongoDB carries
`savedAt` from when the user saved and `updatedAt` from the post-restore sync
— the whole chain, end to end.

---

### The wizard step across a restart — no change needed

`konfigurator_state_v1` lives in `sessionStorage` and dies with the app, so a
restart lands on the home screen. Promoting it to `localStorage` would be
worse, not better: the DOM holds the form values, so the app would jump back
into the middle of a wizard with every field empty, and only then offer the
restore banner.

`session-recovery.js` already does the right thing — it stores `step`
alongside the payload and replays both together through
`applyWizardState({offerType, step})` when the user accepts the banner. State
and position are restored as one, on consent.

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

## Offline tray search (Duschwanne)

```
GET /api/trays/suggest?w=&l=&h=&series=|source=
   │
   ├─ succeeds ──────────────► server result
   └─ fetch throws (offline) ─► import("./tray-search-client.js")
                                  └─ suggestTraysLocally({w,l,h,series,source})
                                       ├─ loadInputs()  ← nt-pricing-inputs
                                       └─ matchesTraySeriesAndSource() +
                                          matchesTrayDims() + scoreAndRank()
                                  └─ { ...result, _local: true }
```

Same shape as offline pricing, for the same reason: `tray-search-core.js`
holds the filter/scoring/pricing rules and is imported by **both**
`routes/trays.js` and `tray-search-client.js`, so a cached result can never
disagree with what the server would have said. No new snapshot either — the
existing `/api/price/inputs` product projection was extended with
`widthCm`/`lengthCm`/`heightCm`/`source` (harmless `undefined` on non-tray
products) rather than adding a second cache store.

This was safe to do because the matching is pure dimension filtering with no
live dependency: no stock gating, no live pricing feed (the Badolux discount
is a static `CONFIG_SCHEMA` value, already in the same snapshot). Unlike
offline pricing's `_local: true` vigor-net-price caveat, a cached tray result
carries no correctness risk — it just goes stale at the same cadence as an
admin-panel price change.

`initSmartTraySearch` (script.js) falls back to the local match on any fetch
failure that isn't a deliberate `AbortError`, and tags the row `(offline)` so
a cached result never looks identical to a live one. A genuinely-empty local
match says so explicitly ("Offline – keine passenden Vorschläge im
zwischengespeicherten Bestand") rather than reusing the online empty-state
copy — conflating "couldn't check" with "no matches" was the original bug
report this fixed.

**Not covered by this pattern**: the Badewanne text/dimension searches, the
screen-picker, the Optional-tab name/price resolution, and Duschvorhang's
catalog — all still call `/api/*` live with no offline fallback. See "What is
*not* offline today" below.

---

## Offline Wandverkleidung tab

Simpler than either pricing or tray search: the whole tab (`index.html`
~4446-4870, wired up by `setupWandverkleidungPage`, script.js:7407) is either
static HTML with no fetch at all (the decor/Farbe grid, sealing/profile
sections, premium panels — all hardcoded `<input>`/`<img>` pairs), or the one
live call, `loadBudgetWandPanels()` (script.js:5900), which lists the 7
Budget-Wandpaneele (Badolux `WP*`) products.

```
loadBudgetWandPanels()
   │
   ├─ GET /api/products?source=badolux&limit=800  (or ?q=badolux as fallback)
   │    succeeds ──────────────► live list
   └─ both fail / throw (offline) ─► import("./pricing-cache.js")
                                       └─ loadInputs().products
                                            filtered the same way: source ===
                                            "badolux" && productId starts "WP"
```

No new snapshot, no shared core module: this endpoint returns nothing
`/api/price/inputs` doesn't already ship for every product (`productId`,
`name`, `source` — `price` isn't even used here, it's resolved elsewhere via
`data-product-id` against the pricing snapshot, same as the static sections).
So the fallback is a plain `try/catch` around the existing fetches, not a
tray-search-style dependency-injected rules file — there was no
matching/scoring logic to keep in sync between two callers in the first
place.

**Images**: none of this tab's images are on `media.onlineplus.store`
(unlike the tray search's generic illustration) — they're all same-origin
`/assets/...`, either static `<img>` tags or, for the 7 budget panels, a path
built client-side from `productId` (`./assets/budget/${productId}.png`,
script.js:5930) that never appears in `index.html` for `discoverShellAssets`
to find. All ~26 files (~2.3 MB total: 19 static Wandverkleidung images +
7 budget-panel photos) are now hardcoded into `sw.js`'s `PRECACHE`, next to
the tray swatches — same reasoning: small, fixed, not per-visit opportunistic.

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
| `offline-drafts.spec.cjs` | Finding and reopening an unsynced draft; release on sync |
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
| `tests/unit/local-docs-store.test.js` | Pending-draft store: overwrite-by-name, offer-type scoping, release on sync |
| `tests/unit/tray-suggest-match.test.js` | `tray-search-core.js` rules, plus that the client-side predicates (`matchesTrayDims`, `matchesTraySeriesAndSource`) agree with the Mongo-filter cases (`buildTrayDimFilter`) they mirror |
| `tests/unit/offline-save-queue.test.js` (describe block `connection status dot`) | The three `#connStatus` states against a fake `navigator.onLine` and a stubbed queue |
| `tests/unit/wandverkleidung-offline.test.js` | `loadBudgetWandPanels()`'s fallback, driven through the real `script.js` (same eval-boot technique as `scriptBoots.test.js`, with a real `pricing-cache.js` stub): falls back on a failed fetch, empty cache doesn't throw, live fetch still wins when it succeeds |

The unit suite's central claim — that `getAll()` hands back primary-key order —
is only ever asserted against a stub written to behave that way. The e2e suite
exists to check it against a real engine.

---

## What is *not* offline today

- All document generation (PDF/DOCX/LaTeX — needs LibreOffice, Chromium, texlive)
- Email sending, signing-link creation, CRM writes
- Product search and catalogs **except Duschwanne tray sizing and the
  Wandverkleidung tab** (see above) — Badewanne text/dimension search, the
  screen-picker, Optional-tab name/price resolution, and Duschvorhang's
  catalog (`/api/vorhang/products`) all still fail live with no fallback
  offline
- Routing/distance suggestion, admin config
- Product photos not already viewed while online (opportunistic caching only —
  see the `PRECACHE` exceptions above for the handful that are always cached)
- The "Duschabtrennung (neu)" configurator tab's ~10 MB model file
  (`configurator/vigor-model.json`) is cached opportunistically, not
  precached, and is disproportionately likely to be evicted under iOS storage
  pressure given its size — a known risk, not yet fixed
- Wizard position across an app restart, other than through the session-recovery
  banner (see above — deliberate)
