// Fußboden (Badumbau) — the rules of today's UI (test/fixtures/fussboden.json,
// v2/scripts/capture-fussboden.cjs). This file covers the switch and the mode "Fußboden";
// the mode "Wandverkleidung als Fußboden" is wand.ts.
//  - the switch is no field of its own: on means `addFlooring: true` (mode Fußboden) or
//    `addWallCladding: "on"` (the other mode); off and a change of the mode empty the mode
//    that is left
//  - switching the mode Fußboden on ticks the adhesive
//  - with an area there is always exactly ONE covering (Lava-Beige, or the first of the Standard
//    line, unless one is picked); without an area there is none
//  - changing the product line drops the covering; a new one comes with the next change of the area
//  - adhesive packs, sealing set and rolls follow from the area (`computed`)
//  - picked values are stored twice, as today: under `name` and `name[]`
import type { StepProblem } from "../../offer/index.js";

type Fields = Record<string, unknown>;
export type Line = "premium" | "standard";
export interface Tile { value: string; caption: string; img: string }

export const PREMIUM: readonly Tile[] = [
  { value: "AVP-W|Weiß", caption: "Alu-Platte weiß", img: "/assets/585c6146589e2f4c59e026c2b5373966.jpg" },
  { value: "V5FB02|Lava-Beige", caption: "Lava-Beige", img: "/assets/V5_Lava_Beige.jpg" },
  { value: "V5FB02|Schiefer-Beige", caption: "Schiefer-Beige", img: "/assets/V5_Schiefer_beige.jpg" },
  { value: "V5FB02|Loft-Grau", caption: "Loft-Grau", img: "/assets/V5_loft_grau.jpg" },
  { value: "V5FB02|Speckstein-Schwarz", caption: "Speckstein-Schwarz", img: "/assets/V5_Speckstein_schwarz.jpg" },
  { value: "V5FB02|Eiche-Natur", caption: "Eiche-Natur", img: "/assets/V5_Eiche_natur.jpg" },
];
const DEFAULT_PREMIUM = "V5FB02|Lava-Beige";
/** the Standard coverings are the Badolux Hydroträgerplatten of the price list (BP…) */
export function standardTiles(products: readonly { productId: string; name?: string | null; source?: string | null }[]): Tile[] {
  return products.filter((p) => String(p.productId).toUpperCase().startsWith("BP") && String(p.source ?? "").toLowerCase() === "badolux")
    .sort((a, b) => String(a.productId).localeCompare(String(b.productId)))
    .map((p) => { const name = p.name || p.productId; return { value: `${p.productId}|${name}`, caption: name.replace(/^Hydroträgerplatte\s+/i, "") || name, img: `/assets/budget/${p.productId}.png` }; });
}
export const KINDS = [{ value: "Fehlstellen", label: "Nur Fehlstellen" }, { value: "Gesamtes-Bad", label: "Gesamter Badboden" }] as const;
export const ADHESIVE = "Flächenkleber R_4260602";
export const SEALING = "TRINNITY Bodenabdichtung TRBDSET7";

// ---- reading the offer ----
export const isOn = (dw: Fields): boolean => dw.addFlooring === true || !!dw.addWallCladding;
export const modeOf = (dw: Fields): "floor" | "wall" => (!dw.addFlooring && dw.addWallCladding ? "wall" : "floor");
export const lineOf = (dw: Fields): Line => (dw.floorBudgetMode ? "standard" : "premium");
export const coveringOf = (dw: Fields): string => String((Array.isArray(dw.flooringProduct) ? dw.flooringProduct[0] : Array.isArray(dw["flooringProduct[]"]) ? (dw["flooringProduct[]"] as unknown[])[0] : "") ?? "");
export const areaOf = (dw: Fields): number => { const n = Number(String(dw.floorArea ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const has = (dw: Fields, key: string) => Array.isArray(dw[key]) && (dw[key] as unknown[]).length > 0;
export const hasAdhesive = (dw: Fields) => has(dw, "floorAdhesive");
export const hasSealing = (dw: Fields) => has(dw, "floorSealing");
/** a picked value is stored under `name` and `name[]` (not stored when nothing is picked) */
const twice = (name: string, value: string | null): Fields => ({ [name]: value ? [value] : undefined, [`${name}[]`]: value ? [value] : undefined });

// ---- what follows from the area ----
export interface Units { adhesive: number; sealingSet: number; sealingRoll: number }
/** the unit prices `computed` was stored with — used until the price list has answered */
export function unitsOf(dw: Fields): Units {
  const c = (dw.computed ?? {}) as { adhesive?: { unit?: number }; sealing?: { unitSet?: number; unitRoll?: number } };
  return { adhesive: Number(c.adhesive?.unit) || 0, sealingSet: Number(c.sealing?.unitSet) || 0, sealingRoll: Number(c.sealing?.unitRoll) || 0 };
}
export const adhesivePacks = (m2: number): number => (m2 ? Math.ceil(m2 / 0.6 - 1e-12) : 0);
export function sealingFor(m2: number, selected: boolean): { effM2: number; rolls: number; sets: number } {
  if (!selected || !(m2 > 0)) return { effM2: 0, rolls: 0, sets: 0 };
  const effM2 = m2 * 1.15; // +15 % offcut; one set covers 7 m², each further roll 5 m²
  return { effM2, rolls: Math.ceil(Math.max(0, effM2 - 7) / 5 - 1e-12) + 0, sets: 1 }; // + 0: never −0
}
export function computedFor(dw: Fields, units: Units): Fields {
  const m2 = areaOf(dw), packs = adhesivePacks(m2), s = sealingFor(m2, hasSealing(dw));
  return {
    areaM2: m2,
    adhesive: { productId: "R_4260602", packs, unit: units.adhesive, total: +(packs * units.adhesive).toFixed(2) },
    sealing: { productId: "TRBDSET7", effM2: +s.effM2.toFixed(2), sets: s.sets, rolls: s.rolls, unitSet: units.sealingSet, unitRoll: units.sealingRoll, total: s.sets ? +(units.sealingSet + s.rolls * units.sealingRoll).toFixed(2) : 0 },
  };
}
export const adhesiveHint = (dw: Fields): string => { const packs = adhesivePacks(areaOf(dw)); return `R_4260602 · 1 Pkg je 0,60 m²${packs ? ` = ${packs} Pkg bei ${String(dw.floorArea ?? "").trim()} m²` : ""}`; };
export function sealingHint(dw: Fields): string {
  const s = sealingFor(areaOf(dw), hasSealing(dw));
  if (!s.sets) return "TRBDSET7 · 1 Set pauschal";
  return `TRBDSET7 · 1 Set pauschal = 1 Set${s.rolls ? ` + ${s.rolls} Rolle${s.rolls > 1 ? "n" : ""} Dichtbahn` : ""} (${s.effM2.toFixed(2)} m² inkl. 15% Verschnitt)`;
}

// ---- changes ----
const EMPTY_FLOOR: Fields = { floorArea: "", floorKind: undefined, ...twice("flooringProduct", null), ...twice("floorAdhesive", null), ...twice("floorSealing", null) };
/** the switch and the mode */
export function setMode(dw: Fields, on: boolean, mode: "floor" | "wall"): Fields {
  const floor = on && mode === "floor", wall = on && mode === "wall";
  return {
    addFlooring: floor, addWallCladding: wall ? "on" : undefined,
    // leaving the mode Fußboden empties it; entering it ticks the adhesive
    ...(floor ? (dw.addFlooring === true ? {} : twice("floorAdhesive", ADHESIVE)) : dw.addFlooring === true ? EMPTY_FLOOR : {}),
  };
}
/** the area decides whether there is a covering: none without, one with (the default of the line unless one is picked) */
function withCovering(dw: Fields, change: Fields, standard: readonly Tile[]): Fields {
  const next = { ...dw, ...change };
  if (!areaOf(next)) return { ...change, ...twice("flooringProduct", null) };
  if (coveringOf(next)) return change;
  const def = lineOf(next) === "standard" ? standard[0]?.value : DEFAULT_PREMIUM;
  return def ? { ...change, ...twice("flooringProduct", def) } : change;
}
export const setArea = (dw: Fields, text: string, standard: readonly Tile[]): Fields => withCovering(dw, { floorArea: text }, standard);
/** picking a covering; clicking the picked one again takes it off — and the default comes back while there is an area */
export const pickCovering = (dw: Fields, value: string, standard: readonly Tile[]): Fields =>
  withCovering(dw, twice("flooringProduct", coveringOf(dw) === value ? null : value), standard);
export const setLine = (line: Line): Fields => ({ floorBudgetMode: line === "standard" ? "1" : undefined, ...twice("flooringProduct", null) });
export const toggleAdhesive = (on: boolean): Fields => twice("floorAdhesive", on ? ADHESIVE : null);
export const toggleSealing = (on: boolean): Fields => twice("floorSealing", on ? SEALING : null);

// ---- the area calculator ----
export interface CalcRow { subtract: boolean; length: string; width: string }
export const EMPTY_CALC_ROW: CalcRow = { subtract: false, length: "", width: "" };
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
export const de2 = (v: number): string => (Number(v) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rowArea = (r: CalcRow): number => num(r.length) * num(r.width);
export const calcTotal = (rows: readonly CalcRow[]): number => Math.max(0, rows.reduce((sum, r) => sum + (r.subtract ? -1 : 1) * rowArea(r), 0));
/** removing the last row empties it instead */
export const removeCalcRow = (rows: readonly CalcRow[], i: number): CalcRow[] => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [EMPTY_CALC_ROW]);

// ---- panels (from the price) and "Ihre Auswahl" ----
interface Line2 { productId?: unknown; id?: unknown; label?: unknown; qty?: unknown }
/** the number of panels is what the price says for the picked covering */
export function panelsFrom(price: unknown, dw: Fields): number {
  const lines = ((price as { materials?: { lines?: Line2[] } } | null)?.materials?.lines ?? []) as Line2[];
  const pid = coveringOf(dw).split("|", 1)[0]!.trim() || "V5FB02";
  const mine = lines.filter((l) => (l.productId || l.id) === pid);
  const line = mine.find((l) => String(l.label ?? "").includes("Fußboden-Paneele")) ?? mine.find((l) => !String(l.label ?? "").includes("individ."));
  return Number(line?.qty ?? 0) || 0;
}
export function summary(dw: Fields, tiles: readonly Tile[], panels: number): { title: string; sub: string; items: string[] } | null {
  const value = coveringOf(dw);
  if (dw.addFlooring !== true || !value || !areaOf(dw)) return null;
  const [pid, color] = value.split("|");
  const standard = lineOf(dw) === "standard";
  const name = standard ? color : tiles.find((t) => t.value === value)?.caption || color;
  const kind = KINDS.find((k) => k.value === dw.floorKind)?.label;
  const packs = adhesivePacks(areaOf(dw));
  return {
    title: `${name} · ${String(dw.floorArea).trim()} m²`, sub: [pid, kind].filter(Boolean).join(" · "),
    items: [`${panels} × Fußboden-Paneele`, ...(hasAdhesive(dw) ? [packs ? `${packs} × Flächenkleber 600 ml` : "Flächenkleber 600 ml"] : []), ...(hasSealing(dw) ? ["Bodenabdichtung"] : [])],
  };
}

// ---- "Weiter" ----
/** as today: with the mode Fußboden on, area, scope, covering and adhesive are needed */
export function fussbodenProblem(dw: Fields): StepProblem | null {
  if (dw.addFlooring !== true) return null;
  const missing: [string, string][] = [];
  if (!String(dw.floorArea ?? "").trim()) missing.push(["Fläche", "#fb-area"]);
  if (!dw.floorKind) missing.push(["Umfang", '[name="fb-kind"]']);
  if (!coveringOf(dw)) missing.push(["Belag", '[name="fb-covering"]']);
  if (!hasAdhesive(dw)) missing.push(["Flächenkleber", "#fb-adhesive"]);
  return missing.length ? { message: `Bitte füllen Sie alle Pflichtfelder in „Fußboden" aus: ${missing.map(([l]) => l).join(", ")}`, focus: missing[0]![1] } : null;
}
