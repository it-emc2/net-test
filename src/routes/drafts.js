// src/routes/drafts.js
// Drafts (Entwürfe). Moved out of app.js so the routes can be mounted on a
// bare express app in tests; the handlers are unchanged.
import express from "express";
import Draft from "../models/Draft.js";
import Offer from "../models/Offer.js";
import Product from "../models/Product.js";
import pricingFactory, { computeFingerprint } from "../logic/pricing.js";
import { nameSearchRegex } from "../utils/searchRegex.js";

const router = express.Router();
const pricing = pricingFactory(Product);

// A draft carrying the offer number of an already-sent (locked) Offer is a new
// version of it, not that offer: computePrices() pins every price under a
// locked number to the sent total, so keeping the number would leave the
// Entwurf stuck on it forever. Give it its own number instead — same format as
// the client's genOfferNumber(), bumped on the rare same-second collision.
async function freshNumberIfSent(offerNumber) {
  if (!offerNumber) return null;
  if (!(await Offer.exists({ offerNumber, locked: true }))) return null;

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const base = `ANG${d.getFullYear()}-${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const taken =
      (await Offer.exists({ offerNumber: candidate })) ||
      (await Draft.exists({ offerNumber: candidate }));
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString().slice(-4)}`;
}

// POST /api/drafts/recompute  { offerNumber }
// Forces a fresh price for the most recently saved draft with this offer
// number, bypassing the cache (and the auto-recompute admin toggle), and
// persists the result. Mirrors POST /api/offers/:offerNumber/recompute for
// the case where nothing has been saved as a finalized Offer yet.
router.post("/recompute", async (req, res) => {
  try {
    const offerNumber = String(req.body?.offerNumber || "").trim();
    if (!offerNumber) {
      return res.status(400).json({ error: "offerNumber ist erforderlich" });
    }

    const draft = await Draft.findOne({ offerNumber }).sort({ updatedAt: -1 });
    if (!draft) {
      return res.status(404).json({ error: "Kein Entwurf mit dieser Angebotsnummer gefunden", offerNumber });
    }

    if (draft.locked) {
      return res.status(409).json({ error: "Entwurf ist gesperrt — Preis kann nicht neu berechnet werden." });
    }

    const pricingPayload = { ...draft.payload, offerType: draft.offerType, forceRecompute: true };
    const computedPricing = await pricing.computePrices(pricingPayload);

    draft.pricing = computedPricing;
    draft.pricingFingerprint = computeFingerprint(pricingPayload);
    await draft.save();

    res.json({
      ok: true,
      pricing: computedPricing,
      message: `Preis für Entwurf "${draft.name}" neu berechnet`,
    });
  } catch (err) {
    console.error("[drafts] recompute error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drafts
// body: { name, offerType, payload, savedAt?, clientSaveId? }
router.post("/", async (req, res) => {
  const { name, offerType, payload, savedAt, clientSaveId } = req.body || {};
  const trimmedName = String(name || "").trim();
  const trimmedOffer = String(offerType || "").trim();

  const findExisting = () =>
    Draft.findOne({ name: trimmedName, offerType: trimmedOffer }).lean();

  // Same client save replayed — its first attempt landed but the response
  // never got back to the client. Idempotent success, not a conflict.
  const respondForExisting = (existing) => {
    if (clientSaveId && existing.clientSaveId === clientSaveId) {
      return res.status(200).json({
        id: existing._id,
        name: existing.name,
        offerType: existing.offerType,
        savedAt: existing.savedAt,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      });
    }
    return res.status(409).json({
      error:
        "Ein Entwurf mit diesem Namen existiert bereits für diesen Bereich",
    });
  };

  try {
    if (!name || !offerType || !payload) {
      return res
        .status(400)
        .json({ error: "name, offerType und payload sind erforderlich" });
    }

    if (!trimmedName) {
      return res.status(400).json({ error: "Name darf nicht leer sein" });
    }

    // Ensure uniqueness per (offerType, name)
    const existing = await findExisting();
    if (existing) return respondForExisting(existing);

    const parsedSavedAt = savedAt ? new Date(savedAt) : null;

    const sentNumber = String(payload?.offerNumber || "").trim();
    const freshNumber = await freshNumberIfSent(sentNumber);
    const draftPayload = freshNumber
      ? { ...payload, offerNumber: freshNumber }
      : payload;

    // Price computed server-side on every draft save too, so reopening it
    // later can serve this snapshot instead of recomputing (see pricing-core
    // computePrices caching + the AUTO_RECOMPUTE_PRICING admin toggle).
    const pricingPayload = { ...draftPayload, offerType: trimmedOffer };
    const computedPricing = await pricing.computePrices(pricingPayload);

    const doc = await Draft.create({
      name: trimmedName,
      offerType: trimmedOffer,
      payload: draftPayload,
      offerNumber: String(draftPayload?.offerNumber || "").trim() || undefined,
      pricing: computedPricing,
      pricingFingerprint: computeFingerprint(pricingPayload),
      savedAt:
        parsedSavedAt && !Number.isNaN(parsedSavedAt.getTime())
          ? parsedSavedAt
          : new Date(),
      clientSaveId: clientSaveId ? String(clientSaveId) : undefined,
    });

    return res.status(201).json({
      id: doc._id,
      name: doc.name,
      offerType: doc.offerType,
      offerNumber: doc.offerNumber,
      savedAt: doc.savedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    // Two sync sweeps can both clear the findOne check before either write
    // commits; the loser then trips the unique (offerType, name) index. That
    // is the same situation the check above handles, not a server fault.
    if (err?.code === 11000) {
      const existing = await findExisting();
      if (existing) return respondForExisting(existing);
    }
    console.error("POST /api/drafts failed:", err);
    res.status(500).json({ error: "Serverfehler beim Speichern des Entwurfs" });
  }
});

// GET /api/drafts/search?offerType=bu&q=meier
// Must stay above /:id, otherwise "search" is read as an id.
router.get("/search", async (req, res) => {
  try {
    const { offerType, q } = req.query || {};
    const filter = {};

    if (!offerType) {
      return res.status(400).json({ error: "offerType ist erforderlich" });
    }

    filter.offerType = String(offerType).trim();

    if (q) {
      filter.name = nameSearchRegex(q);
    }

    // Sort by savedAt (when the user saved) rather than updatedAt (when the
    // write reached the server) — otherwise a batch of drafts synced after an
    // offline stretch all get near-identical timestamps in replay order.
    // Drafts written before savedAt existed fall back to updatedAt.
    const docs = await Draft.aggregate([
      { $match: filter },
      { $addFields: { savedAt: { $ifNull: ["$savedAt", "$updatedAt"] } } },
      { $sort: { savedAt: -1 } },
      { $limit: 10 },
      { $project: { name: 1, offerType: 1, updatedAt: 1, savedAt: 1 } },
    ]);

    res.json(docs);
  } catch (err) {
    console.error("GET /api/drafts/search failed:", err);
    res
      .status(500)
      .json({ error: "Serverfehler bei der Suche nach Entwürfen" });
  }
});

// GET /api/drafts/:id
router.get("/:id", async (req, res) => {
  try {
    const doc = await Draft.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Entwurf nicht gefunden" });

    // Keep it simple: send payload along with meta
    res.json({
      id: doc._id,
      name: doc.name,
      offerType: doc.offerType,
      offerNumber: doc.offerNumber,
      payload: doc.payload,
      savedAt: doc.savedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error("GET /api/drafts/:id failed:", err);
    res.status(500).json({ error: "Serverfehler beim Laden des Entwurfs" });
  }
});

export default router;
