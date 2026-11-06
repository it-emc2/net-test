// Web layer (phase 6a, ADR 021): v2 serves today's UI exactly like legacy app.js —
// same security headers (helmet 8.1.0 + the extracted legacy options), same CORS allowlist,
// compression, the legacy public files, the login page, /logic/*.js for offline pricing and
// the SPA fallback. Public-path rules are the extracted legacy authGate functions.
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import mime from "mime-types";
import { isAlwaysPublic, isPublicAsset, isPublicSigning } from "./ported/public-paths.js";
import { tokenFromHeaders, verifyToken } from "../auth.js";

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
}

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
  const sendIndex = (reply: FastifyReply) => {
    (reply.request as any).ocType = "text/html; charset=utf-8";
    if (!injected) return reply.sendFile("index.html", d.publicDir);
    const html = fs.readFileSync(path.join(d.publicDir, "index.html"), "utf8").replace("</body>", `${injected}\n</body>`);
    return reply.type("text/html; charset=UTF-8").send(html);
  };

  // ---- login page (public) and offline pricing sources (login required, like legacy)
  app.get("/login", { config: { public: true } }, (_req, reply) => reply.sendFile("login.html", d.publicDir));
  const logic = Object.fromEntries(LOGIC_FILES.map((f) => [f, fs.readFileSync(path.join(d.logicDir, f), "utf8")]));
  const js = (f: string) => async (_req: FastifyRequest, reply: FastifyReply) => reply.type("application/javascript; charset=utf-8").send(logic[f]);
  app.get("/logic/pricing-core.js", js("pricing-core.js"));
  app.get("/logic/tray-search-core.js", js("tray-search-core.js"));
  app.get("/logic/aufschlag-rules.js", js("aufschlag-rules.js"));

  // ---- phase 6 add-ons (ADR 021): small scripts injected into index.html, served from v2
  // source folder (works from src/ and from the built dist/; tsc does not copy .js assets)
  const ADDONS = new URL("../../src/web/addons/", import.meta.url);
  const addonSrc = (f: string) => fs.readFileSync(new URL(f, ADDONS), "utf8");
  app.get("/v2/addons/deal-link.js", { config: { public: true } }, async (_req, reply) =>
    reply.type("text/javascript; charset=utf-8").header("Cache-Control", "no-cache").send(addonSrc("deal-link.js")));

  // ---- deal links (ADR 006): /deal/<id>[/<step>] → /?deal=<id>[#<step>] (index.html uses relative
  // asset paths, so the app itself always runs at "/"); not logged in → login, then back here
  const DEAL_RE = /^[A-Za-z0-9_-]{1,32}$/, STEP_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const dealLink = async (req: FastifyRequest, reply: FastifyReply) => {
    const { dealId, step } = req.params as { dealId: string; step?: string };
    if (!DEAL_RE.test(dealId) || (step !== undefined && !STEP_RE.test(step))) return sendIndexOrLogin(req, reply);
    if (!loggedIn(req)) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
    return reply.redirect(`/?deal=${encodeURIComponent(dealId)}${step ? `#${step}` : ""}`);
  };
  app.get("/deal/:dealId", { config: { public: true } }, dealLink);
  app.get("/deal/:dealId/:step", { config: { public: true } }, dealLink);
  const sendIndexOrLogin = (req: FastifyRequest, reply: FastifyReply) =>
    loggedIn(req) ? sendIndex(reply) : reply.redirect("/login");

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

    const publicPath = isPublicAsset(p) || isPublicSigning(p) || isAlwaysPublic(p);
    if (!publicPath && !loggedIn(req)) {
      const acceptsHtml = String(req.headers.accept || "").includes("text/html");
      if (acceptsHtml) {
        // keep deep links (/?offer=123 from Bitrix) across the login; login.js validates `next`
        const dest = req.url || "/";
        const to = dest.startsWith("/?offer=") ? `/login?next=${encodeURIComponent(dest)}` : "/login";
        // same response as Express 5 res.redirect() for an HTML client
        return reply.status(302).header("Location", to).type("text/html; charset=utf-8").send(`<p>Found. Redirecting to ${escapeHtml(to)}</p>`);
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
      return reply.sendFile(rel.slice(1), d.publicDir);
    }
    return sendIndex(reply); // SPA fallback
  });
}
