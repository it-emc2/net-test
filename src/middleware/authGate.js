// src/middleware/authGate.js
// Single gate that runs before the routers. Splits requests into:
//   - PUBLIC (customer signing surface, static assets, health, auth, login page)
//   - EXTERNAL API (bau-formular) -> requires X-API-Key
//   - ADMIN (self-guarded by the admin panel's own token) -> passes through
//   - everything else -> requires a logged-in user (Bearer or session cookie)
// Unauthenticated: browser navigation -> redirect to /login; API/XHR -> 401 JSON.

import { verifyToken, tokenFromReq } from "../services/authService.js";

const ASSET_RE =
  /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|pdf|webmanifest)$/i;

function isPublicAsset(p) {
  // Shipped to the browser for offline pricing, but still business logic —
  // must not ride the blanket ".js is public" rule below.
  if (p.startsWith("/logic/")) return false;
  // API responses are never static assets, whatever the path ends in
  // (e.g. /api/offers/<id>.pdf must stay behind the session).
  if (p === "/api" || p.startsWith("/api/")) return false;
  return (
    ASSET_RE.test(p) ||
    p.startsWith("/pdfjs") ||
    p.startsWith("/vendor") ||
    p.startsWith("/signpage") ||
    p.startsWith("/assets") ||
    p.startsWith("/configurator/")
  );
}

// Token-scoped customer signing APIs (routes/signing.js), exact shapes only:
//   GET  /api/signing/:token
//   GET  /api/signing/:token/documents/:key/html|pdf
//   POST /api/signing/:token/documents/:key
// NOT POST /api/signing[/] (create) and NOT /api/signing/status* (dashboard).
const SIGNING_TOKEN_API_RE =
  /^\/api\/signing\/([^/]+)(?:\/documents\/[^/]+(?:\/(?:html|pdf))?)?\/?$/;

function isPublicSigning(p) {
  // Customer signing page.
  if (p === "/sign" || /^\/sign\/[^/]+\/?$/.test(p)) return true;
  const m = SIGNING_TOKEN_API_RE.exec(p);
  return Boolean(m && m[1] !== "status");
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

function isExternalApi(p) {
  return p.startsWith("/api/offers/external") || p.startsWith("/api/arbeitsbericht/external");
}

function isPublicPath(p) {
  return isPublicAsset(p) || isPublicSigning(p) || isAlwaysPublic(p);
}

function decodePath(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

export function authGate(req, res, next) {
  // Express routing is case-insensitive (/api/signing/STATUS/x hits the
  // /status route), so every check below runs on the lower-cased path.
  const p = String(req.path || "").toLowerCase();

  // Public only if both the raw and the percent-decoded path qualify, so an
  // encoded segment can't sneak a private route past the allowlist.
  if (isPublicPath(p) && isPublicPath(decodePath(p))) return next();

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
  if (req.method === "GET" && acceptsHtml) {
    // Keep deep links (e.g. /?offer=123 from Bitrix) across the login; login.js validates `next`.
    const dest = req.originalUrl || "/";
    return res.redirect(dest.startsWith("/?offer=") ? `/login?next=${encodeURIComponent(dest)}` : "/login");
  }
  return res.status(401).json({ error: "Unauthorized" });
}
