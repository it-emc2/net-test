// Remaining small endpoints from legacy src/app.js + src/routes/offers.js (external lookup):
// /health, /api/vigor-prices, catalog bulk upserts, /api/submissions,
// /api/offers/external/* (bau-formular, shared API key). Responses identical (contract test).
// Differences (secure by design): the external routes are closed when EXTERNAL_API_KEY is
// unset (legacy left them open until the key was configured); the key is compared in
// constant time. Catalog bulk writes need an admin account (owner decision 2026-11-05,
// ADR 018; legacy: any logged-in user).
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildExternalSearchResult, mapSearchResult, nameSearchRegex } from "../offers/index.js";
import { Draft, Offer, Product, Service, Submission } from "../../platform/models.js";
import { getVigorDb, vigorPriceFetcher } from "../../integrations/vigor.js";
import { SEARCH_FIELDS } from "../offers/index.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export interface MiscDeps {
  vigorUri: string;
  computePrices: (payload: any) => Promise<any>;
  externalApiKey?: string | undefined;
}

export async function registerMisc(app: FastifyInstance, d: MiscDeps) {
  app.get("/health", { config: { public: true } }, async () => ({ ok: true, time: new Date().toISOString() }));

  // ---- Vigor live prices (WV panel cards) ----
  const netPrices = vigorPriceFetcher(d.vigorUri);
  app.get("/api/vigor-prices", async (req, reply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const ids = String(q.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return {};
      if (q.full !== "1") return Object.fromEntries(await netPrices(ids));
      const db = await getVigorDb(d.vigorUri);
      const docs: any[] = await db.collection("products").find({ articleNumber: { $in: ids } }, {
        projection: { articleNumber: 1, name: 1, netPrice: 1, listPrice: 1, images: 1, stockQuantity: 1, stockText: 1, lastSeenAt: 1 },
      }).toArray();
      const best = new Map<string, any>(); // freshest-wins per article
      for (const doc of docs) {
        if (!(Number(doc?.netPrice) > 0)) continue;
        const seen = doc.lastSeenAt ? new Date(doc.lastSeenAt).getTime() || 0 : 0;
        const prev = best.get(doc.articleNumber);
        if (!prev || seen >= prev._seen) best.set(doc.articleNumber, { ...doc, _seen: seen });
      }
      const result: Record<string, unknown> = {};
      for (const [id, x] of best) {
        result[id] = {
          articleNumber: x.articleNumber, name: x.name || "", netPrice: Number(x.netPrice), listPrice: Number(x.listPrice) || null,
          image: x.images?.[0] || null, stockQuantity: x.stockQuantity ?? null, stockText: x.stockText || null,
        };
      }
      return result;
    } catch (err) {
      req.log.error({ err }, "GET /api/vigor-prices failed");
      return fail(req, reply, 500, "VIGOR_FAILED", String(err));
    }
  });

  // ---- catalog bulk upserts: admins only (ADR 018) ----
  const ADMIN_ONLY = { config: { admin: true } };
  app.post("/api/products/bulk", ADMIN_ONLY, async (req, reply) => {
    try {
      const items = Array.isArray(req.body) ? (req.body as any[]) : [];
      if (!items.length) return fail(req, reply, 400, "BAD_REQUEST", "Body must be an array of products");
      const result = await Product.bulkWrite(items.map((p) => ({
        updateOne: {
          filter: { productId: p.productId },
          update: { $set: {
            name: p.name, price: Number(p.price || 0), widthCm: p.widthCm ?? null, lengthCm: p.lengthCm ?? null,
            heightCm: p.heightCm ?? null, source: p.source ?? null, manufacturer: p.manufacturer ?? null,
          } },
          upsert: true,
        },
      })));
      req.log.info({ count: items.length }, "products bulk upsert");
      return { ok: true, result };
    } catch (err) {
      req.log.error({ err }, "POST /api/products/bulk failed");
      return fail(req, reply, 500, "BULK_FAILED", String(err));
    }
  });

  app.post("/api/services/bulk", ADMIN_ONLY, async (req, reply) => {
    try {
      const items = Array.isArray(req.body) ? (req.body as any[]) : [];
      if (!items.length) return fail(req, reply, 400, "BAD_REQUEST", "Body must be an array of services");
      const result = await Service.bulkWrite(items.map((s) => ({
        updateOne: {
          filter: { serviceId: s.serviceId },
          update: { $set: {
            name: s.name, description: s.description ?? null, internal_name: s.internal_name ?? null,
            price: Number(s.price || 0), time: Number(s.time || 0), source: s.source ?? null,
          } },
          upsert: true,
        },
      })));
      req.log.info({ count: items.length }, "services bulk upsert");
      return { ok: true, result };
    } catch (err) {
      req.log.error({ err }, "POST /api/services/bulk failed");
      return fail(req, reply, 500, "BULK_FAILED", String(err));
    }
  });

  // ---- legacy submissions (price + store) ----
  app.post("/api/submissions", async (req, reply) => {
    try {
      const payload = req.body;
      const computed = await d.computePrices(payload);
      const doc = await Submission.create({ payload, computed });
      return reply.status(201).send({ id: doc._id, computed });
    } catch (err) {
      req.log.error({ err }, "POST /api/submissions failed");
      return fail(req, reply, 500, "SUBMISSION_FAILED", String(err));
    }
  });

  // ---- external lookup for the bau-formular (shared API key instead of a session) ----
  const EXT = { config: { public: true }, onRequest: externalKeyGuard(d.externalApiKey) };

  app.get("/api/offers/external/search", EXT, async (req, reply) => {
    try {
      const query = req.query as Record<string, unknown>;
      const q = String(query.q || "").trim();
      const limit = Math.min(Math.max(Number.parseInt(String(query.limit), 10) || 20, 1), 50);
      if (!q) return { results: [], query: q, limit };
      const re = nameSearchRegex(q);
      const mongoQuery = { $or: SEARCH_FIELDS.map((f) => ({ [f]: re })) };
      const [drafts, offers] = await Promise.all([
        Draft.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean(),
        Offer.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean(),
      ]);
      const results = [...drafts.map((x) => mapSearchResult(x, "draft", q)), ...offers.map((x) => mapSearchResult(x, "offer", q))];
      results.sort((a: any, b: any) => {
        if (b._score !== a._score) return b._score - a._score;
        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      });
      return { results: results.slice(0, limit).map(buildExternalSearchResult), query: q, limit };
    } catch (err) {
      req.log.error({ err }, "external search failed");
      return fail(req, reply, 500, "SEARCH_FAILED", "External search failed");
    }
  });

  app.get("/api/offers/external/drafts/:id", EXT, async (req, reply) => {
    try {
      const draft: any = await Draft.findById((req.params as { id: string }).id).lean();
      if (!draft) return fail(req, reply, 404, "NOT_FOUND", "Entwurf nicht gefunden");
      const k = draft.payload?.Kundendaten || {};
      return {
        kind: "draft", id: draft._id, name: draft.name || "",
        title: [k.firstName, k.lastName].filter(Boolean).join(" ").trim() || draft.name || "",
        offerType: draft.offerType || "", firstName: k.firstName || "", lastName: k.lastName || "", email: k.email || "",
        city: k.city || "", postalCode: k.postalCode || "", phone: k.phone || "",
        createdAt: draft.createdAt || null, updatedAt: draft.updatedAt || null, payload: draft.payload || {},
      };
    } catch (err) {
      req.log.error({ err }, "external draft lookup failed");
      return fail(req, reply, 500, "LOOKUP_FAILED", "External draft lookup failed");
    }
  });

  app.get("/api/offers/external/offers/:offerNumber", EXT, async (req, reply) => {
    try {
      const offerNumber = (req.params as { offerNumber: string }).offerNumber;
      const offer: any = await Offer.findOne({ offerNumber }).lean();
      if (!offer) return fail(req, reply, 404, "NOT_FOUND", "Angebot nicht gefunden", { offerNumber });
      const k = offer.payload?.Kundendaten || offer.kundendaten || {};
      return {
        kind: "offer", id: offer._id,
        title: [k.firstName || offer.firstName, k.lastName || offer.lastName].filter(Boolean).join(" ").trim() || offer.offerNumber || "",
        offerNumber: offer.offerNumber || "", offerType: offer.offerType || "", customerNumber: offer.customerNumber || "",
        dealId: offer.dealId || k.dealId || offer.payload?.dealId || "",
        firstName: k.firstName || offer.firstName || "", lastName: k.lastName || offer.lastName || "",
        email: k.email || offer.email || "", city: k.city || offer.city || "", postalCode: k.postalCode || offer.postalCode || "",
        phone: k.phone || offer.phone || "", createdAt: offer.createdAt || null, updatedAt: offer.updatedAt || null,
        payload: offer.payload || {}, pricing: offer.pricing || null, status: offer.status || "",
      };
    } catch (err) {
      req.log.error({ err }, "external offer lookup failed");
      return fail(req, reply, 500, "LOOKUP_FAILED", "External offer lookup failed");
    }
  });
}

/** Route guard for machine callers (bau-formular): `X-API-Key` / `?apiKey` = EXTERNAL_API_KEY,
 *  constant-time compare; closed (503) when the key is not configured (legacy: open). */
export function externalKeyGuard(externalApiKey: string | undefined) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!externalApiKey) return fail(req, reply, 503, "NOT_CONFIGURED", "EXTERNAL_API_KEY not configured");
    const given = String(req.headers["x-api-key"] || (req.query as Record<string, unknown>).apiKey || "");
    const a = Buffer.from(given), b = Buffer.from(externalApiKey);
    if (!(a.length === b.length && timingSafeEqual(a, b))) return fail(req, reply, 401, "UNAUTHORIZED", "Invalid or missing API key");
  };
}
