// Wandverkleidung, line VIGOUR — the rules of today's UI (test/fixtures/wv-vigour.json,
// v2/scripts/capture-wv-vigour.cjs).
//  - one row = colour (or Sonderdruck) + width (997 / 1497 mm) + number of panels. The rows are
//    a view of the older fields, which stay the data: per width the first row is the main
//    panel (`wvQty997`, `panelConfigs`), further rows are "extra colours" (`extraColors`), and
//    the first row's colour is the global `wvColor`; a width's own colour is `wvColor_<width>`
//  - with every change of the rows the adhesive is 2 bags per panel
//  - the first panel switches sealing, adhesive, silicone and end profile on; the last one
//    going switches them off. In between, a switch the user changed stays
//  - a switch with a quantity: on gives 1 (or keeps the number), off gives 0, and a quantity
//    above 0 switches on
import { resolveWvArticle, vigourPanelPlan } from "@oc/pricing";
import type { Plan, Situation, WallKey } from "./calc.js";
import { VG_COLORS } from "./colors.js";

type Fields = Record<string, unknown>;
export interface VRow { size: 997 | 1497; qty: number; color: string }
export const SIZES = [997, 1497] as const;
export const SONDER = "Sonderdekor";
export const colorLabel = (value: string): string => (value === SONDER ? "Sonderdruck (Vigour)" : value);
export const colorImage = (value: unknown): string => VG_COLORS.find((c) => c.value === value)?.img ?? "";
const PANEL_VALUE: Record<number, string> = { 997: "Wandverkleidung 3.0 Alu 997x2550 VIGOUR V3WVK09", 1497: "Wandverkleidung 3.0 Alu 1497x2550 VIGOUR V3WVK09" };
const key = (size: number) => `${size}x2550`;
const globalColor = (wv: Fields) => String(wv.wvColor || "Marmor weiß");

/** the rows as the fields say: per width the main panel, then its extra colours */
export function rowsOf(wv: Fields): VRow[] {
  const table = (wv.panelConfigs ?? {}) as Record<string, { enabled?: boolean; qty?: unknown; extras?: { color?: unknown; qty?: unknown }[] }>;
  const extraColors = (wv.extraColors ?? {}) as Record<string, { color?: unknown; qty?: unknown }[]>;
  const out: VRow[] = [];
  for (const size of SIZES) {
    const cfg = table[key(size)];
    const qty = Number(cfg?.qty) || 0;
    if (cfg?.enabled && qty > 0) out.push({ size, qty, color: String(wv[`wvColor_${size}`] || globalColor(wv)) });
    for (const e of extraColors[key(size)] ?? cfg?.extras ?? []) { const q = Math.round(Number(e.qty)) || 0, c = String(e.color ?? "").trim(); if (q > 0 && c) out.push({ size, qty: q, color: c }); }
  }
  return out;
}
export const totalPanels = (rows: readonly VRow[]): number => rows.reduce((a, r) => a + (r.qty > 0 ? r.qty : 0), 0);

const pair = (flag: string, valueKey: string | null, value: string, qtyKey: string | null) => (on: boolean, qty?: number): Fields =>
  ({ [flag]: on, ...(valueKey ? { [valueKey]: on ? value : undefined } : {}), ...(qtyKey ? { [qtyKey]: String(on ? qty ?? 1 : 0) } : {}) });
const SEALING = pair("wvSealingSelected", "wvSealing", "TRINNITY Wandabdichtung BASIS TRWDSET5", null);
const ADHESIVE = pair("wvFlachenSelected", "flechenkleber", "Flächenkleber R_4260602", "wvFlachenQty");
const SILICONE = pair("wvSilikonSelected", "wvSilikon", "silikon", "wvSilikonQty");
const END_PROFILE = pair("wvEndProfileSelected", "wvEndProfile", "Abschlussprofil V3A", "wvEndProfileQty");
const CONNECTING = pair("wvV3VSelected", null, "", "wvV3VQty");
export const SWITCHES = {
  sealing: { set: SEALING, flag: "wvSealingSelected", qty: null, caption: "Wandabdichtung BASIS-Set", small: "TRINNITY · TRWDSET5" },
  adhesive: { set: ADHESIVE, flag: "wvFlachenSelected", qty: "wvFlachenQty", caption: "Flächenkleber", small: "R_4260602" },
  silicone: { set: SILICONE, flag: "wvSilikonSelected", qty: "wvSilikonQty", caption: "Silikon", small: "Kartuschen" },
  endProfile: { set: END_PROFILE, flag: "wvEndProfileSelected", qty: "wvEndProfileQty", caption: "Abschlussprofil V3A", small: "255 cm silber eloxiert · nicht automatisch berechnet, bitte prüfen" },
  connecting: { set: CONNECTING, flag: "wvV3VSelected", qty: "wvV3VQty", caption: "Verbindungsprofil V3V", small: "255 cm silber eloxiert · an Außenecken nicht nötig" },
} as const;
export type SwitchKey = keyof typeof SWITCHES;
const qtyOf = (wv: Fields, k: SwitchKey) => { const q = SWITCHES[k].qty; return q ? Math.max(0, Math.round(Number(wv[q]) || 0)) : 0; };
/** a switch: on keeps the number or gives one, off gives none */
export const toggleSwitch = (wv: Fields, k: SwitchKey, on: boolean): Fields => SWITCHES[k].set(on, qtyOf(wv, k) || 1);
/** a quantity: above 0 switches on, 0 switches off */
export const setQty = (k: SwitchKey, qty: number): Fields => { const n = Math.max(0, Math.round(qty) || 0); return SWITCHES[k].set(n > 0, n); };

/** Rows → fields. `wv`: the offer's section before the change (for what stays). */
export function fromRows(wv: Fields, list: readonly VRow[]): Fields {
  const clean = list.filter((r) => r.qty > 0);
  const g = clean[0]?.color || globalColor(wv);
  const of = (size: number) => clean.filter((r) => r.size === size);
  const anyExtras = SIZES.some((size) => of(size).length > 1);
  const table: Record<string, Fields> = {}, extraColors: Record<string, Fields[]> = {}, fields: Fields = {};
  for (const size of SIZES) {
    const mine = of(size), main = mine[0];
    const own = main && main.color !== g ? main.color : "";
    const extras = mine.slice(1).map((r) => ({ color: r.color, qty: r.qty }));
    fields[`wvQty${size}`] = String(main?.qty ?? 0);
    fields[`wvColor_${size}`] = own;
    table[key(size)] = { color: own || g, enabled: !!main, ...(anyExtras ? { extras } : {}), overrideColor: own, qty: main?.qty ?? 0 };
    extraColors[key(size)] = extras;
  }
  const panels = SIZES.filter((size) => of(size).length).map((size) => PANEL_VALUE[size]!);
  const total = totalPanels(clean), before = totalPanels(rowsOf(wv));
  const edge = total === 0 ? false : before === 0 ? true : null; // first panel: consumables on; last one gone: off
  return {
    ...fields, wvColor: g, panelConfigs: table, extraColors: anyExtras ? extraColors : undefined, "wvPanels[]": panels.length ? panels : undefined,
    ...(edge === null ? {} : { ...SEALING(edge), ...SILICONE(edge, edge ? qtyOf(wv, "silicone") || 1 : 0), ...END_PROFILE(edge, edge ? qtyOf(wv, "endProfile") || 1 : 0) }),
    ...ADHESIVE(total > 0, 2 * total),
  };
}
export const addRow = (rows: readonly VRow[], wv: Fields): VRow[] => { const last = rows[rows.length - 1]; return [...rows, { size: last?.size ?? 997, qty: 1, color: last?.color ?? globalColor(wv) }]; };

// ---- the wall calculator on this line ----
export const NOTE = "Vigour-Paneele gibt es 99,7 und 149,7 cm breit, 255 cm hoch. Wandsituation wählen und die Breiten eintragen — der Rechner wählt die im Einkauf günstigste Kombination.";
export const MAX_HEIGHT = 255;
/** the two articles of the offer's colour — their purchase prices decide the cheapest mix */
export function articles(wv: Fields): { 997: string; 1497: string } {
  const color = (size: number) => String(wv[`wvColor_${size}`] || globalColor(wv));
  return { 997: String(resolveWvArticle("997x2550", color(997), "", "V3WVK09")), 1497: String(resolveWvArticle("1497x2550", color(1497), "", "V3WV09")) };
}
export type Prices = Record<string, number> | undefined;
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
export function planFor(wv: Fields, sit: Situation, widths: Partial<Record<WallKey, number>>, prices: Prices): Plan & { qty997: number; qty1497: number } {
  const a = articles(wv);
  return vigourPanelPlan(sit, widths, { heightCm: num(wv.wvKHoehe) as never, prices: { 997: prices?.[a[997]], 1497: prices?.[a[1497]] } as never }) as never;
}
export const mixText = (plan: { qty997: number; qty1497: number }): string => [plan.qty1497 ? `${plan.qty1497} × 1497` : "", plan.qty997 ? `${plan.qty997} × 997` : ""].filter(Boolean).join(" + ");
/** the rows a group of walls with one colour needs */
export const rowsForPlan = (plan: { qty997: number; qty1497: number }, color: string): VRow[] =>
  [...(plan.qty997 ? [{ size: 997 as const, qty: plan.qty997, color }] : []), ...(plan.qty1497 ? [{ size: 1497 as const, qty: plan.qty1497, color }] : [])];
