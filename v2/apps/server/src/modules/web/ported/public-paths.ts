// @ts-nocheck
// GENERATED copy of src/middleware/authGate.js with 1 import/runtime rewrites (see v2/scripts/port-verbatim.mjs) — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
const ASSET_RE =
  /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|pdf|webmanifest)$/i;

function isPublicAsset(p) {
  // Shipped to the browser for offline pricing, but still business logic —
  // must not ride the blanket ".js is public" rule below.
  if (p.startsWith("/logic/")) return false;
  return (
    ASSET_RE.test(p) ||
    p.startsWith("/pdfjs") ||
    p.startsWith("/vendor") ||
    p.startsWith("/signpage") ||
    p.startsWith("/assets") ||
    p.startsWith("/configurator/")
  );
}

function isPublicSigning(p) {
  // Customer signing page + its token-scoped APIs. NOT /api/signing (create)
  // and NOT /api/signing/status (internal dashboard feed).
  if (p.startsWith("/sign/")) return true;
  if (p === "/sign") return true;
  if (p.startsWith("/api/signing/") && !p.startsWith("/api/signing/status")) return true;
  return false;
}

function isAlwaysPublic(p) {
  return (
    p === "/login" ||
    p.startsWith("/api/auth") ||
    p === "/api/health" ||
    p === "/health" ||
    p === "/api/version" ||
    p.startsWith("/api/da-config/model/")
  );
}

export { isPublicAsset, isPublicSigning, isAlwaysPublic };
