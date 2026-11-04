# OC Rewrite — Roadmap

Principle: **build the safety net first, then port.** Each phase = one or more PRs into the long-lived branch `rewrite/v2`. Nothing merges into `main` without owner OK (main auto-deploys to Fly.io).

| Phase | Goal | Done when | Status |
|---|---|---|---|
| 0 | Foundations | local replica, inventories, decisions, main watcher | ✅ 2026-11-04 |
| 1 | Safety net on the **current** app | see below | ⏳ in progress (4/6) |
| 2 | Skeleton TS monorepo | see below | – |
| 3 | Shared pricing package | see below | – |
| 4 | Backend port | see below | – |
| 5 | Documents | see below | – |
| 6 | Frontend port + deal URLs + one-draft-per-deal | see below | – |
| 7 | UX simplification | see below | – |
| 8 | Self-hosting + cut-over | see below | – |

## Phase 1 — Safety net on the current app (no behaviour change)
- [x] Run existing suites; fix runners (`test:e2e` → Playwright, `test:node`, `test:golden`, `test:ci`) — 2026-11-04, see `TESTING.md`. Open: `run-scenarios` (missing `base.json`), 15+1 stale tests.
- [ ] CI workflow: lint + unit + integration on every PR (does not touch deploy).
- [x] Schema inference over replica → `DATA-SHAPES.md` (+ generated report) — 2026-11-04
- [x] Pricing golden master: 115 anonymised real cases, 117 tests green — 2026-11-04. HMS/WD: no pricing exists (ADR 011).
- [x] DOCX golden master: offer DOCX + Materialübersicht, 50 snapshots, in-process harness — 2026-11-04. Open: PDF, Arbeitsbericht, Kalkulation, signing docs.
- [ ] Playwright parity suite against current app on replica: one happy path per offer type, draft save/load, load by ANG, load by deal (Bitrix mocked), export, email/post/signing (SMTP/Bitrix/OB24 mocked).

## Phase 2 — Skeleton
- [ ] npm workspaces: `apps/server` (Fastify), `apps/web` (Vite), `packages/pricing`, `packages/domain` (Zod schemas from phase 1), `packages/docs`.
- [ ] Config guard: refuses non-localhost DB in dev/test; `autoIndex:false` everywhere.
- [ ] pino logging + request IDs; GlitchTip SDK wiring; health/version.
- [ ] Frontend framework spike (Vue 3 vs React) on one page (Kundendaten) → decide, ADR.

## Phase 3 — Pricing package
- [ ] Port `pricing-core.js` + `tray-search-core.js` to TS 1:1 (no "improvements").
- [ ] Golden master green; fingerprint byte-identical.
- [ ] Extract AH/HMS/WD client pricing into the package (server can now price them too).

## Phase 4 — Backend port
- [ ] Same Mongoose schemas/collection names; every endpoint in `BACKEND-INVENTORY.md` ported or explicitly retired (ADR).
- [ ] Integrations behind interfaces with test doubles (Bitrix, SMTP/IMAP, OB24, routing, planning, magic, vigor).
- [ ] Fix security findings (see local `~/emc2-local/SECURITY-FINDINGS.md`) by design: case-insensitive allowlist, no asset bypass, fail-closed API key, admin-only catalog writes, escaped regex.

## Phase 5 — Documents
- [ ] docxtemplater kept; DOCX golden master green.
- [ ] Gotenberg container replaces soffice/Puppeteer/Adobe; PDF comparison per type (ADR 008).
- [ ] Single offer rendering source for DOCX + signing HTML.

## Phase 6 — Frontend port + new flows
- [ ] Every page/feature in `FRONTEND-INVENTORY.md`; Playwright parity suite green on new app.
- [ ] Real router: `/deal/:dealId`, `/offer/:offerNumber`, `/deal/:dealId/:step`; no data loss on navigation.
- [ ] One draft per deal + revision history (ADR 007, needs OK) with autosave and "restore version".
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
