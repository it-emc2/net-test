// The shower-curtain plan — the rules of today's src/public/configurator/vorhang-plan.js
// (ADR 026, phase 4). Pure functions; nothing is changed in place.
//  - the situation (niche, corner, U-shape) has one side per rod. Each side is one rod, cut to
//    length on site; a side longer than the longest rod takes n rods joined by n − 1 couplings
//  - every corner needs a connecting bend and a ceiling support
//  - one curtain covers the whole run; n curtains when the run is longer than the widest one
//  - with every change of the situation the plan sets curtains, rods, bends, couplings and
//    ceiling supports again; the other fittings stay as the user set them
export interface Item { articleNumber: string; name: string; net: number; finish?: string | null; image?: string | null; sizeCm?: number | null; heightCm?: number | null; packNote?: string | null; stockQuantity?: number | null; stockText?: string | null }
export interface Catalog { curtains: Item[]; rods: Item[]; mandatory: Item[]; optional: Item[] }
export type Shape = "nische" | "ecke" | "u";
export type Leg = "a" | "b" | "c";
export type Qty = Record<string, number>;
export interface State { enabled: boolean; shape: Shape | null; legs: Partial<Record<Leg, number | null>>; curtainQty: Qty; rodQty: Qty; mandatoryQty: Qty | null; optionalQty: Qty }
export interface Line { label: string; articleNumber: string; net: number; finish: string | null; qty: number }

export const SHAPES: Record<Shape, { label: string; legs: Leg[] }> = {
  nische: { label: "Nische", legs: ["a"] }, ecke: { label: "Ecke", legs: ["a", "b"] }, u: { label: "U-Form", legs: ["a", "b", "c"] },
};
export const ART = { bogen: "DEPVSBO", kupplung: "DEPVSK", rosette: "DEPVSROS", rings: "DEPVSRI" } as const;
export const isCeilingSupport = (art: string): boolean => /^DEPDS\d+$/.test(art);
const DEFAULT_CEILING_SUPPORT = "DEPDS50";
const shapeOf = (shape: unknown) => SHAPES[shape as Shape] ?? SHAPES.nische;

export const legValues = (shape: unknown, legs: State["legs"] | null | undefined): number[] => shapeOf(shape).legs.map((k) => Math.max(0, Number(legs?.[k]) || 0));
/** "U-Form 90 + 120 + 90 cm"; "" while no side is entered */
export function configLabel(shape: unknown, legs: State["legs"]): string {
  if (!SHAPES[shape as Shape]) return "";
  const v = legValues(shape, legs);
  return v.some((x) => x > 0) ? `${SHAPES[shape as Shape].label} ${v.join(" + ")} cm` : "";
}
/** the smallest item that is at least `target` long; else the largest */
const nearestAtLeast = (list: Item[] | undefined, target: number): Item | null => {
  const sized = (list ?? []).filter((x) => x.sizeCm != null).sort((a, b) => a.sizeCm! - b.sizeCm!);
  return sized.find((x) => x.sizeCm! >= target) ?? sized[sized.length - 1] ?? null;
};
const maxSize = (list: Item[] | undefined) => Math.max(0, ...(list ?? []).map((x) => x.sizeCm || 0));

/** the parts a situation needs */
export function planParts(shape: unknown, legs: State["legs"], catalog: Catalog | null | undefined): { rodQty: Qty; curtainQty: Qty; kupplung: number; corners: number; total: number; rodsPerLeg: number[] } {
  const rodQty: Qty = {}, curtainQty: Qty = {};
  let kupplung = 0;
  const all = legValues(shape, legs), v = all.filter((x) => x > 0);
  const longest = maxSize(catalog?.rods);
  const rodsPerLeg = all.map((len) => (len > 0 && longest > 0 ? Math.ceil(len / longest) : len > 0 ? 1 : 0));
  for (const len of v) {
    const n = longest > 0 ? Math.ceil(len / longest) : 1;
    const rod = nearestAtLeast(catalog?.rods, len / n);
    if (rod) rodQty[rod.articleNumber] = (rodQty[rod.articleNumber] || 0) + n;
    kupplung += n - 1;
  }
  const total = v.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const widest = maxSize(catalog?.curtains);
    const n = widest > 0 ? Math.ceil(total / widest) : 1;
    const c = nearestAtLeast(catalog?.curtains, total / n);
    if (c) curtainQty[c.articleNumber] = n;
  }
  return { rodQty, curtainQty, kupplung, corners: v.length ? shapeOf(shape).legs.length - 1 : 0, total, rodsPerLeg };
}

/** A fresh plan on the state. The ceiling support keeps the length the user picked (30 / 50 / 80),
 *  50 cm otherwise; the rings come back with the first length. */
export function applyPlan(state: State, catalog: Catalog): State {
  const p = planParts(state.shape, state.legs, catalog);
  const opt: Qty = { ...state.optionalQty, [ART.bogen]: p.corners, [ART.kupplung]: p.kupplung };
  const ds = Object.keys(opt).find((a) => isCeilingSupport(a) && opt[a]! > 0) ?? DEFAULT_CEILING_SUPPORT;
  for (const a of Object.keys(opt)) if (isCeilingSupport(a)) opt[a] = 0;
  const has = (art: string) => (catalog.optional ?? []).some((o) => o.articleNumber === art);
  if (has(ds)) opt[ds] = p.corners;
  if (p.total > 0 && !(opt[ART.rings]! > 0) && has(ART.rings)) opt[ART.rings] = 1;
  return { ...state, curtainQty: p.curtainQty, rodQty: p.rodQty, optionalQty: opt, mandatoryQty: withMandatory(state.mandatoryQty, catalog) };
}
/** every mandatory item once, unless it has a quantity already */
export function withMandatory(qty: Qty | null, catalog: Catalog | null | undefined): Qty {
  const out: Qty = { ...(qty ?? {}) };
  for (const m of catalog?.mandatory ?? []) if (out[m.articleNumber] == null) out[m.articleNumber] = 1;
  return out;
}

/** Stored state → state. Offers from before the situation existed ({ curtainSel, rodSel, widthCm })
 *  keep exactly their articles and get no situation, so their lines gain no situation text. */
export function fromSaved(saved: unknown): State {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, any>;
  const legacy = !s.curtainQty && !s.rodQty;
  return {
    enabled: s.enabled === true,
    shape: legacy ? null : SHAPES[s.shape as Shape] ? (s.shape as Shape) : null,
    legs: legacy ? { a: s.widthCm ?? null } : { ...(s.legs ?? {}) },
    curtainQty: legacy ? (s.curtainSel ? { [s.curtainSel]: 1 } : {}) : { ...s.curtainQty },
    rodQty: legacy ? (s.rodSel ? { [s.rodSel]: 1 } : {}) : { ...s.rodQty },
    mandatoryQty: s.mandatoryQty ? { ...s.mandatoryQty } : null, // null: the page preselects (older offers: rosetteOn)
    optionalQty: { ...(s.optionalQty ?? {}) },
  };
}
/** the state of an opened offer, ready for the page */
export function restored(saved: unknown, catalog: Catalog | null | undefined): State {
  const state = fromSaved(saved);
  if (state.mandatoryQty) return state;
  const rosetteOff = !!saved && typeof saved === "object" && (saved as { rosetteOn?: unknown }).rosetteOn === false;
  return { ...state, mandatoryQty: rosetteOff ? {} : withMandatory(null, catalog) };
}

/** "Duschvorhang 140 × 200 cm" (width × height); the width alone when the height is unknown */
export const curtainLabel = (c: Item | null | undefined): string | undefined => (c && c.sizeCm != null ? `${c.name} ${c.sizeCm}${c.heightCm ? ` × ${c.heightCm}` : ""} cm` : c?.name);

/** the net lines for the offer: curtains (the first names the situation), rods, mandatory, other fittings */
export function buildLines(state: State | null | undefined, catalog: Catalog | null | undefined): Line[] {
  if (!catalog || !state?.enabled) return [];
  const find = (list: Item[] | undefined, art: string) => (list ?? []).find((x) => x.articleNumber === art) ?? null;
  const out: Line[] = [];
  const push = (item: Item | null, qty: number, label?: string) => {
    if (!item || (Number(item.net) || 0) <= 0 || !(qty > 0)) return;
    out.push({ label: label || item.name, articleNumber: item.articleNumber, net: item.net, finish: item.finish || null, qty });
  };
  const cfg = configLabel(state.shape, state.legs);
  let first = true;
  for (const [art, qty] of Object.entries(state.curtainQty ?? {})) {
    const c = find(catalog.curtains, art);
    let label = curtainLabel(c);
    if (c && qty > 0 && first && cfg) label += ` (${cfg})`;
    if (c && qty > 0) first = false;
    push(c, qty, label);
  }
  for (const [art, qty] of Object.entries(state.rodQty ?? {})) push(find(catalog.rods, art), qty);
  for (const m of catalog.mandatory ?? []) push(m, state.mandatoryQty?.[m.articleNumber] || 0);
  for (const [art, qty] of Object.entries(state.optionalQty ?? {})) {
    const o = find(catalog.optional, art);
    push(o, qty, o?.packNote ? `${o.name} (${o.packNote})` : undefined);
  }
  return out;
}
