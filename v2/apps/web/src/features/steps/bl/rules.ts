// Badelift (step `bl`) — what today's page stores and shows (test/fixtures/badelift.json,
// v2/scripts/capture-badelift.cjs; legacy: index.html #page-bl, script.js collectBlExtras,
// attachProjectSketchesToPayload, restoreBl, initBlQuickAddRepeater, initBlProductCards).
//  - five product cards: the main product „Juwel Tuchlift Premium“ (BRS-912, ticked in a new offer)
//    and four accessories; each has a quantity that can be typed only while the card is ticked;
//    leaving a card with an empty quantity fills „1“
//  - free items („Freier Posten (Quick Add)“): rows of Bezeichnung, Preis (netto), Menge, Artikel-ID;
//    a row is stored only with Bezeichnung, Preis and Artikel-ID filled (rows with less are kept on
//    the page, not in the offer). „+“ adds a row only when the last one has those three, else a
//    warning „Bitte zuerst Bezeichnung, Preis und Artikel-ID ausfüllen.“; the trash can removes the
//    row, the last one is cleared instead
//  - `bl` is written whole on every change of the page (today: buildPayload builds it from scratch):
//    { quickAdd?, blNote, sketch: { json, dataUrl } } — `quickAdd` lists the ticked cards in page
//    order as { kind "bl-item", group "Badelift", label (the card's value), productId, qty }, then the
//    free items as { kind "bl-custom", group "QuickAdd", label (trimmed), productId (trimmed), qty, price };
//    removed when empty. qty = max(1, number typed) — empty, 0 and text count as 1, „2.5“ stays 2.5;
//    price: today's parseMoneyEuro (0 when not above 0 — such a row is stored, the price leaves it out)
//  - nothing else of the offer changes; the price (server, `POST /api/price`) follows `bl.quickAdd`
//  - an opened offer shows what is stored: a stored card is ticked with its quantity, free items as
//    rows (price as „99,5“). Stored ids without a card are not shown; like today they are dropped at
//    the first change on this page (the section is written whole). See `formOf` for the main product.
//  - „Weiter“ has no check on this page
import { parseMoney } from "../bwt/extras-rules.js";

type Fields = Record<string, unknown>;
export interface Product { id: string; value: string; title: string; sub: string; img: string; main?: boolean }
export const PRODUCTS: readonly Product[] = [
  { id: "BRS-912", value: "Juwel Tuchlift Premium", title: "Juwel Tuchlift Premium", sub: "BRS-912 · Hauptprodukt", img: "/assets/tuchlift.png", main: true },
  { id: "BRS-909", value: "Gleittuch", title: "Gleittuch", sub: "BRS-909", img: "/assets/BRS-909.jpg" },
  { id: "BHT-914", value: "Halterung ohne zu bohren", title: "Halterung ohne zu bohren", sub: "BHT-914", img: "/assets/BHT-914.jpg" },
  { id: "BHT-2013", value: "Ladegerät für Juwel Tuchlift (Ersatzteil)", title: "Ladegerät für Juwel Tuchlift", sub: "BHT-2013 · Ersatzteil", img: "/assets/BHT-2013.jpg" },
  { id: "BRS-802", value: "Akkupack für Juwel Tuchlift (Ersatzteil)", title: "Akkupack für Juwel Tuchlift", sub: "BRS-802 · Ersatzteil", img: "/assets/BRS-802.jpg" },
];
export const PREVIEW = { src: "/assets/tuchliftnobg.png", alt: "Juwel Tuchlift Premium Gesamtansicht" };
export const ADD_WARNING = "Bitte zuerst Bezeichnung, Preis und Artikel-ID ausfüllen.";

export interface Row { name: string; price: string; qty: string; id: string }
export const EMPTY_ROW: Row = { name: "", price: "", qty: "", id: "" };
/** the page as typed: ticks, quantities as text, free item rows; `locked`: a quantity that cannot be typed yet (see `formOf`) */
export interface Form { on: Record<string, boolean>; qty: Record<string, string>; rows: Row[]; locked?: Record<string, boolean> }

const list = (v: unknown): Fields[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Fields[]) : []);

/** the page for a stored `bl` section (what is being typed wins: `remembered`) */
export function formOf(bl: Fields, remembered?: unknown): Form {
  if (remembered && typeof remembered === "object") return remembered as Form;
  const qa = list(bl.quickAdd), on: Record<string, boolean> = {}, qty: Record<string, string> = {}, locked: Record<string, boolean> = {};
  for (const p of PRODUCTS) { on[p.id] = false; qty[p.id] = "1"; }
  for (const r of qa) {
    const pid = String(r.productId ?? "").trim();
    if (r.kind !== "bl-item" || !(pid in on)) continue;
    on[pid] = true;
    qty[pid] = String(Number(r.qty ?? 1) || 1);
    // LEGACY QUIRK (ported): today's restore ticks a card without its change event, so the quantity of
    // an accessory ticked by opening an offer stays greyed out until the card is tapped off and on
    // (the main product's quantity is free: it is ticked in every new page)
    if (!PRODUCTS.find((p) => p.id === pid)?.main) locked[pid] = true;
  }
  const custom = qa.filter((r) => r.kind === "bl-custom").map((r) => ({
    name: String(r.label ?? r.name ?? ""), id: String(r.productId ?? ""), qty: r.qty != null ? String(r.qty) : "",
    price: typeof r.price === "number" ? String(r.price).replace(".", ",") : String(r.price ?? ""),
  }));
  return { on, qty, rows: custom.length ? custom : [{ ...EMPTY_ROW }], locked };
}

/** a row that goes into the offer: Bezeichnung, Preis and Artikel-ID filled */
export const complete = (r: Row): boolean => !!(r.name.trim() && r.id.trim() && r.price.trim());
const qtyOf = (text: string): number => Math.max(1, Number(text || 1) || 1);

/** `bl.quickAdd` for the page — undefined when nothing is chosen */
export function quickAddOf(f: Form): Fields[] | undefined {
  const items: Fields[] = PRODUCTS.filter((p) => f.on[p.id]).map((p) => ({ kind: "bl-item", group: "Badelift", label: p.value, productId: p.id, qty: qtyOf(f.qty[p.id] ?? "") }));
  for (const r of f.rows) {
    if (!complete(r)) continue;
    items.push({ kind: "bl-custom", group: "QuickAdd", label: r.name.trim(), productId: r.id.trim(), qty: qtyOf(r.qty.trim()), price: parseMoney(r.price.trim()) });
  }
  return items.length ? items : undefined;
}

/** the whole `bl` section as today's page writes it */
export function sectionOf(f: Form, note: string, sketch: { json: string; dataUrl: string }): Fields {
  const quickAdd = quickAddOf(f);
  return { ...(quickAdd ? { quickAdd } : {}), blNote: note, sketch: { json: sketch.json, dataUrl: sketch.dataUrl } };
}

/** tapping a card; a card turned off with an empty quantity gets „1“ back */
export function toggle(f: Form, id: string): Form {
  const on = !f.on[id];
  return { ...f, on: { ...f.on, [id]: on }, qty: !on && !f.qty[id] ? { ...f.qty, [id]: "1" } : f.qty, locked: { ...f.locked, [id]: false } };
}
/** the quantity can be typed: the card is ticked (and not locked by opening the offer) */
export const qtyOpen = (f: Form, id: string): boolean => !!f.on[id] && !f.locked?.[id];
export const setQty = (f: Form, id: string, text: string): Form => ({ ...f, qty: { ...f.qty, [id]: text } });
export const editRow = (f: Form, i: number, field: keyof Row, text: string): Form => ({ ...f, rows: f.rows.map((r, at) => (at === i ? { ...r, [field]: text } : r)) });
/** „+“: one more row, or null when the last row is not complete (the warning is shown) */
export function addRow(f: Form): Form | null {
  const last = f.rows[f.rows.length - 1];
  if (last && !complete(last)) return null;
  return { ...f, rows: [...f.rows, { ...EMPTY_ROW }] };
}
/** the trash can: the last remaining row is cleared, else the row goes */
export const removeRow = (f: Form, i: number): Form => ({ ...f, rows: f.rows.length <= 1 ? [{ ...EMPTY_ROW }] : f.rows.filter((_, at) => at !== i) });

/** LEGACY QUIRK (ported): opening an offer puts its sketch on the pad, and the pad then writes an empty
 *  drawing as '{"version":1,"ops":[]}' — so the first change after opening an offer without a sketch
 *  stores that instead of "" (no effect on documents or price) */
export const EMPTY_SKETCH_JSON = JSON.stringify({ version: 1, ops: [] });
export const afterOpening = (s: { json: string; dataUrl: string }): { json: string; dataUrl: string } => (!s.json && !s.dataUrl ? { json: EMPTY_SKETCH_JSON, dataUrl: "" } : s);

/** step list: something is chosen */
export const hasContent = (bl: Fields): boolean => list(bl.quickAdd).length > 0;
