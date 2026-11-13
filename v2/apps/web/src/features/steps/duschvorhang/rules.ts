// Duschvorhang (Badumbau) — what the step stores, as today's UI does
// (test/fixtures/duschvorhang.json, v2/scripts/capture-duschvorhang.cjs).
//  - the curtain's articles are net lines in `duschabtrennung.quickAdd` (kind "config", group
//    "Duschvorhang"), after everything else in that list
//  - the configuration is stored for the next opening (`duschvorhang.configurator`: state and
//    lines) — only while there are lines. The switch is `duschabtrennung.curtainEnabled`
//  - off keeps the configuration and takes its lines out of `quickAdd`
//  - switching on marks the configuration as wanted (`enabled`); it stays so when switched off
import { applyPlan, buildLines, isCeilingSupport, restored, type Catalog, type Leg, type Line, type Shape, type State } from "./plan.js";

type Fields = Record<string, unknown>;
interface QuickAdd { kind?: string; group?: string; [k: string]: unknown }
export const GROUP = "Duschvorhang";
export type Kind = "curtain" | "rod" | "rosette" | "opt";
const MAP = { curtain: "curtainQty", rod: "rodQty", rosette: "mandatoryQty", opt: "optionalQty" } as const;

/** an offer from before the switch existed is on exactly when it has curtain lines */
export function isOn(da: Fields, dv: Fields): boolean {
  if (typeof da.curtainEnabled === "boolean") return da.curtainEnabled;
  const lines = (dv.configurator as { lines?: unknown } | undefined)?.lines;
  return Array.isArray(lines) && lines.length > 0;
}
/** the state of an opened offer */
export const stateOf = (dv: Fields, catalog: Catalog | null | undefined): State => restored((dv.configurator as { state?: unknown } | undefined)?.state ?? null, catalog);

const isCurtain = (q: QuickAdd) => String(q?.kind ?? "").toLowerCase() === "config" && q.group === GROUP;
/** State → the fields of the two sections of the offer. */
export function fieldsOf(da: Fields, state: State, catalog: Catalog, on: boolean): { duschabtrennung: Fields; duschvorhang: Fields } {
  const lines: Line[] = buildLines(state, catalog);
  const stored = (Array.isArray(da.quickAdd) ? da.quickAdd : []) as QuickAdd[];
  const priced = (on ? lines : []).filter((l) => (Number(l.net) || 0) > 0)
    .map((l) => ({ kind: "config", label: l.label || "Duschvorhang (Konfigurator)", qty: Number(l.qty) > 0 ? Number(l.qty) : 1, price: Number(l.net), productId: l.articleNumber || "", finish: l.finish || null, group: GROUP }));
  return {
    duschabtrennung: { curtainEnabled: on, quickAdd: [...stored.filter((q) => !isCurtain(q)), ...priced] },
    duschvorhang: { configurator: lines.length ? { state, lines } : undefined },
  };
}

// ---- changes ----
export const qtyOf = (state: State, kind: Kind, art: string): number => Number(state[MAP[kind]]?.[art]) || 0;
const withQty = (state: State, kind: Kind, art: string, qty: number): State => ({ ...state, [MAP[kind]]: { ...(state[MAP[kind]] ?? {}), [art]: qty } });
/** a tap on a row: on with one, or off */
export const toggleItem = (state: State, kind: Kind, art: string): State => withQty(state, kind, art, qtyOf(state, kind, art) > 0 ? 0 : 1);
/** a quantity of a row that is on: at least one */
export const setQty = (state: State, kind: Kind, art: string, qty: number): State => withQty(state, kind, art, Math.max(1, Math.floor(Number(qty) || 1)));
/** the situation changed: an offer from before the situation existed becomes a niche; the plan is made again */
export const setShape = (state: State, shape: Shape, catalog: Catalog): State => applyPlan({ ...state, shape }, catalog);
export function setLeg(state: State, leg: Leg, text: string, catalog: Catalog): State {
  const v = Number(text), next = Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if ((state.legs?.[leg] ?? null) === next && state.shape) return state;
  return applyPlan({ ...state, legs: { ...state.legs, [leg]: next }, shape: state.shape ?? "nische" }, catalog);
}
/** the length of the ceiling support: the quantity moves to the picked article; picking switches it on */
export function setCeiling(state: State, art: string): State {
  const opt = { ...state.optionalQty };
  const cur = Object.keys(opt).find((a) => isCeilingSupport(a) && opt[a]! > 0);
  const qty = cur ? opt[cur]! : 0;
  for (const a of Object.keys(opt)) if (isCeilingSupport(a)) opt[a] = 0;
  opt[art] = qty || 1;
  return { ...state, optionalQty: opt };
}
