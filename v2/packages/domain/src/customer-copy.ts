// A new offer of another type for the same customer — ONE rule for both ways (ADR 027 B, ADR 030):
//  - „Weiteres Angebot“: a NEW Bitrix deal (server: deal-drafts/second-offer.ts)
//  - „Angebotsart wechseln“: a new variant of the SAME deal (server: deal-drafts/type-switch.ts)
// The two differ only in the deal number they are given; a test runs both on the same source.
//
// What it is: a new empty offer of the target type + the source's Kundendaten applied by the
// „Kunde suchen“ rule (restoreChanges: a customer field the target type does not have is not
// stored; payer, living situation, invoice copy … follow as when chosen) + the date today and the
// contact person as for any new offer (newOfferPatch) + the deal number in all three places an
// offer carries it. Nothing else of the source: no products, prices, discounts, Arbeitszeit,
// offer number, send status, mail text, other steps.
import { applyChanges, dealNumberTop, restoreChanges } from "./customer-data.js";
import { newOfferPatch } from "./new-offer.js";
import { emptyOffer, type NewOfferType } from "./offer.js";

export interface CustomerCopyInput {
  offerType: NewOfferType;
  /** the source offer's Kundendaten (not changed) */
  sourceKundendaten: Record<string, unknown>;
  /** the deal the new offer belongs to (a new deal, or the same deal for a type switch) */
  dealId: string;
  /** YYYY-MM-DD (Berlin) */
  today: string;
  /** the contact person's fields (`ansprechpartner`, `emc2_contact`) when known */
  contact?: Record<string, unknown> | undefined;
  /** the business-settings snapshot a NEW offer carries */
  pricingRules?: Record<string, unknown> | undefined;
}

export function offerWithCustomerData(a: CustomerCopyInput): Record<string, unknown> {
  let o = emptyOffer(a.offerType, { date: a.today, ...(a.pricingRules ? { pricingRules: a.pricingRules } : {}) }) as Record<string, any>;
  o = applyChanges(o, restoreChanges(o, structuredClone(a.sourceKundendaten), a.offerType));
  // date and contact person as for any new offer (the Kundendaten part of newOfferPatch; a new offer is not sent anyway)
  o = applyChanges(o, { Kundendaten: newOfferPatch(a.today, a.contact ?? {}).Kundendaten });
  return { ...o, ...dealNumberTop(o, a.dealId) };
}
