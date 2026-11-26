// Wandverkleidung — the simple view of the lines VIGOUR and Badolux (owner 2026-11-25: "same as
// winwall"). Like winwall's simple.ts it is only a second face of the line's rows (vigour.ts `VRow`,
// keramico.ts `KRow`): what is stored, priced and sent stays exactly what the row editor writes.
//  - one colour (VIGOUR) / decor (Badolux) = one group (chip) with a number of panels per width;
//    a (colour, width) with n > 0 is one row {colour, width, n}; 0 removes that row
//  - the chips are the distinct colours in row order (stored rows read width by width: 997, then
//    1497); the offer's colour (VIGOUR `wvColor`, the first row's) is the first chip
//  - writing (`save`): per width the colours keep the order they have in the stored rows (the
//    first one is the main panel of that width, the others its extra colours — pricing reads it so);
//    a colour new to a width takes its place in chip order (the order the colours were added). The
//    first chip with panels leads the list (it names the offer's colour). Two groups of one colour
//    are one row
//  - a colour without panels ("+ weitere Farbe", a tile on an empty chip) is kept while the page is
//    open but writes no row
//  - nothing is written when the view opens: the stored rows change only with an edit
//  - rows the view cannot express open in the row editor with a hint (`rowsOnly`): two rows of one
//    colour and width ("dup"), or an order of colours per width the view would not write back
//    ("order"). Those are the only cases — the rows carry nothing else (a Keramico row's `price` is
//    read by neither the row editor nor the price rules)

/** one row as the view sees it: colour (or decor) key, width code, number of panels */
export interface PRow { key: string; size: string; qty: number }
export interface PGroup { key: string; qty: Record<string, number> }
export interface PView { groups: PGroup[]; active: number }

const zero = (sizes: readonly string[]): Record<string, number> => Object.fromEntries(sizes.map((s) => [s, 0]));
export const count = (g: PGroup): number => Object.values(g.qty).reduce((a, n) => a + (n || 0), 0);

/** rows → one group per colour, in row order, `first` (the offer's colour) in front; a colour of
 *  `prev` without panels stays (it was just added); no rows: one empty group of `fallback` */
export function load(rows: readonly PRow[], sizes: readonly string[], fallback: string, first?: string | null, prev?: PView | null): PView {
  const map = new Map<string, PGroup>();
  for (const r of rows) {
    const g = map.get(r.key) ?? { key: r.key, qty: zero(sizes) };
    g.qty[r.size] = (g.qty[r.size] || 0) + (Number(r.qty) || 0);
    map.set(r.key, g);
  }
  let groups = [...map.values()];
  const lead = first ? groups.findIndex((g) => g.key === first) : -1;
  if (lead > 0) groups = [groups[lead]!, ...groups.filter((_, i) => i !== lead)];
  for (const g of prev?.groups ?? []) if (!map.has(g.key) && !count(g)) groups.push({ key: g.key, qty: { ...zero(sizes), ...g.qty } });
  if (!groups.length) groups = [{ key: fallback, qty: zero(sizes) }];
  return { groups, active: Math.min(Math.max(prev?.active ?? 0, 0), groups.length - 1) };
}

/** groups → rows (see the header); `prev`: the stored rows before this change */
export function save(groups: readonly PGroup[], prev: readonly PRow[], sizes: readonly string[]): PRow[] {
  const keys = [...new Set(groups.map((g) => g.key))];
  const rank = (k: string) => keys.indexOf(k);
  const list: PRow[] = [];
  for (const size of sizes) {
    const want = new Map<string, number>();
    for (const g of groups) { const n = g.qty[size] || 0; if (n > 0) want.set(g.key, (want.get(g.key) ?? 0) + n); }
    const order = [...new Set(prev.filter((r) => r.size === size && want.has(r.key)).map((r) => r.key))];
    for (const k of want.keys()) {
      if (order.includes(k)) continue;
      const at = order.findIndex((o) => rank(o) > rank(k));
      if (at < 0) order.push(k); else order.splice(at, 0, k);
    }
    list.push(...order.map((k) => ({ key: k, size, qty: want.get(k)! })));
  }
  const lead = groups.find((g) => count(g) > 0);
  const i = lead ? list.findIndex((r) => r.key === lead.key) : -1;
  return i > 0 ? [list[i]!, ...list.slice(0, i), ...list.slice(i + 1)] : list;
}

/** what decides price and payload: the leading colour and, per width, the colours with their numbers in order */
const sig = (first: string | undefined, list: readonly PRow[], sizes: readonly string[]) => JSON.stringify([first ?? "", sizes.map((s) => list.filter((r) => r.size === s).map((r) => [r.key, r.qty]))]);
const leadOf = (rows: readonly PRow[], first?: string | null) => (first && rows.some((r) => r.key === first) ? first : rows[0]?.key);
/** the rows `save` gave are the stored ones (same lead, same colours and numbers per width in the same order): nothing to write */
export const unchanged = (next: readonly PRow[], rows: readonly PRow[], sizes: readonly string[], first?: string | null): boolean =>
  sig(next[0]?.key, next, sizes) === sig(leadOf(rows, first), rows, sizes);
/** stored rows the view cannot write back unchanged → the row editor ("dup": one colour twice in a width; "order": the order per width) */
export function rowsOnly(rows: readonly PRow[], sizes: readonly string[], first?: string | null): "dup" | "order" | null {
  const seen = new Set<string>();
  for (const r of rows) { const k = `${r.key}\u0000${r.size}`; if (seen.has(k)) return "dup"; seen.add(k); }
  if (!rows.length) return null;
  const lead = leadOf(rows, first)!;
  return unchanged(save(load(rows, sizes, lead, lead).groups, rows, sizes), rows, sizes, lead) ? null : "order";
}

const edit = (s: PView, fn: (g: PGroup) => PGroup): PView => ({ ...s, groups: s.groups.map((g, i) => (i === s.active ? fn(g) : g)) });
/** − / + on a width of the open colour */
export const step = (s: PView, size: string, d: number): PView => edit(s, (g) => ({ ...g, qty: { ...g.qty, [size]: Math.max(0, (g.qty[size] || 0) + d) } }));
/** a tile: the open colour takes it — unless another chip has it already, then that one opens (`moved` false).
 *  `same`: whether a chip's key is that tile (Badolux: the Sonder-Dekor tile is every motif) */
export function pick(s: PView, key: string, same: (chip: string, tile: string) => boolean = (a, b) => a === b): { next: PView; moved: boolean } {
  if (same(s.groups[s.active]!.key, key)) return { next: s, moved: false };
  const other = s.groups.findIndex((g, i) => i !== s.active && same(g.key, key));
  if (other >= 0) return { next: { ...s, active: other }, moved: false };
  return { next: edit(s, (g) => ({ ...g, key })), moved: true };
}
/** the open chip gets another key (Badolux: the motif name of a Sonder-Dekor) */
export const rename = (s: PView, key: string): PView => edit(s, (g) => ({ ...g, key }));
/** "+ weitere Farbe": the first palette colour no chip has, without panels */
export function addGroup(s: PView, palette: readonly string[], sizes: readonly string[]): PView {
  const used = new Set(s.groups.map((g) => g.key));
  const groups = [...s.groups, { key: palette.find((c) => !used.has(c)) ?? palette[0]!, qty: zero(sizes) }];
  return { groups, active: groups.length - 1 };
}
export function removeGroup(s: PView, i: number): PView {
  const groups = s.groups.filter((_, j) => j !== i);
  return { groups, active: Math.min(s.active, groups.length - 1) };
}

const de = (n: number): string => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
/** "3 Paneele · 7,63 m²" (+ " · 2 Farben") — every chip; `areas`: m² of one panel per width */
export function totalOf(s: PView, areas: Record<string, number>, plural: string): string {
  let n = 0, m2 = 0;
  for (const g of s.groups) for (const [size, a] of Object.entries(areas)) { n += g.qty[size] || 0; m2 += (g.qty[size] || 0) * a; }
  return `${n} ${n === 1 ? "Paneel" : "Paneele"} · ${de(m2)} m²${s.groups.length > 1 ? ` · ${s.groups.length} ${plural}` : ""}`;
}
