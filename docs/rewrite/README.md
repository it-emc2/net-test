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
| 2026-11-05 | phase 4 (group 4a) | Bitrix client (throttle/retry/log, no hard-coded token) + 7 read/log routes identical incl. outgoing calls (recording stub); non-prod refuses real Bitrix (ADR 017); v2 1,192 tests | 4b: Bitrix writes |
| 2026-11-05 | phase 4 (group 4b) | Bitrix writes (timeline, uploads, stage moves incl. AH fields, planner notify, admin retry) identical incl. outgoing calls; AH deal fields = legacy on 572 cases; v2 1,201 tests | 4c: SMTP/IMAP + email send |
| 2026-11-05 | phase 4 (group 4c) | Offer email identical (mail, attachments, lock, logs, Bitrix) via local SMTP sink; test env pins all external endpoints; found local Node 25.9 UTF-8 decode corruption (CI = truth); v2 1,209 tests | 4d: OB24 (post) |
| 2026-11-05 | phase 4 (group 4d) | Letters by post (onlinebrief24) identical incl. outgoing request, A4 fitting, lock, rejection, Bitrix; v2 1,224 tests | 4e: routing/planning/todayscustomers |
| 2026-11-05 | phase 4 (group 4e) | Distance suggestion, planning proxy (incl. live stream), today's customers identical incl. outgoing requests; v2 1,234 tests | 4f: magic API |
| 2026-11-05 | phase 4 (group 4f) | Magic API (shower product search) identical incl. login, token cache, outgoing requests, error detail; v2 1,250 tests | 4g: signing; sync main (#313–#315) |
| 2026-11-05 | phase 4 (group 4g) | Online signing identical (create/reuse, validation, carry-over, two-person filing, completion mail, Bitrix, stage, admin dashboard); send-offer uses v2 signing; v2 1,261 tests | remaining endpoints per BACKEND-INVENTORY, then phase 5 |
| 2026-11-05 | phase 4 (group 4h) | Small endpoints identical (vigor prices, catalog bulk, submissions, external lookup with fail-closed key, /health); all remaining legacy endpoints assigned to phase 5/6; v2 1,269 tests | owner: catalog-write rights; next phase 5 (documents) |
| 2026-11-05 | phase 4 (ADR 018) | Owner: catalog edits admins only → v2 enforces it (403 for normal users), admins unchanged; v2 1,270 tests | phase 5 (documents) |
| 2026-11-05 | main sync + phase 4 (group 4i) | main@95fc920d merged, pricing re-ported; product pickers (trays, DA model, curtains, bathtubs) identical; route-parity + verbatim-port drift guards; v2 1,283 tests | phase 5 (documents) |
| 2026-11-05 | phase 5 (5a/5b) | ADR 008 accepted (Gotenberg 8.40.0); offer DOCX/Materialübersicht/PDF via mechanical port (ADR 019) — DOCX golden 50/50 identical, PDFs contain every DOCX word; v2 1,345 tests | 5c signing documents |
| 2026-11-06 | phase 5 (5c) | Signing documents on v2's own ported templates + Gotenberg (contract scenarios identical, PDFs complete); golden date bug fixed; v2 1,350 tests | 5d Kalkulation, Arbeitsbericht, product images, PDF preview |
| 2026-11-06 | phase 5 (5d) | Kalkulation, Arbeitsbericht, PDF preview, product images ported (mechanical + Gotenberg), identical; send-offer fully on v2 documents; legacy no longer loaded in-process; v2 1,364 tests | 5e Adobe/LaTeX/pdf-template (usage check) |
| 2026-11-06 | phase 5 (5d+, 5e) | Materialübersicht carts, /pdf summary, HL parser ported (scanner fix); adapter streams; Adobe/LaTeX/pdf-template retired (ADR 020, 410). Phase 5 complete; only phase-6 frontend routes left in the route guard | phase 6 (frontend) |
| 2026-11-06 | phase 6 (6a) | ADR 021; v2 serves today's UI — security headers, CORS, files, redirects identical (web contract test); Playwright parity suite 9/9 against v2; all 124 legacy endpoints covered | 6b deal URLs |
| 2026-11-06 | phase 6 (6b) | Deal links add-on (/deal/<id> → existing "Deal laden" flow; address keeps deal + step), HMS/WD hidden; local Mac now crashes browsers/Node → CI is the only reference | 6c one draft per deal |
