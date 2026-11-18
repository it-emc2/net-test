// What makes two states of an offer "the same offer" (ADR 023, decision C, owner 2026-11-11):
// same offer number, same Ansprechpartner, same content. Used when an offer that was already
// sent is saved or sent again: unchanged → fine (e.g. e-mail first, post a few days later);
// changed → refused with "Neue Version".
//
// The content hash is deliberately tolerant of representation noise (a reopened offer is
// rebuilt from the form): key order, empty values and workflow sections do not count.
import { createHash } from "node:crypto";

/** sections that describe the sending workflow, not the offer */
// "postal" (the Post tab: address check, own PDFs for the letter) joined this list on 2026-11-17:
// it was meant from the start ("post" never existed as a section) — a PDF added for the letter
// after the offer was mailed made the offer count as changed, and signing or posting was refused.
const WORKFLOW_KEYS = new Set([
  "mail", "post", "postal", "zusammenfassung", "docSelection", "pricing", "forceRecompute",
  "bitrixDealId", "bitrixContactId", "dealId", "contactId", "auftragId", "offerNumber", "activeOffer", "offerType",
]);
/** compared on their own, so the message can name them */
const AP_KEYS = new Set(["ansprechpartner", "emc2_contact"]);

/** the list as it was before "postal" joined it — sends recorded then carry a hash made with it */
const WORKFLOW_KEYS_V1 = new Set([...WORKFLOW_KEYS].filter((k) => k !== "postal"));

function clean(v: unknown, top: boolean, inKundendaten = false, skip: ReadonlySet<string> = WORKFLOW_KEYS): unknown {
  if (v === null || v === undefined || v === "" || v === false) return undefined;
  if (typeof v === "string") { const t = v.trim(); return t === "" ? undefined : t; }
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) {
    const out = v.map((x) => clean(x, false)).filter((x) => x !== undefined);
    return out.length ? out : undefined;
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (top && skip.has(k)) continue;
      if (inKundendaten && AP_KEYS.has(k)) continue;
      const c = clean((v as Record<string, unknown>)[k], false, top && k === "Kundendaten");
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

const hashOf = (payload: unknown, skip: ReadonlySet<string>): string => createHash("sha256").update(JSON.stringify(clean(payload ?? {}, true, false, skip) ?? {})).digest("hex");

export interface OfferIdentity { offerNumber: string; ansprechpartner: string; customer: string; contentHash: string }

export function offerIdentity(payload: any, offerNumber = ""): OfferIdentity {
  const k = payload?.Kundendaten ?? {};
  return {
    offerNumber: String(payload?.offerNumber || offerNumber || "").trim(),
    ansprechpartner: String(k.ansprechpartner || k.emc2_contact || "").trim().toLowerCase(),
    customer: [k.firstName, k.lastName].map((x: unknown) => String(x || "").trim()).filter(Boolean).join(" "),
    contentHash: hashOf(payload, WORKFLOW_KEYS),
  };
}

/** The offers themselves, where the send kept its own: lets a send recorded under older rules be
 *  compared by today's rules instead of by the hash it stored. */
export interface Offers { sent?: unknown; now?: unknown }
/** same content? The stored hash, else the sent offer hashed again by today's rules, else — a send
 *  that kept no offer (a letter) — the open offer hashed by the rules of that time. */
function sameContent(sent: OfferIdentity, now: OfferIdentity, offers: Offers): boolean {
  if (sent.contentHash === now.contentHash) return true;
  if (offers.sent && typeof offers.sent === "object") return hashOf(offers.sent, WORKFLOW_KEYS) === now.contentHash;
  return offers.now !== undefined && hashOf(offers.now, WORKFLOW_KEYS_V1) === sent.contentHash;
}

/**
 * The stored offer with the workflow sections of the request (mail text, recipient, deal): the
 * content is the stored one, how it is sent is today's. The price snapshot of the request is not
 * taken over — it belongs to the offer the form rebuilt.
 */
export function storedContentWith(stored: unknown, request: unknown): Record<string, unknown> {
  const out = structuredClone((stored ?? {}) as Record<string, unknown>);
  const req = (request && typeof request === "object" ? request : {}) as Record<string, unknown>;
  for (const k of WORKFLOW_KEYS) if (k !== "pricing" && k !== "forceRecompute" && k in req) out[k] = structuredClone(req[k]);
  delete out.forceRecompute;
  return out;
}

/** German labels of what differs between the sent offer and the current one ([] = same offer). */
export function identityDifferences(sent: OfferIdentity | null | undefined, now: OfferIdentity, offers: Offers = {}): string[] {
  if (!sent) return [];
  const d: string[] = [];
  if (sent.offerNumber && now.offerNumber && sent.offerNumber !== now.offerNumber) d.push("Angebotsnummer");
  if (sent.ansprechpartner && now.ansprechpartner && sent.ansprechpartner !== now.ansprechpartner) d.push("Ansprechpartner");
  if (!sameContent(sent, now, offers)) d.push("Inhalt (Positionen, Preise oder Kundendaten)");
  return d;
}
