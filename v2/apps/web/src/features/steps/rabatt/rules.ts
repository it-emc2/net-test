// Aufschlag / Rabatt, the discount part — the rules of today's UI (test/fixtures/rabatt.json,
// v2/scripts/capture-rabatt.cjs).
//  - "Kein Rabatt" / "Rabatt hinzufügen" is an opt-in; "Kein Rabatt" sets discount and both
//    bonuses back
//  - the discount on materials (0–9 %) is only for Kassenkunde with a markup of at least 50 %;
//    when that no longer holds, a discount that was set goes back to 0
//  - the Neukundenbonus is offered only above the offer's threshold (the total after the
//    discount); below it a ticked bonus is unticked. Offers from before the bonus was a setting
//    keep their old rule (300 € from 3.000 €) and are never unticked
//  - the free grab bar is offered only while an eligible grab bar is in the offer; the list of
//    eligible bars is stored with the offer once the bonus is given, so a later change of the
//    setting does not change this offer
//  - all sums come from the price; nothing is calculated here
import { parsePercent } from "../markup/rules.js";

type Fields = Record<string, unknown>;
export interface Price { [k: string]: unknown }
const n = (v: unknown) => Number(v) || 0;
export const eur = (v: unknown): string => n(v).toLocaleString("de-DE", { style: "currency", currency: "EUR" }).replace(/ /g, " ");

// ---- reading the offer ----
export const isEnabled = (r: Fields): boolean => r.rabattEnabled === true;
/** the discount on materials in percent (stored as a fraction) */
export const percentOf = (r: Fields): number => Math.round(n(r.materialDiscountPct) * 1000) / 10;
export const percentText = (pct: number): string => `${pct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Kassenkunde with a markup of at least 50 % */
export const mayDiscountMaterials = (payer: unknown, markup: unknown): boolean => {
  const key = String(payer ?? "").trim().toLowerCase(), pct = parsePercent(markup);
  return (key === "kassenkunde" || key === "kk") && Number.isFinite(pct) && pct >= 50;
};
export const heading = (payer: unknown): string => {
  const key = String(payer ?? "").trim().toLowerCase();
  return key === "sz" || key === "selbstzahler" ? "Rabatt für Selbstzahler" : key === "kk" || key === "kassenkunde" ? "Rabatt für Kassenkunde" : "Rabatt";
};

// ---- the Neukundenbonus ----
export interface NewCustomerBonus { legacy: boolean; gross: number; threshold: number; text: string }
/** the bonus as this offer has it: the values stored with the offer; an offer without them is from before the setting */
export function newCustomerBonus(pricingRules: Fields | null | undefined): NewCustomerBonus {
  const pr = pricingRules ?? {};
  if (pr.bonusNeuGross == null) return { legacy: true, gross: 300, threshold: 3000, text: "Möchten Sie den Neukundenbonus in Höhe von 252,10 € hinzufügen? (Rabatt von 300 € ab einem Gesamtwert von 3.000 €)" };
  const gross = n(pr.bonusNeuGross), threshold = n(pr.bonusNeuThreshold);
  return { legacy: false, gross, threshold, text: `Möchten Sie den Neukundenbonus in Höhe von ${gross.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € brutto hinzufügen? (ab einem Gesamtwert über ${threshold.toLocaleString("de-DE")} €)` };
}
export const newCustomerBonusOffered = (price: Price | null, bonus: NewCustomerBonus): boolean => n(price?.totalAfterRabatt) > bonus.threshold;

// ---- the free grab bar ----
export const GRAB_DEFAULT = ["CLPESG30"];
export const GRAB_REF = "CLPESG30"; // only this bar's value is free; longer bars pay the difference
export const GRAB_TEXT = "Aktion: Haltegriff GRATIS: 1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage.";
/** the eligible bars: the list stored with the offer, else the setting, else the 30 cm bar */
export function grabIds(pricingRules: Fields | null | undefined, config: Fields | null | undefined): string[] {
  const stored = pricingRules?.grabBonusIds, live = config?.GRAB_BONUS_IDS;
  return Array.isArray(stored) && stored.length ? (stored as string[]) : Array.isArray(live) && live.length ? (live as string[]) : GRAB_DEFAULT;
}
export function grabOffered(price: Price | null, ids: readonly string[]): boolean {
  const lines = ((price?.materials as { lines?: { productId?: string; id?: string; qty?: unknown }[] } | undefined)?.lines ?? []);
  return lines.some((l) => ids.includes(String(l.productId || l.id)) && n(l.qty) > 0);
}

// ---- changes (each returns the fields per section of the offer) ----
type Changes = Record<string, Fields>;
/** the eligible bars are stored only while the bonus is given, and only when the list is not the old 30 cm rule */
const grabSnapshot = (on: boolean, ids: readonly string[]): Fields => ({ grabBonusIds: on && JSON.stringify(ids) !== JSON.stringify(GRAB_DEFAULT) ? [...ids] : undefined, grabBonusRefId: on ? GRAB_REF : undefined });
export const setEnabled = (on: boolean): Changes => (on
  ? { rabatt: { rabattEnabled: true, "rb-add-rabatt": "ja" } }
  : { rabatt: { rabattEnabled: false, "rb-add-rabatt": "nein", materialDiscountPct: 0, bonus300: false, bonusGrab: false }, pricingRules: grabSnapshot(false, GRAB_DEFAULT) });
export const setPercent = (pct: number): Changes => ({ rabatt: { materialDiscountPct: (Number.isFinite(pct) ? Math.min(9, Math.max(0, pct)) : 0) / 100 } });
export const setNewCustomerBonus = (on: boolean): Changes => ({ rabatt: { bonus300: on } });
export const setGrabBonus = (on: boolean, ids: readonly string[]): Changes => ({ rabatt: { bonusGrab: on }, pricingRules: grabSnapshot(on, ids) });
/** What the page takes back by itself once the price is known; null: nothing. */
export function corrections(offer: Record<string, Fields | undefined>, price: Price | null, config: Fields | null | undefined): Changes | null {
  const r = offer.rabatt ?? {}, kd = offer.Kundendaten ?? {};
  if (!isEnabled(r)) return null;
  const out: Changes = {};
  const add = (c: Changes) => { for (const [k, v] of Object.entries(c)) out[k] = { ...(out[k] ?? {}), ...v }; };
  if (n(r.materialDiscountPct) !== 0 && !mayDiscountMaterials(kd.payer, kd.aufschlag)) add(setPercent(0));
  if (price) {
    const bonus = newCustomerBonus(offer.pricingRules);
    if (r.bonus300 === true && !bonus.legacy && !newCustomerBonusOffered(price, bonus)) add(setNewCustomerBonus(false));
    if (r.bonusGrab === true && !grabOffered(price, grabIds(offer.pricingRules, config))) add(setGrabBonus(false, GRAB_DEFAULT));
  }
  return Object.keys(out).length ? out : null;
}

// ---- what the page shows ----
export interface Overview { rows: { num: string; label: string; value: string }[]; net: string; vat: string; total: string }
/** the sums of the offer, with the numbers of the step groups (Badumbau only) */
export function overview(price: Price | null, type: string | null, pricingRules: Fields | null | undefined, markupText: unknown): Overview {
  const optional = n((price?.optionalDisplayUI as { sum?: unknown } | undefined)?.sum);
  const materials = optional ? n((price?.materialsDisplayUI as { sum?: unknown } | undefined)?.sum) : n(price?.productsSubtotal);
  const num = (s: string) => (type === "bu" ? s : "");
  let pct = price?.markupPct as number | undefined;
  pct = Number.isFinite(pct) ? (pct as number) * 100 : Number.isFinite(parsePercent(markupText)) ? parsePercent(markupText) : 0;
  const pctLabel = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return {
    rows: [
      { num: num("I"), label: "Auszuführende Arbeiten", value: eur((price?.services as { sum?: unknown } | undefined)?.sum) },
      { num: num("II"), label: "Material für Badumbau", value: eur(materials) },
      ...(optional ? [{ num: num("III"), label: "Optionale Produkte", value: eur(optional) }] : []),
      { num: "", label: `Aufschlag ${pctLabel}%${pricingRules?.kleinInAufschlag === false ? " (ohne Kleinmaterial)" : ""}`, value: eur(price?.markup) },
    ],
    net: eur(price?.Nettobetrag), vat: eur(price?.baseVat), total: eur(price?.base_total),
  };
}
export interface Results { discount: string; afterDiscount: string; afterBonus: string; empty: boolean }
/** the lines under the controls: the discount and the total after it, the total after the bonuses */
export function results(r: Fields, price: Price | null): Results {
  const hasDiscount = percentOf(r) > 0, anyBonus = r.bonus300 === true || r.bonusGrab === true || n(price?.bonusGross) > 0;
  return { discount: hasDiscount ? eur(price?.rabattAmount) : "", afterDiscount: hasDiscount ? eur(price?.totalAfterRabatt) : "", afterBonus: anyBonus ? eur(price?.total) : "", empty: !hasDiscount && !anyBonus };
}
