# Handover — offline support (iPad shell) session

Branch: `claude/session-3272e5` · PR: https://github.com/it-emc2/net-test/pull/191 · Date: 2026-09-03

Read this instead of the conversation history. Points to the living docs
rather than duplicating them — read those for detail, this file is the index
+ what's still open.

## What this branch did

| Commit | What |
|---|---|
| `7486a28` | Permanent connection/sync dot in the header (`#connStatus`, 3 states); fixed a real bug where an expired session on save silently failed instead of preserving work + prompting re-login (`auth-recovery.js`, wired into all 4 save call sites) |
| `19f6af4` | Duschwanne (shower tray) suggestion search now works offline — `tray-search-core.js` (shared rules, mirrors `pricing-core.js`) + `tray-search-client.js` (offline fallback); precached the tray illustration + 6 color swatches |
| `e434afc` | Docs pass on the above |
| `db96e01` | Wandverkleidung tab now works fully offline — images (~26 files, ~2.3MB) + the Budget-Wandpaneele product list (falls back to the cached pricing snapshot). Also fixed an unrelated pre-existing bug: one decor image used a Windows backslash path that never rendered even online |
| `64a9580` | Attempted fix for two more bugs found in testing: connection dot stuck green while offline, and blank username in the header while offline |
| `11c4980` | **`64a9580`'s dot fix was incomplete** — `NWPathMonitor` (like `navigator.onLine`) only detects interface loss, not "is our server reachable." Real fix: a periodic `GET /api/version` health-check probe. Verified on device this time. |

Read **[docs1/13-OFFLINE-AND-SYNC.md](docs1/13-OFFLINE-AND-SYNC.md)** for the full current-state architecture (updated throughout this branch) and **[ios/README.md](ios/README.md)** for the native shell specifics. Don't re-derive either from scratch — they're current as of this branch.

## Verified vs. not

| Claim | Status |
|---|---|
| Duschwanne offline search, Wandverkleidung offline (images + list + prices) | Verified live in iPad simulator (server stopped, cold relaunch) |
| Username shown offline via cached `localStorage` name | Verified live (before: blank; after: "Emc2 Admin" shown) |
| Connection dot: red on genuine offline (server-down-but-Wi-Fi-up case) | Verified live on device — **this took two attempts**, see `11c4980`. Don't trust a first "it should work now" on this dot again without an actual cold-offline-launch screenshot; a 9px dot color is easy to misjudge from a scaled screenshot, confirm via description/behavior (e.g. planning shows "Offline – Stand …") too |
| Connection dot: live disconnect *while app is already running* (not a cold launch) | **Not verified** — only the cold-launch-already-offline path has been tested. `NWPathMonitor`'s live-transition path (`onDisconnect` firing mid-session) is implemented but unexercised |
| Auth-expiry-on-save fix (`auth-recovery.js`) | Reuses an already-proven code path (was live in `script.js` for 2 of 4 call sites already); not re-verified end-to-end this session |

## Known gaps — intentionally not touched

Per `docs1/13-OFFLINE-AND-SYNC.md`'s "What is *not* offline today": Badewanne text/dimension search, the screen-picker, Optional-tab name/price resolution, and Duschvorhang's catalog (`/api/vorhang/products`) all still fail live with no offline fallback. Same fixable pattern as Duschwanne/Wandverkleidung if ever wanted — not requested, not done.

Also flagged but not fixed: the "Duschabtrennung (neu)" tab loads a **10MB** `configurator/vigor-model.json` that's cached opportunistically, not precached — a real eviction risk under iOS storage pressure given its size. Noted in the doc, no action taken.

## How to test locally (iPad simulator)

1. Point `ios/EmC2Konfigurator/Info.plist`'s `EMC2BaseURL` at `http://localhost:3001` — **local-only tweak, never commit this pointed at localhost.** Revert to `https://oc.emc2.de` before any commit (check `git status` — this has bitten this session more than once).
2. `npm start` (or the `konfigurator` launch-config server) on port 3001.
3. Build: `xcodebuild -project ios/EmC2Konfigurator.xcodeproj -scheme EmC2Konfigurator -sdk iphonesimulator -destination 'name=<device>' CODE_SIGNING_ALLOWED=NO build` (or the iOS Simulator MCP tool's `build` action).
4. Install + launch the built `.app` on a **booted** simulator (`xcrun simctl boot <udid>` first if needed).
5. To test offline: stop the server, then relaunch the app (force-quit + relaunch is the reliable way to get a genuinely cold offline launch, not just a page reload).
6. Login accounts exist in the local dev DB (6 real accounts, e.g. `digital_01@e-m-c-2.de` — the user's own). No test-only credentials; use a real password.

## PR

https://github.com/it-emc2/net-test/pull/191 — open against `main`, not merged. **Do not merge without the user's explicit go-ahead** — a push to `main` auto-deploys to production via `.github/workflows/*` (Fly.io).
