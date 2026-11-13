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

/** Steps that exist as React screens (phase 4 adds to this list, one screen at a time; each also
 *  needs its route in app/router.tsx). "partly": some sections of the step are still in today's UI. */
export const BUILT_STEPS: ReadonlyMap<string, "complete" | "partly"> = new Map([["Kundendaten", "partly"], ["Arbeitszeit", "partly"], ["Arbeiten", "partly"], ["Rabatt", "partly"]]);

export const isStepOf = (type: NewOfferType, step: string | undefined): step is string => !!step && STEPS[type].includes(step);
export const firstStep = (type: NewOfferType): string => STEPS[type][0]!;

/** Numbered groups of the step list (as in today's sidebar; other offer types have a flat list). */
export interface StepGroup { title: string; num?: string; steps: readonly string[] }
export const STEP_GROUPS: Partial<Record<NewOfferType, readonly StepGroup[]>> = {
  bu: [
    { title: "Auszuführende Arbeiten", num: "I", steps: ["Arbeitszeit", "Arbeiten"] },
    { title: "Material für Badumbau", num: "II", steps: ["Duschwanne", "Fussboden", "Wandverkleidung", "DuschabtrennungNeu", "Duschvorhang"] },
    { title: "Zusammenfassung", steps: ["Angebotscheck", "Zusammenfassung", "Checkliste"] },
  ],
  bwt: [{ title: "Auszuführende Arbeiten", num: "I", steps: ["Arbeitszeit", "bwtArbeiten"] }],
  hl: [
    { title: "Auszuführende Arbeiten", num: "I", steps: ["Arbeitszeit", "hlArbeiten"] },
    { title: "Material für Handläufe", num: "II", steps: ["hlk"] },
  ],
};
/** the group that starts with this step, if any */
export const groupStartingAt = (type: NewOfferType, step: string): StepGroup | undefined =>
  STEP_GROUPS[type]?.find((g) => g.steps[0] === step);

/** What a step still needs before "Weiter" goes on. */
export interface StepProblem {
  message: string;
  /** the step the missing entry is on, when it is not this one */
  goTo?: string;
  /** selector of the first control to fill in */
  focus?: string;
}
const CHECKS = new Map<string, () => StepProblem | null>();
/** A screen says what its step needs (the frame around the steps does not know the screens). */
export const setStepCheck = (step: string, check: () => StepProblem | null): void => { CHECKS.set(step, check); };
export const checkStep = (step: string): StepProblem | null => CHECKS.get(step)?.() ?? null;
