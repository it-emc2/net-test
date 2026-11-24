// Deal draft API (ADR 007) — new in v2, used by /deal/:dealId in the web app.
// Variants (ADR 027 A): every draft call takes an optional query parameter `variant=<id>`.
// Without it (today's UI, add-ons deal-draft.js / local-store.js) a call acts on the variant
// opened last (store.ts defaultOf) — for a deal with one variant that is the one draft, as before.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mongoose from "mongoose";
import { CREATION_ID_RE, ERROR_AREAS, ERROR_CODES, FIRST_VARIANT_ID, isVariantId, type ErrorCode } from "@oc/api-contract";
import { reportError } from "../../platform/error-events.js";
import { Draft, Offer } from "../../platform/models.js";
import {
  adoptTempDraft, defaultOf, getDealDraft, listRevisions, liveVariants, payloadAt, publicVariantId, RevisionConflictError, saveDealDraft, TEMP_KEY,
  touchOpened, VariantIndexMissingError,
} from "./store.js";
import { createVariant, deleteVariant, listVariants, renameVariant, setAhAmountOf, VariantError, variantNameOf, type AhAmountOf } from "./variants.js";
import { relatedOf, relationsOf, secondOffer, SecondOfferError, type SecondOfferDeps } from "./second-offer.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: object = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id, ...extra } });

const DEAL_NUMBER = /^\d{1,12}$/;
/** a deal number, or the temporary key of a draft started without one (option A) */
const DEAL_ID = { test: (v: string) => DEAL_NUMBER.test(v) || TEMP_KEY.test(v) };
const OFFER_TYPES = new Set(["bu", "bwt", "hl", "bl", "ah"]); // HMS/WD dropped (ADR 011)

export interface DealDraftDeps {
  /** the contact person of a new variant: the signed-in user, as "Neue Version" does (offers resolveAnsprechpartner) */
  resolveContact?: (kundendaten: Record<string, unknown>, user: { email?: string } | undefined) => Promise<Record<string, unknown>>;
  /** the AH monthly amount of a stored offer (the variant panel's total of a handed-over AH offer); absent → none */
  ahAmountOf?: AhAmountOf;
  /** a second offer type for the same customer (ADR 027 B): Bitrix deal writes + settings; absent → the route is not registered */
  secondOffer?: Omit<SecondOfferDeps, "resolveContact">;
}

async function guarded<T>(req: FastifyRequest, reply: FastifyReply, fn: () => Promise<T>) {
  const dealId = String((req.params as { dealId?: string })?.dealId ?? "");
  try { return await fn(); } catch (e) {
    if (e instanceof RevisionConflictError) return fail(req, reply, 409, "REVISION_CONFLICT", e.message, { currentRevision: e.currentRevision });
    if (e instanceof VariantError) {
      reportError(req, { area: ERROR_AREAS.dealVariants, code: e.code as ErrorCode, severity: "warn", message: `variant refused (${e.code})`, dealId });
      return fail(req, reply, e.status, e.code, e.message);
    }
    if (e instanceof SecondOfferError) {
      // the error log gets warn-level refusals here; Bitrix failures were reported where they happened (with the upstream call)
      if (e.severity === "warn" && e.code !== ERROR_CODES.SECOND_OFFER_COMMENT_FAILED) reportError(req, { area: ERROR_AREAS.secondOffer, code: e.code, severity: "warn", message: `second offer refused (${e.code})`, dealId });
      return fail(req, reply, e.status, e.code, e.message, e.extra);
    }
    if (e instanceof VariantIndexMissingError) {
      reportError(req, { area: ERROR_AREAS.dealVariants, code: ERROR_CODES.VARIANT_CREATE_FAILED, message: "variant create failed: migration 005 not run", dealId });
      return fail(req, reply, 503, ERROR_CODES.VARIANT_CREATE_FAILED, "Varianten sind auf diesem Server noch nicht eingerichtet. Bitte wenden Sie sich an den Administrator.");
    }
    throw e;
  }
}

/** `?variant=` of the request: undefined when absent, null when malformed */
const variantParam = (req: FastifyRequest): string | null | undefined => {
  const v = (req.query as { variant?: unknown } | undefined)?.variant;
  if (v === undefined || v === "") return undefined;
  return isVariantId(v) ? v : null;
};
const notFound = () => new VariantError("VARIANT_NOT_FOUND", 404, "Diese Variante gibt es nicht (mehr).");

/**
 * The variant a draft call acts on. Explicit: must be live — except the first variant of a deal
 * without any draft yet (its first save creates it). Without: the variant opened last, or the
 * first variant when the deal has no draft.
 */
async function targetOf(dealId: string, asked: string | undefined, forWrite: boolean): Promise<{ variantId: string; variants: any[] }> {
  const variants = await liveVariants(dealId);
  if (asked === undefined) {
    const d = defaultOf(variants);
    return { variantId: d ? publicVariantId(d) : FIRST_VARIANT_ID, variants };
  }
  if (variants.some((v) => publicVariantId(v) === asked)) return { variantId: asked, variants };
  if (forWrite && asked === FIRST_VARIANT_ID && !variants.length) return { variantId: asked, variants };
  throw notFound();
}

/** all variants of a deal have the same offer type (ADR 027 A) — a save with another one is refused while there are several */
function assertSameType(variants: any[], variantId: string, offerType: string) {
  const others = variants.filter((v) => publicVariantId(v) !== variantId);
  if (others.length && others.some((v) => v.offerType !== offerType)) {
    throw new VariantError("VARIANT_TYPE_MISMATCH", 409, "Alle Varianten eines Auftrags haben dieselbe Angebotsart. Bitte legen Sie für eine andere Angebotsart einen neuen Auftrag an.");
  }
}

export async function registerDealDrafts(app: FastifyInstance, deps: DealDraftDeps = {}) {
  setAhAmountOf(deps.ahAmountOf ?? null);
  // every route validates the deal id (and a given variant id) first
  app.addHook("preHandler", async (req, reply) => {
    if (!req.routeOptions.url?.startsWith("/api/deals/")) return;
    const p = (req.params ?? {}) as { dealId?: string; variantId?: string };
    if (!p.dealId || !DEAL_ID.test(p.dealId)) return fail(req, reply, 400, "BAD_DEAL_ID", "Ungültige Deal-Nummer");
    if ((p.variantId !== undefined && !isVariantId(p.variantId)) || variantParam(req) === null) {
      return fail(req, reply, 400, "BAD_REQUEST", "Ungültige Varianten-Kennung");
    }
  });

  app.get("/api/deals/:dealId/draft", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const asked = variantParam(req) ?? undefined;
    const d: any = await getDealDraft(dealId, asked);
    if (!d) {
      if (asked) return fail(req, reply, 404, ERROR_CODES.VARIANT_NOT_FOUND, "Diese Variante gibt es nicht (mehr).", { revision: 0 });
      return fail(req, reply, 404, "NO_DRAFT", "Für diesen Auftrag gibt es noch keinen Entwurf", { revision: 0 });
    }
    if (asked) await touchOpened(dealId, asked); // opened with a choice: the calls without one follow it
    return {
      dealId, offerType: d.offerType, payload: d.payload, revision: d.revision, updatedAt: d.updatedAt, updatedBy: d.updatedBy,
      variantId: publicVariantId(d), variantName: variantNameOf(d),
      related: await relationsOf(dealId),
    };
  });

  app.put("/api/deals/:dealId/draft", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { offerType?: string; payload?: unknown; baseRevision?: number };
    if (!b.offerType || !OFFER_TYPES.has(b.offerType)) return fail(req, reply, 400, "BAD_REQUEST", "Unbekannte Angebotsart");
    if (!b.payload || typeof b.payload !== "object" || Array.isArray(b.payload)) return fail(req, reply, 400, "BAD_REQUEST", "payload fehlt");
    if (!Number.isInteger(b.baseRevision) || (b.baseRevision as number) < 0) return fail(req, reply, 400, "BAD_REQUEST", "baseRevision fehlt");
    return guarded(req, reply, async () => {
      const t = await targetOf(dealId, variantParam(req) ?? undefined, true);
      assertSameType(t.variants, t.variantId, b.offerType!);
      return saveDealDraft({
        dealId, variantId: t.variantId, offerType: b.offerType!, payload: b.payload as Record<string, unknown>, baseRevision: b.baseRevision!, by: req.user!.email,
      });
    });
  });

  app.get("/api/deals/:dealId/draft/revisions", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    return guarded(req, reply, async () => {
      const t = await targetOf(dealId, variantParam(req) ?? undefined, false);
      return { dealId, variantId: t.variantId, revisions: await listRevisions(dealId, t.variantId) };
    });
  });

  app.get("/api/deals/:dealId/draft/revisions/:rev", async (req, reply) => {
    const { dealId, rev } = req.params as { dealId: string; rev: string };
    return guarded(req, reply, async () => {
      const t = await targetOf(dealId, variantParam(req) ?? undefined, false);
      const r = await payloadAt(dealId, Number.parseInt(rev, 10), t.variantId);
      if (!r) return fail(req, reply, 404, "NOT_FOUND", "Diese Version gibt es nicht");
      return { dealId, variantId: t.variantId, revision: Number.parseInt(rev, 10), ...r };
    });
  });

  app.post("/api/deals/:dealId/draft/restore", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { revision?: number; baseRevision?: number };
    if (!Number.isInteger(b.revision) || !Number.isInteger(b.baseRevision)) return fail(req, reply, 400, "BAD_REQUEST", "revision und baseRevision erforderlich");
    return guarded(req, reply, async () => {
      const t = await targetOf(dealId, variantParam(req) ?? undefined, false);
      const old = await payloadAt(dealId, b.revision!, t.variantId);
      if (!old) return fail(req, reply, 404, "NOT_FOUND", "Diese Version gibt es nicht");
      return saveDealDraft({
        dealId, variantId: t.variantId, offerType: old.offerType, payload: old.payload as Record<string, unknown>, baseRevision: b.baseRevision!,
        by: req.user!.email, kind: "restore", note: `Version ${b.revision} wiederhergestellt`,
      });
    });
  });

  /** Attach a draft started without a deal number to this deal (option A) — with all its variants. */
  app.post("/api/deals/:dealId/draft/adopt", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const from = String(((req.body ?? {}) as { from?: string }).from || "");
    if (!DEAL_NUMBER.test(dealId) || !TEMP_KEY.test(from)) return fail(req, reply, 400, "BAD_REQUEST", "Deal-Nummer und vorläufiger Entwurf erforderlich");
    const r = await guarded(req, reply, () => adoptTempDraft({ dealId, tempKey: from, by: req.user!.email }));
    if (r === null) return fail(req, reply, 404, "NOT_FOUND", "Vorläufiger Entwurf nicht gefunden");
    return r;
  });

  /** Copy a legacy draft/offer into the deal draft (the given variant, else the one opened last). The legacy document is only READ. */
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
    return guarded(req, reply, async () => {
      const t = await targetOf(dealId, variantParam(req) ?? undefined, true);
      assertSameType(t.variants, t.variantId, offerType);
      return saveDealDraft({
        dealId, variantId: t.variantId, offerType, payload: structuredClone(src.payload), baseRevision: b.baseRevision!,
        by: req.user!.email, kind: "import", note: `Übernommen aus ${label}`,
      });
    });
  });

  // ---------- a second offer type for the same customer (ADR 027 B) ----------
  app.get("/api/deals/:dealId/related", async (req) => {
    const { dealId } = req.params as { dealId: string };
    return TEMP_KEY.test(dealId) ? { dealId, related: [] } : relatedOf(dealId);
  });

  if (deps.secondOffer) {
    const so = secondOffer({ ...deps.secondOffer, resolveContact: deps.resolveContact });
    app.post("/api/deals/:dealId/second-offer", async (req, reply) => {
      const { dealId } = req.params as { dealId: string };
      const b = (req.body ?? {}) as { offerType?: unknown; creationId?: unknown; variantId?: unknown; checkBitrix?: unknown };
      if (typeof b.creationId !== "string" || !CREATION_ID_RE.test(b.creationId)) return fail(req, reply, 400, "BAD_REQUEST", "Anfrage-Kennung fehlt oder ist ungültig");
      if (b.variantId !== undefined && !isVariantId(b.variantId)) return fail(req, reply, 400, "BAD_REQUEST", "Ungültige Varianten-Kennung");
      return guarded(req, reply, () => so.create({
        dealId, offerType: b.offerType, creationId: b.creationId as string, variantId: b.variantId as string | undefined,
        checkBitrix: b.checkBitrix === true, by: req.user!.email, user: req.user,
      }, req));
    });
  }

  // ---------- variants (ADR 027 A) ----------
  app.get("/api/deals/:dealId/variants", async (req) => listVariants((req.params as { dealId: string }).dealId));

  app.post("/api/deals/:dealId/variants", async (req, reply) => {
    const { dealId } = req.params as { dealId: string };
    const b = (req.body ?? {}) as { from?: unknown; name?: unknown };
    if (b.from !== undefined && !isVariantId(b.from)) return fail(req, reply, 400, "BAD_REQUEST", "Ungültige Varianten-Kennung");
    if (b.name !== undefined && typeof b.name !== "string") return fail(req, reply, 400, ERROR_CODES.VARIANT_NAME_INVALID, "Bitte geben Sie einen Namen ein.");
    return guarded(req, reply, () => createVariant({
      dealId, ...(b.from ? { from: b.from as string } : {}), ...(typeof b.name === "string" ? { name: b.name } : {}), by: req.user!.email,
      ...(deps.resolveContact ? { contact: (kd: Record<string, unknown>) => deps.resolveContact!(kd, req.user) } : {}),
    }));
  });

  app.patch("/api/deals/:dealId/variants/:variantId", async (req, reply) => {
    const { dealId, variantId } = req.params as { dealId: string; variantId: string };
    return guarded(req, reply, () => renameVariant(dealId, variantId, ((req.body ?? {}) as { name?: unknown }).name));
  });

  app.delete("/api/deals/:dealId/variants/:variantId", async (req, reply) => {
    const { dealId, variantId } = req.params as { dealId: string; variantId: string };
    return guarded(req, reply, () => deleteVariant(dealId, variantId));
  });
}
