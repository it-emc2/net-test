// Offers + drafts — read endpoints (phase 4, group 2a). Ported from legacy
// src/routes/offers.js and src/routes/drafts.js; success bodies identical (contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose from "mongoose";
import { mapSearchResult, nameSearchRegex } from "../legacy/search.js";
import { Draft, Offer } from "../platform/models.js";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: object = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id, ...extra } });

export const SEARCH_FIELDS = [
  "offerNumber", "angNumber", "customerNumber", "dealId", "firstName", "lastName", "email", "city", "postalCode",
  "street", "company", "phone",
  "payload.Kundendaten.firstName", "payload.Kundendaten.lastName", "payload.Kundendaten.email", "payload.Kundendaten.city",
  "payload.Kundendaten.postalCode", "payload.Kundendaten.street", "payload.Kundendaten.company", "payload.Kundendaten.phone",
  "payload.Zusammenfassung.angebotNummer", "payload.Zusammenfassung.dealId", "payload.auftragId",
  "payload.Anfragedetails.rawImportText", "payload.Anfragedetails.dealTitle", "payload.Anfragedetails.Anfragedetails",
  "kundendaten.firstName", "kundendaten.lastName", "kundendaten.email", "kundendaten.city", "kundendaten.postalCode",
  "kundendaten.street", "kundendaten.company", "kundendaten.phone",
];

const byDate = (a: any, b: any) =>
  new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();

export async function registerOffersRead(app: FastifyInstance) {
  app.get("/api/offers/search-all", async (req) => {
    const query = req.query as Record<string, string | undefined>;
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(Number.parseInt(String(query.limit), 10) || 20, 1), 50);
    if (!q) return [];
    const re = nameSearchRegex(q);
    const mongoQuery = { $or: SEARCH_FIELDS.map((f) => ({ [f]: re })) };
    const [drafts, offers] = await Promise.all([
      Draft.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean(),
      Offer.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(limit * 2).lean(),
    ]);
    const results = [
      ...drafts.map((d) => mapSearchResult(d, "draft", q)),
      ...offers.map((d) => mapSearchResult(d, "offer", q)),
    ];
    results.sort((a: any, b: any) => (b._score !== a._score ? b._score - a._score : byDate(a, b)));
    return results.slice(0, limit);
  });

  app.get("/api/offers/by-deal/:dealId", async (req) => {
    const dealId = String((req.params as { dealId: string }).dealId || "").trim();
    if (!dealId) return [];
    const mongoQuery = {
      $or: [
        { dealId }, { "payload.auftragId": dealId }, { "payload.postal.auftragId": dealId }, { "payload.dealId": dealId },
        { "payload.Kundendaten.dealId": dealId }, { "payload.Zusammenfassung.dealId": dealId }, { "payload.bitrixDealId": dealId },
      ],
    };
    const [drafts, offers] = await Promise.all([
      Draft.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(20).lean(),
      Offer.find(mongoQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(20).lean(),
    ]);
    const results = [...drafts.map((d) => mapSearchResult(d, "draft", "")), ...offers.map((d) => mapSearchResult(d, "offer", ""))];
    results.sort(byDate);
    return results;
  });

  app.get("/api/offers/:offerNumber", async (req, reply) => {
    const { offerNumber } = req.params as { offerNumber: string };
    const offer = await Offer.findOne({ offerNumber }).lean();
    if (!offer) return fail(req, reply, 404, "NOT_FOUND", "Angebot nicht gefunden", { offerNumber });
    return { ok: true, offer };
  });

  app.get("/api/offers", async (req) => {
    const { q, offerType, limit = "50", pflegekasseEmc2Antrag } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (q) {
      const re = { $regex: esc(String(q)), $options: "i" }; // escaped (legacy: raw $regex)
      filter.$or = [{ offerNumber: re }, { "payload.Kundendaten.lastName": re }, { "payload.Kundendaten.firstName": re }];
    }
    if (offerType) filter.offerType = offerType;
    if (pflegekasseEmc2Antrag) filter["payload.Kundendaten.pflegekasseEmc2Antrag"] = pflegekasseEmc2Antrag;
    return Offer.find(filter)
      .sort({ updatedAt: -1 })
      .limit(Number.parseInt(String(limit), 10))
      .select("offerNumber offerType status createdAt updatedAt payload pricing customer")
      .lean();
  });

  app.get("/api/drafts/search", async (req, reply) => {
    const { offerType, q } = (req.query ?? {}) as Record<string, string | undefined>;
    if (!offerType) return fail(req, reply, 400, "BAD_REQUEST", "offerType ist erforderlich");
    const filter: Record<string, unknown> = { offerType: String(offerType).trim() };
    if (q) filter.name = nameSearchRegex(q);
    return Draft.aggregate([
      { $match: filter },
      { $addFields: { savedAt: { $ifNull: ["$savedAt", "$updatedAt"] } } },
      { $sort: { savedAt: -1 } },
      { $limit: 10 },
      { $project: { name: 1, offerType: 1, updatedAt: 1, savedAt: 1 } },
    ]);
  });

  app.get("/api/drafts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    // invalid ids → 404 (legacy: CastError → 500)
    if (!mongoose.isValidObjectId(id)) return fail(req, reply, 404, "NOT_FOUND", "Entwurf nicht gefunden");
    const doc: any = await Draft.findById(id).lean();
    if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Entwurf nicht gefunden");
    return {
      id: doc._id, name: doc.name, offerType: doc.offerType, offerNumber: doc.offerNumber, payload: doc.payload,
      savedAt: doc.savedAt, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    };
  });
}
