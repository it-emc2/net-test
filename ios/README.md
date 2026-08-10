# EmC2 Konfigurator — iPad app

A thin WKWebView shell around the existing web configurator. It contains **no
business logic** and must not grow any: pricing, forms, drafts and the offline
cache all live in `src/public/` and run identically in a browser. Everything
here is a platform capability the web layer cannot reach on its own.

Roughly 300 lines of Swift, three files.

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

## What it deliberately does not do yet

Phase 3 and 4 in the plan:

- **Keychain-held auth token.** The session cookie currently lives in the web
  view's data store. It survives relaunch, but not a data-store clear, and the
  server token is a 7-day TTL with no refresh.
- **`NWPathMonitor` reachability.** `navigator.onLine` lies on captive portals
  and dead Wi-Fi; the page currently trusts it.
- **`BGProcessingTask` background sync.** The offline queue flushes on
  reconnect and on page load, but only while the app is open.
- **Durability backstop.** `navigator.storage.persisted()` returns `false` on
  WebKit, so IndexedDB and Cache Storage remain evictable under storage
  pressure. Mirroring the queue to the app container is Phase 4.
- **App icon.** `AppIcon` is referenced but no asset catalogue ships yet.

## Testing offline

There is no need to use airplane mode. Point `EMC2BaseURL` at a local server,
then stop the server: the request fails, the service worker serves the cached
shell, and the app keeps working. That is the same code path a real loss of
signal takes.

Note that a *first* launch must have a connection — the service worker has to
install and cache the shell before it can serve it.
