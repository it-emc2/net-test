# Testing — baseline & golden masters

## Commands
| Script | Runs |
|---|---|
| `npm run test:ci` | golden + unit + integration + node:test (what CI will run) |
| `npm run test:golden` | pricing (117) + DOCX (51) golden masters |
| `npm run test:unit` / `test:integration` | Jest |
| `npm run test:node` | `test/*.mjs` (node:test; previously never run) |
| `npm run test:e2e` | Playwright against a running app on :3000 (was: Jest → 0 tests) |
| `npm run test:e2e:offline` | Playwright offline suite (own Mongo + app) |
| `npm run golden:pricing` | rebuild pricing golden master from **local replica** |
| `npm run golden:docs` | rebuild DOCX golden master (run after `golden:pricing`) |

## Baseline on `main@4b6002a` (2026-11-04)
| Suite | Result |
|---|---|
| golden (new) | **168 / 168** (pricing 117, DOCX 51) |
| unit | 411 / 426 — 15 failing (pre-existing) |
| integration | 53 / 54 — 1 failing (pre-existing) |
| node:test | 4 / 4 |
| e2e | 12 tests now discovered (need running app — phase 1 step 5) |

### Pre-existing unit failures (not fixed — decide per item)
| Suite | Cause | Verdict |
|---|---|---|
| `events/EventBus`, `models/StateManager`, `config/offers` | test dead modules not loaded by the SPA (stale) | delete with dead code |
| `sidebarGroups` (1), integration `OfferFlow` (1) | page list changed (bu has 15 steps now) | stale expectation |
| `pricing.test.js` "Example A", `logic/pricing.test.js` (hl title, wall panels) | expectations from older engine (label "Handläufe", WV inputs) | stale; superseded by golden master on real data |
| `vigor-live-price` (2 timeouts) | saved-offer path hits the real Mongoose `Offer` model (buffers 10 s without DB) | test wiring bug; inject stub Offer model |

## Pricing golden master
- Builder: `scripts/golden/build-pricing-golden.mjs` — local replica only; stratified sample (offers 10 / drafts 6 per type × payer; ah 2 as shell check) = **115 cases** + coverage + fingerprint test.
- Records only the Products (135) and vigor prices (57) the engine actually looked up, plus effective config (schema `value` + `appconfigs`).
- Anonymisation before computing: customer sections scrubbed, every customer string replaced wherever it appears, free-text keys (`*note`, `*hinweis`, …) blanked, data URLs removed, digit-only phones/insurance numbers replaced. Verified: 0 customer tokens remain (only generic words like the brand "Fischer").
- Findings while building:
  - **`computePrices` mutates its input payload** → callers must not reuse a payload after pricing (rewrite: make it pure, but golden master compares output only).
  - Only **9 / 96** stored offer totals equal today's recomputation → prices/config drifted since; locked-offer immutability is essential.
- Rule change on purpose → rebuild with `npm run golden:pricing`, review the diff, note it in `DECISIONS.md`.

## DOCX golden master
- Harness `tests/golden/docs-harness.mjs`: real `docx-template` router in-process, in-memory MongoDB seeded with catalog snapshot (`fixtures/docs/products.json` 640 Products, `vigor-products.json` 71 docs) + config → **no replica/DB needed in CI**.
- 25 cases (2 per type × payer from the pricing fixtures) × {offer DOCX, Materialübersicht} = 50 snapshots: text per paragraph for document/header/footer parts + table/image counts.
- Normalised: today's date → `<TODAY>`, `ANG-<ts>`, letterhead personal names → `<OWNER>` (initials-only rule). PII scan: 0 customer tokens.
- Not yet covered: PDF output (needs LibreOffice; Gotenberg phase), Arbeitsbericht, Kalkulation, signing HTML/PDFs.
- Finding: `/docx-template/material-overview` writes a debug copy `out-Materialuebersicht.docx` into the process cwd on every call (gitignored; on Fly ephemeral disk).
