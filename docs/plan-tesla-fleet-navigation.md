# Plan: Tesla Fleet API navigation for "Heutige Termine Planung"

## Problem

One colleague drives one Tesla to customer appointments. Today he types every
stop into the car's nav manually. Goal: push the whole day's route (Termin 1
… Termin N, then back to Kornhausacker 10, Hof) into the car automatically,
ideally with zero manual typing and native Tesla battery/range awareness.

## Status quo (already shipped, needs no further work)

- "Ganze Route" button in `src/public/index.html` (header of
  `#todayPlanningPanel`) + `updateTodayPlanningFullRouteLink()` in
  `src/public/script.js` (~line 26337).
- Builds one Google Maps multi-stop URL: company address → every
  non-cancelled appointment in order → back to company address.
- Zero setup, works today, but: it's a Google Maps link, not Tesla's native
  nav, so no live battery-%/range awareness, and no Fleet API auth needed.
- Google's consumer `maps/dir` URL caps around ~9 waypoints — not hit yet,
  but if the day list ever grows past that, waypoints may silently drop.

## Target: Tesla Fleet API `navigation_gps_request`

Fleet API command that pushes a GPS destination straight into the car's
native nav. Calling it repeatedly with `order = 1, 2, 3…` builds a genuine
multi-stop route with real Tesla range/battery calc — the same as tapping
"+" in the car, just triggered from our system.

### Confirmed from investigation (2026-08-04)

- `oc.emc2.de` is live with working HTTPS already (verified by loading it in
  browser — no cert warnings).
- Static file hosting for Tesla's required public-key file works with zero
  new code: `express.static(public)` at `src/app.js:662` is unguarded (no
  login gate in front of it). Dropping a file at
  `src/public/.well-known/appspecific/com.tesla.3p.public-key.pem` will be
  served correctly on next deploy.
- `tesla-http-proxy` (Tesla's official signing proxy) must run as a
  **persistent** process and **requires TLS even on localhost** — not
  optional, confirmed from Tesla's own repo docs.
- This app is a single Fly.io container/process
  (`fly.toml` / `Dockerfile`, `CMD ["npm", "run", "start"]`). No sidecar
  containers on this Fly setup — but the repo already spawns external
  binaries as subprocesses (LibreOffice/LaTeX in
  `src/routes/docx-template.js`), so `tesla-http-proxy` can run the same way:
  as a background subprocess inside the same container.
- No existing OAuth flow in this repo to copy (Bitrix integration uses a
  static webhook URL, not OAuth) — would have been new code.
- Node 23 / engines ≥18.17 → P-256 crypto is built-in, no extra dependency.

### n8n changes the plan (n8n is on the same Fly.io account)

If n8n's app is in the **same Fly organization** (verify with
`fly apps list` — "same account" can still mean different orgs), Fly's
private WireGuard network (6PN) lets n8n reach the Tesla proxy by internal
hostname without exposing anything publicly:

- Fly only routes the **public** internet to ports declared in
  `fly.toml`'s `[http_service]` (currently just port 3000). Any other port
  the container listens on is reachable only via the private 6PN mesh
  within the org — automatically private, no firewall rules to write.

**Revised split of responsibilities:**

- **Fly app (Node) — smaller scope than originally planned:**
  1. Generate the Tesla P-256 keypair; commit the public half to
     `src/public/.well-known/appspecific/com.tesla.3p.public-key.pem`.
  2. Dockerfile: add a build stage that compiles `tesla-http-proxy` (Go),
     copy just the binary into the runtime image (multi-stage, same pattern
     already used for LibreOffice/Chromium).
  3. On app boot, spawn `tesla-http-proxy` as a background subprocess bound
     to the container's internal network interface on e.g. port 4443 (NOT
     added to `fly.toml`'s `[http_service]` — stays private automatically).
     Self-signed TLS cert regenerated per boot (doesn't need to persist).
     Tesla private key persisted via a Fly secret
     (`fly secrets set TESLA_FLEET_PRIVATE_KEY=...`), written to a temp file
     at startup for the proxy to read.
  4. One new small **read-only** endpoint exposing today's stops **already
     geocoded to lat/lon** (reuse `geocodeWithVariants` /
     `geocodeSingleAddress` from `src/routes/routing.js`) plus the company
     address, in visiting order — `navigation_gps_request` needs
     coordinates, not street text.
  - No OAuth routes, no token storage, no new Mongo model needed in this
    app — n8n owns that.

- **n8n — owns auth and orchestration:**
  1. Generic OAuth2 credential (Tesla's `authorization_code` flow), handles
     login once and auto-refreshes forever — no custom refresh-token
     storage to build.
  2. Trigger: cron each morning, or a Bitrix stage change, or anything else
     — this is what makes it actually automatic instead of a button.
  3. Calls the Fly app's new endpoint to fetch today's geocoded stops, loops
     over them, and calls
     `https://<fly-app-name>.internal:4443/api/1/vehicles/<vin>/command/navigation_gps_request`
     once per stop with incrementing `order`, using the OAuth2 credential
     as the bearer token.
  4. The proxy's cert is self-signed (internal-only) — n8n's HTTP Request
     node needs "ignore SSL issues" enabled for that call specifically.

## Manual steps (must be done by a human, not by Claude)

1. **Blocker to check first** — register/start an app at
   developer.tesla.com and see what it actually requires (business
   verification / DUNS number, or just email + domain). Tesla's own docs
   page 403'd an automated fetch attempt, so this could not be verified in
   advance. If it demands business verification that isn't available, stop
   here — the Google Maps button (already shipped) remains the answer.
2. Register the app: get `client_id` / `client_secret`, set redirect URI
   (e.g. `https://oc.emc2.de/...` — exact path depends on where the OAuth
   callback lives, i.e. inside n8n if n8n owns auth).
3. `fly secrets set TESLA_CLIENT_ID=... TESLA_CLIENT_SECRET=... TESLA_FLEET_PRIVATE_KEY="$(cat key.pem)"`
   on the Fly app that will run the proxy (touches the Fly account — run by
   the human, not automated here).
4. One curl call registering the domain's public key with Tesla's partner
   endpoint (exact command to be handed over once client credentials
   exist).
5. Confirm n8n's Fly app is in the **same Fly org** as the Konfigurator app
   (`fly apps list`), so 6PN private networking actually works between
   them.
6. OAuth consent: whoever "owns" the Tesla account in Tesla's system logs in
   once via the consent screen (inside n8n's OAuth2 credential setup).
7. The colleague opens a Tesla-app "Add Key" link for `oc.emc2.de` once,
   standing near the car, to pair the virtual key.

## Open questions / unverified details

- Exact virtual-key pairing deep-link format (Tesla's docs page returned
  403 to automated fetch — needs manual confirmation during setup).
- Whether the domain-registration ("partner_accounts") step needs a
  Partner token vs. can piggyback on the third-party client credentials —
  to confirm once client_id/secret exist.
- Whether Tesla developer account approval requires business verification
  (the actual blocker to check first, see step 1 above).
