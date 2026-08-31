# Architecture Overview

## High-Level Architecture

```
+---------------------------------------------------+
|                    FRONTEND SPA                     |
|  (src/public/ - Vanilla JS, no framework)          |
|                                                     |
|  index.html + script.js + style.css                |
|  + Manager modules (DraftsManager, ExportManager,  |
|    EmailManager, RestoreManager, etc.)             |
|                                                     |
|  State: EventBus + StateManager + sessionStorage   |
+---------------------------------------------------+
                        |
                   HTTP / Fetch API
                   (credentials: include)
                        |
+---------------------------------------------------+
|                  EXPRESS.js SERVER                  |
|  (src/app.js - ES Modules)                         |
|                                                     |
|  Middleware: Helmet, CORS, Compression, Morgan      |
|  Body parser: JSON (25MB limit)                    |
|                                                     |
|  20+ route handlers in src/routes/                 |
+---------------------------------------------------+
          |              |              |
     MongoDB        External APIs    File I/O
     (Mongoose)     (Bitrix, ORS,   (DOCX templates,
                     Hassmann,       PDF generation,
                     Binect, n8n)    LibreOffice)
```

## Request Flow

### Typical Offer Creation Flow

```
1. User selects offer type on home page
   -> Frontend: applyWizardState({offerType, step})
   -> Sidebar updates, first page shown

2. User fills customer data (Kundendaten)
   -> EventBus.emit(FORM_FIELD_CHANGED)
   -> StateManager persists to sessionStorage

3. User optionally loads Bitrix contact
   -> GET /api/bitrix/contact/{id}
   -> Auto-fills customer form fields

4. User fills material selections (Duschwanne, Wandverkleidung, etc.)
   -> Each change triggers pricing recalculation
   -> POST /api/price with full payload
   -> pricing.js computePrices() runs server-side
   -> Returns: materials, services, totals, VAT, subsidies

5. User reviews on summary page (Zusammenfassung)
   -> All pricing displayed
   -> Summary widget shows running totals

6. User exports document
   -> ExportManager sanitizes material labels
   -> POST /docx-template (or /pdf-template)
   -> Backend merges template + data via docxtemplater
   -> LibreOffice converts DOCX -> PDF (if needed)
   -> File downloaded to browser

7. User sends email
   -> POST /api/email/send-offer (multipart)
   -> Backend generates PDF attachment on-the-fly
   -> Nodemailer sends via SMTP
   -> Timeline comment posted to Bitrix CRM

8. Offer snapshot saved
   -> POST /api/offers with full payload + pricing
   -> Upserted by offerNumber
```

## Backend Architecture

### Middleware Stack (in order)

1. **Helmet** - Security headers, CSP policy
2. **CORS** - Origin whitelist (gconlineplus.de, bitrix24.de, bau-formular.fly.dev)
3. **Compression** - gzip response compression
4. **Morgan** - HTTP request logging
5. **express.json()** - JSON body parser (25MB limit)
6. **express.urlencoded()** - Form data parser
7. **express.static()** - Serve `src/public/` as static files
8. **SPA Fallback** - All non-API GET routes serve index.html

### Route Organization

Routes are mounted in `src/app.js`:

```javascript
// Inline routes (defined directly in app.js)
app.use('/api/products', productsRouter)     // Product CRUD
app.use('/api/services', servicesRouter)     // Service CRUD
app.post('/api/price', priceHandler)         // Pricing computation
app.use('/api/drafts', draftsRouter)         // Draft management

// External route files (src/routes/)
app.use('/api/offers', offersRoutes)         // Offer CRUD + search
app.use('/api/customers', customersRoutes)   // Customer management
app.use('/api/email', emailRoutes)           // Email sending
app.use('/api/bitrix', bitrixRoutes)         // CRM integration
app.use('/api/routing', routingRoutes)       // Geolocation/distance
app.use('/api/trays', traysRoutes)           // Shower tray suggestions
app.use('/api/bathtubs', bathtubsRoutes)     // Bathtub suggestions
app.use('/api/magic', magicRoutes)           // External API proxy
app.use('/api/planning', planningRoutes)     // Planning (SSE)
app.use('/api/post', postRoutes)             // Postal delivery
app.use('/pdf', pdfRoutes)                   // PDF generation
app.use('/pdf-template', pdfTemplateRoutes)  // PDF from templates
app.use('/docx-template', docxTemplateRoutes) // DOCX generation
app.use('/api/adobe-pdf', adobePdfRoutes)    // Adobe PDF Services
app.use('/arbeitsbericht', arbeitsberichtRoutes) // Work reports
app.use('/kalkulation', kalkulationRoutes)   // Cost calculations
app.use('/material-overview', materialRoutes) // Material lists
app.use('/api/latex-template', latexRoutes)  // LaTeX documents
```

### Database Layer

All models use Mongoose ODM with MongoDB Atlas:

```
MongoDB Atlas (KonfiguratorDB)
+-- Products        (product catalog: ID, name, price, dimensions)
+-- Services        (service catalog: ID, name, price, time)
+-- Offers          (saved customer offers with payload + pricing)
+-- Drafts          (work-in-progress offer drafts)
+-- Kundendaten     (customer master data)
+-- EmailLogs       (email send history)
+-- Submissions     (legacy form submissions)
```

### Business Logic Layer

```
src/logic/
+-- pricing.js       # Core pricing engine (factory pattern)
|   +-- computePrices(payload)     # Main entry
|   +-- computeMaterials(payload)  # Material line items
|   +-- computeServiceCosts(payload) # Labor/travel costs
|   +-- computeWorkNotes(payload)  # Description line items
|   +-- computeBwtIncludedLines(payload) # BWT-specific breakdown
|
+-- offerMapping.js  # Payload -> DOCX template variable mapping
    +-- mapOfferToDocxData(body, computed)
```

## Frontend Architecture

### Module System

The frontend uses a hybrid approach:
- **script.js** (27,698 lines): Legacy monolith with core functions exposed as window globals
- **Manager modules**: Modern ES6 modules (DraftsManager, ExportManager, etc.) loaded via `<script type="module">`
- **View classes**: MVC-style views (ViewBase, FormViewBase) with event-driven state sync

### State Management

```
+-------------------+     emit()      +-------------------+
|   Form Views      | ------------->  |     EventBus      |
| (KundendatenView, |                 | (pub/sub events)  |
|  FormViewBase)    |                 +-------------------+
+-------------------+                         |
                                         subscribe()
                                              |
+-------------------+     persist     +-------------------+
|  sessionStorage   | <-------------- |   StateManager    |
| (emc2_wizard_     |                 | (centralized      |
|  state)           |                 |  form state)      |
+-------------------+                 +-------------------+
                                              |
                                         emit(FIELD_CHANGED)
                                              |
+-------------------+     subscribe   +-------------------+
|   Manager Modules | <-------------- |   Pricing/Export   |
| (Drafts, Export,  |                 |   Controllers     |
|  Email, Theme)    |                 +-------------------+
+-------------------+
```

### Event System

The EventBus (`src/events/EventBus.js`) provides decoupled communication:

```
Events:
  OFFER_STARTED       -> When user selects an offer type
  OFFER_RESET         -> When user returns to home
  STEP_CHANGED        -> When wizard step changes
  FORM_FIELD_CHANGED  -> Single field update
  FORM_DATA_SET       -> Bulk form data update
  FIELD_CHANGED       -> State confirms field change
  PRICING_REQUESTED   -> Request pricing computation
  PRICING_UPDATED     -> Pricing results available
  PRICING_ERROR       -> Pricing computation failed
  VALIDATION_REQUESTED -> Trigger validation
  VALIDATION_RESULT   -> Validation results
  NOTIFICATION_SHOW   -> Show toast notification
  LOADING_START/END   -> Loading state changes
```

### Manager Module Pattern

Each manager is a self-contained ES6 module:

```javascript
// Pattern: src/public/SomeManager.js
export function initSomeManager(deps) {
  // Private state
  let state = {};
  
  // DOM references
  const el = document.querySelector('#some-container');
  
  // Event listeners
  el.addEventListener('click', handleClick);
  
  // EventBus subscriptions
  eventBus.on('some:event', handleEvent);
  
  // Public API
  return {
    getData: () => state,
    refresh: () => { /* ... */ },
    destroy: () => { /* cleanup */ }
  };
}
```

Managers are registered globally: `window.__managers = { name: managerInstance, ... }`

### Offline / local-first layer

The frontend is a **partially local-first PWA**. See `13-OFFLINE-AND-SYNC.md`
for the full picture.

```
src/public/
├── manifest.webmanifest    PWA manifest (+ apple-mobile-web-app-* meta in index.html)
├── sw.js                   offline app shell, cache keyed on APP_BUILD_ID
├── sw-register.js          registers sw.js?v=<buildId>, requests persistent storage
├── OfflineSaveQueue.js     IndexedDB write queue, replay on reconnect + page load
├── session-recovery.js     debounced buildPayload() snapshot, survives tab discard
├── pricing-cache.js        caches GET /api/price/inputs
└── pricing-client.js       runs src/logic/pricing-core.js in the browser
```

Four client-side stores:

| Store | Type | Contents |
|-------|------|----------|
| `nt-offline-save-queue` | IndexedDB | queued draft + offer POSTs |
| `nt-session-recovery` | IndexedDB | work-in-progress payload snapshot |
| `nt-pricing-inputs` | IndexedDB | products + config for offline pricing |
| `nt-shell-<buildId>` | Cache Storage | app shell, modules, product images |

The key architectural decision: `src/logic/pricing-core.js` has **no mongoose
import and no server-only dependency**. Both `src/logic/pricing.js` (server,
injects `configService` + `fetchVigourNetPrices`) and
`src/public/pricing-client.js` (browser, injects the IndexedDB cache) wrap the
same file, so an offline total is computed by identical code.

### View Hierarchy

```
ViewBase (abstract)
+-- addListener(), subscribe(), show(), hide(), destroy()
+-- $(selector), $$(selector) - scoped queries
|
+-- FormViewBase (form-specific)
    +-- registerFormField(), getFormData(), setFormData()
    +-- validate(), displayErrors(), clearErrors()
    +-- setupStateSync() - bidirectional state sync
    |
    +-- KundendatenView (customer data form)
        +-- Bitrix contact loader
        +-- Distance calculation
        +-- Budget panel UI
```

## Security Architecture

### Backend Security

- **Helmet**: Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- **CSP**: Content Security Policy allows specific iframe embedding sources
- **CORS**: Origin whitelist for cross-origin requests
- **Body Size Limit**: 25MB max JSON body
- **Authentication**: session-based, enforced by `authGate` — see below

### Authentication & Authorization

> Earlier revisions of this document stated there was no authentication. That
> is **no longer true**. A full auth layer exists.

Implemented in `src/services/authService.js`, `src/routes/auth.js` and
`src/middleware/authGate.js`. No external dependencies — scrypt for password
hashing, HMAC-SHA256 for session tokens.

**Login flow**

1. `POST /api/auth/login { email, password }`
2. Password verified with `crypto.scryptSync` against `User.passwordHash`,
   stored as `"salt:hash"`, compared with `timingSafeEqual`
3. Server mints `base64url("<exp>:<email>") + "." + hmac_sha256(...)` signed
   with `AUTH_SECRET`, **7-day TTL**
4. Set as the `net_session` cookie (`httpOnly`, `sameSite: lax`, `secure` in
   production) **and** returned in the JSON body
5. `GET /api/auth/me` resolves the current user; `POST /api/auth/logout` clears
   the cookie

`tokenFromReq()` accepts either `Authorization: Bearer <token>` or the cookie,
so non-browser and native clients are supported.

**`authGate` request classification** (runs before all routers):

| Class | Matches | Requirement |
|-------|---------|-------------|
| Always public | `/login`, `/api/auth/*`, `/api/health`, `/health`, `/api/version` | none |
| Public assets | `\.(js\|css\|png\|…)$`, `/pdfjs`, `/vendor`, `/signpage`, `/assets` | none |
| Public signing | `/sign/*`, `/api/signing/*` except `/api/signing/status` | valid token in URL |
| External API | `/api/offers/external/*`, `/api/arbeitsbericht/external/*` | `X-API-Key` = `EXTERNAL_API_KEY` |
| Admin | `/admin/*` | self-guarded by the admin panel's own token |
| Everything else | — | valid session (Bearer or cookie) |

Unauthenticated requests: browser navigation (`GET` + `Accept: text/html`)
redirects to `/login`; everything else gets `401 JSON`.

**Notable carve-out:** `/logic/*` is explicitly excluded from the public-asset
rule even though it matches `\.js$`. `pricing-core.js` is shipped to the
browser for offline pricing but is business logic, not an asset.

### CSP Policy

```
frame-ancestors: self, gconlineplus.de, *.gconlineplus.de, emczwei.bitrix24.de, bau-formular.fly.dev
script-src: self, unpkg.com, emczwei.bitrix24.de, + 4 pinned sha256 inline hashes
img-src: self, data:, blob:, media.onlineplus.store
connect-src: self, emczwei.bitrix24.de, route-plannung.fly.dev, bau-formular.fly.dev, unpkg.com
worker-src: self, blob:, unpkg.com
object-src: none
```

Note the **pinned inline-script hashes** in `script-src` — adding or editing
any inline `<script>` in `index.html` requires updating the hash list in
`src/app.js`.

### Remaining security gaps

- No rate limiting on login or any other endpoint
- No CSRF token (mitigated by `sameSite: lax` on the session cookie)
- No input-sanitization middleware; individual routes handle their own validation
- `EXTERNAL_API_KEY` is **fail-open**: if the env var is unset, `/external/*`
  is unauthenticated (a warning is logged once)
- `isPublicAsset()` treats *every* `.js` under `src/public/` as world-readable,
  so any file there that embeds a secret is exposed without a session

## Deployment Architecture

### Docker

```dockerfile
# Base: Node 23.11.0 slim
# System deps: LibreOffice 25.8.4, LaTeX (texlive), fonts
# Port: 3000
# Entry: npm run start
```

The Docker image includes LibreOffice and LaTeX for server-side document conversion (DOCX -> PDF, LaTeX -> PDF).

### Fly.io

```toml
app = "angebotskonfigurator-emc2-v2"
primary_region = "fra"  # Frankfurt
vm.size = "shared-cpu-1x"
vm.memory = "1gb"
```

### External Service Dependencies

```
MongoDB Atlas        -> Database (cloud-hosted)
Bitrix24            -> CRM (emczwei.bitrix24.de)
OpenRouteService    -> Geocoding + routing
Photon (Komoot)     -> Geocoding fallback
Nominatim (OSM)     -> Geocoding fallback
OSRM                -> Routing fallback
Hassmann API        -> Shower enclosure products
Binect              -> Postal delivery service
Adobe PDF Services  -> Document generation
n8n                 -> Workflow automation (today's customers)
Route Planning API  -> Planning service (route-plannung.fly.dev)
```
