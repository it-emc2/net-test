// Alltagshilfe · Finanzierung (UX-CHANGES U-050: a redesign of today's page, mock approved by the
// owner 2026-11-20). Stored exactly as today's page stores it (src/public/index.html
// #form-Finanzierung, formToObject; restoreFinanzierung):
//  - Finanzierung = the WHOLE form on every change, in the page's order: ahEntlastungsbetragNutzen
//    "on" (absent when not ticked), the seven checklist ticks clEntlastungAusgeschoepft …
//    clKostenvoranschlag ("on"/absent), ahVerhinderungspflegeMonat (always, the number as a string,
//    "0" = not used), ahUmwidmungBeantragt ("on"/absent), ahUmwidmungBetrag (always, "" or the number)
//  - read back as today: a tick is on for "on"/true; Verhinderungspflege = Number(value) || 0
//  - the price follows the ticks (ADR 028: ahOfferTotals) — the Pflegegrad never refuses a deduction
// Different from today (U-050): Verhinderungspflege as tick + − / + in 10 € steps up to the monthly
// maximum (config / 12, 201,50 € — today's slider stopped at 201 €) with shortcut chips; the
// Umwidmung amount can be stepped or typed; the checklist folds; Selbstzahler sees no funding.
// Owner decision 1 (2026-11-20) — the Pflegegrad decides DEFAULTS and WARNINGS only:
//  - Entlastungsbetrag starts ticked when the Pflegegrad is answered with a level (1–5 or
//    "beantragt"), unticked with "Nein" / no answer; a source ticked without a qualifying level gets
//    a warning line („Kein Pflegegrad hinterlegt“, „Erst ab Pflegegrad 2“) — nothing blocks (U-011)
//  - "never touched" = the stored Finanzierung has no `ahVerhinderungspflegeMonat` key: today's page
//    and this page store it with EVERY write; the automatic default writes only
//    `ahEntlastungsbetragNutzen`. New offers start with an empty Finanzierung (@oc/domain emptyOffer).
//    Opening an offer never writes (funding.ts reacts to answers given in Kundendaten only).
import type { AhOfferTotals } from "@oc/pricing";
import type { AhConfig } from "../../offer/index.js";

type F = Record<string, any>;
const obj = (v: unknown): F => (v && typeof v === "object" ? (v as F) : {});
const isOn = (v: unknown) => v === true || v === "on" || v === "true" || v === 1 || v === "1";

/** today's checklist: stored name → label (index.html, unchanged) */
export const CHECKLIST: readonly (readonly [string, string])[] = [
  ["clEntlastungAusgeschoepft", "Entlastungsbetrag bereits ausgeschöpft oder bei anderem Anbieter?"],
  ["clVerhinderungGenutzt", "Verhinderungspflege schon genutzt dieses Jahr?"],
  ["clSachleistungPflegedienst", "Pflegesachleistungen — wird ein ambulanter Pflegedienst genutzt?"],
  ["clKombileistung", "Kombileistung möglich? (Pflegegeld + Sachleistung)"],
  ["clRueckwirkend", "Rückwirkende Ansprüche geprüft (bis zu 4 Jahre Entlastungsbetrag)?"],
  ["clSteuerhinweis", "Kunde auf steuerliche Absetzbarkeit hingewiesen (§ 35a, auch ohne Pflegegrad)?"],
  ["clKostenvoranschlag", "Kostenvoranschlag erstellen lassen?"],
];

export interface Fin {
  eb: boolean; checks: Record<string, boolean>; vp: string; um: boolean; umBetrag: string;
}
/** the stored Finanzierung as the page reads it (restoreFinanzierung) */
export function finOf(fin: unknown): Fin {
  const f = obj(fin);
  return {
    eb: isOn(f.ahEntlastungsbetragNutzen),
    checks: Object.fromEntries(CHECKLIST.map(([k]) => [k, isOn(f[k])])),
    vp: String(f.ahVerhinderungspflegeMonat ?? "0") || "0",
    um: isOn(f.ahUmwidmungBeantragt),
    umBetrag: f.ahUmwidmungBetrag === undefined || f.ahUmwidmungBetrag === null ? "" : String(f.ahUmwidmungBetrag),
  };
}
/** the whole form as today's formToObject stores it (absent ticks → undefined = removed by the store) */
export function finFields(x: Fin): F {
  const on = (b: boolean) => (b ? "on" : undefined);
  return {
    ahEntlastungsbetragNutzen: on(x.eb),
    ...Object.fromEntries(CHECKLIST.map(([k]) => [k, on(!!x.checks[k])])),
    ahVerhinderungspflegeMonat: x.vp,
    ahUmwidmungBeantragt: on(x.um),
    ahUmwidmungBetrag: x.umBetrag,
  };
}
export const touched = (fin: unknown) => Object.hasOwn(obj(fin), "ahVerhinderungspflegeMonat");
export const checkedCount = (x: Fin) => CHECKLIST.filter(([k]) => x.checks[k]).length;

// ---- amounts ----
export const STEP = 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** the monthly Verhinderungspflege maximum: a twelfth of the yearly budget (today's slider max) */
export const vpMax = (cfg: AhConfig) => r2(cfg.verhinderungspflegeJahr / 12);
export const vpValue = (x: Fin) => Number(x.vp) || 0;
/** − / + : to the next 10 € step within 10 … max (a value off the grid goes to the next grid value) */
export function stepAmount(value: number, dir: 1 | -1, max = Infinity, min = STEP): number {
  const next = dir > 0 ? Math.floor(value / STEP + 1e-9) * STEP + STEP : Math.ceil(value / STEP - 1e-9) * STEP - STEP;
  return r2(Math.min(max, Math.max(min, next)));
}
/** the stored string of an amount ("50", "201.5") */
export const amountText = (n: number) => String(r2(n));
/** what is left of the monthly net after the other sources (Entlastungsbetrag, Umwidmung) — „Rest decken“ */
export function vpRest(t: AhOfferTotals, cfg: AhConfig): number {
  const rest = r2(Math.max(0, t.net - t.deductions.entlastungsbetrag - t.deductions.umwidmung));
  return Math.min(vpMax(cfg), rest);
}
/** a fresh tick of Verhinderungspflege starts at „Rest decken“, or 50 € when nothing is left */
export const vpFirst = (t: AhOfferTotals, cfg: AhConfig) => { const r = vpRest(t, cfg); return r > 0 ? r : Math.min(50, vpMax(cfg)); };
/** a typed euro amount: "87", "87,35", "87.35", "1.250,50" → number; anything else → null */
export function parseEuroInput(s: string): number | null {
  const t = s.trim().replace(/\s*€$/, "");
  if (!t) return 0;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = /,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---- Pflegegrad: defaults and warnings (owner decision 1) ----
export interface Care { level: string; /** "1"…"5" | "beantragt" | "" */ answered: boolean; p2: string; zwei: boolean }
export function careOf(offer: unknown): Care {
  const kd = obj(obj(offer).Kundendaten);
  const level = kd.hasPflegegrad === "Ja" ? String(kd.pflegegrad ?? "") : "";
  return { level, answered: kd.hasPflegegrad === "Ja" || kd.hasPflegegrad === "Nein", p2: String(kd.p2Pflegegrad ?? ""), zwei: isOn(kd.ahZweiPersonen) };
}
export const hasLevel = (c: Care) => !!c.level;
/** the Entlastungsbetrag default for these Kundendaten answers */
export const ebDefault = (c: Care) => hasLevel(c);
/** „Pflegegrad 3“, „Pflegegrad beantragt“, or nothing */
export const levelText = (c: Care) => (c.level === "beantragt" ? "Pflegegrad beantragt" : c.level ? `Pflegegrad ${c.level}` : "");
export const NO_LEVEL = "Kein Pflegegrad hinterlegt";
export const FROM_2 = "Erst ab Pflegegrad 2";
export const P2_MISSING = "Pflegegrad der 2. Person fehlt";
/** warning of the ticked Entlastungsbetrag */
export function ebWarnings(c: Care): string[] {
  const out: string[] = [];
  if (!hasLevel(c)) out.push(NO_LEVEL);
  if (c.zwei && !c.p2) out.push(P2_MISSING);
  return out;
}
/** warning of a ticked Verhinderungspflege (offered from Pflegegrad 2; "beantragt" is not warned) */
export function vpWarnings(c: Care): string[] {
  if (!hasLevel(c)) return [NO_LEVEL];
  return c.level === "1" ? [FROM_2] : [];
}
/** every warning of the stored ticks (step list) */
export function warningsOf(offer: unknown): string[] {
  const o = obj(offer);
  if (String(obj(o.Kundendaten).payer || "") === "Selbstzahler") return [];
  const x = finOf(o.Finanzierung), c = careOf(o);
  return [...new Set([...(x.eb ? ebWarnings(c) : []), ...(vpValue(x) > 0 ? vpWarnings(c) : [])])];
}
