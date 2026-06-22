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
- **script.js** (21,514 lines): Legacy monolith with core functions exposed as window globals
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
- **No Authentication**: API endpoints are currently open (no JWT/session/API keys)

### CSP Policy

```
frame-ancestors: self, gconlineplus.de, *.gconlineplus.de, emczwei.bitrix24.de, bau-formular.fly.dev
script-src: self, unsafe-inline (hashed), unpkg.com, cdn.bitrix24.com
img-src: self, data:, blob:, media.onlineplus.store
worker-src: self, blob:, unpkg.com
```

### Important Security Note

There is **no authentication or authorization** on any endpoint. All APIs are publicly accessible. This appears to be by design for an internal/embedded tool, but it means:
- Anyone with the URL can read/write offers, customers, products
- No rate limiting is implemented
- No CSRF protection for form submissions
- No input sanitization middleware (individual routes handle validation)

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
