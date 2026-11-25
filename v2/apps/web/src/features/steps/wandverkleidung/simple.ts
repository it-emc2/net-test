// Wandverkleidung — the winwall simple view, the rules of today's UI (script.js `initWvSimple`;
// main 64a75e08, ff9f81c4, 5cb8dcc3, 68b454a9, f14d46ec; recording test/fixtures/wv-einfach.json,
// v2/scripts/capture-wv-einfach.cjs):
//  - new offers store `wvUi: "simple"` and open in this view; an offer without it (older offers,
//    drafts, offers made in React before) opens in the classic editor (wall plan + rows). The view
//    is a second face of the same rows (`wvWwRows`): price, PDF and restore do not change with it
//  - "Alter Konfigurator (Wandplan, Zeilen)" and the red row's "Im alten Konfigurator korrigieren"
//    store `wvUi: ""`; "Zur neuen Ansicht wechseln" (classic, winwall) stores "simple" again
//  - one decor = one group with a number of plates per format 13/15/16/17; the groups are the rows
//    (`save`): a decor with a tile is a plain row, any other a typed row ("NW 230"); rows of the
//    classic editor without a valid decor stay, in red, are not priced and not touched
//  - a decor with no plates yet ("+ weiteres Dekor", a palette tile on an empty group) is kept
//    while the page is open, but writes no row
//  - "Anderes Dekor": every keystroke is read with the engine (`winwallDecorCode` /
//    `winwallArticleFormat`); a known decor sets the open group's decor, an article number also
//    puts one plate into its format when that format has none. Not stored itself
//  - "Höhe der Verkleidung" (`wvWwHeight`): the strips above it are the rest per decor for the floor
//  - the Produktlinie is folded into one row ("Produktlinie" + the line) in this view, for every line
// Legacy oddities ported unchanged: typing a decor that another group already has makes two groups
// of one decor (they are one again when the step is opened next time); the view keeps its groups
// while the step is open even when the rows change elsewhere.
import { WINWALL_CATALOG, WINWALL_DECORS, WINWALL_FORMATS, winwallArticleFormat, winwallDecorCode } from "@oc/pricing";
import { WW_SWATCHES } from "./decors.js";
import { LINES, type Line, type Row } from "./rules.js";

export type Fmt = "13" | "15" | "16" | "17";
export const PLATES: readonly (readonly [Fmt, number, number])[] = [["13", 100, 205], ["15", 100, 250], ["16", 125, 250], ["17", 150, 250]];
/** the plate's width × height in cm from the catalog (drawn to scale) */
export const plateCm = (f: Fmt): { widthCm: number; heightCm: number } => { const x = WINWALL_FORMATS.find((c) => c.code === f)!; return { widthCm: x.widthCm, heightCm: x.heightCm }; };
export type Qty = Record<Fmt, number>;
export interface Group { code: string; qty: Qty }
export interface Simple { groups: Group[]; active: number }

const catalog = WINWALL_CATALOG as Record<string, string>;
export const nice = (c: string): string => `${c.slice(0, 2)} ${c.slice(2)}`;
export const nameOf = (c: string): string => catalog[c] || nice(c);
const zero = (): Qty => ({ 13: 0, 15: 0, 16: 0, 17: 0 });
const count = (g: Group) => PLATES.reduce((a, [f]) => a + (g.qty[f] || 0), 0);
export const isSimple = (wv: Record<string, unknown>): boolean => wv.wvUi === "simple";
const tiles = (): string[] => (WINWALL_DECORS as { code: string }[]).map((d) => d.code);

/** the rows → one group per decor; a decor of `prev` without plates stays (it was just added) */
export function load(rows: readonly Row[], prev?: Simple | null): Simple {
  const map = new Map<string, Group>();
  for (const r of rows) {
    if (!r.code) continue;
    const g = map.get(r.code) ?? { code: r.code, qty: zero() };
    g.qty[r.fmt as Fmt] = (g.qty[r.fmt as Fmt] || 0) + (Number(r.qty) || 0);
    map.set(r.code, g);
  }
  for (const g of prev?.groups ?? []) if (!map.has(g.code) && !count(g)) map.set(g.code, g);
  let groups = [...map.values()];
  if (!groups.length) groups = [{ code: "WS203", qty: zero() }];
  return { groups, active: Math.min(Math.max(prev?.active ?? 0, 0), groups.length - 1) };
}
/** the groups → rows; a typed row without a valid decor (classic editor) is kept, never dropped */
export function save(groups: readonly Group[], rows: readonly Row[]): Row[] {
  const known = new Set(tiles());
  const mine = groups.flatMap((g) => PLATES.filter(([f]) => g.qty[f] > 0).map(([f]): Row =>
    known.has(g.code) ? { code: g.code, fmt: f, qty: g.qty[f], custom: false, text: "" } : { code: g.code, fmt: f, qty: g.qty[f], custom: true, text: nice(g.code) }));
  return [...mine, ...rows.filter((r) => !r.code)];
}
const edit = (s: Simple, fn: (g: Group) => Group): Simple => ({ ...s, groups: s.groups.map((g, i) => (i === s.active ? fn(g) : g)) });
/** − / + on a plate of the open decor */
export const step = (s: Simple, fmt: Fmt, d: number): Simple => edit(s, (g) => ({ ...g, qty: { ...g.qty, [fmt]: Math.max(0, (g.qty[fmt] || 0) + d) } }));
/** a palette tile: the open decor takes it — unless another group has it already, then that group opens (`moved` false) */
export function pick(s: Simple, code: string): { next: Simple; moved: boolean } {
  const other = s.groups.findIndex((g, i) => i !== s.active && g.code === code);
  if (other >= 0) return { next: { ...s, active: other }, moved: false };
  return { next: edit(s, (g) => ({ ...g, code })), moved: true };
}
/** "+ weiteres Dekor": the first palette decor no group has, without plates */
export function addGroup(s: Simple): Simple {
  const used = new Set(s.groups.map((g) => g.code));
  const groups = [...s.groups, { code: palette().find((c) => !used.has(c)) || "WS000", qty: zero() }];
  return { groups, active: groups.length - 1 };
}
export function removeGroup(s: Simple, i: number): Simple {
  const groups = s.groups.filter((_, j) => j !== i);
  return { groups, active: Math.min(s.active, groups.length - 1) };
}

/** the decor chips above the plates */
export const tabsOf = (s: Simple): { code: string; text: string; pressed: boolean; removable: boolean; swatch: boolean }[] =>
  s.groups.map((g, i) => ({ code: g.code, text: `${nameOf(g.code)} · ${count(g)} Stk`, pressed: i === s.active, removable: s.groups.length > 1, swatch: WW_SWATCHES.has(g.code) }));
export const de = (n: number, digits = 2): string => n.toLocaleString("de-DE", { maximumFractionDigits: digits });
/** "3 Platten · 7,5 m²" (+ " · 2 Dekore") — every group */
export function totalOf(s: Simple): string {
  let n = 0, m2 = 0;
  for (const g of s.groups) for (const [f, w, h] of PLATES) { n += g.qty[f] || 0; m2 += ((g.qty[f] || 0) * w * h) / 1e4; }
  return `${n} ${n === 1 ? "Platte" : "Platten"} · ${de(m2)} m²${s.groups.length > 1 ? ` · ${s.groups.length} Dekore` : ""}`;
}
/** rows of the classic editor without a valid decor: not priced (red line under the plates) */
export function badOf(rows: readonly Row[]): string | null {
  const bad = rows.filter((r) => !r.code);
  if (!bad.length) return null;
  const n = bad.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const txt = [...new Set(bad.map((r) => String(r.text || "").trim()).filter(Boolean))].join(", ");
  return `${n} ${n === 1 ? "Platte" : "Platten"} mit ungültiger Dekor-Nr.${txt ? ` (${txt})` : ""} – fehlen im Preis.`;
}

/** the palette: the tiles, NW 230 after NW 216 (picked from the Muster), and `sel` when it is none of them */
export function palette(sel?: string | null): string[] {
  const list = tiles();
  if (list.length && !list.includes("NW230")) list.splice(list.indexOf("NW216") + 1, 0, "NW230");
  if (sel && !list.includes(sel)) list.push(sel);
  return list;
}
export interface PaletteTile { code: string; name: string; small: string; checked: boolean; swatch: boolean; label: string }
export const paletteTiles = (sel: string | null | undefined): PaletteTile[] =>
  palette(sel).map((c) => ({ code: c, name: nameOf(c), small: nice(c), checked: c === sel, swatch: WW_SWATCHES.has(c), label: WW_SWATCHES.has(c) ? "" : nice(c) }));

export const OTHER_HINT = "Dekor-Nr. (z. B. NW 230) oder Artikel-Nr. vom Muster (z. B. 23015).";
/** "Anderes Dekor" typed: the hint, and the decor (+ format) when the catalogue knows it */
export function typed(text: string): { hint: { text: string; kind: "" | "ok" | "warn" }; code: string | null; fmt: Fmt | null } {
  const v = text.trim();
  if (!v) return { hint: { text: OTHER_HINT, kind: "" }, code: null, fmt: null };
  const code = winwallDecorCode(v) as string | null, fmt = winwallArticleFormat(v) as Fmt | null;
  if (!code) return { hint: { text: "Nicht erkannt – Dekor-Nr. (NW 230) oder Artikel-Nr. mit Format 13/15/16/17 (23015).", kind: "warn" }, code: null, fmt: null };
  if (!catalog[code]) return { hint: { text: `${nice(code)} ist nicht im winwall-Katalog – Nummer bitte prüfen.`, kind: "warn" }, code: null, fmt: null };
  const f = PLATES.find(([c]) => c === fmt);
  return { hint: { text: `✓ ${nameOf(code)} (${nice(code)})${f ? ` · Format ${f[1]} × ${f[2]} cm` : ""}`, kind: "ok" }, code, fmt: f ? f[0] : null };
}
/** a known typed decor: the open group takes it; an article number puts one plate into its format when it has none */
export const typedInto = (s: Simple, code: string, fmt: Fmt | null): Simple => edit(s, (g) => ({ code, qty: fmt && !g.qty[fmt] ? { ...g.qty, [fmt]: 1 } : g.qty }));

export const HEIGHT_HINT = "Was über dieser Höhe abgeschnitten wird, kann als Fußboden verwendet werden.";
/** the hint under "Höhe der Verkleidung": the rest per decor (`byDecor`, m²) at this height */
export function heightHint(height: unknown, byDecor: Record<string, number> | undefined): { text: string; ok: boolean } {
  const h = Number(height) || 0;
  const parts = Object.entries(byDecor ?? {}).map(([c, m]) => `${String(m).replace(".", ",")} m² ${nameOf(c)}`);
  return {
    ok: !!(h && parts.length),
    text: !h ? HEIGHT_HINT : h > 250 ? "Höher als die Platten (250 cm) – bitte prüfen." : parts.length ? `Reste ca. ${parts.join(" · ")} – können als Fußboden verwendet werden.` : "Bei dieser Höhe bleiben keine nutzbaren Reste.",
  };
}
/** the folded Produktlinie row: the chosen line's button texts */
export const lineLabel = (line: Line): string => [LINES[line].name, LINES[line].sub].join(" · ");
