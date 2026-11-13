// Markup (Aufschlag) — the rules of today's UI, recorded for the offer types that have it
// (test/fixtures/kundendaten-markup.json). Minimum values and zones come from @oc/pricing
// (the same file today's UI loads).
//
// Stored in two places, as today:
//  - the text as typed ("37,5"): `rabatt.sonderaufschlagValue` — for Badelift, which has no
//    Aufschlag / Rabatt step, `Kundendaten.sonderaufschlagValue`
//  - the value the price uses: `Kundendaten.aufschlag` = "37.5%" (missing while the text is no number)
//  - `Kundendaten.aufschlagBegruendung`: the reason, only while the value is under the minimum
import { aufschlagMin, isBelowAufschlagMin } from "@oc/pricing";
import { useOfferStore, type StepProblem } from "../../offer/index.js";

type Fields = Record<string, unknown>;
export const CHIPS = [35, 40, 45, 50, 60] as const;

/** where the typed text is stored; null: this offer type has no markup (Alltagshilfe) */
export function markupTextSection(type: string | null): "rabatt" | "Kundendaten" | null {
  return type === "bu" || type === "bwt" || type === "hl" ? "rabatt" : type === "bl" ? "Kundendaten" : null;
}

/** "37,5" / "40 %" → 37.5 / 40; no number → NaN (today's parseAufschlagPercent) */
export function parsePercent(raw: unknown): number {
  const m = String(raw ?? "").trim().match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1]!.replace(",", ".")) : NaN;
}
/** a number as the field shows it: 37.5 → "37,5" */
export const percentText = (pct: number): string => String(pct).replace(".", ",");

/** the reason is stored only under the minimum of the payer, and only when there is one */
const reasonField = (pct: number, payer: unknown, reason: unknown): unknown =>
  isBelowAufschlagMin(pct, payer) && String(reason ?? "").trim() ? String(reason).trim() : undefined;

/** All fields that change when the markup text, the payer or the reason changes. */
export function markupChanges(type: string | null, raw: string, payer: unknown, reason: unknown): Record<string, Fields> {
  const section = markupTextSection(type);
  if (!section) return {};
  const pct = parsePercent(raw);
  const kd: Fields = { aufschlag: Number.isFinite(pct) ? `${pct}%` : undefined, aufschlagBegruendung: reasonField(pct, payer, reason) };
  return section === "Kundendaten" ? { Kundendaten: { ...kd, sonderaufschlagValue: raw } } : { Kundendaten: kd, rabatt: { sonderaufschlagValue: raw } };
}

export interface MarkupView {
  pct: number;
  min: number;
  below: boolean;
  /** shown under the field; "" = nothing to show */
  error: string;
  minLabel: string;
  warning: string;
  reasonLabel: string;
  reasonMissing: boolean;
}
/** What the markup part shows for a text, a payer and a reason. `report`: "Weiter" was pressed. */
export function markupView(raw: string, payer: unknown, reason: unknown, report = false): MarkupView {
  const pct = parsePercent(raw);
  const min = aufschlagMin(payer);
  const below = isBelowAufschlagMin(pct, payer);
  const who = payer === "Kassenkunde" ? "Kassenkunden" : payer === "Selbstzahler" ? "Selbstzahler" : "dieses Angebot";
  return {
    pct, min, below,
    error: !raw.trim() ? (report ? "Bitte geben Sie einen Aufschlag ein." : "") : Number.isFinite(pct) ? "" : "Bitte geben Sie eine gültige Zahl ein.",
    minLabel: `Mindestwert${payer === "Kassenkunde" || payer === "Selbstzahler" ? ` ${payer}` : ""}: ${min} %`,
    warning: below ? `Aufschlag liegt unter dem Mindestwert für ${who} (${min} %) – bitte kurz begründen (keine Freigabe nötig).` : "",
    reasonLabel: `Begründung für Aufschlag unter ${min} %`,
    reasonMissing: below && !String(reason ?? "").trim(),
  };
}

/** "Weiter": the markup must be a number, and under the minimum it needs a reason (as today).
 *  From then on the markup part shows what is missing; the user is taken to the step it is on. */
export function markupProblem(): StepProblem | null {
  const st = useOfferStore.getState();
  const o = st.offer as Record<string, any> | null;
  const section = markupTextSection(o?.activeOffer ?? null);
  if (!o || !section) return null;
  const view = markupView(String(o[section]?.sonderaufschlagValue ?? ""), o.Kundendaten?.payer, o.Kundendaten?.aufschlagBegruendung, true);
  if (!view.error && !view.reasonMissing) return null;
  st.remember("markupReported", true);
  return { message: "Bitte prüfen Sie die rot markierten Pflichtfelder.", goTo: section === "rabatt" ? "Rabatt" : "Kundendaten", focus: view.error ? "#markup-value" : "#markup-reason" };
}
