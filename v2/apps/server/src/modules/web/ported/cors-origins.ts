// @ts-nocheck
// GENERATED copy of src/app.js with 1 import/runtime rewrites (see v2/scripts/port-verbatim.mjs) — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
const allowedExact = new Set([
  "https://oc.emc2.de",
  "https://angebotskonfiguratoremc2.fly.dev",
  "https://angebotskonfigurator-emc2-v2.fly.dev",
  "https://bau-formular.fly.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://emczwei.bitrix24.de",
]);

// ngrok has renamed its domains over time (ngrok.io -> ngrok-free.app ->
// ngrok-free.dev), and a tunnel is how the app gets onto a real iPhone/iPad for
// testing, since iOS refuses service workers and Add-to-Home-Screen over plain
// http to a LAN address.
//
// Deliberately NOT widened in production: with credentials:true, every suffix
// here is an origin any stranger can obtain and then call this API from a
// logged-in employee's browser. Production keeps exactly the one domain it
// already trusted, so this stays a dev-only convenience.
const NGROK_SUFFIXES =
  process.env.NODE_ENV === "production"
    ? ["ngrok-free.app"]
    : ["ngrok-free.app", "ngrok-free.dev", "ngrok.app", "ngrok.dev", "ngrok.io"];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedExact.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return NGROK_SUFFIXES.some(
      (suffix) => u.hostname === suffix || u.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export { isAllowedOrigin };
