// The wizard engine of the shower-enclosure configurator — the rules of today's
// src/public/configurator/engine.js, unchanged (ADR 026, phase 4). Pure functions.
//   1 structure (Einbausituation → … → Montageart) narrows the model's leaves down to one,
//   2 finish (Glasart / Beschichtung / Profilfarbe / Einzugsautomatik / Radius) of that leaf,
//   3 a size per part (door, side wall …) → one article per part and the sum.
export interface Value { value: string; label: string; imageId?: string; cat?: string | null }
export interface Param { id: string; label: string; values: Value[] }
export interface Article {
  articleNumber: string; width: number | string | null; height: number | string | null; sizeLabel: string | null; net: number; gros: number; currency?: string;
  displayName?: string; finishText?: string; finish?: Record<string, string | null>; image?: string; product?: string; sourceUrl?: string;
  stockQuantity?: number | null; stockText?: string | null; einbaumass?: { label?: string }[];
}
export interface Part { key: string; label: string; breite: (number | string)[]; hoehe: (number | string)[]; sondermass: string[]; articles: Article[] }
export interface Leaf { selections: Record<string, string>; finish?: Param[]; components: Part[] }
export interface Model {
  supplier?: string; sizeAxisLabel?: string; params: Param[]; leaves: Leaf[]; images: Record<string, string>;
  products?: Record<string, { name: string; description?: string[]; features?: string[]; gallery?: string[] }>;
}
export interface Size { width?: number | string | null; height?: number | string | null; sondermass?: string }
export interface State { selections: Record<string, string>; sizes: Record<string, Size>; extras?: string[]; extrasQty?: Record<string, number>; duschwanne?: string | null }
export interface Line { component: string; key: string; qty?: number; article: Article }
export interface Resolved { leaf: Leaf; lines: Line[]; net: number; gros: number; currency?: string }
export type Step = { phase: "structure" | "finish"; paramId?: string } | { phase: "component"; component: Part } | { phase: "done" };

const FINISH_IDS = ["Glasart", "Beschichtung_mit_ohne", "Profilfarbe", "Einzugsautomatik", "Radius"];
const SIZE_IDS = ["Breite_mm", "Hoehe_mm"];
/** finish, size and custom-size answers sometimes leak into a leaf's selections; they are not structure */
const isNonStructure = (id: string) => FINISH_IDS.includes(id) || SIZE_IDS.includes(id) || /^Einbaumass/i.test(id) || /^Wuenschen/i.test(id) || id === "C-36532";

export const initialState = (): State => ({ selections: {}, sizes: {} });

const structureCache = new WeakMap<Model, string[]>();
/** the questions that tell the leaves apart, in the model's order */
export function structureParamIds(model: Model): string[] {
  let ids = structureCache.get(model);
  if (!ids) {
    const inLeaves = new Set<string>();
    for (const l of model.leaves) for (const k of Object.keys(l.selections)) inLeaves.add(k);
    ids = model.params.filter((p) => inLeaves.has(p.id) && !isNonStructure(p.id)).map((p) => p.id);
    structureCache.set(model, ids);
  }
  return ids;
}
export const finishParams = (leaf: Leaf | null): Param[] => leaf?.finish ?? [];

/** the leaves that fit the structure answers so far */
export function matchingLeaves(model: Model, state: Pick<State, "selections">): Leaf[] {
  const sids = structureParamIds(model);
  return model.leaves.filter((l) => sids.every((k) => state.selections[k] == null || l.selections[k] === state.selections[k]));
}

/** the answers a question offers: structure by the leaves still possible, finish by the leaf found */
export function availableOptions(model: Model, state: State, paramId: string): Value[] {
  if (structureParamIds(model).includes(paramId)) {
    const param = model.params.find((p) => p.id === paramId);
    if (!param) return [];
    const others = { selections: { ...state.selections } };
    delete others.selections[paramId];
    const present = new Set<string>();
    for (const l of matchingLeaves(model, others)) if (l.selections[paramId] != null) present.add(l.selections[paramId]!);
    return param.values.filter((v) => present.has(v.value));
  }
  const leaf = resolvedLeaf(model, state);
  return finishParams(leaf).some((p) => p.id === paramId) ? availableFinishValues(leaf!, state, paramId) : [];
}

/** the one leaf, once the structure answers leave exactly one and all its structure questions are answered */
export function resolvedLeaf(model: Model, state: Pick<State, "selections">): Leaf | null {
  const ms = matchingLeaves(model, state);
  if (ms.length !== 1) return null;
  const l = ms[0]!;
  return structureParamIds(model).filter((k) => k in l.selections).every((k) => state.selections[k] != null) ? l : null;
}

/** An answer: later structure answers that no longer fit are dropped; a structure answer also
 *  drops the finish answers; the sizes always start again. */
export function applySelection(model: Model, state: State, paramId: string, value: string): State {
  const selections: Record<string, string> = { ...state.selections, [paramId]: value };
  const sids = structureParamIds(model);
  for (const k of sids) {
    if (k === paramId || selections[k] == null) continue;
    const probe = { selections: { ...selections } };
    delete probe.selections[k];
    if (!matchingLeaves(model, probe).some((l) => l.selections[k] === selections[k])) delete selections[k];
  }
  if (sids.includes(paramId)) for (const k of Object.keys(selections)) if (FINISH_IDS.includes(k)) delete selections[k];
  return { selections, sizes: {} };
}
export const setComponentSize = (state: State, key: string, width: Size["width"], height: Size["height"]): State => ({ ...state, sizes: { ...state.sizes, [key]: { width, height } } });
export const setComponentSondermass = (state: State, key: string, sondermass: string): State => ({ ...state, sizes: { ...state.sizes, [key]: { sondermass } } });

const FINISH_DIMS = ["glasart", "beschichtung", "profilfarbe", "einzugsautomatik", "radius"];
function finishDimKey(id: string): string | null {
  if (id === "Glasart") return "glasart";
  if (/Beschichtung/i.test(id)) return "beschichtung";
  if (id === "Profilfarbe") return "profilfarbe";
  if (/Einzugsautomatik/i.test(id)) return "einzugsautomatik";
  return id === "Radius" ? "radius" : null;
}
function selectedFinish(leaf: Leaf, state: State): Record<string, string> {
  const want: Record<string, string> = {};
  for (const fp of leaf.finish ?? []) {
    const v = fp.values.find((x) => x.value === state.selections[fp.id]), key = finishDimKey(fp.id);
    if (v && v.cat != null && key) want[key] = v.cat;
  }
  return want;
}
const variesOn = (c: Part, dim: string) => new Set(c.articles.filter((x) => x.finish?.[dim] != null).map((x) => x.finish![dim])).size > 1;
/** The finish answers still reachable with the OTHER finish answers given: a value goes once a
 *  part that varies on it has no article for it (e.g. "hochglanz" only without the coating). */
function availableFinishValues(leaf: Leaf, state: State, paramId: string): Value[] {
  const fp = (leaf.finish ?? []).find((p) => p.id === paramId);
  if (!fp) return [];
  const dim = finishDimKey(paramId);
  if (!dim) return fp.values;
  return fp.values.filter((v) => v.cat == null || leaf.components.every((c) => {
    if (!variesOn(c, dim)) return true;
    let cand = c.articles;
    for (const other of leaf.finish ?? []) {
      if (other.id === paramId) continue;
      const key = finishDimKey(other.id), val = other.values.find((x) => x.value === state.selections[other.id]);
      if (!key || !val || val.cat == null || !variesOn(c, key)) continue;
      cand = cand.filter((x) => x.finish?.[key] === val.cat);
    }
    return cand.some((x) => x.finish?.[dim] === v.cat);
  }));
}

/** One article per part, by size and finish; null until complete. A finish the part offers but
 *  not in the chosen value gives null — never an article of another finish. */
export function resolveConfiguration(model: Model, state: State): Resolved | null {
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return null;
  const want = selectedFinish(leaf, state);
  const lines: Line[] = [];
  for (const c of leaf.components) {
    const size = state.sizes[c.key];
    if (!size) return null;
    let cand = size.sondermass ? c.articles.filter((x) => x.sizeLabel === size.sondermass) : c.articles.filter((x) => x.width === size.width && x.height === size.height);
    for (const dim of FINISH_DIMS) {
      const wanted = want[dim];
      if (wanted == null) continue;
      if (new Set(cand.filter((x) => x.finish && x.finish[dim] != null).map((x) => x.finish![dim])).size <= 1) continue;
      const narrowed = cand.filter((x) => x.finish?.[dim] === wanted);
      if (!narrowed.length) return null;
      cand = narrowed;
    }
    const a = cand[0];
    if (!a) return null;
    lines.push({ component: c.label, key: c.key, article: a });
  }
  if (!lines.length) return null;
  return { leaf, lines, net: lines.reduce((s, l) => s + l.article.net, 0), gros: lines.reduce((s, l) => s + l.article.gros, 0), currency: lines[0]!.article.currency };
}

/** the step the wizard shows */
export function currentStep(model: Model, state: State): Step {
  for (const id of structureParamIds(model)) {
    if (state.selections[id] != null) continue;
    if (availableOptions(model, state, id).length > 0) return { phase: "structure", paramId: id };
  }
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return { phase: "structure" };
  for (const fp of finishParams(leaf)) if (state.selections[fp.id] == null) return { phase: "finish", paramId: fp.id };
  for (const c of leaf.components) if (!state.sizes[c.key]) return { phase: "component", component: c };
  return { phase: "done" };
}

/** A structure question with one possible answer is answered by itself. */
export function settle(model: Model, state: State): State {
  let s = state;
  for (let guard = 0; guard < structureParamIds(model).length + 1; guard++) {
    const step = currentStep(model, s);
    if (step.phase !== "structure" || !step.paramId) return s;
    const opts = availableOptions(model, s, step.paramId);
    if (opts.length !== 1) return s;
    s = applySelection(model, s, step.paramId, opts[0]!.value);
  }
  return s;
}
