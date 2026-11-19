// Variants of a deal's offer (ADR 027 A, step 1: server). A variant is a separate offer under
// the same deal: its own draft and history (store.ts), its own offer number (given at its first
// send, as today), its own sends. Status is derived from the send records and signing requests,
// never stored twice — except "not chosen", which is a decision (set when another variant is
// signed, step 3).
//
// Send records are read through the collection `offer_sends` directly: the sends module imports
// this module (numbers.ts), and the models live there.
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { FIRST_VARIANT_ID, VARIANT_NAME_MAX, type DealVariant } from "@oc/api-contract";
import { variantCopyPayload as variantCopyPayloadOf } from "@oc/domain";
import { EmailLog, PostalSend, SigningRequest } from "../../platform/models.js";
import { DealDraft, defaultOf, liveVariants, publicVariantId, saveDealDraft, storedVariant, touchOpened, variantFilter } from "./store.js";

const str = (v: unknown) => String(v ?? "").trim();
const sends = () => mongoose.connection.collection("offer_sends");

export const newVariantId = () => `v-${randomBytes(6).toString("hex")}`;
export const variantNameOf = (d: any) => str(d.variantName) || (d.variantId ? "Variante" : "Variante 1");
/** a name the user typed: trimmed, 1..60 characters; null when not acceptable */
export const cleanVariantName = (v: unknown): string | null => {
  const s = str(v).replace(/\s+/g, " ");
  return s && s.length <= VARIANT_NAME_MAX ? s : null;
};

export class VariantError extends Error {
  constructor(readonly code: "VARIANT_NOT_FOUND" | "VARIANT_SENT" | "VARIANT_LAST" | "VARIANT_NAME_INVALID" | "VARIANT_TYPE_MISMATCH", readonly status: number, message: string) { super(message); }
}

/**
 * Which variant a send record belongs to: its `variantId` (sends since ADR 027 A); a record
 * without one (older) by its offer number — the variant whose current number it is, else the
 * first variant (before variants every send of a deal was the first variant's).
 */
function ownerOf(send: any, variants: any[]): string {
  if (send.variantId) return send.variantId;
  const byNumber = variants.find((v) => str(v.payload?.offerNumber) && str(v.payload.offerNumber) === str(send.offerNumber));
  return byNumber ? publicVariantId(byNumber) : FIRST_VARIANT_ID;
}

interface Facts { numbers: Set<string>; sends: any[] }
async function factsOf(dealId: string, variants: any[]): Promise<Map<string, Facts>> {
  const rows = await sends().find({ dealId }, { projection: { payload: 0, pricing: 0, result: 0, files: 0, identity: 0 } }).sort({ startedAt: -1 }).toArray();
  const m = new Map<string, Facts>();
  for (const v of variants) {
    const n = str(v.payload?.offerNumber);
    m.set(publicVariantId(v), { numbers: new Set(n ? [n] : []), sends: [] });
  }
  for (const s of rows) {
    const f = m.get(ownerOf(s, variants));
    if (!f) continue;
    f.sends.push(s);
    if (str(s.offerNumber)) f.numbers.add(str(s.offerNumber));
  }
  return m;
}

/** with payloads (the offer number is in the payload) */
async function liveWithNumbers(dealId: string): Promise<any[]> {
  const meta = await liveVariants(dealId);
  const nums: any[] = await DealDraft.find({ dealId, deletedAt: null }, { variantId: 1, "payload.offerNumber": 1 }).lean();
  return meta.map((v) => ({ ...v, payload: { offerNumber: nums.find((n) => String(n._id) === String(v._id))?.payload?.offerNumber } }));
}

function viewOf(v: any, f: Facts, signed: { at: Date } | null, isDefault: boolean, versand: unknown): DealVariant {
  const reached = f.sends.find((s) => s.status === "done" && s.channel !== "bitrix");
  const lastDone = f.sends.find((s) => s.status === "done");
  const signedAt = signed?.at ?? f.sends.find((s) => s.signedAt)?.signedAt ?? null;
  const status: DealVariant["status"] = signedAt ? "signed" : v.notChosenAt ? "not-chosen" : reached || versand ? "sent" : "draft";
  return {
    variantId: publicVariantId(v), name: variantNameOf(v), offerType: v.offerType, offerNumber: str(v.payload?.offerNumber),
    status, sentAt: reached ? reached.finishedAt ?? reached.startedAt : null, sentChannel: reached ? reached.channel : null,
    signedAt, total: typeof lastDone?.total === "number" ? lastDone.total : null,
    revision: v.revision, updatedAt: v.updatedAt, notChosenAt: v.notChosenAt ?? null, isDefault,
  };
}

/** The variants of a deal with their derived status, first variant first. */
export async function listVariants(dealId: string): Promise<{ dealId: string; defaultVariantId: string | null; variants: DealVariant[] }> {
  const variants = await liveWithNumbers(dealId);
  const def = defaultOf(variants);
  const facts = await factsOf(dealId, variants);
  const allNumbers = [...facts.values()].flatMap((f) => [...f.numbers]);
  const completed: any[] = allNumbers.length
    ? await SigningRequest.find({ offerNumber: { $in: allNumbers }, status: "completed" }, { offerNumber: 1, completedAt: 1, updatedAt: 1 }).lean() : [];
  const versand: any[] = await DealDraft.find({ dealId, deletedAt: null }, { "payload.zusammenfassung.versand": 1 }).lean();
  return {
    dealId, defaultVariantId: def ? publicVariantId(def) : null,
    variants: variants.map((v) => {
      const f = facts.get(publicVariantId(v))!;
      const sr = completed.filter((c) => f.numbers.has(str(c.offerNumber))).sort((a, b) => +new Date(b.completedAt ?? b.updatedAt) - +new Date(a.completedAt ?? a.updatedAt))[0];
      const vs = versand.find((x) => String(x._id) === String(v._id))?.payload?.zusammenfassung?.versand;
      return viewOf(v, f, sr ? { at: sr.completedAt ?? sr.updatedAt } : null, v === def, vs);
    }),
  };
}

export async function variantView(dealId: string, variantId: string): Promise<DealVariant> {
  const r = await listVariants(dealId);
  const v = r.variants.find((x) => x.variantId === variantId);
  if (!v) throw new VariantError("VARIANT_NOT_FOUND", 404, "Diese Variante gibt es nicht (mehr).");
  return v;
}

/** "Variante N" for a new variant: N = number of variants ever made + 1, skipping names in use */
async function fallbackName(dealId: string): Promise<string> {
  const all: any[] = await DealDraft.find({ dealId }, { variantId: 1, variantName: 1, deletedAt: 1 }).lean();
  const used = new Set(all.filter((d) => !d.deletedAt).map(variantNameOf));
  let n = all.length + 1;
  while (used.has(`Variante ${n}`)) n++;
  return `Variante ${n}`;
}

/** today in Berlin as YYYY-MM-DD (the offer date, like the web app's todayIso on a German device) */
export const berlinToday = (now = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);

/**
 * A new variant: a copy of `from` (default: the variant opened last) — everything except the
 * offer number and the send status, with the date and contact person set anew (the same rule as
 * "Neue Version", @oc/domain newOfferPatch). It becomes the variant opened last.
 */
export async function createVariant(a: { dealId: string; from?: string; name?: string; by: string; contact?: (kd: Record<string, unknown>) => Promise<Record<string, unknown>> }) {
  const variants = await liveVariants(a.dealId);
  const src = a.from ? variants.find((v) => publicVariantId(v) === a.from) : defaultOf(variants);
  if (!src) throw new VariantError("VARIANT_NOT_FOUND", 404, a.from ? "Diese Variante gibt es nicht (mehr)." : "Für diesen Auftrag gibt es noch keinen Entwurf.");
  let name: string | null = null;
  if (a.name !== undefined && str(a.name) !== "") {
    name = cleanVariantName(a.name);
    if (!name) throw new VariantError("VARIANT_NAME_INVALID", 400, `Bitte geben Sie einen Namen mit höchstens ${VARIANT_NAME_MAX} Zeichen ein.`);
  }
  const full: any = await DealDraft.findOne({ _id: src._id }).lean();
  let contact: Record<string, unknown> = {};
  if (a.contact) {
    try {
      const kd = await a.contact((full.payload?.Kundendaten ?? {}) as Record<string, unknown>);
      contact = { ansprechpartner: kd.ansprechpartner, emc2_contact: kd.emc2_contact };
      for (const k of Object.keys(contact)) if (contact[k] === undefined) delete contact[k];
    } catch { /* the contact stays as copied */ }
  }
  const payload = variantCopyPayloadOf(full.payload, berlinToday(), contact);
  const variantId = newVariantId();
  const res = await saveDealDraft({
    dealId: a.dealId, variantId, offerType: full.offerType, payload, baseRevision: 0, by: a.by, kind: "copy",
    note: `Kopie von „${variantNameOf(full)}“`,
    create: { variantName: name ?? (await fallbackName(a.dealId)), openedAt: new Date(), copiedFrom: { variantId: publicVariantId(full), revision: full.revision } },
  });
  return { dealId: a.dealId, variant: await variantView(a.dealId, variantId), revision: res.revision };
}

export async function renameVariant(dealId: string, variantId: string, name: unknown) {
  const clean = cleanVariantName(name);
  if (!clean) throw new VariantError("VARIANT_NAME_INVALID", 400, `Bitte geben Sie einen Namen mit höchstens ${VARIANT_NAME_MAX} Zeichen ein.`);
  const r = await DealDraft.updateOne({ ...variantFilter(dealId, variantId), deletedAt: null }, { $set: { variantName: clean } }, { timestamps: false });
  if (r.matchedCount !== 1) throw new VariantError("VARIANT_NOT_FOUND", 404, "Diese Variante gibt es nicht (mehr).");
  return { dealId, variant: await variantView(dealId, variantId) };
}

/**
 * Was this variant ever sent? A done send record of it, a legacy log of one of its numbers
 * (EmailLog, a posted PostalSend row) or any signing request for one of its numbers.
 */
export async function variantWasSent(dealId: string, variantId: string): Promise<boolean> {
  const variants = await liveWithNumbers(dealId);
  const f = (await factsOf(dealId, variants)).get(variantId);
  if (!f) return false;
  if (f.sends.some((s) => s.status === "done")) return true;
  const numbers = [...f.numbers];
  if (!numbers.length) return false;
  return !!((await EmailLog.exists({ offerNumber: { $in: numbers } })) ||
    (await PostalSend.exists({ offerNumber: { $in: numbers }, sentAt: { $ne: null } })) ||
    (await SigningRequest.exists({ offerNumber: { $in: numbers } })) ||
    (await sends().findOne({ offerNumber: { $in: numbers }, status: "done" }, { projection: { _id: 1 } })));
}

/** Delete a variant that was never sent (kept hidden, not erased); the only variant stays. */
export async function deleteVariant(dealId: string, variantId: string) {
  const variants = await liveVariants(dealId);
  const v = variants.find((x) => publicVariantId(x) === variantId);
  if (!v) throw new VariantError("VARIANT_NOT_FOUND", 404, "Diese Variante gibt es nicht (mehr).");
  if (variants.length === 1) throw new VariantError("VARIANT_LAST", 409, "Die einzige Variante eines Auftrags kann nicht gelöscht werden.");
  if (await variantWasSent(dealId, variantId)) throw new VariantError("VARIANT_SENT", 409, "Diese Variante wurde bereits versendet und kann nicht gelöscht werden.");
  await DealDraft.updateOne({ _id: v._id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { timestamps: false });
  const def = defaultOf(await liveVariants(dealId));
  return { ok: true as const, dealId, variantId, defaultVariantId: def ? publicVariantId(def) : null };
}

/**
 * After a signature (ADR 027 A, wired in step 3): every other live variant of the deal is marked
 * "not chosen" (kept, not deleted); the signed one is chosen again if it was marked before (a
 * signature on an older variant). Returns the ids that were marked now.
 */
export async function markOthersNotChosen(dealId: string, signedVariantId: string, at = new Date()): Promise<string[]> {
  const variants = await liveVariants(dealId);
  if (!variants.some((v) => publicVariantId(v) === signedVariantId)) throw new VariantError("VARIANT_NOT_FOUND", 404, "Diese Variante gibt es nicht (mehr).");
  const marked: string[] = [];
  for (const v of variants) {
    const id = publicVariantId(v);
    if (id === signedVariantId) {
      if (v.notChosenAt) await DealDraft.updateOne({ _id: v._id }, { $unset: { notChosenAt: "" } }, { timestamps: false });
    } else if (!v.notChosenAt) {
      await DealDraft.updateOne({ _id: v._id, notChosenAt: null }, { $set: { notChosenAt: at } }, { timestamps: false });
      marked.push(id);
    }
  }
  return marked;
}

/**
 * The variant a send belongs to and the key of its 24 h lock row (EmailSend / PostalSend).
 * The variant: the explicit `variantId` of the request (React app, step 2) if it is live; else
 * the variant whose current offer number is the sent one; else the variant opened last; else
 * the first. Lock key: the first variant keeps the plain deal number — exactly the row today's
 * lock and the old app use — every other variant `<deal>#<variantId>`. So the legacy unique
 * index {dealId} stays as it is and keeps doing its job per variant: B after A passes, A again
 * within 24 h is refused.
 */
export async function resolveSendVariant(dealId: string, a: { variantId?: unknown; offerNumber?: unknown }): Promise<{ variantId: string; lockKey: string }> {
  const plain = { variantId: FIRST_VARIANT_ID, lockKey: dealId };
  if (!dealId) return plain;
  const variants = await liveWithNumbers(dealId);
  if (!variants.length) return plain;
  const asked = str(a.variantId);
  const nr = str(a.offerNumber);
  const v = (asked && variants.find((x) => publicVariantId(x) === asked))
    || (nr && variants.find((x) => str(x.payload?.offerNumber) === nr))
    || defaultOf(variants);
  const variantId = v ? publicVariantId(v) : FIRST_VARIANT_ID;
  return { variantId, lockKey: storedVariant(variantId) ? `${dealId}#${variantId}` : dealId };
}

export { touchOpened };
