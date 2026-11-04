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
| `../../v2/README.md` | The TypeScript rewrite workspace |
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
