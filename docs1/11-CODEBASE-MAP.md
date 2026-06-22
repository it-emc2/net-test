# Codebase Map - File-by-File Reference

This document maps every significant file in the codebase with its purpose, key exports, and dependencies.

## Entry Points

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/app.js` | Main Express application, middleware setup, route mounting, MongoDB connection, static file serving | Express app (default) |
| `src/server.js` | Legacy entry point (CommonJS), may be deprecated | - |

## Configuration

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/config/offers.js` | Offer type definitions (pages, labels per type) | `OFFERS` object |
| `package.json` | Dependencies, scripts, Jest config | - |
| `eslint.config.js` | ESLint flat config (ES9+) | ESLint config array |
| `next.config.js` | CSP header configuration | Headers function |
| `fly.toml` | Fly.io deployment config | - |
| `Dockerfile` | Container build instructions | - |

## Database Models (`src/models/`)

| File | Collection | Key Fields |
|------|-----------|------------|
| `Product.js` | Products | productId, name, price, dimensions, source |
| `Service.js` | Services | serviceId, name, price, time, source |
| `Offer.js` | Offers | offerNumber, offerType, payload, pricing, customer |
| `Draft.js` | Drafts | name, offerType, payload |
| `Customer.js` | Kundendaten | customerNumber, contact fields, kundendaten |
| `EmailLog.js` | EmailLogs | to, subject, body, attachmentNames |
| `Submission.js` | Submissions | payload, computed (legacy) |
| `AppConfig.js` | AppConfigs | key (unique), value (Mixed) — runtime business constants |
| `StateManager.js` | (client-side) | Form state, EventBus integration, sessionStorage |

## Services (`src/services/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `configService.js` | Singleton for all configurable business constants. Loads DB overrides on startup; provides sync `get(key, fallback)` and async `set(key, value)` / `setMany(map)`. Falls back to hardcoded defaults if no DB value. | `default` (ConfigService instance), `CONFIG_SCHEMA` (metadata array) |
| `ApiService.js` | HTTP client wrapper | `apiService` instance |
| `bitrixClient.js` | Bitrix24 API client | `bitrixClient` instance |
| `todaysCustomersService.js` | Today's customer list | `getTodaysCustomers()` |

## Business Logic (`src/logic/`)

| File | Lines | Purpose | Key Functions |
|------|-------|---------|---------------|
| `pricing.js` | ~1860 | Core pricing computation engine | `pricingFactory(ProductModel)` -> `{ computePrices }` |
| `offerMapping.js` | ~700 | Payload -> DOCX template variable mapping | `mapOfferToDocxData(body, computed)` |

## Routes (`src/routes/`)

| File | Mount Point | Lines | Purpose |
|------|------------|-------|---------|
| `offers.js` | `/api/offers` | - | Offer CRUD, search, external API |
| `customers.js` | `/api/customers` | - | Customer upsert, search |
| `docx-template.js` | `/docx-template` | ~1700 | DOCX generation with docxtemplater |
| `pdf-template.js` | `/pdf-template` | - | PDF from DOCX template |
| `pdf-preview.js` | `/pdf-preview` | - | PDF preview |
| `adobe-pdf.js` | `/api/adobe-pdf` | - | Adobe PDF Services integration |
| `arbeitsbericht.js` | `/arbeitsbericht` | - | Work report generation |
| `latex-template.js` | `/api/latex-template` | - | LaTeX document generation |
| `email.js` | `/api/email` | - | Email sending (SMTP) |
| `kalkulation.js` | `/kalkulation` | - | Cost calculation |
| `bathtubs.js` | `/api/bathtubs` | - | Bathtub suggestions |
| `trays.js` | `/api/trays` | - | Shower tray suggestions |
| `magick.js` | `/api/magic` | - | External API proxy (Hassmann) |
| `bitrix.js` | `/api/bitrix` | - | Bitrix24 CRM integration |
| `routing.js` | `/api/routing` | - | Geolocation + distance |
| `planning.js` | `/api/planning` | - | Planning SSE stream |
| `todayscustomers.js` | `/api/todayscustomers` | - | Today's customer list |
| `post.js` | `/api/post` | - | Postal delivery (Binect) |
| `material-overview.js` | `/material-overview` | - | Material list PDF |
| `admin.js` | `/admin` | - | Admin panel auth + config CRUD (password-protected) |

**Note**: Some routes (products, services, price, drafts) are defined inline in `app.js` rather than in separate files.

## Services (`src/services/`)

| File | Purpose | Key Methods |
|------|---------|-------------|
| `ApiService.js` | Frontend HTTP client (browser-side) | `computePrices()`, `getProduct()`, `searchProducts()`, `saveDraft()`, `loadDraft()`, `saveOffer()`, etc. |
| `bitrixClient.js` | Bitrix24 REST API client | `bitrixCall(method, payload, options)` |
| `todaysCustomersService.js` | Today's customers fetcher | - |

## Events (`src/events/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `EventBus.js` | Pub/sub event system | `eventBus` singleton, `Events` constants |

## Views (`src/views/`)

| File | Purpose | Key Methods |
|------|---------|-------------|
| `ViewBase.js` | Abstract base class | `render()`, `addListener()`, `subscribe()`, `show()`, `hide()`, `destroy()` |
| `FormViewBase.js` | Form view base class | `registerFormField()`, `getFormData()`, `setFormData()`, `validate()` |
| `pages/KundendatenView.js` | Customer data form | Validation, Bitrix loader, distance calc |

## Controllers (`src/controllers/`)

| File | Purpose |
|------|---------|
| `NavigationController.js` | Wizard step navigation logic |
| `PricingController.js` | Pricing computation coordination |

## Utilities (`src/utils/`)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `formatters.js` | Number/date formatting | `euro()`, `euroC()`, `fmtDateDE()`, `parseMoneyEuro()`, `hhmmToHours()`, `hoursToHHMM()` |
| `validation.js` | Input validation | `validateCustomerData()`, `validateRequired()` |

## Frontend (`src/public/`)

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 8,645 | Main SPA shell (all pages, forms, modals) |
| `script.js` | 21,514 | Core logic bundle (navigation, pricing, forms, restoration) |
| `style.css` | 6,499 | All styles (themes, responsive, components) |

### Manager Modules

| File | Purpose | API Dependencies |
|------|---------|-----------------|
| `DraftsManager.js` | Draft save/load/search | `/api/drafts/*` |
| `ExportManager.js` | PDF/DOCX export orchestration | `/docx-template`, `/pdf-template`, `/api/offers` |
| `EmailManager.js` | Email composition & sending | `/api/email/send-offer` |
| `RestoreManager.js` | Offer/draft restoration | (local state only) |
| `DrawingPadManager.js` | Canvas sketch tool | (local canvas only) |
| `SignaturePadManager.js` | Digital signature capture | (local canvas only) |
| `HassmannManager.js` | Shower enclosure search | `/api/magic/search` |
| `BadoluxManager.js` | Budget mode toggle | `/api/products?prefix=BP` |
| `AdminManager.js` | Product/service admin | `/api/products/*`, `/api/services/*` |
| `ThemeManager.js` | Theme & dark mode | (localStorage only) |
| `IntegrationsManager.js` | Bitrix CRM integration | `/api/bitrix/contact/:id` |
| `TodaysCustomers.js` | Customer quick list | `/api/todayscustomers` |

### Legacy Compatibility

| File | Purpose |
|------|---------|
| `BadoluxLegacyFallback.js` | Fallback if `__FEATURES__.badoluxManager` is false |
| `DraftsLegacyFallback.js` | Fallback if `__FEATURES__.draftsManager` is false |

### Admin Panel (`src/public/admin/`)

| File | Purpose |
|------|---------|
| `index.html` | Standalone admin panel page (also embedded as an iframe modal in the main SPA) |
| `admin.css` | Admin panel styles (dark sidebar, config cards, login screen) |
| `admin.js` | Admin panel frontend logic — token auth, config fetch/render/save |

`src/public/admin-modal.js` — loaded by the main SPA; opens the admin panel in an iframe modal overlay when the ⚙ Admin button is clicked.

### Assets

| Path | Contents |
|------|----------|
| `src/public/assets/` | 187 files: product photos, icons, UI images |
| `src/public/pdfjs/` | PDF.js viewer for in-browser PDF display |

## Scripts (`scripts/`)

| File | Purpose | Run Command |
|------|---------|-------------|
| `seedProducts.js` | Seed general product catalog | `npm run seed:products` |
| `seedFlexofit.js` | Seed Flexofit products | `npm run seed:flexofit` |
| `seedBadewannen.js` | Seed bathtub products | `npm run seed:badewannen` |
| `seedbadolux.js` | Seed Badolux budget products | `npm run seed:badolux` |
| `seedServices.js` | Seed service definitions | `node scripts/seedServices.js` |
| `run-scenarios.mjs` | Run test scenarios | `npm run scenarios` |
| `test-routing.mjs` | Test routing/address validation | `npm run test:address` |

## Tests (`tests/`)

| File | Type | Tests |
|------|------|-------|
| `setup.js` | Config | JSDOM, fetch mock, storage mocks |
| `unit/pricing.test.js` | Unit | Pricing engine (BU + BWT scenarios) |
| `unit/bwt-save-restore.test.js` | Unit | BWT form save/restore round-trip |
| `unit/validation.test.js` | Unit | Input validation |
| `unit/StateManager.test.js` | Unit | State management |
| `unit/EventBus.test.js` | Unit | Event system |
| `unit/logic/pricing.test.js` | Unit | Direct pricing logic |
| `integration/OfferFlow.test.js` | Integration | End-to-end offer creation |

## Data Files

| File | Purpose |
|------|---------|
| `data/arb-seq.json` | Sequential counter for Arbeitsbericht IDs (ARB-XXXXXX) |

## Templates (`src/templates/`)

| File | Purpose |
|------|---------|
| `Angebot.docx` | Standard offer template (BU) |
| `Angebot-BWT.docx` | BWT offer template |
| `Angebot-HL.docx` | Grab bar offer template |
| `Angebot-BL.docx` | Bath lift offer template |
| `Kalkulation.docx` | Cost calculation template |
| `Materialuebersicht.docx` | Material overview template |
| `Arbeitsbericht.docx` | Work report template |
| `Angebot.tex` | LaTeX offer template |
