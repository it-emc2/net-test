// Wandverkleidung (Badumbau) — the rules of today's UI (test/fixtures/wandverkleidung.json,
// v2/scripts/capture-wandverkleidung.cjs). This file covers the frame (switch, product line,
// Ausführung) and the line winwall; the wall calculator is calc.ts, the lines VIGOUR and Badolux
// are vigour.ts and keramico.ts; sketch and note are still edited in today's UI.
//  - off keeps everything that was entered (only `wvEnabled` is false)
//  - each product line stores its own fields; the fields of the other lines are not stored
//    while a line is not chosen, and are back when it is chosen again
//  - winwall: one row = decor + format + number of plates (`wvWwRows`, a JSON text). The rows
//    give the plates per format (`wvWwQty_13` …), and with every change of the rows the
//    suggestions: 2 bags of adhesive per plate; connecting profiles from the wall plan whenever
//    walls are entered (joints on straight walls, none at corners; extra plates add none), else
//    plates − 1 (main ca43ed48)
//  - an accessory set by hand (switch, − / +, typing) is listed in `wvWwAccManual` (comma-separated
//    SKUs) and the suggestions leave it alone from then on (main ca43ed48)
//  - an accessory is in the offer while its quantity is above 0 (`wvWw_<id>: "on"`)
//  - the sealing sets follow the wall area unless a number is typed: a typed Wandfläche, else the
//    calculator's walls × height plus every plate beyond the wall plan, without walls the area of
//    the plates (`winwallSealingArea`, main ca43ed48)
import { WINWALL_CATALOG, winwallArticleFormat, winwallDecorCode, winwallProfileSuggestion, winwallSealingArea, winwallSealingSets } from "@oc/pricing";
import { WW_DECORS } from "./decors.js";

type Fields = Record<string, unknown>;
export type Line = "ww" | "premium" | "standard";

export const KINDS = [
  { value: "Fehlstellen", label: "Nur schließende Fehlstellen" }, { value: "Deckenhoch", label: "Deckenhoch im Dusch-/Wannenbereich" },
  { value: "Fliesenspiegel", label: "Fliesenspiegel" }, { value: "Innenraum-der-Kabine", label: "Innenraum der Kabine" }, { value: "alle-Bad-Wände", label: "Alle Bad-Wände" },
] as const;
export const SHOWER_TASK = "wandverkleidung_duschbereich";

// ---- product line ----
export const LINES: Record<Line, { name: string; sub: string; brand: string }> = {
  ww: { name: "winwall", sub: "WV-WW", brand: "winwall" },
  premium: { name: "VIGOUR", sub: "Haßmann · WV-HM", brand: "Vigour / Hassmann" },
  standard: { name: "Badolux", sub: "Keramico · WV-BX", brand: "Badolux" },
};
export const lineOf = (wv: Fields): Line => (wv.wvBudgetMode ? "standard" : wv.wvSupplier === "ww" ? "ww" : "premium");
const WW_PLATES = ["wvWwDecor", "wvWwDecorCustom", "wvWwQty_13", "wvWwQty_15", "wvWwQty_16", "wvWwQty_17", "wvWwRows"];
const WW_ACCESSORIES = ["wvWwAccManual", "wvWwQty_R_4260602", "wvWwQty_WS80110", "wvWwQty_WS80111", "wvWwQty_WS80112", "wvWwQty_WS80113", "wvWwSealing", "wvWwSealingQty",
  "wvWw_R_4260602", "wvWw_WS80110", "wvWw_WS80111", "wvWw_WS80112", "wvWw_WS80113", "wvWwCut"];
const WW_FIRST: Fields = { wvWwDecor: "WS203", wvWwDecorCustom: "", wvWwQty_13: "0", wvWwQty_15: "0", wvWwQty_16: "0", wvWwQty_17: "0", wvWwRows: "", wvWwQty_R_4260602: "0", wvWwQty_WS80110: "0", wvWwQty_WS80111: "0", wvWwQty_WS80112: "0", wvWwQty_WS80113: "0", wvWwSealing: "on", wvWwSealingQty: "" };
/** VIGOUR: stored only while the line is chosen */
const HM_ONLY = ["wvCorners", "wvCornersCount", "wvEndProfileQty", "wvFlachenQty", "wvQty1497", "wvQty997", "wvSilikonQty", "wvV3VQty", "flechenkleber", "wvSealing", "wvSilikon", "wvEndProfile", "wvPanels[]"];
const HM_FIRST: Fields = { wvCorners: "0", wvCornersCount: "0", wvEndProfileQty: "0", wvFlachenQty: "0", wvQty1497: "", wvQty997: "", wvSilikonQty: "0", wvV3VQty: "0" };
const BX_ONLY = ["wvBxQty_PR101VBM3", "wvBxQty_PR47VBM02", "wvBxQty_PR59VBM03", "wvBxQty_PR59VBM05", "wvBxQty_PR59VBM07", "wvBxQty_PRI130VBM01", "wvBxQty_PRI130VBM02", "wvKRows", "wvMotif"];
const BX_FIRST: Fields = { wvBxQty_PR101VBM3: "0", wvBxQty_PR47VBM02: "0", wvBxQty_PR59VBM03: "0", wvBxQty_PR59VBM05: "0", wvBxQty_PR59VBM07: "0", wvBxQty_PRI130VBM01: "0", wvBxQty_PRI130VBM02: "0", wvKRows: "", wvMotif: "" };
const NO_PANELS = { "1497x2550": { color: "", enabled: false, overrideColor: "", qty: 0 }, "997x2550": { color: "", enabled: false, overrideColor: "", qty: 0 } };
/** Keramico rows switch the offer's consumables on and name its colour; neither stays with another line */
const BX_CONSUMABLES: Fields = { wvSealingSelected: false, wvFlachenSelected: false, wvSilikonSelected: false, wvEndProfileSelected: false };
const gone = (keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, undefined]));

/** What leaving a line does to its fields (recorded for every pair of lines):
 *  - winwall: its plates go; its accessories stay for Badolux (Keramico uses them), not for VIGOUR
 *  - VIGOUR: quantities, colours and the accessory entries go. Towards winwall the panel table
 *    keeps its panels (without colours) and the accessory switches stay — as today; towards
 *    Badolux the panel table is emptied
 *  - Badolux: its rows, motif and accessories go; winwall's accessories go with it towards VIGOUR.
 *    With rows, the colour, the panel table's colour and the consumables go as well */
function leaving(wv: Fields, from: Line, to: Line): Fields {
  if (from === "ww") return gone(to === "premium" ? [...WW_PLATES, ...WW_ACCESSORIES] : WW_PLATES);
  if (from === "standard") return { ...gone(to === "premium" ? [...BX_ONLY, ...WW_ACCESSORIES] : BX_ONLY), ...(wv.wvKRows ? { wvColor: "", panelConfigs: NO_PANELS, ...BX_CONSUMABLES } : {}) };
  const table = (wv.panelConfigs ?? NO_PANELS) as Record<string, Fields>;
  const blank = Object.fromEntries(Object.entries(table).map(([k, c]) => [k, { ...c, color: "", overrideColor: "" }]));
  return { ...gone(HM_ONLY), wvColor: "", wvColor_997: "", wvColor_1497: "", ...(to === "ww" ? { panelConfigs: blank } : { panelConfigs: NO_PANELS, extraColors: undefined }) };
}
/** Changing the line: what the line that is left loses is remembered (`parked`) and is back
 *  when it is chosen again; a line chosen for the first time starts as on a new offer. */
export function chooseLine(wv: Fields, to: Line, parked: Partial<Record<Line, Fields>>): { changes: Fields; parked: Partial<Record<Line, Fields>> } {
  const from = lineOf(wv);
  if (from === to) return { changes: {}, parked };
  const lost = leaving(wv, from, to);
  // Badolux (Keramico) also stores winwall's accessories
  const mine = to === "ww" ? [...WW_PLATES, ...WW_ACCESSORIES] : to === "premium" ? Object.keys(HM_FIRST) : [...BX_ONLY, ...WW_ACCESSORIES];
  const first = to === "ww" ? WW_FIRST : to === "premium" ? HM_FIRST : { ...WW_FIRST, ...BX_FIRST };
  // first time: the line's own fields that are not stored at the moment (Badolux → winwall: the accessories are)
  const fresh = Object.fromEntries(mine.filter((k) => !(k in wv) || k in lost).filter((k) => k in first && !(to === "standard" && WW_PLATES.includes(k))).map((k) => [k, first[k]]));
  return {
    // after Keramico rows the panel quantities of VIGOUR start as "0", not empty (as today)
    changes: { ...lost, ...fresh, ...(from === "standard" && to === "premium" && wv.wvKRows && "wvQty997" in fresh ? { wvQty997: "0", wvQty1497: "0" } : {}), ...(parked[to] ?? {}), wvBudgetMode: to === "standard" ? "1" : undefined, ...(to === "standard" ? { wvWwCut: undefined } : { wvSupplier: to === "premium" ? "hm" : "ww" }) }, // winwall's cutting service is not for Keramico
    // the colour and the panel table are not brought back with Badolux (as today); its rows name them again with the next change
    parked: { ...parked, [from]: Object.fromEntries(Object.keys(lost).filter((k) => !(from === "standard" && (k === "wvColor" || k === "panelConfigs"))).map((k) => [k, wv[k]])) },
  };
}

// ---- winwall rows ----
export interface Row { code: string | null; fmt: string; qty: number; custom?: boolean; text?: string }
export const FORMATS = [["13", "100 × 205 cm"], ["15", "100 × 250 cm"], ["16", "125 × 250 cm"], ["17", "150 × 250 cm"]] as const;
const FORMAT_M2: Record<string, number> = { 13: 2.05, 15: 2.5, 16: 3.125, 17: 3.75 };
const catalog = WINWALL_CATALOG as Record<string, string>;
/** the engine's reading of a typed decor (as today's UI, main 64a75e08 / ff9f81c4): "WS 233" / "ws233" → "WS233";
 *  three digits → NW when the catalogue has it, else WS; an article number from the Muster ("23015", "NW 23013")
 *  → its decor, with a format 13/15/16/17 only; anything else → null */
export const decorCode = (v: unknown): string | null => (winwallDecorCode(v) as string | null) ?? null;
/** the format inside a typed article number ("23013" → "13"), else null */
export const articleFormat = (v: unknown): string | null => (winwallArticleFormat(v) as string | null) ?? null;
const nice = (code: string) => `${code.slice(0, 2)} ${code.slice(2)}`;
export const rowTitle = (r: Row): string => (r.code ? `${catalog[r.code] ? `${catalog[r.code]} · ` : ""}${nice(r.code)}` : r.custom && r.text ? r.text : "Dekor wählen");
/** a row with a typed number that is no decor: its plates are missing in price and offer (red, main 81f73fc7) */
export const isBadRow = (r: Row): boolean => !!r.custom && !r.code;
/** the line under a row's title — winwall plates are always single plates, no set (main 8d04727c) */
export const rowNote = (bad: boolean, open: boolean): string => (bad ? "Dekor-Nr. ungültig (z. B. WS 233) – Zeile fehlt im Preis" : open ? "Dekor wählen" : "Tippen zum Ändern");
export function rowsOf(wv: Fields): Row[] {
  try {
    const arr: unknown = JSON.parse(String(wv.wvWwRows || "null"));
    if (Array.isArray(arr)) return arr.filter((r) => FORMATS.some(([c]) => c === String(r?.fmt))).map((r) => ({ code: r.code || null, fmt: String(r.fmt), qty: Math.max(1, Math.round(Number(r.qty) || 1)), custom: !!r.custom, text: r.text || "" }));
  } catch { /* older offers: no rows */ }
  return [];
}
const isTile = (code: string | null) => !!code && WW_DECORS.some((d) => d.value === code);
/** what the decor tiles show for a row: its tile, or "Anderes Dekor" with the typed number */
export const decorOf = (r: Row | undefined): Fields => (r ? (!r.custom && isTile(r.code) ? { wvWwDecor: r.code, wvWwDecorCustom: "" } : { wvWwDecor: "custom", wvWwDecorCustom: r.custom ? r.text || "" : "" }) : {});
const accessory = (id: string, qty: number): Fields => ({ [`wvWwQty_${id}`]: String(qty), [`wvWw_${id}`]: qty > 0 ? "on" : undefined });
/** the accessories set by hand (`wvWwAccManual`) — the suggestions do not touch them */
export const manualOf = (wv: Fields | undefined): Set<string> => new Set(String(wv?.wvWwAccManual ?? "").split(",").filter(Boolean));
const markManual = (wv: Fields, id: string): Fields => ({ wvWwAccManual: [...new Set([...manualOf(wv), id])].join(",") });
/** a suggestion for an accessory — nothing when it was set by hand */
export const suggest = (wv: Fields | undefined, id: string, qty: number): Fields => (manualOf(wv).has(id) ? {} : accessory(id, qty));

/** The fields the rows give: the rows themselves, the plates per format and the suggestions.
 *  `plan`: the wall calculator's plan — with walls entered, the connecting profiles are its
 *  joints on straight walls (none at corners); without walls plates − 1. `wv`: the section as it
 *  is (its hand-set accessories stay). */
export function fromRows(rows: readonly Row[], plan?: { qty?: Record<string, number>; pieces?: unknown[] } | null, wv?: Fields): Fields {
  const perFormat = Object.fromEntries(FORMATS.map(([c]) => [c, rows.filter((r) => r.fmt === c && r.code).reduce((a, r) => a + r.qty, 0)]));
  const plates = Object.values(perFormat).reduce((a, n) => a + n, 0);
  const profiles = plan?.pieces?.length ? Number((winwallProfileSuggestion(plan) as { WS80113: number }).WS80113) || 0 : Math.max(0, plates - 1);
  return {
    wvWwRows: JSON.stringify(rows.map((r) => ({ code: r.code, fmt: r.fmt, qty: r.qty, ...(r.custom ? { custom: true, text: r.text || "" } : {}) }))),
    ...Object.fromEntries(FORMATS.map(([c]) => [`wvWwQty_${c}`, String(perFormat[c])])),
    ...suggest(wv, "R_4260602", 2 * plates), ...suggest(wv, "WS80113", profiles),
  };
}
export function addRow(rows: readonly Row[], wv: Fields): Row[] {
  const last = rows[rows.length - 1];
  const picked = decorCode(wv.wvWwDecor === "custom" ? wv.wvWwDecorCustom : wv.wvWwDecor);
  return [...rows, { code: last ? last.code : picked || "WS203", fmt: last?.fmt || "15", qty: 1, custom: !!last?.custom, text: last?.text || "" }];
}
/** a decor tile, or a typed number, for one row */
export const withDecor = (r: Row, value: string, text = ""): Row => (value === "custom" ? { ...r, custom: true, text, code: decorCode(text), fmt: articleFormat(text) || r.fmt } : { ...r, custom: false, text: "", code: decorCode(value) });

const FORMAT_TEXT: Record<string, string> = { 13: "100 × 205 cm", 15: "100 × 250 cm", 16: "125 × 250 cm", 17: "150 × 250 cm" };
/** the hint under the number field of "Anderes Dekor" (today's syncWwCustomDecor) */
export function customHint(wv: Fields): { text: string; kind: "" | "ok" | "warn" } {
  const raw = String(wv.wvWwDecorCustom ?? "").trim();
  if (wv.wvWwDecor !== "custom" || !raw) return { text: "Dekor-Nr. (z. B. NW 230) oder Artikel-Nr. vom Muster (z. B. 23015).", kind: "" };
  const code = decorCode(raw), fmt = articleFormat(raw);
  if (!code) return { text: "Nicht erkannt. Dekor-Nr. (NW 230) oder Artikel-Nr. mit Format 13/15/16/17 (23015).", kind: "warn" };
  return catalog[code] ? { text: `✓ ${catalog[code]}${fmt ? ` · Format ${FORMAT_TEXT[fmt]}` : ""}`, kind: "ok" } : { text: "Nicht im winwall Katalog 2026 – Nummer bitte prüfen. Wird so bestellt.", kind: "warn" };
}
export const customCaption = (wv: Fields): string => { const code = wv.wvWwDecor === "custom" ? decorCode(wv.wvWwDecorCustom) : null; return code ? nice(code) : "Anderes Dekor"; };

// ---- accessories ----
export const ACCESSORIES = [
  { id: "WS80110", caption: "Abschlussprofil", small: "WS80110 · 2550 mm, Alu eloxiert · nicht automatisch, bitte prüfen" },
  { id: "WS80111", caption: "Inneneckprofil", small: "WS80111 · 2550 mm, Alu eloxiert · nicht automatisch, bitte prüfen" },
  { id: "WS80112", caption: "Außeneckprofil", small: "WS80112 · 2550 mm, Alu eloxiert · nicht automatisch, bitte prüfen" },
  { id: "WS80113", caption: "Verbindungsprofil", small: "WS80113 · 2550 mm, Alu eloxiert · Vorschlag: Stöße auf gerader Wand (nicht in Ecken)" },
  { id: "R_4260602", caption: "Flächenkleber Ramsauer 645", small: "R_4260602 · Beutel 600 ml · aus dem Lager, wie VIGOUR · Vorschlag: 2 je Platte" },
] as const;
export const accessoryQty = (wv: Fields, id: string): number => Math.max(0, Math.round(Number(wv[`wvWwQty_${id}`]) || 0));
/** the switch: on gives one (or keeps the number), off gives none — and marks it as set by hand */
export const toggleAccessory = (wv: Fields, id: string, on: boolean): Fields => ({ ...accessory(id, on ? accessoryQty(wv, id) || 1 : 0), ...markManual(wv, id) });
/** − / + or a typed number — marks it as set by hand */
export const setAccessoryQty = (wv: Fields, id: string, qty: number): Fields => ({ ...accessory(id, Math.max(0, Math.round(qty) || 0)), ...markManual(wv, id) });

/** m² of the winwall plates */
export const areaOf = (rows: readonly Row[]): number => rows.filter((r) => r.code).reduce((a, r) => a + r.qty * (FORMAT_M2[r.fmt] ?? 0), 0);
/** winwall: the area the sealing sets cover — typed Wandfläche, else walls × height + plates beyond the plan, else the plates */
export const wallAreaOf = (wv: Fields): number => Number(winwallSealingArea(wv, Object.fromEntries(FORMATS.map(([c]) => [c, wv[`wvWwQty_${c}`]])))) || 0;
/** the sealing sets: by `m2` (or the typed Wandfläche), rounded to two decimals as today, or the typed number of 5 m² sets */
export function sealing(wv: Fields, m2: number): { auto: number; hint: string } {
  const area = Math.round((Number(String(wv.wvArea ?? "").replace(",", ".")) || m2) * 100) / 100;
  const sets = winwallSealingSets(area) as { productId: string; qty: number }[];
  const txt = sets.map((l) => `${l.qty} × ${l.productId === "WS80302" ? "6,25" : "5"} m²`).join(" + ");
  const manual = Math.round(Number(wv.wvWwSealingQty) || 0);
  return {
    auto: sets.reduce((a, l) => a + l.qty, 0),
    hint: manual > 0 ? `berechnet: ${txt || "–"} · manuell: ${manual} × 5 m² ·` : `nach Wandfläche${area ? ` ${area.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²` : ""}${txt ? ` → ${txt}` : ""} · automatisch`,
  };
}
