# HTTP Endpoint Inventory — Auth Gating Decision

Branch: `v3`. Source of truth: `src/app.js` router mounts + `src/routes/*.js`.

Goal: decide which endpoints must stay **public** (called by external/machine systems or
by customers on the signing page) vs. which can go **behind a login gate** (used only by the
internal configurator/admin UI).

---

## Summary

| Classification | Count |
|---|---|
| CUSTOMER (public, token-based signing surface) | 6 |
| MACHINE (inbound from external systems — must stay reachable) | 4 |
| INTERNAL (configurator/admin UI only — safe to gate) | ~55 |
| AMBIGUOUS (confirm with user) | 5 |

### EXEMPT — keep PUBLIC (do NOT gate)

**Customer signing surface (token-based, no login by design):**
- `GET  /sign/:token` — the signing page shell
- `GET  /api/signing/:token` — signing page data
- `GET  /api/signing/:token/documents/:key/html` — doc HTML fragment
- `GET  /api/signing/:token/documents/:key/pdf` — doc PDF stream
- `POST /api/signing/:token/documents/:key` — submit signature
- Static: `/signpage/*` (index.html + app.js), `/pdfjs/*`, `/vendor/fontawesome/*`, and any
  `/assets/*` the signing page references. These are served by `express.static` and by the
  `/pdfjs` and `/vendor/fontawesome` static mounts — must remain public so the signing page renders.

**Machine / inbound-external surface (documented external consumer = `bau-formular.fly.dev`, per README + CORS/CSP allow-lists):**
- `GET  /api/offers/external/search`
- `GET  /api/offers/external/drafts/:id`
- `GET  /api/offers/external/offers/:offerNumber`
- `POST /api/arbeitsbericht/external/pdf`

**Health (harmless, often probed by uptime/monitoring):**
- `GET /api/health`, `GET /health`, `GET /api/version` — recommend leaving public (see open questions).

### GATE — put behind login (everything else)

All `/api/*` configurator/admin data endpoints: products, services, price, drafts, submissions,
offers (non-external), trays, vorhang, bathtubs, magic (proxy), bitrix (proxy), routing (proxy),
planning (proxy), todayscustomers (proxy), email send, signing **creation/status**, docx/pdf/latex
generation, kalkulation, material-overview, arbeitsbericht (non-external), admin.

**Important:** the `/admin/*` router has its OWN password auth (`requireAuth`) already. If you add a
global login gate, make sure `POST /admin/api/login` stays reachable to bootstrap that session.

---

## Notes on "external" naming (avoids a gating mistake)

Several routers have "external" in their names or make calls to external hosts, but they are
**OUTBOUND proxies called BY the internal UI**, not inbound webhooks. They are safe to GATE:

- `bitrix.js` — server-side calls OUT to Bitrix REST webhook (`emczwei.bitrix24.de/rest/...`).
- `magic.js` → `src/external/magicApi.js` — calls OUT to a "magic"/onlineplus product API.
- `routing.js` — calls OUT to ORS/OSRM geocoding.
- `planning.js` — proxies OUT to `route-plannung.fly.dev`.
- `todayscustomers.js` — calls OUT to Bitrix.

The CSP `connect-src`/`frame-*` allow-list (`fly-n8n-1.fly.dev`, `emczwei.bitrix24.de`,
`route-plannung.fly.dev`, `bau-formular.fly.dev`, `gconlineplus.de`, `unpkg`) governs what the
**browser** may talk to / be framed by — it does not by itself mean those hosts call INTO this server.
The only confirmed INBOUND external caller is `bau-formular.fly.dev` hitting the `/external/*` routes
(README documents these as "additive endpoints for external consumers"). No `n8n`/`gconline`/`bitrix`
INBOUND webhook receiver route exists in the code (see open questions).

---

## Inventory by router

### `src/app.js` (inline routes, static, SPA fallback)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/products/bulk` | Bulk upsert products | INTERNAL | admin/import UI |
| POST | `/api/services/bulk` | Bulk upsert services | INTERNAL | admin/import UI |
| GET | `/api/services` | List services | INTERNAL | configurator UI |
| GET | `/api/services/:id` | Single service | INTERNAL | configurator UI |
| GET | `/api/products/sla` | SLA product list (debug) | INTERNAL | configurator UI |
| GET | `/api/products` | List products | INTERNAL | configurator UI |
| GET | `/api/products/:id` | Single product | INTERNAL | configurator UI |
| POST | `/api/price` | Stateless price computation | INTERNAL | configurator UI |
| POST | `/api/drafts` | Create draft | INTERNAL | configurator UI |
| GET | `/api/drafts/search` | Search drafts | INTERNAL | configurator UI |
| GET | `/api/drafts/:id` | Load draft | INTERNAL | configurator UI |
| POST | `/api/submissions` | Legacy submission + pricing | INTERNAL | legacy |
| GET | `/api/health` | Health JSON (db/time) | AMBIGUOUS | likely monitoring |
| GET | `/health` | Legacy health | AMBIGUOUS | likely monitoring |
| GET | `/api/version` | Build id for frontend update-checker | AMBIGUOUS | frontend + maybe monitoring |
| GET | `/pdfjs/*` (static) | PDF.js viewer assets | CUSTOMER (public) | signing page / viewers |
| GET | `/vendor/fontawesome/*` (static) | Font Awesome assets | CUSTOMER (public) | UI + signing page |
| GET | `/*` (static `public/`) | SPA assets incl. `/signpage/*`, `/assets/*` | mixed | signing page assets must stay public |
| GET | `/*` (SPA fallback) | Serves `index.html` | INTERNAL (SPA shell) | app entry |

### `src/routes/signing.js` — mount `/api/signing` (+ `/sign/:token` in app.js)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/signing` | Create signing request + email link | INTERNAL | comment "(internal)"; configurator |
| GET | `/api/signing/status/:offerNumber` | Signing status for dashboard | INTERNAL | comment "(internal)" |
| GET | `/api/signing/:token` | Signing page data | CUSTOMER | comment "(public)"; signpage/app.js fetch |
| GET | `/api/signing/:token/documents/:key/html` | Doc HTML fragment | CUSTOMER | comment "(public)" |
| GET | `/api/signing/:token/documents/:key/pdf` | Stream doc PDF to view | CUSTOMER | comment "(public)" |
| POST | `/api/signing/:token/documents/:key` | Submit signature | CUSTOMER | comment "(public)" |
| GET | `/sign/:token` | Serves `public/signpage/index.html` | CUSTOMER | `signingPageHandler` in app.js |

### `src/routes/offers.js` — mount `/api/offers`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/offers/search-all` | Search all offers | INTERNAL | configurator UI |
| GET | `/api/offers/external/search` | External search (drafts+offers) | MACHINE | README "external consumers"; bau-formular |
| GET | `/api/offers/external/drafts/:id` | External draft detail | MACHINE | README external API |
| GET | `/api/offers/external/offers/:offerNumber` | External offer detail | MACHINE | README external API |
| GET | `/api/offers/:offerNumber` | Load offer by number | INTERNAL | configurator UI |
| POST | `/api/offers` | Save offer | INTERNAL | configurator UI |
| GET | `/api/offers` | List offers | INTERNAL | configurator UI |

### `src/routes/arbeitsbericht.js` — mounts `/api/arbeitsbericht` AND `/arbeitsbericht`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/arbeitsbericht/docx` (also `/arbeitsbericht/docx`) | Generate Arbeitsbericht DOCX | INTERNAL | configurator UI |
| POST | `/api/arbeitsbericht/pdf` (also `/arbeitsbericht/pdf`) | Generate Arbeitsbericht PDF | INTERNAL | configurator UI |
| POST | `/api/arbeitsbericht/external/pdf` (also `/arbeitsbericht/external/pdf`) | PDF from external search selection | MACHINE | README external API; bau-formular |

### `src/routes/admin.js` — mount `/admin` (has own `requireAuth`)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/admin/api/login` | Admin password login | INTERNAL (must stay reachable to log in) | admin panel |
| GET | `/admin/api/config` | Read business config vars | INTERNAL (already auth'd) | admin panel |
| PUT | `/admin/api/config` | Update config vars | INTERNAL (already auth'd) | admin panel |
| POST | `/admin/api/config/reset` | Reset config vars | INTERNAL (already auth'd) | admin panel |

### `src/routes/bitrix.js` — mount `/api/bitrix` (OUTBOUND proxy to Bitrix)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/bitrix/contact/:id` | Fetch Bitrix contact | INTERNAL | UI; proxies OUT to Bitrix |
| GET | `/api/bitrix/contact/:id/deals` | Deal IDs for a contact | INTERNAL | UI |
| POST | `/api/bitrix/timeline/comment` | Add Bitrix timeline comment | INTERNAL | UI/email/signing |
| GET | `/api/bitrix/activities/today` | Today's Bitrix activities | INTERNAL | planning UI |
| GET | `/api/bitrix/calendar/week` | Bitrix calendar week | INTERNAL | planning UI |

### `src/routes/todayscustomers.js` — mount `/api` (OUTBOUND to Bitrix)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/bitrix/kundendaten` | Customers for a Bitrix stage | INTERNAL | planning UI |
| POST | `/api/calendar/today` | Bitrix calendar events today | INTERNAL | planning UI |

### `src/routes/routing.js` — mount `/api/routing` (OUTBOUND geocoding)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/routing/suggest-distance` | Company→customer distance via ORS/OSRM | INTERNAL | configurator UI |
| GET | `/api/routing/health` | Routing provider health | AMBIGUOUS | monitoring? |

### `src/routes/planning.js` — mount `/api` (OUTBOUND to route-plannung.fly.dev)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/planning/current` | Current planning snapshot (proxied) | INTERNAL | script.js `TODAY_PLANNING_SNAPSHOT_ENDPOINT` |
| GET | `/api/planning/stream` | SSE stream of planning (proxied) | INTERNAL | planning UI |

### `src/routes/post.js` — mount `/api/post` (OUTBOUND to Binect + Bitrix)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/post/send` | Send postal letter via Binect API | INTERNAL | configurator UI |

### `src/routes/email.js` — mount `/api/email`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/email/smtp-test` | SMTP connectivity test | INTERNAL (debug) | admin/debug |
| POST | `/api/email/send-offer` | Send offer email w/ attachments | INTERNAL | configurator UI |

### `src/routes/magic.js` — mount `/api/magic` (OUTBOUND to onlineplus/magic API)

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/magic/health` | External API health (proxy) | AMBIGUOUS | monitoring? |
| GET | `/api/magic/products` | Fetch external products (proxy) | INTERNAL | UI |
| POST | `/api/magic/search` | External product search (proxy) | INTERNAL | script.js + HassmannManager.js |

### `src/routes/customers.js` — mount `/api/customers`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/api/customers` | Upsert customer snapshot | INTERNAL | configurator UI |
| GET | `/api/customers/search` | Search customers | INTERNAL | configurator UI |
| GET | `/api/customers/:id` | Load customer | INTERNAL | configurator UI |

### `src/routes/trays.js` — mount `/api/trays`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/trays/suggest` | Suggest shower tray by dimensions | INTERNAL | configurator UI |

### `src/routes/bathtubs.js` — mount `/api/bathtubs`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/bathtubs/suggest` | Suggest bathtub | INTERNAL | configurator UI |
| GET | `/api/bathtubs/screens/suggest` | Suggest screen | INTERNAL | configurator UI |
| GET | `/api/bathtubs/recommend-screen` | Recommend screen | INTERNAL | configurator UI |

### `src/routes/vorhang.js` — mount `/api/vorhang`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| GET | `/api/vorhang/products` | Curtain/rail products (vigor DB) | INTERNAL | configurator UI |

### `src/routes/kalkulation.js` — mount `/kalkulation`

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/kalkulation/preview` | Kalkulation preview | INTERNAL | configurator UI |
| POST | `/kalkulation/debug` | Kalkulation debug | INTERNAL (debug) | configurator UI |
| POST | `/kalkulation/docx` | Kalkulation DOCX | INTERNAL | configurator UI |
| POST | `/kalkulation/pdf` | Kalkulation PDF | INTERNAL | configurator UI |

### Document generation routers

| Method | Path | Purpose | Classification | Called by (evidence) |
|---|---|---|---|---|
| POST | `/pdf` | Generate PDF (`pdf.js`) | INTERNAL | configurator UI |
| POST | `/pdf-template` | Generate PDF from template | INTERNAL | configurator UI |
| POST | `/docx-template` | Generate Angebot DOCX | INTERNAL | configurator UI |
| POST | `/docx-template/material-overview` | Material overview DOCX | INTERNAL | configurator UI |
| POST | `/docx-template/pdf` | Angebot as PDF | INTERNAL | configurator UI |
| POST | `/material-overview` | Material overview | INTERNAL | configurator UI |
| POST | `/material-overview/pdf` | Material overview PDF | INTERNAL | configurator UI |
| POST | `/material-overview/hassmann-cart` | Hassmann cart export | INTERNAL | configurator UI |
| POST | `/api/docx/pdf-preview` | PDF preview (`pdf-preview.js`) | INTERNAL | configurator UI |
| POST | `/latex-template/pdf` | LaTeX PDF | INTERNAL | configurator UI |
| GET | `/api/adobe-pdf/status` | Adobe PDF service status | AMBIGUOUS | monitoring? |
| POST | `/api/adobe-pdf/docx` | Adobe: DOCX | INTERNAL | configurator UI |
| POST | `/api/adobe-pdf/pdf` | Adobe: PDF | INTERNAL | configurator UI |
| POST | `/api/adobe-pdf/document-merge` | Adobe: merge | INTERNAL | configurator UI |
| POST | `/api/adobe-pdf/batch` | Adobe: batch | INTERNAL | configurator UI |
| POST | `/api/hl/parse-flexofit-offer` | Parse Flexofit offer file upload | INTERNAL | configurator UI |

---

## Open questions to confirm (AMBIGUOUS)

1. **Health/version probes** — `GET /api/health`, `GET /health`, `GET /api/version`,
   `GET /api/routing/health`, `GET /api/magic/health`, `GET /api/adobe-pdf/status`.
   These look like uptime/monitoring probes. If Fly.io health checks or any external monitor hit
   them, they must stay public. Confirm before gating. (`/api/version` is also used by the
   frontend update-checker — keep reachable to the SPA at least.)

2. **Is `bau-formular.fly.dev` the only inbound external caller?** README documents the
   `/api/offers/external/*` and `/api/arbeitsbericht/external/pdf` endpoints as "for external
   consumers." Confirm bau-formular (or another machine client) is the caller and whether it
   sends any auth header we could gate on (e.g. a shared API key) instead of leaving fully open.

3. **n8n / gconlineplus inbound webhooks** — `fly-n8n-1.fly.dev` and `gconlineplus.de` appear in
   CSP/CORS, but no INBOUND webhook-receiver route was found in the code. Confirm n8n only *calls
   out from* the browser/other services (not into this server). If n8n POSTs into any endpoint,
   name it so it can be exempted.

4. **`/admin/api/login`** must remain reachable to establish the admin session even if a global
   login gate is added. Confirm the intended relationship between the new global gate and the
   existing admin `requireAuth`.

5. **`/api/email/smtp-test` and `/kalkulation/debug`** are debug endpoints. Confirm they should be
   gated (recommended) rather than removed.
