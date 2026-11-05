# OC Rewrite — start here (every session)

Read in this order, then continue the first unchecked item in `ROADMAP.md`.

| File | What |
|---|---|
| `DECISIONS.md` | Binding decisions (ADR). Never change an ACCEPTED one silently |
| `ROADMAP.md` | Phases + checklist; tick items, add date |
| `BACKEND-INVENTORY.md` | Every endpoint/collection/integration — parity checklist |
| `FRONTEND-INVENTORY.md` | Every page/feature/flow — parity checklist |
| `HOTSPOTS.md` | Pricing, documents, data shapes, tests, top risks |
| `DATA-SHAPES.md` | Real payload shapes per type × era (+ generated report) |
| `TESTING.md` | Test commands, baseline, golden masters |
| `UX-CHANGES.md` | Approved deviations from today's UI |
| `FINDINGS-AH.md` | Legacy AH pricing bugs (kept for parity, fixes need OK) |
| `FINDINGS-BACKEND.md` | Legacy backend bugs found during the port |
| `../../v2/README.md` | The TypeScript rewrite workspace |

**Main sync procedure:** (1) read `~/emc2-local/main-sync/<date>.md`; (2) merge `origin/main` into this branch; (3) `node v2/scripts/port-pricing-core.mjs <sha>` if `pricing-core.js` changed (drift guard fails otherwise), re-copy `CONFIG_SCHEMA`/models if their guards fail; (4) rebuild golden masters (`npm run golden:pricing && npm run golden:docs`) when behaviour changed on main, review the diff; (5) `node scripts/golden/pii-scan.mjs tests/golden/fixtures/**/*.json`; (6) update parity snapshots only for intended UI changes.
| `../../scripts/replica/README.md` | Local prod replica (read-only dump) |

## Hard rules
1. **Prod DB is never written.** Work only on `mongodb://127.0.0.1:27018` (replica). Prod is read only via `rewriteUser` after `guard-readonly.mjs` passes.
2. **Never push/merge to `main`** without explicit owner OK — it auto-deploys to production.
3. **Keep up with main**: before starting, read new reports in `~/emc2-local/main-sync/` (daily watcher `oc-main-watcher`, weekdays 07:33) and add HIGH/MED items to the parity lists.
4. UI behaviour must stay the same; UX changes only via `UX-CHANGES.md` with owner sign-off.
5. People: signature initials only (AO, RF, JP, TR, AL, SW), never names.
6. End every session: update ROADMAP checkboxes, append to the log below.

## Session log
| Date | Session | Done | Next |
|---|---|---|---|
| 2026-11-04 | stack options | Stack decided (B), replica 36/36 collections identical, inventories, ADRs, roadmap, main watcher | Phase 1 |
| 2026-11-04 | phase 1 (a) | Test runners fixed, baseline, schema inference, pricing golden master 117/117, HMS/WD finding | Phase 1: document golden master, Playwright parity, CI |
| 2026-11-04 | phase 1 (b) | DOCX golden 51/51, UI parity 9/9, offline 23/23, CI workflow | Phase 1 v2 items or Phase 2 skeleton |
| 2026-11-04 | phase 2 | v2 workspace: config guard, domain schemas vs real data, Fastify server (logs/errors/DB safety), React shell with deal URLs, CI job; 163 tests | Phase 3: pricing package (TS port vs golden master) |
| 2026-11-04 | phase 3 (stage 1) | Pricing 1:1 TS port, golden 117/117, differential 2,300 comparisons, mutation check; v2 total 395 tests | Phase 3: extract AH client pricing; stage 2 typing |
| 2026-11-04 | decisions | Owner: ADR 007 accepted, ADR 011 = drop HMS/WD; UX-CHANGES.md started | AH pricing extraction |
| 2026-11-04 | phase 3 (AH) | AH pricing pure TS function, 400-case golden master from legacy UI; v2 806 tests | AH payload adapter; stage 2 typing |
| 2026-11-04 | phase 3 (AH adapter) | AH payload adapter verified on 144 real offers via legacy restore; 2 legacy bugs found | Stage 2 typing of pricing core |
| 2026-11-04 | phase 3 done | Pricing package fully strict (JS byte-identical proof), AH extracted + 2 bugs fixed, tray differential; v2 1,093 tests | Phase 4: backend port |
| 2026-11-04 | phase 4 (group 1) | Models, business config, sessions compatible, secure gate; auth/catalog/pricing endpoints identical to legacy (contract test spawns legacy app); v2 1,117 tests | Group 2: offers + drafts |
| 2026-11-04 | phase 4 (group 2a) | Offers/drafts read endpoints identical to legacy (contract test on anonymised real docs); pricing now uses Offer/Draft snapshots | Group 2b: writes + deal drafts |
| 2026-11-04 | phase 4 (group 2b) | Offer/draft writes identical to legacy incl. stored documents (contract test) | Group 2c: deal drafts (ADR 007) |
| 2026-11-04 | phase 4 (group 2c) | Deal drafts + revision history (ADR 007): concurrency, restore, legacy import; v2 1,152 tests | Group 3: customers, users, admin config |
| 2026-11-05 | main sync | Merged main@42150092 (BU redesign); pricing re-ported via new port script + drift guards (JS identical); golden rebuilt; models/config/aufschlag synced; v2 1,161 tests | Phase 4 group 3 |
| 2026-11-05 | phase 4 (group 3) | Customers, users, admin identical to legacy; legacy bug B-1 (customers without number → 500) found; v2 1,171 tests | Group 4: integrations behind interfaces |
| 2026-11-05 | B-1 fix | Owner OK: customers without number saved correctly in v2 (ADR 016), migration 002 (dry-run default) | Group 4 |
