// Registers the offline app shell (see sw.js).
//
// The script URL carries the server's build id, so a deploy changes the URL,
// the browser sees a different worker and swaps it in. Without that the
// browser byte-compares sw.js and may never notice a new release.
// Cache Storage and IndexedDB are evictable by default. That would cost the
// offline shell and — the part that actually matters — drafts saved on site but
// not yet synced. Chrome grants this silently for installed PWAs; Safari does
// not implement it, hence the guard.
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    const granted = await navigator.storage.persist();
    if (!granted) console.warn("[sw] persistent storage denied — data may be evicted");
    return granted;
  } catch (err) {
    console.warn("[sw] persistent storage unavailable:", err);
    return null;
  }
}

export async function registerOfflineShell() {
  if (!("serviceWorker" in navigator)) return null;

  await requestPersistentStorage();

  try {
    const res = await fetch("/api/version", { credentials: "include" });
    if (!res.ok) throw new Error(`version lookup failed (${res.status})`);
    const { buildId } = await res.json();

    return await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(buildId || "dev")}`,
      { scope: "/" },
    );
  } catch (err) {
    // Offline at boot, or the lookup failed. An already-installed worker keeps
    // serving the shell regardless, so this is not worth bothering the user.
    console.warn("[sw] registration skipped:", err);
    return null;
  }
}
