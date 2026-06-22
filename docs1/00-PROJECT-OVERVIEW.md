# EMC2 Konfigurator - Project Overview

## What Is This Project?

**EMC2 Konfigurator** (`net-test`) is a full-stack Node.js/Express application that serves as a **quotation and offer configurator** for bathroom renovation and accessibility equipment in Germany. It is built for **EMC2**, a company specializing in barrier-free bathroom conversions, grab bar installations, bathtub door retrofits, and related accessibility modifications for elderly/care-dependent individuals.

The system generates professional quotes (Angebote) with dynamic pricing, material lists, labor calculations, and exports them as PDF/DOCX documents. It integrates with Bitrix24 CRM, external product APIs, postal delivery services, and geolocation/routing APIs.

## Core Purpose

1. **Configure offers** for multiple product/service categories (bathroom renovation, bathtub doors, grab bars, bath lifts, everyday aids)
2. **Compute pricing** with complex business rules (markup, discounts, subsidies, VAT, insurance contributions)
3. **Generate professional documents** (PDF, DOCX, LaTeX) for customer-facing quotes and internal reports
4. **Manage customers** with CRM integration (Bitrix24)
5. **Track drafts and offers** with search, restore, and version management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js >= 18.17 (ES Modules) |
| **Backend Framework** | Express.js 5.1.0 |
| **Database** | MongoDB Atlas via Mongoose 8.18.1 |
| **Frontend** | Vanilla JavaScript SPA (no framework) |
| **PDF Generation** | PDFKit, Puppeteer, Adobe PDF Services SDK, pdf-lib |
| **DOCX Generation** | docxtemplater + PizZip, docx-templates |
| **LaTeX** | pdflatex (via texlive) |
| **Email** | Nodemailer (SMTP) |
| **CRM** | Bitrix24 REST API |
| **Geolocation** | OpenRouteService, Photon (Komoot), Nominatim, OSRM |
| **Postal Service** | Binect API |
| **Deployment** | Docker on Fly.io (Frankfurt region) |
| **Testing** | Jest 29 + Supertest + JSDOM |
| **Code Quality** | ESLint 9 + Prettier |

## Application URL

- **Production**: `angebotskonfigurator-emc2-v2.fly.dev`
- **Local Development**: `http://localhost:3000`

## Supported Offer Types

| Code | German Name | English | Description |
|------|-------------|---------|-------------|
| `bu` | Badumbau | Bathroom Renovation | Full bathroom conversion (7 wizard steps) |
| `bwt` | Badewannentuer | Bathtub Door | Retrofit door into existing bathtub (2 steps) |
| `hl` | Haltegriffe/Lifter | Grab Bars/Lifter | Accessibility grab bars and support handles (2 steps) |
| `bl` | Badelift | Bath Lift | Powered bath lift installation (2 steps) |
| `ah` | Alltagshilfen | Everyday Aids | Everyday care services — Alltagsbegleitung + Haushaltsnahe Dienstleistungen (HnD). Client-side pricing with zone-based travel time. (5 steps) |
| `hms` | HMS | HMS | Additional aid category (2 steps) |
| `wd` | WD | WD | Additional aid category (2 steps) |

## Key Business Domain

- **Industry**: Home healthcare, elderly care, accessibility modifications
- **Market**: Germany (German-language UI, EUR currency, 19% VAT)
- **Customer Types**: 
  - **Kassenkunde (KK)**: Statutory health insurance customers (higher labor rates: 69.50 EUR/hr)
  - **Selbstzahler (SZ)**: Self-pay/private customers (lower labor rates: 59.50 EUR/hr)
- **Insurance Subsidies**: Up to 4,180 EUR per person (statutory maximum for accessibility modifications)
- **Company Location**: Kornhausacker 10, Hof (coordinates: 50.3135, 11.9128)

## Project Structure

```
net-test/
+-- src/
|   +-- app.js                  # Main Express application entry point
|   +-- server.js               # Legacy entry point (CommonJS, may be deprecated)
|   +-- config/
|   |   +-- offers.js           # Offer type definitions and page sequences
|   +-- controllers/
|   |   +-- NavigationController.js
|   |   +-- PricingController.js
|   +-- events/
|   |   +-- EventBus.js         # Pub/sub event system
|   +-- logic/
|   |   +-- pricing.js          # Core pricing computation engine (~1860 lines)
|   |   +-- offerMapping.js     # Payload-to-DOCX template variable mapping
|   +-- models/
|   |   +-- Product.js          # Product catalog (Mongoose)
|   |   +-- Service.js          # Service catalog (Mongoose)
|   |   +-- Offer.js            # Saved offers (Mongoose)
|   |   +-- Draft.js            # Draft offers (Mongoose)
|   |   +-- Customer.js         # Customer data (Mongoose)
|   |   +-- EmailLog.js         # Email send log (Mongoose)
|   |   +-- Submission.js       # Legacy submissions (Mongoose)
|   |   +-- StateManager.js     # Frontend state management (client-side)
|   |   +-- AppConfig.js          # Key/value config store (Mongoose)
|   +-- routes/                 # 20+ Express route files
|   |   +-- offers.js           # Offer CRUD + search
|   |   +-- customers.js        # Customer management
|   |   +-- products.js         # Product catalog API (inline in app.js)
|   |   +-- services.js         # Service catalog API (inline in app.js)
|   |   +-- price.js            # Pricing computation (inline in app.js)
|   |   +-- drafts.js           # Draft management (inline in app.js)
|   |   +-- docx-template.js    # DOCX document generation
|   |   +-- pdf-template.js     # PDF generation from templates
|   |   +-- pdf-preview.js      # PDF preview
|   |   +-- adobe-pdf.js        # Adobe PDF Services integration
|   |   +-- arbeitsbericht.js   # Work report generation
|   |   +-- latex-template.js   # LaTeX document generation
|   |   +-- email.js            # Email sending
|   |   +-- kalkulation.js      # Cost calculation display
|   |   +-- bathtubs.js         # Bathtub product suggestions
|   |   +-- trays.js            # Shower tray suggestions
|   |   +-- magick.js           # External API proxy (Hassmann)
|   |   +-- bitrix.js           # Bitrix24 CRM integration
|   |   +-- routing.js          # Geolocation + distance calculation
|   |   +-- admin.js              # Admin config management API
|   |   +-- planning.js         # Planning API (SSE streaming)
|   |   +-- todayscustomers.js  # Today's customer list
|   |   +-- post.js             # Postal delivery (Binect)
|   |   +-- material-overview.js # Material list overview
|   +-- services/
|   |   +-- ApiService.js       # Frontend HTTP client
|   |   +-- bitrixClient.js     # Bitrix24 API client
|   |   +-- todaysCustomersService.js
|   |   +-- configService.js      # Single source of truth for business constants
|   +-- templates/              # DOCX/LaTeX document templates
|   +-- utils/
|   |   +-- formatters.js       # Number/date formatting
|   |   +-- validation.js       # Input validation helpers
|   +-- views/
|   |   +-- ViewBase.js         # Abstract view base class
|   |   +-- FormViewBase.js     # Form-specific view base
|   |   +-- pages/
|   |       +-- KundendatenView.js # Customer data form view
|   +-- public/                 # Frontend SPA
|       +-- index.html          # Main HTML (8,645 lines)
|       +-- script.js           # Main JS bundle (21,514 lines)
|       +-- style.css           # Main CSS (6,499 lines)
|       +-- DraftsManager.js    # Draft management UI
|       +-- ExportManager.js    # Export orchestration
|       +-- EmailManager.js     # Email composition
|       +-- RestoreManager.js   # Offer restoration
|       +-- DrawingPadManager.js # Sketch canvas
|       +-- SignaturePadManager.js # Signature capture
|       +-- HassmannManager.js  # Shower enclosure search
|       +-- BadoluxManager.js   # Budget mode toggle
|       +-- AdminManager.js     # Product/service admin
|       +-- ThemeManager.js     # Theme/dark mode
|       +-- IntegrationsManager.js # External integrations
|       +-- TodaysCustomers.js  # Customer quick list
|       +-- assets/             # 187 image/icon files
|       +-- pdfjs/              # PDF.js viewer
|   +-- admin/index.html          # Admin panel UI for managing config values
+-- tests/
|   +-- setup.js                # Jest test configuration
|   +-- unit/                   # Unit tests
|   +-- integration/            # Integration tests
|   +-- e2e/                    # End-to-end tests
+-- scripts/                    # Seed and utility scripts
+-- data/                       # Data files (arb-seq.json)
+-- docs/                       # Existing documentation
+-- templates/                  # Additional templates
+-- package.json
+-- Dockerfile
+-- fly.toml
+-- eslint.config.js
+-- next.config.js              # CSP header configuration
```

## Running the Application

```bash
# Install dependencies
npm install

# Development (auto-reload)
npm run dev

# Production
npm start

# Run tests
npm test
npm run test:unit
npm run test:integration
npm run test:coverage

# Seed database
npm run seed:products
npm run seed:flexofit
npm run seed:badewannen
npm run seed:badolux

# Lint & format
npm run lint
npm run format

# Health check
npm run health
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `MONGODB_DB` | Database name | `KonfiguratorDB` |
| `PORT` | Server port | `3000` |
| `SMTP_HOST` | Email server | `smtp.example.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_EMAIL` | Sender address | `noreply@example.com` |
| `SMTP_PASS` | SMTP password | `***` |
| `ORS_API_KEY` | OpenRouteService key | `***` |
| `COMPANY_ADDRESS` | Company address | `Kornhausacker 10, Hof` |
| `COMPANY_LAT` | Company latitude | `50.3135` |
| `COMPANY_LNG` | Company longitude | `11.9128` |
| `EXTERNAL_API_BASE` | Hassmann API URL | `https://duschabtrennung-backend.fly.dev` |
| `EXTERNAL_API_USER` | External API email | `***` |
| `EXTERNAL_API_PASSWORD` | External API password | `***` |
| `PDF_SERVICES_CLIENT_ID` | Adobe PDF SDK ID | `***` |
| `PDF_SERVICES_CLIENT_SECRET` | Adobe PDF SDK secret | `***` |
| `BITRIX_WEBHOOK_BASE` | Bitrix24 webhook URL | `https://emczwei.bitrix24.de/rest/...` |
| `BINECT_BASE_URL` | Postal service API | `https://app.binect.de/binectapi/v1` |
| `BINECT_USERNAME` | Binect auth user | `***` |
| `BINECT_PASSWORD` | Binect auth password | `***` |
| `PLANNING_API_BASE_URL` | Planning service | `https://route-plannung.fly.dev` |
| `N8N_TODAYS_CUSTOMERS_URL` | n8n webhook URL | `***` |
