// The steps of each offer type, in today's order (guard: test/steps.test.ts compares this list
// with the Playwright snapshots of the current UI). `built` names the steps that already exist
// as React screens — every other step still opens in today's UI.
import type { NewOfferType } from "@oc/domain";

export const STEPS: Record<NewOfferType, readonly string[]> = {
  bu: ["Kundendaten", "Arbeitszeit", "Arbeiten", "Duschwanne", "Fussboden", "Wandverkleidung", "DuschabtrennungNeu", "Duschvorhang", "Optional", "Rabatt", "Kosten", "Angebotscheck", "Zusammenfassung", "Checkliste", "referenzVorher", "referenzNachher"],
  bwt: ["Kundendaten", "Arbeitszeit", "bwtArbeiten", "bwt", "Rabatt", "Kosten", "Zusammenfassung", "referenzNachher"],
  hl: ["Kundendaten", "Arbeitszeit", "hlArbeiten", "hlk", "Rabatt", "Kosten", "Zusammenfassung"],
  bl: ["Kundendaten", "Arbeitszeit", "bl", "Kosten", "Zusammenfassung"],
  ah: ["Kundendaten", "Arbeitszeit", "ah", "Finanzierung", "Kosten", "Zusammenfassung"],
};

const LABELS: Record<string, string> = {
  Fussboden: "Fußboden", DuschabtrennungNeu: "Duschabtrennung", Optional: "Optionale Produkte", Rabatt: "Aufschlag / Rabatt",
  Zusammenfassung: "Angebotsversand", bwt: "Badewannentür", bwtArbeiten: "Arbeiten", hlArbeiten: "Arbeiten", hlk: "Handläufe",
  bl: "Badelift", ah: "Leistungen", referenzVorher: "Vorher / Arbeitsschritte", referenzNachher: "Nachher",
};
export const stepLabel = (step: string): string => LABELS[step] ?? step;

export const OFFER_TITLES: Record<NewOfferType, string> = {
  bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", bl: "Badelift", ah: "Alltagshilfe",
};

/** Steps that exist as React screens (phase 4 adds to this list, one screen at a time). */
export const BUILT_STEPS: ReadonlySet<string> = new Set<string>();

export const isStepOf = (type: NewOfferType, step: string | undefined): step is string => !!step && STEPS[type].includes(step);
export const firstStep = (type: NewOfferType): string => STEPS[type][0]!;
