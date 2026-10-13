// vorhang-plan.js — pure logic of the Duschvorhang configurator (no DOM), shared by
// vorhang.js and the unit test. Catalog shape comes from /api/vorhang/products:
// { curtains, rods, mandatory, optional }, items { articleNumber, name, net, sizeCm, … }.

export const SHAPES = {
  nische: { label: "Nische", legs: ["a"] },
  ecke: { label: "Ecke", legs: ["a", "b"] },
  u: { label: "U-Form", legs: ["a", "b", "c"] },
};

export const ART = { bogen: "DEPVSBO", kupplung: "DEPVSK", rosette: "DEPVSROS", rings: "DEPVSRI" };
const isCeilingSupport = (art) => /^DEPDS\d+$/.test(art);
const DEFAULT_CEILING_SUPPORT = "DEPDS50";

export const legValues = (shape, legs) =>
  (SHAPES[shape] || SHAPES.nische).legs.map((k) => Math.max(0, Number(legs?.[k]) || 0));

// "U-Form 90 + 120 + 90 cm"; "" while no side is entered.
export function configLabel(shape, legs) {
  if (!SHAPES[shape]) return "";
  const v = legValues(shape, legs);
  if (!v.some((x) => x > 0)) return "";
  return `${SHAPES[shape].label} ${v.join(" + ")} cm`;
}

// Smallest item whose sizeCm >= target; falls back to the largest.
const nearestAtLeast = (list, target) => {
  const sized = (list || []).filter((x) => x.sizeCm != null).sort((a, b) => a.sizeCm - b.sizeCm);
  return sized.find((x) => x.sizeCm >= target) || sized[sized.length - 1] || null;
};
const maxSize = (list) => Math.max(0, ...(list || []).map((x) => x.sizeCm || 0));

// Parts for a shape + side lengths. Each side is one rod (cut to length on site);
// a side longer than the longest rod gets n rods joined by n-1 Kupplungen. Every
// corner needs a Verbindungsbogen and a Deckenstütze. One curtain covers the whole
// run, n curtains when the run is longer than the widest curtain.
export function planParts(shape, legs, catalog) {
  const rodQty = {};
  const curtainQty = {};
  let kupplung = 0;
  const v = legValues(shape, legs).filter((x) => x > 0);
  const longestRod = maxSize(catalog?.rods);
  for (const len of v) {
    const n = longestRod > 0 ? Math.ceil(len / longestRod) : 1;
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
  const corners = v.length ? (SHAPES[shape] || SHAPES.nische).legs.length - 1 : 0;
  return { rodQty, curtainQty, kupplung, corners, total };
}

// Apply a fresh plan onto the state: curtains/rods/Bogen/Kupplung/Deckenstütze are
// recomputed; the user's other accessory choices are kept. The Deckenstütze keeps
// the length the user picked (30/50/80), defaulting to 50 cm.
export function applyPlan(state, catalog) {
  const p = planParts(state.shape, state.legs, catalog);
  state.curtainQty = p.curtainQty;
  state.rodQty = p.rodQty;
  const opt = state.optionalQty;
  opt[ART.bogen] = p.corners;
  opt[ART.kupplung] = p.kupplung;
  const ds = Object.keys(opt).find((a) => isCeilingSupport(a) && opt[a] > 0) || DEFAULT_CEILING_SUPPORT;
  Object.keys(opt).filter(isCeilingSupport).forEach((a) => (opt[a] = 0));
  if ((catalog?.optional || []).some((o) => o.articleNumber === ds)) opt[ds] = p.corners;
  if (p.total > 0 && !(opt[ART.rings] > 0) && (catalog?.optional || []).some((o) => o.articleNumber === ART.rings)) {
    opt[ART.rings] = 1;
  }
  for (const m of catalog?.mandatory || []) if (state.mandatoryQty[m.articleNumber] == null) state.mandatoryQty[m.articleNumber] = 1;
  return state;
}

// Saved state → current state. Offers saved before the shape picker
// ({ curtainSel, rodSel, widthCm }) keep exactly their articles and quantities
// and get shape null, so their lines (and the PDF) don't gain a config text.
export function fromSaved(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const legacy = !s.curtainQty && !s.rodQty;
  return {
    enabled: s.enabled === true,
    shape: legacy ? null : SHAPES[s.shape] ? s.shape : null,
    legs: legacy ? { a: s.widthCm ?? null } : { ...(s.legs || {}) },
    curtainQty: legacy ? (s.curtainSel ? { [s.curtainSel]: 1 } : {}) : { ...s.curtainQty },
    rodQty: legacy ? (s.rodSel ? { [s.rodSel]: 1 } : {}) : { ...s.rodQty },
    mandatoryQty: s.mandatoryQty ? { ...s.mandatoryQty } : null, // null → caller preselects (legacy rosetteOn)
    optionalQty: { ...(s.optionalQty || {}) },
  };
}

// Net lines for the offer. Order and labels match the pre-shape configurator for
// legacy states (curtain, rod, mandatory, optional).
export function buildLines(state, catalog) {
  if (!catalog || !state?.enabled) return [];
  const find = (list, art) => (list || []).find((x) => x.articleNumber === art) || null;
  const out = [];
  const push = (item, qty, label) => {
    if (!item || (Number(item.net) || 0) <= 0 || !(qty > 0)) return;
    out.push({ label: label || item.name, articleNumber: item.articleNumber, net: item.net, finish: item.finish || null, qty });
  };
  const cfg = configLabel(state.shape, state.legs);
  let first = true;
  for (const [art, qty] of Object.entries(state.curtainQty || {})) {
    const c = find(catalog.curtains, art);
    // curtain names are identical across widths, so append the width
    let label = c && c.sizeCm != null ? `${c.name} ${c.sizeCm} cm` : c?.name;
    if (c && qty > 0 && first && cfg) label += ` (${cfg})`;
    if (c && qty > 0) first = false;
    push(c, qty, label);
  }
  for (const [art, qty] of Object.entries(state.rodQty || {})) push(find(catalog.rods, art), qty);
  for (const m of catalog.mandatory || []) push(m, state.mandatoryQty?.[m.articleNumber] || 0);
  for (const [art, qty] of Object.entries(state.optionalQty || {})) {
    const o = find(catalog.optional, art);
    push(o, qty, o?.packNote ? `${o.name} (${o.packNote})` : undefined);
  }
  return out;
}
