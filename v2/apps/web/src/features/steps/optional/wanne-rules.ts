// Optionale Produkte → Wanne (Badumbau) — today's picker (initWannePicker in src/public/script.js,
// src/public/configurator/wanne-rules.js), reference test/fixtures/optional-wanne-wc.json.
//  - A short wizard answered with drawings: Einbau (Ecke / Nische / beide Enden frei) → Wandseite
//    (only Ecke) → Türseite → Wannenaufsatz (ohne / mit); or "nur Aufsatz": Aufsatz → Anschlagseite.
//    An answer no tub of the catalogue fits is greyed out. The matching products are listed by
//    price, with chips for size (and, folded, drain and water inlet; for screens height and side
//    panel); a chip tapped again is unchosen.
//  - Tapping a product picks it, tapping it again unpicks it. A tub the picked screen no longer fits
//    drops the screen; "Ohne Aufsatz" drops a picked screen.
//  - What the offer stores: the hidden fields of the page in `optional` (strings: article, name,
//    net price, offer text, size "170 x 75 cm", required accessories as JSON) and the same pick in
//    `duschwanne` (numbers; the screen as `wannenaufsatzProductId`; `wanneZubehoer` only while a
//    tub is picked). The answers of the wizard are not stored: an opened offer starts the wizard
//    on the answers of its pick.
//  - Removing a pick in the bar empties article, name, price (and size), but not the offer text
//    and the accessories (today's behaviour, kept).
// Which screen fits which tub (screenFit) is today's wanne-rules.js unchanged.

import type { ScreenSpec, WanneSpec } from "./wanne-sketch.js";

type Fields = Record<string, unknown>;
export interface Req { articleNumber: string; desc?: string; name?: string; netPrice?: number | null; url?: string; urlLabel?: string }
export interface WItem {
  articleNumber: string; type: "tub" | "screen"; name: string; netPrice: number; desc?: string; url?: string; urlLabel?: string; image?: string;
  wizard?: boolean; einbau?: string; wall?: string; side?: string; lengthCm?: number; widthCm?: number; widthMaxCm?: number; tubHeightCm?: number;
  ablauf?: string; zulauf?: string | null; screenFamily?: string; screenKind?: string; klappbar?: boolean; heightCm?: number; seitenwand?: string;
  requires?: Req[];
}
/** the answers of the wizard (not stored) */
export interface WState { einbau?: string; wall?: string; side?: string; mode?: string; size?: string; ablauf?: string; zulauf?: string; sh?: string; sw?: string }
type Key = keyof WState;

// ---- which screen fits which tub (wanne-rules.js) ----
export const hasSidePanel = (s: WItem | null | undefined) => /^S\d+/.test(s?.seitenwand || "");
export const screenEnd = (tub: WItem | null, screen: WItem | null) => tub?.side || screen?.side;
export function endWalls(tub: WItem | null): string[] {
  if (!tub) return [];
  if (tub.einbau === "Nische" || tub.wall === "beide") return ["links", "rechts"];
  if (tub.einbau === "Ecke" && tub.wall) return [tub.wall];
  return [];
}
export function screenFit(tub: WItem | null, screen: WItem | null): { ok: boolean; reason: string } {
  if (!tub || !screen) return { ok: false, reason: "" };
  if (!tub.screenFamily || tub.screenFamily !== screen.screenFamily) return { ok: false, reason: "Passt nicht zu dieser Wanne." };
  if (screen.side !== tub.side) return { ok: false, reason: "Der Aufsatz steht immer auf der Türseite." };
  const wallAtDoor = endWalls(tub).includes(tub.side!);
  if (hasSidePanel(screen)) {
    if (wallAtDoor || tub.einbau === "Nische") return { ok: false, reason: "Aufsatz mit Seitenwand braucht ein freies Ende an der Tür – hier steht dort eine Wand." };
    const w = Number(String(screen.seitenwand).slice(1));
    if (tub.widthCm && w !== tub.widthCm) return { ok: false, reason: `Seitenwand ${w} cm passt nicht zur Wannenbreite ${tub.widthCm} cm an der Tür.` };
    return { ok: true, reason: "" };
  }
  return wallAtDoor ? { ok: true, reason: "" } : { ok: false, reason: "An der Türseite ist keine Wand, an der der Aufsatz angeschlagen werden kann." };
}
export const screensFor = (tub: WItem, screens: WItem[]) => screens.filter((s) => screenFit(tub, s).ok);
export const acceptsScreen = (tub: WItem, screens: WItem[]) => screensFor(tub, screens).length > 0;
export function noScreenReason({ einbau, wall, side }: WState): string {
  if (einbau === "Vorwand") return "Bei freien Enden gibt es keine Wand für den Anschlag.";
  if (einbau === "Ecke" && wall && side && wall !== side) return "Tür am freien Ende: dort fehlt die Wand für den Aufsatz.";
  return "Kein passender Aufsatz für diese Auswahl.";
}

// ---- the catalogue ----
export const EINBAU: readonly (readonly [string, string, string])[] = [
  ["Ecke", "Ecke", "Wand hinten und an einem Ende"],
  ["Nische", "Nische", "Wand hinten und an beiden Enden"],
  ["Vorwand", "Beide Enden frei", "Nur hinten eine Wand, z. B. mittig an der Wand"],
];
export const SIDES = ["links", "rechts"] as const;
export const sizeOf = (p: WItem) => `${p.lengthCm} × ${p.widthCm}${p.widthMaxCm && p.widthMaxCm !== p.widthCm ? "/" + p.widthMaxCm : ""} cm`;
const tubSizeLabel = (p: WItem) => (p.lengthCm && p.widthCm ? `${p.lengthCm} x ${p.widthCm}${p.widthMaxCm && p.widthMaxCm !== p.widthCm ? "/" + p.widthMaxCm : ""} cm` : "");
export const inWizard = (p: WItem) => p.wizard !== false;
export const tubs = (items: WItem[]) => items.filter((p) => p.type === "tub" && inWizard(p));
export const screens = (items: WItem[]) => items.filter((p) => p.type === "screen" && inWizard(p));
export const eur = (n: unknown) => Number(n || 0).toFixed(2).replace(".", ",") + " €";
const de = (n: unknown) => String(n).replace(".", ",");

// ---- what is picked: the hidden fields of today's page, in `optional` ----
const F = {
  tub: { id: "chosenBathtubProductId", name: "chosenBathtubName", price: "chosenBathtubPrice", desc: "chosenBathtubDesc", size: "bathtubSize", extras: "chosenBathtubExtras" },
  screen: { id: "chosenScreenProductId", name: "chosenScreenName", price: "chosenScreenPrice", desc: "chosenScreenDesc" },
} as const;
const val = (opt: Fields, k: string) => String(opt[k] ?? "").trim();
export const selectedId = (opt: Fields, t: "tub" | "screen") => val(opt, F[t].id);
export const selectedItem = (items: WItem[], opt: Fields, t: "tub" | "screen") => items.find((p) => p.type === t && p.articleNumber === selectedId(opt, t)) ?? null;

function setItem(opt: Fields, type: "tub" | "screen", p: WItem | null): Fields {
  const f = F[type], out: Fields = { ...opt };
  out[f.id] = p ? p.articleNumber : "";
  out[f.name] = p ? p.name : "";
  out[f.price] = p ? String(p.netPrice) : "";
  out[f.desc] = p ? p.desc || "" : "";
  if (type === "tub") {
    out[F.tub.size] = p ? tubSizeLabel(p) : "";
    out[F.tub.extras] = p?.requires?.length ? JSON.stringify(p.requires) : "";
  }
  return out;
}
/** tapping a product: picked, or unpicked when it was; a screen that no longer fits the new tub goes */
export function applySelection(items: WItem[], opt: Fields, p: WItem): Fields {
  let out = setItem(opt, p.type, selectedId(opt, p.type) === p.articleNumber ? null : p);
  const tub = selectedItem(items, out, "tub"), sc = selectedItem(items, out, "screen");
  if (p.type === "tub" && tub && sc && !screenFit(tub, sc).ok) out = setItem(out, "screen", null);
  return out;
}
/** removing a pick in the bar: article, name, price (and size) — the offer text stays */
export function clearPick(opt: Fields, type: "tub" | "screen"): Fields {
  const out: Fields = { ...opt };
  const keys = type === "tub" ? [F.tub.id, F.tub.name, F.tub.price, F.tub.size] : [F.screen.id, F.screen.name, F.screen.price];
  for (const k of keys) out[k] = "";
  return out;
}
/** the same pick on the `duschwanne` path (today's attachDuschwanneToPayload) */
export function dwOf(opt: Fields): Fields {
  const bPid = val(opt, F.tub.id), screenPid = val(opt, F.screen.id);
  let extras: unknown = [];
  if (bPid) try { extras = JSON.parse(val(opt, F.tub.extras) || "[]"); } catch { extras = []; }
  return {
    chosenBathtubProductId: bPid || null, bathtubSize: String(opt[F.tub.size] ?? ""), wannenaufsatzProductId: screenPid || null,
    chosenBathtubName: val(opt, F.tub.name) || null, chosenBathtubPrice: Number(val(opt, F.tub.price)) || null,
    chosenScreenName: val(opt, F.screen.name) || null, chosenScreenPrice: Number(val(opt, F.screen.price)) || null,
    chosenBathtubDesc: val(opt, F.tub.desc) || null, chosenScreenDesc: val(opt, F.screen.desc) || null, wanneZubehoer: extras,
  };
}

// ---- the wizard ----
function tubOk(items: WItem[], p: WItem, s: WState, skip: string[] = []): boolean {
  return (skip.includes("einbau") || !s.einbau || p.einbau === s.einbau)
    && (skip.includes("wall") || !s.wall || p.wall === s.wall)
    && (skip.includes("side") || !s.side || p.side === s.side)
    && (skip.includes("mode") || s.mode !== "screen" || acceptsScreen(p, screens(items)))
    && (skip.includes("size") || !s.size || sizeOf(p) === s.size)
    && (skip.includes("ablauf") || !s.ablauf || !p.ablauf || p.ablauf === s.ablauf)
    && (skip.includes("ablauf") || !s.zulauf || !p.zulauf || p.zulauf === s.zulauf);
}
const countWith = (items: WItem[], st: WState, over: WState) => tubs(items).filter((p) => tubOk(items, p, { ...st, ...over, size: undefined, ablauf: undefined, zulauf: undefined })).length;
const keys = (st: WState): Key[] => (st.mode === "only" ? ["mode", "side"] : ["einbau", ...(st.einbau === "Ecke" ? ["wall" as const] : []), "side", "mode"]);
export const nextStep = (st: WState): Key | undefined => keys(st).find((k) => !st[k]);
const ready = (st: WState) => !nextStep(st);

/** an opened offer: the wizard starts on the answers of its pick */
export function fromSelection(items: WItem[], opt: Fields): WState {
  const t = selectedItem(items, opt, "tub"), s = selectedItem(items, opt, "screen");
  if (t && inWizard(t)) return { einbau: t.einbau, ...(t.einbau === "Ecke" ? { wall: t.wall } : {}), side: t.side, mode: s ? "screen" : "plain" };
  if (!t && s) return { mode: "only", side: s.side };
  return {};
}
/** an answer given; "Ohne Aufsatz" drops a picked screen */
export function answer(opt: Fields, st: WState, key: Key, value: string): { st: WState; opt: Fields } {
  const next = { ...st, [key]: value };
  return { st: next, opt: key === "mode" && value === "plain" && selectedId(opt, "screen") ? setItem(opt, "screen", null) : opt };
}
/** a crumb tapped: that answer and all after it are asked again */
export function clearFrom(st: WState, k: Key): WState {
  const ks = keys(st), out = { ...st };
  for (const x of ks.slice(ks.indexOf(k))) delete out[x];
  if (k === "einbau") delete out.wall;
  delete out.size; delete out.ablauf; delete out.zulauf; delete out.sh; delete out.sw;
  return out;
}
export const chipTapped = (st: WState, k: Key, v: string): WState => { const out = { ...st }; if (String(st[k]) === v) delete out[k]; else out[k] = v; return out; };

// ---- the drawings of the tiles and cards ----
const lc = (v: string | null | undefined) => (v ? String(v).toLowerCase() : v ?? null);
export const specFor = (o: Partial<WanneSpec>): WanneSpec => ({ einbau: "ecke", wall: "links", door: "links", screen: null, L: 170, Wd: 75, H: 58, ...o });
const screenSpec = (p: WItem, tub?: WItem | { einbau: string; wall: string } | null): ScreenSpec => ({
  side: tub && "articleNumber" in tub ? screenEnd(tub, p)! : p.side!, kind: p.screenKind || (p.klappbar ? "klapp" : "comby"), h: p.heightCm, panel: hasSidePanel(p),
});
const hingeFor = (einbau?: string, wall?: string, door?: string | null) => (einbau === "Ecke" ? (wall === door ? door : null) : einbau === "Nische" ? door : null);
const previewScreen = (einbau?: string, wall?: string, door?: string | null, h = 140): ScreenSpec | null =>
  !door ? null : hingeFor(einbau, wall, door) ? { side: door, kind: "falt", h } : einbau === "Ecke" || einbau === "Vorwand" ? { side: door, kind: "comby", h, panel: true } : null;
const tubSpec = (p: WItem, screen: ScreenSpec | null = null) => specFor({ einbau: lc(p.einbau || "Ecke")!, wall: p.einbau === "Ecke" ? p.wall ?? null : null, door: p.side ?? null, screen, L: p.lengthCm, Wd: p.widthCm, H: p.tubHeightCm || 58 });

/** the large drawing above the wizard */
export function stageSpec(items: WItem[], opt: Fields, st: WState): WanneSpec {
  const t = selectedItem(items, opt, "tub");
  const first = t && inWizard(t) ? t : ready(st) && st.mode !== "only" ? tubs(items).find((p) => tubOk(items, p, st)) : null;
  const sc = selectedItem(items, opt, "screen");
  const einbau = st.einbau || first?.einbau || "Ecke";
  const wall = st.wall || first?.wall || "links";
  const door = st.mode === "only" ? null : st.side || first?.side || (st.einbau ? null : "links");
  let screen: ScreenSpec | null = null;
  if (sc) screen = screenSpec(sc, first || { einbau, wall });
  else if (st.mode === "screen" || st.mode === "only") screen = st.mode === "only" ? { side: st.side || "links", kind: "falt", h: Number(st.sh) || 140 } : previewScreen(einbau, wall, door, Number(st.sh) || 140);
  return specFor({
    einbau: lc(einbau)!, wall: einbau === "Ecke" ? wall : null, door, screen, L: first?.lengthCm || 170, Wd: first?.widthCm || 75, H: first?.tubHeightCm || 58,
    label: first ? `${sizeOf(first)}${first.tubHeightCm ? `, ${de(first.tubHeightCm)} cm hoch` : ""}` : " ",
  });
}

export interface Tile { set: string; title: string; sub: string; off: boolean; spec: WanneSpec }
export interface Step { question: string; tiles: Tile[]; only: boolean }
/** the question that is next, with its answers (greyed out where no tub fits) */
export function stepOf(items: WItem[], st: WState): Step | null {
  const step = nextStep(st);
  if (!step) return null;
  const E = st.einbau, ecke = E === "Ecke";
  const tile = (set: string, title: string, sub: string, spec: WanneSpec, off: boolean): Tile => ({ set, title, sub, off, spec });
  const n = (over: WState) => countWith(items, st, over);
  if (step === "einbau") return { question: "Wie steht die Wanne im Bad?", only: true, tiles: EINBAU.map(([v, title, sub]) => tile(`einbau:${v}`, title, sub, specFor({ einbau: lc(v)!, wall: "links", door: null }), !n({ einbau: v }))) };
  if (step === "wall") return { question: "Auf welcher Seite ist die Wand?", only: false, tiles: SIDES.map((v) => tile(`wall:${v}`, `Wand ${v}`, "Blick von vorn auf die Wanne", specFor({ einbau: "ecke", wall: v, door: null }), !n({ wall: v }))) };
  if (step === "side") {
    if (st.mode === "only") return { question: "Auf welcher Seite wird der Aufsatz angeschlagen?", only: false, tiles: SIDES.map((v) => tile(`side:${v}`, `Anschlag ${v}`, "Auf der Türseite der vorhandenen Wanne", specFor({ einbau: "nische", door: null, screen: { side: v, kind: "falt", h: 140 } }), !screens(items).some((p) => p.side === v))) };
    return { question: "Auf welcher Seite ist die Tür?", only: false, tiles: SIDES.map((v) => tile(`side:${v}`, `Tür ${v}`, ecke ? (v === st.wall ? "An der Wandseite" : "Am freien Ende") : "Blick von vorn auf die Wanne", specFor({ einbau: lc(E)!, wall: ecke ? st.wall! : null, door: v }), !n({ side: v }))) };
  }
  const withScreen = n({ mode: "screen" });
  return {
    question: "Mit Wannenaufsatz?", only: false, tiles: [
      tile("mode:plain", "Ohne Aufsatz", "Nur die Wanne mit Einstiegstür", specFor({ einbau: lc(E)!, wall: ecke ? st.wall! : null, door: st.side! }), !n({ mode: "plain" })),
      tile("mode:screen", "Mit Glasaufsatz", withScreen ? "Glaswand auf dem Wannenrand, zum Duschen" : noScreenReason(st), specFor({ einbau: lc(E)!, wall: ecke ? st.wall! : null, door: st.side!, screen: withScreen ? previewScreen(E, st.wall, st.side) : null }), !withScreen),
    ],
  };
}

const CRUMB: Record<string, (st: WState) => string> = {
  einbau: (st) => EINBAU.find(([v]) => v === st.einbau)?.[1] || st.einbau!,
  wall: (st) => `Wand ${st.wall}`,
  side: (st) => (st.mode === "only" ? `Anschlag ${st.side}` : `Tür ${st.side}`),
  mode: (st) => (st.mode === "only" ? "Nur Aufsatz" : st.mode === "screen" ? "Mit Glasaufsatz" : "Ohne Aufsatz"),
};
/** the answers given so far, each a button to change it */
export const crumbsOf = (st: WState): [Key, string][] => keys(st).filter((k) => st[k]).map((k) => [k, CRUMB[k]!(st)]);

export interface ChipRow { label: string; key: Key; values: [string, string][] }
export interface Card { item: WItem; title: string; pills: string[]; notes: { text: string; link?: Req; missing?: boolean }[]; name: string; price: string; reco: boolean; spec: WanneSpec }
export type Block =
  | { kind: "hint"; text: string }
  | { kind: "chips"; row: ChipRow }
  | { kind: "more"; summary: string; open: boolean; rows: (ChipRow | { note: string })[] }
  | { kind: "head"; text: string }
  | { kind: "note"; text: string }
  | { kind: "cards"; cards: Card[]; empty: string };

const MOUNT_SHORT: Record<string, string> = { Ecke: "Ecke", Nische: "Nische", Vorwand: "Beide Enden frei" };
function cardHead(p: WItem): { title: string; pills: string[] } {
  if (p.type === "screen") {
    const kind = p.screenKind === "pendel" ? "Pendeltür" : p.screenKind === "falt" ? "Faltwand 2-teilig" : hasSidePanel(p) ? "Faltwand mit Seitenwand" : "Faltwand klappbar";
    return { title: kind, pills: [`Anschlag ${p.side}`, p.heightCm && `${p.heightCm} cm hoch`, hasSidePanel(p) && `Seitenwand ${p.seitenwand!.slice(1)} cm`, p.screenFamily === "steinkamp" && p.widthCm && `${p.widthCm} cm breit`].filter(Boolean) as string[] };
  }
  const w = p.widthMaxCm && p.widthMaxCm !== p.widthCm ? `${p.widthCm}/${p.widthMaxCm}` : p.widthCm;
  return {
    title: `${p.lengthCm} × ${w} cm`,
    pills: [`Tür ${p.side}`, p.einbau === "Ecke" && p.wall ? `Ecke, Wand ${p.wall}` : MOUNT_SHORT[p.einbau!], p.tubHeightCm && `${de(p.tubHeightCm)} cm hoch`, p.ablauf === "Trio" && "Trio-Ablauf", p.zulauf === "Wanneneinlauf" && "Wanneneinlauf"].filter(Boolean) as string[],
  };
}
function card(p: WItem, spec: WanneSpec, reco: boolean): Card {
  const extras = p.requires || [];
  const total = p.netPrice + extras.reduce((n, z) => n + (z.netPrice || 0), 0);
  const { title, pills } = cardHead(p);
  return {
    item: p, title, pills, reco, spec, name: p.desc || p.name, price: eur(total),
    notes: extras.map((z) => ((z.netPrice ?? 0) > 0 ? { text: `inkl. ${z.desc} (+${eur(z.netPrice)})`, link: z } : { text: `Pflichtzubehör ${z.articleNumber} fehlt im Vigor-Katalog – Preis fehlt, bitte nachtragen.`, missing: true })),
  };
}
const chipRow = (label: string, key: Key, values: [string, string][]): ChipRow | null => (values.length < 2 ? null : { label, key, values });

/** what is listed below the wizard once every question is answered */
export function resultsOf(items: WItem[], opt: Fields, st: WState): Block[] {
  const out: Block[] = [];
  const tub = selectedItem(items, opt, "tub");
  if (tub && !inWizard(tub)) out.push({ kind: "hint", text: `Die gespeicherte Wanne ${tub.articleNumber} stammt aus dem alten Katalog ohne Angabe der Wandseite. Bitte hier neu auswählen.` });
  if (!ready(st)) return out;
  const push = (row: ChipRow | null) => { if (row) out.push({ kind: "chips", row }); };
  if (st.mode !== "only") {
    const base = tubs(items).filter((p) => tubOk(items, p, st, ["size", "ablauf"]));
    const sizes = [...new Set(base.map(sizeOf))];
    const ablaufs = [...new Set(base.map((p) => p.ablauf).filter(Boolean) as string[])];
    const zulaufs = [...new Set(base.map((p) => p.zulauf).filter(Boolean) as string[])];
    const list = base.filter((p) => tubOk(items, p, st)).sort((a, b) => a.netPrice - b.netPrice);
    push(chipRow("Maße", "size", sizes.map((v) => [v, v])));
    if (ablaufs.length > 1 || zulaufs.length > 1) {
      const what = [ablaufs.length > 1 && "Ablauf", zulaufs.length > 1 && "Wassereinlauf"].filter(Boolean).join(" und ");
      const rows: (ChipRow | { note: string })[] = [];
      const a = chipRow("Ablauf", "ablauf", ablaufs.map((v) => [v, v === "Trio" ? "Trio-Ablauf" : v === "Standard" ? "Standard-Ablauf" : v]));
      if (a) rows.push(a);
      if (ablaufs.includes("Trio")) rows.push({ note: "Trio: Ablauf, Überlauf und Einlauf in einem Bauteil (ca. 230–270 € Aufpreis)." });
      const z = chipRow("Wasser", "zulauf", zulaufs.map((v) => [v, v === "Wanneneinlauf" ? "Wanneneinlauf" : "aus der Armatur"]));
      if (z) rows.push(z);
      if (zulaufs.includes("Wanneneinlauf")) rows.push({ note: "Wanneneinlauf: Das Wasser läuft unten durch die Wanne ein statt aus der Armatur." });
      out.push({ kind: "more", summary: `Weitere Optionen: ${what}`, open: !!(st.ablauf || st.zulauf), rows });
    }
    out.push({ kind: "head", text: `${list.length} passende ${list.length === 1 ? "Wanne" : "Wannen"}` });
    out.push({ kind: "cards", cards: list.map((p) => card(p, tubSpec(p), false)), empty: "Keine passende Wanne. Ändern Sie oben eine Antwort." });
  }
  const tubIn = tub && inWizard(tub) ? tub : null;
  if (st.mode === "only" || (st.mode === "screen" && tubIn)) {
    const base = st.mode === "only" ? screens(items).filter((p) => p.side === st.side) : screensFor(tubIn!, screens(items));
    const heights = [...new Set(base.map((p) => p.heightCm).filter(Boolean) as number[])].sort();
    const walls = [...new Set(base.map((p) => p.seitenwand).filter(Boolean) as string[])].sort();
    const list = base.filter((p) => (!st.sh || String(p.heightCm) === String(st.sh)) && (!st.sw || p.seitenwand === st.sw)).sort((a, b) => a.netPrice - b.netPrice);
    out.push({ kind: "head", text: st.mode === "only" ? "Wannenaufsatz" : "Passender Wannenaufsatz" });
    if (st.mode === "only") out.push({ kind: "note", text: "Nur für eine vorhandene Wanne derselben Serie. An der Anschlagseite muss eine Wand sein." });
    push(chipRow("Höhe", "sh", heights.map((v) => [String(v), `${v} cm`])));
    push(chipRow("Seitenwand", "sw", walls.map((v) => [v, v === "ohne" ? "ohne" : `${v.slice(1)} cm breit`])));
    out.push({
      kind: "cards", empty: "Kein passender Aufsatz.",
      cards: list.map((p, i) => {
        const spec = tubIn ? tubSpec(tubIn, screenSpec(p, tubIn))
          : hasSidePanel(p) ? specFor({ einbau: "ecke", wall: p.side === "links" ? "rechts" : "links", door: null, screen: screenSpec(p) })
            : specFor({ einbau: "ecke", wall: p.side!, door: null, screen: screenSpec(p) });
        return card(p, spec, st.mode === "screen" && i === 0);
      }),
    });
  } else if (st.mode === "screen") out.push({ kind: "note", text: "Wählen Sie eine Wanne, dann erscheinen die passenden Aufsätze." });
  return out;
}

/** "Ihre Auswahl": the picks with their prices and the sum */
export function summaryOf(items: WItem[], opt: Fields): { rows: [string, string][]; total: string } | null {
  const tub = selectedItem(items, opt, "tub"), screen = selectedItem(items, opt, "screen");
  if (!tub && !screen) return null;
  const extras = tub?.requires || [];
  const rows: [string, string][] = [
    ...(tub ? [[tub.desc || tub.name, eur(tub.netPrice)] as [string, string]] : []),
    ...extras.map((z) => [z.desc ?? "", eur(z.netPrice)] as [string, string]),
    ...(screen ? [[screen.desc || screen.name, eur(screen.netPrice)] as [string, string]] : []),
  ];
  const total = (tub?.netPrice || 0) + extras.reduce((n, z) => n + (z.netPrice || 0), 0) + (screen?.netPrice || 0);
  return { rows, total: eur(total) };
}
