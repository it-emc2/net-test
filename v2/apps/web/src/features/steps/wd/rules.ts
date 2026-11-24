// Winterdienst (step `wd`) — and Hausmeister-Service (step `hms`): today both are the same page with
// another heading, note placeholder and section key. What today's page stores and shows
// (test/fixtures/winterdienst.json, hausmeister.json, v2/scripts/capture-wd-hms.cjs; legacy:
// index.html #page-wd / #page-hms, script.js buildPayload → formToObject(form-<t>),
// attachProjectSketchesToPayload, restoreWd / restoreHms):
//  - the page is a copy of an early Alltagshilfe page and keeps its texts: „Angebot zur Unterstützung im
//    Alltag“ (Alltagsbegleitung / Haushaltsnahedienstleistungen), „Konditionen“ with the hours per visit
//    and per month (numbers, step 0.5, min 0, typed as they are) and „Regelmäßigkeit“ (8 choices), the note
//    and the sketch. „Leistungsart im Detail“ is in today's markup but never shown (no code opens it) → not
//    built. The v2 add-on (quickwins C8) shows the second choice as „Haushaltsnahe Dienstleistungen“ (label
//    only, the stored value stays „Haushaltsnahedienstleistungen“); today it reaches only the first copy of
//    the page in the document (Hausmeister-Service) because both copies share the element id — React shows
//    the corrected label on both (U-066 / U-067)
//  - the section is written whole on every change (today: the form's data):
//    { ahArt?, ahEinsatzUmfang, ahMonatUmfang, ahRegelmaessigkeit?, <t>Note, <t>SketchDataUrl, <t>SketchJson,
//      sketch: { json, dataUrl } } — a choice only once made (an unticked radio is not in a form's data), the
//    hours as typed ("" when empty). The pad writes its drawing twice, as today: into `sketch` and into the two
//    hidden fields of the form (<t>SketchJson / <t>SketchDataUrl)
//  - a choice cannot be taken back (radio buttons, as today); nothing else of the offer changes
//  - no price of its own: the server answers an empty shell (`_clientSideOffer`) — Kosten shows zeros, the
//    total „–“ (usePrice); „Weiter“ has no check (as today)
//  - an opened offer: today's restore fills only the note and the sketch, so the choices and hours of a
//    stored offer are not shown and are gone with the next save. React shows them and keeps them (U-066);
//    see `afterOpening` for the sketch
import { EMPTY_SKETCH_JSON, afterOpening } from "../bl/rules.js";

export { EMPTY_SKETCH_JSON, afterOpening };
export type ServiceType = "wd" | "hms";
type Fields = Record<string, unknown>;

export const HEADING: Record<ServiceType, string> = { wd: "WD · Winterdienst", hms: "HMS · Hausmeisterservice" };
export const NOTE_PLACEHOLDER: Record<ServiceType, string> = {
  wd: "z. B. Besonderheiten, Kundenwünsche oder Hinweise zum Winterdienst …",
  hms: "z. B. Besonderheiten, Kundenwünsche oder Hinweise zum Hausmeisterservice …",
};
export const TEXT = {
  art: "Angebot zur Unterstützung im Alltag",
  conditions: "Konditionen",
  conditionsLead: "Bitte geben Sie den gewünschten Stundenumfang sowie die Regelmäßigkeit an.",
  perVisit: "Gewünschter Stundenumfang pro Einsatz (h)",
  perMonth: "Monatlicher Stundenumfang (h)",
  regularity: "Regelmäßigkeit",
  note: "Notizen / Anmerkungen",
} as const;
export const ART: readonly { value: string; label: string }[] = [
  { value: "Alltagsbegleitung", label: "Alltagsbegleitung" },
  { value: "Haushaltsnahedienstleistungen", label: "Haushaltsnahe Dienstleistungen" },
];
export const REGULARITY: readonly { value: string; label: string }[] = ["Einmalig", "Wöchentlich", "14-tägig", "alle drei Wochen", "Monatlich", "Vierteljährlich", "Halbjährlich", "Jährlich"].map((v) => ({ value: v, label: v }));

/** the page as shown */
export interface Form { art: string; perVisit: string; perMonth: string; regularity: string; note: string; sketch: { json: string; dataUrl: string } }

const str = (v: unknown): string => (v == null ? "" : String(v));
const sketchOf = (v: unknown): { json: string; dataUrl: string } => {
  const s = (v && typeof v === "object" ? v : {}) as Fields;
  return { json: str(s.json), dataUrl: str(s.dataUrl) };
};

/** the page for a stored section */
export function formOf(t: ServiceType, sec: Fields): Form {
  return { art: str(sec.ahArt), perVisit: str(sec.ahEinsatzUmfang), perMonth: str(sec.ahMonatUmfang), regularity: str(sec.ahRegelmaessigkeit), note: str(sec[`${t}Note`]), sketch: sketchOf(sec.sketch) };
}

/** the whole section as today's page writes it */
export function sectionOf(t: ServiceType, f: Form): Fields {
  return {
    ...(f.art ? { ahArt: f.art } : {}),
    ahEinsatzUmfang: f.perVisit,
    ahMonatUmfang: f.perMonth,
    ...(f.regularity ? { ahRegelmaessigkeit: f.regularity } : {}),
    [`${t}Note`]: f.note,
    [`${t}SketchDataUrl`]: f.sketch.dataUrl,
    [`${t}SketchJson`]: f.sketch.json,
    sketch: { json: f.sketch.json, dataUrl: f.sketch.dataUrl },
  };
}

/** step list: something is entered on the page */
export const hasContent = (t: ServiceType, sec: Fields): boolean => {
  const f = formOf(t, sec);
  return !![f.art, f.perVisit, f.perMonth, f.regularity, f.note.trim()].some(Boolean) || !!f.sketch.dataUrl;
};
