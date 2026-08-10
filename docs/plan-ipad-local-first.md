# iPad / iOS local-first configurator — inspection report & staged migration plan

Status: **inspection only**. Nothing in this document has been implemented. No
existing file was modified, moved, or deleted to produce it.

> **Revision 2** — updated after clarification from the field:
> - Reading *existing* offers offline is **rare**. Demoted.
> - **The main functionality is prefilling Bitrix data for offers in "heutige
>   Planung".** Full weeks are planned in advance and the data comes from the
>   route-planning app. Promoted to the top priority (**Gap 0**, §14).
> - *"They change the apps so sometimes Safari clears data."* This is the
>   decisive argument for the native shell — see "Are we still going iOS?".

---

## Are we still going iOS? — Yes, and your last message made the case stronger

The iOS app was never the expensive part of this plan; the *rewrite* would have
been, and we are not doing that. What you just described is exactly the problem
a native shell solves and a PWA structurally cannot:

**"They change the apps so sometimes Safari clears data."**

That is the whole argument. In mobile Safari your offline data lives at the
mercy of the browser: the 7-day eviction cap on script-writable storage, Safari
"Clear History and Website Data", storage pressure from other tabs, and
`navigator.storage.persist()` being a **no-op on Safari** — the code already
knows this ([sw-register.js:12](../src/public/sw-register.js)). In a WKWebView
inside your own app, the data lives in your app's container. It is gone only if
the app is deleted, and Phase 4 mirrors it to a file so even that is survivable.

So the split stands:

| | |
|---|---|
| **Are we writing Swift business logic?** | **No.** Not one pricing rule. `pricing-core.js` stays the single source of truth, running identically on server and device. |
| **Are we shipping an iOS app?** | **Yes.** A thin WKWebView shell — roughly 400–600 lines of Swift, all of it platform plumbing (downloads, Keychain, reachability, background task). |
| **Does the office web app change?** | Only to gain the offline fixes, which help office users too. No UI or workflow change. |

The iPad app is the *storage guarantee*. The web app remains the product.

---

## Executive summary (read this first)

**The compelling reason not to rewrite in Swift is stronger than expected, and
the compelling reason to build a native persistence/sync layer is weaker than
expected.**

This repository is already a **partially local-first PWA**. Somebody has
already done the hard architectural work:

| Capability | Already exists | File |
|---|---|---|
| Offline app shell (cache, versioned, kill switch) | ✅ | `src/public/sw.js` |
| Service-worker registration + persistent-storage request | ✅ | `src/public/sw-register.js` |
| PWA manifest + iOS `apple-mobile-web-app-*` meta | ✅ | `src/public/manifest.webmanifest`, `index.html:14-20` |
| IndexedDB save queue with replay-on-reconnect | ✅ | `src/public/OfflineSaveQueue.js` |
| Idempotent server-side replay (`clientSaveId`) | ✅ | `src/routes/drafts.js`, `src/models/Draft.js` |
| Conflict handling (409 → rename / notify) | ✅ | `OfflineSaveQueue.js:retryAll` |
| Crash/tab-discard recovery snapshot | ✅ | `src/public/session-recovery.js` |
| Offline pricing (same rules as server) | ✅ | `src/logic/pricing-core.js` + `pricing-client.js` + `pricing-cache.js` |
| Offline test suite in real Chromium | ✅ | `tests/e2e/offline-sync/` |

The comments in `session-recovery.js` even name the exact field incident you
are solving for: *"a technician saved the survey, switched to MagicPlan (LiDAR,
memory-hungry), and iOS discarded the Safari tab."*

**Therefore the recommendation is: a thin WKWebView shell, not a native
persistence layer.** The remaining gap is not "build local-first" — it is
"close three specific holes in the existing local-first layer, and stop iOS
from evicting the data." A native Swift Core Data / SQLite mirror of the
20k-line payload model would be a second source of truth for the same data and
is the single largest risk on the table.

The real gaps are in §14. The biggest one — **Gap 0, the "heutige Planung"
Bitrix prefill** — turns out to be one of the cheapest to close, because
`/api/planning/current` already returns the whole week in a single payload the
app fetches on every load. See §13b.

Also found, unrelated to this project but needing a decision: **a Bitrix
webhook secret is served publicly from a dead file** — §20, S1.

---

## 1. Current architecture

```
┌──────────────────────────────────────────────────────────────┐
│ BROWSER (Safari / PWA / future WKWebView)                    │
│                                                              │
│  index.html (10,050 lines)  ← all wizard markup, all forms   │
│  script.js  (27,698 lines)  ← window-global monolith         │
│  style.css  (~6,500 lines)                                   │
│                                                              │
│  ES-module managers (dynamically imported at boot,           │
│  script.js:14563-14850):                                     │
│    DraftsManager, RestoreManager, ExportManager,             │
│    EmailManager, AdminManager, BadoluxManager,               │
│    IntegrationsManager, DrawingPadManager,                   │
│    SignaturePadManager, ThemeManager, TodaysCustomers        │
│                                                              │
│  Offline layer (already present):                            │
│    sw.js / sw-register.js       shell cache                  │
│    OfflineSaveQueue.js          IndexedDB write queue        │
│    session-recovery.js          IndexedDB WIP snapshot       │
│    pricing-cache.js             IndexedDB pricing inputs     │
│    pricing-client.js            runs pricing-core in browser │
│                                                              │
│  Sub-app: /configurator/ (Duschabtrennung wizard, ES modules)│
│  Sub-app: /signpage/ (customer signing page, public)         │
│  Sub-app: /admin/ (config panel, own token)                  │
└──────────────────────────────────────────────────────────────┘
                     │ fetch, credentials: include
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ EXPRESS 5 (src/app.js, 625 lines, ESM)                       │
│  helmet/CSP → CORS allowlist → compression → morgan →         │
│  json(25mb) → /login + /api/auth (public) → authGate → routers│
│  → static(src/public) → SPA fallback (GET /.*  → index.html)  │
│                                                              │
│  ~30 routers in src/routes/                                   │
│  Business rules: src/logic/pricing-core.js (2,464 lines)      │
│                  src/logic/offerMapping.js (716 lines)        │
└──────────────────────────────────────────────────────────────┘
        │              │                │              │
        ▼              ▼                ▼              ▼
   MongoDB Atlas   Vigor MongoDB   External APIs   Local binaries
   (KonfiguratorDB) (read-only,     (Bitrix24,     (LibreOffice,
                    product prices)  ORS, Binect…)  pdflatex, Chromium)
```

Deployed as a Docker image on **Fly.io / fra** (`fly.toml`), image carries
LibreOffice + texlive + Chromium.

**Key structural fact:** the frontend state lives **in the DOM**.
`buildPayload()` (`script.js:3996-4734`) walks `document.getElementById("form-*")`
and serialises them. There is no in-memory model to mirror natively. This is
the decisive argument against a Swift data layer: the only thing that can
produce the canonical payload is the page itself.

---

## 2. All application entry points

### Server process entry points
| Entry | Notes |
|---|---|
| `src/app.js` | The real entry (`package.json main`, `npm start`, `npm run dev`) |
| `src/server.js` | Legacy, appears unused — **verify before touching** |

### HTTP entry points that serve a UI
| Path | Serves | Auth |
|---|---|---|
| `GET /login` | `public/login.html` | public |
| `GET /sign/:token` | `signingPageHandler` → `/signpage/` | public (token) |
| `GET /admin/*` | `public/admin/index.html` | own admin token |
| `GET /.*` (SPA fallback) | `public/index.html` | session required |
| `GET /pdfjs/*`, `/vendor/fontawesome/*`, `/assets/*` | static | public |

### Frontend boot sequence
1. `index.html:10042-10046` — classic scripts: `ThemeManager.js`, `script.js`,
   `admin-modal.js`, `header-auth.js`, `ansprechpartner.js`
2. `index.html:5017` — `<script type="module" src="/configurator/boot.js">`
   (+ `boot-dev.js`, `vorhang.js`)
3. `script.js:14563+` — async dynamic `import()` of every manager module,
   including the offline stack (`OfflineSaveQueue` 14683, `session-recovery`
   14701, `pricing-cache` 14716, `pricing-client` 14721, `sw-register` 14736)
4. `handleBoot()` (`script.js:388`) restores `{offerType, step}` from
   `sessionStorage["konfigurator_state_v1"]` + URL hash

**Implication for WKWebView:** the boot path is entirely URL-driven. Loading
`https://…/` in a WKWebView reproduces it exactly. No entry point needs a
native equivalent.

---

## 3. All API / network calls

### Client → own server (grouped by offline-criticality)

**Must work offline (write path):**
| Endpoint | Caller | Already queued? |
|---|---|---|
| `POST /api/drafts` | `DraftsManager.js:235` via `trySaveOrQueue` | ✅ |
| `POST /api/offers` | `script.js:16056` via `trySaveOrQueue` | ✅ |
| `POST /api/offers` | `ExportManager.js:386` **raw fetch** | ❌ **gap** |

**Must work offline (read path):**
| Endpoint | Caller | Offline story |
|---|---|---|
| `POST /api/price` | `script.js:10836` | ✅ falls back to `pricing-client.js` |
| `GET /api/price/inputs` | `pricing-cache.js:refreshInputs` | ✅ cached in IndexedDB |
| `GET /logic/pricing-core.js` | `pricing-client.js` import | ✅ precached by `sw.js` |
| `GET /api/version` | `sw-register.js` | ✅ fails soft |
| `GET /api/auth/me` | `header-auth.js:25`, `EmailManager.js:969` | ✅ explicitly tolerates offline |
| `GET /api/drafts/search`, `GET /api/drafts/:id` | `DraftsManager.js:151,172` | ❌ **gap** — no local index |

**Online-only (acceptable):**
`/api/offers/search-all`, `/api/offers/by-deal/:id`, `/api/customers*`,
`/api/products*`, `/api/services*`, `/api/bitrix/*` (10 endpoints),
`/api/routing/suggest-distance`, `/api/magic/search`, `/api/post/send`,
`/api/hl/parse-flexofit-offer`, `/api/vorhang/products`, `/api/adobe-pdf/batch`,
`/api/users`, `/admin/api/config/public`, `/api/submissions` (legacy),
`/pdf`, `/pdf-template`, `/docx-template`, `/docx-template/pdf`,
`/material-overview*`, `/api/email/send-offer`, `/api/signing`,
`/kalkulation/*`, `/arbeitsbericht/*`.

### Server → outside world
| Host | Purpose | Route |
|---|---|---|
| `emczwei.bitrix24.de` | CRM REST webhook | `routes/bitrix.js`, `services/bitrixClient.js` |
| `api.openrouteservice.org` | geocode + route | `routes/routing.js` |
| `photon.komoot.io`, `nominatim.openstreetmap.org` | geocode fallback | `routes/routing.js` |
| `router.project-osrm.org` | route fallback | `routes/routing.js` |
| `route-plannung.fly.dev` | planning service (SSE) | `routes/planning.js` |
| `app.binect.de` | postal delivery | `routes/post.js` |
| Hassmann (`EXTERNAL_API_BASE`) | shower-enclosure products | `routes/magic.js` |
| Adobe PDF Services | doc generation | `routes/adobe-pdf.js` |
| SMTP + IMAP | mail send + sent-folder append | `routes/email.js` |
| MongoDB Atlas ×2 | `KonfiguratorDB` + `vigor` | `app.js`, `external/vigorDb.js` |

---

## 4. All MongoDB operations

Two connections:
- **Primary** — `mongoose.connect(MONGODB_URI, {dbName: MONGODB_DB})` in
  `app.js`, db `KonfiguratorDB`.
- **Secondary** — `external/vigorDb.js` `mongoose.createConnection(…, {dbName:"vigor"})`,
  **read-only**, live net prices, collections `products` / `models`.

| Collection | Model | Operations |
|---|---|---|
| `Products` | `Product.js` | `bulkWrite` upsert, `find`, `findOne` — read by pricing, trays, bathtubs, admin |
| `Services` | `Service.js` | `bulkWrite` upsert, `find`, `findOne` |
| `Offers` | `Offer.js` | `findOneAndUpdate({offerNumber}, upsert:true)`, `find`, `findOne` |
| `Drafts` | `Draft.js` | `create`, `findOne`, `findById`, `aggregate` (search) |
| `Kundendaten` | `Customer.js` | upsert by `customerNumber` or `(firstName,lastName,company,email)` |
| `EmailLogs` | `EmailLog.js` | `create` |
| `SigningRequests` | `SigningRequest.js` | `create`, `findOne({token})`, `find({offerNumber})`, `save` |
| `Submissions` | `Submission.js` | `create` (legacy) |
| `AppConfigs` | `AppConfig.js` | `find`, `updateOne` — read through `configService` |
| `BitrixLogs` | `BitrixLog.js` | `create` |
| `Users` | `User.js` | `findOne({email})`, `create`, `save` |

**The only two collections the iPad writes are `Offers` and `Drafts`.**
Everything else is read-only from the device's perspective, or written by a
server-side flow (email/signing/CRM) that already requires connectivity.

---

## 5. Where data is currently persisted (client side)

| Store | Key / DB | Contents | Survives app restart? |
|---|---|---|---|
| IndexedDB | `nt-offline-save-queue` / `queue` | queued draft+offer POSTs | ✅ (evictable) |
| IndexedDB | `nt-session-recovery` / `snapshot` | debounced `buildPayload()` WIP | ✅ (evictable) |
| IndexedDB | `nt-pricing-inputs` / `inputs` | products + config for local pricing | ✅ (evictable) |
| Cache Storage | `nt-shell-<buildId>` | app shell, modules, product images | ✅ (evictable) |
| `sessionStorage` | `konfigurator_state_v1` | `{offerType, step}` | ❌ |
| `sessionStorage` | `dw_tray_touched`, `dw_bathtub_touched`, `dw_screen_touched`, `badolux…`, `ExportManager` snapshot key | UI flags | ❌ |
| `localStorage` | `ahServices:v1`, `ahNote:v1`, `dw_tray_selection`, `dw_screen_selection`, `dw_floor_sealing`, `nt-theme`, area/seal keys, various repeater keys | scattered widget state | ✅ |
| **DOM** | — | **the actual canonical form state** | ❌ |

Note the scatter: `resetAllForms()` (`script.js:2244-2330`) has to enumerate a
hardcoded list of `localStorage`/`sessionStorage` keys to clear. That list is a
maintenance hazard and a source of cross-offer leakage, but it is **not** on
the critical path for this project.

**"Evictable" is the single most important word in this table** — see §20.

---

## 6. Important application state

| State | Owner | Notes |
|---|---|---|
| Wizard position `{offerType, step}` | `sessionStorage` + `currentOfferKey` global | lost on restart today |
| All form values | **DOM** | serialised on demand by `buildPayload()` |
| `window.__pricing` | in-memory | last pricing result |
| `window.__frozen` / `__frozenPricing` | in-memory → payload | price freeze; **must never be set from a `_local` result** (`pricing-client.js` marks locally computed results `_local:true` for exactly this reason) |
| `window.__locked` | in-memory → payload | full edit lock |
| `window.__kleinInAufschlag`, `__bwtKmFreeThreshold`, `__bwtTravelTimeFreeHours` | in-memory → `payload.pricingRules` | per-offer rule snapshot so reopening an old offer doesn't adopt today's config |
| `window.__DW_COMPUTED__` | in-memory | Duschwanne computed block |
| `window.__managers` | in-memory | manager registry |
| `window.__loadingOffer` | in-memory | re-entrancy guard around restore |
| Duschabtrennung configurator instances | `configurator/boot.js` `entries[]` | own engine state, rehydrated from payload |
| Signature / sketch PNG data URLs | hidden inputs → payload | `SignaturePadManager`, `DrawingPadManager` — fully client-side |

Restore entry points (all `window`-global, already used by drafts, offers and
session recovery — **reuse these, do not invent new ones**):
`applyWizardState({offerType, step})`, `restoreConfiguratorFromOffer(doc)`,
`restoreConfiguratorFromSnapshot({payload})`, `buildPayload()`,
`getCurrentOfferType()`, `getCurrentStep()`.

---

## 7. Customer / offer / configuration data model

### `payload` — the universal document (Draft.payload ≡ Offer.payload ≡ recovery snapshot)

```jsonc
{
  "activeOffer": "bu",              // bu|bwt|hl|bl|ah|hms|wd
  "offerNumber": "ANG2026-0420-143022",
  "Kundendaten":   { salutation, firstName, lastName, email, phone, street,
                     city, postalCode, customerNumber, bitrixContactId, dealId,
                     emc2_contact, payer: "kk"|"sz", pflegegrad, zuschuss,
                     aufschlag, wohnumfeld, … },
  "Arbeitszeit":   { arbeitszeit, reisezeit, arbeitstage, reisetage,
                     distanceKm, roundTripKm, extraHoursTotal },
  "duschwanne":    { tray, tray_color, entry, drain, sealing, flooring,
                     workTasks[], computed: {…} },
  "wandverkleidung": { panelColor, panelType, … },
  "duschabtrennung": { … configurator engine state … },
  "optional":      { "opt_<PID>": true, "qty_<PID>": "1", … },
  "rabatt":        { bonusGrab, bonus300, materialDiscountPct },
  "bwt" | "hl" | "ah" | "hms" | "wd" | "Finanzierung": { … },

  "pricingRules":  { kleinInAufschlag, bwtKmFreeThreshold, bwtTravelTimeFreeHours },
  "frozen": false, "frozenPricing": null, "locked": false,
  "signature":     { dataUrl, signedAt },
  "includeOurSignature": true, "ourSignatureUser": "t.raithel",
  "auftragId": "…",
  "postal": { … },
  "mail":   { auftragId, to, subject, body },

  "savedAt": "ISO",        // stamped by trySaveOrQueue
  "clientSaveId": "uuid"   // stamped by trySaveOrQueue → server idempotency
}
```

`filterPayloadByOffer()` strips sections irrelevant to the active offer type
before save.

### Persisted documents
- **Draft** — `{name, offerType, payload, savedAt, clientSaveId}`,
  unique `(offerType, name)`.
- **Offer** — `{offerNumber (unique), offerType, payload, pricing, status,
  customer{…}, hassmannQuickAdd[], pdfUrl}`, upserted by `offerNumber`.
- **Customer** — denormalised master record in `Kundendaten`.
- **SigningRequest** — `{token, offerNumber, customerType, payloadSnapshot,
  prefill, documents[{key,status,signatureImage,signedAt,signedIp,userAgent,…}],
  status, expiresAt}`. The snapshot is deliberate: later offer edits must not
  change what was signed.

---

## 8. Authentication flow

Cookie/Bearer hybrid, no external dependency (`services/authService.js`):

1. `POST /api/auth/login {email,password}` → scrypt verify against
   `User.passwordHash` (`salt:hash`)
2. Server mints `base64url(exp:email).hmac_sha256` with `AUTH_SECRET`,
   **7-day TTL**, sets `net_session` httpOnly cookie (`sameSite:lax`,
   `secure` in prod) **and returns the same token in the JSON body**
3. `authGate` (`middleware/authGate.js`) runs before all routers:
   - public: `/login`, `/api/auth/*`, `/api/health`, `/api/version`, static
     assets by extension, `/pdfjs`, `/vendor`, `/signpage`, `/assets`
   - public signing: `/sign/*`, `/api/signing/*` except `/api/signing/status`
   - **explicit carve-out:** `/logic/*` is *not* a public asset even though
     `.js` matches — pricing rules stay behind the session
   - external machine callers: `/api/offers/external/*`,
     `/api/arbeitsbericht/external/*` via `X-API-Key`
   - `/admin/*` self-guards
   - everything else: `verifyToken(tokenFromReq(req))`; HTML GET → redirect
     `/login`, otherwise `401 JSON`
4. `tokenFromReq` accepts `Authorization: Bearer <token>` **or** the cookie.

**This is close to ideal for WKWebView.** `Bearer` support means a native shell
can hold the token in the iOS Keychain and inject it, without depending on
`WKWebsiteDataStore` cookie persistence. `header-auth.js:36-41` already
documents the offline rule: *a fetch that never reached the server says nothing
about the session* — it deliberately does **not** bounce to `/login` offline.

Gap: 7 days is short for a field device that may not connect for a while, and
there is no refresh. See §20.

---

## 9. PDF generation flow

Five separate pipelines, all server-side:

| Pipeline | Route | Engine |
|---|---|---|
| DOCX→PDF (main offer) | `POST /docx-template/pdf` | docxtemplater + PizZip → **LibreOffice `soffice`** |
| Direct PDF | `POST /pdf`, `POST /pdf-template` | PDFKit / pdf-lib |
| HTML→PDF | `utils/htmlToPdf.js` | **Puppeteer/Chromium**, single reused browser, `PUPPETEER_EXECUTABLE_PATH` in Docker — used by the signing documents |
| LaTeX→PDF | `POST /latex-template` | `pdflatex` (texlive in image) |
| Adobe | `POST /api/adobe-pdf/*` | Adobe PDF Services SDK |
| Material overview | `POST /material-overview` | PDFKit |
| Kalkulation | `POST /kalkulation/pdf`, `/pdf-v2` | DOCX→PDF and HTML→PDF |

Client flow: `ExportManager.js` sanitises material labels → `fetch(endpoint)` →
`response.blob()` → `URL.createObjectURL` → download.

**All of it depends on binaries in the Docker image. None can move to the
device. This is correctly server-side and must stay there.**

---

## 10. Email flow

`POST /api/email/send-offer` — multipart (`multer`), fields `attachments[10]`,
`bitrixDocs[5]`, `editedDocx[1]`:

1. parse `payload` JSON out of the multipart body
2. **create a SigningRequest** and substitute `{{SIGN_LINK}}` in the body
   (`routes/email.js:388-408`) — failure is soft, placeholder stripped
3. generate the offer PDF (`generateOfferPdfBuffer`) *or* convert an uploaded
   hand-edited DOCX (`convertDocxToPdf`)
4. build HTML via `lib/emailTemplate.js`, send with **nodemailer** over SMTP
5. append to the IMAP Sent folder (`imapflow`)
6. write an `EmailLog`
7. post a **Bitrix timeline comment** with attachments
8. optionally move the Bitrix deal stage

Fully server-side and fully online. Correct.

---

## 11. Signing flow

| Step | Endpoint | Auth |
|---|---|---|
| create | `POST /api/signing` (also implicitly from email send) | session |
| dashboard feed | `GET /api/signing/status/:offerNumber` | session |
| customer opens | `GET /sign/:token` → `public/signpage/` | **public** |
| load request | `GET /api/signing/:token` | public (token) |
| render doc | `GET /api/signing/:token/documents/:key/html` | public |
| preview PDF | `GET /api/signing/:token/documents/:key/pdf` | public |
| submit signature | `POST /api/signing/:token/documents/:key` | public |

- token: `crypto.randomBytes(24).toString("hex")`, 14-day expiry
- documents by customer type: SZ → `angebot`; KASSE → `+ vollmacht`,
  `abtretung`, `zusatzblatt`; AH → `abtretung_ah`
- signature stored as PNG data URL + audit trail (`signedIp`, `userAgent`,
  `place`, `signedAt`)
- `payloadSnapshot` frozen at send time
- signed PDF rendered via `templates/signing-docs.js` → `htmlToPdfBuffer`
- rollup status recomputed from per-document status

**Separate from** the on-device `SignaturePadManager` signature, which lands in
`payload.signature.dataUrl` and works fully offline. Two different mechanisms,
don't conflate them.

---

## 12. CRM integration (Bitrix24)

`services/bitrixClient.js` + `routes/bitrix.js`, webhook base
`BITRIX_WEBHOOK_BASE` → `emczwei.bitrix24.de`. Calls logged to `BitrixLog`.

| Endpoint | Direction |
|---|---|
| `GET /api/bitrix/contact/:id`, `/contact/:id/deals` | pull → prefill Kundendaten |
| `GET /api/bitrix/deal/:id`, `/deals/stages` | pull |
| `GET /api/bitrix/deal/:id/ang-verschickt-fields` | pull |
| `POST /api/bitrix/deal/:id/move-ang-verschickt`, `/move-zuteilen` | push (stage move) |
| `POST /api/bitrix/timeline/comment` | push (25 MB, with attachments) |
| `GET /api/bitrix/activities/today`, `/calendar/week` | pull (today's customers) |

All online-only. All correctly server-side (the webhook secret must never
reach a device).

---

## 13. External dependencies

**Runtime binaries in the image (Dockerfile):** Node 23-slim, LibreOffice
25.8.4 (`soffice`), texlive (`pdflatex`), Chromium (Puppeteer), fonts.

**npm, server-relevant:** express 5, mongoose 8, helmet, cors, compression,
morgan, multer, dotenv, axios, node-fetch, dayjs, nodemailer, imapflow,
puppeteer, docxtemplater + pizzip + docxtemplater-image-module-free,
docx-templates, mammoth, pdfkit, pdf-lib, pdfjs-dist, `@adobe/pdfservices-node-sdk`,
soffice, pdflatex.

**Frontend:** no framework. `@fortawesome/fontawesome-free` served from
`node_modules`; PDF.js served from `/pdfjs` **and** whitelisted from
`unpkg.com` in CSP.

**Third-party services:** MongoDB Atlas ×2, Bitrix24, OpenRouteService, Photon,
Nominatim, OSRM, Binect, Hassmann, Adobe PDF Services, SMTP/IMAP,
`route-plannung.fly.dev`.

**Deployment:** Fly.io `angebotskonfigurator-emc2-v2`, region `fra`,
shared-cpu-1x / 1 GB.

**CSP constraints that matter for WKWebView** (`app.js:80-175`):
`connectSrc` is `'self'` + a short allowlist; `frameAncestors` is an allowlist;
`scriptSrc` uses **inline hashes**. A native shell that injects its own inline
`<script>` will be blocked unless it is added to the hash list — use
`WKUserScript` at `.atDocumentStart` in an **isolated content world** instead,
which is not subject to page CSP.

---

## 13b. The "heutige Planung" prefill flow (the primary use case)

Traced end to end in `script.js:25613-26870`. This is the flow that must work
offline, so it is documented in full.

```
initTodayPlanningPanel()                              script.js:26825
  │  (on DOMContentLoaded)
  ├─► fetchTodayPlanningSnapshot()                    script.js:26625
  │     ├─ GET /api/planning/current ──► routes/planning.js ──► route-plannung.fly.dev
  │     │     returns { planning: { days:[{ customers:[…] }],
  │     │                           futurePlanned:[…] } }
  │     ├─ GET /api/bitrix/activities/today  (start/end times per deal)
  │     └─ applyTodayPlanningPayload() ─► renders today list + week calendar
  │
  └─► connectTodayPlanningStream()                    script.js:26671
        └─ EventSource /api/planning/stream  (live updates, SSE)

user taps a planning card
  │
  ├─► openPlanningOfferPicker(entry)                  script.js:25661
  │     └─ user picks BU / BWT / HL / AH / WD / HMS
  │
  └─► applyPlanningAppointmentToForm(entry, offerKey) script.js:26698
        ├─ startOfferFlow(offerKey)
        ├─ setPlanningValue(#firstName #lastName #phone #email
        │                   #street #postalCode #city #bitrixContactId)   ← pure DOM
        ├─ setTimeout 120ms → #auftragId, #mailAuftragId, #postAuftragId
        │                   → AH: preselect Reisezone from entry.zone
        └─ enrichPlanningAppointmentFromBitrix(entry, generation)  script.js:26770
              ├─ GET /api/bitrix/deal/:importDealId       → contact
              ├─ GET /api/bitrix/contact/:contactId       → fallback
              └─ fills salutation (HONORIFIC) + any blank email/phone/address
```

### Why this is very good news

**Three quarters of the prefill is already offline-capable.** Everything in
`applyPlanningAppointmentToForm` up to the enrichment call is pure DOM writes
from fields **already present on the `entry` object**: `name`, `phone`,
`email`, `street`, `postalCode`, `city`, `contactId`, `importDealId`, `zone`.

And critically: **`/api/planning/current` already returns the whole week in one
payload** — `planning.days[].customers[]` *plus* `planning.futurePlanned[]`.
The app fetches the full week today and only *renders* today from it
(`applyPlanningPayload` also feeds the week calendar, `script.js:26863`).

So "cache the week's planning data" is not a new pipeline. It is **one
IndexedDB store plus a fallback branch in one function**.

### What actually needs the network

| Piece | Endpoint | Offline plan |
|---|---|---|
| Week's appointments + customer basics | `GET /api/planning/current` | **cache the snapshot** |
| Live re-planning updates | SSE `/api/planning/stream` | skip offline, resync on reconnect |
| Appointment start/end times | `GET /api/bitrix/activities/today` | cache alongside the snapshot |
| Deal stage (hide done deals) | `GET /api/bitrix/deals/stages` | cache; stale is harmless |
| **Salutation (Anrede)** + blank-field backfill | `GET /api/bitrix/deal/:id` / `/contact/:id` | **warm-cache per deal** — see below |

`enrichPlanningAppointmentFromBitrix` is the only genuinely per-customer call.
The route-planning service has no `HONORIFIC` field at all, which is why it
exists. Two options:

- **(a) Client-side warm, zero server change.** After a successful snapshot
  fetch, walk the week's entries in the background and store each enrichment
  result in the cache. ~30–50 requests once per day on office Wi-Fi.
- **(b) One additive server route** `GET /api/planning/prefetch` that returns
  the planning snapshot **with** enrichment already merged, in a single
  response. Cleaner, one request instead of 50, and the server already has
  `bxPost` + `mapLimit` concurrency control in `routes/todayscustomers.js`.

**Recommendation: (a) for Phase 1** because it needs no server change and is
revertable by deleting one file; **(b) later** if the warm proves slow.

---

## 14. What must work offline

### Already works
- Loading the app shell and every wizard page (`sw.js`)
- Filling every form (DOM-only)
- Live totals — `pricing-core.js` runs in the browser against cached
  `/api/price/inputs` (`pricing-client.js`), flagged `_local` so it can never
  be frozen
- Saving a draft (`DraftsManager` → `trySaveOrQueue` → IndexedDB → replay)
- Saving a final offer from the standard path (`script.js:16056`)
- Surviving a tab discard (`session-recovery.js`, snapshot every 1.2 s
  debounced + on `visibilitychange`/`pagehide`)
- Capturing signature and sketches (canvas → data URL → payload)
- Product images (`media.onlineplus.store` cache-first in `sw.js`)
- Sync on reconnect with idempotent replay and 409 conflict handling

### Gap 0 — **starting a planned offer offline** (highest priority)
`fetchTodayPlanningSnapshot()` (`script.js:26625`) has no cache. Offline it
lands in the `catch` and renders *"Fehler beim Laden der Planungstermine"*.
The salesperson then has **no appointment list, no customer, and no prefill** —
they must type everything by hand, which is precisely the work the planning
integration exists to eliminate.

`enrichPlanningAppointmentFromBitrix()` additionally fails, so the **Anrede**
is blank and any field the route-planning service left empty stays empty.

This is the single most valuable thing to fix, and per §13b it is also one of
the cheapest.

### Gap 1 — reopening your own offline work
`DraftsManager` lists and loads drafts through
`GET /api/drafts/search` and `GET /api/drafts/:id`. **Offline, both fail.** A
draft saved on site sits in the queue but the salesperson **cannot reopen it**
until sync.

*Revised priority: medium.* You confirmed reading **existing** (already-synced)
offers offline is rare — that part is now explicitly out of scope. But
reopening work **you created earlier the same day, still unsynced**, is a
different thing and is still needed: two appointments before finding signal is
a normal morning. Scope this to *unsynced local documents only*, which is much
less work than a general offline offer archive.

### Gap 2 — a second, unqueued offer save
`ExportManager.js:386` posts to `/api/offers` with a **raw `fetch`**, bypassing
`trySaveOrQueue`. That save is silently lost offline.

### Gap 3 — wizard position is `sessionStorage`
`konfigurator_state_v1` dies with the app process. On restart the user is at
the home screen even though `session-recovery` has their payload.

### Deliberately not offline (acceptable)
Ad-hoc Bitrix lookups outside the planning flow, distance/routing suggestion,
product search (`/api/products`, `/api/magic/search`), Hassmann, admin config,
**global search across existing offers**, live SSE re-planning updates.

---

## 15. What can remain server-side

Everything currently server-side, unchanged:

- **Puppeteer HTML→PDF** — needs Chromium
- **DOCX→PDF** — needs LibreOffice
- **LaTeX→PDF** — needs texlive
- **Email** — needs SMTP/IMAP credentials
- **Signing links** — needs a public URL and a server-held token
- **CRM** — needs the Bitrix webhook secret
- **Postal (Binect)**, **geocoding/routing**, **Adobe PDF**
- **Product catalogue of record**, **vigor live prices**
- **Auth issuance**

The device only needs these to *queue an intent*. A field-realistic flow is:
create the offer offline → sync on reconnect → then send email / generate PDF /
create signing link, all with signal. That matches how the app already behaves.

---

## 16. What can be reused unchanged in WKWebView

**Essentially all 20,000+ lines.** Verified reusable as-is:

- `index.html`, `script.js`, `style.css` — no browser-specific APIs beyond
  standard DOM
- Every manager module and the `/configurator/` sub-app
- `IndexedDB` — fully supported in WKWebView
- `Cache Storage` + **Service Workers** — supported in WKWebView **only on
  iOS 14+ and only when the app uses `WKAppBoundDomains`** (see §20 risk)
- Canvas signature/sketch capture
- `fetch` with `credentials: include` (cookies persist in a non-ephemeral
  `WKWebsiteDataStore`)
- Blob download of PDFs — **needs a native handler**, see §17
- Viewport, `apple-mobile-web-app-*` meta, manifest icons — already present

Nothing needs porting to Swift.

---

## 17. What needs a native iOS bridge

Minimal and well-bounded:

| # | Need | Why native | Mechanism |
|---|---|---|---|
| 1 | **Durable storage** | WKWebView IndexedDB/Cache are evictable under storage pressure; Safari's 7-day cap does not apply to a WKWebView in an installed app, but eviction still can | `WKAppBoundDomains` + `WKWebsiteDataStore.default()` (non-ephemeral) + optionally mirror the queue to an app-container file via a bridge |
| 2 | **Auth token custody** | survive data-store clears; avoid re-login in the field | Keychain + `WKUserScript` injecting `Authorization: Bearer` / seeding the cookie |
| 3 | **PDF / file download** | `URL.createObjectURL` + `<a download>` does nothing in WKWebView | `WKDownloadDelegate` (iOS 14.5+) → save to Files → `UIActivityViewController` |
| 4 | **Reachability truth** | `navigator.onLine` lies (says `true` on captive portals / dead Wi-Fi) | `NWPathMonitor` → post into JS, override/augment the `online` event that `OfflineSaveQueue.js` listens for |
| 5 | **Background sync** | iOS Safari has no Background Sync API; app can be backgrounded mid-visit | `BGProcessingTask` that loads the webview headlessly and calls `retryAll()`, or a native replay of the queue |
| 6 | **App lifecycle → flush** | `pagehide` is unreliable when iOS suspends | `sceneDidEnterBackground` → `evaluateJavaScript` calling the existing `__internals.flush()` |
| 7 | **Camera / photo attach** (if wanted later) | file input UX | `WKUIDelegate` + `UIImagePickerController` |
| 8 | **Print** | | `UIPrintInteractionController` |

Nothing here duplicates business logic. Every item is a platform capability the
web layer cannot reach — that is the correct dividing line.

---

## 18. Proposed local database schema

**Recommendation: extend the existing IndexedDB schema. Do not add Core Data
or SQLite.**

Rationale: the payload is a deeply nested, frequently-changing, schema-less
`Mixed` object produced by walking the DOM. A relational or Core Data mirror
would require modelling ~15 form sections that change every sprint, and would
become a second source of truth for the same bytes. The existing IndexedDB
stores already hold exactly the right shape.

### Existing (keep unchanged)
```
DB nt-offline-save-queue  v1
  store queue  keyPath "id"          idx offerKey, kind
    { id: uuid, kind: "draft"|"offer", offerKey, url,
      body: {...payload wrapper, savedAt, clientSaveId}, createdAt }

DB nt-pricing-inputs      v1
  store inputs  key "current"
    { buildId, config: {...}, products: [{productId,name,price}], cachedAt }

DB nt-session-recovery    v1
  store snapshot  key "current"
    { payload, offerType, step, savedAt }
```

### Proposed addition #1 — planning cache, closing Gap 0 (highest priority)
```
DB nt-planning-cache      v1
  store snapshot  key "current"
    {
      payload:     { planning: { days:[…], futurePlanned:[…] } },  // verbatim
      bitrixTimes: { byDealId: {…} },        // /api/bitrix/activities/today
      dealStages:  { "<dealId>": "C72:…" },  // /api/bitrix/deals/stages
      fetchedAt:   ISO
    }

  store enrichment  keyPath "dealId"
    idx byContactId  "contactId"
    {
      dealId, contactId,
      salutation: "Herr" | "Frau" | "Familie" | "",
      email, phone, street, city, postalCode,
      fetchedAt: ISO
    }
```

Stored **verbatim** as the endpoints return it, so `applyTodayPlanningPayload`
and `enrichPlanningAppointmentFromBitrix` consume a cache hit through the exact
same code path as a live response. No parallel rendering logic, no second
mapping layer to keep in sync.

The UI must show the cache age (*"Planung vom 14.02., 07:12"*) — a stale
appointment list presented as live is a worse failure than an error message.

### Proposed addition #2 — local documents, closing Gap 1
```
DB nt-local-docs          v1
  store docs   keyPath "localId"
    idx byOfferType   "offerType"
    idx byUpdatedAt   "updatedAt"
    idx byServerKey   "serverKey"      // offerNumber or draft name
    idx bySyncState   "syncState"

    {
      localId:    uuid,                       // stable, device-local
      kind:       "draft" | "offer",
      serverKey:  "ANG-BU-Meier-…" | "ANG2026-…",
      serverId:   "<mongo _id>" | null,       // filled on sync ack
      offerType:  "bu",
      title:      "Meier, Hans — Hof",        // for the list UI
      payload:    { … },                      // full buildPayload() output
      pricing:    { … } | null,
      savedAt:    ISO,                        // user's save time
      updatedAt:  ISO,
      syncState:  "pending" | "synced" | "conflict",
      clientSaveId: uuid                      // ties back to the queue record
    }
```

**Why a separate store rather than reusing `queue`:** the queue is a
write-ahead log that is *deleted on successful sync*. The device list must
survive sync. Two concerns, two stores — and it means zero change to the
already-tested queue semantics.

### Optional addition — closing Gap 3
Move `konfigurator_state_v1` from `sessionStorage` to `localStorage`, or add
`{offerType, step}` to the `nt-session-recovery` record (it is already stored
there — `session-recovery.js:currentSnapshot()` writes `step`). The cheapest
fix is to let session recovery restore the step it already saved.

---

## 19. Proposed synchronization architecture

**Keep the existing model. It is already the right one.**

```
  user action
      │
      ▼
  buildPayload()                     ← DOM is the source of truth
      │
      ├──► nt-local-docs.put(...)    ← NEW: immediate local write, syncState "pending"
      │
      └──► trySaveOrQueue()          ← EXISTING
              │
              ├─ fetch succeeds ────► server 200/201 ─► mark doc "synced", store serverId
              │
              └─ fetch throws ──────► queue record in IndexedDB
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    │                                            │
              window "online"                            page load / app foreground
              (+ NWPathMonitor bridge)                   (+ BGProcessingTask)
                    │                                            │
                    └──────────────► retryAll() ◄────────────────┘
                                        │
                     sorted by createdAt (save order, not key order)
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                  200/201             409 draft           409 offer
                    │                   │                   │
              delete record      rename "-offline-xxxxxx"  drop + toast
              mark "synced"      retry, toast              mark "conflict"
```

**Conflict policy (already implemented, keep it):**
- Server matches `clientSaveId` → replay is idempotent, answers 200, not 409.
  This is the key property; it means retry is always safe.
- Draft name collision → auto-rename with a device-unique suffix, user is told.
- Offer number collision → do not silently overwrite; flag for review.
- Offers upsert by `offerNumber`, which is minted client-side with a timestamp
  — collisions between salespeople are practically impossible, and you said
  real-time collaboration is not required.

**Additions needed:**
1. `nt-local-docs` written on every save (above).
2. `retryAll()` also updates `nt-local-docs.syncState`.
3. Native reachability + background replay (§17 items 4–5).
4. Bounded retry — `OfflineSaveQueue.js` carries a `ponytail:` note that a
   permanently failing record retries forever. On a device that stays installed
   for months, add a cap and a "needs attention" state.

**What is explicitly out of scope:** CRDTs, operational transform, vector
clocks, per-field merge. Different salespeople create different offers; the
document is the unit; last-write-wins on `offerNumber` with a flagged conflict
is sufficient and is what exists.

---

## 20. Risks and unknowns

### Found during inspection — unrelated to iPad, but needs a decision now

**S1 — A Bitrix webhook secret is published to the open internet.**

`src/public/TodaysCustomers.js:2` hardcodes:

```js
const BITRIX_BASE = 'https://emczwei.bitrix24.de/rest/1136/<token>';
```

That URL **is** the credential — a Bitrix inbound webhook needs no other auth.
Three things make this live rather than theoretical:

1. The file sits in `src/public/`, which is served by
   `express.static` ([app.js](../src/app.js)).
2. `authGate`'s `isPublicAsset()` returns `true` for anything matching
   `\.js$` ([middleware/authGate.js](../src/middleware/authGate.js)), and this
   path is not under the `/logic/` carve-out — so
   `GET /TodaysCustomers.js` is readable **without a session**.
3. The file is **dead code**: nothing imports it. The identical logic lives
   server-side in [routes/todayscustomers.js](../src/routes/todayscustomers.js),
   which correctly keeps the webhook in `BITRIX_WEBHOOK_BASE`.

**Recommended: rotate the Bitrix webhook token, then delete the file.** It is
an unreferenced duplicate; deleting it changes no behaviour. I have not touched
it — you asked for inspection only, and rotating the token has to happen on the
Bitrix side first or the server route breaks too.

Worth a follow-up either way: `isPublicAsset()` treating every `.js` as public
is a broad rule that already needed one carve-out (`/logic/`). Any future file
under `src/public/` that embeds a secret is exposed by default.

### High

**R1 — Service Workers in WKWebView require `WKAppBoundDomains`.**
Declaring `WKAppBoundDomains` in `Info.plist` (max 10 domains) enables SW and
`WKWebsiteDataStore` persistence, but **disables** `WKWebView` APIs your shell
may want: custom `WKUserScript` injection into the page world,
`evaluateJavaScript` on arbitrary frames, `WKContentRuleList`, and third-party
webview messaging. **Must be prototyped before committing to the approach.**
Fallback if it bites: skip the SW entirely and let the native shell serve the
shell assets from the app bundle via `WKURLSchemeHandler`.

**R2 — Storage eviction.** `navigator.storage.persist()` is a no-op in Safari
and WKWebView (`sw-register.js:12` already notes this). An unsynced draft can
be evicted under device pressure. This is the one place where "closing/
restarting must never lose work" is not yet guaranteed. Mitigation: mirror the
queue + `nt-local-docs` to a file in the app container via the JS↔native
bridge, and restore from it on launch if IndexedDB comes back empty.

**R3 — 7-day session token, no refresh.** `authService.js` TTL is 7 days.
A device offline past expiry gets bounced. `header-auth.js` already declines to
redirect on a *network* failure, but a 401 from a real server response will
redirect. Needs either a longer device token, a refresh on every successful
sync, or a device-scoped API key.

### Medium

**R4 — `ExportManager.js:386` raw `/api/offers` fetch** (Gap 2). Silent data
loss offline. Small fix, but it is a *data-loss* bug in the current production
app, not just an iPad concern.

**R5 — `sw.js` `PRECACHE` is a hand-maintained list.** Its own comment admits
a page that installs the worker and immediately goes offline is degraded. On
iPad the app may be installed in the office and first used in the field.

**R5b — dynamic `import()` may not survive an offline reload.** Found while
building `offline-planning.spec.cjs`: under Chromium's full offline emulation,
after a reload **every** dynamic `import()` fails — including `pricing-client.js`
and `OfflineSaveQueue.js` — even though they are precached, the worker is
controlling, and `fetch()` for the same URL returns 200 from cache. This may
be an artifact of CDP network emulation rather than real device behaviour, but
if it is real it breaks the offline pricing fallback after a restart, which is
exactly the "closing/restarting the app" case. **Confirm on a real device in
Phase 0** — it is cheap to check there and it changes how much the web-layer
offline stack can be trusted before the native shell exists.

**R6 — CSP inline-script hashes.** `app.js` pins four `sha256` script hashes.
Any native injection into the page world breaks. Use an isolated content world.

**R7 — Pricing drift.** `/api/price/inputs` ships `{productId, name, price}`
only. Local pricing cannot see **vigor live net prices** (`pricing-client.js`
returns an empty Map, mimicking a vigor outage). An offline total can therefore
differ from the server total. Already handled by the `_local` flag preventing
freeze — but sales must understand an unsynced total is provisional.

**R8 — `sessionStorage` wizard state** (Gap 3). Restart lands on home.

**R9 — Drafts are not reopenable offline** (Gap 1). Reduced scope per your
clarification, but still real for same-day unsynced work.

**R10 — Planning cache staleness.** A week planned on Monday and re-planned on
Wednesday leaves a device that never reconnected showing Monday's list. The
cache age must be visible in the UI, and the SSE stream must resubscribe on
reconnect. Ask: how often does the plan actually change mid-week?

**R11 — Planning snapshot size.** Unknown until measured. A full week of
`days[].customers[]` + `futurePlanned[]` plus per-deal enrichment is probably
well under a megabyte, but it should be measured before assuming it fits
comfortably in evictable storage.

### Low / unknown — needs your answer

**U1** — Is `src/server.js` dead? It is not imported anywhere I found.
**U2** — ~~Read existing offers offline?~~ **Answered: rare, out of scope.**
**U3** — Photo capture on site — planned or not? Affects storage sizing.
**U4** — MDM / App Store / Ad-hoc distribution? Affects entitlements and
whether a device-scoped API key is workable.
**U5** — Multiple salespeople sharing one iPad? Affects whether local data must
be partitioned per user, and whether the planning cache must be per-user.
**U6** — ~~`docs1/` claims "no authentication on any endpoint".~~
**Being corrected** — see the docs1 update below.
**U7** — How far ahead should the planning cache reach? The payload already
carries `futurePlanned`, so "the whole week" is free. Two weeks?
**U8** — When the plan changes while a device is offline and the salesperson
has already started an offer against the old appointment — what should happen?
Current assumption: keep the offer, it is keyed to the deal, not the slot.

---

# Staged implementation plan

Design constraint honoured throughout: **the smallest possible change to the
existing production application**, and the office web app must stay identical.

Every phase is independently shippable and independently revertable.

---

## Phase 0 — Prove the platform before writing product code
**~1–2 days. No repository changes at all.**

Throwaway Xcode project, not in this repo:

1. `WKWebView` + `WKAppBoundDomains` → load production URL → confirm the
   **existing** service worker registers and `caches` populate.
2. Airplane mode → confirm the app shell loads and a draft save queues in
   IndexedDB.
3. Force-quit, relaunch, still offline → confirm IndexedDB and the cache
   survive.
4. Reconnect → confirm `retryAll()` fires and the draft reaches Mongo.
5. Confirm what `WKAppBoundDomains` costs you (R1).

**Gate:** if 1–4 pass, the WKWebView strategy is confirmed and the native
scope stays at §17. If SW registration fails, switch to
`WKURLSchemeHandler` shell serving *before* any other work.

---

## Phase 1 — Offline planning prefill (Gap 0) + stop the data loss (Gap 2)
**The primary use case. Ships to the existing web app, helps office users too.
No iOS work. ~3–4 days.**

**1a. Fix the unqueued save (R4/Gap 2).** `ExportManager.js:386` → route
through `trySaveOrQueue` exactly as `script.js:16056` already does. ~10 lines.
This is a live data-loss bug; do it first regardless of everything else.

**1b. Add `nt-planning-cache`.** New file `src/public/PlanningCache.js`,
~100 lines, same IndexedDB idiom as the three existing stores.

**1c. Cache on success, fall back on failure.** In
`fetchTodayPlanningSnapshot()` (`script.js:26625`):
- on success → `PlanningCache.save({payload, bitrixTimes, dealStages})`
- in the existing `catch` → load the cache and call the **same**
  `applyTodayPlanningPayload(payload)`; only if the cache is empty show the
  current error state
- render the cache age in `#todayPlanningMeta`

**1d. Cache the enrichment.** In `enrichPlanningAppointmentFromBitrix()`
(`script.js:26770`): write the resolved contact fields to the `enrichment`
store on success; read from it when the fetch throws. Same `fillIfEmpty` +
`setRadio("salutation", …)` path, so behaviour is identical.

**1e. Background warm.** After a successful snapshot, walk the week's entries
(`days[].customers[]` + `futurePlanned[]`) at low concurrency and populate the
enrichment store. Runs once per snapshot, in the office, on Wi-Fi.

**1f. Guard the SSE stream.** `connectTodayPlanningStream()` should not thrash
reconnect attempts while offline; resubscribe on `online`.

**Tests:** extend `tests/e2e/offline-sync/` — the harness already exists
(`global-setup.cjs` spins a throwaway Mongo + the real app, `serviceWorkers:
"allow"`). New spec: load planning online → go offline → reload → appointment
list still renders from cache → tap a card → **Anrede and address prefill
correctly** → save the offer → reconnect → offer in Mongo.

**Risk: low.** Every change is inside an offline branch that today throws or in
a `catch` that today only renders an error. Online behaviour is byte-identical.

---

## Phase 1b — Reopen unsynced work offline (Gap 1, reduced scope)
**~2 days. Do after Phase 1; it is now a secondary need.**

- New `src/public/LocalDocsStore.js` (`nt-local-docs`, §18) — written on save
  from `DraftsManager` and `saveFinalOfferSnapshot`, marked synced from
  `OfflineSaveQueue.retryAll()`.
- `DraftsManager.js:151,172` — when the `fetch` throws, fall back to
  `LocalDocsStore`, **scoped to unsynced local documents only**. Reopen goes
  through the existing `restoreConfiguratorFromSnapshot({payload})`.
- Wizard step survives restart (Gap 3): `session-recovery.js` already stores
  `step` and already calls `applyWizardState({offerType, step})` — verify, and
  if needed promote `konfigurator_state_v1` to `localStorage`.
- Bound the forever-retry in `retryAll()` (R-retry); surface a "needs
  attention" state.

Explicitly **not** in scope: a general offline archive of already-synced
offers. You confirmed that need is rare.

---

## Phase 2 — Minimal native shell
**New Xcode project in a sibling directory or `ios/`. Zero changes to `src/`.**

- `WKWebView` full-screen, `WKAppBoundDomains`, non-ephemeral
  `WKWebsiteDataStore.default()`
- Load `https://angebotskonfigurator-emc2-v2.fly.dev/`
- `WKDownloadDelegate` → save PDFs to Files + share sheet (§17.3)
- `WKNavigationDelegate` → open `mailto:`/`tel:`/external hosts in Safari
- `sceneDidEnterBackground` → `evaluateJavaScript` flushing session recovery
- Pull-to-refresh disabled, no bounce, safe-area handling
- Offline splash if the shell cache is cold

**Deliverable:** an installable app that is the existing web app, with working
downloads. Nothing about the server changes.

---

## Phase 3 — Native reliability bridge
**Small, additive. One new web file, one native message handler.**

- `NWPathMonitor` → `webView.evaluateJavaScript("window.__nativeOnline(true)")`
- New `src/public/native-bridge.js` (~60 lines): if
  `window.webkit.messageHandlers.native` exists, register `__nativeOnline` to
  call the existing `retryAll()`; otherwise it is inert. Loaded from
  `index.html` alongside the other boot modules; **a no-op in every browser**.
- Keychain-held Bearer token, injected via `WKUserScript` in an isolated world
  (R6), plus a native login screen that calls `POST /api/auth/login` and stores
  the returned token
- `BGProcessingTask` → wake, load webview, call `retryAll()`, done

**Server change:** extend token TTL for device clients or add a refresh on
`GET /api/auth/me` (R3). One file, `services/authService.js`.

---

## Phase 4 — Durability backstop
**Only if Phase 0 showed eviction is real (R2).**

- `native-bridge.js` mirrors every `nt-offline-save-queue` and `nt-local-docs`
  write to native via `messageHandlers`
- Swift writes JSON to the app container (`Application Support`, excluded from
  iCloud backup or not, your call)
- On launch, if IndexedDB is empty but the mirror is not, replay the mirror
  into IndexedDB before the app boots

This is the only place I would accept duplicated state, and only because it is
an opaque byte-for-byte mirror with a single direction of authority.

---

## Phase 5 — Field polish (as demanded, not speculatively)
Camera attach (`WKUIDelegate`), print, sync-status UI in the native chrome,
pre-seeding today's customers before leaving the office (U2), per-user
partitioning (U5).

---

## What this plan deliberately does not do

- No Swift rewrite of any business logic — `pricing-core.js` stays the single
  source of pricing truth, running identically on server and device
- No Core Data / SQLite / Realm — the existing IndexedDB stores already hold
  the right shape
- No CRDT / merge engine — document-level last-write-wins with `clientSaveId`
  idempotency is what the requirements ask for and what already exists
- No new sync protocol — `trySaveOrQueue` + `retryAll` is the protocol
- No restructuring of `script.js`, `index.html`, or the route layer
- No React Native / Capacitor / Cordova — they would replace a working shell
  with a heavier one and add a dependency you would then own

---

## Effort estimate

| Phase | Effort | Ships value |
|---|---|---|
| **1a — fix unqueued save** | **~1 h** | **stops live data loss today** |
| 0 — platform spike | 1–2 d | de-risks everything |
| 1 — offline planning prefill (Gap 0) | 3–4 d | **the primary use case, to office users too** |
| 1b — reopen unsynced work (Gap 1) | 2 d | same-day multi-appointment days |
| 2 — WKWebView shell | 3–5 d | installable iPad app — **solves "Safari clears data"** |
| 3 — native bridge | 4–6 d | reliable field sync |
| 4 — durability backstop | 2–4 d | only if Phase 0 says so |
| 5 — polish | open | on demand |

Phases 1 and 1b are worth doing regardless of whether the iPad app happens —
they fix a real data-loss path (Gap 2) and deliver the primary use case (Gap 0)
in the existing web app. Phases 0 and 2 can run **in parallel** with Phase 1;
they touch entirely separate code.

Suggested order: **1a today** → 0 and 1 in parallel → 2 → 1b → 3 → 4.
