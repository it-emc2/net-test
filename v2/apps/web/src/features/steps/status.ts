// Step status for the step list (U-011 D2), derived from the offer — nothing is stored, so old
// offers show it too. Rules:
//  - a switched-off material step is "off" (does not count); old offers without the switch use
//    the same fallback as their screens (isOn / trayOn)
//  - a step whose check (setStepCheck) finds a problem → warning with the check's text
//  - "done" = no problem AND has content (not "visited"); otherwise "open"
//  - Angebotscheck: rows that are not green ("Nicht nötig" rows are green) → "n offen"
//  - steps without a rule here (costs, summary, type-specific steps …) → "none", not counted
import type { NewOfferType } from "@oc/domain";
import { checkStep, type StepStatus } from "../offer/index.js";
import { check, type Price } from "./angebotscheck/rules.js";
import { isOn as isDa } from "./duschabtrennung/rules.js";
import { trayOn } from "./duschwanne/rules.js";
import { hasContent as ahHasContent } from "./ah/rules.js";
import { finOf, touched as finTouched, vpValue, warningsOf as finWarnings } from "./ah/fin-rules.js";
import { isOn as isDv } from "./duschvorhang/rules.js";

type F = Record<string, any>;
const obj = (v: unknown): F => (v && typeof v === "object" ? (v as F) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pos = (v: unknown) => Number(String(v ?? "").replace(",", ".")) > 0;
const isCurtain = (q: F) => String(q?.kind ?? "").toLowerCase() === "config" && q.group === "Duschvorhang";

/** switch + content of the steps that have one: [on, hasContent] */
function material(step: string, o: F): [boolean, boolean] | null {
  const dw = obj(o.duschwanne), da = obj(o.duschabtrennung), wv = obj(o.wandverkleidung), dv = obj(o.duschvorhang);
  switch (step) {
    case "Duschwanne": return [trayOn(dw), !!String(dw.chosenTrayProductId ?? "").trim() || !!dw.dwCustomName || !!String(dw.chosenBathtubProductId ?? "").trim()];
    case "Fussboden": return [dw.addFlooring === true, true];
    case "Wandverkleidung": return [wv.wvEnabled === true, arr(wv.panelConfigs).length > 0 || arr(wv.wvWwRows).length > 0 || pos(wv.wvArea) || pos(wv.wvKQty) || Object.keys(wv).some((k) => k.startsWith("wvWwQty_") && pos(wv[k]))];
    case "DuschabtrennungNeu": return [isDa(da), arr(obj(da.configurator).lines).length > 0 || arr(da.quickAdd).some((q) => !isCurtain(obj(q)))];
    case "Duschvorhang": return [isDv(da, dv), arr(obj(dv.configurator).lines).length > 0 || arr(da.quickAdd).some((q) => isCurtain(obj(q)))];
    default: return null;
  }
}
/** content of the other steps; undefined = no rule */
function content(step: string, o: F): boolean | undefined {
  switch (step) {
    case "Kundendaten": { const k = obj(o.Kundendaten); return !![k.lastName, k.firstName, k.kundenName].some((v) => String(v ?? "").trim()); }
    case "Arbeitszeit": return pos(obj(o.Arbeitszeit).totalHoursNumeric) || pos(obj(o.Arbeitszeit).ArbeitHoursNumeric);
    case "Arbeiten": return arr(obj(o.duschwanne).workTasks).length > 0;
    case "ah": return ahHasContent(obj(o.ah)); // Alltagshilfe: a service with a duration and a rhythm (over budget is a choice, not a warning)
    // Alltagshilfe: done once the page was used or a source is ticked (Selbstzahler: nothing to do → not counted)
    case "Finanzierung": { if (String(obj(o.Kundendaten).payer || "") === "Selbstzahler") return undefined; const x = finOf(o.Finanzierung); return finTouched(o.Finanzierung) || x.eb || x.um || vpValue(x) > 0; }
    case "Optional": { const op = obj(o.optional); return Object.keys(op).some((k) => (k.startsWith("qty_") && pos(op[k])) || (k.startsWith("opt_") && op[k] === true)); }
    default: return undefined;
  }
}

export function statuses(type: NewOfferType, offer: unknown, price: unknown): Record<string, StepStatus> {
  const o = obj(offer);
  const out: Record<string, StepStatus> = {};
  const steps = type === "bu" ? ["Kundendaten", "Arbeitszeit", "Arbeiten", "Duschwanne", "Fussboden", "Wandverkleidung", "DuschabtrennungNeu", "Duschvorhang", "Optional", "Rabatt", "Angebotscheck"] : type === "ah" ? ["Kundendaten", "Arbeitszeit", "ah", "Finanzierung"] : ["Kundendaten", "Arbeitszeit", "Rabatt"];
  for (const step of steps) {
    if (step === "Angebotscheck") {
      if (!price) { out[step] = { kind: "none" }; continue; }
      const open = check(o, price as Price).groups.reduce((n, g) => n + g.rows.filter((r) => r.status !== "gruen").length, 0);
      out[step] = open ? { kind: "check", open } : { kind: "done" };
      continue;
    }
    const m = material(step, o);
    if (m && !m[0]) { out[step] = { kind: "off" }; continue; }
    // Alltagshilfe · Finanzierung: a ticked source without a qualifying Pflegegrad is a warning (never blocks)
    const finWarn = step === "Finanzierung" ? finWarnings(o) : [];
    if (finWarn.length) { out[step] = { kind: "warn", reason: finWarn.join(" · ") }; continue; }
    const problem = checkStep(step);
    if (problem) { out[step] = { kind: "warn", reason: problem.message }; continue; }
    const has = m ? m[1] : content(step, o);
    out[step] = has === undefined ? { kind: "none" } : { kind: has ? "done" : "open" };
  }
  return out;
}
