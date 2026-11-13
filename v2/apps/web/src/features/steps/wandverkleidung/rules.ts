// Wandverkleidung (Badumbau) — the rules of today's UI (test/fixtures/wandverkleidung.json,
// v2/scripts/capture-wandverkleidung.cjs). This file covers the frame (switch, product line,
// Ausführung) and the line winwall; the wall calculator, the lines VIGOUR and Badolux, and
// sketch and note are still edited in today's UI.
//  - off keeps everything that was entered (only `wvEnabled` is false)
//  - each product line stores its own fields; the fields of the other lines are not stored
//    while a line is not chosen, and are back when it is chosen again
//  - winwall: one row = decor + format + number of plates (`wvWwRows`, a JSON text). The rows
//    give the plates per format (`wvWwQty_13` …), and with every change of the rows the
//    suggestions: 2 bags of adhesive per plate, connecting profiles = plates − 1
//  - an accessory is in the offer while its quantity is above 0 (`wvWw_<id>: "on"`)
//  - the sealing sets follow the area of the plates unless a number is typed
import { WINWALL_CATALOG, winwallProfileSuggestion, winwallSealingSets } from "@oc/pricing";
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
const WW_ACCESSORIES = ["wvWwQty_R_4260602", "wvWwQty_WS80110", "wvWwQty_WS80111", "wvWwQty_WS80112", "wvWwQty_WS80113", "wvWwSealing", "wvWwSealingQty",
  "wvWw_R_4260602", "wvWw_WS80110", "wvWw_WS80111", "wvWw_WS80112", "wvWw_WS80113", "wvWwCut"];
const WW_FIRST: Fields = { wvWwDecor: "WS203", wvWwDecorCustom: "", wvWwQty_13: "0", wvWwQty_15: "0", wvWwQty_16: "0", wvWwQty_17: "0", wvWwRows: "", wvWwQty_R_4260602: "0", wvWwQty_WS80110: "0", wvWwQty_WS80111: "0", wvWwQty_WS80112: "0", wvWwQty_WS80113: "0", wvWwSealing: "on", wvWwSealingQty: "" };
/** VIGOUR: stored only while the line is chosen */
const HM_ONLY = ["wvCorners", "wvCornersCount", "wvEndProfileQty", "wvFlachenQty", "wvQty1497", "wvQty997", "wvSilikonQty", "wvV3VQty", "flechenkleber", "wvSealing", "wvSilikon", "wvEndProfile", "wvPanels[]"];
const HM_FIRST: Fields = { wvCorners: "0", wvCornersCount: "0", wvEndProfileQty: "0", wvFlachenQty: "0", wvQty1497: "", wvQty997: "", wvSilikonQty: "0", wvV3VQty: "0" };
const BX_ONLY = ["wvBxQty_PR101VBM3", "wvBxQty_PR47VBM02", "wvBxQty_PR59VBM03", "wvBxQty_PR59VBM05", "wvBxQty_PR59VBM07", "wvBxQty_PRI130VBM01", "wvBxQty_PRI130VBM02", "wvKRows", "wvMotif"];
const BX_FIRST: Fields = { wvBxQty_PR101VBM3: "0", wvBxQty_PR47VBM02: "0", wvBxQty_PR59VBM03: "0", wvBxQty_PR59VBM05: "0", wvBxQty_PR59VBM07: "0", wvBxQty_PRI130VBM01: "0", wvBxQty_PRI130VBM02: "0", wvKRows: "", wvMotif: "" };
const NO_PANELS = { "1497x2550": { color: "", enabled: false, overrideColor: "", qty: 0 }, "997x2550": { color: "", enabled: false, overrideColor: "", qty: 0 } };
const gone = (keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, undefined]));

/** What leaving a line does to its fields (recorded for every pair of lines):
 *  - winwall: its plates go; its accessories stay for Badolux (Keramico uses them), not for VIGOUR
 *  - VIGOUR: quantities, colours and the accessory entries go. Towards winwall the panel table
 *    keeps its panels (without colours) and the accessory switches stay — as today; towards
 *    Badolux the panel table is emptied
 *  - Badolux: its rows, motif and accessories go; winwall's accessories go with it towards VIGOUR */
function leaving(wv: Fields, from: Line, to: Line): Fields {
  if (from === "ww") return gone(to === "premium" ? [...WW_PLATES, ...WW_ACCESSORIES] : WW_PLATES);
  if (from === "standard") return gone(to === "premium" ? [...BX_ONLY, ...WW_ACCESSORIES] : BX_ONLY);
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
    changes: { ...lost, ...fresh, ...(parked[to] ?? {}), wvBudgetMode: to === "standard" ? "1" : undefined, ...(to === "standard" ? { wvWwCut: undefined } : { wvSupplier: to === "premium" ? "hm" : "ww" }) }, // winwall's cutting service is not for Keramico
    parked: { ...parked, [from]: Object.fromEntries(Object.keys(lost).map((k) => [k, wv[k]])) },
  };
}

// ---- winwall rows ----
export interface Row { code: string | null; fmt: string; qty: number; custom?: boolean; text?: string }
export const FORMATS = [["13", "100 × 205 cm"], ["15", "100 × 250 cm"], ["16", "125 × 250 cm"], ["17", "150 × 250 cm"]] as const;
const FORMAT_M2: Record<string, number> = { 13: 2.05, 15: 2.5, 16: 3.125, 17: 3.75 };
const SET_FORMATS = new Set(["13", "15", "16"]); // two equal plates of these formats are ordered as a set
const catalog = WINWALL_CATALOG as Record<string, string>;
/** "WS 233" / "ws233" / "203" → "WS233"; anything else → null */
export function decorCode(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, "").toUpperCase();
  if (/^\d{3}$/.test(s)) return `WS${s}`;
  return /^(WS|NW)\d{3}$/.test(s) ? s : null;
}
const nice = (code: string) => `${code.slice(0, 2)} ${code.slice(2)}`;
export const rowTitle = (r: Row): string => (r.code ? `${catalog[r.code] ? `${catalog[r.code]} · ` : ""}${nice(r.code)}` : r.custom && r.text ? r.text : "Dekor wählen");
export function rowNote(rows: readonly Row[], i: number, open: boolean): string {
  const r = rows[i]!;
  const same = rows.filter((x) => x.code && x.code === r.code && x.fmt === r.fmt).reduce((a, x) => a + x.qty, 0);
  return `${open ? "Dekor wählen" : "Tippen zum Ändern"}${SET_FORMATS.has(r.fmt) && same >= 2 ? " · Set (2 gleiche Platten, günstiger)" : ""}`;
}
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

/** The fields the rows give: the rows themselves, the plates per format and the suggestions.
 *  `plan`: the wall calculator's plan — while the rows match it, the connecting profiles are its
 *  joints on straight walls (none at corners); otherwise plates − 1. */
export function fromRows(rows: readonly Row[], plan?: { qty?: Record<string, number>; pieces?: unknown[] } | null): Fields {
  const perFormat = Object.fromEntries(FORMATS.map(([c]) => [c, rows.filter((r) => r.fmt === c && r.code).reduce((a, r) => a + r.qty, 0)]));
  const plates = Object.values(perFormat).reduce((a, n) => a + n, 0);
  const fits = !!plan?.qty && FORMATS.every(([c]) => (plan.qty![c] || 0) === perFormat[c]);
  const profiles = fits ? Number((winwallProfileSuggestion(plan) as { WS80113: number }).WS80113) || 0 : Math.max(0, plates - 1);
  return {
    wvWwRows: JSON.stringify(rows.map((r) => ({ code: r.code, fmt: r.fmt, qty: r.qty, ...(r.custom ? { custom: true, text: r.text || "" } : {}) }))),
    ...Object.fromEntries(FORMATS.map(([c]) => [`wvWwQty_${c}`, String(perFormat[c])])),
    ...accessory("R_4260602", 2 * plates), ...accessory("WS80113", profiles),
  };
}
export function addRow(rows: readonly Row[], wv: Fields): Row[] {
  const last = rows[rows.length - 1];
  const picked = decorCode(wv.wvWwDecor === "custom" ? wv.wvWwDecorCustom : wv.wvWwDecor);
  return [...rows, { code: last ? last.code : picked || "WS203", fmt: last?.fmt || "15", qty: 1, custom: !!last?.custom, text: last?.text || "" }];
}
/** a decor tile, or a typed number, for one row */
export const withDecor = (r: Row, value: string, text = ""): Row => (value === "custom" ? { ...r, custom: true, text, code: decorCode(text) } : { ...r, custom: false, text: "", code: decorCode(value) });

/** the hint under the number field of "Anderes Dekor" */
export function customHint(wv: Fields): { text: string; kind: "" | "ok" | "warn" } {
  const raw = String(wv.wvWwDecorCustom ?? "").trim();
  if (wv.wvWwDecor !== "custom" || !raw) return { text: "WS oder NW und 3 Ziffern, z. B. WS 233 – steht im winwall Katalog.", kind: "" };
  const code = decorCode(raw);
  if (!code) return { text: "Bitte WS oder NW und 3 Ziffern eingeben, z. B. NW 230.", kind: "warn" };
  return catalog[code] ? { text: `✓ ${catalog[code]}`, kind: "ok" } : { text: "Nicht im winwall Katalog 2026 – Nummer bitte prüfen. Wird so bestellt.", kind: "warn" };
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
/** the switch: on gives one (or keeps the number), off gives none */
export const toggleAccessory = (wv: Fields, id: string, on: boolean): Fields => accessory(id, on ? accessoryQty(wv, id) || 1 : 0);
export const setAccessoryQty = (id: string, qty: number): Fields => accessory(id, Math.max(0, Math.round(qty) || 0));

/** the sealing sets: by the area of the plates, or the typed number of 5 m² sets */
export function sealing(wv: Fields, rows: readonly Row[]): { auto: number; hint: string } {
  const area = Number(String(wv.wvArea ?? "").replace(",", ".")) || rows.filter((r) => r.code).reduce((a, r) => a + r.qty * (FORMAT_M2[r.fmt] ?? 0), 0);
  const sets = winwallSealingSets(area) as { productId: string; qty: number }[];
  const txt = sets.map((l) => `${l.qty} × ${l.productId === "WS80302" ? "6,25" : "5"} m²`).join(" + ");
  const manual = Math.round(Number(wv.wvWwSealingQty) || 0);
  return {
    auto: sets.reduce((a, l) => a + l.qty, 0),
    hint: manual > 0 ? `berechnet: ${txt || "–"} · manuell: ${manual} × 5 m² ·` : `nach Plattenfläche${area ? ` ${area.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²` : ""}${txt ? ` → ${txt}` : ""} · automatisch`,
  };
}
