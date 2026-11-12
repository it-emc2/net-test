// External lookup for the bau-formular (shared API key instead of a session): search, one draft,
// one offer. Closed when EXTERNAL_API_KEY is unset (legacy left it open). Contract test.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { externalKeyGuard } from "../../platform/external-key.js";
import { Draft, Offer } from "../../platform/models.js";
import { SEARCH_FIELDS } from "./read.js";
import { buildExternalSearchResult, mapSearchResult, nameSearchRegex } from "./search.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export async function registerOffersExternal(app: FastifyInstance, d: { externalApiKey?: string | undefined }) {
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
