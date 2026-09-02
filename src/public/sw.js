// sw.js — offline app shell.
//
// Purpose is narrow: a technician who loaded the configurator online must be
// able to keep working, and survive a reload, after losing signal on site.
// It caches the shell and images only. It deliberately does NOT cache API
// data — a stale offer or price is worse than no answer.
//
// The cache name comes from the ?v= on this script's own URL, which
// sw-register.js fills from /api/version (APP_BUILD_ID). A deploy therefore
// changes this script's URL, the browser sees a new worker, and the old cache
// is dropped on activate.
//
// Kill switch: if this ever ships broken, deploy a sw.js whose only content is
//   self.addEventListener("install", () => self.registration.unregister());
// and remove the register call. Clients drop the worker on their next visit.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `nt-shell-${VERSION}`;
const CACHE_PREFIX = "nt-shell-";

// Product photos live here (see the CSP imgSrc list in app.js).
const IMAGE_HOSTS = new Set(["media.onlineplus.store"]);

// Modules the offline path needs at the exact moment it cannot fetch them: the
// price fallback only imports pricing-client.js once a price fetch has already
// failed. "/" is deliberately absent — see warmShell, which needs the
// redirect guard.
//
// Only modules reached through a dynamic import() need to be listed here.
// Anything referenced from index.html is discovered automatically at install
// (see discoverShellAssets), because a hand-maintained list drifts: it silently
// lost /style.css, and an offline relaunch rendered the whole app unstyled
// while every byte of the user's data was intact.
const PRECACHE = [
  "/logic/pricing-core.js",
  // Every module script.js pulls in with import(). They are fetched at the
  // moment they are needed, which offline is exactly when they cannot be.
  "/OfflineSaveQueue.js",
  "/PlanningCache.js",
  "/LocalDocsStore.js",
  "/native-bridge.js",
  "/session-recovery.js",
  "/pricing-cache.js",
  "/pricing-client.js",
  "/DraftsManager.js",
  "/DraftsLegacyFallback.js",
  "/RestoreManager.js",
  "/DrawingPadManager.js",
  "/SignaturePadManager.js",
  "/BadoluxManager.js",
  "/BadoluxLegacyFallback.js",
  "/IntegrationsManager.js",
  "/AdminManager.js",
  "/EmailManager.js",
  "/sw-register.js",
  // The only image worth precaching. Discovery deliberately ignores images:
  // index.html references 118 of them and they are almost all product photos,
  // which the runtime cache picks up as they are actually used. The header
  // logo is different — a broken image there reads as a broken app.
  "/assets/logo.png",
];

// Everything the shell references — stylesheets, scripts, the configurator
// sub-app — read straight out of index.html so this cannot drift away from
// what the page actually loads.
//
// Why the runtime cache is not enough: the worker does not control the load
// that registers it, so those subresources never reach a fetch handler. On
// every later load they come from the HTTP cache, so they never reach one
// either, and they never enter Cache Storage at all.
async function discoverShellAssets() {
  const res = await fetch("/", { credentials: "same-origin" });
  // A redirect means authGate sent us to /login; there is no shell to read.
  if (!res.ok || res.redirected) return [];

  const html = await res.text();
  const urls = new Set();
  for (const [, raw] of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    if (!/\.(?:js|mjs|css)(?:[?#]|$)/i.test(raw)) continue;
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin) continue; // CDNs are not ours to cache
    urls.add(url.pathname);
  }
  return [...urls];
}

// Icon and web fonts are referenced from inside the CSS, not the HTML, so a
// pass over the stylesheets is what stops Font Awesome rendering as a giant
// black magnifying glass offline.
async function discoverFontsFrom(cssPaths, cache) {
  const fonts = new Set();
  for (const path of cssPaths) {
    const hit = await cache.match(path);
    if (!hit) continue;
    const css = await hit.clone().text();
    for (const [, raw] of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!/\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i.test(raw)) continue;
      try {
        const url = new URL(raw, self.location.origin + path);
        if (url.origin === self.location.origin) fonts.add(url.pathname);
      } catch {
        // malformed url() — skip
      }
    }
  }
  return [...fonts];
}

// One at a time: a single 404 or 401 must not fail the whole install.
const addAllSafely = (cache, urls) =>
  Promise.all(
    urls.map((u) =>
      cache.add(u).catch((err) => console.warn("[sw] precache miss", u, err)),
    ),
  );

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);

      let discovered = [];
      try {
        discovered = await discoverShellAssets();
      } catch (err) {
        // Offline at install, or the shell was unreadable. The explicit list
        // below still gets us the offline-critical modules.
        console.warn("[sw] shell discovery skipped:", err);
      }

      await addAllSafely(cache, [...new Set([...PRECACHE, ...discovered])]);

      const css = discovered.filter((u) => u.endsWith(".css"));
      await addAllSafely(cache, await discoverFontsFrom(css, cache));

      await self.skipWaiting();
    })(),
  );
});

// Without this the shell is only cached from the *second* visit onward, since
// the worker does not control the load that installed it.
async function warmShell() {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch("/", { credentials: "same-origin" });
    if (res.ok && !res.redirected) await cache.put("/", res.clone());
  } catch {
    // No signal during activation — nothing to warm.
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
      await warmShell();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  // Cross-origin images without CORS come back opaque (status 0), which is
  // still worth keeping — the browser can render it, we just can't inspect it.
  if (res && (res.ok || res.type === "opaque")) {
    await cache.put(request, res.clone());
  }
  return res;
}

function staleWhileRevalidate(event) {
  return (async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);

    const fromNetwork = fetch(event.request)
      .then(async (res) => {
        if (res.ok) await cache.put(event.request, res.clone());
        return res;
      })
      .catch(() => null);

    // Serve the cached copy immediately when there is one, but keep the
    // revalidation alive past this response or the worker may be killed first.
    if (hit) {
      event.waitUntil(fromNetwork);
      return hit;
    }
    return (await fromNetwork) || Response.error();
  })();
}

async function navigationHandler(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // Only a real, first-party page may become the offline shell. A redirect
    // (authGate sending an expired session to /login) or an error page must
    // never be cached, or offline users would be stranded on it.
    if (res.ok && res.type === "basic" && !res.redirected) {
      await cache.put(request, res.clone());
    }
    return res;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are ours. Everything else — notably the draft and offer POSTs —
  // must reach the network untouched: OfflineSaveQueue decides to queue by
  // letting fetch reject, so synthesising any response here would silently
  // break offline saving altogether.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    if (IMAGE_HOSTS.has(url.host)) event.respondWith(cacheFirst(request));
    return;
  }

  // Never answer API or admin reads from cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});
