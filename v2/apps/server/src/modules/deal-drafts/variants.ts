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
import { Draft, EmailLog, Offer, PostalSend, SigningRequest } from "../../platform/models.js";
import { DealDraft, defaultOf, liveVariants, publicVariantId, saveDealDraft, storedVariant, touchOpened, variantFilter } from "./store.js";

/** The Alltagshilfe monthly amount of a stored offer payload (ADR 028: THE AH total function of the documents module).
 *  Passed in at startup (compose.ts) — this module must not import documents (documents → sends → deal-drafts → documents). */
export type AhAmountOf = (payload: unknown, reading: "document" | "screen") => number | null;
let ahAmountOf: AhAmountOf | null = null;
export function setAhAmountOf(f: AhAmountOf | null) { ahAmountOf = f; }

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

/** `zusammenfassung.versand` marks an old offer as sent: an object only when it says how and when
 *  (the web's checkliste rule isSent) — a new offer carries an empty object there; a non-empty text as before */
export const versandSent = (versand: unknown): boolean => {
  if (typeof versand === "string") return versand.trim() !== "";
  const v = versand && typeof versand === "object" ? (versand as Record<string, unknown>) : {};
  return !!(v.art && v.versendetAm);
};

function viewOf(v: any, f: Facts, signed: { at: Date } | null, isDefault: boolean, versand: unknown, storedTotal: number | null = null): DealVariant {
  const reached = f.sends.find((s) => s.status === "done" && s.channel !== "bitrix");
  const lastDone = f.sends.find((s) => s.status === "done");
  const signedAt = signed?.at ?? f.sends.find((s) => s.signedAt)?.signedAt ?? null;
  const status: DealVariant["status"] = signedAt ? "signed" : v.notChosenAt ? "not-chosen" : reached || versandSent(versand) ? "sent" : "draft";
  return {
    variantId: publicVariantId(v), name: variantNameOf(v), offerType: v.offerType, offerNumber: str(v.payload?.offerNumber),
    status, sentAt: reached ? reached.finishedAt ?? reached.startedAt : null, sentChannel: reached ? reached.channel : null,
    signedAt, total: typeof lastDone?.total === "number" ? lastDone.total : storedTotal,
    revision: v.revision, updatedAt: v.updatedAt, notChosenAt: v.notChosenAt ?? null, isDefault,
    numbers: [...f.numbers],
  };
}

/**
 * The total of a handed-over offer: an on-site hand-over (and a mailed signing link) writes a send
 * record WITHOUT `total`, but stores the offer under its number at that moment (`ensureSentOffer`).
 * So the total is read from what is stored — never priced anew: `pricing.total` of the stored
 * offer; Alltagshilfe: the app-facing monthly amount (ADR 028, the figure the Bitrix amount and the
 * send record carry) from THE AH total function on the stored payload, read like the hand-over
 * (the zone reading kept on the record). Nothing stored → null (no total is shown).
 */
async function storedTotalsOf(list: { variantId: string; offerType: string; send: any }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const want = list.filter((x) => str(x.send?.offerNumber));
  if (!want.length) return out;
  const rows: any[] = await Offer.find({ offerNumber: { $in: [...new Set(want.map((x) => str(x.send.offerNumber)))] } }, { offerNumber: 1, "pricing.total": 1, payload: 1 }).lean();
  for (const x of want) {
    const o = rows.find((r) => str(r.offerNumber) === str(x.send.offerNumber));
    if (!o) continue;
    let t: unknown = null;
    if (/^ah/i.test(x.offerType) || /^ah/i.test(str(o.payload?.activeOffer))) {
      const reading = x.send.ahZoneReading === "screen" ? "screen" : "document";
      try { t = ahAmountOf && o.payload && typeof o.payload === "object" ? ahAmountOf(o.payload, reading) : null; } catch { t = null; }
    } else t = o.pricing?.total;
    if (typeof t === "number" && Number.isFinite(t) && t > 0) out.set(x.variantId, t);
  }
  return out;
}

// ---------------- completed signings of a deal, the old app's included (U-069) ----------------
// The old app (src/routes/signing.js) writes only a SigningRequest — no send record, nothing in the
// offer. It files the request on the deal, else on the contact. Read-only here: nothing is written
// to `signingrequests`.

/** a deal number as stored (text or number) */
const dealValues = (dealId: string) => (/^\d+$/.test(dealId) ? [dealId, Number(dealId)] : [dealId]);
/** the deal numbers a signing request names itself: its Bitrix deal and the payload's deal number */
export function dealRefsOf(sr: any): Set<string> {
  const refs = new Set<string>();
  if (str(sr?.bitrixEntityType) === "deal" && str(sr?.bitrixEntityId)) refs.add(str(sr.bitrixEntityId));
  for (const v of [sr?.payloadSnapshot?.auftragId, sr?.payloadSnapshot?.postal?.auftragId]) if (str(v)) refs.add(str(v));
  return refs;
}
/** offer numbers of the documents stored for the deal (offers and legacy drafts by their deal number) */
async function storedNumbersOf(dealId: string): Promise<string[]> {
  const vals = dealValues(dealId);
  const q = { $or: [{ "payload.auftragId": { $in: vals } }, { "payload.postal.auftragId": { $in: vals } }] };
  const [offers, drafts] = await Promise.all([
    Offer.find(q, { offerNumber: 1 }).limit(100).lean(),
    Draft.find({ ...q, offerNumber: { $nin: [null, ""] } }, { offerNumber: 1 }).limit(100).lean(),
  ]);
  return [...offers, ...drafts].map((o: any) => str(o.offerNumber)).filter(Boolean);
}

/**
 * The completed signing requests that count for a deal: filed on the deal, or naming it as the
 * payload's deal number, or — filed on the contact, no deal named — for an offer number of the deal
 * (`numbers`: its variants' numbers; plus the numbers of the offers/drafts stored for the deal). A
 * request that names ANOTHER deal never counts, whatever its number. Oldest completion first.
 */
export async function completedSigningsOf(dealId: string, numbers: string[] = []): Promise<any[]> {
  if (!dealId) return [];
  const nums = [...new Set([...numbers.map(str).filter(Boolean), ...(await storedNumbersOf(dealId))])];
  const vals = dealValues(dealId);
  const rows: any[] = await SigningRequest.find({
    status: "completed",
    $or: [
      { bitrixEntityType: "deal", bitrixEntityId: dealId },
      { "payloadSnapshot.auftragId": { $in: vals } }, { "payloadSnapshot.postal.auftragId": { $in: vals } },
      ...(nums.length ? [{ offerNumber: { $in: nums } }] : []),
    ],
  }, { offerNumber: 1, offerType: 1, completedAt: 1, updatedAt: 1, bitrixEntityType: 1, bitrixEntityId: 1, "payloadSnapshot.auftragId": 1, "payloadSnapshot.postal.auftragId": 1 }).lean();
  const at = (r: any) => +new Date(r.completedAt ?? r.updatedAt ?? 0);
  return rows.filter((r) => { const refs = dealRefsOf(r); return refs.size ? refs.has(dealId) : nums.includes(str(r.offerNumber)); }).sort((a, b) => at(a) - at(b));
}
/** offer types compared loosely ("ah-alt" is an Alltagshilfe offer); unknown on either side → compatible */
const sameType = (a: unknown, b: unknown) => {
  const k = (v: unknown) => str(v).toLowerCase().replace(/-alt$/, "");
  return !k(a) || !k(b) || k(a) === k(b);
};

/** The variants of a deal with their derived status, first variant first. */
export async function listVariants(dealId: string): Promise<{ dealId: string; defaultVariantId: string | null; variants: DealVariant[] }> {
  return (await variantsWithSignings(dealId)).list;
}

/** listVariants, plus the offer number signed in the old app per variant it was attributed to (U-069) */
async function variantsWithSignings(dealId: string): Promise<{ list: { dealId: string; defaultVariantId: string | null; variants: DealVariant[] }; oldAppNumber: Map<string, string> }> {
  const oldAppNumber = new Map<string, string>();
  const variants = await liveWithNumbers(dealId);
  const def = defaultOf(variants);
  const facts = await factsOf(dealId, variants);
  const allNumbers = [...facts.values()].flatMap((f) => [...f.numbers]);
  const completed = await completedSigningsOf(dealId, allNumbers);
  // a completed signing of the deal whose number no variant carries (the old app's, U-069): the
  // deal's only variant — of the same type — is the signed one; with several variants it is not
  // shown on any of them (the deal still counts as signed, dealSignature)
  const unmatched = completed.filter((c) => !allNumbers.includes(str(c.offerNumber)));
  const only = variants.length === 1 ? variants[0] : null;
  const versand: any[] = await DealDraft.find({ dealId, deletedAt: null }, { "payload.zusammenfassung.versand": 1 }).lean();
  const handedOver = await storedTotalsOf(variants.flatMap((v) => {
    const lastDone = facts.get(publicVariantId(v))?.sends.find((s) => s.status === "done");
    return lastDone && typeof lastDone.total !== "number" ? [{ variantId: publicVariantId(v), offerType: str(v.offerType), send: lastDone }] : [];
  }));
  const list = {
    dealId, defaultVariantId: def ? publicVariantId(def) : null,
    variants: variants.map((v) => {
      const f = facts.get(publicVariantId(v))!;
      const own = completed.filter((c) => f.numbers.has(str(c.offerNumber)));
      const old = v === only ? unmatched.filter((c) => sameType(c.offerType, v.offerType)) : [];
      if (old.length && !own.length && !f.sends.some((s) => s.signedAt)) oldAppNumber.set(publicVariantId(v), str(old[0].offerNumber)); // the first signing (oldest first)
      const mine = [...own, ...old];
      const sr = mine.sort((a, b) => +new Date(b.completedAt ?? b.updatedAt) - +new Date(a.completedAt ?? a.updatedAt))[0];
      const vs = versand.find((x) => String(x._id) === String(v._id))?.payload?.zusammenfassung?.versand;
      return viewOf(v, f, sr ? { at: sr.completedAt ?? sr.updatedAt } : null, v === def, vs, handedOver.get(publicVariantId(v)) ?? null);
    }),
  };
  return { list, oldAppNumber };
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
  return numbersWereSent([...f.numbers]);
}

/** Was any of these offer numbers sent? A done send record, a legacy log (EmailLog, a posted PostalSend row) or any signing request. */
export async function numbersWereSent(list: string[]): Promise<boolean> {
  const numbers = list.map(str).filter(Boolean);
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

// ---------------- step 3: the signature decides (ADR 027 A) ----------------

/** a live variant with every offer number it ever carried (current number + its send records) */
export interface VariantNumbers { variantId: string; name: string; numbers: string[]; notChosenAt: Date | null }

/** The live variants of a deal with all their offer numbers, first variant first. */
export async function variantNumbers(dealId: string): Promise<VariantNumbers[]> {
  if (!dealId) return [];
  const variants = await liveWithNumbers(dealId);
  const facts = await factsOf(dealId, variants);
  return variants.map((v) => ({ variantId: publicVariantId(v), name: variantNameOf(v), numbers: [...(facts.get(publicVariantId(v))?.numbers ?? [])], notChosenAt: v.notChosenAt ?? null }));
}

/**
 * The variant a signed offer number belongs to: the send record's `variantId` when it names a
 * live variant, else the variant that carried the number; a deal with ONE variant: that one.
 * null: not to be found (several variants, number unknown) — nothing is marked then.
 */
export function variantOfNumber(all: VariantNumbers[], a: { variantId?: unknown; offerNumber?: unknown }): VariantNumbers | null {
  const asked = str(a.variantId), nr = str(a.offerNumber);
  return (asked && all.find((v) => v.variantId === asked)) || (nr && all.find((v) => v.numbers.includes(nr))) || (all.length === 1 ? all[0]! : null);
}

/**
 * The signature that decides a deal (ADR 027 A, step 3): one document per deal in
 * `deal_variant_choices`, keyed by the deal number itself (`_id`), so the first completion wins
 * atomically without any index migration. Kept for good — a later signature of another variant
 * is a "second signature" and changes nothing of the choice (no "reactivate" by design).
 */
const choices = () => mongoose.connection.collection<{ _id: string; [k: string]: unknown }>("deal_variant_choices");
export interface VariantChoice { dealId: string; variantId: string; offerNumber: string; token: string; at: Date }

/** first: this signature decided the deal (now, or in an earlier run of the same variant) */
export async function claimVariantChoice(dealId: string, c: { variantId: string; offerNumber: string; token: string }, at = new Date()): Promise<{ first: boolean; choice: VariantChoice }> {
  try {
    await choices().insertOne({ _id: dealId, variantId: c.variantId, offerNumber: c.offerNumber, token: c.token, at });
    return { first: true, choice: { dealId, ...c, at } };
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e;
  }
  const cur: any = await choices().findOne({ _id: dealId });
  const choice: VariantChoice = { dealId, variantId: str(cur?.variantId), offerNumber: str(cur?.offerNumber), token: str(cur?.token), at: cur?.at ?? at };
  // the same variant again (a repeated completion, or a newer version of it signed): still the chosen one
  return { first: choice.variantId === c.variantId, choice };
}

/** what was closed when a variant was chosen — read by "Neuen Link anfordern" on such a link */
export async function recordClosedLinks(dealId: string, closed: { token: string; offerNumber: string; variantId: string; signedDocs: number }[]) {
  if (!closed.length) return;
  await choices().updateOne({ _id: dealId }, { $push: { closed: { $each: closed.map((c) => ({ ...c, at: new Date() })) } } } as any);
}
export async function closedByChoice(token: string): Promise<VariantChoice | null> {
  if (!token) return null;
  const cur: any = await choices().findOne({ "closed.token": token } as any);
  return cur ? { dealId: String(cur._id), variantId: str(cur.variantId), offerNumber: str(cur.offerNumber), token: str(cur.token), at: cur.at } : null;
}

/**
 * The signed variant that holds the deal's amount, offer number and link ("signed wins"): the
 * recorded choice; for a deal signed before step 3 (no choice recorded) the variant signed first.
 */
export async function signedVariantOf(dealId: string): Promise<{ variantId: string; offerNumber: string; name: string } | null> {
  if (!dealId) return null;
  const c: any = await choices().findOne({ _id: dealId });
  const { list, oldAppNumber } = await variantsWithSignings(dealId);
  if (c) {
    const v = list.variants.find((x) => x.variantId === str(c.variantId));
    return { variantId: str(c.variantId), offerNumber: str(c.offerNumber), name: v?.name ?? "" };
  }
  const signed = list.variants.filter((v) => v.status === "signed").sort((a, b) => +new Date(a.signedAt ?? 0) - +new Date(b.signedAt ?? 0))[0];
  // signed in the old app under a number the variant does not carry (U-069): that signed number
  return signed ? { variantId: signed.variantId, offerNumber: oldAppNumber.get(signed.variantId) || signed.offerNumber, name: signed.name } : null;
}

/**
 * Is any offer of this deal signed? (owner 2026-11-20: then a send moves the deal no more.)
 * The recorded choice, a signed variant, or a completed signing request that counts for the deal
 * (completedSigningsOf: filed on the deal, naming it as the payload's deal number, or filed on the
 * contact for an offer number of the deal — the old app's signings, U-069), oldest first.
 */
export async function dealSignature(dealId: string): Promise<{ offerNumber: string } | null> {
  if (!dealId) return null;
  const s = await signedVariantOf(dealId);
  if (s) return { offerNumber: s.offerNumber };
  const numbers = (await variantNumbers(dealId)).flatMap((v) => v.numbers);
  const sr = (await completedSigningsOf(dealId, numbers))[0];
  return sr ? { offerNumber: str(sr.offerNumber) } : null;
}

/**
 * "Signed wins": another variant than `variantId` is signed on the deal — then a send of this one
 * must not change the deal's amount, offer number or offer link. A failing read answers null
 * (the send goes on as before).
 */
export async function signedElsewhere(dealId: string, variantId: string): Promise<{ variantId: string; offerNumber: string; name: string } | null> {
  if (!dealId) return null;
  try {
    const s = await signedVariantOf(dealId);
    return s && s.variantId !== (variantId || FIRST_VARIANT_ID) ? s : null;
  } catch { return null; }
}

/** A send of this variant is refused: it was marked "not chosen" and is not itself signed. */
export async function isNotChosen(dealId: string, variantId: string): Promise<boolean> {
  if (!dealId || !variantId) return false;
  const v = (await listVariants(dealId)).variants.find((x) => x.variantId === variantId);
  return v?.status === "not-chosen";
}
export const NOT_CHOSEN_MESSAGE =
  "Diese Variante wurde nicht gewählt – zu diesem Auftrag ist bereits ein anderes Angebot unterschrieben. Sie kann nicht mehr versendet werden. Bitte erstellen Sie bei Bedarf eine neue Variante.";

export { touchOpened };
