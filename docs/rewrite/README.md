# OC Rewrite — start here (every session)

Read in this order, then continue the first unchecked item in `ROADMAP.md`.

| File | What |
|---|---|
| `DECISIONS.md` | Binding decisions (ADR). Never change an ACCEPTED one silently |
| `ROADMAP.md` | Phases + checklist; tick items, add date |
| `BACKEND-INVENTORY.md` | Every endpoint/collection/integration — parity checklist |
| `FRONTEND-INVENTORY.md` | Every page/feature/flow — parity checklist |
| `HOTSPOTS.md` | Pricing, documents, data shapes, tests, top risks |
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
