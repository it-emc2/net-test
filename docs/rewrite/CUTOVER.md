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

### Owner decisions 2026-11-24

| # | Decided | Effect on this plan |
|---|---|---|
| D1 | **Fly.io, as today** ("for now") — no VPS | §1.1 and §2.3–2.4 as written (compose, Caddy, DNS to a server) do not apply for now; v2 runs as a second Fly app, see §1a. `v2/deploy/docker-compose.yml` stays for a later move |
| D2 | follows from D1: `flyctl deploy` (files in `v2/deploy/fly/`) | Caddy is not needed on Fly (Fly ends HTTPS); Gotenberg is the existing Fly app `emc2-gotenberg`, shared with today's app |
| D3 | **open** | date after the staff spot-check on the test app |
| D4 | **open** — settings "same as main's on Fly.io", so the admin database login stays for now | recommendation stands: least-privilege user before the switch |
| D5 | **yes** | migrations 001–005, after a backup, dry run first; needed before the test app can save a variant |


### Owner decisions 2026-11-25

| Topic | Decided |
|---|---|
| Test app | deploy the merged `rewrite/v2`; the React signing page is switched on there (`SIGNING_UI=react`); the automatic deploy stays off for now |
| D3 (date of the switch) | still open |
| D4 (least-privilege database user) | not now |
| Winterdienst / Hausmeister-Service | stay in the React app as built (U-066, U-067). **To finish later:** real prices, own texts instead of the Alltagshilfe wording, own document templates; only then offer them under „Weiteres Angebot“ |
| Signatures from the old app | recognise them through the deal number (U-069) |
| „Versionen“ | restoring an older, already sent offer number is blocked; the text says how to open the sent offer (U-074). The device history stays out |
| Opening a deal | lists the deal's variants and the old app's documents; "new" creates a new variant (U-073). Only documents from the old app count as stored documents |
| Admin | own admin role / own account locked on the server too (U-070); no "delete user", deactivate only; session recordings and the pricing playground stay out |
| Signing page | full company name from a setting; a customer-friendly text when the final step fails (U-071) |
| Alltagshilfe offer document | the **fixed** task list stays — it does not follow the selected services (business decision) |
| Alltagshilfe amount in Bitrix | the combined Anfahrt is counted once (U-072) |
| Bitrix links to an offer or deal | open in the React app (U-075) |
| Old view | retired only after the items above are done and accepted |
| Phone header with autosave off | not fixed — nobody uses a phone |
| PRs 425, 434, 311 against main | handled by the owner in the old app; not part of the rewrite |

## 1a. Parallel test app on Fly.io (owner idea 2026-11-24, replaces the staging server of §1.5)

v2 runs as its **own Fly app** beside today's app, under its own address (owner's example: `ocv2.emc2.de`). Files: `v2/deploy/fly/app.fly.toml` (app), workflow `.github/workflows/fly-deploy-v2-test.yml` (deploys on every push to `rewrite/v2`, off until the repository variable `FLY_V2_TEST_DEPLOY` is `on`). **Deployed 2026-11-24** as Fly app `ocv2-react`, address `ocv2.emc2.de` (certificate issued, DNS set): health check green, database connected, login requests from both addresses accepted (after the own-origin fix). A real login and a real PDF through `emc2-gotenberg` are not confirmed yet. The automatic deploy (step 6) is still off.

**Migrations 001–005 applied to the live database 2026-11-24** (owner go, backup by the owner; run on the test app with `migrate.js --apply`): 001 three indexes, 002 one customer record (empty `customerNumber` removed), 003 six indexes, 004 two indexes, 005 nothing left to do. A second dry run reports nothing to change.

PDF engine: the test app uses the **existing** Fly app `emc2-gotenberg` (Gotenberg 8.40.0, login required, found on Fly 2026-11-24) — the same one today's app uses. No second PDF app (owner decision 2026-11-24). Consequence: test PDFs and live PDFs share one machine.

**With the same settings as main this is not a sandbox**: same production database, real Bitrix, real mail, real letters. An offer sent from the test app reaches the customer and moves the deal. Rule until the switch: **test deals and test contacts only** (accepted by the owner 2026-11-24: live database and real Bitrix, no copy).

Settings = today's Fly secrets, except:

| Setting | Value on the test app | Why |
|---|---|---|
| `PUBLIC_BASE_URL`, `OFFER_LINK_BASE`, `OC_DOMAIN` | the test address | signing links and the offer link in Bitrix must open in v2 (variants, new signing forms) |
| `EXTERNAL_API_KEY` | set | v2 keeps the external lookup closed without it |
| `COOKIE_SECURE` | `true` | |
| `AUTH_SECRET` | same as today | same users; the login itself is per address |
| `START_UI` | `react` (in `app.fly.toml`, not a secret) | the React app is the start (U-061), see below |

**Start page of the test app (U-061, `START_UI=react`):** `/` and `/login` without `next` open the React app (`/app`, its own login). Today's UI is one click away: the React app links to `/?classic=1` (session cookie `oc_ui=classic`; with it `/` and `/login` are today's UI and today's login, reloads and logout included). Opening the React app clears the cookie. Deep links (`/?offer=`, `/?deal=`, `/deal/<id>`, `/login?next=`) and signing pages behave as today. Today's UI has no link to `/app`; the React app is reached by typing `/app` or by closing the browser (the cookie lasts the browser session). Production (`main`) keeps the default `classic`.

**Company name on the signing page (U-071, `COMPANY_NAME`, not set = „EmC2“):** the company line of the React signing page's contact block on an expired link („Fragen? Wir helfen gern: …“). Set the full legal company name on both apps before `SIGNING_UI=react` is used with customers: `flyctl secrets set COMPANY_NAME='<full company name>' -a ocv2-react` (or `[env]` in `app.fly.toml`); 1–120 characters. The classic page does not read it (it keeps its own text).

**Signing page (U-068, `SIGNING_UI`, not set = `classic`):** which page a customer's signing link `/sign/<token>` opens. `classic` (default): today's page, byte for byte. `react`: the React signing page (`sign.html` of the app build) at the **same address** — links already sent keep working, the signing API and what a signature writes are unchanged; the server sends the page in place (no redirect, so the token never shows up in a Location header or a second log line; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`); if the app build is missing the server falls back to today's page (one warning in the log). **Not switched on anywhere**, also not in `app.fly.toml` — the owner decides after trying it. To try it on the test app: `flyctl secrets set SIGNING_UI=react -a ocv2-react` (or `[env] SIGNING_UI = 'react'` in `app.fly.toml`), open a signing link of a test deal on a phone and an iPad; way back: `flyctl secrets unset SIGNING_UI -a ocv2-react`.

Owner steps (money and secrets — not done by the build agent):
1. `flyctl apps create ocv2-react` (the name can differ; then change `app.fly.toml`).
2. Copy the secrets of today's app to the test app with the differences above (`flyctl secrets import -a ocv2-react`). `GOTENBERG_URL` is copied unchanged — it carries the login of `emc2-gotenberg`.
3. Backup, then migrations 001–005: dry run, then `--apply` (D5).
4. First deploy (command in `app.fly.toml`), check `/api/health`.
5. Address: `flyctl certs add ocv2.emc2.de -a ocv2-react`, DNS record as Fly prints it.
6. For later deploys: deploy token of the test app as repository secret `FLY_API_TOKEN_V2_TEST`, variable `FLY_V2_TEST_DEPLOY` = `on`.

Open points:
- Both apps write the same database at the same time. Drafts are separate (`deal_drafts` is v2 only); sent offers, signing records and customers are shared by design (ADR 002). Not checked under real parallel use: two users sending for the **same deal** from both apps at once — avoid until the switch.
- Links made by the test app point at the test address. At the switch the test address must stay as a second address of the same app, or those links break.
- The switch itself becomes: add `oc.emc2.de` as a certificate of the v2 app and move the DNS record; the way back is the same step in reverse (§4).

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

- [ ] Owner decisions: D1, D2, D5 decided 2026-11-24 (see above); **D3 and D4 open**.
- [ ] Parallel test app on Fly.io (§1a): owner steps 1–6.
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
