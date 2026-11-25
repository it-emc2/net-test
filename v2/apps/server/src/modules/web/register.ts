// Web layer (phase 6a, ADR 021): v2 serves today's UI exactly like legacy app.js —
// same security headers (helmet 8.1.0 + the extracted legacy options), same CORS allowlist,
// compression, the legacy public files, the login page, /logic/*.js for offline pricing and
// the SPA fallback. Public-path rules are the extracted legacy authGate functions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import mime from "mime-types";
import { REWRITES, applyRewrites } from "./rewrites.js";
import { isAlwaysPublic, isPublicAsset, isPublicSigning } from "./ported/public-paths.js";
import { tokenFromHeaders, verifyToken } from "../../platform/auth.js";

export interface WebDeps {
  /** legacy src/public */
  publicDir: string;
  /** legacy src/logic (offline pricing sources) */
  logicDir: string;
  /** node_modules/@fortawesome/fontawesome-free */
  fontAwesomeDir: string;
  authSecret: string;
  /** extra <script> tags injected before </body> of index.html (phase 6 add-ons) */
  indexInjections?: string[];
  /** built files of the React app (apps/web/dist); default: next to the server in the workspace */
  appDir?: string;
  /** START_UI: which UI a bare "/" (and "/login" without `next`) opens; default "classic" = as today */
  startUi?: "classic" | "react";
  /** Secure flag of the oc_ui cookie (same rule as the session cookie) */
  secureCookie?: boolean;
}

/** the built files of the React app (apps/web/dist) — from src/ and from the built dist/ alike */
export const DEFAULT_APP_DIR = fileURLToPath(new URL("../../../../web/dist/", import.meta.url));

/** Session cookie "stay in today's UI" (START_UI=react). Not HttpOnly: the React app clears it on start. */
export const CLASSIC_COOKIE = "oc_ui";
const classicCookie = (secure: boolean) => `${CLASSIC_COOKIE}=classic; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
const acceptsHtml = (req: FastifyRequest) => String(req.headers.accept || "").includes("text/html");
const wantsClassic = (req: FastifyRequest) =>
  String(req.headers.cookie || "").split(";").some((c) => c.trim() === `${CLASSIC_COOKIE}=classic`);

/** Loaded first in every page v2 serves: v2 error objects → the text today's screens expect. */
export const HEAD_SHIM = '<script src="/v2/addons/error-compat.js"></script>';
export function injectHead(html: string): string {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${HEAD_SHIM}`) : `${HEAD_SHIM}\n${html}`;
}
/** an offer number in a link (`/?offer=`, the format written to Bitrix): ANG + digits/dashes */
const OFFER_IN_LINK = /^ANG-?\d[\d-]{0,40}$/i;
/** a deal number the React app opens („Öffnen“ with a deal number) */
const DEAL_NUMBER_IN_LINK = /^\d{1,12}$/;
const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const LOGIC_FILES = ["pricing-core.js", "tray-search-core.js", "aufschlag-rules.js"];

export async function registerWeb(app: FastifyInstance, d: WebDeps) {
  // security headers + CORS: web/security.ts (registered before the auth gate in app.ts)
  await app.register(compress, { global: true });
  await app.register(fastifyStatic, { root: d.publicDir, serve: false });


  const loggedIn = (req: FastifyRequest) => !!verifyToken(tokenFromHeaders(req.headers), d.authSecret);
  const exists = (rootIn: string, rel: string) => {
    const root = path.resolve(rootIn);
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(root + path.sep)) return null; // no path traversal
    try { return fs.statSync(full).isFile() ? full : null; } catch { return null; }
  };
  const injected = (d.indexInjections ?? []).join("\n");
  const rewritten: Record<string, string> = {};
  /** any page from today's UI: shim first in <head>; the main page also gets the add-ons */
  const sendHtml = (reply: FastifyReply, file: string) => {
    (reply.request as any).ocType = "text/html; charset=utf-8";
    let html = injectHead(fs.readFileSync(path.join(d.publicDir, file), "utf8"));
    if (file === "index.html" && injected) html = html.replace("</body>", `${injected}\n</body>`);
    return reply.type("text/html; charset=UTF-8").send(html);
  };
  const reactStart = d.startUi === "react";
  // START_UI=react: whoever gets today's main page stays in today's UI for this browser session —
  // today's UI drops ?offer= / ?deal= from its address after loading (script.js, deal-link.js), so
  // a reload there asks for a bare "/" again and must not jump to the React app. Page loads only:
  // the old UI's service worker fetches "/" in the background (Accept */*) to warm its offline
  // shell, and that must not switch the browser to today's UI.
  const sendIndex = (reply: FastifyReply) => {
    if (reactStart && acceptsHtml(reply.request)) reply.header("set-cookie", classicCookie(!!d.secureCookie));
    return sendHtml(reply, "index.html");
  };
  /** 302 like Express res.redirect() for an HTML client */
  const found = (reply: FastifyReply, to: string) =>
    reply.status(302).header("Location", to).type("text/html; charset=utf-8").send(`<p>Found. Redirecting to ${escapeHtml(to)}</p>`);

  // ---- login page (public) and offline pricing sources (login required, like legacy)
  // START_UI=react: a plain /login is the React app's own login form; /login?next=… (deep links,
  // expired session in today's UI) and a browser that chose today's UI keep today's login page
  app.get("/login", { config: { public: true } }, (req, reply) => {
    if (reactStart && !wantsClassic(req) && !new URL(req.url, "http://x").searchParams.get("next")) return found(reply, "/app");
    return sendHtml(reply, "login.html");
  });
  const logic = Object.fromEntries(LOGIC_FILES.map((f) => [f, fs.readFileSync(path.join(d.logicDir, f), "utf8")]));
  const js = (f: string) => async (_req: FastifyRequest, reply: FastifyReply) => reply.type("application/javascript; charset=utf-8").send(logic[f]);
  app.get("/logic/pricing-core.js", js("pricing-core.js"));
  app.get("/logic/tray-search-core.js", js("tray-search-core.js"));
  app.get("/logic/aufschlag-rules.js", js("aufschlag-rules.js"));

  // ---- phase 6 add-ons (ADR 021): small scripts injected into index.html, served from v2
  // source folder (works from src/ and from the built dist/; tsc does not copy .js assets)
  const ADDONS = new URL("../../../src/modules/web/addons/", import.meta.url);
  const addonSrc = (f: string) => fs.readFileSync(new URL(f, ADDONS), "utf8");
  for (const f of ["error-compat.js", "deal-link.js", "local-store.js", "deal-draft.js", "ux.js", "header.js", "quickwins.js", "send-guard.js", "offer-record.js", "kosten-edit.js"]) {
    app.get(`/v2/addons/${f}`, { config: { public: true } }, async (_req, reply) =>
      reply.type("text/javascript; charset=utf-8").header("Cache-Control", "no-cache").send(addonSrc(f)));
  }

  // ---- deal links (ADR 006): /deal/<id>[/<step>] → /?deal=<id>[#<step>] (index.html uses relative
  // asset paths, so the app itself always runs at "/"); not logged in → login, then back here
  const DEAL_RE = /^[A-Za-z0-9_-]{1,32}$/, STEP_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const dealLink = async (req: FastifyRequest, reply: FastifyReply) => {
    const { dealId, step } = req.params as { dealId: string; step?: string };
    if (!DEAL_RE.test(dealId) || (step !== undefined && !STEP_RE.test(step))) return sendIndexOrLogin(req, reply);
    // START_UI=react (U-075): a deal number opens in the React app as „Öffnen“ with that number does —
    // logged in or not (its own login keeps the address); a browser that chose today's UI keeps today's way
    if (reactStart && !wantsClassic(req) && DEAL_NUMBER_IN_LINK.test(dealId)) {
      return found(reply, `/app/?deal=${encodeURIComponent(dealId)}${step ? `&step=${encodeURIComponent(step)}` : ""}`);
    }
    if (!loggedIn(req)) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    return reply.redirect(`/?deal=${encodeURIComponent(dealId)}${step ? `#${step}` : ""}`);
  };
  app.get("/deal/:dealId", { config: { public: true } }, dealLink);
  app.get("/deal/:dealId/:step", { config: { public: true } }, dealLink);
  const sendIndexOrLogin = (req: FastifyRequest, reply: FastifyReply) =>
    loggedIn(req) ? sendIndex(reply) : reply.redirect("/login");

  // ---- the React app (ADR 026) under /app: the built files of apps/web. Any other /app address
  // gets its index.html (the app reads the address itself). The files carry no data — data comes
  // from /api and needs a login — so they are public like the login page.
  const appDir = d.appDir ?? DEFAULT_APP_DIR;
  const reactApp = async (req: FastifyRequest, reply: FastifyReply) => {
    let rest: string;
    try { rest = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/app\/?/, ""); }
    catch { return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Ungültige Adresse", requestId: req.id } }); }
    if (rest && exists(appDir, rest)) {
      // file names of the build contain a content hash → may be cached for good
      if (rest.startsWith("assets/")) return reply.sendFile(rest, appDir, { maxAge: "365d", immutable: true });
      return reply.sendFile(rest, appDir);
    }
    if (rest.startsWith("assets/")) return reply.status(404).send("Not Found");
    const index = exists(appDir, "index.html");
    if (!index) return reply.status(503).send({ error: { code: "APP_NOT_BUILT", message: "Die neue Oberfläche ist auf diesem Server nicht installiert.", requestId: req.id } });
    return reply.type("text/html; charset=UTF-8").header("Cache-Control", "no-cache").send(fs.readFileSync(index, "utf8"));
  };
  app.get("/app", { config: { public: true } }, reactApp);
  app.get("/app/*", { config: { public: true } }, reactApp);

  // ---- everything else: legacy authGate rules + express.static + SPA fallback
  // Content-Type exactly like legacy: Express static (send@1 → mime-types 3 contentType), plus the
  // explicit types of the legacy pdf.js and Font Awesome mounts
  const FA: Record<string, string> = { ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
  const staticType = (p: string) => {
    const ext = path.extname(p).toLowerCase();
    if (p.startsWith("/pdfjs/") && (ext === ".js" || ext === ".mjs")) return "application/javascript; charset=utf-8";
    if (p.startsWith("/vendor/fontawesome/") && FA[ext]) return FA[ext];
    return mime.contentType(ext) || "application/octet-stream";
  };
  const onSend = async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const t = (req as any).ocType as string | undefined;
    if (t && reply.statusCode === 200) reply.header("content-type", t);
    return payload;
  };
  app.get("/*", { config: { public: true }, onSend }, async (req, reply) => {
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/")) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found", requestId: req.id } });

    // START_UI=react (U-061): a bare "/" page request opens the React app; "/?classic=1" (the
    // React app's links to today's UI) remembers the choice for this browser session and continues
    // at a clean "/"; a Bitrix offer link `/?offer=<ANG number>` opens in the React app (U-075); any
    // other query (?deal=, a malformed ?offer= …) is today's UI as before
    if (reactStart && url.pathname === "/") {
      if (url.searchParams.get("classic") === "1") {
        url.searchParams.delete("classic");
        reply.header("set-cookie", classicCookie(!!d.secureCookie));
        return found(reply, "/" + (url.search || ""));
      }
      if (!url.search && !wantsClassic(req) && acceptsHtml(req)) return found(reply, "/app");
      // U-075: the offer link written to Bitrix (`<base>/?offer=<number>`, format unchanged) opens that
      // stored offer in the React app (as „Öffnen“ with its number; types it cannot edit go on to today's UI)
      const offer = url.searchParams.get("offer") ?? "";
      if (offer && OFFER_IN_LINK.test(offer) && !wantsClassic(req) && acceptsHtml(req)) return found(reply, `/app/?offer=${encodeURIComponent(offer)}`);
    }

    const publicPath = isPublicAsset(p) || isPublicSigning(p) || isAlwaysPublic(p);
    if (!publicPath && !loggedIn(req)) {
      if (acceptsHtml(req)) {
        // keep deep links (/?offer=123 from Bitrix) across the login; login.js validates `next`
        const dest = req.url || "/";
        const to = dest.startsWith("/?offer=") ? `/login?next=${encodeURIComponent(dest)}` : "/login";
        // same response as Express 5 res.redirect() for an HTML client
        return found(reply, to);
      }
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized", requestId: req.id } });
    }

    // dedicated static roots that never fall back to the SPA (legacy fallthrough:false)
    if (p.startsWith("/pdfjs/")) {
      const f = exists(path.join(d.publicDir, "pdfjs"), p.slice("/pdfjs/".length));
      if (!f) return reply.status(404).send("Not Found");
      (req as any).ocType = staticType(p);
      return reply.sendFile(p.slice("/pdfjs/".length), path.join(d.publicDir, "pdfjs"));
    }
    if (p.startsWith("/vendor/fontawesome/")) {
      const rel = p.slice("/vendor/fontawesome/".length);
      if (!exists(d.fontAwesomeDir, rel)) return reply.status(404).send("Not Found");
      (req as any).ocType = staticType(p);
      return reply.sendFile(rel, d.fontAwesomeDir);
    }

    const rel = p.endsWith("/") ? `${p}index.html` : p;
    if (rel === "/index.html") return sendIndex(reply);
    if (exists(d.publicDir, rel.slice(1))) {
      (req as any).ocType = staticType(rel);
      const file = rel.slice(1);
      if (REWRITES[file]) { // P7-4: confirm() → in-page dialog (web/rewrites.ts)
        rewritten[file] ??= applyRewrites(file, fs.readFileSync(path.join(d.publicDir, file), "utf8"));
        return reply.header("Cache-Control", "public, max-age=0").send(rewritten[file]);
      }
      if (/\.html?$/i.test(file)) return sendHtml(reply, file);
      return reply.sendFile(file, d.publicDir);
    }
    return sendIndex(reply); // SPA fallback
  });
}
