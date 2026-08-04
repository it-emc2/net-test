// Registers the offline app shell (see sw.js).
//
// The script URL carries the server's build id, so a deploy changes the URL,
// the browser sees a different worker and swaps it in. Without that the
// browser byte-compares sw.js and may never notice a new release.
export async function registerOfflineShell() {
  if (!("serviceWorker" in navigator)) return null;

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
