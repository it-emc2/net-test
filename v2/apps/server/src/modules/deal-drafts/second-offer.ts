// A second offer type for the same customer (ADR 027 B, step 1: server). From an open offer of one
// type the user starts an offer of ANOTHER type: a NEW Bitrix deal in „Neue Anfragen“ (settings:
// pipeline / stage) and a draft under it with the customer data copied by the „Kunde suchen“ rule
// (@oc/domain restoreChanges). The two deals are independent afterwards; each draft keeps a small
// `related` record of the other (outside the payload).
//
// Exactly once per `creationId` (client-generated). A claim document `second_offer_creations`
// {_id: creationId} — the `_id` makes the claim atomic without an index migration — goes through:
//   creating → (Bitrix create) → finishing → done
//   creating → failed      a definite refusal (Bitrix answered with an error, not configured, no
//                          contact): nothing was created, the same id may be tried again
//   creating → unclear     the outcome is unknown (timeout, connection lost after sending, an answer
//                          without id): NO automatic retry; a repeat answers SECOND_OFFER_UNCLEAR until
//                          it asks with `checkBitrix: true` — then the deal made by this creation id is
//                          looked up first (originatorId/originId of the deal) and only created when none
//   finishing → deal-created  the deal exists but the draft write failed: a repeat finishes the draft,
//                          never creates another deal
// Bitrix calls per creation: at most one read (the contact, only when the offer does not name it),
// one create, ONE batch for the two timeline notes (their failure does not fail the creation).
import mongoose from "mongoose";
import { ERROR_AREAS, ERROR_CODES, FIRST_VARIANT_ID, type ErrorCode, type SecondOfferResponse } from "@oc/api-contract";
import { applyChanges, dealNumberTop, emptyOffer, isNewOfferType, newOfferPatch, restoreChanges, type NewOfferType } from "@oc/domain";
import type { SecondOfferSettings } from "@oc/config";
import type { FastifyRequest } from "fastify";
import { BitrixError } from "../../integrations/bitrix.js";
import { DealCreateNoIdError, type DealWrites } from "../../integrations/bitrix-deal.js";
import { reportError } from "../../platform/error-events.js";
import { DealDraft, getDealDraft, liveVariants, publicVariantId, saveDealDraft, TEMP_KEY, variantFilter } from "./store.js";
import { berlinToday, listVariants } from "./variants.js";

/** the external source the new deal carries (`originatorId`); `originId` is the creation id */
export const SECOND_OFFER_ORIGINATOR = "oc-second-offer";
/** a claim that is busy longer than this was cut off (crash, restart) */
export const SECOND_OFFER_STALE_MS = 10 * 60 * 1000;
export const OFFER_TYPE_LABELS: Record<NewOfferType, string> = { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", bl: "Barrierefreies Leben", ah: "Alltagshilfe" };

export interface SecondOfferDeps {
  deals: Pick<DealWrites, "createDeal" | "findDealByOrigin" | "addTimelineComments" | "getDealContactId">;
  bitrixConfigured: () => boolean;
  settings: SecondOfferSettings;
  /** the new offer's contact person: the signed-in user (as a new variant) */
  resolveContact?: ((kd: Record<string, unknown>, user: { email?: string } | undefined) => Promise<Record<string, unknown>>) | undefined;
  /** the business-settings snapshot a NEW offer carries (`pricingRules`, as the web's pricingRulesOf) */
  pricingRules?: (() => Record<string, unknown>) | undefined;
}

type State = "creating" | "checking" | "finishing" | "deal-created" | "failed" | "unclear" | "done";
interface Claim {
  _id: string; sourceDealId: string; sourceVariantId: string; offerType: string; sourceOfferType: string; by: string;
  state: State; startedAt: Date; updatedAt: Date; newDealId?: string; contactId?: number; code?: string;
  comments?: "ok" | "failed"; result?: SecondOfferResponse;
}
const claims = () => mongoose.connection.collection<Claim>("second_offer_creations");

export class SecondOfferError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string, readonly extra: Record<string, unknown> = {}, readonly severity: "error" | "warn" = "warn") { super(message); }
}

const M = {
  sameType: "Für dieselbe Angebotsart legen Sie bitte eine Variante an. Ein weiteres Angebot ist nur für eine andere Angebotsart möglich.",
  typeInvalid: "Unbekannte Angebotsart.",
  temp: "Das Angebot hat noch keine Deal-Nummer. Bitte speichern Sie es zuerst unter einem Bitrix-Auftrag.",
  noContact: "Zu diesem Auftrag ist in Bitrix kein Kontakt hinterlegt. Bitte verknüpfen Sie zuerst einen Kontakt mit dem Deal.",
  noDraft: "Für diesen Auftrag gibt es noch keinen Entwurf.",
  noVariant: "Diese Variante gibt es nicht (mehr).",
  notConfigured: "Bitrix ist auf diesem Server nicht eingerichtet. Es wurde kein neuer Auftrag angelegt. Bitte wenden Sie sich an den Administrator.",
  unreachable: "Bitrix ist gerade nicht erreichbar. Es wurde kein neuer Auftrag angelegt. Bitte versuchen Sie es später erneut.",
  refused: "Bitrix hat das Anlegen des Auftrags abgelehnt. Es wurde kein neuer Auftrag angelegt. Bitte versuchen Sie es erneut oder wenden Sie sich an den Administrator.",
  unclear: "Es ist unklar, ob Bitrix den neuen Auftrag angelegt hat. Bitte prüfen Sie in Bitrix unter „Neue Anfragen“, ob der Auftrag existiert, bevor Sie es erneut versuchen.",
  draftFailed: (id: string) => `Der Auftrag ${id} wurde in Bitrix angelegt, das Angebot dazu konnte aber nicht gespeichert werden. Bitte versuchen Sie es erneut – es wird kein weiterer Auftrag angelegt.`,
  running: "Das weitere Angebot wird gerade angelegt. Bitte warten Sie einen Moment.",
  mismatch: "Diese Anfrage-Kennung wurde bereits für ein anderes Angebot verwendet. Bitte laden Sie die Seite neu.",
};
const err = (code: ErrorCode, status: number, message: string, extra: Record<string, unknown> = {}, severity: "error" | "warn" = "warn") =>
  new SecondOfferError(code, status, message, extra, severity);

/** "<Nachname>, <Vorname>" of the customer for the text field the title rule reads („von …“) — assumption, one place */
export function customerNameText(kd: Record<string, unknown>): string {
  const last = String(kd.lastName ?? "").trim(), first = String(kd.firstName ?? "").trim();
  return [last, first].filter(Boolean).join(", ");
}

/** the create request's fields for one target type (pure; the test pins it per type) */
export function newDealOf(s: SecondOfferSettings, a: { offerType: NewOfferType; contactId: number; creationId: string; kundendaten: Record<string, unknown> }) {
  const v = s.values, t = v.byType[a.offerType];
  if (!t) throw new Error(`no deal values for offer type ${a.offerType}`);
  const name = customerNameText(a.kundendaten);
  return {
    categoryId: s.categoryId, stageId: s.stageId, title: s.title, sourceId: s.sourceId, contactId: a.contactId,
    originatorId: SECOND_OFFER_ORIGINATOR, originId: a.creationId,
    ufFields: {
      [v.fields.kategorieNeu]: [...t.kategorieNeu], [v.fields.taetigkeiten]: [...t.taetigkeiten], [v.fields.zugehoerigkeit]: v.zugehoerigkeit,
      ...(name ? { [v.fields.vonText]: name } : {}),
    },
  };
}

/**
 * The payload of the new offer: a new empty offer of the target type, the customer data of the
 * source applied by the „Kunde suchen“ rule, date today (Berlin) and the contact person as for a
 * new offer, and the new deal number in all three places an offer carries it.
 */
export function secondOfferPayload(a: { offerType: NewOfferType; sourceKundendaten: Record<string, unknown>; newDealId: string; today: string; contact?: Record<string, unknown>; pricingRules?: Record<string, unknown> | undefined }) {
  let o = emptyOffer(a.offerType, { date: a.today, ...(a.pricingRules ? { pricingRules: a.pricingRules } : {}) }) as Record<string, any>;
  o = applyChanges(o, restoreChanges(o, structuredClone(a.sourceKundendaten), a.offerType));
  // date and contact person as for any new offer (the Kundendaten part of newOfferPatch; a new offer is not sent anyway)
  o = applyChanges(o, { Kundendaten: newOfferPatch(a.today, a.contact ?? {}).Kundendaten });
  return { ...o, ...dealNumberTop(o, a.newDealId) } as Record<string, unknown>;
}

/** what kind of failure a create call ended with: definite (nothing created) or unknown */
export function createOutcome(e: unknown): "definite" | "unknown" {
  if (e instanceof DealCreateNoIdError) return "unknown";
  if (!(e instanceof BitrixError)) return "unknown";
  if (e.kind === "refused" || e.kind === "rate-limit" || e.kind === "not-configured") return "definite";
  if (e.kind === "unreachable") {
    // the request never left (no connection): definite; a connection lost after sending: unknown
    const code = String((e.cause as any)?.cause?.code ?? (e.cause as any)?.code ?? "");
    return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(code) ? "definite" : "unknown";
  }
  return "unknown"; // timeout, malformed answer
}
const bitrixFailure = (e: unknown) => {
  const b = e instanceof BitrixError ? e : null;
  return b?.kind === "not-configured" ? M.notConfigured : b?.kind === "refused" || b?.kind === "rate-limit" ? M.refused : M.unreachable;
};
const upstreamOf = (method: string, e: unknown) => {
  const b = e instanceof BitrixError ? e : null;
  return { method, httpStatus: b?.status ?? null, errorCode: b?.bitrixCode ?? null, attempts: b?.attempts ?? 1 };
};

// ---------------- relations ----------------
export interface StoredRelation { dealId: string; offerType: string; role: "created" | "source"; createdAt: Date; creationId: string }
/** adds the relation once (per creation id) to one draft document */
async function addRelation(filter: Record<string, unknown>, r: StoredRelation) {
  await DealDraft.updateOne({ ...filter, "related.creationId": { $ne: r.creationId } }, { $push: { related: r } } as any, { timestamps: false });
}
/** the relations of a deal: of all its drafts (also deleted variants — a relation is a fact of the deal), one per creation id */
export async function relationsOf(dealId: string): Promise<StoredRelation[]> {
  const docs: any[] = await DealDraft.find({ dealId, "related.0": { $exists: true } }, { related: 1 }).lean();
  const seen = new Map<string, StoredRelation>();
  for (const d of docs) for (const r of d.related ?? []) if (r?.creationId && !seen.has(r.creationId)) {
    seen.set(r.creationId, { dealId: String(r.dealId), offerType: String(r.offerType), role: r.role, createdAt: r.createdAt, creationId: String(r.creationId) });
  }
  return [...seen.values()].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}
/** the relations with the other deal's status (signed > sent > draft; null without a draft) */
export async function relatedOf(dealId: string) {
  const rel = await relationsOf(dealId);
  const out = [];
  for (const r of rel) {
    const vs = (await listVariants(r.dealId)).variants;
    const status = !vs.length ? null : vs.some((v) => v.status === "signed") ? "signed" : vs.some((v) => v.status === "sent") ? "sent" : vs.every((v) => v.status === "not-chosen") ? "not-chosen" : "draft";
    out.push({ ...r, status });
  }
  return { dealId, related: out };
}

// ---------------- the creation ----------------
export interface SecondOfferInput { dealId: string; offerType: unknown; creationId: string; variantId?: string | undefined; checkBitrix?: boolean | undefined; by: string; user?: { email?: string } | undefined }

export function secondOffer(deps: SecondOfferDeps) {
  const report = (req: FastifyRequest | null, r: { code: ErrorCode; message: string; dealId: string; severity?: "error" | "warn"; upstream?: { method?: string; httpStatus?: number | null; errorCode?: string | null; attempts?: number } }) => {
    if (req) reportError(req, { area: ERROR_AREAS.secondOffer, ...r });
  };

  /** moves the claim from one state to another; false when someone else moved it first */
  const move = async (id: string, from: State | State[], set: Partial<Claim>) =>
    !!(await claims().findOneAndUpdate({ _id: id, state: { $in: Array.isArray(from) ? from : [from] } }, { $set: { ...set, updatedAt: new Date() } }));

  async function create(input: SecondOfferInput, req: FastifyRequest | null = null): Promise<SecondOfferResponse> {
    const { dealId, creationId } = input;
    if (TEMP_KEY.test(dealId)) throw err(ERROR_CODES.SECOND_OFFER_TEMP_DEAL, 409, M.temp);
    if (!isNewOfferType(input.offerType)) throw err(ERROR_CODES.SECOND_OFFER_TYPE_INVALID, 400, M.typeInvalid);
    const offerType = input.offerType;

    // ---- an earlier request with this creation id ----
    let claim = await claims().findOne({ _id: creationId });
    if (claim) {
      if (claim.sourceDealId !== dealId || claim.offerType !== offerType) throw err(ERROR_CODES.SECOND_OFFER_ID_MISMATCH, 409, M.mismatch);
      return resume(claim, input, req);
    }

    // ---- a new creation: check, then claim ----
    const variants = await liveVariants(dealId);
    if (!variants.length) throw err(ERROR_CODES.SECOND_OFFER_SOURCE_MISSING, 404, M.noDraft);
    if (input.variantId && !variants.some((v) => publicVariantId(v) === input.variantId)) throw err(ERROR_CODES.SECOND_OFFER_SOURCE_MISSING, 404, M.noVariant);
    const src: any = await getDealDraft(dealId, input.variantId);
    if (!src) throw err(ERROR_CODES.SECOND_OFFER_SOURCE_MISSING, 404, M.noDraft);
    if (src.offerType === offerType) throw err(ERROR_CODES.SECOND_OFFER_SAME_TYPE, 409, M.sameType);
    if (!deps.bitrixConfigured()) throw err(ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, 503, M.notConfigured, {}, "error");
    const now = new Date();
    const fresh: Claim = {
      _id: creationId, sourceDealId: dealId, sourceVariantId: publicVariantId(src), offerType, sourceOfferType: src.offerType, by: input.by,
      state: "creating", startedAt: now, updatedAt: now,
    };
    try { await claims().insertOne(fresh); } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e;
      claim = await claims().findOne({ _id: creationId });
      if (!claim || claim.sourceDealId !== dealId || claim.offerType !== offerType) throw err(ERROR_CODES.SECOND_OFFER_ID_MISMATCH, 409, M.mismatch);
      return resume(claim, input, req);
    }
    return runCreate(fresh, src, input, req);
  }

  /** a repeat with the same creation id */
  async function resume(claim: Claim, input: SecondOfferInput, req: FastifyRequest | null): Promise<SecondOfferResponse> {
    const busy = (s: State) => s === "creating" || s === "checking" || s === "finishing";
    const stale = Date.now() - new Date(claim.updatedAt ?? claim.startedAt).getTime() > SECOND_OFFER_STALE_MS;
    if (claim.state === "done" && claim.result) return { ...claim.result, repeated: true };
    if (busy(claim.state) && !stale) throw err(ERROR_CODES.SECOND_OFFER_RUNNING, 409, M.running);
    if (busy(claim.state) && stale) {
      // cut off: a create may have gone out (creating/checking → unclear); a finishing run had the deal (→ deal-created)
      const to: State = claim.state === "finishing" ? "deal-created" : "unclear";
      await move(claim._id, claim.state, { state: to });
      claim = { ...claim, state: to };
    }
    if (claim.state === "deal-created") {
      if (!(await move(claim._id, "deal-created", { state: "finishing" }))) throw err(ERROR_CODES.SECOND_OFFER_RUNNING, 409, M.running);
      return finish(claim, Number(claim.newDealId), input, req);
    }
    if (claim.state === "failed") {
      const src: any = await getDealDraft(claim.sourceDealId, claim.sourceVariantId);
      if (!src) throw err(ERROR_CODES.SECOND_OFFER_SOURCE_MISSING, 404, M.noDraft);
      if (src.offerType === claim.offerType) throw err(ERROR_CODES.SECOND_OFFER_SAME_TYPE, 409, M.sameType);
      if (!deps.bitrixConfigured()) throw err(ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, 503, M.notConfigured, {}, "error");
      if (!(await move(claim._id, "failed", { state: "creating", startedAt: new Date() }))) throw err(ERROR_CODES.SECOND_OFFER_RUNNING, 409, M.running);
      return runCreate({ ...claim, state: "creating" }, src, input, req);
    }
    // unclear: only an explicit check, never a blind retry
    if (!input.checkBitrix) throw err(ERROR_CODES.SECOND_OFFER_UNCLEAR, 409, M.unclear, { creationId: claim._id });
    if (!deps.bitrixConfigured()) throw err(ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, 503, M.notConfigured, {}, "error");
    if (!(await move(claim._id, "unclear", { state: "checking" }))) throw err(ERROR_CODES.SECOND_OFFER_RUNNING, 409, M.running);
    let found: number | null;
    try { found = await deps.deals.findDealByOrigin(SECOND_OFFER_ORIGINATOR, claim._id); } catch (e) {
      await move(claim._id, "checking", { state: "unclear" });
      report(req, { code: ERROR_CODES.SECOND_OFFER_UNCLEAR, message: "lookup of an unclear creation failed", dealId: claim.sourceDealId, upstream: upstreamOf("crm.item.list", e) });
      throw err(ERROR_CODES.SECOND_OFFER_UNCLEAR, 503, M.unclear, { creationId: claim._id });
    }
    if (found) {
      await move(claim._id, "checking", { state: "finishing", newDealId: String(found) });
      return finish({ ...claim, newDealId: String(found) }, found, input, req);
    }
    // not in Bitrix: the earlier call did not create it — create now
    const src: any = await getDealDraft(claim.sourceDealId, claim.sourceVariantId);
    if (!src) { await move(claim._id, "checking", { state: "failed" }); throw err(ERROR_CODES.SECOND_OFFER_SOURCE_MISSING, 404, M.noDraft); }
    await move(claim._id, "checking", { state: "creating", startedAt: new Date() });
    return runCreate({ ...claim, state: "creating" }, src, input, req);
  }

  /** the claim is ours ("creating"): contact → create → finish */
  async function runCreate(claim: Claim, src: any, input: SecondOfferInput, req: FastifyRequest | null): Promise<SecondOfferResponse> {
    const dealId = claim.sourceDealId;
    const kd = (src.payload?.Kundendaten ?? {}) as Record<string, unknown>;
    // 1) the contact: the offer's, else the first deal's (one read)
    let contactId = Number(String(kd.bitrixContactId ?? "").trim());
    if (!(Number.isInteger(contactId) && contactId > 0)) {
      try { contactId = Number(await deps.deals.getDealContactId(dealId)) || 0; } catch (e) {
        await move(claim._id, "creating", { state: "failed", code: ERROR_CODES.SECOND_OFFER_BITRIX_FAILED });
        report(req, { code: ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, message: "contact read failed", dealId, upstream: upstreamOf("crm.deal.get", e) });
        throw err(ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, 503, bitrixFailure(e));
      }
    }
    if (!(contactId > 0)) {
      await move(claim._id, "creating", { state: "failed", code: ERROR_CODES.SECOND_OFFER_NO_CONTACT });
      throw err(ERROR_CODES.SECOND_OFFER_NO_CONTACT, 409, M.noContact);
    }
    // 2) the deal
    let newId: number;
    try {
      newId = await deps.deals.createDeal(newDealOf(deps.settings, { offerType: claim.offerType as NewOfferType, contactId, creationId: claim._id, kundendaten: kd }));
    } catch (e) {
      if (createOutcome(e) === "definite") {
        await move(claim._id, "creating", { state: "failed", contactId, code: ERROR_CODES.SECOND_OFFER_BITRIX_FAILED });
        report(req, { code: ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, severity: "error", message: "deal create refused", dealId, upstream: upstreamOf("crm.item.add", e) });
        throw err(ERROR_CODES.SECOND_OFFER_BITRIX_FAILED, 502, bitrixFailure(e), {}, "error");
      }
      await move(claim._id, "creating", { state: "unclear", contactId, code: ERROR_CODES.SECOND_OFFER_UNCLEAR });
      report(req, { code: ERROR_CODES.SECOND_OFFER_UNCLEAR, severity: "error", message: `deal create outcome unknown (creation ${claim._id})`, dealId, upstream: upstreamOf("crm.item.add", e) });
      throw err(ERROR_CODES.SECOND_OFFER_UNCLEAR, 502, M.unclear, { creationId: claim._id }, "error");
    }
    await move(claim._id, "creating", { state: "finishing", newDealId: String(newId), contactId });
    return finish({ ...claim, newDealId: String(newId), contactId }, newId, input, req);
  }

  /** the claim is ours ("finishing") and the deal exists: draft, relations, notes, done */
  async function finish(claim: Claim, newId: number, input: SecondOfferInput, req: FastifyRequest | null): Promise<SecondOfferResponse> {
    const newDeal = String(newId);
    const offerType = claim.offerType as NewOfferType;
    const createdAt = claim.startedAt ?? new Date();
    let revision: number;
    try {
      const existing: any = await getDealDraft(newDeal, FIRST_VARIANT_ID);
      if (existing) revision = existing.revision; // an earlier run wrote it, the claim update was lost
      else {
        // the source as it is now — also a variant deleted in the meantime (its data is kept)
        const src: any = await DealDraft.findOne(variantFilter(claim.sourceDealId, claim.sourceVariantId)).lean();
        const kd = (src?.payload?.Kundendaten ?? {}) as Record<string, unknown>;
        let contact: Record<string, unknown> = {};
        if (deps.resolveContact) {
          try {
            const r = await deps.resolveContact(kd, input.user);
            contact = { ansprechpartner: r.ansprechpartner, emc2_contact: r.emc2_contact };
            for (const k of Object.keys(contact)) if (contact[k] === undefined) delete contact[k];
          } catch { /* the contact person stays as copied */ }
        }
        const payload = secondOfferPayload({ offerType, sourceKundendaten: kd, newDealId: newDeal, today: berlinToday(), contact, pricingRules: deps.pricingRules?.() });
        const res = await saveDealDraft({
          dealId: newDeal, variantId: FIRST_VARIANT_ID, offerType, payload, baseRevision: 0, by: input.by, kind: "import",
          note: `Weiteres Angebot (${OFFER_TYPE_LABELS[offerType]}) aus Auftrag ${claim.sourceDealId}`,
        });
        revision = res.revision;
      }
      await addRelation(variantFilter(newDeal, FIRST_VARIANT_ID), { dealId: claim.sourceDealId, offerType: claim.sourceOfferType, role: "source", createdAt, creationId: claim._id });
      await addRelation(variantFilter(claim.sourceDealId, claim.sourceVariantId), { dealId: newDeal, offerType, role: "created", createdAt, creationId: claim._id });
    } catch (e) {
      await move(claim._id, "finishing", { state: "deal-created" });
      report(req, { code: ERROR_CODES.SECOND_OFFER_DRAFT_FAILED, severity: "error", message: `draft of the new deal not written: ${(e as Error)?.name ?? "error"}`, dealId: claim.sourceDealId });
      throw err(ERROR_CODES.SECOND_OFFER_DRAFT_FAILED, 500, M.draftFailed(newDeal), { newDealId: newDeal, creationId: claim._id }, "error");
    }
    // the two timeline notes: one batch, once; a failure is recorded, never fails the creation
    let comments = claim.comments;
    if (!comments) {
      const label = OFFER_TYPE_LABELS[offerType];
      try {
        const r = await deps.deals.addTimelineComments([
          { dealId: newId, comment: `Angelegt aus OC als weiteres Angebot (${label}) zum Auftrag ${claim.sourceDealId}` },
          { dealId: Number(claim.sourceDealId), comment: `Weiteres Angebot (${label}) angelegt: Auftrag ${newDeal}` },
        ]);
        comments = Object.keys(r.result_error).length ? "failed" : "ok";
        if (comments === "failed") report(req, { code: ERROR_CODES.SECOND_OFFER_COMMENT_FAILED, severity: "warn", message: `timeline note failed (${Object.keys(r.result_error).join(",")})`, dealId: claim.sourceDealId, upstream: { method: "batch", errorCode: Object.values(r.result_error)[0]?.error ?? null } });
      } catch (e) {
        comments = "failed";
        report(req, { code: ERROR_CODES.SECOND_OFFER_COMMENT_FAILED, severity: "warn", message: "timeline notes failed", dealId: claim.sourceDealId, upstream: upstreamOf("batch", e) });
      }
      await claims().updateOne({ _id: claim._id }, { $set: { comments } }); // never posted twice
      req?.log?.info({ creationId: claim._id, newDealId: newDeal, comments }, "second offer created");
    }
    const result: SecondOfferResponse = {
      ok: true, creationId: claim._id, sourceDealId: claim.sourceDealId, sourceVariantId: claim.sourceVariantId,
      dealId: newDeal, offerType, variantId: FIRST_VARIANT_ID, revision, comments, repeated: false,
    };
    await move(claim._id, "finishing", { state: "done", comments, result });
    return result;
  }

  return { create };
}
export type SecondOffer = ReturnType<typeof secondOffer>;
