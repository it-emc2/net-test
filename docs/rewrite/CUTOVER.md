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
| D5 | Run migrations 001 (deal-draft indexes), 002 (B-1, one customer field), 003 (indexes for the new record collections `offer_sends`, `signing_completions`, `offer_numbers`, ADR 023) 004 (indexes of the new error log `error_events`: expiry after 90 days — without it the records are kept forever; schema in `apps/server/src/platform/error-events.ts`) and 005 (variants, ADR 027 A: `deal_drafts` gets `uniq_deal_variant`, then the one-draft-per-deal index `uniq_dealId` is dropped; no document is rewritten — without it a second variant is refused with `VARIANT_CREATE_FAILED`) | Yes — after a backup, dry run first |

## 1. Preparation (days before, no user impact)

1. **Server**: install Docker; copy `v2/deploy/` (compose, Caddyfile) and create `.env` from `.env.example` on the server (never in git). Values: the current app's settings, plus:
   - `AUTH_SECRET` = **the current app's value** (logins stay valid across the switch);
   - `EXTERNAL_API_KEY` set — and the same key entered in the bau-formular (v2 keeps the external lookup closed without it);
   - `GOTENBERG_URL` is set by compose;
   - second offer type (ADR 027 B), only to point at a test pipeline: `SECOND_OFFER_CATEGORY_ID` (default 72), `SECOND_OFFER_STAGE_ID` (default `C72:NEW`), `SECOND_OFFER_SOURCE_ID` (default `WEBFORM`), `SECOND_OFFER_TITLE` (default „Neuanfrage“), `SECOND_OFFER_VALUES_JSON` (optional override of the enum values per offer type; an invalid value stops the start).
   - route start for Alltagshilfe (offer type `ah`, UX-CHANGES U-049): `COMPANY_ADDRESS_AH` (default `Waldstraße 5, 95032 Hof` — postcode confirmed by the owner 2026-11-23), optional `COMPANY_AH_LAT` / `COMPANY_AH_LNG` (without them the address is geocoded); every other offer type keeps `COMPANY_ADDRESS` (default `Kornhausacker 10, Hof`)
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
- Signing completions (ADR 027 A, step 3): every signature now also writes the signed offer's amount, final total, offer number and offer link (non-AH) or its AH fields, offer link and (ADR 028) the AH monthly amount (AH) to Bitrix; after a signature the „ANG verschickt“ move leaves the deal where it is. Watch `error_events` (area `signing.completion`: `SIGNING_DEAL_UPDATE_FAILED`, `SIGNING_AMOUNT_MISSING`, `VARIANT_SECOND_SIGNATURE`, `VARIANT_PARTIAL_SIGNING_CLOSED`, `VARIANT_OF_SIGNATURE_UNKNOWN`) and the Bitrix failure log.

- Second offers (ADR 027 B): `error_events` area `deals.second-offer` — `SECOND_OFFER_UNCLEAR` (check Bitrix for the deal, then the user retries with „In Bitrix prüfen“), `SECOND_OFFER_DRAFT_FAILED`, `SECOND_OFFER_BITRIX_FAILED`, `SECOND_OFFER_COMMENT_FAILED`. Claims are in `second_offer_creations` (keyed by `_id`, no migration; the old app ignores it).

## 4. Way back (rollback, ~10 minutes)

1. DNS for `oc.emc2.de` back to Fly.io (the old app was never stopped).
2. Data: everything v2 writes lands in the **same collections with the same fields**, so the old app reads it — **except autosaved deal drafts** (`deal_drafts`, new in v2). Before switching back, run the export that copies each deal's current draft into the old `drafts` collection as a normal draft named after the deal (tool to be written before the switch — listed below), so no work is lost.
3. The two migrations stay — both are compatible with the old app (001 only adds new collections; 002 removes one empty field value the old app never needed).

## 5. After a stable period

- Freeze the old app; the mechanical ports (ADR 019) and today's UI files become v2's own code; the drift guards that compare with legacy are retired step by step.
- Phase 7 follow-ups (e.g. one shared template for offer document + signing page) as separate proposals.

## Open items before the switch

- [ ] Owner decisions D1–D5.
- [ ] Variants step 3 on a Bitrix **test deal** with the owner (send A, send B, sign A — field checklist in the step-3 PR). New collection `deal_variant_choices` needs no migration (keyed by `_id`); the old app ignores it on the way back.
- [x] Rollback export tool `deal_drafts → drafts` (§4.2): `node apps/server/dist/cli/migrate.js rollback-export [--apply]` — insert-only, idempotent, tested; dry run on the copy 2026-11-06: 0 (no deal drafts exist yet).
- [ ] Second offer type (ADR 027 B, step 3): the first real creation with the owner on a **test contact** (test pipeline via `SECOND_OFFER_*` if needed). Right after creation the new deal must show:
  - [ ] pipeline „Neue Anfragen“ (72; or the test pipeline), stage „[VI] Neu“;
  - [ ] title written by the stage's rule (`<ID> - Neuanfrage <Kategorie Neu> - <Tätigkeit> - von <Nachname, Vorname>`), not „Neuanfrage“;
  - [ ] responsible person set by the rule (the app sends none);
  - [ ] „Kategorie Neu“, „Auszuführende Tätigkeiten“ as in the value table for the chosen type, „Zugehörigkeit“ = „Eigener Auftrag“;
  - [ ] source „Bestandskunde“ (`WEBFORM`);
  - [ ] the same contact as the first deal, as primary contact;
  - [ ] timeline notes on both deals („Angelegt aus OC als weiteres Angebot …“ / „Weiteres Angebot … angelegt: Auftrag …“);
  - [ ] the deal can be found by `crm.item.list` filter `originatorId=oc-second-offer`, `originId=<creationId>` (the lookup after an unclear outcome);
  - [ ] the OC: the new deal's offer has the customer data, the new deal number, no products; both offers list each other;
  - [ ] a later send / signature moves the new deal into the HD (38) or AH (52) pipeline as usual.
- [ ] AH amount in Bitrix (ADR 028) on a Bitrix **test deal** in the AH pipeline (52) with the owner: send a Selbstzahler AH offer → „ANG verschickt“: deal amount = the gross monthly amount (net + 7 %), manual, EUR, AH UF fields as before; a Kassenkunde offer → the net monthly amount (not the Eigenanteil); sign the first offer after sending a second variant → the deal amount is the signed offer's; an old AH deal opened again keeps its amount until the next send. Check the amount does not break an AH robot or report that expected 0.
- [ ] Staging run with staff spot-check (§1.5).
- [ ] Fresh parallel run on a copy taken the day before (§1.4).
