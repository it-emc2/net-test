// Duschabtrennung (Badumbau) — what the step stores, as today's UI does
// (test/fixtures/duschabtrennung.json, v2/scripts/capture-duschabtrennung.cjs).
//  - one card = one enclosure, from VIGOUR or Badolux. A card is in the offer once it is
//    complete (every part has a size); its articles are net lines in `quickAdd` (kind "config")
//  - the configuration itself is stored for the next opening (`configurator`: the cards'
//    answers, the lines, the pictures) — only while at least one card is complete. An offer
//    without a complete card stores nothing of the cards (as today)
//  - off keeps the configuration and takes its lines out of `quickAdd`
//  - `quickAdd` is shared: picks of the older Hassmann page come first, the curtain's lines
//    (group "Duschvorhang") last; both stay as they are stored
import type { Model, State } from "./engine.js";
import { previewImageUrl, resolved } from "./wizard.js";

type Fields = Record<string, unknown>;
export type Supplier = "vigour" | "badolux";
export interface Card { id: number; supplier: Supplier; state: Partial<State> }
export const SUPPLIERS: readonly { value: Supplier; label: string }[] = [{ value: "vigour", label: "VIGOUR" }, { value: "badolux", label: "Badolux" }];
/** the model a card needs: a Badolux card made with the earlier one-step list reopens with that list */
export const modelKey = (card: Pick<Card, "supplier" | "state">): "vigour" | "badolux" | "badolux-v1" => (card.supplier === "badolux" && card.state.selections?.Produkt != null ? "badolux-v1" : card.supplier);

/** the cards of an opened offer: the stored answers (older offers: one enclosure, not a list), else one empty card */
export function cardsOf(da: Fields): Card[] {
  const saved = (da.configurator as { state?: unknown } | undefined)?.state;
  const states = (Array.isArray(saved) ? saved : saved ? [saved] : []).filter((s) => s && typeof s === "object") as (Partial<State> & { __supplier?: string })[];
  if (!states.length) return [{ id: 1, supplier: "vigour", state: {} }];
  return states.map(({ __supplier, ...state }, i) => ({ id: i + 1, supplier: __supplier === "badolux" ? "badolux" : "vigour", state }));
}
/** an offer from before the switch existed is on exactly when it has configured lines */
export function isOn(da: Fields): boolean {
  if (typeof da.configEnabled === "boolean") return da.configEnabled;
  const lines = (da.configurator as { lines?: unknown } | undefined)?.lines;
  return Array.isArray(lines) && lines.length > 0;
}
export const addCard = (cards: readonly Card[]): Card[] => [...cards, { id: Math.max(0, ...cards.map((c) => c.id)) + 1, supplier: "vigour", state: {} }];
export const removeCard = (cards: readonly Card[], id: number): Card[] => (cards.length > 1 ? cards.filter((c) => c.id !== id) : [...cards]);

interface QuickAdd { kind?: string; group?: string; [k: string]: unknown }
export interface StoredLine { label?: string; articleNumber?: string; net?: number; qty?: number; finish?: string | null }
const isConfig = (q: QuickAdd) => String(q?.kind ?? "").toLowerCase() === "config";
/** `quickAdd` with the enclosures' lines: Hassmann picks first, then these lines (only while on,
 *  only with a price), then the curtain's lines */
export function quickAddOf(da: Fields, lines: readonly StoredLine[], on: boolean): QuickAdd[] {
  const stored = (Array.isArray(da.quickAdd) ? da.quickAdd : []) as QuickAdd[];
  const priced = (on ? lines : []).filter((l) => (Number(l.net) || 0) > 0)
    .map((l) => ({ kind: "config", label: l.label || "Duschabtrennung (Konfigurator)", qty: Math.max(1, Number(l.qty) || 1), price: Number(l.net), productId: l.articleNumber || "", finish: l.finish || null }));
  return [...stored.filter((q) => !isConfig(q)), ...priced, ...stored.filter((q) => isConfig(q) && q.group === "Duschvorhang")];
}
/** the switch: off keeps the configuration and takes its lines out of `quickAdd` */
export const switched = (da: Fields, on: boolean): Fields => ({ configEnabled: on, quickAdd: quickAddOf(da, ((da.configurator as { lines?: StoredLine[] } | undefined)?.lines ?? []), on) });
/** Cards → the fields of the offer's section. Every card comes with its model. */
export function fieldsOf(da: Fields, cards: readonly (Card & { model: Model; state: State })[], on: boolean): Fields {
  const done = cards.map((c) => ({ card: c, result: resolved(c.model, c.state) }));
  const lines = done.flatMap(({ result }) => (result ? result.lines : []).map((l) => ({ label: l.article.displayName || l.component, articleNumber: l.article.articleNumber, net: l.article.net, qty: l.qty || 1, finish: l.article.finishText || null })));
  const previewImages = done.filter((d) => d.result).map(({ card, result }) => ({ articleNumbers: result!.lines.map((l) => l.article.articleNumber), imageUrl: previewImageUrl(card.model, card.state) })).filter((d) => d.imageUrl);
  return { configEnabled: on, quickAdd: quickAddOf(da, lines, on), configurator: lines.length ? { state: cards.map((c) => ({ ...c.state, __supplier: c.supplier })), lines, previewImages } : undefined };
}
