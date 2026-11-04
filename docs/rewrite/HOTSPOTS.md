# Rewrite Hotspots — pricing, documents, data shapes, tests (baseline `main@4b6002a`)

## Pricing
| File | LOC | API |
|---|---|---|
| `src/logic/pricing-core.js` | 2876 | default `(ProductModel, {cfg, fetchVigourNetPrices, OfferModel?, DraftModel?})` → `{computePrices, computeServiceCosts}` (:2196, :2874); `NO_MARKUP_IDS` :88, `computeFingerprint` :109, `sumPriceAdjustments` :126. Internals: `collectSelections` :290, `computeWorkNotes` :401, `computeMaterials` :640 (~1200 LOC), `computeServiceCosts` :1821, BWT :2043/:2139 |
| `src/logic/pricing.js` | 15 | server wiring (configService, vigorDb, Offer, Draft) |
| `src/logic/tray-search-core.js` | 125 | pure, easy port |
| `src/logic/offerMapping.js` | 737 | duplicate of docx-template helpers |
| `src/services/configService.js` | 327 | `CONFIG_SCHEMA` (35 keys), DB overrides, 60 s refresh; `TAX_RATE` needs restart |

- Constants: in `CONFIG_SCHEMA` **and** hard-coded fallbacks in core (labour 69.5/79.5 :1857, KM 0.35, subsidy 4180/8360 :2771, grab bonus 100/47.06 :2726, legacy bonus 3000/300 :2692, grab IDs CLPESG30–80, `WV_COLOR_ARTICLE` :29).
- Inputs beyond payload: Product prices, **Vigor live net prices** (2nd DB, silent snapshot fallback; offline browser uses empty map), snapshot cache (locked → stored pricing; fingerprint via `stableStringify` — key selection must stay byte-identical).
- **AH/HMS/WD**: server returns empty shell (:2240); real price in browser `script.js:12433` (`computeAHGesamt`); HMS/WD client function not located yet.
- Golden master: call core with fake ProductModel (pattern `tests/unit/pricing.test.js:4`), fixed `cfg`, fixed vigor map, no Offer/Draft model → deterministic. Inputs/expected from replica `offers` (payload + pricing + fingerprint) + Products/vigor snapshot.

## Documents
| Output | Endpoint | Tool | Template | Gotenberg |
|---|---|---|---|---|
| Offer DOCX (BU-SZ/BU-KK/BWT/HL/BL/AH) | POST /docx-template :2515 | docxtemplater (`paragraphLoop`, `nullGetter ""`, image module) | Angebot-10, Angebot-BU-KK-2, -BWT, -HL, -BL, AH-Angebot, fallback Angebot.docx (:123-159) | DOCX stays |
| Offer PDF | /docx-template/pdf :2672 | soffice, global queue, 60 s | same | yes (LibreOffice route) |
| Arbeitsbericht | arbeitsbericht.js :321/:356/:373 | docxtemplater + soffice | Arbeitsbericht.docx | yes |
| Kalkulation | kalkulation.js :976/:1016; v2 :1058 | docxtemplater + soffice; v2 HTML→Puppeteer | Kalkulation.docx; kalkulation-v2.js | yes |
| Materialübersicht | material-overview.js :220/:239 | docxtemplater + soffice | Materialuebersicht.docx | yes |
| Signing PDFs (offer HTML, Vollmacht, Abtretung, Zusatzblatt, AH) | signing.js:227-243 | HTML→Puppeteer | signing-docs.js | yes (Chromium) |
| Product image PDF | email.js :436/:665 | Puppeteer | – | yes |
| Postal | post.js:370 | pdf-lib | – | no |
| Form PDF / debug / LaTeX / Adobe | pdf-template (broken), pdf (pdfkit), latex-template, adobe-pdf | – | – | remove / replace |

- Offer rendered twice (DOCX + signing HTML) → must show identical numbers; consolidate.
- Unused deps: `docx-templates`, `mammoth`, npm `soffice`/`pdflatex`. `src/templates/` has ~8 stale variants, `~$` lock files, `.tmp`.

## Data shapes
- `Offer.payload`, `Draft.payload`, `pricing` = Mixed, no validation. One wizard object with all sections; `activeOffer` selects type; unknown → `bu` (pricing-core:266).
- Type key fallbacks: `activeOffer` / `currentOfferKey` / `offerType` (:2237). Payer at `services.payer` or `Kundendaten.payer` as `KK|KASSENKUNDE|kk|sz`.
- String booleans ("on", "ja", "8"); `getPath` supports flat dotted keys, `a[b]`, nested.
- No migration layer; ~35 read-time compat fallbacks (pricing-core :115, :327, :403, :1253, :2376, :2614, :2688-2698; kalkulation :368 `backfillLegacySnapshot` pre-2026-08; docx-template :1004/:1053/:2008/:2033).
- → TS types must come from **schema inference over replica data**, parsed with lenient Zod (coerce + passthrough).

## Tests today
| Where | Files | Cases | Notes |
|---|---|---|---|
| tests/unit | 45 | ~399 | Jest ESM, no secrets |
| tests/integration | 4 | ~54 | mongodb-memory-server |
| tests/e2e/*.spec.cjs | 3 | – | Playwright, needs running app; `npm run test:e2e` runs Jest → **0 tests** |
| tests/e2e/offline-sync | 6 | ~35 | own Mongo + app |
| test/*.mjs | 4 | node:test | **never run** (no script) |
| scenarios/pdf | 10 JSON | – | visual only |
| scripts/run-scenarios.mjs | – | – | **broken** (`base.json` missing) |

Gaps: no CI test gate; no pricing golden master per type × payer × subsidy; no DOCX/PDF content tests; none for Kalkulation, Materialübersicht, Arbeitsbericht, signing PDFs.

## CI/CD
`fly-deploy.yml`: push to main → `flyctl deploy` only (no lint/test/build gate). Dockerfile node 23.11 slim, pinned Puppeteer Chrome, LibreOffice 25.8.7 (amd64 only), texlive. fly.toml 2 GB/2 CPU, min 1 machine. `app.js:75` `execSync git rev-parse` at boot.

## Top rewrite risks
1. `computeMaterials` branching + rounding order (`round2` EPSILON, `ceilSafe`, gross/net :1624) — golden master mandatory.
2. Snapshot semantics (locked immutability, fingerprint byte-stability, `AUTO_RECOMPUTE_PRICING`, drift via `priorSnapshot`).
3. Time-dependent legacy rules derived from snapshot fields — old offers must render identically.
4. AH/HMS/WD pricing only in 30k-LOC client script — locate + extract first.
5. Vigor live prices with silent fallback; online/offline may differ.
6. DOCX templating options + `mapData`/`buildAhData` (2704 LOC, de-DE formatting) — keep docxtemplater.
7. Duplicate offer rendering (DOCX vs signing HTML) + duplicated helpers.
8. Untyped Mixed payloads — strict types would break old offers.
9. PDF pipeline heterogeneity; LibreOffice 25.8 typography must match under Gotenberg.
10. Test infra broken/missing — build the safety net before porting.
