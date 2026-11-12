// Phase 4, group 3: customers, users, admin (config, users, logs). Ported 1:1 from legacy
// src/routes/customers.js, users.js, admin.js. Success bodies identical (contract test).
// Intentional differences (ADR 015): admin role is enforced by one preHandler; the
// "public" config subset requires a login (legacy: reachable without session).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose from "mongoose";
import { createToken, hashPassword, sessionCookie, verifyPassword } from "../auth.js";
import { CONFIG_SCHEMA, type BusinessConfig } from "../business-config.js";
import { AppConfig, BitrixLog, Customer, PDF_LOG_APP, PdfLog, User, UserActionLog } from "../models.js";

declare module "fastify" { interface FastifyContextConfig { admin?: boolean } }

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

// ---------------- customers (legacy helpers, verbatim semantics) ----------------
const escRegex = (v = "") => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ns = (v: unknown) => String(v ?? "").trim();
function pickSearchableKundendaten(s: any = {}) {
  return {
    salutation: ns(s.salutation), customerNumber: ns(s.customerNumber || s.bitrixContactId),
    bitrixContactId: ns(s.bitrixContactId || s.customerNumber), firstName: ns(s.firstName), lastName: ns(s.lastName),
    company: ns(s.company), email: ns(s.email).toLowerCase(), phone: ns(s.phone), street: ns(s.street), city: ns(s.city),
    postalCode: ns(s.postalCode), state: ns(s.state), country: ns(s.country), emc2_contact: ns(s.emc2_contact),
    payer: ns(s.payer), customerType: ns(s.customerType), deployment: ns(s.deployment), kassenkundeName: ns(s.kassenkundeName),
    cp_name: ns(s.cp_name), cp_phone: ns(s.cp_phone), cp_city: ns(s.cp_city),
  };
}
function normalizeCustomerPayload(body: any = {}) {
  const kundendaten = body?.kundendaten && typeof body.kundendaten === "object" ? body.kundendaten : body;
  return { ...pickSearchableKundendaten(kundendaten), kundendaten, sourceOfferType: ns(body.sourceOfferType || body.offerType || "") };
}
function buildSearchFilter(q: string) {
  const safe = escRegex(q.trim());
  const rx = new RegExp(safe, "i");
  // NOTE (legacy quirk kept): emc2_contact / cp_name / kassenkundeName are not in the strict
  // schema, so they are never stored and these clauses never match.
  return {
    $or: [
      { customerNumber: rx }, { bitrixContactId: rx }, { firstName: rx }, { lastName: rx }, { company: rx },
      { email: rx }, { phone: rx }, { city: rx }, { street: rx }, { cp_name: rx }, { emc2_contact: rx }, { kassenkundeName: rx },
      { $expr: { $regexMatch: { input: { $trim: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] } } }, regex: safe, options: "i" } } },
    ],
  };
}

const PUBLIC_CONFIG_KEYS = [
  "ENTLASTUNGSBETRAG_MONAT", "VERHINDERUNGSPFLEGE_JAHR", "PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT", "STEUERABSETZ_PCT",
  "STEUERABSETZ_CAP_JAHR", "BWT_TRAVEL_TIME_FREE_HOURS", "BWT_KM_FREE_THRESHOLD", "FAHRZEUGBEREITSTELLUNG", "WERKZEUG",
  "BERAEUMUNG", "WV_OWN_LAGER", "WV_LEFTOVER_USABLE_PERCENT", "WV_LEFTOVER_MIN_M2", "GRAB_BONUS_IDS",
  "NEUKUNDENBONUS_BRUTTO", "NEUKUNDENBONUS_SCHWELLE", "BU_SHOW_DA_HASSMANN",
];

export async function registerGroup3(
  app: FastifyInstance,
  deps: { businessConfig: BusinessConfig; authSecret: string; secureCookie: boolean },
) {
  const { businessConfig, authSecret, secureCookie } = deps;
  const writeConfig = async (key: string, value: unknown) => {
    await AppConfig.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true });
  };

  // one admin check for every route flagged config.admin (legacy requireAdmin)
  app.addHook("preHandler", async (req, reply) => {
    if (req.routeOptions.config?.admin !== true) return;
    const user: any = await User.findOne({ email: req.user?.email, active: true }).lean();
    if (!user) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    if (user.role !== "admin") return fail(req, reply, 403, "FORBIDDEN", "Admin-Zugriff erforderlich");
  });

  // ---------------- customers ----------------
  app.post("/api/customers", async (req, reply) => {
    const data = normalizeCustomerPayload(req.body ?? {});
    if (!data.firstName && !data.lastName && !data.company && !data.cp_name) {
      return fail(req, reply, 400, "BAD_REQUEST", "Bitte mindestens Vorname/Nachname, Firma oder Ansprechpartner angeben.");
    }
    const filter = data.customerNumber
      ? { customerNumber: data.customerNumber }
      : { firstName: data.firstName, lastName: data.lastName, company: data.company, email: data.email };
    // FIX B-1 (ADR 016): a missing customer number is stored as ABSENT, not "". The collection
    // has a unique *sparse* index on customerNumber — sparse skips only missing fields, so the
    // legacy "" made every second customer without number fail with HTTP 500.
    const { customerNumber, ...rest } = data;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (customerNumber) set.customerNumber = customerNumber;
    const customer = await Customer.findOneAndUpdate(
      filter,
      { $set: set, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return { ok: true, customer };
  });

  app.get("/api/customers/search", async (req) => {
    const query = req.query as Record<string, string | undefined>;
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(Number.parseInt(query.limit || "10", 10) || 10, 1), 50);
    if (!q) return { ok: true, items: [] };
    const items = await Customer.find(buildSearchFilter(q))
      .sort({ updatedAt: -1, createdAt: -1 }).limit(limit)
      .select("customerNumber bitrixContactId salutation firstName lastName company email phone street city postalCode state country emc2_contact payer customerType deployment kassenkundeName cp_name cp_phone cp_city kundendaten sourceOfferType updatedAt createdAt")
      .lean();
    return { ok: true, items };
  });

  app.get("/api/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!mongoose.isValidObjectId(id)) return fail(req, reply, 404, "NOT_FOUND", "Kundendaten nicht gefunden.");
    const customer = await Customer.findById(id).lean();
    if (!customer) return fail(req, reply, 404, "NOT_FOUND", "Kundendaten nicht gefunden.");
    return { ok: true, customer };
  });

  // ---------------- users (Ansprechpartner list) ----------------
  app.get("/api/users", async () => {
    const users: any[] = await User.find({ active: true, signatureDataUrl: { $exists: true, $ne: "" } })
      .sort({ firstName: 1, lastName: 1, email: 1 }).lean();
    return users.map((u) => ({
      email: u.email, firstName: u.firstName || "", lastName: u.lastName || "",
      name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.email, hasSignature: !!u.signatureDataUrl,
    }));
  });

  // ---------------- admin ----------------
  app.post("/admin/api/login", { config: { public: true } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !password) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail und Passwort erforderlich");
    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) return fail(req, reply, 401, "INVALID_CREDENTIALS", "E-Mail oder Passwort falsch");
    if (user.role !== "admin") return fail(req, reply, 403, "FORBIDDEN", "Kein Admin-Zugriff für dieses Konto");
    const token = createToken(email, authSecret);
    reply.header("set-cookie", sessionCookie(token, secureCookie));
    user.lastLoginAt = new Date();
    await user.save();
    return { token, user: { email: user.email, name: user.name, role: user.role } };
  });

  app.get("/admin/api/config/public", async () => {
    const result: Record<string, unknown> = {};
    for (const key of PUBLIC_CONFIG_KEYS) result[key] = businessConfig.get(key);
    for (const { key } of CONFIG_SCHEMA) if (key.startsWith("AZ_MIN_")) result[key] = businessConfig.get(key);
    return result;
  });

  app.get("/admin/api/config", { config: { admin: true } }, async () => {
    const docs: any[] = await AppConfig.find({}).lean();
    const map = new Map(docs.map((d) => [d.key, d.value]));
    return CONFIG_SCHEMA.map((def) => ({
      key: def.key, label: def.label, description: def.description || "", note: def.note || "", unit: def.unit || "",
      type: def.type, section: def.section, order: def.order, defaultValue: def.value,
      value: map.has(def.key) ? map.get(def.key) : def.value,
    }));
  });

  app.put("/admin/api/config", { config: { admin: true } }, async (req, reply) => {
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return fail(req, reply, 400, "BAD_REQUEST", "Body muss ein Objekt sein");
    const valid = new Set(CONFIG_SCHEMA.map((d) => d.key));
    const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => valid.has(k)));
    await businessConfig.setMany(filtered, writeConfig);
    req.log.info({ keys: Object.keys(filtered), by: req.user?.email }, "admin config updated");
    return { ok: true, updated: Object.keys(filtered).length };
  });

  app.post("/admin/api/config/reset", { config: { admin: true } }, async (req, reply) => {
    const { key } = (req.body ?? {}) as { key?: string };
    const def = CONFIG_SCHEMA.find((d) => d.key === key);
    if (!def) return fail(req, reply, 404, "NOT_FOUND", "Unbekannter Key");
    await businessConfig.set(def.key, def.value, writeConfig);
    return { ok: true, key, value: def.value };
  });

  app.get("/admin/api/bitrix-logs", { config: { admin: true } }, async () => {
    const docs = await BitrixLog.find({}).sort({ createdAt: -1 }).limit(500).lean();
    return { items: docs, total: docs.length };
  });

  // Local soffice/Puppeteer warm medians from main's 2026-11 benchmark: the "before" baseline
  // until enough local/fallback rows exist in the window.
  const PDF_BASELINE_MS: Record<string, number> = { docx: 5100, html: 2400 };
  // per kind/engine counts + average ms, time saved, last 200 failures (main PR #322)
  app.get("/admin/api/pdf-stats", { config: { admin: true } }, async (req) => {
    const days = Math.min(180, Math.max(1, Number((req.query as Record<string, string | undefined>).days) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const [groups, failures] = await Promise.all([
      PdfLog.aggregate([
        { $match: { app: PDF_LOG_APP, createdAt: { $gte: since } } },
        { $group: {
          _id: { kind: "$kind", engine: "$engine" },
          total: { $sum: 1 },
          ok: { $sum: { $cond: ["$ok", 1, 0] } },
          okMs: { $sum: { $cond: ["$ok", "$ms", 0] } },
          maxMs: { $max: "$ms" },
          last: { $max: "$createdAt" },
        } },
      ]),
      PdfLog.find({ app: PDF_LOG_APP, createdAt: { $gte: since }, ok: false }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    const rows: any[] = groups.map((g: any) => ({ ...g._id, total: g.total, ok: g.ok, failed: g.total - g.ok, avgMs: g.ok ? Math.round(g.okMs / g.ok) : null, maxMs: g.maxMs, last: g.last }));
    const saved: Record<string, { baselineMs: number; measured: boolean; ms: number }> = {};
    for (const kind of ["docx", "html"]) {
      const got = rows.find((r) => r.kind === kind && r.engine === "gotenberg");
      const loc = rows.filter((r) => r.kind === kind && r.engine !== "gotenberg" && r.ok);
      const locN = loc.reduce((n, r) => n + r.ok, 0);
      const baselineMs = locN >= 5 ? Math.round(loc.reduce((n, r) => n + r.avgMs * r.ok, 0) / locN) : PDF_BASELINE_MS[kind]!;
      saved[kind] = { baselineMs, measured: locN >= 5, ms: got?.ok ? Math.max(0, Math.round(got.ok * (baselineMs - got.avgMs))) : 0 };
    }
    return { app: PDF_LOG_APP, days, rows, saved, failures };
  });

  app.get("/admin/api/user-action-logs", { config: { admin: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: Record<string, string> = {};
    for (const k of ["event", "dealId", "offerNumber"] as const) { const v = String(q[k] || "").trim(); if (v) filter[k] = v; }
    const docs = await UserActionLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return { items: docs, total: docs.length };
  });

  app.get("/admin/api/users", { config: { admin: true } }, async () => {
    const users: any[] = await User.find({}).sort({ firstName: 1, lastName: 1, email: 1 }).lean();
    return users.map((u) => ({
      email: u.email, firstName: u.firstName || "", lastName: u.lastName || "", name: u.name || "",
      role: u.role || "user", active: u.active !== false, hasSignature: !!u.signatureDataUrl,
    }));
  });

  app.post("/admin/api/users", { config: { admin: true } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const email = String(b.email || "").trim().toLowerCase();
    if (!email) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail erforderlich");
    const firstName = String(b.firstName || "").trim();
    const lastName = String(b.lastName || "").trim();
    const set: Record<string, unknown> = {
      firstName, lastName, name: `${firstName} ${lastName}`.trim(), role: b.role === "admin" ? "admin" : "user", active: b.active !== false,
    };
    if (b.password) set.passwordHash = hashPassword(String(b.password));
    const existing = await User.findOne({ email });
    if (!existing && !b.password) return fail(req, reply, 400, "BAD_REQUEST", "Passwort für neuen Benutzer erforderlich");
    const doc = await User.findOneAndUpdate({ email }, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true });
    req.log.info({ email, by: req.user?.email }, "admin user upserted");
    return { ok: true, email: doc!.email };
  });

  app.post("/admin/api/users/:email/signature", { config: { admin: true }, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const email = String((req.params as { email: string }).email || "").trim().toLowerCase();
    const dataUrl = String(((req.body ?? {}) as Record<string, unknown>).dataUrl || "");
    if (dataUrl && !/^data:image\/(png|jpeg);base64,/.test(dataUrl)) return fail(req, reply, 400, "BAD_REQUEST", "Ungültiges Bildformat (PNG/JPEG erwartet)");
    const doc = await User.findOneAndUpdate({ email }, { $set: { signatureDataUrl: dataUrl } }, { new: true });
    if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Benutzer nicht gefunden");
    return { ok: true, hasSignature: !!doc.signatureDataUrl };
  });

  app.get("/admin/api/users/:email/signature", { config: { admin: true } }, async (req, reply) => {
    const email = String((req.params as { email: string }).email || "").trim().toLowerCase();
    const u: any = await User.findOne({ email }).lean();
    if (!u) return fail(req, reply, 404, "NOT_FOUND", "Benutzer nicht gefunden");
    return { dataUrl: u.signatureDataUrl || "" };
  });
}
