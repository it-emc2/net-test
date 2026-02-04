# net-test — Project Documentation

## Overview

`net-test` is the EMC2 Konfigurator backend + frontend server (Express + Mongoose). It provides API routes, PDF/docx/LaTeX templating, and a small frontend served from `public/`.

## Quick start

- Prerequisites: Node >= 18.17, npm
- Install dependencies:

```
npm install
```

- Start development server (watches `src/`):

```
npm run dev
```

- Start production server:

```
npm start
```

## Important npm scripts

- `dev`: nodemon watching `src` (development)
- `start`: run `src/app.js` (production)
- `seed:products`: seed product data from `scripts/seedProducts.js`
- `scenarios`: run scenario script `scripts/run-scenarios.mjs`
- `test`, `test:unit`, `test:integration`: run Jest tests
- `lint`, `lint:fix`, `format`: linting and formatting helpers

## Project structure (top-level)

- `src/` — application source
  - `app.js` — main Express app
  - `server.js` — HTTP server bootstrap
  - `routes/` — Express route handlers (e.g. `offers.js`, `pdf.js`, `routing.js`)
  - `controllers/` — request controllers (e.g. `NavigationController.js`)
  - `services/` — service layer (e.g. `ApiService.js`)
  - `models/` — Mongoose models (`Offer.js`, `Customer.js`, etc.)
  - `logic/` — domain/business logic (pricing, mappings)
  - `public/` — static frontend assets and PDF viewer

- `scripts/` — utilities and seed/test helpers
- `templates/` — LaTeX / document templates used for PDF/docx generation
- `tests/` — unit and integration tests (configured for Jest)

## Notable files

- `package.json` — scripts and dependencies
- `src/app.js` — app and middleware configuration (compression, cors, helmet)
- `routes/` — core API endpoints; examine individual files for behavior
- `services/ApiService.js` — external API interactions

## Routes and features

Look in `src/routes/` for the available endpoints. Examples include:

- `offers.js` — offer creation, retrieval
- `pdf.js`, `pdf-template.js`, `pdf-preview.js` — PDF generation and preview
- `docx-template.js`, `latex-template.js` — document templating endpoints
- `magic.js` — integration with external or magic API

## Environment & configuration

- The project uses `dotenv` (check for environment loading in `src/app.js`).
- Default port: `process.env.PORT || 3000`.
- Add `.env` in repo root for local configuration (not committed).

## Testing

- Run full test suite:

```
npm test
```

- Run unit tests only:

```
npm run test:unit
```

Tests use Jest configured in `package.json`. See `tests/setup.js` for test environment setup.

## Development tips

- Use `npm run lint` and `npm run format` to keep code style consistent.
- Use `nodemon` via `npm run dev` for hot reloads.
- If you need to seed sample products, run `npm run seed:products`.

## Notes

- The repo includes PDF-related tooling and heavy native deps (Puppeteer, PDF SDK). Ensure system dependencies (if any) are available when running those flows.
- If you hit issues running `npm run dev`, check that required environment variables are set and that the configured Node version meets `engines.node` in `package.json`.

## Where to look next

- Start with `src/app.js` to understand middleware and route wiring.
- Read `src/routes/` files to discover available API endpoints.
- Open `public/` to inspect the client-side entry and PDF viewer integration.

## Pricing logic

Detailed documentation for the pricing module is available in `docs/pricing.md`.
This covers the public API, inputs/outputs, and special business rules.

---

Questions or want a more detailed section (architecture diagram, API reference, or CONTRIBUTING)? Reply and I will expand the docs.
