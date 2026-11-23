// Handlauf · step "Handläufe" (hlk) — the rules of today's Flexofit configurator
// (src/public/script.js initHlFlexofitWizard ~30337, collectHlExtras ~4071,
// collectHlFlexofitConfigurator ~4226, collectHL ~5456, restore RestoreManager.js ~243). Pure.
//
// Configurations („Handläufe 1“, „Handläufe 2“ …): each has an area (innen / außen), at most ONE
// tube with its metres, a finish (innen only; außen is always „Edelstahl gebürstet“), fittings with
// a quantity, and free „Sonderprodukte“ (name, net price, article id, quantity).
//  - picking an area (also the same one again) clears tube tab, finish, tubes and fittings
//    (Sonderprodukte stay)
//  - a tube pick replaces the tube (keeps the metres, 1 m for the first); tapping the picked tube
//    clears it
//  - a different finish clears the fittings; tapping the picked finish unpicks it and KEEPS the
//    fittings (they stay priced) — quirk, ported
//  - a fitting toggles with quantity 1; quantities and metres are set in the position list:
//    0 (or empty) removes the line; a Sonderprodukt with 0 stays as a row but has no line
//  - Sonderprodukt price: parseFloat after one "," → "." („1.234,50“ reads 1,234 — quirk, ported)
//  - the tube tab of the ACTIVE configuration is set to the first available family when the
//    configuration has an area (before the products are loaded: the Sonderprodukt tab)
//  - names: „Handläufe <n>“, n counts every configuration made since the page was opened
//    (after reopening: from the number of stored ones); a name typed empty keeps the old name
// What is stored (payload.hl), rebuilt on every change:
//  - quickAdd: the rows that are not from the configurator, unchanged and first, then one
//    `hl-config` row per line with a price > 0 and a quantity > 0; no rows → no key
//  - hlConfigurator: { state, lines } — only while there is at least one line (else no key)
//  - hl_area (form value of today's hidden area tick boxes: "inside", "outside" or both as a list,
//    no key when none) and area (list) from the areas of all configurations — written only when an
//    area is picked: removing a configuration leaves them as they were (today the tick boxes are
//    synced on an area pick only — quirk, ported)
// "Weiter" asks for nothing on this step (today's navigation has no check for it).
import { FITTING_FAMILIES, INNEN_FINISHES, OUTSIDE_FINISH, OUTSIDE_FITTING_FAMILIES, TUBE_GROUPS, finishOf, keyOf, productVariant, type Catalog, type Entry } from "./catalog.js";

export type Fields = Record<string, unknown>;
export type Area = "" | "inside" | "outside";
export interface Sonder { name: string; price: number | ""; articleId: string; qty: number }
export interface Config { id: string; name: string; area: Area; tubeTab: string; tubes: Record<string, number>; finish: string; fittings: Record<string, number>; sonderprodukte: Sonder[]; open: { area: boolean; rohr: boolean; beschlaege: boolean } }
export interface Line { label: string; category: string; productId: string; qty: number; price: number; unit?: "m" }
export interface Work { configs: Config[]; activeId: string; counter: number }
export const SONDER_TAB = "__sonder__";

const num = (v: unknown) => Number(v) || 0;
const price = (s: Sonder) => parseFloat(String(s.price ?? "").replace(",", ".")) || 0;
export const validSonder = (s: Sonder) => !!s.name && Number(s.price) > 0 && Number(s.qty) > 0;

export function mkConfig(counter: number, over: Partial<Config> = {}): Config {
  return { id: `hlc${counter}`, name: `Handläufe ${counter}`, area: "", tubeTab: "", tubes: {}, finish: "", fittings: {}, sonderprodukte: [], open: { area: true, rohr: false, beschlaege: false }, ...over };
}
/** open the next step that is not done, close the others */
export function autoOpen(c: Config): Config {
  const open = { area: false, rohr: false, beschlaege: false };
  if (!c.area) open.area = true;
  else if (!Object.keys(c.tubes).length && !c.sonderprodukte.some((s) => s.name && Number(s.price) > 0)) open.rohr = true;
  else open.beschlaege = true;
  return { ...c, open };
}

/** the configurations of a stored offer (or one new, empty one) */
export function workOf(hl: Fields): Work {
  const saved = (hl.hlConfigurator as { state?: unknown } | undefined)?.state;
  const list = Array.isArray(saved) ? (saved as Fields[]) : [];
  if (!list.length) return { configs: [mkConfig(1)], activeId: "hlc1", counter: 1 };
  const configs = list.map((s, i) => autoOpen(mkConfig(i + 1, {
    ...(s?.name ? { name: String(s.name) } : {}), area: (s?.area as Area) || "", tubeTab: String(s?.tubeTab || ""), finish: String(s?.finish || ""),
    tubes: { ...((s?.tubes as Record<string, number>) || {}) }, fittings: { ...((s?.fittings as Record<string, number>) || {}) },
    sonderprodukte: Array.isArray(s?.sonderprodukte) ? [...(s.sonderprodukte as Sonder[])] : [],
  })));
  return { configs, activeId: configs[0]!.id, counter: list.length };
}

export const finishFor = (c: Config) => (c.area === "outside" ? OUTSIDE_FINISH : c.finish);
export const tubeEntries = (cat: Catalog, area: Area, family: string): Entry[] => cat.entries.filter((e) => e.family === family && e.areas.includes(area as "inside") && e.product?.productId !== "FF_SL01");
export const tubeTabs = (cat: Catalog, area: Area): string[] => (area ? TUBE_GROUPS[area].filter((f) => tubeEntries(cat, area, f).length) : []);
/** the tab the tube step shows (today's render sets it on the configuration) */
export function normTab(c: Config, cat: Catalog): Config {
  if (!c.area) return c;
  const groups = tubeTabs(cat, c.area);
  if (groups.includes(c.tubeTab) || c.tubeTab === SONDER_TAB) return c;
  return { ...c, tubeTab: groups[0] || SONDER_TAB };
}
export const availableFinishes = (cat: Catalog): string[] => INNEN_FINISHES.filter((f) => cat.entries.some((e) => (FITTING_FAMILIES as readonly string[]).includes(e.family) && finishOf(e.product) === f));
export function fittingChoices(c: Config, cat: Catalog): { label: string; entry: Entry }[] {
  if (c.area === "outside") return cat.entries.filter((e) => (OUTSIDE_FITTING_FAMILIES as readonly string[]).includes(e.family)).map((e) => ({ label: productVariant(e.product), entry: e }));
  if (!c.finish) return [];
  return FITTING_FAMILIES.flatMap((fam) => { const entry = cat.entries.find((e) => e.family === fam && finishOf(e.product) === c.finish); return entry ? [{ label: fam.replace(/\s+innen$/, ""), entry }] : []; });
}

export const isComplete = (c: Config) => !!c.area && (Object.values(c.tubes).some((m) => num(m) > 0) || Object.values(c.fittings).some((q) => num(q) > 0) || c.sonderprodukte.some(validSonder));
export function summaryOf(c: Config): string {
  const parts: string[] = [];
  if (c.area) parts.push(c.area === "inside" ? "Innen" : "Außen");
  const nT = Object.keys(c.tubes).length, nF = Object.keys(c.fittings).length, nS = c.sonderprodukte.filter((s) => s.name && Number(s.price) > 0).length;
  if (nT) parts.push(`${nT} Rohr${nT === 1 ? "" : "e"}`);
  if (nF) parts.push(`${nF} Beschlag${nF === 1 ? "" : "-läge"}`);
  if (nS) parts.push(`${nS} Sonderprodukt${nS === 1 ? "" : "e"}`);
  return parts.join(" · ") || "Unvollständig";
}
/** the three steps of a configuration: value text and done */
export function stepsOf(c: Config) {
  const nT = Object.keys(c.tubes).length, nF = Object.keys(c.fittings).length, nS = c.sonderprodukte.filter(validSonder).length;
  return [
    { key: "area" as const, title: "Bereich", value: c.area ? (c.area === "inside" ? "Innen" : "Außen") : "—", done: !!c.area },
    { key: "rohr" as const, title: "Rohr & Farbe", value: nT ? `${nT} Rohr(e)` : nS ? `${nS} Sonderprodukt(e)` : "—", done: nT > 0 || nS > 0 },
    { key: "beschlaege" as const, title: "Beschläge & Oberfläche", value: c.area === "outside" || c.finish ? `${finishFor(c)} · ${nF} Beschlag/-läge` : "—", done: c.area === "outside" ? nF > 0 : !!c.finish && nF > 0 },
  ];
}

// ---- changes (each returns the new configuration) ----
export const pickArea = (c: Config, area: Area): Config => autoOpen({ ...c, area, tubeTab: "", finish: "", tubes: {}, fittings: {} });
export function pickTube(c: Config, key: string): Config {
  if (c.tubes[key] != null) return autoOpen({ ...c, tubes: {} });
  const prev = Object.values(c.tubes)[0];
  return autoOpen({ ...c, tubes: { [key]: prev != null ? prev : 1 } });
}
export function pickFinish(c: Config, f: string): Config {
  const fittings = c.finish && c.finish !== f ? {} : c.fittings;
  return autoOpen({ ...c, fittings, finish: c.finish === f ? "" : f });
}
export function pickFitting(c: Config, key: string): Config {
  const fittings = { ...c.fittings };
  if (fittings[key] != null) delete fittings[key]; else fittings[key] = 1;
  return { ...c, fittings };
}
export type SonderField = "name" | "price" | "articleId" | "qty";
export function setSonder(c: Config, idx: number, field: SonderField, raw: string): Config {
  const list = [...c.sonderprodukte];
  while (list.length <= idx) list.push({ name: "", price: "", articleId: "", qty: 1 });
  const s = { ...list[idx]! };
  if (field === "name") s.name = raw.trim();
  if (field === "price") s.price = parseFloat(String(raw).replace(",", ".")) || "";
  if (field === "articleId") s.articleId = raw.trim();
  if (field === "qty") s.qty = Math.max(1, parseInt(raw) || 1);
  list[idx] = s;
  return { ...c, sonderprodukte: list };
}
export const addSonder = (c: Config): Config => ({ ...c, sonderprodukte: [...c.sonderprodukte, { name: "", price: "", articleId: "", qty: 1 }] });
export const removeSonder = (c: Config, idx: number): Config => ({ ...c, sonderprodukte: c.sonderprodukte.filter((_, i) => i !== idx) });
/** a quantity typed in the position list */
export function setQty(c: Config, kind: "tube" | "fit" | "sonder", key: string, raw: string): Config {
  const v = Math.max(0, Number(String(raw).replace(",", ".")) || 0);
  if (kind === "sonder") { const idx = Number(key); return { ...c, sonderprodukte: c.sonderprodukte.map((s, i) => (i === idx ? { ...s, qty: v > 0 ? v : 0 } : s)) }; }
  const bag = { ...(kind === "tube" ? c.tubes : c.fittings) };
  if (v <= 0) delete bag[key]; else bag[key] = v;
  return kind === "tube" ? { ...c, tubes: bag } : { ...c, fittings: bag };
}
export function removeLine(c: Config, kind: "tube" | "fit" | "sonder", key: string): Config {
  if (kind === "sonder") return removeSonder(c, Number(key));
  const bag = { ...(kind === "tube" ? c.tubes : c.fittings) };
  delete bag[key];
  return kind === "tube" ? { ...c, tubes: bag } : { ...c, fittings: bag };
}

// ---- position list and stored lines ----
export interface Row { kind: "tube" | "fit" | "sonder"; key: string; name: string; sub: string; qty: number; unit: "m" | "Stk."; price: number; total: number }
export function rowsOf(c: Config, cat: Catalog): Row[] {
  const out: Row[] = [];
  for (const [key, m] of Object.entries(c.tubes)) { const q = num(m), e = cat.byKey.get(key); if (q <= 0 || !e) continue; const p = num(e.product.price); out.push({ kind: "tube", key, name: e.label || productVariant(e.product), sub: e.product.productId || "", qty: q, unit: "m", price: p, total: q * p }); }
  for (const [key, n] of Object.entries(c.fittings)) { const q = num(n), e = cat.byKey.get(key); if (q <= 0 || !e) continue; const p = num(e.product.price); out.push({ kind: "fit", key, name: e.label || productVariant(e.product), sub: finishFor(c) || "", qty: q, unit: "Stk.", price: p, total: q * p }); }
  c.sonderprodukte.forEach((s, i) => { const q = num(s.qty), p = price(s); if (q <= 0 || !s.name || p <= 0) return; out.push({ kind: "sonder", key: String(i), name: s.name, sub: s.articleId || "", qty: q, unit: "Stk.", price: p, total: q * p }); });
  return out;
}
export function linesOf(configs: readonly Config[], cat: Catalog): Line[] {
  const out: Line[] = [];
  for (const c of configs) {
    for (const [key, m] of Object.entries(c.tubes)) { const q = num(m), e = cat.byKey.get(key); if (q <= 0 || !e) continue; out.push({ label: e.label || productVariant(e.product), category: c.name, productId: e.product.productId || "", qty: q, price: num(e.product.price), unit: "m" }); }
    for (const [key, n] of Object.entries(c.fittings)) { const q = num(n), e = cat.byKey.get(key); if (q <= 0 || !e) continue; out.push({ label: e.label || productVariant(e.product), category: c.name, productId: e.product.productId || "", qty: q, price: num(e.product.price) }); }
    for (const s of c.sonderprodukte) { const q = num(s.qty), p = price(s); if (q <= 0 || !s.name || p <= 0) continue; out.push({ label: s.name, category: c.name, productId: s.articleId || "HL_SONDER", qty: q, price: p }); }
  }
  return out;
}
export const stateOf = (configs: readonly Config[]) => configs.map((c) => ({ name: c.name, area: c.area, tubeTab: c.tubeTab, finish: c.finish, tubes: { ...c.tubes }, fittings: { ...c.fittings }, sonderprodukte: [...c.sonderprodukte] }));

/** the fields of payload.hl the configurator writes (undefined = no key) */
export function configFields(hl: Fields, configs: readonly Config[], cat: Catalog, syncArea = false): Fields {
  const lines = linesOf(configs, cat);
  const kept = (Array.isArray(hl.quickAdd) ? (hl.quickAdd as Fields[]) : []).filter((r) => r?.kind !== "hl-config");
  const rows = lines.filter((l) => l.price > 0 && l.qty > 0).map((l) => ({ kind: "hl-config", label: l.label || "Handläufe (Konfigurator)", category: l.category || null, productId: l.productId || "", qty: l.qty, price: l.price, ...(l.unit ? { unit: l.unit } : {}) }));
  const qa = [...kept, ...rows];
  const area = (["inside", "outside"] as const).filter((a) => configs.some((c) => c.area === a));
  return {
    ...(syncArea ? { hl_area: area.length === 0 ? undefined : area.length === 1 ? area[0] : [...area], area: [...area] } : {}),
    quickAdd: qa.length ? qa : undefined,
    hlConfigurator: lines.length ? { state: stateOf(configs), lines } : undefined,
  };
}
export const ledgerTotal = (rows: readonly Row[]) => rows.reduce((a, r) => a + r.total, 0);

// ---- C1: data of the retired Handlauf page (owner decision U-011 C1, built as U-054) ----
// Today's old page (#page-hl) is hidden from the step list for every offer since the configurator
// came; its form is still collected, so an offer keeps what was entered there. "Data from it":
//  - quickAdd rows that are not from the configurator: `hl-custom` (Freier Posten Hausecke /
//    Haustür, the catalog and the Flexofit PDF import wrote there), `hl-logistik` (typed
//    Speditionskosten — it replaces the permanent Lieferkosten line), `hl-item` (tick cards of
//    older page versions)
//  - fields of older page versions (steel lines, pipe type, qty_hl… with a quantity > 0, extras)
export interface LegacyRow { kind: string; group: string; label: string; productId: string; qty: string; price: string }
export function legacyRows(hl: Fields): LegacyRow[] {
  const qa = Array.isArray(hl.quickAdd) ? (hl.quickAdd as Fields[]) : [];
  return qa.filter((r) => r && r.kind !== "hl-config").map((r) => ({
    kind: String(r.kind ?? ""), group: String(r.group ?? ""), label: String(r.label ?? r.name ?? ""), productId: String(r.productId ?? ""),
    qty: `${String(r.qty ?? "").replace(".", ",")}${r.unit === "m" ? " m" : ""}`, price: r.price == null || r.price === "" ? "" : typeof r.price === "number" ? r.price.toFixed(2).replace(".", ",") + " EUR" : String(r.price),
  }));
}
const OLD_KEYS = ["steelLines", "hl_pipe_type", "hl_steel_color", "hl_steel_length[]", "hl_steel_quality[]", "hl_outdoor_components[]", "hl_befestigung[]", "extras", "hlMountType"];
export function legacyFields(hl: Fields): [string, string][] {
  const out: [string, string][] = [];
  for (const k of Object.keys(hl).sort()) {
    const v = hl[k];
    if (k.startsWith("qty_hl") && Number(String(v ?? "").replace(",", ".")) > 0) out.push([k, String(v)]);
    else if (OLD_KEYS.includes(k) && v != null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length)) out.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  return out;
}
export const hasLegacyData = (hl: Fields): boolean => legacyRows(hl).length > 0 || legacyFields(hl).length > 0;
