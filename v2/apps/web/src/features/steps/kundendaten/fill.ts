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
import type { DealCustomer, DealCustomerResponse } from "@oc/api-contract";
import { MAIN_OPTIONS, budgetPanelOf, parseEuro, type MainOption } from "./care.js";
import { TODOS, storedWohnumfeld, type AmountRow } from "./extras.js";
import { chooseLivingSituation } from "./object.js";
import { chooseInvoiceCopy, choosePayer } from "./payer.js";

type Fields = Record<string, unknown>;
export type Changes = Record<string, Fields>;

/** text fields restoreKundendaten sets from k (name → where k has it) */
const TEXTS: Record<string, (k: Fields) => unknown> = {
  date: (k) => k.date, firstName: (k) => k.firstName, lastName: (k) => k.lastName, phone: (k) => k.phone, email: (k) => k.email,
  street: (k) => k.street, city: (k) => k.city, state: (k) => k.state, postalCode: (k) => k.postalCode, deployment: (k) => k.deployment,
  parkDetails: (k) => k.parkDetails || k.parksituationHinweis, notes: (k) => k.notes,
  cp_name: (k) => k.cp_name, cp_phone: (k) => k.cp_phone, emailCc: (k) => k.emailCc, cp_email: (k) => k.cp_email, cp_street: (k) => k.cp_street,
  cp_city: (k) => k.cp_city, cp_state: (k) => k.cp_state, cp_postalCode: (k) => k.cp_postalCode,
  emc2_contact: (k) => k.emc2_contact, ansprechpartner: (k) => k.ansprechpartner,
  bitrixContactId: (k) => k.bitrixContactId || k.customerNumber,
  kassenkundeName: (k) => k.kassenkundeName, kk_geburtsdatum: (k) => k.kk_geburtsdatum ?? k.ah_geburtsdatum, kk_versichertennr: (k) => k.kk_versichertennr ?? k.ah_versichertenr,
  kk_krankenkasseAdresse: (k) => k.kk_krankenkasseAdresse, kk_pflegegradSeit: (k) => k.kk_pflegegradSeit,
  partnerSalutation: (k) => k.partnerSalutation, partnerFirstName: (k) => k.partnerFirstName, partnerLastName: (k) => k.partnerLastName,
  partnerKassenkundeName: (k) => k.partnerKassenkundeName, partnerGeburtsdatum: (k) => k.partnerGeburtsdatum, partnerKvnr: (k) => k.partnerKvnr,
  partnerPflegegradSeit: (k) => k.partnerPflegegradSeit, partnerKrankenkasseAdresse: (k) => k.partnerKrankenkasseAdresse, ah_sonstiges: (k) => k.ah_sonstiges,
  ah_mobilitaet: (k) => k.ah_mobilitaet, ah_allergien: (k) => k.ah_allergien, ah_demenz: (k) => k.ah_demenz, ah_sprache: (k) => k.ah_sprache,
  kundenName: (k) => k.kundenName || undefined, greetingLine: (k) => k.greetingLine || undefined,
};
/** choices: set only to a real answer */
const CHOICES: Record<string, (k: Fields) => unknown> = {
  salutation: (k) => k.salutation, pflegekasseAntrag: (k) => k.pflegekasseAntrag, pflegekasseGenehmigung: (k) => k.pflegekasseGenehmigung,
  pflegekasseEmc2Antrag: (k) => k.pflegekasseEmc2Antrag, vermieterGenehmigung: (k) => k.vermieterGenehmigung,
  zugangWohnung: (k) => k.zugangWohnung || k.wohnungszugang, parkenMoeglich: (k) => k.parkenMoeglich, customerType: (k) => k.customerType,
  hasContactPerson: (k) => k.hasContactPerson, cp_salutation: (k) => k.cp_salutation, hasPflegegrad: (k) => k.hasPflegegrad,
  pflegegrad: (k) => (k.pflegegrad == null || k.pflegegrad === "" ? undefined : String(k.pflegegrad)),
  partnerPflegegrad: (k) => (k.partnerPflegegrad ? String(k.partnerPflegegrad) : undefined),
  ah_alleinLebend: (k) => k.ah_alleinLebend, ah_haustiere: (k) => k.ah_haustiere, ah_schluessel: (k) => k.ah_schluessel, ah_bestehendeHilfe: (k) => k.ah_bestehendeHilfe,
  aufschlag: (k) => k.aufschlag,
};
const MAINS = Object.keys(MAIN_OPTIONS) as MainOption[];
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Fields)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** restoreBudgetPanel: the ticked main option from the flags, else from the stored text */
function budgetOf(k: Fields): Fields {
  const txt = String(k.budgetOptionsPanel ?? "").toUpperCase();
  let main: MainOption | null = k.premium ? "premium" : k.twoPersons ? "twoPersons" : k.budgetMax ? "budgetMax" : null;
  if (!main && !("premium" in k) && !("twoPersons" in k) && !("budgetMax" in k)) {
    main = /PREMIUM/.test(txt) ? "premium" : /(ZWEI|2 PERSONEN|8360)/.test(txt) ? "twoPersons" : /4180.*MAX/.test(txt) ? "budgetMax" : null;
  }
  const out: Fields = {};
  for (const m of MAINS) out[m] = m === main ? MAIN_OPTIONS[m].value : undefined;
  const copay = "budgetCopay" in k ? !!k.budgetCopay : /4180.*(ZUZ|COPAY)/.test(txt);
  out.budgetCopay = copay && main ? "4180 mit Zuzahlung" : undefined;
  out.copayAmount = parseEuro(k.copayAmount ?? "");
  out.budgetOptionsPanel = budgetPanelOf(out);
  return out;
}

/** restorePflegegradAndWohnumfeld: the answer, and the amounts stored with it */
function wohnumfeldOf(k: Fields, type: string): Fields {
  if (type === "ah") return { wohnumfeldDone: undefined };
  const we = (k.wohnumfeld ?? {}) as { status?: unknown; done?: unknown; entries?: { amount?: unknown; fuerWas?: unknown }[] };
  const status = String(we.status || k.wohnumfeldDone || "").trim();
  const done = ["Ja", "Nein", "Unbekannt"].includes(status) ? status : we.done || k.wohnumfeldDone === "Ja" ? "Ja" : "Nein";
  const list: { amount?: unknown; fuerWas?: unknown }[] = Array.isArray(we.entries) ? we.entries : Array.isArray(k.wohnumfeldEntries) ? (k.wohnumfeldEntries as { amount?: unknown; fuerWas?: unknown }[]) : [];
  const rows: AmountRow[] = list.map((e) => ({ amount: e?.amount ? String(e.amount) : "", fuerWas: String(e?.fuerWas ?? "") }));
  return { wohnumfeldDone: done, wohnumfeld: storedWohnumfeld(done, rows) };
}

const LETTER: Record<string, string> = { firstName: "firstName", lastName: "lastName", street: "street", postalCode: "zipCode", city: "city" };

/**
 * What restoring `k` into the open offer changes, as today's UI does it — ready for patchAll.
 * Only what really changes is in the answer.
 */
export function restoreChanges(offer: Record<string, any>, k: Fields, type: string): Changes {
  const kd: Fields = offer.Kundendaten ?? {};
  let next: Fields = {};
  for (const [f, get] of Object.entries(TEXTS)) { const v = get(k); if (v !== undefined && v !== null) next[f] = String(v); }
  if ("bitrixContactId" in next) next.customerNumber = next.bitrixContactId; // stored with the same number (getKundendatenPageData)
  for (const [f, get] of Object.entries(CHOICES)) { const v = get(k); if (v !== undefined && v !== null && v !== "") next[f] = v; }
  const vgErf = k.vermieterGenehmigungErforderlich === true ? "Ja" : k.vermieterGenehmigungErforderlich;
  const explicitLandlord: Fields = vgErf === "Ja" || vgErf === "Nein" ? { vermieterGenehmigungErforderlich: vgErf } : {};
  const todos = k[TODOS] ?? k.internalTodos;
  const todoList = (Array.isArray(todos) ? todos : todos ? [todos] : []).map((v) => String(v ?? "").trim()).filter(Boolean);
  next = {
    ...next,
    ...chooseInvoiceCopy(k.kk_rechnungskopie === "ja" ? "ja" : "nein", k.kk_rechnungskopie_art || "post"),
    ...(k.kk_rechnungskopie && k.kk_rechnungskopie !== "ja" && k.kk_rechnungskopie !== "nein" ? { kk_rechnungskopie: k.kk_rechnungskopie } : {}),
    ...wohnumfeldOf(k, type),
    ...budgetOf(k),
    [TODOS]: todoList.length ? todoList : undefined, internalTodos: undefined,
    ...("aufschlagBegruendung" in kd ? { aufschlagBegruendung: String(k.aufschlagBegruendung ?? "") } : {}),
  };
  const out: Changes = { Kundendaten: {} };
  // the living situation: as if chosen (renting asks for the landlord), an explicit answer of k wins
  const living = String(k.wohnsituation ?? "");
  if (living) Object.assign(next, living !== kd.wohnsituation ? chooseLivingSituation(living) : { wohnsituation: living }, CHOICES.vermieterGenehmigung!(k) ? { vermieterGenehmigung: k.vermieterGenehmigung } : {});
  Object.assign(next, explicitLandlord);
  // the payer: as if chosen; Selbstzahler drops what does not belong to it
  const payer = k.payer === "Selbstzahler" || k.payer === "Kassenkunde" ? k.payer : null;
  if (payer && payer !== kd.payer) {
    const r = choosePayer({ ...offer, Kundendaten: { ...kd, ...next } }, payer, null);
    next = payer === "Selbstzahler" ? { ...next, ...r.changes.Kundendaten } : { ...r.changes.Kundendaten, ...next, payer };
    if (Object.keys(r.changes.docSelection).length) out.docSelection = r.changes.docSelection;
    if (Object.keys(r.changes.postal).length) out.postal = r.changes.postal;
  } else if (payer) next.payer = payer;
  if ((next.payer ?? kd.payer) === "Selbstzahler") for (const f of ["kassenkundeName", "kk_geburtsdatum", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "kk_rechnungskopie_art", "kk_versichertennr", "wohnumfeldDone"]) next[f] = undefined;
  for (const [f, v] of Object.entries(next)) if (!same(v, kd[f]) && !(v === undefined && !(f in kd))) out.Kundendaten![f] = v;
  // the e-mail recipient follows the e-mail while it was not changed by hand
  if (String(out.Kundendaten!.email ?? "").trim()) { // an e-mail emptied by the fill leaves the recipient (as today)
    const to = offer.mail?.to;
    if (!to || to === String(kd.email ?? "").trim()) out.mail = { to: String(out.Kundendaten!.email).trim() };
  }
  // the letter's recipient: only its empty fields
  const recipient = (offer.postal?.recipient ?? {}) as Fields;
  const letter: Fields = {};
  for (const [f, target] of Object.entries(LETTER)) {
    const v = String(out.Kundendaten![f] ?? "").trim();
    if (v && !String(recipient[target] ?? "").trim()) letter[target] = v;
  }
  if (Object.keys(letter).length) out.postal = { ...(out.postal ?? {}), recipient: { ...recipient, ...letter } };
  return out;
}

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

/** the deal number into the offer, as today's „Auftrag ID“ fields */
export const dealNumberTop = (offer: Record<string, any>, dealId: string) =>
  ({ auftragId: dealId, mail: { ...(offer.mail ?? {}), auftragId: dealId }, postal: { ...(offer.postal ?? {}), auftragId: dealId } });

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
