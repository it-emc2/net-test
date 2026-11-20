// Filling Kundendaten from saved customer data — the rule of today's UI („Kunde suchen“,
// restoreKundendaten in script.js), ONE implementation for the web app (features/steps/kundendaten,
// which re-exports these) and the server (a second offer type for the same customer, ADR 027 B).
// Moved here unchanged from apps/web/src/features/steps/kundendaten/{fill,care,extras,object,payer}.ts;
// the recordings that pin the behaviour stay with the web tests
// (test/fixtures/kundendaten-*.json, v2/scripts/capture-kundendaten*.cjs).
//
//  - restoreKundendaten(k): a field is set when k has a value for it — also an EMPTY one ("" overwrites
//    what was typed); a field k does not mention stays. company and country are not on the page: not stored.
//  - a choice (Anrede, Zahler …) is set only to a real answer; "" leaves it as it is.
//  - it also resets things k does not mention: the budget ticks and the co-payment, the invoice copy
//    ("nein"), the Wohnumfeld answer ("Nein", amounts gone; Alltagshilfe: not stored).
//  - what follows the fields elsewhere happens as when they are typed: the payer's consequences
//    (choosePayer), the living situation's (chooseLivingSituation, an explicit landlord answer of k
//    wins), the e-mail recipient (while it follows the e-mail), the letter's recipient (only its
//    EMPTY fields), the Bitrix contact number as customer number.
import { emptyOffer, type NewOfferType } from "./offer.js";

type Fields = Record<string, unknown>;
/** section → fields that change (`undefined` removes a field), the shape of the web store's patchAll */
export type Changes = Record<string, Fields>;

// ---------------- care level / budget (web: care.ts) ----------------
export const MAIN_OPTIONS = {
  budgetMax: { value: "4180 MAXIMAL", label: "4.180 € MAXIMAL" },
  twoPersons: { value: "Zwei Personen mit Pflegegrad", label: "2 Personen mit Pflegegrad (+ 4.180 €)" },
  premium: { value: "Premium", label: "Premium" },
} as const;
export type MainOption = keyof typeof MAIN_OPTIONS;
const MAINS = Object.keys(MAIN_OPTIONS) as MainOption[];

/** `budgetOptionsPanel`: the ticked main option in capitals, as today's UI derives it */
export const budgetPanelOf = (kd: Fields): string => {
  const main = MAINS.find((m) => !!kd[m]);
  return main ? MAIN_OPTIONS[main].value.toUpperCase() : "";
};

/** "1.250,50" / "1250" → number; anything else → 0 (today's parseEuroToNumber) */
export function parseEuro(v: unknown): number {
  const n = parseFloat(String(v ?? "").trim().replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ---------------- Wohnumfeld and the internal list (web: extras.ts) ----------------
export interface AmountRow { amount: string; fuerWas: string }
export const NO_MEASURES = { done: false, amount: 0, entries: [] as { amount: number; fuerWas: string }[] };
const amountOf = (raw: string) => {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** what is stored for these rows */
export function storedWohnumfeld(done: unknown, rows: readonly AmountRow[]) {
  if (done !== "Ja") return { ...NO_MEASURES, entries: [] };
  const entries = rows.map((r) => ({ amount: amountOf(r.amount), fuerWas: r.fuerWas.trim() }));
  return { done: true, amount: entries.reduce((sum, e) => sum + e.amount, 0), entries };
}
export const TODOS = "internalTodos[]";

// ---------------- funding and property answers (web: object.ts) ----------------
/** Application to the Pflegekasse: "Ja" asks whether it is approved, "Nein" whether EmC2 may apply; the other answer goes. */
export const chooseApplication = (answer: string): Fields =>
  answer === "Ja" ? { pflegekasseAntrag: "Ja", pflegekasseEmc2Antrag: undefined } : { pflegekasseAntrag: "Nein", pflegekasseGenehmigung: undefined };

/** Living situation: renting needs the landlord's approval, owning does not (set by itself, can be changed);
 *  "liegt vor" is only asked — and stored — for a rented home. */
export const chooseLivingSituation = (answer: string): Fields =>
  answer === "Miete" ? { wohnsituation: "Miete", vermieterGenehmigungErforderlich: "Ja" }
  : { wohnsituation: answer, vermieterGenehmigung: undefined, ...(answer === "Eigentum" ? { vermieterGenehmigungErforderlich: "Nein" } : {}) };

// ---------------- the payer (web: payer.ts) ----------------
//  - Selbstzahler: the insurance details and `wohnumfeldDone` are NOT stored at all, the care
//    level / budget / Pflegekasse answers are stored blank, and neither Abtretung nor Vollmacht
//    is selected as a document (also not as attachment of a letter).
//  - back to Kassenkunde: everything entered before is there again — except `wohnumfeldDone`.
export interface PayerChange {
  changes: { Kundendaten: Fields; docSelection: Fields; postal: Fields };
  /** what to remember for the way back (null: nothing to remember any more) */
  parked: Parked | null;
}
export interface Parked { kundendaten: Fields; docSelection: Fields; attachments: unknown }

/** stored only for a Kassenkunde */
const INSURANCE = ["kassenkundeName", "kk_geburtsdatum", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "kk_rechnungskopie_art", "kk_versichertennr"] as const;
const INSURANCE_DEFAULTS: Fields = { kassenkundeName: "", kk_geburtsdatum: "", kk_krankenkasseAdresse: "", kk_pflegegradSeit: "", kk_rechnungskopie: "nein", kk_versichertennr: "" };
/** stored blank for a Selbstzahler */
const BLANK_FOR_SZ: Fields = {
  hasPflegegrad: "", pflegegrad: "", budgetMax: false, budgetCopay: false, twoPersons: false, premium: false,
  pflegekasseAntrag: "", pflegekasseGenehmigung: "", pflegekasseEmc2Antrag: "",
};
/** of those, what is there again after switching back: the care level, "Premium" and the
 *  Pflegekasse answers. The budget ticks (maximal, 2 Personen, co-payment) are gone, as today. */
const KEPT_FOR_THE_WAY_BACK = ["hasPflegegrad", "pflegegrad", "premium", "pflegekasseAntrag", "pflegekasseGenehmigung", "pflegekasseEmc2Antrag"] as const;

const pick = (o: Fields, keys: readonly string[]): Fields => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const remove = (keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, undefined]));

export function choosePayer(offer: Record<string, any>, payer: "Selbstzahler" | "Kassenkunde", parked: Parked | null): PayerChange {
  const kd: Fields = offer.Kundendaten ?? {};
  if (payer === "Selbstzahler") {
    if (kd.payer === "Selbstzahler") return { changes: { Kundendaten: {}, docSelection: {}, postal: {} }, parked };
    return {
      changes: {
        Kundendaten: { payer, ...remove(INSURANCE), wohnumfeldDone: undefined, wohnumfeld: { done: false, amount: 0, entries: [] }, ...BLANK_FOR_SZ, copayAmount: 0, budgetOptionsPanel: "", kundenName: "", greetingLine: "" },
        docSelection: { abtretung: false, vollmacht: false },
        postal: { attachments: [] },
      },
      parked: {
        kundendaten: pick(kd, [...INSURANCE, ...KEPT_FOR_THE_WAY_BACK]),
        docSelection: pick(offer.docSelection ?? {}, ["abtretung", "vollmacht"]),
        attachments: offer.postal?.attachments,
      },
    };
  }
  if (kd.payer === "Kassenkunde") return { changes: { Kundendaten: {}, docSelection: {}, postal: {} }, parked };
  // no memory of an earlier Kassenkunde state (e.g. the offer was opened as Selbstzahler) → today's defaults
  const fresh = emptyOffer(offer.activeOffer as NewOfferType, { date: "" }) as Record<string, any>;
  const back: Parked = parked ?? { kundendaten: INSURANCE_DEFAULTS, docSelection: pick(fresh.docSelection, ["abtretung", "vollmacht"]), attachments: fresh.postal.attachments };
  return {
    changes: {
      Kundendaten: { payer, ...remove(Object.keys(BLANK_FOR_SZ)), ...INSURANCE_DEFAULTS, ...back.kundendaten, budgetOptionsPanel: budgetPanelOf(back.kundendaten) },
      docSelection: back.docSelection,
      postal: { attachments: back.attachments },
    },
    parked: null,
  };
}

/** Invoice copy: "Per Post / Per E-Mail" is stored only while the answer is "ja" (default: post; the last choice comes back). */
export function chooseInvoiceCopy(answer: "ja" | "nein", lastKind: unknown): Fields {
  return answer === "ja" ? { kk_rechnungskopie: "ja", kk_rechnungskopie_art: lastKind === "email" ? "email" : "post" } : { kk_rechnungskopie: "nein", kk_rechnungskopie_art: undefined };
}

// ---------------- restoreKundendaten (web: fill.ts) ----------------
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
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Fields)[k])])) : v;
/** deep equality, key order ignored */
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

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
  for (const [f, v] of Object.entries(next)) if (!sameValue(v, kd[f]) && !(v === undefined && !(f in kd))) out.Kundendaten![f] = v;
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

/** the deal number into the offer, as today's „Auftrag ID“ fields (top level, mail, letter) */
export const dealNumberTop = (offer: Record<string, any>, dealId: string) =>
  ({ auftragId: dealId, mail: { ...(offer.mail ?? {}), auftragId: dealId }, postal: { ...(offer.postal ?? {}), auftragId: dealId } });

/** `changes` applied to a copy of `offer` the way the web store's patchAll does it (per section; `undefined` removes a field) */
export function applyChanges<T extends Record<string, any>>(offer: T, changes: Changes): T {
  const next: Record<string, any> = { ...offer };
  for (const [section, fields] of Object.entries(changes)) {
    const out: Fields = { ...((next[section] as Fields | undefined) ?? {}), ...fields };
    for (const k of Object.keys(fields)) if (fields[k] === undefined) delete out[k];
    next[section] = out;
  }
  return next as T;
}
