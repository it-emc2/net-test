# Deploy checklist — Auth gate, online signing, admin dashboard

Scope of this release (branch `claude/funny-snyder-587f57`):
- Online signing of offer documents via per-customer link (`/sign/:token`), SZ + Kassenkunde.
- Payer-aware offer email with the inline signing link.
- Admin panel: named-user login (role `admin`), signing-links dashboard, user management + per-user signatures.
- App-wide auth gate: configurator + internal APIs require a logged-in user; customer signing + assets stay public; `/external/*` uses an API key.
- Ansprechpartner = logged-in user (selectable), drives the document signature + email name.

> ⚠️ Do NOT deploy until supervisor approval. This is a checklist only.

---

## 0. Pre-deploy review
- [ ] PR reviewed & approved (targets `v3`).
- [ ] Confirm production app deploys from the intended branch (v3 vs main) and which Fly app name.
- [ ] Decide go-live timing — **the moment this deploys, the configurator requires login.** Have admin users created first (step 3).

## 1. Fly secrets (set BEFORE deploy)
`fly secrets set` (per app):
- [ ] `AUTH_SECRET=<long random>` — signs session tokens. **Required.** (If unset it falls back to ADMIN_SECRET/ADMIN_PASSWORD; set a real one.)
- [ ] `PUBLIC_BASE_URL=https://<app>.fly.dev` (or the custom domain) — so signing links use the correct host.
- [ ] SMTP (already used by the offer email): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (or `SMTP_EMAIL`), `SMTP_PASS`, optional `SMTP_SECURE`, `SMTP_REPLY_TO`.
- [ ] `SIGNING_OFFICE_EMAIL=<office inbox>` (optional; defaults to the SMTP user) — gets a copy of completed signed PDFs.
- [ ] `EXTERNAL_API_KEY=<key>` (optional now) — when set, `/api/offers/external/*` + `/api/arbeitsbericht/external/*` require header `X-API-Key`. **Leave UNSET at first** so bau-formular keeps working, then set it once bau-formular is updated (step 6).
- [ ] `BITRIX_WEBHOOK_BASE` — already configured; confirm present.

## 2. Docker / build
- [ ] Dockerfile installs **system Chromium** (for puppeteer) — already added; confirm the build log shows `chromium --version` passing.
- [ ] `.dockerignore` excludes `.claude/.git/…` (context stays small) — already added.
- [ ] Build the image and watch for the `chromium --no-sandbox --version` build-check succeeding.

## 3. Create users (BEFORE first login is needed)
Run against the **production** DB (set env, then):
```
node scripts/createUser.mjs <email> <password> "<Vorname Nachname>" admin
```
- [ ] Create at least one **admin** user (for `/admin` + configurator).
- [ ] Create the sales users (role `user`, or admin as needed): `node scripts/createUser.mjs <email> <pw> "<Name>" user`.
- [ ] In `/admin → Benutzer`, set `firstName`/`lastName` and **upload each user's signature image** (used on the offer + "Freundliche Grüße" name).

## 4. Smoke test after deploy (staging or right after go-live)
- [ ] `GET /api/health` → 200.
- [ ] Open the app → redirected to `/login`; log in with an admin user → configurator loads.
- [ ] `/admin/` → log in → Konfiguration, **Signatur-Links**, **Benutzer** sections load.
- [ ] Create an offer → **Signatur-Link erstellen** → open the `/sign/<token>` link **in a logged-out browser** → signing page loads (must be public), sign a document → completion email + Bitrix timeline entry.
- [ ] Offer email (`Angebot per E-Mail senden`): Selbstzahler → 2 attachments; Kassenkunde → 4; the signing link text appears in the mail.
- [ ] Ansprechpartner dropdown defaults to the logged-in user; the offer PDF shows that person + their signature.
- [ ] Confirm **bau-formular** still reaches `/api/offers/external/*` (EXTERNAL_API_KEY unset for now).
- [ ] Confirm Bitrix timeline comments still post (offer PDF button + signing events).

## 5. Security verification
- [ ] Logged-out: `GET /` → 302 `/login`; `GET /api/products` → 401; `POST /api/signing` → 401.
- [ ] Logged-out: `/sign/:token`, `/signpage/*`, `/assets/*`, `/api/signing/:token` → reachable (public).
- [ ] Non-admin user → `/admin/api/*` → 403.

## 6. Lock down /external/* (after bau-formular is updated)
- [ ] Give bau-formular the API key; have it send `X-API-Key: <key>` on its calls.
- [ ] `fly secrets set EXTERNAL_API_KEY=<key>` → redeploy.
- [ ] Verify bau-formular still works with the key, and calls **without** the key now 401.

## 7. Data cleanup (optional)
- [ ] Purge test signing requests in production `KonfiguratorDB` (`TEST-*`, `EMAILTEST-*`, `HTMLTEST`) created during development.

## 8. Rollback plan
- [ ] Previous Fly image is available (`fly releases` / `fly deploy --image <prev>`), OR revert the merge on `v3` and redeploy.
- [ ] Note: the new `users` / `signingrequests` collections are additive — rolling back the app does not delete them.

## Follow-ups (not blocking this deploy)
- Custom subdomains (`sign.` public / `app.` gated) via Fly certs + Mittwald CNAME.
- Resend signing link from the dashboard.
- DOCX product de-duplication (generated Angebot PDF still lists products twice).
- fontawesome CSS 404 on the configurator page (pre-existing).
