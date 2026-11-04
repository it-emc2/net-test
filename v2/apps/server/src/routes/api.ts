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

/** Escape user input for RegExp (fixes SECURITY-FINDINGS #11: ReDoS / regex injection). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

const publicUser = (u: any) => ({ email: u.email, name: u.name, firstName: u.firstName, lastName: u.lastName, role: u.role });

export interface ApiDeps { cfg: Cfg; businessConfig?: BusinessConfig }

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
  await registerOffersWrite(app, pricing, { apDefaultEmail: cfg.AP_DEFAULT_EMAIL ?? "" });

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
