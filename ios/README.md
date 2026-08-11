# EmC2 Konfigurator — iPad app

A thin WKWebView shell around the existing web configurator. It contains **no
business logic** and must not grow any: pricing, forms, drafts and the offline
cache all live in `src/public/` and run identically in a browser. Everything
here is a platform capability the web layer cannot reach on its own.

Roughly 650 lines of Swift, seven files.

See `docs/plan-ipad-local-first.md` for why it is built this way, and
`docs1/13-OFFLINE-AND-SYNC.md` for how the offline layer works.

## Build & run

```bash
open ios/EmC2Konfigurator.xcodeproj
```

Pick an iPad simulator and hit run. Or from the command line:

```bash
xcodebuild -project ios/EmC2Konfigurator.xcodeproj -scheme EmC2Konfigurator \
  -sdk iphonesimulator -destination 'name=iPad Pro 11-inch (M4)' \
  CODE_SIGNING_ALLOWED=NO build
```

To ship to a device you need a signing team: select the target in Xcode →
Signing & Capabilities → your Apple Developer team. Nothing else is required;
there are no dependencies, no package manager, no CocoaPods.

## Which server it talks to

`EMC2BaseURL` in `EmC2Konfigurator/Info.plist`, default `https://oc.emc2.de`.

**Any host you point it at must also be listed in `WKAppBoundDomains`** in the
same file, or the web view will refuse to navigate there and you will get a
blank screen with no obvious cause.

For local development against a dev server, set both:

```xml
<key>EMC2BaseURL</key><string>http://localhost:3001</string>
```

`localhost` is already in the app-bound list and ATS already permits local
networking, so nothing else needs changing.

## The two constraints that shape this app

Both were measured in the Phase 0 spike, not assumed.

**1. `WKAppBoundDomains` is mandatory.** On iOS a WKWebView only gets service
workers when the app declares this key *and* the web view sets
`limitsNavigationsToAppBoundDomains = true`. Without it the worker silently
never registers — no offline shell, no cached planning week, Cache Storage
empty. This is the single reason the app works offline at all.

**2. It locks navigation to that list (max 10 domains).** Loading anything
else fails with *"Attempted to navigate away from an app-bound domain"*. So
every external link is intercepted in `WebViewController.decidePolicyFor` and
handed to Safari: the Google/Apple Maps route links on the planning cards,
`tel:`, `mailto:`, Bitrix.

Good news from the same spike: app-bound does **not** cost `evaluateJavaScript`
or `callAsyncJavaScript`, which the plan had feared.

## What the shell actually does

| | |
|---|---|
| **Service workers + persistent storage** | `limitsNavigationsToAppBoundDomains` + `WKWebsiteDataStore.default()` |
| **External links → Safari** | `decidePolicyFor` and `createWebViewWith` (for `target="_blank"`) |
| **Downloads** | `WKDownloadDelegate` → temp file → share sheet. `URL.createObjectURL` + `<a download>` does nothing in a WKWebView on its own, so without this the offer PDF simply never appears |
| **Flush work in progress** | `sceneDidEnterBackground` dispatches `pagehide`, which `session-recovery.js` already listens for. No change to the web app |
| **JS dialogs** | `alert`/`confirm` panels — without a `WKUIDelegate`, `confirm()` silently returns false and the drafts and session-recovery flows die |
| **Offline fallback** | A retry screen, shown *only* when there is no cached shell — i.e. the app was installed and first opened with no connection |

## Phase 3 additions

| | |
|---|---|
| **Reachability** | `Reachability.swift` wraps `NWPathMonitor`. `navigator.onLine` reports whether an *interface* exists, not whether anything is reachable — it stays `true` on a captive portal, on Wi-Fi with no uplink, and on a van hotspot that has dropped data. On a real reconnect the shell dispatches the page's own `online` event, so `OfflineSaveQueue` and the planning panel react exactly as they do in a browser. **No web-side change and no bridge**: the event already exists. |
| **Durable session** | `SessionKeychain.swift` copies the `net_session` cookie into the Keychain after each navigation and puts it back if the cookie store has lost it. The plan called for a Bearer token and a native login screen; that would mean teaching the whole web app to send a header it does not send today. Making the existing cookie durable leaves auth exactly as it was. |
| **Background sync** | `BackgroundSync.swift` (`BGAppRefreshTask`) wakes the page long enough for its `online` handler to sweep the queue, for when the iPad is pocketed and walks back into signal without being reopened. |

A matching server change makes the session **sliding**: `GET /api/auth/me`
re-issues the cookie once a token is past halfway through its 7-day life. That
endpoint runs on every load with signal, so anyone who opens the app even
weekly never expires — which on site would otherwise strand them on a login
page that itself needs the network.

### Verification status — read before trusting these

- **Sliding session** — unit tested (`tests/unit/auth-sliding-session.test.js`).
- **Reachability** — the reconnect path is the same `online` event the offline
  e2e suite already exercises, but the `NWPathMonitor` trigger itself has not
  been driven end to end; that needs real network toggling on a device.
- **Keychain persistence — NOT verified, and cannot be in an unsigned build.**
  The cookie capture works (observed: the session cookie is found and read),
  but `SecItemAdd` returns **-34018 `errSecMissingEntitlement`** because a
  `CODE_SIGNING_ALLOWED=NO` build has no `application-identifier`. A signed
  build gets one from its provisioning profile and the default keychain group
  applies. **Confirm this on a signed build**: log in, delete
  `Library/Cookies` + `Library/WebKit` from the app container, relaunch, and
  check it opens signed in. The code logs a warning when the write is refused.
- **Background sync** — cannot be triggered on demand without an lldb
  `_simulateLaunchForTaskWithIdentifier` call. iOS decides whether it ever
  runs, so treat it as "data arrives sooner", never as the guarantee. The
  foreground flush remains the guarantee.

## Phase 4 — durability backstop

`navigator.storage.persisted()` returns **false** on WebKit, so IndexedDB is
evictable and a queued-but-unsynced save could be reclaimed under storage
pressure. `DurabilityMirror.swift` keeps a copy of the queue in the app
container and hands it back at document start; `native-bridge.js` restores
anything missing and re-syncs.

Only the save queue is mirrored — its records carry the full payload of every
unsynced draft and offer, so restoring it restores the work, and the local
drafts list is rebuilt from the same records. The planning and pricing caches
are re-fetchable.

**Verified on the device**: draft saved with the server down → queued and
mirrored (9.6 KB) → `Library/WebKit` deleted to simulate eviction → next
launch restored it and synced it to MongoDB. Its `savedAt` is the user's save
time and `updatedAt` the post-restore sync — the whole chain.

It is not a backup: it lives in the app container and goes with the app.

## App icon

A plain "OC" in the app's theme blue (`#1e5aa8`), 1024×1024, no alpha —
`Assets.xcassets/AppIcon.appiconset/icon-1024.png`. Generated rather than
designed; replace it with real artwork whenever there is some.

## Testing offline

There is no need to use airplane mode. Point `EMC2BaseURL` at a local server,
then stop the server: the request fails, the service worker serves the cached
shell, and the app keeps working. That is the same code path a real loss of
signal takes.

Note that a *first* launch must have a connection — the service worker has to
install and cache the shell before it can serve it.
