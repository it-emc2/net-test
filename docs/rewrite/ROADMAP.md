# OC Rewrite — Roadmap

Principle: **build the safety net first, then port.** Each phase = one or more PRs into the long-lived branch `rewrite/v2`. Nothing merges into `main` without owner OK (main auto-deploys to Fly.io).

| Phase | Goal | Done when | Status |
|---|---|---|---|
| 0 | Foundations | local replica, inventories, decisions, main watcher | ✅ 2026-11-04 |
| 1 | Safety net on the **current** app | see below | ✅ v1 done 2026-11-04 (open v2 items listed) |
| 2 | Skeleton TS monorepo | see below | ✅ 2026-11-04 |
| 3 | Shared pricing package | see below | ✅ 2026-11-04 |
| 4 | Backend port | see below | ⏳ group 1 done 2026-11-04 |
| 5 | Documents | see below | – |
| 6 | Frontend port + deal URLs + one-draft-per-deal | see below | – |
| 7 | UX simplification | see below | – |
| 8 | Self-hosting + cut-over | see below | – |

## Phase 1 — Safety net on the current app (no behaviour change)
- [x] Run existing suites; fix runners (`test:e2e` → Playwright, `test:node`, `test:golden`, `test:ci`) — 2026-11-04, see `TESTING.md`. Open: `run-scenarios` (missing `base.json`), 15+1 stale tests.
- [x] CI workflow `ci.yml` (PRs + non-main pushes, no deploy) — 2026-11-04. Lint/unit/integration reporting-only until pre-existing failures are cleaned.
- [x] Schema inference over replica → `DATA-SHAPES.md` (+ generated report) — 2026-11-04
- [x] Pricing golden master: 115 anonymised real cases, 117 tests green — 2026-11-04. HMS/WD: no pricing exists → dropped (ADR 011).
- [x] DOCX golden master: offer DOCX + Materialübersicht, 50 snapshots, in-process harness — 2026-11-04. Open: PDF, Arbeitsbericht, Kalkulation, signing docs.
- [x] Playwright parity suite v1: navigation for all 7 types + draft save/load, own stack, outbound blocked — 2026-11-04. Open (v2): load by ANG, load by deal (Bitrix stub), export, email/post/signing with stubs.

## Phase 2 — Skeleton
- [x] npm workspace `v2/`: `packages/config`, `packages/domain`, `apps/server`, `apps/web` — 2026-11-04 (`packages/pricing` in phase 3, `packages/docs` in phase 5)
- [x] Config guard (non-production refuses remote DB), `autoIndex`/`autoCreate` off, `DB_READONLY` write lock — tested
- [x] pino JSON logs with redaction, request ids, unified error format, error-reporter hook, health/version — tested; GlitchTip SDK deferred to ADR 009
- [x] Framework decided: React (ADR 012). Web shell with URL routes `/deal/:dealId[/:step]`, `/offer/:offerNumber`, legacy `/?offer=` redirect
- [x] Domain basics: lenient payload schema parses all 115 real fixture payloads losslessly; legacy offer-type/payer rules reproduced
- [x] CI job `v2`: typecheck, 163 tests, web build

## Phase 3 — Pricing package
- [x] Port `pricing-core.js` + `tray-search-core.js` to TS 1:1 (`v2/packages/pricing`, ADR 013) — 2026-11-04
- [x] Golden master 117/117 on TS port; fingerprint identical; differential legacy-vs-TS 2,300 comparisons green; mutation sanity check proves the net catches 1-cent deviations
- [x] Stage 2a: package strict except `core.ts` (own relaxed sub-project `tsconfig.core.json`); `tray-search.ts`, `ah.ts`, `index.ts` strict; tray search differential test (500 scenarios) — 2026-11-04
- [x] Stage 2b: `core.ts` fully `strict` — 152 errors fixed with type-only changes; proof: transpiled JS byte-identical before/after (`v2/scripts/compare-emit.mjs`), golden + differential (11,500 comparisons) green — 2026-11-04
- [x] AH client pricing extracted as pure function (`v2/packages/pricing/src/ah.ts`); golden master = 400 cases recorded from the REAL legacy `computeAHGesamt()` in the browser (`npx playwright test -c playwright.golden.config.cjs`) — 2026-11-04
- [x] AH: payload → input adapter (`ahInputFromPayload`), 144/144 real offers/drafts identical to the legacy restore path — 2026-11-04; 2 legacy bugs documented in `FINDINGS-AH.md`

## Phase 4 — Backend port
- [x] Models with identical collections/fields (Product, Service, User, AppConfig, Offer, Draft); business config (CONFIG_SCHEMA copy, parity-checked); Vigor access; legacy-compatible sessions — 2026-11-04
- [x] Group 1 ported + contract-tested: auth (login/logout/me/confirm-password), catalog (products, services, sla), pricing (/api/price, /api/price/inputs)
- [x] Group 2a (read): offers search-all / by-deal / :offerNumber / list, drafts search / :id — identical to legacy on 60 offers + 80 drafts (anonymised) — 2026-11-04. Contract test also caught a real gap: pricing must get the Offer/Draft models (frozen price of locked offers) — fixed
- [x] Group 2b (write, legacy parity): POST offers, POST offers/:n/recompute, POST drafts (fresh number for sent offers, Ansprechpartner resolution, replay/duplicate rules), POST drafts/recompute — responses AND stored documents identical to legacy — 2026-11-04
- [ ] Group 2c: ADR 007 deal drafts + revisions (new collections)
- [ ] Group 3: customers, users, admin config
- [ ] Group 4: integrations behind interfaces (Bitrix, SMTP/IMAP, OB24, routing, planning, magic, signing)
- [ ] Every remaining endpoint in `BACKEND-INVENTORY.md` ported or explicitly retired (ADR)
- [ ] Integrations behind interfaces with test doubles (Bitrix, SMTP/IMAP, OB24, routing, planning, magic, vigor).
- [ ] Fix security findings (see local `~/emc2-local/SECURITY-FINDINGS.md`) by design: case-insensitive allowlist, no asset bypass, fail-closed API key, admin-only catalog writes, escaped regex.

## Phase 5 — Documents
- [ ] docxtemplater kept; DOCX golden master green.
- [ ] Gotenberg container replaces soffice/Puppeteer/Adobe; PDF comparison per type (ADR 008).
- [ ] Single offer rendering source for DOCX + signing HTML.

## Phase 6 — Frontend port + new flows
- [ ] Every page/feature in `FRONTEND-INVENTORY.md`; Playwright parity suite green on new app.
- [ ] Real router: `/deal/:dealId`, `/offer/:offerNumber`, `/deal/:dealId/:step`; no data loss on navigation.
- [ ] One draft per deal + revision history (ADR 007 accepted) with autosave and "restore version"; read-only legacy view per deal with "copy into draft".
- [ ] Offline: Workbox shell, IndexedDB queue, local pricing — parity with today.

## Phase 7 — UX simplification (owner sign-off per item, `UX-CHANGES.md`)
- [ ] Hide dev tools; reduce export variants to what users need.
- [ ] One "Open" search (deal / name / ANG no.); autosave replaces quick save/save as.
- [ ] Larger controls (min 44 px), min 16 px text, German-only wording, Sie consistently, plain-language errors.
- [ ] Replace `alert/confirm` with clear dialogs.

## Phase 8 — Self-hosting + cut-over
- [ ] Docker Compose (app, Gotenberg, Caddy; GlitchTip) on Coolify/Dokploy (ADR 009).
- [ ] Staging against a **copy** of prod data; parallel run vs current app (same inputs → same prices/docs).
- [ ] Cut-over plan with rollback; owner OK.
