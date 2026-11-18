// Optionale Produkte → WC (Badumbau) — today's wireWcMenu (src/public/script.js), reference
// test/fixtures/optional-wanne-wc.json. What today's page does and stores:
//  - Montageart (Wand / Boden) first; for Wandmontage also the Sitzhöhe. The products appear with
//    the first Montageart and from then on their fields are stored (`qty_<article>`, "0" while not
//    ticked — also after the card was left empty).
//  - The required products of the Montageart are ticked whenever the Montageart is chosen or
//    changed (Wand: VIS element, Montageset, Betätigungsplatte, Gipskarton, Anschlussgarnitur;
//    Boden: the Anschlussgarnitur, which moves into the Boden group). The products of the other
//    Montageart are unticked.
//  - WC + seat pairs: one WC at a time (the others are locked); ticking a WC ticks the seat of its
//    pair and unticks every other seat; the WC "Erhöhung" is only offered for a raised seat. A seat
//    shared by two WCs is shown in both pairs: the second one is stored in its own list
//    (`optWcWall_alias[]`, quantity `wcalias_<seat>__pair_<wc>`), the quantity of the seat that is
//    priced is `qty_<seat>` — "1" for the seat of the ticked WC, else "0", set again on every
//    change of the WC, the Montageart or the Sitzhöhe. Tapping the second seat ticks its WC.
//  - `optWcWall[]` holds the names of the ticked products (as the price list has them) in page order.
//  - Leaving the dialog with nothing ticked unticks everything and forgets Montageart and Sitzhöhe.

type Fields = Record<string, unknown>;
export interface WcItem {
  id: string; fallbackName: string; category: "accessory" | "seat" | "wc" | "floor";
  montage?: "Bodenmontage" | "both"; image?: string; images?: readonly string[]; dims?: readonly (readonly [string, number])[];
  seatId?: string; requiredSeatHeight?: string;
}
const A = "/assets/wc/";
export const WC: readonly WcItem[] = [
  { id: "CVIS3WCT112", image: `${A}CVIS3WCT112/CVIS3WCT112-1.jpg`, fallbackName: "VIS WC-Element E3 für Trockenbau", category: "accessory" },
  { id: "SCHALL", image: `${A}SCHALL/SCHALL-1.jpg`, fallbackName: "Montageset für Wand-WC / WD-Bidet", category: "accessory" },
  { id: "V1DON", image: `${A}V1DON/V1DON-1.jpg`, fallbackName: "Betätigungsplatte V1 DON weiß", category: "accessory" },
  { id: "0601010003", image: `${A}0601010003/0601010003-1.jpg`, fallbackName: "Knauf Gipskarton-Bauplatte GKBI imprägniert", category: "accessory" },
  { id: "WWCAG90", image: `${A}WWCAG90/WWCAG90-1.jpg`, fallbackName: "Wand-WC-Anschlussgarnitur PE d:90mm", category: "accessory", montage: "both" },
  { id: "DERSIAS", dims: [["Breite", 361], ["Länge", 433]], image: `${A}DERSIAS/DERSIAS-1.jpg`, fallbackName: "WC-Sitz derby rund", category: "seat" },
  { id: "CLSIAS", dims: [["Höhe", 59], ["Breite", 365], ["Länge", 450]], image: `${A}CLSIAS/CLSIAS-1.jpg`, fallbackName: "WC-Sitz clivia", category: "seat" },
  { id: "DERWWCOSVP", dims: [["Höhe", 430], ["Breite", 355], ["Tiefe", 540]], images: [1, 2, 3].map((n) => `${A}DERWWCOSVP/DERWWCOSVP-${n}.jpg`), fallbackName: "Wand-Tiefspül-WC derby rund", category: "wc", seatId: "DERSIAS" },
  { id: "DEDWWC", dims: [["Höhe", 400], ["Breite", 370], ["Tiefe", 594]], images: [1, 2, 3, 4].map((n) => `${A}DEDWWC/DEDWWC-${n}.jpg`), fallbackName: "derby V3 AQUAWASH Dusch-Wand-WC", category: "wc", seatId: "DERSIAS" },
  { id: "CLPWWCOS5", dims: [["Höhe", 450], ["Breite", 355], ["Tiefe", 540]], images: [1, 2, 3, 4].map((n) => `${A}CLPWWCOS5/CLPWWCOS5-${n}.jpg`), fallbackName: "WC-Erhöhung CLPWWCOS5", category: "wc", requiredSeatHeight: "erhoeht", seatId: "CLSIAS" },
  { id: "CLPWCF10", dims: [["Höhe", 490], ["Breite", 354], ["Tiefe", 457]], image: `${A}CLPWCF10/CLPWCF10-1.jpg`, fallbackName: "Stand-Flachspül-WC clivia V2 plus +10cm Abgang waagerecht weiß", category: "floor", montage: "Bodenmontage" },
  { id: "WCBF", image: `${A}WCBF/WCBF-1.jpg`, fallbackName: "Befestigungssatz Fischer S 8 RD 80 WCR", category: "floor", montage: "Bodenmontage" },
  { id: "CLPSSI", dims: [["Höhe", 45], ["Breite", 373], ["Länge", 435]], image: `${A}CLPSSI/CLPSSI-1.jpg`, fallbackName: "WC-Sitz clivia V2 plus für Stand-WCs weiß", category: "floor", montage: "Bodenmontage" },
];
export const WC_IDS = WC.map((x) => x.id);
const BY = new Map(WC.map((x) => [x.id, x]));
export const wcItem = (id: string) => BY.get(id.split("__")[0]!)!;
const montageOf = (x: WcItem) => x.montage || "Wandmontage";
export const MONTAGES = [
  { value: "Wandmontage", img: "/assets/wc/montage/wandmontage.jpg" },
  { value: "Bodenmontage", img: "/assets/wc/montage/bodenmontage.jpg" },
] as const;
export const SEATS = [{ value: "erhoeht", label: "Erhöht" }, { value: "normal", label: "Normal" }] as const;

/** a tile on the page: an article, or the second appearance of a shared seat ("<seat>__pair_<wc>") */
export type TileId = string;
const isAlias = (t: TileId) => t.includes("__pair_");
const LIST = "optWcWall[]", ALIAS_LIST = "optWcWall_alias[]";
const qtyKey = (t: TileId) => (isAlias(t) ? `wcalias_${t}` : `qty_${t}`);
/** the shared seats shown again in a second pair */
const ALIASES: readonly TileId[] = (() => {
  const seen = new Set<string>(), out: string[] = [];
  for (const wc of WC.filter((x) => x.category === "wc")) if (wc.seatId) { if (seen.has(wc.seatId)) out.push(`${wc.seatId}__pair_${wc.id}`); else seen.add(wc.seatId); }
  return out;
})();
const pairOf = (t: TileId): string | null => {
  if (isAlias(t)) return t.split("__pair_")[1]!;
  const wc = WC.find((x) => x.category === "wc" && x.seatId === t);
  return wc ? wc.id : null;
};

// ---- the groups of the page, in page order ----
export interface Group { montage: string; kind: "required" | "wc" | "optional"; head: string; items: TileId[][] }
export function groupsOf(montage: string): Group[] {
  const out: Group[] = [];
  const inM = (x: WcItem) => montageOf(x) === montage || (x.montage === "both" && montage === "Wandmontage");
  const required = WC.filter((x) => x.category === "accessory" && inM(x) && x.montage !== "both");
  const both = WC.filter((x) => x.montage === "both");
  const wcs = WC.filter((x) => x.category === "wc" && inM(x));
  const optional = WC.filter((x) => x.category === "floor" && inM(x));
  // the Anschlussgarnitur ("both") stands in the first group of the chosen Montageart that is not the WCs
  const first = required.length ? "required" : optional.length ? "optional" : null;
  const withBoth = (kind: string, ids: string[]) => (kind === first ? [...ids, ...both.map((x) => x.id)] : ids);
  if (required.length) out.push({ montage, kind: "required", head: `Produkte für ${montage}`, items: withBoth("required", required.map((x) => x.id)).map((id) => [id]) });
  if (wcs.length) {
    const shown = new Set<string>();
    out.push({
      montage, kind: "wc", head: `WCs für ${montage}`,
      items: wcs.map((wc) => {
        if (!wc.seatId) return [wc.id];
        const seat = shown.has(wc.seatId) ? `${wc.seatId}__pair_${wc.id}` : wc.seatId;
        shown.add(wc.seatId);
        return [wc.id, seat];
      }),
    });
  }
  if (optional.length) out.push({ montage, kind: "optional", head: required.length ? `Weitere Produkte für ${montage}` : `Produkte für ${montage}`, items: withBoth("optional", optional.map((x) => x.id)).map((id) => [id]) });
  return out;
}
/** the tiles in page order (where the Anschlussgarnitur stands depends on the Montageart) */
const pageOrder = (montage: unknown): TileId[] => {
  const m = montage === "Bodenmontage" ? "Bodenmontage" : "Wandmontage";
  const other = m === "Wandmontage" ? "Bodenmontage" : "Wandmontage";
  const order = (mm: string) => groupsOf(mm).flatMap((g) => g.items.flat());
  return m === "Wandmontage" ? [...order(m), ...order(other).filter((t) => !order(m).includes(t))] : [...order(other).filter((t) => !order(m).includes(t)), ...order(m)];
};

// ---- reading the stored section ----
type Names = Record<string, string | undefined>;
const nameOf = (names: Names, t: TileId) => names[wcItem(t).id] || wcItem(t).fallbackName;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
/** the products were shown once (a Montageart was chosen): their fields are stored */
export const rendered = (opt: Fields) => `qty_${WC[0]!.id}` in opt;
/** a tile is ticked: its name is in its list (an alias: its own list) — read with the names it was stored with */
export function ticked(opt: Fields, names: Names): Set<TileId> {
  const out = new Set<TileId>();
  const canon = list(opt[LIST]), alias = list(opt[ALIAS_LIST]);
  for (const x of WC) if (canon.includes(nameOf(names, x.id)) || canon.includes(x.fallbackName)) out.add(x.id);
  for (const t of ALIASES) if (alias.includes(nameOf(names, t)) || alias.includes(wcItem(t).fallbackName)) out.add(t);
  // an older offer whose names the price list no longer has: like today's restore, a product with a quantity is ticked
  const known = new Set(WC.flatMap((x) => [nameOf(names, x.id), x.fallbackName]));
  if (canon.some((v) => !known.has(v))) for (const x of WC) if (x.category !== "seat" && (parseInt(String(opt[`qty_${x.id}`] ?? ""), 10) || 0) > 0) out.add(x.id);
  return out;
}
const shownWc = (seat: unknown, x: WcItem) => !x.requiredSeatHeight || x.requiredSeatHeight === seat;

// ---- writing: what the page would store after a change ----
interface Page { opt: Fields; on: Set<TileId>; qty: Record<string, string> }
function read(opt: Fields, names: Names): Page {
  const qty: Record<string, string> = {};
  for (const t of [...WC_IDS, ...ALIASES]) if (qtyKey(t) in opt) qty[t] = String(opt[qtyKey(t)] ?? "");
  return { opt: { ...opt }, on: ticked(opt, names), qty };
}
function write(p: Page, names: Names): Fields {
  const out = { ...p.opt };
  const order = pageOrder(out.wcMontage);
  const canon = order.filter((t) => !isAlias(t) && p.on.has(t)).map((t) => nameOf(names, t));
  const alias = ALIASES.filter((t) => p.on.has(t)).map((t) => nameOf(names, t));
  if (canon.length) out[LIST] = canon; else delete out[LIST];
  if (alias.length) out[ALIAS_LIST] = alias; else delete out[ALIAS_LIST];
  // the quantities in page order (today's form order): the price lists the products in the order
  // of these fields — in place of the first stored one, the other fields keep their place
  const block = order.filter((t) => t in p.qty).map((t) => [qtyKey(t), p.qty[t]] as const);
  const mine = new Set(block.map(([k]) => k));
  const sorted: Fields = {};
  let placed = false;
  for (const [k, v] of Object.entries(out)) {
    if (!mine.has(k)) { sorted[k] = v; continue; }
    if (!placed) { for (const [bk, bv] of block) sorted[bk] = bv; placed = true; }
  }
  if (!placed) for (const [bk, bv] of block) sorted[bk] = bv;
  return sorted;
}
/** a ticked tile has at least 1, an unticked one 0 (today's applyGeneratedTileQty) */
function applyQty(p: Page, t: TileId) {
  if (!(t in p.qty)) return;
  if (p.on.has(t)) { const q = p.qty[t]!; if (!q || parseInt(q, 10) <= 0) p.qty[t] = "1"; } else p.qty[t] = "0";
}
const set = (p: Page, t: TileId, on: boolean) => { if (on) p.on.add(t); else p.on.delete(t); applyQty(p, t); };
/** the seat of the ticked WC is ticked, every other seat not; `qty_<seat>` is 1 for that seat, else 0 */
function syncSeats(p: Page) {
  const wc = WC.find((x) => x.category === "wc" && p.on.has(x.id));
  const seatTiles = [...WC.filter((x) => x.category === "seat").map((x) => x.id), ...ALIASES];
  for (const t of seatTiles) set(p, t, false);
  if (wc?.seatId) {
    const tile = groupsOf("Wandmontage").find((g) => g.kind === "wc")!.items.find((pair) => pair[0] === wc.id)![1]!;
    set(p, tile, true);
  }
  for (const s of WC.filter((x) => x.category === "seat")) if (`${s.id}` in p.qty) p.qty[s.id] = s.id === wc?.seatId ? "1" : "0";
}
/** only one WC: the others are unticked (and locked on the page) */
function exclusive(p: Page) {
  const wcs = WC.filter((x) => x.category === "wc");
  const on = wcs.find((x) => p.on.has(x.id));
  for (const x of wcs) if (x !== on) set(p, x.id, false);
}
/** what follows a change of the Montageart or the Sitzhöhe (today's applySeatVisibility) */
function arrange(p: Page, switched: boolean) {
  const m = p.opt.wcMontage, seat = p.opt.wcSeatHeight;
  const wall = m === "Wandmontage", floor = m === "Bodenmontage";
  for (const x of WC) {
    const mm = montageOf(x);
    if ((mm === "Wandmontage" && !wall) || (mm === "Bodenmontage" && !floor)) set(p, x.id, false); else applyQty(p, x.id);
  }
  for (const x of WC) {
    const both = x.montage === "both";
    if (x.category !== "accessory" && !both) continue;
    if (!both && montageOf(x) !== m) continue;
    if (switched && x.category === "accessory") p.on.add(x.id);
    applyQty(p, x.id);
  }
  for (const x of WC) if (!shownWc(seat, x)) {
    set(p, x.id, false);
    if (x.seatId && pairOf(x.seatId) === x.id) set(p, x.seatId, false); // the seat shown only in this pair goes with it
  }
  syncSeats(p);
  exclusive(p);
}
/** the products appear: their fields, the required ones ticked */
function render(p: Page) {
  if (p.qty[WC[0]!.id] !== undefined) return;
  for (const x of WC) { p.qty[x.id] = ""; if (x.category === "accessory") p.on.add(x.id); applyQty(p, x.id); }
  for (const t of ALIASES) p.qty[t] = "0";
}

export function setMontage(opt: Fields, names: Names, montage: string, lastMontage: string | null): Fields {
  const p = read({ ...opt, wcMontage: montage }, names);
  if (montage !== "Wandmontage") delete p.opt.wcSeatHeight;
  render(p);
  arrange(p, lastMontage !== montage);
  return write(p, names);
}
export function setSeat(opt: Fields, names: Names, seat: string): Fields {
  const p = read({ ...opt, wcSeatHeight: seat }, names);
  arrange(p, false);
  return write(p, names);
}
export function toggleTile(opt: Fields, names: Names, t: TileId): Fields {
  const p = read(opt, names);
  const x = wcItem(t);
  if (isAlias(t)) { // the second seat: its WC is ticked, which ticks this seat
    const wc = pairOf(t)!;
    if (!p.on.has(wc)) { p.on.add(wc); for (const o of WC) if (o.category === "wc" && o.id !== wc) set(p, o.id, false); syncSeats(p); applyQty(p, wc); exclusive(p); }
    else syncSeats(p);
    return write(p, names);
  }
  const on = !p.on.has(t);
  if (x.category === "wc") {
    if (on) { p.on.add(t); for (const o of WC) if (o.category === "wc" && o.id !== t) set(p, o.id, false); } else p.on.delete(t);
    syncSeats(p);
  } else if (on) p.on.add(t); else p.on.delete(t);
  applyQty(p, t);
  exclusive(p);
  return write(p, names);
}
/** a typed quantity; the second seat's is also the priced seat's */
export function setWcQty(opt: Fields, t: TileId, text: string): Fields {
  const out = { ...opt, [qtyKey(t)]: text };
  if (isAlias(t)) out[`qty_${wcItem(t).id}`] = text;
  return out;
}
/** leaving the dialog with nothing ticked */
export function clearWc(opt: Fields, names: Names): Fields {
  const p = read(opt, names);
  delete p.opt.wcMontage; delete p.opt.wcSeatHeight;
  for (const t of [...p.on]) set(p, t, false);
  for (const t of Object.keys(p.qty)) p.qty[t] = "0";
  return write(p, names);
}
/** the names came from the price list after the tiles were ticked: the stored lists follow (today's page reads them when it stores) */
export function renamed(opt: Fields, names: Names): Fields | null {
  if (!rendered(opt)) return null;
  const next = write(read(opt, names), names);
  return JSON.stringify(next[LIST] ?? null) === JSON.stringify(opt[LIST] ?? null) && JSON.stringify(next[ALIAS_LIST] ?? null) === JSON.stringify(opt[ALIAS_LIST] ?? null) ? null : next;
}

// ---- what the dialog shows ----
export interface TileView { tile: TileId; item: WcItem; on: boolean; locked: boolean; qty: string | null }
export function tilesOf(opt: Fields, names: Names): { groups: (Group & { tiles: TileView[][] })[] } {
  const m = String(opt.wcMontage ?? ""), seat = opt.wcSeatHeight;
  if (!m || !rendered(opt)) return { groups: [] };
  const on = ticked(opt, names);
  const wcOn = WC.find((x) => x.category === "wc" && on.has(x.id));
  const view = (t: TileId): TileView => {
    const x = wcItem(t), locked = !isAlias(t) && x.category === "wc" && !!wcOn && wcOn.id !== t;
    return { tile: t, item: x, on: on.has(t), locked, qty: on.has(t) && !locked ? String(opt[qtyKey(t)] ?? "") : null };
  };
  return {
    groups: groupsOf(m).map((g) => ({
      ...g,
      tiles: (g.kind === "wc" ? g.items.filter((pair) => shownWc(seat, wcItem(pair[0]!))) : g.items).map((pair) => pair.map(view)),
    })),
  };
}
/** what the card counts and the bar shows: every ticked tile */
export function wcPicks(opt: Fields, names: Names): TileId[] {
  const on = ticked(opt, names);
  return pageOrder(opt.wcMontage).filter((t) => on.has(t));
}
export const wcName = nameOf;
