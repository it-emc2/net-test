// Budget mode follows every change that moves the price, wherever it is made: services, rhythm,
// "Beides im selben Termin" (Leistungen), travel zone (Arbeitszeit), payer (Kundendaten),
// "2 Personen" and "Entlastungsbetrag anrechnen" — one store subscription, so no screen has to
// know about it. Opening an offer writes nothing (only a change after it does).
import { getAhConfig, useOfferStore, type OfferState } from "../../offer/index.js";
import { handOfStored, isActive, settle, settleKey, type Base, type Hand } from "./rules.js";

export const BASE_KEY = "ah:base";
/** rows set by hand in budget mode (owner 2026-11-23) — session state, derived again when an offer is opened */
export const HAND_KEY = "ah:hand";
let last: { at: string; key: string; active: boolean } | null = null;

function onChange(s: OfferState, prev: OfferState): void {
  const o = s.offer as Record<string, any> | null;
  if (!o || o.activeOffer !== "ah") { last = null; return; }
  const cfg = getAhConfig();
  const at = `${s.dealId}|${s.variantId}`;
  const hand = s.scratch[HAND_KEY] as Hand | undefined;
  const key = settleKey(o, cfg) + JSON.stringify(hand ?? null);
  // a new or opened offer: take it as it is (and tell which rows were set by hand — nothing is written)
  if (!last || last.at !== at || s.version === 0 || s.version < prev.version || prev.offer === null) {
    const derived = hand ?? handOfStored(o, cfg);
    last = { at, key: settleKey(o, cfg) + JSON.stringify(derived), active: isActive(o, cfg) };
    if (!hand) s.remember(HAND_KEY, derived);
    return;
  }
  if (key === last.key) return;
  const r = settle(o, s.scratch[BASE_KEY] as Base | undefined, last.active, cfg, hand);
  last = { at, key, active: r.active };
  if (JSON.stringify(r.base) !== JSON.stringify(s.scratch[BASE_KEY])) s.remember(BASE_KEY, r.base);
  if (r.changes) useOfferStore.getState().patch("ah" as never, r.changes as never);
}

let off: (() => void) | null = null;
/** idempotent: the subscription exists once */
export function installAhSettle(): void {
  if (!off) off = useOfferStore.subscribe(onChange);
}
