// One enclosure of the step Duschabtrennung: what today's configurator (src/public/configurator/
// configurator-ui.js) does around the engine — the hand-picked extras, the list of answered
// questions, going back, the pictures and the lines of "Ihre Auswahl". Pure functions.
import * as w from "./engine.js";
import type { Article, Leaf, Line, Model, Resolved, State, Value } from "./engine.js";

export const euro = (n: unknown): string => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n || 0));

// ---- hand-picked articles that are not part of the model ----
/** Widening profiles (VIGOUR only). Only VZVP1195 is on today; the other nine of the catalogue are not offered. */
export const EXTRAS = [
  { articleNumber: "VZVP1195", name: "Verbreiterung 1 für V2 Gleittür um 26 mm", finishText: "1950 mm silber matt VIGOUR", net: 49.27, gros: 75.8, image: "VZVP1195.jpg" },
] as const;
export interface Tray { articleNumber: string; label: string; heightCm: number; finishText: string; net: number; gros: number; image: string; stockQuantity: number; stockText: string }
const ORDER = "Die Ware ist aktuell nicht verfügbar und muss bestellt werden.";
const safeStep = (size: number, code: string, colour: string, text: string, net: number, gros: number, stockQuantity = 0, stockText = ORDER): Tray =>
  ({ articleNumber: `V3ME${size}${code}`, label: `${colour} matt`, heightCm: 3, finishText: `Rad. 55cm SafeStepPlus ${text} matt VIGOUR`, net, gros, image: `Duschwanne-${colour.toLowerCase().replace("ß", "ss")}.jpg`, stockQuantity, stockText });
const safeSteps = (size: number, net: number, gros: number, white: [number, number, number, string]): Tray[] => [
  safeStep(size, "AN", "Anthrazit", "anth.", net, gros), safeStep(size, "BG", "Beige", "beige", net, gros), safeStep(size, "GR", "Grau", "grau", net, gros),
  safeStep(size, "SM", "Schwarz", "schw.", net, gros), safeStep(size, "SP", "Weiß", "weiss", ...white),
];
/** Quarter-circle trays that fit a quarter-circle door, by radius and door width (mm). */
export const TRAYS: Record<string, Record<number, Tray[]>> = {
  500: {
    800: [{ articleNumber: "ONAE80SF", label: "Weiß (Acryl one)", heightCm: 6.5, finishText: "Radius 50cm weiss VIGOUR", net: 105.53, gros: 234.5, image: "Duschwanne-onae80sf.jpg", stockQuantity: 0, stockText: "Ware im Nachtverbund Markt Schwaben (vorbehaltlich Prüfung) verfügbar, bei Bestellung bis 18:00 Uhr" }],
    900: [{ articleNumber: "PURAE90", label: "Weiß (Hüppe Purano)", heightCm: 4, finishText: "Radius 50cm weiss", net: 376.38, gros: 651, image: "Duschwanne-purae90.jpg", stockQuantity: 0, stockText: ORDER }],
    1000: [{ articleNumber: "ZIRKO100EF", label: "Weiß (Kaldewei Zirkon)", heightCm: 3.5, finishText: "weiss Kaldewei", net: 611.35, gros: 891, image: "Duschwanne-zirko100ef.jpg", stockQuantity: 0, stockText: ORDER }],
  },
  550: {
    900: safeSteps(90, 296.4, 494, [269.4, 449, 9, "Der Artikel ist im Lager verfügbar. Der Bestand beträgt 9 Stück."]),
    1000: safeSteps(100, 309.6, 516, [281.4, 469, 0, ORDER]),
  },
};
export const trayName = (d: Tray, widthMm: number): string => `Viertelkreis-Duschwanne ${widthMm / 10}×${widthMm / 10}×${d.heightCm.toLocaleString("de-DE", { minimumFractionDigits: 1 })} cm ${d.label}`;

const isBadolux = (model: Model) => model.supplier === "BADOLUX";
export const extrasFor = (model: Model): readonly (typeof EXTRAS)[number][] => (isBadolux(model) ? [] : EXTRAS);
export const extraQty = (state: State, articleNumber: string): number => Math.max(1, Math.floor(Number(state.extrasQty?.[articleNumber]) || 1));
/** the width of the first part (the door), unless it is a custom size */
export function doorWidth(model: Model, state: State): number | null {
  const c = w.resolvedLeaf(model, state)?.components[0];
  const size = c && state.sizes[c.key];
  return size && !size.sondermass && typeof size.width === "number" ? size.width : null;
}
export function traysFor(model: Model, state: State): Tray[] {
  const radius = state.selections.Radius === "550mm" ? "550" : state.selections.Radius === "500mm" ? "500" : null;
  const width = doorWidth(model, state);
  return radius && width != null ? TRAYS[radius]?.[width] ?? [] : [];
}
/** what the engine drops with an answer and the wizard keeps */
const kept = (state: State) => ({ extras: state.extras, extrasQty: state.extrasQty, duschwanne: state.duschwanne });

// ---- changes ----
export const start = (model: Model, saved?: Partial<State> | null): State => w.settle(model, { ...w.initialState(), ...(saved ?? {}) });
export const answer = (model: Model, state: State, paramId: string, value: string): State => ({ ...w.settle(model, w.applySelection(model, state, paramId, value)), ...kept(state) });
export const toggleExtra = (state: State, articleNumber: string): State => {
  const ids = Array.isArray(state.extras) ? state.extras : [];
  return { ...state, extras: ids.includes(articleNumber) ? ids.filter((x) => x !== articleNumber) : [...ids, articleNumber] };
};
export const setExtraQty = (state: State, articleNumber: string, qty: number): State => ({ ...state, extrasQty: { ...(state.extrasQty ?? {}), [articleNumber]: Math.max(1, Math.floor(Number(qty) || 1)) } });
export const pickTray = (state: State, articleNumber: string): State => ({ ...state, duschwanne: state.duschwanne === articleNumber ? null : articleNumber });
/** a part with one possible size is sized by itself */
export function autoSize(model: Model, state: State): State {
  const leaf = w.resolvedLeaf(model, state);
  if (!leaf || w.finishParams(leaf).some((f) => state.selections[f.id] == null)) return state;
  let s = state;
  for (const c of leaf.components) if (!s.sizes[c.key] && c.sondermass.length === 0 && c.breite.length === 1 && c.hoehe.length === 1) s = w.setComponentSize(s, c.key, c.breite[0]!, c.hoehe[0]!);
  return s;
}

const before = (model: Model, state: State, paramId: string): State => {
  const order = model.params.map((p) => p.id), selections: Record<string, string> = {};
  for (const id of order.slice(0, order.indexOf(paramId))) if (state.selections[id] != null) selections[id] = state.selections[id]!;
  return w.settle(model, { selections, sizes: {} });
};
const answered = (model: Model, state: State): string[] => model.params.filter((p) => state.selections[p.id] != null).map((p) => p.id);
/** a question the user really answered — not one that was answered by itself */
export function isRealChoice(model: Model, state: State, paramId: string): boolean {
  const step = w.currentStep(model, before(model, state, paramId));
  return (step.phase === "structure" || step.phase === "finish") && step.paramId === paramId;
}
/** open an answered question again: it and everything after it start again */
export const reopen = (model: Model, state: State, paramId: string): State => ({ ...before(model, state, paramId), ...kept(state) });
export const canGoBack = (model: Model, state: State): boolean => answered(model, state).some((id) => isRealChoice(model, state, id));
/** back to the last question that was a real choice */
export function goBack(model: Model, state: State): State {
  const target = answered(model, state).reverse().find((id) => isRealChoice(model, state, id));
  return target ? reopen(model, state, target) : state;
}

// ---- what the page shows ----
const paramMeta = (model: Model, state: State, paramId: string) => model.params.find((x) => x.id === paramId) ?? w.finishParams(w.resolvedLeaf(model, state)).find((f) => f.id === paramId) ?? null;
export const paramLabel = (model: Model, state: State, paramId: string): string => paramMeta(model, state, paramId)?.label ?? paramId;
/** The answered questions as rows "question — answer"; the finish answers share one row "Ausführung". */
export function answeredRows(model: Model, state: State): { id: string; label: string; values: string[] }[] {
  const finishIds = new Set(w.finishParams(w.resolvedLeaf(model, state)).map((f) => f.id));
  const rows: { id: string; label: string; values: string[]; finish: boolean }[] = [];
  for (const id of answered(model, state)) {
    if (!isRealChoice(model, state, id)) continue;
    const p = paramMeta(model, state, id), val = state.selections[id];
    const value = String(p?.values.find((v) => v.value === val)?.label ?? val).split(" — ")[0]!; // Badolux: "Ecke — zwei Wände …" → "Ecke"
    const last = rows[rows.length - 1];
    if (finishIds.has(id) && last?.finish) last.values.push(value);
    else rows.push({ id, label: finishIds.has(id) ? "Ausführung" : p?.label ?? id, values: [value], finish: finishIds.has(id) });
  }
  return rows.map(({ id, label, values }) => ({ id, label, values }));
}

/** model.images holds "assets/<uuid>_<ext>"; the files are /configurator/assets/<uuid>.<ext> */
export function imageUrl(model: Model, imageId: string | undefined): string | null {
  const raw = imageId ? model.images[imageId] : undefined;
  if (!raw) return null;
  return raw.startsWith("/") ? raw : "/configurator/" + raw.replace(/_(jpe?g|png|webp|gif)$/i, ".$1");
}
/** the enclosure the structure answers led to — its picture stands for the configuration */
export function leafPreview(model: Model, state: State): Value | null {
  const v = model.params.find((x) => x.id === "Duschabtrennung")?.values.find((x) => x.value === state.selections.Duschabtrennung);
  return v && imageUrl(model, v.imageId) ? v : null;
}
export const previewImageUrl = (model: Model, state: State): string | null => { const v = leafPreview(model, state); return v ? imageUrl(model, v.imageId) : null; };
const sameSize = (a: Article, size: State["sizes"][string]) => (size.sondermass ? a.sizeLabel === size.sondermass : a.width === size.width && a.height === size.height);
const PHOTO_DIMS: Record<string, string> = { Glasart: "glasart", Profilfarbe: "profilfarbe" };
/** Photos of the articles for the picked finish (only glass and profile colour show in a photo),
 *  then the product's gallery (Badolux), then the enclosure's own picture. */
export function previewImages(model: Model, state: State): { src: string; label: string }[] {
  const out: { src: string; label: string }[] = [];
  const add = (src: string | null | undefined, label: string) => { if (src && !out.some((x) => x.src === src)) out.push({ src, label }); };
  const leaf = w.resolvedLeaf(model, state);
  if (leaf) {
    const want: Record<string, string | null> = {};
    for (const fp of leaf.finish ?? []) { const dim = PHOTO_DIMS[fp.id]; if (dim) want[dim] = fp.values.find((v) => v.value === state.selections[fp.id])?.cat ?? null; }
    for (const c of leaf.components) {
      let cand = c.articles, ok = true;
      for (const [dim, cat] of Object.entries(want)) {
        if (new Set(cand.map((a) => a.finish?.[dim]).filter((x) => x != null)).size <= 1) continue;
        if (cat == null) { ok = false; break; }
        cand = cand.filter((a) => a.finish?.[dim] === cat);
      }
      if (!ok) continue;
      cand = cand.filter((a) => a.image);
      const size = state.sizes[c.key];
      const a = (size && cand.find((x) => sameSize(x, size))) || cand[0];
      if (a) add(a.image, a.displayName || c.label);
      const product = a?.product ? model.products?.[a.product] : undefined;
      for (const src of product?.gallery ?? []) add(src, product!.name);
    }
  }
  const v = leafPreview(model, state);
  if (v) add(imageUrl(model, v.imageId), v.label);
  return out;
}
/** the shop products behind the configuration (Badolux): name, description, features */
export function products(model: Model, state: State): NonNullable<Model["products"]>[string][] {
  const leaf = w.resolvedLeaf(model, state);
  if (!leaf || !model.products) return [];
  const slugs: string[] = [];
  for (const c of leaf.components) {
    const size = state.sizes[c.key];
    const a = (size && c.articles.find((x) => x.width === size.width && x.height === size.height)) || c.articles[0];
    if (a?.product && model.products[a.product] && !slugs.includes(a.product)) slugs.push(a.product);
  }
  return slugs.map((s) => model.products![s]!);
}

/** The engine's result plus the picked extras and tray as ordinary lines; null until complete. */
export function resolved(model: Model, state: State): Resolved | null {
  const cfg = w.resolveConfiguration(model, state);
  if (!cfg) return null;
  const ids = Array.isArray(state.extras) ? state.extras : [];
  const more: Line[] = extrasFor(model).filter((e) => ids.includes(e.articleNumber)).map((e) => ({
    component: e.name, key: `extra:${e.articleNumber}`, qty: extraQty(state, e.articleNumber),
    article: { articleNumber: e.articleNumber, displayName: e.name, finishText: e.finishText, net: e.net, gros: e.gros, currency: cfg.currency, width: null, height: null, sizeLabel: null },
  }));
  const tray = traysFor(model, state).find((d) => d.articleNumber === state.duschwanne);
  if (tray) {
    const name = trayName(tray, doorWidth(model, state)!);
    more.push({ component: name, key: `duschwanne:${tray.articleNumber}`, article: { articleNumber: tray.articleNumber, displayName: name, finishText: tray.finishText, net: tray.net, gros: tray.gros, currency: cfg.currency, stockQuantity: tray.stockQuantity, stockText: tray.stockText, width: null, height: null, sizeLabel: null } });
  }
  if (!more.length) return cfg;
  const lines = cfg.lines.concat(more);
  return { ...cfg, lines, net: lines.reduce((s, l) => s + l.article.net * (l.qty || 1), 0), gros: lines.reduce((s, l) => s + l.article.gros * (l.qty || 1), 0) };
}
/** the small text under a line of "Ihre Auswahl" */
export const lineMeta = (a: Article): string => [a.articleNumber, a.finishText, Array.isArray(a.einbaumass) ? a.einbaumass.map((e) => e.label).filter(Boolean).join(" · ") : ""].filter(Boolean).join(" · ");
export const stockOf = (a: Pick<Article, "stockQuantity" | "stockText">): { inStock: boolean; qty: number; text: string } | null =>
  (a.stockQuantity == null && a.stockText == null ? null : { inStock: Number(a.stockQuantity) > 0, qty: Number(a.stockQuantity) || 0, text: Number(a.stockQuantity) > 0 ? "Auf Lager" : "Auf Bestellung" });
export type { Leaf };
