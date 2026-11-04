// Deal draft API (ADR 007) — new in v2, used by /deal/:dealId in the web app.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose from "mongoose";
import { Draft, Offer } from "../models.js";
import {
  getDealDraft, listRevisions, payloadAt, RevisionConflictError, saveDealDraft,
} from "./store.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: object = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id, ...extra } });

const DEAL_ID = /^\d{1,12}$/;
const OFFER_TYPES = new Set(["bu", "bwt", "hl", "bl", "ah"]); // HMS/WD dropped (ADR 011)

async function guarded<T>(req: FastifyRequest, reply: FastifyReply, fn: () => Promise<T>) {
  try { return await fn(); } catch (e) {
    if (e instanceof RevisionConflictError) return fail(req, reply, 409, "REVISION_CONFLICT", e.message, { currentRevision: e.currentRevision });
    throw e;
  }
}

export async function registerDealDrafts(app: FastifyInstance) {
  // every route validates the deal id first
  app.addHook("preHandler", async (req, reply) => {
    const dealId = (req.params as { dealId?: string } | undefined)?.dealId;
    if (req.routeOptions.url?.startsWith("/api/deals/") && (!dealId || !DEAL_ID.test(dealId))) {
      return fail(req, reply, 400, "BAD_DEAL_ID", "Ungültige Deal-Nummer");
    }
  });

  app.get("/api/deals/:dealId/draft", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const d: any = await getDealDraft(dealId);
    if (!d) return fail(req, reply, 404, "NO_DRAFT", "Für diesen Auftrag gibt es noch keinen Entwurf", { revision: 0 });
    return { dealId, offerType: d.offerType, payload: d.payload, revision: d.revision, updatedAt: d.updatedAt, updatedBy: d.updatedBy };
  });

  app.put("/api/deals/:dealId/draft", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { offerType?: string; payload?: unknown; baseRevision?: number };
    if (!b.offerType || !OFFER_TYPES.has(b.offerType)) return fail(req, reply, 400, "BAD_REQUEST", "Unbekannte Angebotsart");
    if (!b.payload || typeof b.payload !== "object" || Array.isArray(b.payload)) return fail(req, reply, 400, "BAD_REQUEST", "payload fehlt");
    if (!Number.isInteger(b.baseRevision) || (b.baseRevision as number) < 0) return fail(req, reply, 400, "BAD_REQUEST", "baseRevision fehlt");
    return guarded(req, reply, () => saveDealDraft({
      dealId, offerType: b.offerType!, payload: b.payload as Record<string, unknown>, baseRevision: b.baseRevision!, by: req.user!.email,
    }));
  });

  app.get("/api/deals/:dealId/draft/revisions", async (req) => {
    const { dealId } = req.params as { dealId: string };
    return { dealId, revisions: await listRevisions(dealId) };
  });

  app.get("/api/deals/:dealId/draft/revisions/:rev", async (req, reply) => {
    const { dealId, rev } = req.params as { dealId: string; rev: string };
    const r = await payloadAt(dealId, Number.parseInt(rev, 10));
    if (!r) return fail(req, reply, 404, "NOT_FOUND", "Diese Version gibt es nicht");
    return { dealId, revision: Number.parseInt(rev, 10), ...r };
  });

  app.post("/api/deals/:dealId/draft/restore", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { revision?: number; baseRevision?: number };
    if (!Number.isInteger(b.revision) || !Number.isInteger(b.baseRevision)) return fail(req, reply, 400, "BAD_REQUEST", "revision und baseRevision erforderlich");
    const old = await payloadAt(dealId, b.revision!);
    if (!old) return fail(req, reply, 404, "NOT_FOUND", "Diese Version gibt es nicht");
    return guarded(req, reply, () => saveDealDraft({
      dealId, offerType: old.offerType, payload: old.payload as Record<string, unknown>, baseRevision: b.baseRevision!,
      by: req.user!.email, kind: "restore", note: `Version ${b.revision} wiederhergestellt`,
    }));
  });

  /** Copy a legacy draft/offer into the deal draft. The legacy document is only READ. */
  app.post("/api/deals/:dealId/draft/import", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { kind?: string; id?: string; offerNumber?: string; baseRevision?: number };
    if (!Number.isInteger(b.baseRevision)) return fail(req, reply, 400, "BAD_REQUEST", "baseRevision erforderlich");
    let src: any = null;
    if (b.kind === "draft" && b.id && mongoose.isValidObjectId(b.id)) src = await Draft.findById(b.id).lean();
    if (b.kind === "offer" && b.offerNumber) src = await Offer.findOne({ offerNumber: b.offerNumber }).lean();
    if (!src) return fail(req, reply, 404, "NOT_FOUND", "Quelle nicht gefunden");
    const offerType = String(src.offerType || src.payload?.activeOffer || "bu").toLowerCase();
    if (!OFFER_TYPES.has(offerType)) return fail(req, reply, 422, "UNSUPPORTED_TYPE", `Angebotsart ${offerType} wird nicht mehr unterstützt`);
    const label = b.kind === "draft" ? `Entwurf „${src.name}“` : `Angebot ${src.offerNumber}`;
    return guarded(req, reply, () => saveDealDraft({
      dealId, offerType, payload: structuredClone(src.payload), baseRevision: b.baseRevision!,
      by: req.user!.email, kind: "import", note: `Übernommen aus ${label}`,
    }));
  });
}
