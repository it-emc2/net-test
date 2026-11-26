// Fußboden, mode "Wandverkleidung als Fußboden" — the rules of today's UI
// (test/fixtures/fussboden-wand.json, v2/scripts/capture-fussboden-wand.cjs; main 4f91a03b, 8d04727c).
//  - its own product line: winwall (plates per format, a decor) or VIGOUR (panels 997 / 1497 ×
//    2550 mm, a colour). Changing the line empties format, quantity and the winwall plates
//  - winwall: the plates 100×205 / 100×250 / 125×250 / 150×250 cm, each with − / +. The proposal is
//    the cheapest mix that covers the floor (minus the rest); it is never shown as a price. The
//    plates follow the proposal when the area, the rest or the decor changes — until − / + changed
//    them; "↻ Vorschlag aus Fläche" sets them back. Stored: wallCladdingWwQty (JSON per format) and,
//    for older readers, wallCladdingQty (sum) + wallCladdingPanelSize (the format with the most
//    plates). An offer with only the old fields opens with its one format. Always single plates,
//    no set (8d04727c). No prices on the page for winwall
//  - VIGOUR: the area gives a card per format with the number of panels; the one with the least
//    offcut is recommended. Picking a card stores format and quantity; the quantity can be typed.
//    A later change of the area does NOT change the stored quantity (as today)
//  - the rest of the wall cladding (step Wandverkleidung) can be used for the floor when it has the
//    same decor / colour: it is taken off the area. winwall: per wall decor — with a cladding height
//    (simple view, wvWwHeight) the strips above it, else what the first decor's plates deliver
//    beyond the wall. The adhesive is always for the whole floor
//  - floor decor changed by hand away from the rest while the rest is used: an in-page question,
//    "Abbrechen" goes back
//  - wall → floor (simple view of the Wandverkleidung, wired there): `wallChanged` / `autoAdd` /
//    `wallDecorChanged` / `restGone` say what today's UI does then (with what it remembers
//    meanwhile: `WallSession`, kept in the store's scratch as `wcSession` + `wcWwLast`)
//  - changing the mode or switching off keeps everything that was entered
//  - further Dekors (owner 2026-11-25, ADR 029; like "+ weiteres Dekor" of the Wandverkleidung's winwall
//    view): the first Dekor stays in wallCladdingWwDecor / -Custom / -WwQty, every further one with plates
//    is an entry of wallCladdingWwMore (JSON text [{decor, decorCustom, qty}], the last one removed → "").
//    A Dekor without plates writes nothing (kept while the page is open); removing the first promotes the
//    next; VIGOUR empties the field; the plates' proposal is for the area the other Dekors leave
// Legacy oddities ported unchanged: the switch "Reste anrechnen" with winwall plates puts the
// quantity of a single format into wallCladdingQty (the plates JSON stays, the price uses it);
// with 100×205 cm as the main format it stops there (a TypeError in today's UI).
import { WINWALL_CATALOG, WINWALL_FORMATS, winwallDecorCode, winwallFloorQty, winwallLeftoverM2, winwallOrderLines, winwallStripLeftoverM2 } from "@oc/pricing";
import { VG_COLORS } from "../wandverkleidung/colors.js";
import { situationOf, wallsOf, WALLS } from "../wandverkleidung/calc.js";
import { WW_DECORS, WW_SWATCHES } from "../wandverkleidung/decors.js";
import { lineOf, rowsOf } from "../wandverkleidung/rules.js";
import { rowsOf as vigourRowsOf } from "../wandverkleidung/vigour.js";
import { setMode } from "./rules.js";
import { nextDecor, paletteTiles, type PaletteTile } from "../wandverkleidung/simple.js";

type Fields = Record<string, unknown>;
export type Supplier = "ww" | "hm";
export const SUPPLIERS: readonly { value: Supplier; name: string; sub: string }[] = [{ value: "ww", name: "winwall", sub: "WV-WW" }, { value: "hm", name: "VIGOUR", sub: "Haßmann · WV-HM" }];
/** the colours the floor can be ordered in (VIGOUR) — today's tiles, without Sonderdekor */
export const COLORS = VG_COLORS.filter((c) => WV_ARTICLE_KEY(c.value) in WV_ARTICLES());
function WV_ARTICLE_KEY(v: string) { return v.trim().toLowerCase(); }
function WV_ARTICLES(): Record<string, { 997: string; 1497: string }> {
  return {
    "weiß": { 997: "V3WVK07", 1497: "V3WV07" }, "marmor weiß": { 997: "V3WVK09", 1497: "V3WV09" }, "struktur weiß": { 997: "V3WVK06", 1497: "V3WV06" }, "stein beige": { 997: "V3WVK01", 1497: "V3WV01" },
    "aragon grau": { 997: "V3WVK22", 1497: "V3WV22" }, "stein grau": { 997: "V3WVK02", 1497: "V3WV02" }, "aragon anthrazit": { 997: "V3WVK21", 1497: "V3WV21" }, "schiefer grau": { 997: "V3WVK08", 1497: "V3WV08" },
    "schwarzwaldeiche hell": { 997: "V3WVK23", 1497: "V3WV23" }, "stein anthrazit": { 997: "V3WVK03", 1497: "V3WV03" }, "kalkstein natur": { 997: "V3WVK05", 1497: "V3WV05" }, "aragon schwarz": { 997: "V3WVK20", 1497: "V3WV20" },
  };
}
const PANEL_M2: Record<string, number> = { 997: 0.997 * 2.55, 1497: 1.497 * 2.55 };
/** VIGOUR panel height in mm (the width is the format code: 997 / 1497 mm) */
const PANEL_HEIGHT_MM = 2550;
/** the winwall plates of the floor, all single plates (no sets since 8d04727c) */
export const WW_FORMATS = ["13", "15", "16", "17"] as const;
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
export const m2 = (n: number): string => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const catalog = WINWALL_CATALOG as Record<string, string>;
const wwFormat = (code: unknown) => WINWALL_FORMATS.find((f) => f.code === String(code))!;
const plateM2 = (code: string) => { const f = wwFormat(code); return (f.widthCm * f.heightCm) / 10000; };
const nice = (code: string) => `${code.slice(0, 2)} ${code.slice(2)}`;
const nameOf = (code: string) => catalog[code] || nice(code);

// ---- reading the offer ----
/** an offer from before the line existed has no field: VIGOUR */
export const supplierOf = (dw: Fields): Supplier => (dw.wallCladdingSupplier === "ww" ? "ww" : "hm");
export const areaOf = (dw: Fields): number => num(dw.wallCladdingArea);
export const colorOf = (dw: Fields): string => String(dw.wallCladdingColor || "Marmor weiß");
export const articlesFor = (color: string): { 997: string; 1497: string } => WV_ARTICLES()[WV_ARTICLE_KEY(color)] ?? WV_ARTICLES()["marmor weiß"]!;
export const articlesOf = (dw: Fields): { 997: string; 1497: string } => articlesFor(colorOf(dw));
const isTile = (code: string) => WW_DECORS.some((d) => d.value === code);
/** the winwall decor of the floor: a tile, or "Anderes Dekor" with a typed number (the engine's reading) */
export function decorOf(dw: Fields): { code: string | null; name: string | null; label: string } {
  const v = String(dw.wallCladdingWwDecor ?? "");
  const code = winwallDecorCode(v === "custom" ? dw.wallCladdingWwDecorCustom : v) as string | null, name = (code && catalog[code]) || null;
  return { code, name, label: code ? `${name ? `${name} · ` : ""}${nice(code)}` : "" };
}
/** the hint under "Anderes Dekor" */
export function customHint(dw: Fields): { text: string; kind: "" | "ok" | "warn" } {
  const typed = String(dw.wallCladdingWwDecorCustom ?? "").trim();
  if (!typed) return { text: "Dekor-Nr. (z. B. NW 230) oder Artikel-Nr. vom Muster (z. B. 23015).", kind: "" };
  const code = winwallDecorCode(typed) as string | null;
  if (!code) return { text: "Nicht erkannt – Dekor-Nr. (NW 230) oder Artikel-Nr. mit Format 13/15/16/17 (23015).", kind: "warn" };
  return catalog[code] ? { text: `✓ ${catalog[code]} (${nice(code)})`, kind: "ok" } : { text: `${nice(code)} ist nicht im winwall-Katalog – Nummer bitte prüfen.`, kind: "warn" };
}
export type { PaletteTile };
/** the palette of the Wandverkleidung simple view (shared): the tiles, NW 230 after NW 216, and the floor's own decor when it is none of them */
export const paletteOf = (dw: Fields): PaletteTile[] => paletteTiles(decorOf(dw).code);
/** a palette tile: a decor with a tile is stored as the tile, any other as "Anderes Dekor" with its number */
export const pickDecor = (code: string): Fields => (isTile(code) ? { wallCladdingWwDecor: code, wallCladdingWwDecorCustom: "" } : { wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: nice(code) });
/** the floor decor set back (or set by the wall): the tile, else "custom" with the number; the typed text of a tile stays */
export const setFloorDecor = (code: string): Fields => (isTile(code) ? { wallCladdingWwDecor: code } : { wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: nice(code) });
/** typing in "Anderes Dekor": a number that reads as a decor selects it (its tile, else "custom"); the text stays */
export function typeDecor(text: string): Fields {
  const code = winwallDecorCode(text.trim()) as string | null;
  return { wallCladdingWwDecorCustom: text, ...(code ? { wallCladdingWwDecor: isTile(code) ? code : "custom" } : {}) };
}
export const swatchOf = (code: string | null): string => (code && WW_SWATCHES.has(code) ? `/assets/winwall/${code}.jpg` : "");
export { WW_DECORS };

// ---- the rest of the wall cladding ----
export interface Rest { usableM2: number; color: string; supplier?: "ww"; decor?: string; decorName?: string | null; byDecor?: Record<string, number> }
export interface RestConfig { usable: number; min: number }
export const REST_DEFAULTS: RestConfig = { usable: 0.8, min: 0.5 };
/** What can be used of the wall's plates, times the usable share; null below the minimum.
 *  winwall with a cladding height: the strips above it, per decor (the largest is "the" rest).
 *  winwall without: what the first row's decor delivers beyond the wall. VIGOUR: one colour, no
 *  extra colours, and a colour the floor can have. */
export function restOf(wv: Fields, cfg: RestConfig = REST_DEFAULTS): Rest | null {
  if (wv.wvEnabled !== true) return null;
  const line = lineOf(wv);
  if (line === "standard") return null;
  const height = num(wv.wvWwHeight);
  if (line === "ww" && height > 0) {
    const byCode = new Map<string, Record<string, number>>();
    for (const r of rowsOf(wv)) {
      if (!r.code) continue;
      const q = byCode.get(r.code) ?? {};
      q[r.fmt] = (q[r.fmt] ?? 0) + (Number(r.qty) || 0);
      byCode.set(r.code, q);
    }
    const byDecor: Record<string, number> = {};
    for (const [c, q] of byCode) { const m = winwallStripLeftoverM2(q, height, cfg.usable, cfg.min) as number | null; if (typeof m === "number" && m > 0) byDecor[c] = m; }
    const top = Object.entries(byDecor).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const name = catalog[top[0]] ?? null;
    return { usableM2: top[1], color: name || top[0], supplier: "ww", decor: top[0], decorName: name, byDecor };
  }
  let area = num(wv.wvArea);
  if (area <= 0) { // the wall calculator: widths × height (at most a panel's height)
    const width = wallsOf(situationOf(wv)).reduce((a, k) => a + num(wv[WALLS[k].field]), 0), h = num(wv.wvKHoehe);
    area = (width * (h > 0 && h < 255 ? h : 255)) / 10000;
  }
  if (!(area > 0)) return null;
  if (line === "ww") {
    const rows = rowsOf(wv), code = rows[0]?.code ?? null;
    if (!code) return null;
    const counts: Record<string, number> = { 13: 0, 15: 0, 16: 0, 17: 0 };
    for (const r of rows) if (r.code === code && r.fmt in counts) counts[r.fmt]! += r.qty;
    const usable = winwallLeftoverM2(counts, area, cfg.usable, cfg.min) as number | null;
    const name = catalog[code] ?? null;
    return usable ? { usableM2: usable, color: name || code, supplier: "ww", decor: code, decorName: name, byDecor: { [code]: usable } } : null;
  }
  const rows = vigourRowsOf(wv);
  for (const size of [997, 1497]) if (rows.filter((r) => r.size === size).length > 1) return null; // extra colours
  if (!rows.length || new Set(rows.map((r) => r.color.split("|").pop()!.trim().toLowerCase())).size !== 1) return null;
  const color = COLORS.find((c) => WV_ARTICLE_KEY(c.value) === rows[0]!.color.split("|").pop()!.trim().toLowerCase());
  if (!color) return null;
  const usable = Math.round(Math.max(0, rows.reduce((a, r) => a + r.qty * PANEL_M2[r.size]!, 0) - area) * cfg.usable * 100) / 100;
  return usable < cfg.min || usable <= 0 ? null : { usableM2: usable, color: color.value };
}
/** m² of a winwall rest in this decor */
export const restIn = (rest: Rest | null, code: string | null | undefined): number => (rest?.supplier === "ww" && code ? rest.byDecor?.[code] ?? 0 : 0);
/** the m² of the rest that fit the floor's decor / colour (switch aside) */
const fitting = (dw: Fields, rest: Rest): number => (rest.supplier === "ww" ? (supplierOf(dw) === "ww" ? restIn(rest, decorOf(dw).code) : 0) : supplierOf(dw) === "hm" && WV_ARTICLE_KEY(colorOf(dw)) === rest.color.toLowerCase() ? rest.usableM2 : 0);
/** the m² the switch takes off the floor right now */
export const creditOf = (dw: Fields, rest: Rest | null): number => (rest && dw.wallCladdingUseLeftover ? fitting(dw, rest) : 0);
export function restHint(dw: Fields, rest: Rest): string {
  const here = fitting(dw, rest);
  if (here > 0) { const d = decorOf(dw); return `${m2(here)} m² ${rest.supplier === "ww" ? d.name || d.label : rest.color}, schon bezahlt — kostenlos für den Boden.`; }
  return rest.supplier === "ww" ? `Reste gibt es in winwall ${Object.keys(rest.byDecor ?? {}).map(nameOf).join(", ")}. Wählen Sie dasselbe Dekor, um sie anzurechnen.` : `Reste sind ${rest.color}. Wählen Sie dieselbe Farbe, um sie anzurechnen.`;
}
export const restText = (rest: Rest): string => `Ca. ${m2(rest.usableM2)} m² ${rest.color} bleiben nutzbar übrig und sind schon bezahlt. Damit können Sie den Fußboden belegen, statt neue Paneele zu bestellen.`;

// ---- winwall plates ----
export type Qty = Record<(typeof WW_FORMATS)[number], number>;
export const zero = (): Qty => ({ 13: 0, 15: 0, 16: 0, 17: 0 });
const sum = (q: Qty) => WW_FORMATS.reduce((a, c) => a + (q[c] || 0), 0);
const areaOfQty = (q: Qty) => WW_FORMATS.reduce((a, c) => a + (q[c] || 0) * plateM2(c), 0);
export const sameQty = (a: Qty, b: Qty): boolean => WW_FORMATS.every((c) => (a[c] || 0) === (b[c] || 0));
/** the floor's plates: wallCladdingWwQty; an offer with only the old fields has its one format */
export function qtyOf(dw: Fields): Qty {
  const q = winwallFloorQty(dw.wallCladdingWwQty) as Qty | null;
  if (q) return { ...zero(), ...q };
  const size = String(dw.wallCladdingPanelSize ?? ""), n = Math.round(num(dw.wallCladdingQty));
  return !dw.wallCladdingWwQty && supplierOf(dw) === "ww" && n > 0 && (WW_FORMATS as readonly string[]).includes(size) ? { ...zero(), [size]: n } : zero();
}
/** what is stored for these plates: the JSON, the sum, and the format with the most plates (older readers) */
export function qtyFields(q: Qty): Fields {
  const n = sum(q);
  return { wallCladdingWwQty: n ? JSON.stringify({ 13: q[13], 15: q[15], 16: q[16], 17: q[17] }) : "", wallCladdingQty: String(n), wallCladdingPanelSize: n ? WW_FORMATS.reduce<string>((a, c) => ((q[c] || 0) > (q[a as keyof Qty] || 0) ? c : a), "15") : "" };
}
/** the cheapest set of plates that covers the area (fewer m², then fewer plates on a tie); up to 24 per format */
export function bestOf(area: number): Qty {
  if (!(area > 0)) return zero();
  const P = Object.fromEntries(WW_FORMATS.map((c) => [c, wwFormat(c).price])) as Qty, M = Object.fromEntries(WW_FORMATS.map((c) => [c, plateM2(c)])) as Qty;
  const max = Math.min(24, Math.ceil(area / M[13] - 1e-9));
  let top: { q: Qty; cost: number; m: number; n: number } | null = null;
  for (let a = 0; a <= max; a++) for (let b = 0; b <= max; b++) for (let c = 0; c <= max; c++) for (let d = 0; d <= max; d++) {
    const m = a * M[13] + b * M[15] + c * M[16] + d * M[17];
    if (m + 1e-9 < area) continue;
    const cost = a * P[13] + b * P[15] + c * P[16] + d * P[17], n = a + b + c + d;
    if (!top || cost < top.cost - 0.005 || (Math.abs(cost - top.cost) < 0.005 && (m < top.m - 1e-9 || (Math.abs(m - top.m) < 1e-9 && n < top.n)))) top = { q: { 13: a, 15: b, 16: c, 17: d }, cost, m, n };
  }
  return top ? top.q : zero();
}
/** the area the plates have to cover: the floor minus the rest */
export const needOf = (dw: Fields, credit: number): number => Math.max(0, areaOf(dw) - credit);
/** the first Dekor's proposal: the area the further Dekors' plates leave (one Dekor: the whole need) */
export const proposalOf = (dw: Fields, credit: number): Qty => bestOf(Math.max(0, needOf(dw, credit) - moreM2(dw)));
/** Dekor `i`'s proposal: the area the other Dekors' plates leave, never negative */
export const proposalFor = (dw: Fields, credit: number, dekore: readonly Dekor[], i: number): Qty =>
  bestOf(Math.max(0, needOf(dw, credit) - dekore.reduce((a, d, j) => (j === i ? a : a + areaOfQty(d.qty)), 0)));
/** the plates follow the proposal unless − / + changed them. `last`: the proposal they were last set
 *  to (null = not known: a new or reopened offer — then only empty plates follow) */
export function follow(dw: Fields, credit: number, last: Qty | null): Fields {
  const best = proposalOf(dw, credit), cur = qtyOf(dw);
  const untouched = last ? sameQty(cur, last) : !sum(cur);
  return untouched && !sameQty(cur, best) ? qtyFields(best) : {};
}
export const stepPlate = (dw: Fields, fmt: string, d: number): Fields => { const q = qtyOf(dw); q[fmt as keyof Qty] = Math.max(0, (q[fmt as keyof Qty] || 0) + d); return qtyFields(q); };
export interface Plate { code: string; size: string; best: string; qty: number; img: string; widthCm: number; heightCm: number }
export interface Plates { plates: Plate[]; total: { text: string; small: string; short: boolean }; resync: boolean }
/** the four plates of the open Dekor (`active`) as the page shows them, the total under them (every Dekor) and whether "↻ Vorschlag" is offered */
export function platesOf(dw: Fields, credit: number, dekore: readonly Dekor[] = dekoreOf(dw), active = 0): Plates {
  const i = dekore[active] ? active : 0;
  const cur = i ? dekore[i]!.qty : qtyOf(dw), best = proposalFor(dw, credit, dekore.length ? dekore : [firstOf(dw)], i), img = (i ? codeOf(dekore[i]!) : decorOf(dw).code) || "WS203";
  const n = dekore.reduce((a, d) => a + sum(d.qty), 0), m = dekore.reduce((a, d) => a + areaOfQty(d.qty), 0), full = areaOf(dw), need = needOf(dw, credit), short = full > 0 && m + 1e-9 < need;
  return {
    plates: WW_FORMATS.map((c) => { const f = wwFormat(c); return { code: c, size: `${f.widthCm} × ${f.heightCm} cm`, best: best[c] ? `Vorschlag: ${best[c]}` : "", qty: cur[c], img, widthCm: f.widthCm, heightCm: f.heightCm }; }),
    total: { text: `${n} ${n === 1 ? "Platte" : "Platten"} · ${m2(m)} m²${dekore.length > 1 ? ` · ${dekore.length} Dekore` : ""}`, small: short ? `Es fehlen ${m2(need - m)} m²` : full > 0 && n ? `Verschnitt ${m2(m - need)} m²` : full > 0 && !need ? "Reste reichen – keine Platten nötig" : "", short },
    resync: full > 0 && !sameQty(cur, best),
  };
}

// ---- several Dekors (wallCladdingWwMore, ADR 029) ----
/** one winwall Dekor of the floor: what the first one keeps in its three fields */
export interface Dekor { decor: string; decorCustom: string; qty: Qty }
const qtyIn = (raw: unknown): Qty => ({ ...zero(), ...((winwallFloorQty(raw) as Qty | null) ?? {}) });
const qtyJson = (q: Qty) => ({ 13: q[13] || 0, 15: q[15] || 0, 16: q[16] || 0, 17: q[17] || 0 });
/** the further Dekors as stored (JSON text, or a list) */
export function moreOf(dw: Fields): Dekor[] {
  let a: unknown = dw.wallCladdingWwMore;
  if (typeof a === "string") { try { a = a.trim() ? JSON.parse(a) : []; } catch { a = []; } }
  return (Array.isArray(a) ? a : []).filter((r): r is Fields => !!r && typeof r === "object").map((r) => ({ decor: String(r.decor ?? ""), decorCustom: String(r.decorCustom ?? ""), qty: qtyIn(r.qty) }));
}
/** what is stored for the further Dekors: the JSON text, "" when there is none */
export const moreFields = (list: readonly Dekor[]): Fields => ({ wallCladdingWwMore: list.length ? JSON.stringify(list.map((d) => ({ decor: d.decor, decorCustom: d.decorCustom, qty: qtyJson(d.qty) }))) : "" });
const moreM2 = (dw: Fields): number => (supplierOf(dw) === "ww" ? moreOf(dw).reduce((a, d) => a + areaOfQty(d.qty), 0) : 0);
export const firstOf = (dw: Fields): Dekor => ({ decor: String(dw.wallCladdingWwDecor ?? ""), decorCustom: String(dw.wallCladdingWwDecorCustom ?? ""), qty: qtyOf(dw) });
/** every Dekor of the floor: the first, the stored further ones, then the ones without plates yet (`pending`, not stored) */
export const dekoreOf = (dw: Fields, pending: readonly Dekor[] = []): Dekor[] => [firstOf(dw), ...moreOf(dw), ...pending];
/** a Dekor in the first Dekor's field names — decorOf, customHint, pickDecor, typeDecor, stepPlate work on it */
export const asFields = (d: Dekor): Fields => ({ wallCladdingSupplier: "ww", wallCladdingWwDecor: d.decor, wallCladdingWwDecorCustom: d.decorCustom, wallCladdingWwQty: sum(d.qty) ? JSON.stringify(qtyJson(d.qty)) : "" });
export const codeOf = (d: Dekor): string | null => decorOf(asFields(d)).code;
const plates = (d: Dekor) => sum(d.qty);
/** the result of a change of the Dekors: what is stored, the Dekors without plates, the open one */
export interface Dekore { fields: Fields; pending: Dekor[]; active: number }
const after = (d: Dekor, change: Fields): Dekor => ({
  decor: "wallCladdingWwDecor" in change ? String(change.wallCladdingWwDecor ?? "") : d.decor,
  decorCustom: "wallCladdingWwDecorCustom" in change ? String(change.wallCladdingWwDecorCustom ?? "") : d.decorCustom,
  qty: "wallCladdingWwQty" in change ? qtyIn(change.wallCladdingWwQty) : d.qty,
});
const sameMore = (a: readonly Dekor[], b: readonly Dekor[]) => JSON.stringify(moreFields(a)) === JSON.stringify(moreFields(b));
/** a change of Dekor `i`, given in the first Dekor's field names (pickDecor, typeDecor, stepPlate, qtyFields).
 *  The first Dekor: the change itself. A further one with plates is stored; without plates it is kept, not stored */
export function editDekor(dw: Fields, pending: readonly Dekor[], active: number, i: number, change: Fields): Dekore {
  if (i === 0) return { fields: change, pending: [...pending], active };
  const more = moreOf(dw), next = [...more], wait = [...pending];
  const s = i - 1, d = s < more.length ? more[s]! : wait[s - more.length];
  if (!d) return { fields: {}, pending: wait, active };
  const nd = after(d, change);
  if (s < more.length) {
    if (plates(nd)) next[s] = nd;
    else { next.splice(s, 1); wait.unshift(nd); active = active === i ? 1 + next.length : active > i && active <= more.length ? active - 1 : active; } // no plates left: kept, after the stored ones
  } else if (plates(nd)) { // its first plate: stored, after the stored ones
    const to = 1 + more.length;
    wait.splice(s - more.length, 1); next.push(nd);
    active = active === i ? to : active >= to && active < i ? active + 1 : active;
  }
  else wait[s - more.length] = nd;
  return { fields: sameMore(next, more) ? {} : moreFields(next), pending: wait, active };
}
/** "+ weiteres Dekor": the first palette decor no Dekor has (the Wandverkleidung's rule), without plates, opened */
export function addDekor(dw: Fields, pending: readonly Dekor[]): Dekore {
  const all = dekoreOf(dw, pending), code = nextDecor(all.map(codeOf).filter((c): c is string => !!c));
  const d: Dekor = { ...(isTile(code) ? { decor: code, decorCustom: "" } : { decor: "custom", decorCustom: nice(code) }), qty: zero() };
  return { fields: {}, pending: [...pending, d], active: all.length };
}
/** × on Dekor `i` (only while there are two or more): the first → the next one takes its place in the three fields */
export function removeDekor(dw: Fields, pending: readonly Dekor[], active: number, i: number): Dekore {
  const all = dekoreOf(dw, pending), more = moreOf(dw), wait = [...pending];
  if (all.length < 2 || !all[i]) return { fields: {}, pending: wait, active };
  const nextActive = active > i ? active - 1 : Math.min(active, all.length - 2);
  if (i === 0) {
    const d = all[1]!;
    const first: Fields = { wallCladdingWwDecor: d.decor, wallCladdingWwDecorCustom: d.decorCustom, ...qtyFields(d.qty) };
    if (more.length) return { fields: { ...first, ...moreFields(more.slice(1)) }, pending: wait, active: nextActive };
    wait.shift();
    return { fields: first, pending: wait, active: nextActive };
  }
  if (i - 1 < more.length) return { fields: moreFields(more.filter((_, j) => j !== i - 1)), pending: wait, active: nextActive };
  wait.splice(i - 1 - more.length, 1);
  return { fields: {}, pending: wait, active: nextActive };
}
/** the Dekor chips: "Marmor weiß · 4 Stk", × while there are two or more */
export function chipsOf(dekore: readonly Dekor[], active: number): { name: string; text: string; pressed: boolean; removable: boolean; img: string | undefined }[] {
  return dekore.map((d, i) => {
    const code = codeOf(d) ?? (i === 0 && !d.decor ? "WS203" : null), name = code ? nameOf(code) : d.decorCustom.trim() || "Anderes Dekor";
    return { name, text: `${name} · ${plates(d)} Stk`, pressed: i === active, removable: dekore.length > 1, img: swatchOf(code) || undefined };
  });
}
/** further Dekors with plates but no valid Dekor-Nr.: not priced (the red line under the plates, as on the wall) */
export function badDekore(dw: Fields): string | null {
  if (supplierOf(dw) !== "ww") return null;
  const bad = moreOf(dw).filter((d) => !codeOf(d) && plates(d) > 0);
  if (!bad.length) return null;
  const n = bad.reduce((a, d) => a + plates(d), 0);
  const txt = [...new Set(bad.map((d) => d.decorCustom.trim()).filter(Boolean))].join(", ");
  return `${n} ${n === 1 ? "Platte" : "Platten"} mit ungültiger Dekor-Nr.${txt ? ` (${txt})` : ""} – fehlen im Preis.`;
}

// ---- VIGOUR formats ----
export interface Option { size: string; qty: number; covered: number; waste: number }
export type Suggestion = { area: number; full: number; allCovered: true } | { area: number; full: number; allCovered?: false; options: Option[]; best: string };
/** A card per format for the area that is left after the rest; the least offcut is recommended (the wide one on a tie) */
export function suggestion(dw: Fields, credit = 0): Suggestion | null {
  const full = areaOf(dw);
  if (full <= 0) return null;
  const area = Math.max(0, full - credit);
  if (area <= 0) return { area: 0, full, allCovered: true };
  const options = ["997", "1497"].map((s) => { const qty = Math.ceil(area / PANEL_M2[s]!); return { size: s, qty, covered: qty * PANEL_M2[s]!, waste: qty * PANEL_M2[s]! - area }; });
  return { area, full, options, best: options[1]!.waste <= options[0]!.waste ? "1497" : "997" };
}
const eur = (n: number) => `${m2(n)} €`;
export interface Card extends Option { widthMm: number; heightMm: number; title: string; best: boolean; selected: boolean; count: string; coverage: string; price: string; unit: string; label: string }
/** the VIGOUR cards as the page shows them (winwall has plates instead). `prices`: net price per article */
export function cardsOf(dw: Fields, s: Suggestion | null, prices: Record<string, number> = {}): Card[] {
  if (supplierOf(dw) === "ww" || !s || s.allCovered) return [];
  const picked = String(dw.wallCladdingPanelSize ?? ""), art = articlesOf(dw);
  return s.options.map((o) => {
    const selected = picked === o.size, unit = prices[art[o.size as "997" | "1497"]] || 0;
    return { ...o, widthMm: Number(o.size), heightMm: PANEL_HEIGHT_MM, title: `${o.size}×${PANEL_HEIGHT_MM} mm`, best: s.best === o.size, selected, count: `${o.qty} Stück`, coverage: `${m2(o.covered)} m² abgedeckt · ${m2(o.waste)} m² Verschnitt`, price: unit > 0 ? eur(unit * o.qty) : "", unit: unit > 0 ? `(${eur(unit)} / Stk.)` : "", label: selected ? "✓ Ausgewählt" : "Auswählen" };
  });
}

// ---- changes ----
/** What follows from every change in this mode: the m² taken from the rest are stored; without a
 *  rest the switch goes off; VIGOUR: when the rest covers the whole floor, format and quantity go.
 *  winwall: with `last` given (the area, the rest, the decor or the line changed) the plates follow
 *  the proposal (`follow`); another line starts without a known proposal. */
export function settled(dw: Fields, change: Fields, rest: Rest | null, last?: Qty | null): Fields {
  const next = { ...dw, ...change };
  const out: Fields = { ...change };
  if (!rest && next.wallCladdingUseLeftover) { out.wallCladdingUseLeftover = undefined; next.wallCladdingUseLeftover = undefined; }
  const credit = creditOf(next, rest);
  out.wallCladdingLeftoverM2 = credit > 0 ? String(credit) : "";
  if (supplierOf(next) === "ww") {
    if (last !== undefined) Object.assign(out, follow(next, credit, "wallCladdingSupplier" in change && supplierOf(dw) !== "ww" ? null : last));
  } else if (suggestion(next, credit)?.allCovered && (String(next.wallCladdingPanelSize ?? "") || num(next.wallCladdingQty) > 0)) { out.wallCladdingPanelSize = ""; out.wallCladdingQty = "0"; }
  return out;
}
/** another line: format, quantity and plates belong to the line that is left */
export const setSupplier = (dw: Fields, to: Supplier): Fields => (supplierOf(dw) === to ? {} : { wallCladdingSupplier: to, wallCladdingPanelSize: "", wallCladdingQty: "", wallCladdingWwQty: "", ...(dw.wallCladdingWwMore ? { wallCladdingWwMore: "" } : {}) });
export const pickCard = (o: Pick<Option, "size" | "qty">): Fields => ({ wallCladdingPanelSize: o.size, wallCladdingQty: String(o.qty) });
export const setQty = (text: string): Fields => ({ wallCladdingQty: String(Number(text) || 0) });
/** the switch "Reste anrechnen". VIGOUR: the picked format gets the quantity for the area that is left.
 *  winwall (after the plates followed): today's UI writes the single-format count of the main format
 *  into wallCladdingQty — only for 100/125/150 × 250 cm (with 100×205 it stops with an error) */
export function useRest(dw: Fields, on: boolean, rest: Rest | null, last?: Qty | null): Fields {
  const change: Fields = { wallCladdingUseLeftover: on ? "on" : undefined };
  if (supplierOf(dw) === "ww") {
    const out = settled(dw, change, rest, last === undefined ? null : last), next = { ...dw, ...out };
    const size = String(next.wallCladdingPanelSize ?? ""), area = needOf(next, creditOf(next, rest));
    if (["15", "16", "17"].includes(size) && area > 0) out.wallCladdingQty = String(Math.ceil(area / plateM2(size) - 1e-9));
    return out;
  }
  const next = { ...dw, ...change };
  const s = suggestion(next, creditOf(next, rest)), size = String(dw.wallCladdingPanelSize ?? "");
  if (size && s && !s.allCovered) { const o = s.options.find((x) => x.size === size); if (o) Object.assign(change, pickCard(o)); }
  return change;
}
/** "Als Fußboden verwenden" on the Wandverkleidung step: this mode, the rest's line and decor / colour, the rest used */
export function takeRest(dw: Fields, rest: Rest): Fields {
  const to: Supplier = rest.supplier === "ww" ? "ww" : "hm";
  const tile = rest.supplier === "ww" ? WW_DECORS.find((d) => d.value === rest.decor) : undefined;
  const change: Fields = { ...setSupplier(dw, to), ...(rest.supplier === "ww" ? (tile ? { wallCladdingWwDecor: tile.value } : { wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: rest.decor }) : { wallCladdingColor: rest.color }) };
  return { ...change, ...useRest({ ...dw, ...change }, true, rest) };
}
/** the floor's decor changed by hand: is it worth the question "Reste nicht mehr anrechnen?" (rest used, the old decor had one, the new has none) */
export function leavingRest(dw: Fields, prev: string | null, rest: Rest | null): { title: string; message: string; confirm: string; cancel: string } | null {
  const next = decorOf(dw).code;
  if (!rest || !prev || !next || prev === next || !dw.wallCladdingUseLeftover || !(restIn(rest, prev) > 0) || restIn(rest, next) > 0) return null;
  return { title: "Reste nicht mehr anrechnen?", message: `Reste aus der Wandverkleidung gibt es nur in ${Object.keys(rest.byDecor ?? {}).map(nameOf).join(", ")}. Mit ${nameOf(next)} werden sie nicht mehr für den Boden verwendet – dafür werden Platten berechnet.`, confirm: "Trotzdem ändern", cancel: "Abbrechen" };
}

// ---- wall → floor (today's simple view of the Wandverkleidung; React wires it with item 2) ----
const de = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
/** what today's UI remembers about the floor while the offer is open (script.js initWallCladdingSection):
 *  `last` the plate proposal the plates were last set to; `autoArea` the area an automatic floor got
 *  (it follows the rest until the area is typed); `optedOut` the floor was switched off by hand;
 *  `askedSwitch` "Fußboden auf winwall umstellen?" was asked already */
export interface WallSession { last: Qty | null; autoArea: string | null; optedOut: boolean; askedSwitch: boolean }
export const SESSION: WallSession = { last: null, autoArea: null, optedOut: false, askedSwitch: false };
type Step = { fields: Fields; session: WallSession };
const apply = (dw: Fields, fields: Fields) => ({ ...dw, ...fields });
/** the plates followed: the proposal they are set to now */
const followed = (dw: Fields, rest: Rest | null, s: WallSession): WallSession => (supplierOf(dw) === "ww" ? { ...s, last: proposalOf(dw, creditOf(dw, rest)) } : s);
/** the wall changed (plates, height, decor): an automatic area follows the rest of the floor's decor, the plates follow the proposal */
export function wallChanged(dw: Fields, rest: Rest | null, s: WallSession): Step {
  let change: Fields = {}, autoArea: string | null = null;
  if (s.autoArea != null && dw.addWallCladding && supplierOf(dw) === "ww" && String(dw.wallCladdingArea ?? "") === s.autoArea) {
    const m = restIn(rest, decorOf(dw).code);
    change = { wallCladdingArea: m ? de(m) : "" };
    autoArea = m ? de(m) : null;
  }
  const fields = settled(dw, change, rest, s.last);
  return { fields, session: followed(apply(dw, fields), rest, { ...s, autoArea }) };
}
/** today's toast when the floor used the wall's rest and the wall leaves none any more (wcWallChanged; not after a decor change) */
export function restGone(before: Fields, after: Fields, rest: Rest | null): string | null {
  const had = before.addWallCladding && supplierOf(before) === "ww" ? num(before.wallCladdingLeftoverM2) : 0;
  return had > 0 && !(creditOf(after, rest) > 0) ? `Von ${nameOf(decorOf(after).code ?? "")} bleiben an der Wand keine nutzbaren Reste mehr. Der Fußboden wird jetzt mit Platten berechnet.` : null;
}
/** the floor switched to "Wandverkleidung als Fußboden" in winwall, this decor, the rest used, the plates proposed */
export function wallFloor(dw: Fields, rest: Rest | null, code: string, area: string | null, s: WallSession): Step {
  const change: Fields = { ...setMode(dw, true, "wall"), ...setSupplier(dw, "ww"), ...setFloorDecor(code), ...(area != null && !num(dw.wallCladdingArea) ? { wallCladdingArea: area } : {}), ...(restIn(rest, code) > 0 ? { wallCladdingUseLeftover: "on" } : {}), ...qtyFields(zero()) };
  const fields = settled(dw, change, rest, null);
  return { fields, session: followed(apply(dw, fields), rest, { ...s, last: null }) };
}
/** the wall left a rest in `code` and there is no floor: the floor is added from the rest (+ the toast today's UI shows); null when not */
export function autoAdd(dw: Fields, rest: Rest | null, code: string, s: WallSession): (Step & { toast: string }) | null {
  const m = restIn(rest, code);
  if (!m || s.optedOut || dw.addFlooring || dw.addWallCladding) return null;
  const r = wallFloor(dw, rest, code, de(m), s);
  return { ...r, session: { ...r.session, autoArea: de(m) }, toast: `Fußboden ergänzt: ${de(m)} m² ${nameOf(code)} aus den Wandresten (schon bezahlt) + Flächenkleber.` };
}
export interface Ask { title: string; message: string; confirm: string; cancel: string }
/** the wall's decor changed from `oldCode` to `newCode`. `pre`: what happens at once (the wall changed;
 *  maybe a floor added from the rest); `ask`: today's question (null = none); `yes`: what "Ja" does */
export function wallDecorChanged(dw: Fields, rest: Rest | null, oldCode: string, newCode: string, s: WallSession): { pre: Step; ask: Ask | null; yes: Step | null; toast?: string } | null {
  if (!newCode || oldCode === newCode) return null;
  let pre = wallChanged(dw, rest, s);
  let now = apply(dw, pre.fields);
  const auto = autoAdd(now, rest, newCode, pre.session);
  if (auto) return { pre: { fields: { ...pre.fields, ...auto.fields }, session: auto.session }, ask: null, yes: null, toast: auto.toast };
  if (now.addWallCladding && supplierOf(now) === "ww") {
    if (decorOf(now).code !== oldCode) return { pre, ask: null, yes: null }; // the floor goes with another wall decor (or its own)
    const hasItems = areaOf(now) > 0 || sum(qtyOf(now)) > 0;
    const lost = !!now.wallCladdingUseLeftover && restIn(rest, oldCode) === 0 && restIn(rest, newCode) > 0;
    const change = { ...setFloorDecor(newCode), ...(!now.wallCladdingUseLeftover && restIn(rest, newCode) > 0 && !hasItems ? { wallCladdingUseLeftover: "on" } : {}) };
    const fields = settled(now, change, rest, pre.session.last), yes = { fields, session: followed(apply(now, fields), rest, pre.session) };
    if (!hasItems) return { pre: { fields: { ...pre.fields, ...yes.fields }, session: yes.session }, ask: null, yes: null };
    return { pre, ask: { title: "Fußboden-Dekor auch ändern?", message: `An der Wand ist jetzt ${nameOf(newCode)} statt ${nameOf(oldCode)}. Den Fußboden auch auf ${nameOf(newCode)} umstellen? Fläche und Platten bleiben.` + (lost ? " Bei „Nein“ werden die Reste aus der Wandverkleidung nicht mehr für den Boden angerechnet." : ""), confirm: "Ja, ändern", cancel: "Nein" }, yes };
  }
  const m = restIn(rest, newCode);
  if (!m || pre.session.askedSwitch) return { pre, ask: null, yes: null };
  pre = { ...pre, session: { ...pre.session, askedSwitch: true } };
  now = apply(dw, pre.fields);
  return { pre, ask: { title: "Fußboden auf winwall umstellen?", message: `Von ${nameOf(newCode)} bleiben ca. ${de(m)} m² übrig (schon bezahlt). Den Fußboden auf „Wandverkleidung als Fußboden“ in ${nameOf(newCode)} umstellen? Die Fläche bleibt.`, confirm: "Ja, umstellen", cancel: "Nein" }, yes: wallFloor(now, rest, newCode, String(now.floorArea ?? "") || de(m), pre.session) };
}

// ---- "Ihre Auswahl" ----
export interface Selected { name: string; meta: string; price: string; /** `price` without money (Kundenmodus); absent: `price` holds none */ plain?: string; img: string; stock?: { qty: number; inStock: boolean; text: string } | null; own?: number }
export interface Full { name?: string; netPrice?: number; stockQuantity?: number | null; stockText?: string | null; image?: string }
/** `full`: the catalogue's data of the VIGOUR article; `adhesive`: the unit price of the adhesive; `own`: our own stock per article */
export function selection(dw: Fields, rest: Rest | null, full: Full | null | undefined, adhesive: number, own: Record<string, number> = {}): Selected[] {
  const rows: Selected[] = [], qty = num(dw.wallCladdingQty), credit = creditOf(dw, rest), area = areaOf(dw), ww = supplierOf(dw) === "ww";
  const colour = COLORS.find((c) => c.value === colorOf(dw)), dec = decorOf(dw);
  if (ww) {
    // one row per Dekor with plates (a further Dekor without a valid number is not priced: no row)
    dekoreOf(dw).forEach((d, i) => {
      const dd = i ? decorOf(asFields(d)) : dec;
      if (i && !dd.code) return;
      const code = dd.code || "WS203";
      const lines = winwallOrderLines(code, i ? d.qty : qtyOf(dw)) as { productId: string; qty: number; format: { widthCm: number; heightCm: number } }[];
      if (lines.length) rows.push({ name: "Aluverbundplatte", meta: `${dd.label} · Art.-Nr. ${lines.map((l) => l.productId).join(", ")}`, price: lines.map((l) => `${l.qty} × ${l.format.widthCm}×${l.format.heightCm} cm`).join(" · "), img: `/assets/winwall/${code}.jpg` });
    });
  } else if (!(credit > 0 && qty === 0) && full) {
    const art = articlesOf(dw)[dw.wallCladdingPanelSize === "1497" ? 1497 : 997], net = Number(full.netPrice) || 0;
    rows.push({
      name: full.name || art, meta: `${colorOf(dw)} · Art.-Nr. ${art}`, price: net ? `${qty > 0 ? `${qty} × ` : ""}${eur(net)}${qty > 1 ? ` = ${eur(net * qty)}` : ""}` : "", plain: qty > 0 ? `${qty} Stück` : "", img: colour?.img || full.image || "",
      stock: { qty: Number(full.stockQuantity) || 0, inStock: Number(full.stockQuantity) > 0, text: full.stockText || (Number(full.stockQuantity) > 0 ? "Der Artikel ist im Lager verfügbar." : "Die Ware ist aktuell nicht verfügbar und muss bestellt werden.") }, own: own[art] || 0,
    });
  }
  // the rest's picture is the decor tile's (a typed decor: its swatch when there is one)
  const restImg = ww ? (dw.wallCladdingWwDecor === "custom" ? swatchOf(dec.code) : `/assets/winwall/${String(dw.wallCladdingWwDecor ?? "")}.jpg`) : colour?.img || "";
  if (credit > 0) rows.push({ name: "Reste aus Wandverkleidung", meta: `${ww ? dec.label : colorOf(dw)} · ${m2(credit)} m² · schon bezahlt`, price: ww ? "" : "0,00 €", plain: "", img: restImg });
  if (area > 0) { // the adhesive is for the whole floor, with or without the rest
    const packs = Math.ceil(area / 0.6 - 1e-12);
    rows.push({ name: "Flächenkleber 600 ml", meta: `Art.-Nr. R_4260602 · 1 Pkg je 0,60 m² · ${m2(area)} m² Boden`, price: adhesive > 0 && !ww ? `${packs} × ${eur(adhesive)} = ${eur(adhesive * packs)}` : `${packs} Pkg`, plain: `${packs} Pkg`, img: "/assets/Flächen-Kleber.PNG" });
  }
  return rows;
}
export const restNote = (s: { allCovered?: boolean; area: number } | null, credit: number): string => (!(credit > 0) || !s ? "" : s.allCovered
  ? `${m2(credit)} m² kommen aus Ihrer Wand. Das reicht für den ganzen Boden, es sind keine zusätzlichen Paneele nötig. Der Flächenkleber wird normal berechnet.`
  : `${m2(credit)} m² kommen aus Ihrer Wand. Es fehlen ${m2(s.area)} m², dafür reichen die zusätzlichen Paneele oben. Der Flächenkleber wird normal berechnet.`);
/** the area left after the rest (the note under the plates / cards uses it for both lines) */
export const restArea = (dw: Fields, credit: number): { allCovered: boolean; area: number } | null => { const full = areaOf(dw); if (full <= 0) return null; const area = Math.max(0, full - credit); return { allCovered: area <= 0, area }; };
