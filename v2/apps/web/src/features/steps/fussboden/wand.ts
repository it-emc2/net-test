// Fußboden, mode "Wandverkleidung als Fußboden" — the rules of today's UI
// (test/fixtures/fussboden-wand.json, v2/scripts/capture-fussboden-wand.cjs).
//  - its own product line: winwall (plates 100 / 125 / 150 × 250 cm, a decor) or VIGOUR
//    (panels 997 / 1497 × 2550 mm, a colour). Changing the line empties format and quantity
//  - the area gives a card per format with the number of plates; the one with the least offcut
//    is recommended. Picking a card stores format and quantity; the quantity can be typed.
//    A later change of the area does NOT change the stored quantity (as today)
//  - the rest of the wall cladding (step Wandverkleidung) can be used for the floor when it has
//    the same decor / colour: it is taken off the area before the plates are counted. The
//    adhesive is always for the whole floor
//  - changing the mode or switching off keeps everything that was entered
import { WINWALL_CATALOG, WINWALL_FORMATS, winwallLeftoverM2, winwallOrderLines } from "@oc/pricing";
import { VG_COLORS } from "../wandverkleidung/colors.js";
import { situationOf, wallsOf, WALLS } from "../wandverkleidung/calc.js";
import { WW_DECORS } from "../wandverkleidung/decors.js";
import { decorCode, lineOf, rowsOf } from "../wandverkleidung/rules.js";
import { rowsOf as vigourRowsOf } from "../wandverkleidung/vigour.js";

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
const WW_FLOOR_FORMATS = ["15", "16", "17"]; // 100 / 125 / 150 × 250 cm; two equal plates are ordered as a set
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
export const m2 = (n: number): string => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const catalog = WINWALL_CATALOG as Record<string, string>;
const wwFormat = (code: unknown) => WINWALL_FORMATS.find((f) => f.code === String(code));

// ---- reading the offer ----
/** an offer from before the line existed has no field: VIGOUR */
export const supplierOf = (dw: Fields): Supplier => (dw.wallCladdingSupplier === "ww" ? "ww" : "hm");
export const areaOf = (dw: Fields): number => num(dw.wallCladdingArea);
export const colorOf = (dw: Fields): string => String(dw.wallCladdingColor || "Marmor weiß");
export const articlesFor = (color: string): { 997: string; 1497: string } => WV_ARTICLES()[WV_ARTICLE_KEY(color)] ?? WV_ARTICLES()["marmor weiß"]!;
export const articlesOf = (dw: Fields): { 997: string; 1497: string } => articlesFor(colorOf(dw));
/** the winwall decor of the floor: a tile, or "Anderes Dekor" with a typed number */
export function decorOf(dw: Fields): { code: string | null; name: string | null; label: string } {
  const v = String(dw.wallCladdingWwDecor ?? "");
  const code = decorCode(v === "custom" ? dw.wallCladdingWwDecorCustom : v), name = (code && catalog[code]) || null;
  return { code, name, label: code ? `${name ? `${name} · ` : ""}${code.slice(0, 2)} ${code.slice(2)}` : "" };
}
export function customHint(dw: Fields): { text: string; kind: "" | "ok" | "warn" } {
  const { code, name } = decorOf(dw);
  if (dw.wallCladdingWwDecor !== "custom" || !String(dw.wallCladdingWwDecorCustom ?? "").trim()) return { text: "WS oder NW und 3 Ziffern, z. B. WS 233 – steht im winwall Katalog.", kind: "" };
  if (!code) return { text: "Bitte WS oder NW und 3 Ziffern eingeben, z. B. NW 230.", kind: "warn" };
  return name ? { text: `✓ ${name}`, kind: "ok" } : { text: "Nicht im winwall Katalog 2026 – Nummer bitte prüfen. Wird so bestellt.", kind: "warn" };
}
export const customCaption = (dw: Fields): string => { const { code } = decorOf(dw); return dw.wallCladdingWwDecor === "custom" && code ? `${code.slice(0, 2)} ${code.slice(2)}` : "Anderes Dekor"; };
export { WW_DECORS };

// ---- the rest of the wall cladding ----
export interface Rest { usableM2: number; color: string; supplier?: "ww"; decor?: string; decorName?: string | null }
export interface RestConfig { usable: number; min: number }
export const REST_DEFAULTS: RestConfig = { usable: 0.8, min: 0.5 };
/** What the wall's plates deliver beyond the wall, times the usable share; null below the minimum.
 *  winwall: the first row's decor only. VIGOUR: one colour, no extra colours, and a colour the floor can have. */
export function restOf(wv: Fields, cfg: RestConfig = REST_DEFAULTS): Rest | null {
  if (wv.wvEnabled !== true) return null;
  const line = lineOf(wv);
  if (line === "standard") return null;
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
    return usable ? { usableM2: usable, color: code, supplier: "ww", decor: code, decorName: catalog[code] ?? null } : null;
  }
  const rows = vigourRowsOf(wv);
  for (const size of [997, 1497]) if (rows.filter((r) => r.size === size).length > 1) return null; // extra colours
  if (!rows.length || new Set(rows.map((r) => r.color.split("|").pop()!.trim().toLowerCase())).size !== 1) return null;
  const color = COLORS.find((c) => WV_ARTICLE_KEY(c.value) === rows[0]!.color.split("|").pop()!.trim().toLowerCase());
  if (!color) return null;
  const usable = Math.round(Math.max(0, rows.reduce((a, r) => a + r.qty * PANEL_M2[r.size]!, 0) - area) * cfg.usable * 100) / 100;
  return usable < cfg.min || usable <= 0 ? null : { usableM2: usable, color: color.value };
}
/** does the floor have the rest's decor / colour? */
const sameAsRest = (dw: Fields, rest: Rest): boolean => (rest.supplier === "ww" ? supplierOf(dw) === "ww" && decorOf(dw).code === rest.decor : supplierOf(dw) === "hm" && WV_ARTICLE_KEY(colorOf(dw)) === rest.color.toLowerCase());
/** the m² the switch takes off the floor right now */
export const creditOf = (dw: Fields, rest: Rest | null): number => (rest && dw.wallCladdingUseLeftover && sameAsRest(dw, rest) ? rest.usableM2 : 0);
export const restHint = (dw: Fields, rest: Rest): string => (sameAsRest(dw, rest) ? `${m2(rest.usableM2)} m² ${rest.color}, schon bezahlt — kostenlos für den Boden.`
  : rest.supplier === "ww" ? `Reste sind winwall ${rest.color}. Wählen Sie winwall mit demselben Dekor, um sie anzurechnen.` : `Reste sind ${rest.color}. Wählen Sie dieselbe Farbe, um sie anzurechnen.`);
export const restText = (rest: Rest): string => `Ca. ${m2(rest.usableM2)} m² ${rest.color} bleiben nutzbar übrig und sind schon bezahlt. Damit können Sie den Fußboden belegen, statt neue Paneele zu bestellen.`;

// ---- formats ----
export interface Option { size: string; qty: number; covered: number; waste: number }
export type Suggestion = { area: number; full: number; allCovered: true } | { area: number; full: number; allCovered?: false; ww: boolean; options: Option[]; best: string };
/** A card per format for the area that is left after the rest; the least offcut is recommended
 *  (winwall: the first with the least; VIGOUR: the wide one on a tie). */
export function suggestion(dw: Fields, credit = 0): Suggestion | null {
  const full = areaOf(dw);
  if (full <= 0) return null;
  const area = Math.max(0, full - credit);
  if (area <= 0) return { area: 0, full, allCovered: true };
  if (supplierOf(dw) === "ww") {
    const options = WW_FLOOR_FORMATS.map((c) => { const f = wwFormat(c)!, one = (f.widthCm * f.heightCm) / 10000, qty = Math.ceil(area / one - 1e-9); return { size: c, qty, covered: qty * one, waste: qty * one - area }; });
    return { area, full, ww: true, options, best: options.reduce((a, o) => (o.waste < a.waste - 1e-9 ? o : a)).size };
  }
  const options = ["997", "1497"].map((s) => { const qty = Math.ceil(area / PANEL_M2[s]!); return { size: s, qty, covered: qty * PANEL_M2[s]!, waste: qty * PANEL_M2[s]! - area }; });
  return { area, full, ww: false, options, best: options[1]!.waste <= options[0]!.waste ? "1497" : "997" };
}
const wwLines = (dw: Fields, size: string, qty: number) => winwallOrderLines(decorOf(dw).code || "WS203", { [size]: qty }) as { productId: string; qty: number; format: { price: number; set?: boolean } }[];
export const wwCost = (dw: Fields, size: string, qty: number): number => wwLines(dw, size, qty).reduce((a, l) => a + l.qty * l.format.price, 0);
const eur = (n: number) => `${m2(n)} €`;
export interface Card extends Option { title: string; best: boolean; selected: boolean; count: string; coverage: string; price: string; unit: string; label: string }
/** the cards as the page shows them. `prices`: net price per VIGOUR article */
export function cardsOf(dw: Fields, s: Suggestion | null, prices: Record<string, number> = {}): Card[] {
  if (!s || s.allCovered) return [];
  const picked = String(dw.wallCladdingPanelSize ?? ""), art = articlesOf(dw);
  return s.options.map((o) => {
    const selected = picked === o.size, coverage = `${m2(o.covered)} m² abgedeckt · ${m2(o.waste)} m² Verschnitt`, label = selected ? "✓ Ausgewählt" : "Auswählen";
    if (s.ww) { const f = wwFormat(o.size)!, cost = wwCost(dw, o.size, o.qty); return { ...o, title: `${f.widthCm}×${f.heightCm} cm`, best: s.best === o.size, selected, count: `${o.qty} Platte${o.qty === 1 ? "" : "n"}`, coverage, price: cost > 0 ? eur(cost) : "", unit: `(Listenpreis${o.qty > 1 ? ", ab 2 gleichen als Set" : ""})`, label }; }
    const unit = prices[art[o.size as "997" | "1497"]] || 0;
    return { ...o, title: `${o.size}×2550 mm`, best: s.best === o.size, selected, count: `${o.qty} Stück`, coverage, price: unit > 0 ? eur(unit * o.qty) : "", unit: unit > 0 ? `(${eur(unit)} / Stk.)` : "", label };
  });
}

// ---- changes ----
/** What follows from every change in this mode: the m² taken from the rest are stored; without a
 *  rest the switch goes off; when the rest covers the whole floor, format and quantity go. */
export function settled(dw: Fields, change: Fields, rest: Rest | null): Fields {
  const next = { ...dw, ...change };
  const out: Fields = { ...change };
  if (!rest && next.wallCladdingUseLeftover) { out.wallCladdingUseLeftover = undefined; next.wallCladdingUseLeftover = undefined; }
  const credit = creditOf(next, rest);
  out.wallCladdingLeftoverM2 = credit > 0 ? String(credit) : "";
  if (suggestion(next, credit)?.allCovered && (String(next.wallCladdingPanelSize ?? "") || num(next.wallCladdingQty) > 0)) { out.wallCladdingPanelSize = ""; out.wallCladdingQty = "0"; }
  return out;
}
/** another line: format and quantity belong to the line that is left */
export const setSupplier = (dw: Fields, to: Supplier): Fields => (supplierOf(dw) === to ? {} : { wallCladdingSupplier: to, wallCladdingPanelSize: "", wallCladdingQty: "" });
export const pickCard = (o: Pick<Option, "size" | "qty">): Fields => ({ wallCladdingPanelSize: o.size, wallCladdingQty: String(o.qty) });
export const setQty = (text: string): Fields => ({ wallCladdingQty: String(Number(text) || 0) });
/** the switch "Reste anrechnen": the picked format gets the quantity for the area that is left */
export function useRest(dw: Fields, on: boolean, rest: Rest | null): Fields {
  const change: Fields = { wallCladdingUseLeftover: on ? "on" : undefined }, next = { ...dw, ...change };
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

// ---- "Ihre Auswahl" ----
export interface Selected { name: string; meta: string; price: string; img: string; stock?: { qty: number; inStock: boolean; text: string } | null; own?: number }
export interface Full { name?: string; netPrice?: number; stockQuantity?: number | null; stockText?: string | null; image?: string }
/** `full`: the catalogue's data of the VIGOUR article; `adhesive`: the unit price of the adhesive; `own`: our own stock per article */
export function selection(dw: Fields, rest: Rest | null, full: Full | null | undefined, adhesive: number, own: Record<string, number> = {}): Selected[] {
  const rows: Selected[] = [], qty = num(dw.wallCladdingQty), credit = creditOf(dw, rest), area = areaOf(dw), ww = supplierOf(dw) === "ww";
  const colour = COLORS.find((c) => c.value === colorOf(dw)), dec = decorOf(dw);
  const decorImg = dw.wallCladdingWwDecor === "custom" ? (dec.code ? `/assets/winwall/${dec.code}.jpg` : "") : `/assets/winwall/${String(dw.wallCladdingWwDecor ?? "")}.jpg`;
  if (ww) {
    const size = String(dw.wallCladdingPanelSize ?? ""), f = wwFormat(size);
    if (f && qty > 0) {
      const lines = wwLines(dw, size, qty), sets = lines.filter((l) => l.format.set).reduce((a, l) => a + l.qty, 0);
      rows.push({ name: `winwall Wandverkleidung ${f.widthCm}×${f.heightCm} cm`, meta: `${dec.label} · Art.-Nr. ${lines.map((l) => l.productId).join(", ")}${sets ? ` · ${sets} × Set` : ""}`, price: `${qty} Platte${qty === 1 ? "" : "n"} = ${eur(wwCost(dw, size, qty))}`, img: decorImg });
    }
  } else if (!(credit > 0 && qty === 0) && full) {
    const art = articlesOf(dw)[dw.wallCladdingPanelSize === "1497" ? 1497 : 997], net = Number(full.netPrice) || 0;
    rows.push({
      name: full.name || art, meta: `${colorOf(dw)} · Art.-Nr. ${art}`, price: net ? `${qty > 0 ? `${qty} × ` : ""}${eur(net)}${qty > 1 ? ` = ${eur(net * qty)}` : ""}` : "", img: colour?.img || full.image || "",
      stock: { qty: Number(full.stockQuantity) || 0, inStock: Number(full.stockQuantity) > 0, text: full.stockText || (Number(full.stockQuantity) > 0 ? "Der Artikel ist im Lager verfügbar." : "Die Ware ist aktuell nicht verfügbar und muss bestellt werden.") }, own: own[art] || 0,
    });
  }
  if (credit > 0) rows.push({ name: "Reste aus Wandverkleidung", meta: `${ww ? dec.label : colorOf(dw)} · ${m2(credit)} m² · schon bezahlt`, price: "0,00 €", img: ww ? decorImg : colour?.img || "" });
  if (area > 0) { // the adhesive is for the whole floor, with or without the rest
    const packs = Math.ceil(area / 0.6 - 1e-12);
    rows.push({ name: "Flächenkleber 600 ml", meta: `Art.-Nr. R_4260602 · 1 Pkg je 0,60 m² · ${m2(area)} m² Boden`, price: adhesive > 0 ? `${packs} × ${eur(adhesive)} = ${eur(adhesive * packs)}` : `${packs} Pkg`, img: "/assets/Flächen-Kleber.PNG" });
  }
  return rows;
}
export const restNote = (s: Suggestion | null, credit: number): string => (!(credit > 0) || !s ? "" : s.allCovered
  ? `${m2(credit)} m² kommen aus Ihrer Wand. Das reicht für den ganzen Boden, es sind keine zusätzlichen Paneele nötig. Der Flächenkleber wird normal berechnet.`
  : `${m2(credit)} m² kommen aus Ihrer Wand. Es fehlen ${m2(s.area)} m², dafür reichen die zusätzlichen Paneele oben. Der Flächenkleber wird normal berechnet.`);
