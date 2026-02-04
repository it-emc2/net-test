# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

EMC2 Konfigurator - A German pricing and offer configuration system for bathroom renovations (Badumbau), bathtub doors (Badewannentür/BWT), and accessibility aids (Haltegriffe/Lifter). The system generates customized offers with complex pricing calculations and produces DOCX/PDF documents.

## Build and Development Commands

```bash
# Start development server (with hot reload via nodemon)
npm run dev

# Start production server
npm start

# Run all tests
npm test

# Run specific test categories
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # End-to-end tests only

# Run single test file
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/logic/pricing.test.js

# Run tests in watch mode
npm run test:watch

# Test coverage
npm run test:coverage

# Linting and formatting
npm run lint              # Check for linting errors
npm run lint:fix          # Auto-fix linting errors
npm run format            # Format code with Prettier
npm run format:check      # Check formatting

# Validation (lint + unit tests)
npm run validate

# Database seeding
npm run seed:products     # Seed products from external source
npm run seed:badolux      # Seed Badolux products
npm run scenarios         # Run test scenarios

# Health check (requires running server)
npm run health
```

## Architecture

### Backend (Express.js + MongoDB)

**Entry Point:** `src/app.js` - Configures middleware (Helmet CSP, CORS, compression), MongoDB connection, and mounts all routes.

**Core Business Logic:**
- `src/logic/pricing.js` - Factory function that returns pricing calculator. Handles material costs, service costs, markups (Aufschlag), discounts (Rabatt), bonuses, and subsidy calculations (Zuschuss/Pflegebudget). The `computePrices()` method is the main entry point.

**Offer Types** (defined in `src/config/offers.js`):
- `bu` - Badumbau (bathroom renovation) - main flow with 7 wizard pages
- `bwt` - Badewannentür (bathtub door)  
- `hl` - Haltegriffe/Lifter (handrails/lifts)
- `ah`, `hms`, `wd` - Additional offer types

**Data Models** (`src/models/`):
- `Product.js` - Product catalog with pricing and dimensions
- `Service.js` - Service items with pricing
- `Offer.js` - Saved offers with full payload and pricing data
- `Draft.js` - Draft offers (per offerType + name)
- `StateManager.js` - Frontend state management (also used in Node for structure reference)

**API Routes** (`src/routes/`):
- `/api/offers` - CRUD for offers
- `/api/products`, `/api/services` - Product/service catalogs  
- `/api/price` - Stateless pricing calculation endpoint
- `/api/trays` - Duschwanne (shower tray) search
- `/docx-template`, `/pdf-template`, `/material-overview` - Document generation
- `/api/routing` - Address routing/distance calculation
- `/api/magic` - External "magic" API integration
- `/api/bitrix` - Bitrix CRM integration

### Frontend (Vanilla JS)

**Key Components:**
- `src/models/StateManager.js` - Centralized state with sessionStorage persistence, emits events on changes
- `src/events/EventBus.js` - Pub/sub system for component communication. Key events: `FORM_CHANGED`, `PRICING_UPDATED`, `STEP_CHANGED`
- `src/views/` - View classes inheriting from `ViewBase.js` and `FormViewBase.js`
- `src/public/script.js` - Main frontend entry point
- `src/public/index.html` - SPA shell

**State Flow:** Views emit `FORM_FIELD_CHANGED` → StateManager updates → emits `FIELD_CHANGED` → Views react. Pricing is requested via `PRICING_REQUESTED` and results arrive via `PRICING_UPDATED`.

### Document Generation

Uses `docx-templates` and `docxtemplater` for DOCX generation. Templates are in `src/templates/`. LibreOffice is installed in Docker for DOCX→PDF conversion.

## Testing

- Jest with ESM support (requires `--experimental-vm-modules` flag)
- Test setup in `tests/setup.js` provides JSDOM globals and fetch mock
- Tests are organized as `tests/unit/`, `tests/integration/`, and `tests/e2e/`
- Test files follow `*.test.js` or `*.spec.js` naming

## Environment

Requires `.env` file with:
- `MONGODB_URI` - MongoDB connection string (required)
- `MONGODB_DB` - Database name (defaults to "KonfiguratorDB")
- `PORT` - Server port (defaults to 3000)

## Deployment

- Deployed to Fly.io via GitHub Actions on push to `main`
- Dockerfile includes LibreOffice and LaTeX for document generation
- Node.js >= 18.17 required

## Code Conventions

- ES Modules throughout (`"type": "module"` in package.json)
- German variable names in business logic (Kundendaten, Arbeitszeit, Duschwanne, etc.)
- Pricing amounts are in EUR, stored as numbers with 2 decimal precision
- All money parsing handles German format ("1.234,56 €")
