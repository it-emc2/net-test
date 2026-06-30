// Wizard engine for the multi-component (component-model, schemaVersion 2) configurator.
// Pure + framework-free. Drives a GC-style single-step flow:
//   Phase 1 structure (Einbausituation → … → Montageart) gates to a leaf,
//   Phase 2 finish (Glasart / Beschichtung / Profilfarbe / Einzugsautomatik),
//   Phase 3 per-component size (Auswahl Tür / Seitenwand …) → resolved article set + summed price.
//
// @typedef {Object} WizardModel  { params, leaves, sondermass, images }
// @typedef {Object} WizardState  { selections:{paramId:value}, sizes:{compKey:{width,height}} }

const FINISH_IDS = ["Glasart", "Beschichtung_mit_ohne", "Profilfarbe", "Einzugsautomatik"];
const SIZE_IDS = ["Breite_mm", "Hoehe_mm"];

// Finish/size/Sondermaß params sometimes leak into a leaf's configContext; they are NOT structure.
function isNonStructure(id) {
  return FINISH_IDS.includes(id) || SIZE_IDS.includes(id) || /^Einbaumass/i.test(id) || /^Wuenschen/i.test(id) || id === "C-36532";
}

export function initialState() {
  return { selections: {}, sizes: {} };
}

/** Structure param ids = genuine Tab-1 params that key the leaf (excluding finish/size/Sondermaß),
 *  in model order. Leaves are unique under these. */
export function structureParamIds(model) {
  const inLeaves = new Set();
  for (const l of model.leaves) for (const k of Object.keys(l.selections)) inLeaves.add(k);
  return model.params.filter((p) => inLeaves.has(p.id) && !isNonStructure(p.id)).map((p) => p.id);
}

/** Finish params for a resolved leaf (per-config availability + valid values). */
export function finishParams(leaf) {
  return (leaf && leaf.finish) ? leaf.finish : [];
}

function paramById(model, id) { return model.params.find((p) => p.id === id) ?? null; }

/** Leaves consistent with the chosen structure selections so far. */
export function matchingLeaves(model, state) {
  const sids = structureParamIds(model);
  return model.leaves.filter((l) => sids.every((k) => state.selections[k] == null || l.selections[k] === state.selections[k]));
}

/** Options for a step param: structure params gate over matching leaves; finish params come from
 *  the RESOLVED leaf (per-config availability), not a global union. */
export function availableOptions(model, state, paramId) {
  const sids = structureParamIds(model);
  if (sids.includes(paramId)) {
    const param = paramById(model, paramId);
    if (!param) return [];
    const others = { selections: { ...state.selections } };
    delete others.selections[paramId];
    const present = new Set();
    for (const l of matchingLeaves(model, others)) if (l.selections[paramId] != null) present.add(l.selections[paramId]);
    return param.values.filter((v) => present.has(v.value));
  }
  const fp = finishParams(resolvedLeaf(model, state)).find((p) => p.id === paramId);
  return fp ? fp.values : [];
}

/** The single resolved leaf once structure selection pins one down, else null. */
export function resolvedLeaf(model, state) {
  const sids = structureParamIds(model);
  const ms = matchingLeaves(model, state);
  // resolved when exactly one leaf matches and all of its STRUCTURE keys are chosen
  // (a leaf's leaked finish/size keys are not required here)
  if (ms.length === 1) {
    const l = ms[0];
    const need = sids.filter((k) => k in l.selections);
    if (need.every((k) => state.selections[k] != null)) return l;
  }
  return null;
}

/** Apply a structure/finish selection; drops now-inconsistent later structure selections + sizes. */
export function applySelection(model, state, paramId, value) {
  const selections = { ...state.selections, [paramId]: value };
  const sids = structureParamIds(model);
  // re-validate downstream structure selections against the new matching-leaf set
  for (const k of sids) {
    if (k === paramId || selections[k] == null) continue;
    const probe = { selections: { ...selections } };
    delete probe.selections[k];
    const ok = matchingLeaves(model, probe).some((l) => l.selections[k] === selections[k]);
    if (!ok) delete selections[k];
  }
  // a structure change resolves a different leaf → its finish options differ → clear finish picks
  if (sids.includes(paramId)) {
    for (const k of Object.keys(selections)) if (FINISH_IDS.includes(k)) delete selections[k];
  }
  // structure change invalidates component sizes
  return { selections, sizes: {} };
}

export function setComponentSize(state, compKey, width, height) {
  return { ...state, sizes: { ...state.sizes, [compKey]: { width, height } } };
}

/** Choose a Sondermaß (custom-size) slot for a component, e.g. "Sondermaß 1". */
export function setComponentSondermass(state, compKey, sondermass) {
  return { ...state, sizes: { ...state.sizes, [compKey]: { sondermass } } };
}

/** Selected finish categories (glasart/beschichtung/profilfarbe) for the resolved leaf. */
function selectedFinish(leaf, state) {
  const want = {};
  for (const fp of (leaf.finish || [])) {
    const v = fp.values.find((x) => x.value === state.selections[fp.id]);
    if (!v || v.cat == null) continue;
    if (fp.id === "Glasart") want.glasart = v.cat;
    else if (/Beschichtung/i.test(fp.id)) want.beschichtung = v.cat;
    else if (fp.id === "Profilfarbe") want.profilfarbe = v.cat;
  }
  return want;
}

/** Resolve one article per component of the resolved leaf (by size + selected finish). null until complete. */
export function resolveConfiguration(model, state) {
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return null;
  const want = selectedFinish(leaf, state);
  const lines = [];
  for (const c of leaf.components) {
    const size = state.sizes[c.key];
    if (!size) return null;
    const matches = size.sondermass
      ? c.articles.filter((x) => x.sizeLabel === size.sondermass)
      : c.articles.filter((x) => x.width === size.width && x.height === size.height);
    // prefer the article whose decoded finish matches the selection (only the dimensions the leaf
    // actually offers); fall back to first size-match if none decode/match
    const a = matches.find((x) => x.finish
      && (want.glasart == null || x.finish.glasart === want.glasart)
      && (want.beschichtung == null || x.finish.beschichtung === want.beschichtung)
      && (want.profilfarbe == null || x.finish.profilfarbe === want.profilfarbe)) ?? matches[0];
    if (!a) return null;
    lines.push({ component: c.label, key: c.key, article: a });
  }
  if (lines.length === 0) return null;
  const net = lines.reduce((s, l) => s + l.article.net, 0);
  const gros = lines.reduce((s, l) => s + l.article.gros, 0);
  return { leaf, lines, net, gros, currency: lines[0].article.currency };
}

/**
 * The current wizard step to render.
 * @returns {{phase:'structure'|'finish'|'component'|'done', paramId?:string, component?:object}}
 */
export function currentStep(model, state) {
  // Phase 1: next applicable, unanswered structure param
  for (const id of structureParamIds(model)) {
    if (state.selections[id] != null) continue;
    if (availableOptions(model, state, id).length > 0) return { phase: "structure", paramId: id };
  }
  const leaf = resolvedLeaf(model, state);
  if (!leaf) return { phase: "structure" }; // ambiguous — should not happen once gated
  // Phase 2: next unanswered finish param (per-leaf availability)
  for (const fp of finishParams(leaf)) {
    if (state.selections[fp.id] == null) return { phase: "finish", paramId: fp.id };
  }
  // Phase 3: next unsized component
  for (const c of leaf.components) {
    if (!state.sizes[c.key]) return { phase: "component", component: c };
  }
  return { phase: "done" };
}

export function isComplete(model, state) {
  return resolveConfiguration(model, state) != null;
}

/** Auto-apply any structure step that has exactly one option (e.g. the derived Duschabtrennung),
 *  so the wizard never shows a trivial single-choice step. Returns the settled state. */
export function settle(model, state) {
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
