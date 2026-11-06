// API routes ported from the legacy app (phase 4, group 1: auth, catalog, pricing).
// Success payloads are identical to legacy (contract test: test/contract.test.ts).
// Errors use the v2 format { error: { code, message, requestId } } with the legacy German text.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig as Cfg } from "@oc/config";
import { createPricingEngine } from "@oc/pricing";
import {
  clearSessionCookie, createToken, sessionCookie, shouldRefresh, tokenFromHeaders, verifyPassword, verifyToken,
} from "../auth.js";
import { BusinessConfig, CONFIG_SCHEMA } from "../business-config.js";
import { AppConfig, Draft, Offer, Product, Service, User } from "../models.js";
import { vigorPriceFetcher } from "../vigor.js";
import { registerOffersRead } from "./offers-read.js";
import { registerOffersWrite } from "./offers-write.js";
import { registerDealDrafts } from "../deal-drafts/routes.js";
import { registerGroup3 } from "./group3.js";
import { registerBitrixRead } from "./bitrix-read.js";
import { BitrixClient } from "../integrations/bitrix.js";
import { BitrixLog } from "../models.js";
import { dealWrites } from "../integrations/bitrix-deal.js";
import { PlanningClient } from "../integrations/planning.js";
import { registerBitrixWrite } from "./bitrix-write.js";
import { fileURLToPath } from "node:url";
import { Mailer, type MailConfig } from "../integrations/mail.js";
import { registerEmail } from "./email.js";
import { registerPost } from "./post.js";
import { registerRouting, registerTodaysCustomers } from "./routing.js";
import { registerMagic } from "./magic.js";
import { registerSigning } from "./signing.js";
import { registerMisc } from "./misc.js";
import { registerCatalog } from "./catalog.js";
import { registerDocuments } from "./documents.js";
import { Gotenberg, type PdfEngine } from "../integrations/gotenberg.js";
import type { SigningRenderer } from "../signing/documents.js";
import { MagicApi } from "../integrations/magic.js";
import { RoutingService } from "../routing/providers.js";
import { todaysCustomers } from "../integrations/todays-customers.js";
import { Onlinebrief24 } from "../integrations/onlinebrief24.js";
import { UNAVAILABLE_DOCUMENTS, type OfferDocuments, type SigningPort } from "../email/ports.js";

/** Until the frontend moves (phase 6) v2 serves the legacy app's static assets. */
const LEGACY_ASSETS = fileURLToPath(new URL("../../../../../src/public/assets", import.meta.url));
const LEGACY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const LEGACY_PUBLIC = fileURLToPath(new URL("../../../../../src/public", import.meta.url));
const LEGACY_SIGN_PAGE = fileURLToPath(new URL("../../../../../src/public/signpage/index.html", import.meta.url));

/** Escape user input for RegExp (fixes SECURITY-FINDINGS #11: ReDoS / regex injection). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

const publicUser = (u: any) => ({ email: u.email, name: u.name, firstName: u.firstName, lastName: u.lastName, role: u.role });

export interface ApiDeps {
  cfg: Cfg; businessConfig?: BusinessConfig; bitrix?: BitrixClient;
  /** test seams: documents (phase 5), signing (4g), mail TLS for the local test server */
  documents?: OfferDocuments; signing?: SigningPort; mailTls?: MailConfig["tls"];
  /** signing document rendering (phase 5); default: unavailable */
  signingRenderer?: SigningRenderer;
  /** PDF engine (default: Gotenberg at GOTENBERG_URL) */
  pdfEngine?: PdfEngine;
}

export async function registerApi(app: FastifyInstance, deps: ApiDeps) {
  const { cfg } = deps;
  const secureCookie = cfg.COOKIE_SECURE ?? cfg.NODE_ENV === "production";
  const businessConfig = deps.businessConfig ?? new BusinessConfig(() => AppConfig.find({}).lean() as any);
  if (!deps.businessConfig) await businessConfig.init(app.log);
  app.addHook("onClose", async () => businessConfig.stop());

  const pricing = createPricingEngine(Product as any, {
    cfg: businessConfig,
    fetchVigourNetPrices: vigorPriceFetcher(cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI),
    // locked (sent) offers return their stored price; drafts/offers feed the snapshot cache (legacy pricing.js)
    OfferModel: Offer as any,
    DraftModel: Draft as any,
  });

  // ---------------- auth ----------------
  app.post("/api/auth/login", { config: { public: true } }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail und Passwort erforderlich");
    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail(req, reply, 401, "INVALID_CREDENTIALS", "E-Mail oder Passwort falsch");
    }
    const token = createToken(email, cfg.AUTH_SECRET);
    reply.header("set-cookie", sessionCookie(token, secureCookie));
    user.lastLoginAt = new Date();
    await user.save();
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/logout", { config: { public: true } }, async (_req, reply) => {
    reply.header("set-cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/api/auth/me", { config: { public: true } }, async (req, reply) => {
    const raw = tokenFromHeaders(req.headers);
    const t = verifyToken(raw, cfg.AUTH_SECRET);
    if (!t) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    const user = (await User.findOne({ email: t.email, active: true }).lean()) as any;
    if (!user) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    if (shouldRefresh(raw)) reply.header("set-cookie", sessionCookie(createToken(user.email, cfg.AUTH_SECRET), secureCookie));
    return { user: publicUser(user) };
  });

  app.post("/api/auth/confirm-password", async (req, reply) => {
    const password = String(((req.body ?? {}) as Record<string, unknown>).password || "");
    if (!password) return fail(req, reply, 400, "BAD_REQUEST", "Passwort erforderlich");
    const user = await User.findOne({ email: req.user!.email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      req.log.warn({ email: req.user!.email }, "confirm-password failed");
      return fail(req, reply, 401, "INVALID_CREDENTIALS", "Passwort falsch");
    }
    return { ok: true, email: user.email, name: user.name || "" };
  });

  // ---------------- catalog (read) ----------------
  app.get("/api/services", async (req) => {
    const { q } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (q) {
      const re = new RegExp(esc(q), "i");
      filter.$or = [{ serviceId: re }, { name: re }, { internal_name: re }];
    }
    return Service.find(filter).sort({ serviceId: 1 }).lean();
  });

  app.get("/api/services/:id", async (req, reply) => {
    const s = await Service.findOne({ serviceId: (req.params as { id: string }).id }).lean();
    return s ?? fail(req, reply, 404, "NOT_FOUND", "Not found");
  });

  app.get("/api/products/sla", async () =>
    Product.find({ productId: /^SLA/i }, { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, price: 1 })
      .sort({ lengthCm: 1, widthCm: 1, heightCm: 1 }).lean());

  app.get("/api/products", async (req) => {
    const { q, prefix, source, limit } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (q) { const re = new RegExp(esc(q), "i"); filter.$or = [{ productId: re }, { name: re }]; }
    if (prefix) filter.productId = new RegExp("^" + esc(String(prefix)), "i");
    if (source) filter.source = new RegExp("^" + esc(String(source)) + "$", "i");
    let query = Product.find(filter).sort({ productId: 1 });
    if (limit) query = query.limit(Math.max(1, Math.min(500, Number(limit) || 200)));
    return query.lean();
  });

  app.get("/api/products/:id", async (req, reply) => {
    const p = await Product.findOne({ productId: (req.params as { id: string }).id }).lean();
    return p ?? fail(req, reply, 404, "NOT_FOUND", "Not found");
  });

  await registerOffersRead(app);
  // ---------------- documents (phase 5) ----------------
  const pdfEngine = deps.pdfEngine ?? new Gotenberg({ baseUrl: cfg.GOTENBERG_URL, timeoutMs: cfg.GOTENBERG_TIMEOUT_MS });
  const vigorPrices = vigorPriceFetcher(cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI);
  const { offerDocuments, signingRenderer: ownSigningRenderer } = await registerDocuments(app, {
    businessConfig, fetchVigourNetPrices: vigorPrices, root: cfg.DOCUMENTS_ROOT ?? LEGACY_ROOT, pdf: pdfEngine,
    log: { debug: (o, m) => app.log.debug(o, m), warn: (o, m) => app.log.warn(o, m), error: (o, m) => app.log.error(o, m) },
  });
  const ownDocuments: OfferDocuments = { ...offerDocuments, productImagePdf: UNAVAILABLE_DOCUMENTS.productImagePdf };
  await registerCatalog(app, {
    vigorUri: cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI,
    badoluxDiscount: () => businessConfig.get("BU_BADOLUX_DISCOUNT", 0.25),
    badoluxModelFile: `${LEGACY_PUBLIC}/configurator/badolux-model.json`,
    vorhangAssetsDir: `${cfg.ASSETS_DIR ?? LEGACY_ASSETS}/vorhang`,
  });
  await registerMisc(app, {
    vigorUri: cfg.VIGOR_MONGODB_URI ?? cfg.MONGODB_URI, computePrices: (p) => pricing.computePrices(p), externalApiKey: cfg.EXTERNAL_API_KEY,
  });
  await registerOffersWrite(app, pricing, { apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "" });
  await registerDealDrafts(app);
  await registerGroup3(app, { businessConfig, authSecret: cfg.AUTH_SECRET, secureCookie });
  const bitrix = deps.bitrix ?? new BitrixClient({
    baseUrl: cfg.BITRIX_WEBHOOK_BASE,
    minGapMs: cfg.BITRIX_MIN_GAP_MS,
    logFailure: async (entry) => {
      app.log.error({ bitrixMethod: entry.method, httpMethod: entry.httpMethod, err: entry.message }, "bitrix call failed");
      await BitrixLog.create(entry);
    },
  });
  await registerBitrixRead(app, bitrix);
  const deals = dealWrites(bitrix, { offerLinkBase: cfg.OFFER_LINK_BASE });
  const signingSvc = await registerSigning(app, {
    deals, renderer: deps.signingRenderer ?? ownSigningRenderer,
    mailer: new Mailer({
      smtpHost: cfg.SMTP_HOST, smtpPort: cfg.SMTP_PORT || 587, secure: cfg.SMTP_SECURE === "true", requirePass: false,
      smtpEmail: cfg.SMTP_EMAIL, smtpUser: cfg.SMTP_USER, smtpPass: cfg.SMTP_PASS, replyTo: cfg.SMTP_REPLY_TO,
      ...(deps.mailTls ? { tls: deps.mailTls } : {}),
    }),
    officeEmail: cfg.SIGNING_OFFICE_EMAIL, assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS, signPageFile: LEGACY_SIGN_PAGE,
    publicBaseUrl: cfg.PUBLIC_BASE_URL, apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "", authSecret: cfg.AUTH_SECRET, log: app.log,
  });
  const ownSigning: SigningPort = {
    createRequest: async (a) => {
      const r: any = await signingSvc.createRequest(a);
      return { link: r.link };
    },
  };
  await registerEmail(app, {
    mailer: new Mailer({
      smtpHost: cfg.SMTP_HOST, smtpPort: cfg.SMTP_SEND_PORT, smtpEmail: cfg.SMTP_EMAIL, smtpUser: cfg.SMTP_USER, smtpPass: cfg.SMTP_PASS,
      replyTo: cfg.SMTP_REPLY_TO, imapHost: cfg.IMAP_HOST, imapPort: cfg.IMAP_PORT, imapPass: cfg.IMAP_PASS, imapSentFolder: cfg.IMAP_SENT_FOLDER,
      ...(deps.mailTls ? { tls: deps.mailTls } : {}),
    }),
    deals, documents: deps.documents ?? ownDocuments, signing: deps.signing ?? ownSigning, businessConfig,
    assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS, publicBaseUrl: cfg.PUBLIC_BASE_URL, apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "",
    smtpTestPort: cfg.SMTP_PORT || 465, smtpHost: cfg.SMTP_HOST,
  });
  const num = (v?: string) => parseFloat(v ?? "") || null; // legacy parseFloat(env) || null
  await registerRouting(app, {
    routing: new RoutingService({
      orsApiKey: cfg.ORS_API_KEY, photonUrl: cfg.GEO_PHOTON_URL, nominatimUrl: cfg.GEO_NOMINATIM_URL, orsUrl: cfg.GEO_ORS_URL, osrmUrl: cfg.ROUTE_OSRM_URL,
      companyAddress: cfg.COMPANY_ADDRESS, companyLat: num(cfg.COMPANY_LAT), companyLng: num(cfg.COMPANY_LNG), log: app.log,
    }),
    planning: new PlanningClient({ baseUrl: cfg.PLANNING_API_BASE_URL, apiKey: cfg.PLANNING_API_KEY }),
  });
  await registerTodaysCustomers(app, todaysCustomers({ baseUrl: cfg.BITRIX_WEBHOOK_BASE }));
  await registerMagic(app, new MagicApi({ baseUrl: cfg.EXTERNAL_API_BASE, user: cfg.EXTERNAL_API_USER, password: cfg.EXTERNAL_API_PASSWORD }));
  await registerPost(app, {
    ob24: new Onlinebrief24({ baseUrl: cfg.OB24_BASE_URL, apiKey: cfg.OB24_API_KEY, apiSecret: cfg.OB24_API_SECRET, mode: cfg.OB24_MODE, allowProductionDefault: cfg.NODE_ENV === "production" }),
    deals, assetsDir: cfg.ASSETS_DIR ?? LEGACY_ASSETS,
  });
  await registerBitrixWrite(app, {
    bx: bitrix,
    deals,
    planning: new PlanningClient({ baseUrl: cfg.PLANNING_API_BASE_URL, apiKey: cfg.PLANNING_API_KEY }),
    materialCodesField: cfg.BITRIX_FIELD_MATERIAL_CODES,
  });

  // ---------------- pricing ----------------
  app.post("/api/price", async (req) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const result = await pricing.computePrices(payload);
    req.log.info({ offerType: payload.activeOffer || "bu", total: result?.total, markup: result?.markup }, "price computed");
    return result;
  });

  app.get("/api/price/inputs", async () => {
    const config: Record<string, unknown> = {};
    for (const def of CONFIG_SCHEMA) config[def.key] = businessConfig.get(def.key);
    const products = await Product.find({}, { _id: 0, productId: 1, price: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, source: 1 }).lean();
    return { buildId: cfg.BUILD_ID, config, products };
  });
}
