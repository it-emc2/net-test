// Offer draft save/load. Drafts are anchored to a Bitrix deal (dealId) and store
// the full offer payload verbatim, so loading a draft is a plain payload replace
// on the client. Separate collection from legacy v3 (see models/OfferDraft).
import { Router, type Request, type Response } from "express";
import type { DraftDetail, DraftListItem, DraftsListResponse } from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import OfferDraft, { type OfferDraftDoc } from "../models/OfferDraft.js";

const router = Router();
router.use(requireAuth);

function escRegex(v = ""): string {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toListItem(d: OfferDraftDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date }): DraftListItem {
  return {
    id: String(d._id),
    name: d.name,
    offerType: d.offerType,
    dealId: d.dealId ?? "",
    customerName: d.customerName ?? "",
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
  };
}

// POST /api/drafts — create, or update in place when `id` is given.
router.post("/", async (req: Request, res: Response) => {
  try {
    const { id, name, offerType, dealId, customerName, payload } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Name erforderlich" });
    if (!payload || typeof payload !== "object") return res.status(400).json({ error: "Payload erforderlich" });

    const fields = {
      name: String(name).trim(),
      offerType: String(offerType || "bu").trim(),
      dealId: String(dealId || "").trim(),
      customerName: String(customerName || "").trim(),
      payload,
    };

    if (id) {
      const updated = await OfferDraft.findByIdAndUpdate(id, { $set: fields }, { new: true }).lean();
      if (!updated) return res.status(404).json({ error: "Entwurf nicht gefunden" });
      return res.json(toListItem(updated as any));
    }
    const created = await OfferDraft.create({ ...fields, createdBy: req.user?.email || "" });
    return res.status(201).json(toListItem(created.toObject() as any));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[drafts] save error:", err);
    return res.status(500).json({ error: "Entwurf konnte nicht gespeichert werden" });
  }
});

// GET /api/drafts?dealId=&offerType=&q= — list (newest first), no payload.
router.get("/", async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.dealId) filter.dealId = String(req.query.dealId).trim();
    if (req.query.offerType) filter.offerType = String(req.query.offerType).trim();
    if (req.query.q) filter.name = new RegExp(escRegex(String(req.query.q)), "i");
    const docs = await OfferDraft.find(filter).sort({ updatedAt: -1 }).limit(50).select("-payload").lean();
    const body: DraftsListResponse = { drafts: (docs as any[]).map(toListItem) };
    return res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[drafts] list error:", err);
    return res.status(500).json({ error: "Entwürfe konnten nicht geladen werden" });
  }
});

// GET /api/drafts/:id — full draft incl. payload.
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const d = await OfferDraft.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ error: "Entwurf nicht gefunden" });
    const body: DraftDetail = { ...toListItem(d as any), payload: (d as any).payload || {} };
    return res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[drafts] get error:", err);
    return res.status(500).json({ error: "Entwurf nicht gefunden" });
  }
});

// DELETE /api/drafts/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const d = await OfferDraft.findByIdAndDelete(req.params.id).lean();
    if (!d) return res.status(404).json({ error: "Entwurf nicht gefunden" });
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[drafts] delete error:", err);
    return res.status(500).json({ error: "Entwurf konnte nicht gelöscht werden" });
  }
});

export default router;
