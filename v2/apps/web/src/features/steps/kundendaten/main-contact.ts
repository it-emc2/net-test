// The deal's main contact (owner 2026-11-27). A field rep opens an offer from a Bitrix deal whose
// contact is often a family member, not the insured person typed in Kundendaten. When the step is
// left, the user is asked once — „In Bitrix: …“ / „Im Angebot: …“ — and answers:
//  - „Andere Person: Kontakt ist Ansprechpartner“: the Bitrix contact goes into the EMPTY
//    Ansprechpartner fields (typed ones stay); the server makes a contact of the insured person the
//    deal's primary contact (the old one stays linked); its id becomes bitrixContactId / customerNumber
//  - „Nur Schreibweise korrigieren“: the server renames the SAME contact; nothing changes in the offer
//  - „Nicht ändern“: remembered in the offer (`mainContactKept`, top level — not in Kundendaten, so it
//    reaches no document, no price, no customer record and no customer copy) for this contact and this
//    typed name; the question does not come back for them
// Asked only when ALL hold: the offer has a deal number; the deal's customer is loaded (no request of
// its own); the deal's contact is the offer's bitrixContactId (or that is empty); first AND last name
// are typed; and the names differ — compared after trim, case-fold and collapsing spaces, first and
// last name swapped counting as the same.
import { DEAL_NUMBER_RE, type DealCustomer, type DealCustomerResponse, type MainContactPerson } from "@oc/api-contract";

type Fields = Record<string, unknown>;
/** the top-level offer key of „Nicht ändern“ */
export const KEPT = "mainContactKept";
export interface Kept { contactId: string; firstName: string; lastName: string }

export const TEXT = {
  title: "Ist der Bitrix-Kontakt der Kunde?",
  lead: "Der Kontakt im Bitrix-Auftrag hat einen anderen Namen als der Kunde in diesem Angebot.",
  inBitrix: "In Bitrix:",
  inOffer: "Im Angebot:",
  replace: "Andere Person: Kontakt ist Ansprechpartner",
  replaceHint: "Der Kunde wird Hauptkontakt des Auftrags in Bitrix, der bisherige Kontakt bleibt als Ansprechpartner am Auftrag.",
  rename: "Nur Schreibweise korrigieren",
  renameHint: "Der Name des Kontakts in Bitrix wird auf den Namen im Angebot korrigiert.",
  keep: "Nicht ändern",
  running: "Bitrix wird geändert …",
  goOn: "Trotzdem weiter",
  close: "Schließen",
  failed: "Bitrix konnte nicht geändert werden. Sie können trotzdem weitermachen.",
  ambiguous: "Mehrere passende Kontakte in Bitrix – bitte im Büro klären",
  doneReplace: "Der Kunde ist jetzt Hauptkontakt des Auftrags in Bitrix.",
  doneRename: "Der Name des Kontakts wurde in Bitrix korrigiert.",
} as const;

const str = (v: unknown) => (v == null ? "" : String(v));
/** trim, collapse whitespace, case-fold */
export const normName = (v: unknown): string => str(v).trim().replace(/\s+/g, " ").toLowerCase();
export interface Names { firstName: unknown; lastName: unknown }
/** the same person's name: equal after normName, also with first and last name swapped */
export function sameName(a: Names, b: Names): boolean {
  const [af, al, bf, bl] = [a.firstName, a.lastName, b.firstName, b.lastName].map(normName);
  return (af === bf && al === bl) || (af === bl && al === bf);
}
export const fullName = (n: Names): string => [n.firstName, n.lastName].map((v) => str(v).trim()).filter(Boolean).join(" ");

export interface MainContactQuestion { contactId: string; bitrix: string; offer: string; customer: DealCustomer }

/** the question to ask before Kundendaten is left, or null (see the rules at the top) */
export function mainContactQuestion(a: { dealId: string; deal: DealCustomerResponse | undefined | null; kd: Fields; kept: unknown }): MainContactQuestion | null {
  const { dealId, deal, kd } = a;
  if (!DEAL_NUMBER_RE.test(dealId) || !deal || deal.dealId !== dealId || !deal.customer) return null;
  const c = deal.customer, contactId = c.bitrixContactId.trim();
  if (!contactId) return null;
  const formId = str(kd.bitrixContactId).trim();
  if (formId && formId !== contactId) return null;
  if (!str(kd.firstName).trim() || !str(kd.lastName).trim()) return null;
  if (sameName(c, kd as Names)) return null;
  if (isKept(a.kept, contactId, kd as Names)) return null;
  return { contactId, bitrix: fullName(c) || `Kontakt ${contactId}`, offer: fullName(kd as Names), customer: c };
}

/** „Nicht ändern“ was answered for this contact and this typed name */
export function isKept(kept: unknown, contactId: string, typed: Names): boolean {
  const k = kept as Partial<Kept> | null | undefined;
  return !!k && typeof k === "object" && str(k.contactId) === contactId && normName(k.firstName) === normName(typed.firstName) && normName(k.lastName) === normName(typed.lastName);
}
export const keptOf = (contactId: string, kd: Fields): Kept => ({ contactId, firstName: str(kd.firstName).trim(), lastName: str(kd.lastName).trim() });

/** the Ansprechpartner fields from the Bitrix contact — only fields still empty are filled */
const CP: [string, (c: DealCustomer) => string][] = [
  ["cp_salutation", (c) => (c.salutation === "Frau" || c.salutation === "Herr" ? c.salutation : "")], // the contact person's choices are Frau / Herr
  ["cp_name", (c) => fullName(c)],
  ["cp_phone", (c) => c.phone], ["cp_email", (c) => c.email], ["cp_street", (c) => c.street],
  ["cp_postalCode", (c) => c.postalCode], ["cp_city", (c) => c.city], ["cp_state", (c) => c.state],
];
export function contactPersonChanges(kd: Fields, c: DealCustomer): Fields {
  const out: Fields = kd.hasContactPerson === "Ja" ? {} : { hasContactPerson: "Ja" };
  for (const [field, of] of CP) {
    const v = str(of(c)).trim();
    if (v && !str(kd[field]).trim()) out[field] = v;
  }
  return out;
}

/** the insured person as typed (the request body's `person`) */
export function personOf(kd: Fields): MainContactPerson {
  const p: MainContactPerson = { firstName: str(kd.firstName).trim(), lastName: str(kd.lastName).trim() };
  for (const f of ["salutation", "street", "postalCode", "city", "phone", "email"] as const) {
    const v = str(kd[f]).trim();
    if (v) p[f] = v;
  }
  return p;
}
/** the offer's contact after „Andere Person“: the new main contact */
export const newContactFields = (contactId: string): Fields => ({ bitrixContactId: contactId, customerNumber: contactId });
