// Offer-type resolution — reproduces the CURRENT app exactly. The legacy code has three
// different resolvers that disagree on edge cases (case, nesting, fallback keys). They are
// kept separate on purpose (parity first); consolidating them is a future ADR, not a refactor.

export const OFFER_TYPES = ["bu", "bwt", "hl", "bl", "ah", "hms", "wd"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

type Loose = Record<string, unknown> | null | undefined;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Pricing engine view — `src/logic/pricing-core.js` getActiveOffer():
 * only `payload.activeOffer`, exact lowercase match, anything else → "bu".
 */
export function offerTypeForPricing(payload: Loose): OfferType {
  const k = payload?.activeOffer;
  return typeof k === "string" && (OFFER_TYPES as readonly string[]).includes(k) ? (k as OfferType) : "bu";
}

/**
 * Client-priced shell check — `pricing-core.js` computePrices(): lower-cased
 * `activeOffer || currentOfferKey || offerType`; true for ah/hms/wd (server returns an empty shell).
 */
export function isClientPricedOffer(payload: Loose): boolean {
  const raw = payload?.activeOffer || payload?.currentOfferKey || payload?.offerType || "";
  const k = String(raw).toLowerCase();
  return k === "ah" || k === "hms" || k === "wd";
}

/**
 * Document template view — `src/routes/docx-template.js` getAngebotTemplatePath():
 * first truthy of `activeOffer || currentOfferKey || offerType` on body, body.payload,
 * body.pricePreview; default "bu". Returns the raw value (not validated, case preserved),
 * because the template switch compares it verbatim.
 */
export function offerTypeForDocuments(body: Loose): string {
  const find = (src: unknown): unknown =>
    isObj(src) ? src.activeOffer || src.currentOfferKey || src.offerType || null : null;
  const v = find(body) || find(body?.payload) || find(body?.pricePreview) || "bu";
  return String(v);
}

export type Payer = "KK" | "SZ" | "";

/**
 * Payer as the labour-rate logic sees it — `pricing-core.js` computeServiceCosts():
 * only the exact strings "Kassenkunde" / "Selbstzahler" at `services.payer` count.
 */
export function payerForLabourRate(services: Loose): Payer {
  const p = services?.payer;
  return p === "Kassenkunde" ? "KK" : p === "Selbstzahler" ? "SZ" : "";
}

/**
 * Kassenkunde check used to pick the BU-KK template — `docx-template.js`:
 * upper-cased `services.payer || Kundendaten.payer` equals "KK" or "KASSENKUNDE".
 */
export function isKassenkundeForDocuments(body: Loose): boolean {
  const services = isObj(body?.services) ? body.services : undefined;
  const kd = isObj(body?.Kundendaten) ? body.Kundendaten : undefined;
  const norm = String(services?.payer || kd?.payer || "").toUpperCase();
  return norm === "KK" || norm === "KASSENKUNDE";
}
