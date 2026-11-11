# Switch-over plan: current app (Fly.io) → OC v2 (self-hosted)

Status: **draft for owner OK** (phase 8). Nothing here runs without the owner's go-ahead.
Principle: v2 uses the **same database, same collections, same fields** (ADR 002) and today's UI (ADR 021) — so the switch is a change of *who serves the address*, not a data migration. The way back is the same step in reverse.

## 0. Decisions needed from the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Server (ADR 009): German VPS (e.g. Hetzner, ~2 vCPU / 4 GB) or on-prem | VPS in Germany — no office hardware, DSGVO-friendly location |
| D2 | Deployment tool: Coolify or Dokploy, or plain `docker compose` | Plain `docker compose` first (already tested in CI); a UI tool later if wanted |
| D3 | Date/time of the switch | A quiet afternoon (no appointments), not before a weekend |
| D4 | Database user (ADR 010): replace `atlasAdmin` with `readWrite@KonfiguratorDB` + `read@vigor` | Yes, before the switch (owner action in Atlas) |
| D5 | Run migrations 001 (deal-draft indexes), 002 (B-1, one customer field) and 003 (indexes for the new send records `offer_sends`, ADR 023) | Yes — after a backup, dry run first |

## 1. Preparation (days before, no user impact)

1. **Server**: install Docker; copy `v2/deploy/` (compose, Caddyfile) and create `.env` from `.env.example` on the server (never in git). Values: the current app's settings, plus:
   - `AUTH_SECRET` = **the current app's value** (logins stay valid across the switch);
   - `EXTERNAL_API_KEY` set — and the same key entered in the bau-formular (v2 keeps the external lookup closed without it);
   - `GOTENBERG_URL` is set by compose.
2. **Atlas**: create the least-privilege user (D4); allow the server's IP in the Atlas network list.
3. **Backup**: full `mongodump` of `KonfiguratorDB` + `vigor` (Atlas snapshot plus an offline copy). Restore test on the local replica.
4. **Fresh local copy** of production → run the checks against it:
   - parallel run: `OC_PARALLEL_RUN_URI=mongodb://127.0.0.1:27018 npx vitest run test/parallel-run.test.ts` — must report **0 different** (2026-11-06: 3,800/3,800 identical);
   - migrations **dry run**: `node apps/server/dist/cli/migrate.js` (no `--apply`) on the copy — 2026-11-06: 001 would create 2 indexes, 002 would change exactly 1 customer record (the known B-1 case).
5. **Staging**: start the stack on the server with a staging domain (e.g. `oc-staging.emc2.de`) against the **copy** (or with `DB_READONLY=1` against production for a read-only look). Staff spot-check: open a deal, price, documents, PDF, signing page.
6. **Roles** (ADR 018): everyone who maintains the catalog has role `admin`.
7. **Bitrix/links**: Bitrix links to `https://oc.emc2.de/?offer=…` and `/deal/…` keep working (same domain, same paths).

## 2. Switch (about 30 minutes)

1. Announce a short pause; check nobody is mid-send (offer email / letter / signing).
2. Run migrations on production (D5): `node apps/server/dist/cli/migrate.js --apply` — 001 (creates `deal_drafts`/`deal_draft_revisions` with their unique indexes), then 002 (B-1). Both are idempotent and touch only what they report.
3. Start v2 on the server: `docker compose up -d --build`; wait for `/api/health` = ok.
4. Point the domain `oc.emc2.de` to the server (DNS) — Caddy fetches the certificate automatically.
5. Smoke test with a real login: Hauptmenü, „Öffnen“ a deal, price, PDF, Bitrix comment on a test deal, signing link on a test offer.
6. Keep the Fly app **running but unreachable** (no DNS) for the rollback period.

## 3. Watching (first two weeks)

- Logs: `docker compose logs -f app` (every error has a request id; GlitchTip later, ADR 009).
- Daily: Bitrix failure log (`/admin` → Bitrix-Logs), email/letter sends, signing completions.
- `main` keeps evolving until the switch; after the switch, changes go to v2 only (see §5).

## 4. Way back (rollback, ~10 minutes)

1. DNS for `oc.emc2.de` back to Fly.io (the old app was never stopped).
2. Data: everything v2 writes lands in the **same collections with the same fields**, so the old app reads it — **except autosaved deal drafts** (`deal_drafts`, new in v2). Before switching back, run the export that copies each deal's current draft into the old `drafts` collection as a normal draft named after the deal (tool to be written before the switch — listed below), so no work is lost.
3. The two migrations stay — both are compatible with the old app (001 only adds new collections; 002 removes one empty field value the old app never needed).

## 5. After a stable period

- Freeze the old app; the mechanical ports (ADR 019) and today's UI files become v2's own code; the drift guards that compare with legacy are retired step by step.
- Phase 7 follow-ups (e.g. one shared template for offer document + signing page) as separate proposals.

## Open items before the switch

- [ ] Owner decisions D1–D5.
- [x] Rollback export tool `deal_drafts → drafts` (§4.2): `node apps/server/dist/cli/migrate.js rollback-export [--apply]` — insert-only, idempotent, tested; dry run on the copy 2026-11-06: 0 (no deal drafts exist yet).
- [ ] Staging run with staff spot-check (§1.5).
- [ ] Fresh parallel run on a copy taken the day before (§1.4).
