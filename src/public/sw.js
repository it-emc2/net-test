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

self.addEventListener("install", () => self.skipWaiting());

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
