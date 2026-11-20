// Filling Kundendaten from outside: a Bitrix contact (deal or „Kontakt aus Bitrix laden“) or a saved
// customer („Kunde suchen“). Rules of today's UI (script.js), recorded in
// test/fixtures/kundendaten-bitrix.json (v2/scripts/capture-kundendaten-bitrix.cjs):
//
//  - all three paths run today's restoreKundendaten(k) with what they got (fillCustomerForm):
//    a field is set when k has a value for it — also an EMPTY one ("" overwrites what was typed);
//    a field k does not mention stays. company and country are not on the page: not stored.
//  - a choice (Anrede, Zahler …) is set only to a real answer; "" leaves it as it is.
//  - restoreKundendaten also resets things k does not mention (ported as they are, see the report /
//    MODULARIZATION-PLAN): the budget ticks and the co-payment, the invoice copy ("nein"), the
//    Wohnumfeld answer ("Nein", amounts gone; Alltagshilfe: not stored) — recorded; the internal list
//    (initInternalTodos) — read from today's code, not recorded.
//  - what follows the fields elsewhere happens as when they are typed: the payer's consequences
//    (choosePayer), the living situation's (chooseLivingSituation, an explicit landlord answer of k
//    wins), the e-mail recipient (while it follows the e-mail), the letter's recipient (only its
//    EMPTY fields), the Bitrix contact number as customer number.
//  - the deal (Hauptmenü „Bitrix Deal laden“, a NEW offer): the contact as above, the deal number
//    into the offer, and — Badumbau, Badewannentür, Handlauf — the landlord answers of the deal
//    (initVermieterFromDeal), unless the offer's contact is another one.
// restoreChanges and dealNumberTop live in @oc/domain (customer-data.ts): the server uses the same
// rule for a second offer type for the same customer (ADR 027 B).
import type { DealCustomer, DealCustomerResponse } from "@oc/api-contract";
import { dealNumberTop, restoreChanges, sameValue as same, type Changes } from "@oc/domain";
import { chooseLivingSituation } from "./object.js";

export { dealNumberTop, restoreChanges, type Changes };
type Fields = Record<string, unknown>;

/** a contact from Bitrix as today's fillCustomerForm gets it (company/country included — not stored) */
export const contactFields = (c: DealCustomer): Fields => ({ ...c });

/** the landlord answers of the deal (initVermieterFromDeal), for Badumbau, Badewannentür and Handlauf */
export function landlordChanges(type: string, v: DealCustomerResponse["vermieter"], kd: Fields, dealContactId: string | null): Fields {
  if (!["bu", "bwt", "hl"].includes(type)) return {};
  const formContact = String(kd.bitrixContactId ?? "").trim();
  if (formContact && dealContactId && dealContactId !== formContact) return {}; // the offer belongs to another contact
  const out: Fields = {};
  if (v.erforderlich === true) Object.assign(out, chooseLivingSituation("Miete"), { vermieterGenehmigungErforderlich: "Ja" });
  else if (v.erforderlich === false) Object.assign(out, chooseLivingSituation("Eigentum"), { vermieterGenehmigungErforderlich: "Nein" });
  if (v.liegtVor === true) out.vermieterGenehmigung = "Ja";
  if (v.liegtVor === false) out.vermieterGenehmigung = "Nein";
  return out;
}

/** a NEW offer of a deal: nothing about the customer typed yet and no deal number stored */
export function isFreshForDeal(offer: Record<string, any> | null): boolean {
  if (!offer) return false;
  const kd = offer.Kundendaten ?? {};
  return !String(kd.firstName ?? "").trim() && !String(kd.lastName ?? "").trim() && !String(kd.bitrixContactId ?? "").trim() && !String(offer.auftragId ?? "").trim();
}

/** what a deal's customer does to a NEW offer: contact, deal number, landlord answers */
export function dealFill(offer: Record<string, any>, r: DealCustomerResponse, type: string): { sections: Changes; top: Fields } {
  const sections = r.customer ? restoreChanges(offer, contactFields(r.customer), type) : { Kundendaten: {} };
  const kdAfter = { ...(offer.Kundendaten ?? {}), ...sections.Kundendaten };
  const landlord = landlordChanges(type, r.vermieter, kdAfter, r.customer?.bitrixContactId ?? null);
  for (const [f, v] of Object.entries(landlord)) if (!same(v, kdAfter[f]) && !(v === undefined && !(f in kdAfter))) sections.Kundendaten![f] = v;
  const top = dealNumberTop({ ...offer, ...(sections.postal ? { postal: { ...offer.postal, ...sections.postal } } : {}), ...(sections.mail ? { mail: { ...offer.mail, ...sections.mail } } : {}) }, r.dealId);
  delete sections.mail; delete sections.postal; // carried in `top` (whole objects)
  return { sections, top };
}

// ---- „Kunde suchen“ ----
export interface SearchHit { _id?: string; company?: string; firstName?: string; lastName?: string; email?: string; customerNumber?: string; city?: string; kundendaten?: Fields }
/** the two lines of a hit, as today's list shows them */
export function hitLines(c: SearchHit): { main: string; meta: string } {
  return {
    main: [c.company, c.firstName, c.lastName].filter(Boolean).join(" • ") || c.email || c.customerNumber || "",
    meta: [c.customerNumber, c.city].filter(Boolean).join(" • "),
  };
}
/** what fillCustomerForm restores of a customer: its saved Kundendaten page, else the customer itself */
export const savedKundendaten = (c: Fields | null | undefined): Fields =>
  (c?.kundendaten && typeof c.kundendaten === "object" ? (c.kundendaten as Fields) : (c ?? {}));
/** today: the search starts 250 ms after the last key, for any text that is not empty */
export const SEARCH_DELAY_MS = 250;
export const searchable = (q: string) => q.trim().length > 0;
