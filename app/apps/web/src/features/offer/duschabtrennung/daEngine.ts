// Wizard engine for the multi-component (component-model, schemaVersion 2) Duschabtrennung
// configurator. Pure + framework-free (no imports) — ported 1:1 from the legacy
// src/public/configurator/engine.js so behaviour/pricing match exactly.
//
//   Phase 1 structure (Einbausituation → … → Montageart) gates to a leaf,
//   Phase 2 finish (Glasart / Beschichtung / Profilfarbe / Einzugsautomatik),
//   Phase 3 per-component size (Auswahl Tür / Seitenwand …) → resolved article set + summed price.

export interface ParamValue {
  value: string;
  label: string;
  imageId?: string;
  cat?: string;
}
export interface Param {
  id: string;
  label: string;
  order: number;
  mandatory: boolean;
  values: ParamValue[];
}
export interface Article {
  articleNumber: string;
  width: number | string;
  height: number | string;
  sizeLabel: string | null;
  net: number;
  gros: number;
  currency: string;
  label: string;
  finish?: Record<string, string> | null;
  displayName?: string;
  finishText?: string;
  [k: string]: unknown;
}
export interface Component {
  key: string;
  label: string;
  breite: (number | string)[];
  hoehe: (number | string)[];
  sondermass: string[];
  articles: Article[];
}
export interface FinishParam {
  id: string;
  label: string;
  values: ParamValue[];
}
export interface Leaf {
  selections: Record<string, string>;
  finish: FinishParam[];
  components: Component[];
}
export interface WizardModel {
  params: Param[];
  leaves: Leaf[];
  sondermass?: unknown;
  images?: Record<string, string>;
  meta?: Record<string, unknown>;
}
export interface SizePick {
  width?: number | string;
  height?: number | string;
  sondermass?: string;
}
export interface WizardState {
  selections: Record<string, string>;
  sizes: Record<string, SizePick>;
}
export interface ResolvedLine {
  component: string;
  key: string;
  article: Article;
}
export interface Resolved {
  leaf: Leaf;
  lines: ResolvedLine[];
  net: number;
  gros: number;
  currency: string;
}
export type Step =
  | { phase: "structure"; paramId?: string }
  | { phase: "finish"; paramId: string }
  | { phase: "component"; component: Component }
  | { phase: "done" };

const FINISH_IDS = ["Glasart", "Beschichtung_mit_ohne", "Profilfarbe", "Einzugsautomatik"];
const SIZE_IDS = ["Breite_mm", "Hoehe_mm"];

// Finish/size/Sondermaß params sometimes leak into a leaf's configContext; they are NOT structure.
function isNonStructure(id: string): boolean {
  return (
    FINISH_IDS.includes(id) ||
    SIZE_IDS.includes(id) ||
    /^Einbaumass/i.test(id) ||
    /^Wuenschen/i.test(id) ||
    id === "C-36532"
  );
}

export function initialState(): WizardState {
  return { selections: {}, sizes: {} };
}

/** Structure param ids = genuine Tab-1 params that key the leaf (excluding finish/size/Sondermaß). */
export function structureParamIds(model: WizardModel): string[] {
  const inLeaves = new Set<string>();
  for (const l of model.leaves) for (const k of Object.keys(l.selections)) inLeaves.add(k);
  return model.params.filter((p) => inLeaves.has(p.id) && !isNonStructure(p.id)).map((p) => p.id);
}

export function finishParams(leaf: Leaf | null): FinishParam[] {
  return leaf && leaf.finish ? leaf.finish : [];
}

function paramById(model: WizardModel, id: string): Param | null {
  return model.params.find((p) => p.id === id) ?? null;
}

/** Leaves consistent with the chosen structure selections so far. */
export function matchingLeaves(model: WizardModel, state: WizardState): Leaf[] {
  const sids = structureParamIds(model);
  return model.leaves.filter((l) =>
    sids.every((k) => state.selections[k] == null || l.selections[k] === state.selections[k]),
  );
}

/** Options for a step param: structure params gate over matching leaves; finish params come from
 *  the RESOLVED leaf (per-config availability), not a global union. */
export function availableOptions(model: WizardModel, state: WizardState, paramId: string): ParamValue[] {
  const sids = structureParamIds(model);
  if (sids.includes(paramId)) {
    const param = paramById(model, paramId);
    if (!param) return [];
    const others: WizardState = { selections: { ...state.selections }, sizes: {} };
    delete others.selections[paramId];
    const present = new Set<string>();
    for (const l of matchingLeaves(model, others)) if (l.selections[paramId] != null) present.add(l.selections[paramId]);
    return param.values.filter((v) => present.has(v.value));
  }
  const fp = finishParams(resolvedLeaf(model, state)).find((p) => p.id === paramId);
  return fp ? fp.values : [];
}

/** The single resolved leaf once structure selection pins one down, else null. */
export function resolvedLeaf(model: WizardModel, state: WizardState): Leaf | null {
  const sids = structureParamIds(model);
  const ms = matchingLeaves(model, state);
  if (ms.length === 1) {
    const l = ms[0];
    const need = sids.filter((k) => k in l.selections);
    if (need.every((k) => state.selections[k] != null)) return l;
  }
  return null;
}

/** Apply a structure/finish selection; drops now-inconsistent later structure selections + sizes. */
export function applySelection(model: WizardModel, state: WizardState, paramId: string, value: string): WizardState {
  const selections: Record<string, string> = { ...state.selections, [paramId]: value };
  const sids = structureParamIds(model);
  for (const k of sids) {
    if (k === paramId || selections[k] == null) continue;
    const probe: WizardState = { selections: { ...selections }, sizes: {} };
    delete probe.selections[k];
    const ok = matchingLeaves(model, probe).some((l) => l.selections[k] === selections[k]);
    if (!ok) delete selections[k];
  }
  if (sids.includes(paramId)) {
    for (const k of Object.keys(selections)) if (FINISH_IDS.includes(k)) delete selections[k];
  }
  return { selections, sizes: {} };
}

export function setComponentSize(state: WizardState, compKey: string, width: number | string, height: number | string): WizardState {
  return { ...state, sizes: { ...state.sizes, [compKey]: { width, height } } };
}

export function setComponentSondermass(state: WizardState, compKey: string, sondermass: string): WizardState {
  return { ...state, sizes: { ...state.sizes, [compKey]: { sondermass } } };
}

const FINISH_DIMS = ["glasart", "beschichtung", "profilfarbe", "einzugsautomatik"];

function selectedFinish(leaf: Leaf, state: WizardState): Record<string, string> {
  const want: Record<string, string> = {};
  for (const fp of leaf.finish || []) {
    const v = fp.values.find((x) => x.value === state.selections[fp.id]);
    if (!v || v.cat == null) continue;
    if (fp.id === "Glasart") want.glasart = v.cat;
    else if (/Beschichtung/i.test(fp.id)) want.beschichtung = v.cat;
    else if (fp.id === "Profilfarbe") want.profilfarbe = v.cat;
    else if (/Einzugsautomatik/i.test(fp.id)) want.einzugsautomatik = v.cat;
  }
  return want;
}

/** Resolve one article per component of the resolved leaf (by size + selected finish). null until complete. */
export function resolveConfiguration(model: WizardModel, state: WizardState): Resolved | null {
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return null;
  const want = selectedFinish(leaf, state);
  const lines: ResolvedLine[] = [];
  for (const c of leaf.components) {
    const size = state.sizes[c.key];
    if (!size) return null;
    let cand = size.sondermass
      ? c.articles.filter((x) => x.sizeLabel === size.sondermass)
      : c.articles.filter((x) => x.width === size.width && x.height === size.height);
    for (const dim of FINISH_DIMS) {
      const wantVal = want[dim];
      if (wantVal == null) continue;
      const offersDim = cand.some((x) => x.finish && x.finish[dim] != null);
      if (!offersDim) continue;
      const narrowed = cand.filter((x) => x.finish && x.finish[dim] === wantVal);
      if (!narrowed.length) return null;
      cand = narrowed;
    }
    const a = cand[0];
    if (!a) return null;
    lines.push({ component: c.label, key: c.key, article: a });
  }
  if (lines.length === 0) return null;
  const net = lines.reduce((s, l) => s + l.article.net, 0);
  const gros = lines.reduce((s, l) => s + l.article.gros, 0);
  return { leaf, lines, net, gros, currency: lines[0].article.currency };
}

/** The current wizard step to render. */
export function currentStep(model: WizardModel, state: WizardState): Step {
  for (const id of structureParamIds(model)) {
    if (state.selections[id] != null) continue;
    if (availableOptions(model, state, id).length > 0) return { phase: "structure", paramId: id };
  }
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return { phase: "structure" };
  for (const fp of finishParams(leaf)) {
    if (state.selections[fp.id] == null) return { phase: "finish", paramId: fp.id };
  }
  for (const c of leaf.components) {
    if (!state.sizes[c.key]) return { phase: "component", component: c };
  }
  return { phase: "done" };
}

export function isComplete(model: WizardModel, state: WizardState): boolean {
  return resolveConfiguration(model, state) != null;
}

/** Auto-apply any structure step that has exactly one option (e.g. the derived Duschabtrennung). */
export function settle(model: WizardModel, state: WizardState): WizardState {
  let s = state;
  for (let guard = 0; guard < structureParamIds(model).length + 1; guard++) {
    const step = currentStep(model, s);
    if (step.phase !== "structure" || !step.paramId) return s;
    const opts = availableOptions(model, s, step.paramId);
    if (opts.length !== 1) return s;
    s = applySelection(model, s, step.paramId, opts[0].value);
  }
  return s;
}
