// The Alltagshilfe-only blocks of Kundendaten — the rules of today's UI (index.html „Vorbereitung
// vor dem Termin“, „2 Personen mit Pflegegrad im Haushalt“, „Besondere Hinweise“, „Lebenssituation“;
// script.js initAhPerson2Toggle, the Ja/Nein/Sonstiges pills, initTwoPersonSummary, buildPayload),
// recorded in test/fixtures/kundendaten-ah.json (v2/scripts/capture-kundendaten-ah.cjs).
// Each function returns the fields of `Kundendaten` that change (`undefined` = remove the field).
//
// Stored as today (FormData of today's form):
//  - a preparation tick: `prep_*: "Ja"`; not ticked: the key is not stored
//  - „2 Personen“: `ahZweiPersonen: "on"`; not ticked: not stored. `p2FirstName` / `p2LastName` are
//    always stored (text, "" when empty), `p2Salutation` / `p2Pflegegrad` once chosen. Unticking
//    keeps the second person's entries (they are only hidden — as today).
//  - while ticked and not Selbstzahler, name and greeting of both (`kundenName`, `greetingLine`)
//    follow the names unless changed by hand (as for the Badumbau two persons); otherwise "".
//  - a note question: `ah_*_choice` is the chip, `ah_*` the text. „Ja“ / „Nein“ write the chip's
//    word into the text as well; „Sonstiges“ leaves the text as it is.
//  - Lebenssituation: the chosen answer's value; nothing chosen: not stored.
//
// DELIBERATE DIFFERENCES (UX-CHANGES U-052, owner 2026-11-23): the details field opens on „Ja“ too
// (today only on „Sonstiges“). Its text goes into the same `ah_*` field; emptied, the field holds
// the chip's word again ("Ja") — so a plain „Ja“ is stored exactly as today. Switching between „Ja“
// and „Sonstiges“ keeps the details (today: „Ja“ overwrites them); „Nein“ see chooseHint.
import { HINT_CHOICES, hintChoice, type HintChoice } from "@oc/domain";

type Fields = Record<string, unknown>;

export const PREP = [
  ["prep_terminBestaetigt", "Termin bestätigt (telefonisch oder per SMS/WhatsApp)"],
  ["prep_erstberatungsbogen", "Erstberatungsbogen (dieses Dokument) ausgedruckt"],
  ["prep_visitenkarten", "Visitenkarten und Flyer eingepackt (Alltagshilfe + Badumbau)"],
  ["prep_leistungsuebersicht", "Leistungsübersicht / Preisliste dabei"],
  ["prep_mustervertrag", "Muster-Vertrag / Kostenvoranschlag dabei"],
] as const;
export const PREP_TIP = "Vor dem Termin kurz googeln: Gibt es Besonderheiten zur Wohnsituation (Altbau, Hochhaus, ländlich)? Wer hat angerufen – die betroffene Person selbst oder ein Angehöriger?";
export const prepDone = (kd: Fields) => PREP.filter(([k]) => kd[k] === "Ja").length;
export const togglePrep = (key: string, on: boolean): Fields => ({ [key]: on ? "Ja" : undefined });

// ---- 2 Personen ----
export const isOn = (v: unknown) => v === true || v === "on" || v === "true";
export const P2_LEVELS = ["1", "2", "3", "4", "5", "beantragt"] as const;
export const P2_FIELDS = ["p2Salutation", "p2FirstName", "p2LastName", "p2Pflegegrad"] as const;
export const hasSecondPersonData = (kd: Fields) => P2_FIELDS.some((k) => String(kd[k] ?? "").trim() !== "");

const nameFrag = (sal: unknown, name: string) => [sal, name].filter(Boolean).join(" ").trim();
const greetFrag = (sal: unknown, last: unknown) => {
  const l = String(last ?? "").trim();
  if (sal === "Frau") return `sehr geehrte Frau ${l}`.trim();
  if (sal === "Herr") return `sehr geehrter Herr ${l}`.trim();
  if (sal === "Familie") return `sehr geehrte Familie ${l}`.trim();
  return "sehr geehrte Damen und Herren";
};
const str = (v: unknown) => String(v ?? "").trim();
/** name and greeting of both persons, from the AH fields (today's initTwoPersonSummary with isAh) */
export function ahTwoPersonsTexts(kd: Fields): { kundenName: string; greetingLine: string } {
  const cust = [str(kd.firstName), str(kd.lastName)].filter(Boolean).join(" ");
  const partner = [str(kd.p2FirstName), str(kd.p2LastName)].filter(Boolean).join(" ");
  const two = `${greetFrag(kd.salutation, kd.lastName)}, ${greetFrag(kd.p2Salutation, kd.p2LastName)}`;
  return { kundenName: `${nameFrag(kd.salutation, cust)} und ${nameFrag(kd.p2Salutation, partner)}`.trim(), greetingLine: two.charAt(0).toUpperCase() + two.slice(1) };
}
/** two persons count for name and greeting: ticked and not Selbstzahler */
export const ahTwoPersonsFinal = (kd: Fields) => isOn(kd.ahZweiPersonen) && kd.payer !== "Selbstzahler";

/** tick / untick „2 Personen“ */
export function toggleTwoPersons(kd: Fields, on: boolean): Fields {
  const out: Fields = { ahZweiPersonen: on ? "on" : undefined };
  const after = { ...kd, ...out };
  Object.assign(out, ahTwoPersonsFinal(after) ? ahTwoPersonsTexts(after) : { kundenName: "", greetingLine: "" });
  return out;
}

/** While two persons count and name/greeting are still the automatic ones, they follow the names;
 *  when they stop counting (Selbstzahler), both are emptied (today's buildPayload). */
export function ahFollowNames(before: Fields, after: Fields): Fields {
  const was = ahTwoPersonsFinal(before), now = ahTwoPersonsFinal(after);
  if (!now) return clear(after);
  const auto = ahTwoPersonsTexts(after);
  const prev = ahTwoPersonsTexts(before);
  const out: Fields = {};
  // just started counting, still the automatic text, or empty: follow
  const follows = (k: "kundenName" | "greetingLine") => !was || after[k] === prev[k] || !after[k];
  if (follows("kundenName") && after.kundenName !== auto.kundenName) out.kundenName = auto.kundenName;
  if (follows("greetingLine") && after.greetingLine !== auto.greetingLine) out.greetingLine = auto.greetingLine;
  return out;
}
const clear = (kd: Fields): Fields => {
  const out: Fields = {};
  if (kd.kundenName) out.kundenName = "";
  if (kd.greetingLine) out.greetingLine = "";
  return out;
};

// ---- Besondere Hinweise ----
export const HINTS = [
  ["ah_mobilitaet", "Mobilitätseinschränkungen"],
  ["ah_allergien", "Allergien / Unverträglichkeiten"],
  ["ah_demenz", "Demenz / kognitive Einschränkungen"],
  ["ah_sprache", "Sprachliche Besonderheiten"],
] as const;
// the chip shown for a note question: one rule with the restore (customer-data.ts in @oc/domain)
export { HINT_CHOICES, hintChoice, type HintChoice };
/** the details field is on the page after „Ja“ (U-052) and „Sonstiges“ */
export const hintDetailsOpen = (choice: string) => choice === "Ja" || choice === "Sonstiges";
/** what the details field shows: the text, but not the chip's own word that today writes into it */
export const hintDetails = (kd: Fields, field: string) => { const t = String(kd[field] ?? ""); return t === "Ja" || t === "Nein" ? "" : t; };

/** A chip chosen (owner 2026-11-23, U-052): the details typed stay when switching between „Ja“ and
 *  „Sonstiges“ (today's UI writes „Ja“ over them). „Nein“ stores exactly today's („Nein“ in `ah_*`);
 *  the details are kept in the session (`kept`, not stored) and come back with „Ja“ / „Sonstiges“
 *  while the offer is open. Without details: „Ja“ / „Nein“ write the chip's word, „Sonstiges“ leaves
 *  the text as it is — all as today.
 *  Returns the changes and what the session keeps for this question afterwards. */
export function chooseHint(kd: Fields, field: string, choice: HintChoice, kept = ""): { changes: Fields; kept: string } {
  const details = hintDetails(kd, field) || kept;
  if (choice === "Nein") return { changes: { [`${field}_choice`]: "Nein", [field]: "Nein" }, kept: details };
  if (details) return { changes: { [`${field}_choice`]: choice, [field]: details }, kept: "" };
  return { changes: choice === "Sonstiges" ? { [`${field}_choice`]: choice } : { [`${field}_choice`]: choice, [field]: choice }, kept: "" };
}
/** details typed: stored in `ah_*`; emptied after „Ja“ the field holds "Ja" again (as a plain „Ja“) */
export function typeHint(kd: Fields, field: string, text: string): Fields {
  return { [field]: text === "" && hintChoice(kd, field) === "Ja" ? "Ja" : text };
}

// ---- Lebenssituation ----
export const LIFE = [
  ["ah_alleinLebend", "Allein lebend", ["Ja", "Nein"]],
  ["ah_haustiere", "Haustiere", ["Ja", "Nein"]],
  ["ah_schluessel", "Schlüssel hinterlegt", ["Ja", "Nein", "Schlüsselübergabe klären"]],
  ["ah_bestehendeHilfe", "Bestehende Hilfe", ["Pflegedienst", "Angehörige", "Nachbarn", "keine"]],
] as const;
