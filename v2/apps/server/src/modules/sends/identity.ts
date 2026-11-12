// What makes two states of an offer "the same offer" (ADR 023, decision C, owner 2026-11-11):
// same offer number, same Ansprechpartner, same content. Used when an offer that was already
// sent is saved or sent again: unchanged → fine (e.g. e-mail first, post a few days later);
// changed → refused with "Neue Version".
//
// The content hash is deliberately tolerant of representation noise (a reopened offer is
// rebuilt from the form): key order, empty values and workflow sections do not count.
import { createHash } from "node:crypto";

/** sections that describe the sending workflow, not the offer */
const WORKFLOW_KEYS = new Set([
  "mail", "post", "zusammenfassung", "docSelection", "pricing", "forceRecompute",
  "bitrixDealId", "bitrixContactId", "dealId", "contactId", "auftragId", "offerNumber", "activeOffer", "offerType",
]);
/** compared on their own, so the message can name them */
const AP_KEYS = new Set(["ansprechpartner", "emc2_contact"]);

function clean(v: unknown, top: boolean, inKundendaten = false): unknown {
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
      if (top && WORKFLOW_KEYS.has(k)) continue;
      if (inKundendaten && AP_KEYS.has(k)) continue;
      const c = clean((v as Record<string, unknown>)[k], false, top && k === "Kundendaten");
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

export interface OfferIdentity { offerNumber: string; ansprechpartner: string; customer: string; contentHash: string }

export function offerIdentity(payload: any, offerNumber = ""): OfferIdentity {
  const k = payload?.Kundendaten ?? {};
  const content = JSON.stringify(clean(payload ?? {}, true) ?? {});
  return {
    offerNumber: String(payload?.offerNumber || offerNumber || "").trim(),
    ansprechpartner: String(k.ansprechpartner || k.emc2_contact || "").trim().toLowerCase(),
    customer: [k.firstName, k.lastName].map((x: unknown) => String(x || "").trim()).filter(Boolean).join(" "),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

/** German labels of what differs between the sent offer and the current one ([] = same offer). */
export function identityDifferences(sent: OfferIdentity | null | undefined, now: OfferIdentity): string[] {
  if (!sent) return [];
  const d: string[] = [];
  if (sent.offerNumber && now.offerNumber && sent.offerNumber !== now.offerNumber) d.push("Angebotsnummer");
  if (sent.ansprechpartner && now.ansprechpartner && sent.ansprechpartner !== now.ansprechpartner) d.push("Ansprechpartner");
  if (sent.contentHash !== now.contentHash) d.push("Inhalt (Positionen, Preise oder Kundendaten)");
  return d;
}
