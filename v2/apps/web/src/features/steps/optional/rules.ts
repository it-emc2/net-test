// Optionale Produkte (Badumbau) — the rules of today's UI (test/fixtures/optional.json,
// v2/scripts/capture-optional.cjs). What the offer stores in `optional`:
//  - `qty_<article>` for every product: "0" while it is not ticked, "1" when it is ticked
//    without a quantity, otherwise what was typed
//  - one list per group of products (`optGrab[]`, …) with the values of the ticked ones in page
//    order — not stored while none is ticked; REHA products also `opt_<article>: true`
//  - `showerMount`: where the tap sits (decides which shower systems fit)
//  - `quickAdd`: the complete free items, then the free wash basin (`source: "BASIN_SONDER"`)
// Not stored: which cards are ticked. A card is ticked while it has picks or was opened; leaving
// its dialog without a pick unticks it and empties it (also the answer about the tap).
import { CATEGORIES, type Product } from "./catalog.js";

type Fields = Record<string, unknown>;
export interface Row { name: string; price: string; qty: string; id: string }
export interface FreeBasin { name: string; artikel: string; price: string }
/** what the page remembers while the offer is open but does not store */
export interface Ui {
  /** cards that were opened and not emptied since */
  open: readonly string[];
  /** the free items as typed, incomplete ones too (null: as stored in the offer) */
  rows: readonly Row[] | null;
  basin: FreeBasin | null;
  /** the thermostat that came with "versetzt" — it goes again with "direkt" */
  autoThermo: string | null;
}
export const NO_UI: Ui = { open: [], rows: null, basin: null, autoThermo: null };
export interface State { opt: Fields; ui: Ui }
export type Mount = "versetzt" | "direkt";

const BY_ID = new Map<string, Product>();
const BY_GROUP = new Map<string, Product[]>();
for (const c of CATEGORIES) for (const p of c.products) { BY_ID.set(p.id, p); BY_GROUP.set(p.group, [...(BY_GROUP.get(p.group) ?? []), p]); }
export const productOf = (id: string): Product | undefined => BY_ID.get(id);
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id);

/** only one shower system and only one thermostat: the others are locked while one is ticked */
const ONLY_ONE: readonly (readonly string[])[] = [["V22WS1R", "TEMPDSU250", "V22BG903R", "V12DS250E", "STRAYT"], ["CLTB", "DEPTB", "CLB"]];
const THERMOSTATS = ONLY_ONE[1]!;
const HOSE = "DESIBS160";
export const BASINS: readonly string[] = ["CL60", "CL65", "CL55", "ON35", "COAIR40", "DEP65U", "BASIN_SONDER"];
export const FREE_BASIN = "BASIN_SONDER";
const BASIN_PARTS: readonly string[] = ["WTBF", "RSL", "EV"];
/** accessories that come with a product, one each */
const COMES_WITH: Record<string, readonly string[]> = { ONSHB: ["YNORGH21825"], WESGH: ["TRGAVS15", "INSTMATROH"] };
/** REHA products today's page shows without a quantity: ticking stores the product, its quantity stays 0 */
const NO_QUANTITY: ReadonlySet<string> = new Set(["78061000", "78062300", "78700150", "78058100", "78059100", "78700000", "78700100"]);
export const hasQuantity = (id: string): boolean => !NO_QUANTITY.has(id);

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
export const isOn = (opt: Fields, id: string): boolean => { const p = BY_ID.get(id); return !!p && list(opt[p.group]).includes(p.value); };
export const qtyOf = (opt: Fields, id: string): string => String(opt[`qty_${id}`] ?? "");
/** today's reading of a typed number: dots are thousands, a comma is the decimal sign */
const num = (v: unknown, fallback = 0): number => { const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : fallback; };
/** today's tolerant reading of a price: "1.099,50", "1099.50", "12,2" */
export function money(v: unknown): number {
  let s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = (s.includes(".") ? s.replace(/\./g, "") : s).replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
const digits = (v: string): string => v.replace(/[^\d]/g, "");
/** the same content, whatever the order of the keys */
const stable = (v: unknown): unknown => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Fields)[k])])) : v);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** tick or untick one product: its list (page order) and its quantity */
function tick(opt: Fields, id: string, on: boolean): Fields {
  const p = BY_ID.get(id);
  if (!p || isOn(opt, id) === on) return opt;
  const before = list(opt[p.group]);
  const ticked = new Set(before);
  if (on) ticked.add(p.value); else ticked.delete(p.value);
  const known = BY_GROUP.get(p.group)!.map((x) => x.value);
  const values = [...known.filter((v) => ticked.has(v)), ...before.filter((v) => !known.includes(v))];
  const out: Fields = { ...opt };
  if (values.length) out[p.group] = values; else delete out[p.group];
  if (hasQuantity(id)) { const q = qtyOf(opt, id); out[`qty_${id}`] = on ? (!q || parseInt(q, 10) <= 0 ? "1" : q) : "0"; }
  if (p.group === "optReha[]") { if (on) out[`opt_${id}`] = true; else delete out[`opt_${id}`]; }
  return out;
}

const anyBasin = (opt: Fields) => BASINS.some((b) => isOn(opt, b));
/** fixing set and siphon: one per basin, angle valves: two — set again with every change of a basin */
function basinParts(opt: Fields): Fields {
  if (!anyBasin(opt)) return opt;
  const out = { ...opt };
  let total = 0;
  for (const b of BASINS) {
    if (!isOn(out, b)) continue;
    let q = num(qtyOf(out, b), 1);
    if (q < 1) { q = 1; out[`qty_${b}`] = "1"; }
    total += q;
  }
  if (isOn(out, "WTBF")) out.qty_WTBF = String(total);
  if (isOn(out, "RSL")) out.qty_RSL = String(total);
  if (isOn(out, "EV")) out.qty_EV = String(total * 2);
  return out;
}
/** the accessories of a product follow it: ticked, and as many as the product */
function follow(opt: Fields, id: string): Fields {
  let out = opt;
  for (const part of COMES_WITH[id] ?? []) out = { ...tick(out, part, true), [`qty_${part}`]: String(Number(qtyOf(opt, id)) || 1) };
  return out;
}
/** what follows once a product was ticked or unticked */
function after(opt: Fields, id: string): Fields {
  const on = isOn(opt, id);
  if (on) for (const group of ONLY_ONE) if (group.includes(id)) for (const other of group) if (other !== id) opt = tick(opt, other, false);
  if (on && COMES_WITH[id]) opt = follow(opt, id);
  if (BASINS.includes(id)) {
    if (on) { for (const part of BASIN_PARTS) opt = tick(opt, part, true); opt = basinParts(opt); }
    else if (!anyBasin(opt)) for (const part of BASIN_PARTS) opt = tick(opt, part, false); // the last basin takes its accessories with it
  }
  return opt;
}
const set = (opt: Fields, id: string, on: boolean): Fields => (isOn(opt, id) === on ? opt : after(tick(opt, id, on), id));

// ---- free items ----
export const EMPTY_ROW: Row = { name: "", price: "", qty: "", id: "" };
const NO_BASIN: FreeBasin = { name: "", artikel: "", price: "" };
interface Stored { label?: unknown; price?: unknown; qty?: unknown; productId?: unknown; source?: unknown }
const stored = (opt: Fields): Stored[] => (Array.isArray(opt.quickAdd) ? (opt.quickAdd as Stored[]).filter((q) => q && typeof q === "object") : []);
const shownPrice = (p: unknown): string => (typeof p === "number" ? String(p).replace(".", ",") : p == null ? "" : String(p));
/** the rows of the free items: as typed, or as the offer stores them; always at least one */
export function rowsOf({ opt, ui }: State): Row[] {
  const rows = ui.rows ?? stored(opt).filter((q) => q.source !== FREE_BASIN).map((q) => ({ name: String(q.label ?? ""), price: shownPrice(q.price), qty: Number(q.qty) > 0 ? String(q.qty) : "", id: String(q.productId ?? "") }));
  return rows.length ? [...rows] : [{ ...EMPTY_ROW }];
}
export function basinOf({ opt, ui }: State): FreeBasin {
  if (ui.basin) return ui.basin;
  const q = stored(opt).find((x) => x.source === FREE_BASIN);
  return q ? { name: String(q.label ?? ""), artikel: String(q.productId ?? ""), price: shownPrice(q.price) } : NO_BASIN;
}
/** `quickAdd` as today's UI builds it: complete rows (name and price; quantity 1 when none), then the free wash basin */
function quickAdd(s: State): unknown[] {
  const out: unknown[] = [];
  for (const r of s.ui.rows ?? rowsOf(s)) {
    const label = r.name.trim(), price = money(r.price);
    let qty = Number(r.qty.replace(/[^\d-]/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) qty = label && price > 0 ? 1 : 0;
    if (label && price > 0 && qty > 0) out.push({ label, price, qty, productId: r.id.trim() });
  }
  if (isOn(s.opt, FREE_BASIN)) {
    const b = basinOf(s), name = b.name.trim();
    const price = Number(b.price.replace(/\./g, "").replace(",", ".")) || 0; // a dot is always read as thousands here
    if (name && price > 0) out.push({ label: name, price, qty: Number(digits(qtyOf(s.opt, FREE_BASIN))) || 1, productId: b.artikel.trim(), source: FREE_BASIN });
  }
  return out;
}
/** after every change: `quickAdd` follows the rows, and a card whose product got ticked — by
 *  hand or by another product — stays ticked until its dialog is left empty */
const done = (s: State): State => {
  const next = quickAdd(s);
  if (!same(next, s.opt.quickAdd ?? null)) s = { ...s, opt: { ...s.opt, quickAdd: next } };
  const ticked = CATEGORIES.filter((c) => !s.ui.open.includes(c.id) && c.products.some((p) => isOn(s.opt, p.id))).map((c) => c.id);
  return ticked.length ? { ...s, ui: { ...s.ui, open: [...s.ui.open, ...ticked] } } : s;
};

// ---- what the user does ----
export const toggleProduct = (s: State, id: string): State => done({ ...s, opt: set(s.opt, id, !isOn(s.opt, id)) });

export function setQty(s: State, id: string, text: string): State {
  let opt: Fields = { ...s.opt, [`qty_${id}`]: text };
  if (COMES_WITH[id] && isOn(opt, id)) opt = follow(opt, id);
  if (BASINS.includes(id)) opt = basinParts(opt);
  return done({ ...s, opt });
}

/** The tap directly below the rail or offset: the systems of the other answer go; "versetzt"
 *  brings the hose and, while no thermostat is ticked, the first one — which "direkt" removes again. */
export function setMount(s: State, mount: Mount): State {
  if (s.opt.showerMount === mount) return s;
  let opt: Fields = { ...s.opt, showerMount: mount };
  let autoThermo = s.ui.autoThermo;
  for (const p of categoryOf("SHOWER")!.products) if (p.mount !== mount) opt = set(opt, p.id, false);
  if (mount === "versetzt") {
    opt = set(opt, HOSE, true);
    if (!THERMOSTATS.some((t) => isOn(opt, t))) { opt = set(opt, THERMOSTATS[0]!, true); autoThermo = THERMOSTATS[0]!; }
  } else {
    if (autoThermo) opt = set(opt, autoThermo, false);
    autoThermo = null;
  }
  return done({ opt, ui: { ...s.ui, autoThermo } });
}
/** the shower systems shown: those of the answer; without an answer (older offers) only ticked ones */
export const fitsMount = (opt: Fields, p: Product): boolean => (opt.showerMount ? p.mount === opt.showerMount : isOn(opt, p.id));
/** locked: another product of a group that allows only one is ticked */
export const isLocked = (opt: Fields, id: string): boolean => ONLY_ONE.some((g) => g.includes(id) && g.some((o) => o !== id && isOn(opt, o)));

// ---- cards, dialog, bar ----
const WC_LISTS = ["optWcWall[]", "optWcWall_alias[]"];
const BATHTUB_FIELDS = ["chosenBathtubProductId", "chosenScreenProductId"];
/** what a card counts: ticked products (accessories too), free items with a name, bathtub and screen */
export function count(s: State, cat: string): number {
  if (cat === "SONDER") return rowsOf(s).filter((r) => r.name.trim()).length;
  if (cat === "WANNE") return BATHTUB_FIELDS.filter((f) => String(s.opt[f] ?? "").trim()).length;
  if (cat === "WC") return WC_LISTS.reduce((n, f) => n + list(s.opt[f]).length, 0);
  return (categoryOf(cat)?.products ?? []).filter((p) => isOn(s.opt, p.id)).length;
}
export const cardOn = (s: State, cat: string): boolean => s.ui.open.includes(cat) || count(s, cat) > 0;
export const openCard = (s: State, cat: string): State => (s.ui.open.includes(cat) ? s : { ...s, ui: { ...s.ui, open: [...s.ui.open, cat] } });
/** Leaving a dialog: a card without a pick is unticked and emptied. */
export function closeCard(s: State, cat: string): State {
  if (count(s, cat) > 0) return s;
  const opt: Fields = { ...s.opt };
  if (cat === "SHOWER") delete opt.showerMount;
  return done({ opt, ui: { ...s.ui, open: s.ui.open.filter((c) => c !== cat), ...(cat === "SONDER" ? { rows: [] } : {}) } });
}

export interface Chip { cat: string; text: string; title: string; product?: string; row?: number; fixed?: boolean }
/** the bar "Ausgewählte Optionen": every pick of every ticked card, in page order */
export function chips(s: State): Chip[] {
  const out: Chip[] = [];
  for (const c of CATEGORIES) {
    if (!cardOn(s, c.id)) continue;
    const chip = (text: string, more: Partial<Chip>) => out.push({ cat: c.id, text, title: `${c.name}: ${text}`, ...more });
    if (c.id === "SONDER") rowsOf(s).forEach((r, row) => { if (r.name.trim()) chip(r.name.trim(), { row }); });
    else if (c.id === "WANNE") for (const f of BATHTUB_FIELDS) { const art = String(s.opt[f] ?? "").trim(); if (art) chip(art, { fixed: true }); }
    else if (c.id === "WC") for (const f of WC_LISTS) for (const v of list(s.opt[f])) chip(v, { fixed: true });
    else for (const p of c.products) if (isOn(s.opt, p.id)) chip(p.name, { product: p.id });
  }
  return out;
}

/** the products whose caption contains the search text (upper and lower case alike) */
export const searchProducts = (products: readonly Product[], query: string): readonly Product[] => { const q = query.trim().toLowerCase(); return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products; };

/** the label of a quantity; pipe collars and angle valves say how many pairs that is */
export function qtyLabel(opt: Fields, p: Product): string {
  if (p.id === "TECEADS") { const n = num(qtyOf(opt, p.id)); return `${p.qtyLabel} (${n > 0 ? n : 0} paare)`; }
  if (p.id === "EV") { const pairs = num(qtyOf(opt, p.id)) / 2; return `${p.qtyLabel} (${Number.isInteger(pairs) ? pairs : pairs.toFixed(1)} paare)`; }
  return p.qtyLabel;
}

// ---- free items: what typing does ----
const withRow = (s: State, i: number, change: (r: Row) => Row): State => done({ ...s, ui: { ...s.ui, rows: rowsOf(s).map((r, at) => (at === i ? change({ ...r }) : r)) } });
export function editRow(s: State, i: number, field: keyof Row, text: string): State {
  return withRow(s, i, (r) => {
    if (field === "qty") { const d = digits(text); r.qty = d === "0" ? "" : d; } // a 0 is never shown
    else if (field === "price") {
      r.price = text;
      const q = Number(digits(r.qty));
      if (money(text) > 0) { if (!(q > 0)) r.qty = "1"; } else if (r.qty.trim() === "0") r.qty = "";
    } else r[field] = text;
    return r;
  });
}
/** leaving the quantity: a priced row without one gets 1 */
export const leaveQty = (s: State, i: number): State => withRow(s, i, (r) => { const q = Number(digits(r.qty)) || 0; if (money(r.price) > 0 && q <= 0) r.qty = "1"; else if (q === 0) r.qty = ""; return r; });
/** A further row only once the last one has a name, a price and an article number; otherwise the missing field. */
export function addRow(s: State): { state: State; missing?: keyof Row } {
  const rows = rowsOf(s), last = rows[rows.length - 1]!;
  if (!last.name.trim()) return { state: s, missing: "name" };
  if (!(money(last.price) > 0)) return { state: s, missing: "price" };
  if (!last.id.trim()) return { state: s, missing: "id" };
  const filled = Number(digits(last.qty)) > 0 ? last : { ...last, qty: "1" };
  return { state: done({ ...s, ui: { ...s.ui, rows: [...rows.slice(0, -1), filled, { ...EMPTY_ROW }] } }) };
}
/** removing the only row empties it */
export const removeRow = (s: State, i: number): State => { const rows = rowsOf(s); return done({ ...s, ui: { ...s.ui, rows: rows.length <= 1 ? [{ ...EMPTY_ROW }] : rows.filter((_, at) => at !== i) } }); };
export const editBasin = (s: State, field: keyof FreeBasin, text: string): State => done({ ...s, ui: { ...s.ui, basin: { ...basinOf(s), [field]: text } } });

/** a pick removed in the bar */
export const removeChip = (s: State, chip: Chip): State => (chip.product ? (isOn(s.opt, chip.product) ? toggleProduct(s, chip.product) : s) : chip.row != null ? removeRow(s, chip.row) : s);

/** the fields of `optional` that differ (`undefined`: removed) — one change of the offer */
export function changedFields(before: Fields, now: Fields): Fields {
  const out: Fields = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(now)])) if (!same(before[k], now[k])) out[k] = now[k];
  return out;
}

/** A ticked shower system needs the answer where the tap sits. Today's UI means to ask for it on
 *  "Weiter" but never does (its check is wired to a step name that does not exist), so this rule
 *  is not registered as the step's check either. */
export const optionalProblem = (s: State): { message: string } | null =>
  cardOn(s, "SHOWER") && !s.opt.showerMount ? { message: "Duschsystem: Bitte angeben, ob die Armatur direkt unter dem Gestänge sitzt oder versetzt ist." } : null;
