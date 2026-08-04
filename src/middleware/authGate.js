// src/middleware/authGate.js
// Single gate that runs before the routers. Splits requests into:
//   - PUBLIC (customer signing surface, static assets, health, auth, login page)
//   - EXTERNAL API (bau-formular) -> requires X-API-Key
//   - ADMIN (self-guarded by the admin panel's own token) -> passes through
//   - everything else -> requires a logged-in user (Bearer or session cookie)
// Unauthenticated: browser navigation -> redirect to /login; API/XHR -> 401 JSON.

import { verifyToken, tokenFromReq } from "../services/authService.js";

const ASSET_RE = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|pdf)$/i;

function isPublicAsset(p) {
  // Shipped to the browser for offline pricing, but still business logic —
  // must not ride the blanket ".js is public" rule below.
  if (p.startsWith("/logic/")) return false;
  return (
    ASSET_RE.test(p) ||
    p.startsWith("/pdfjs") ||
    p.startsWith("/vendor") ||
    p.startsWith("/signpage") ||
    p.startsWith("/assets")
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
    p === "/api/version"
  );
}

function isExternalApi(p) {
  return p.startsWith("/api/offers/external") || p.startsWith("/api/arbeitsbericht/external");
}

export function authGate(req, res, next) {
  const p = req.path;

  if (isPublicAsset(p) || isPublicSigning(p) || isAlwaysPublic(p)) return next();

  // External machine callers (bau-formular): shared API key.
  if (isExternalApi(p)) {
    const expected = process.env.EXTERNAL_API_KEY;
    // Not configured yet -> allow (don't break the integration before the key
    // is set on both sides). Once EXTERNAL_API_KEY is set, it is enforced.
    if (!expected) {
      if (!authGate._warnedExtKey) {
        console.warn("[authGate] EXTERNAL_API_KEY not set — /external/* is open. Set it to enforce.");
        authGate._warnedExtKey = true;
      }
      return next();
    }
    const key = req.headers["x-api-key"] || req.query.apiKey;
    if (key === expected) return next();
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  // Admin panel guards itself with its own token.
  if (p.startsWith("/admin")) return next();

  // Everything else needs a logged-in user.
  const t = verifyToken(tokenFromReq(req));
  if (t) {
    req.user = t;
    return next();
  }

  const acceptsHtml = String(req.headers.accept || "").includes("text/html");
  if (req.method === "GET" && acceptsHtml) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
}
