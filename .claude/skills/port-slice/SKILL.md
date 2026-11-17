---
name: port-slice
description: Use when porting a screen, step or slice of today's configurator UI (src/public) to the v2 React app (v2/apps/web) — "start slice X", "build step Y in v2", "port the homepage", "next slice of the rewrite". Fixed 7-step process (pick → read legacy → record → port → replay test → local check → docs/PR), file map, capture/test templates, preview start commands, check level by risk, and known gotchas. Saves re-discovering the setup every session.
---

# Port a slice to v2

Today's UI (`src/public`, served by v2 too) is the reference. Everything not in
`docs/rewrite/UX-CHANGES.md` must behave exactly like today (ADR 004).

## Setup (before anything else)

`node_modules` missing in this worktree? Run `bash v2/scripts/ensure-deps.sh` (the SessionStart
hook normally does it): clones them from another worktree in seconds, `npm ci` only if no lockfile matches.
Never start a plain `npm install`.

## 0. Decide the check level FIRST

| Level | When | Recording | Tests | Local check |
|---|---|---|---|---|
| **Full** | money, prices, sending, signing, saving, Bitrix/mail, stored payload | capture script, all scenarios | replay every scenario + rule unit tests | yes |
| **Light** | display only: homepage, lists, frames, read-only panels, navigation | none (or one small capture of texts) | a few render tests on the rules + 1 screenshot vs. today | only once per step |

Light slices may be big (a whole page per slice). Say the chosen level in the first message.

## 1. Pick

- Next slice: `docs/rewrite/MODULARIZATION-PLAN.md` → "BU build order" table / Phase 4 status (State column "Open").
- Branch per slice from `origin/rewrite/v2`; PR base **`rewrite/v2`**, never `main` (main auto-deploys; owner OK needed).

## 2. Read legacy

| What | Where |
|---|---|
| Page markup | `src/public/index.html` (`#form-<Step>`, page ids) |
| Logic | `src/public/script.js`, `src/public/*.js` (e.g. `EmailManager.js`, `angebotscheck.js`) |
| v2 add-ons over today's UI | `v2/apps/server/src/modules/web/addons/*.js` (send-guard, quickwins, error-compat …) — they are part of "today" |
| Server routes | `v2/apps/server/src/modules/*` |

Write the rules down as the comment header of the new `rules.ts` (see `versand/send-rules.ts`).

## 3. Record (Full only)

- Copy the closest template: `v2/scripts/capture-<similar>.cjs` (form + acts: `capture-versand-mail.cjs`; requests/answers/dialogs: `capture-versand-senden.cjs`).
- Pattern: `SCENARIOS` object → each runs in a fresh context (cookie token, `serviceWorkers: "block"`), outside calls `page.route`-faked, records `view` (texts the user sees), `offer` diff (`changed(base, now)`), per act `stored` + `view`, requests + answers. `RESUME=1` continues a crashed run; retries 6×.
- Mask moving values (offer numbers `ANG…`, dates) before saving.
- Output: `v2/apps/web/test/fixtures/<slice>.json` ("generated — do not edit"). Export `SCENARIOS` when `require`d so tests/fixes can reuse them.
- Run: server up (§6), then `node v2/scripts/capture-<slice>.cjs` (`ONLY=<name>` for one scenario if the script supports it).
- A bug in today's UI found while recording → note it in the plan doc, don't copy it; v2 does the intended thing.

## 4. Port

| Layer | Where | Rule |
|---|---|---|
| Rules | `v2/apps/web/src/features/steps/<step>/rules.ts` (or `<slice>-rules.ts`) | pure functions, no React, no DOM |
| UI | `…/steps/<step>/<Slice>.tsx`, export the step in `steps/index.ts` | shared kit `src/shared/ui` (shadcn), `useOfferStore` (`patch`, `remember`/`scratch` for in-memory only), `checkStep`/`setStepCheck` for "Weiter" |
| Not built yet | `<LegacyLink dealId step>` "In der bisherigen Ansicht öffnen" | same offer, nothing lost |
| API | `v2/packages/api-contract/src/index.ts` (zod) + `call("<name>")` from `src/shared/api` | add entries, don't rewrite others |
| Server | `v2/apps/server/src/modules/<topic>/` | error shape `{error:{code,message,requestId}}` |

UI rules: ≥16 px text, ≥48 px targets, German "Sie", in-page dialogs (no `alert/confirm`), `data-testid` on sections. Lazy route per step; no `document`/`window` listeners.

## 5. Replay test

- Template: `v2/apps/web/test/versand-mail.test.tsx` (form) / `versand-senden.test.tsx` (requests).
- `fakeServer({...BASE, ...})` + `renderApp("/deal/<KEY>/<type>/<Step>")` from `test/helpers.tsx`; offer = `bases[type]` + scenario diff; `it.each(SCENARIOS)` → `expect(shown()).toEqual(s.view)`, then each act → same `stored` + `view`.
- Fake error answers need `requestId` (else `isApiError` is false).
- Run only this file while working: `cd v2 && npx vitest run apps/web/test/<slice>.test.tsx`. Full `npx vitest run` + `npx tsc -b` once before the PR.

## 6. Local check

```bash
docker start emc2-mongo-replica gotenberg-bench   # Mongo :27018, Gotenberg :3456
node v2/scripts/seed-preview.mjs                  # only if oc_preview is empty
(cd v2 && npm run build)                          # tsc -b + web build
GOTENBERG_URL=http://127.0.0.1:3456 bash v2/scripts/preview.sh   # background; :3001, all outside services dead
```

- Login cookie: `net_session` = base64url(`<expiry>:capture@local.test`) + "." + HMAC-SHA256 hex with `dev-only-auth-secret-change-me` (see any capture script's `token`).
- Built-in browser at **834×1194** (iPad Pro 11"), not 768×1024. React app: `http://localhost:3001/app/deal/<id>/<type>/<Step>`.
- Speed (Full, once per step): CPU throttle 6×, long tasks on open/tap < 200 ms, ≤ 1 price call per change; repo suite: `npm run test:perf`.
- Afterwards: stop the server, `docker stop …` — the machines lag with everything running.

## 7. Docs + PR

- `MODULARIZATION-PLAN.md`: move the slice from Open to Built in its row; Phase 4 status bullet.
- New behaviour vs. today → row in `UX-CHANGES.md` (needs owner sign-off).
- Commit, push, `gh pr create --base rewrite/v2`, merge same day if green.

## Gotchas (each cost hours once)

| Symptom | Cause / fix |
|---|---|
| `/app` shows the old page or old script | stale service worker → unregister in DevTools / `serviceWorkers: "block"` |
| ES-module imports 500 / CORS | only ports 3000/3001 are whitelisted |
| Random single wrong character, test passes alone | Node 25.9 UTF-8 bug on this Mac; CI (Node 24) is the truth |
| Capture scenario empty / step check stops it | Kundendaten needs first name etc. — add a setup like `KUNDE` |
| Replay toggles twice | the offer from the fixture already holds the act's result → skip that act in the replay |
| `res.clone()` throws | body already read — parse once |
| Server contract tests fail locally | legacy app reads root `.env`; unrelated |
| `kundendaten.test` flaky | only under load; rerun alone |
| Error code missing in today's UI | v2 sends `error.code`; error-compat maps to `errorCode`; legacy reads `code` → read all three |
