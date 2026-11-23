// The way to the customer, worked out by itself (UX-CHANGES U-011 B4, owner 2026-11-17: "auto
// apply time always"). As soon as the customer's address is known — on Kundendaten or on
// Arbeitszeit — the route is asked for and distance and travel time are filled in; when the
// address changes they are filled in again, also over a value typed by hand (the button
// "Strecke aus Adresse vorschlagen" stays for asking again).
// An offer that is opened with its way already filled in is left alone: nothing in a stored —
// maybe sent — offer changes just because it was opened.
// Nothing here blocks: no connection or no route means the fields stay as they are; only when
// the address changed and no new route came, the page says that the way still belongs to the
// old address.
import { useEffect } from "react";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { useOfferStore } from "../../offer/index.js";
import { NO_ADDRESS, derived, fromRoute } from "./rules.js";

type Fields = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const st = () => useOfferStore.getState();
const offerNow = () => (st().offer ?? {}) as Record<string, any>;

/** change entries of Arbeitszeit; everything that follows from them is brought up to date in the same change */
export function writeArbeitszeit(fields: Fields) {
  const o = offerNow();
  st().patch("Arbeitszeit" as never, derived({ ...(o.Arbeitszeit ?? {}), ...fields }, { type: o.activeOffer, payer: o.Kundendaten?.payer, postalCode: o.Kundendaten?.postalCode }) as never);
}

/** Alltagshilfe: the saved zone follows the travel time AND the postcode (Hof rule). When the
 *  address changed but no new route came, the travel time stays — the zone is brought up to date
 *  for the new postcode, so a new offer never carries a zone the screen does not bill (ADR 028
 *  addendum 2026-11-23). Only after an address change in this session (opening an offer never
 *  writes) and only when the zone really changes. */
function refitAhZone() {
  const o = offerNow();
  if (o.activeOffer !== "ah") return;
  const now = (o.Arbeitszeit ?? {}) as Fields;
  const next = derived({ ...now }, { type: o.activeOffer, payer: o.Kundendaten?.payer, postalCode: o.Kundendaten?.postalCode });
  if (next.ahTravelZone !== undefined && Number(next.ahTravelZone) !== Number(now.ahTravelZone)) writeArbeitszeit({});
}

export interface RouteHint { text: string; basis?: string }
export const routeAddress = (kd: Fields) => ({ street: str(kd.street), city: str(kd.city), postalCode: str(kd.postalCode), state: kd.state ?? "", country: kd.country ?? "" });
/** the address a route belongs to; "" while it is not enough to ask (a full PLZ or a town is) */
export function addressKey(kd: Fields): string {
  const a = routeAddress(kd);
  return /^\d{5}$/.test(a.postalCode) || a.city.length >= 2 ? [a.street, a.postalCode, a.city].join("|").toLowerCase() : "";
}
/** ask by itself? `routedFor`: the address the way on the page belongs to (undefined: the offer was just opened) */
export function needsRoute(az: Fields, key: string, routedFor: string | undefined): boolean {
  if (!key) return false;
  if (routedFor === undefined) return !str(az.distanceKm) || !str(az.travelTimeHHMM);
  return key !== routedFor;
}
export const STALE = "Die Adresse wurde geändert, die Anfahrt konnte nicht neu berechnet werden — bitte Entfernung und Reisezeit prüfen.";
export const AUTO_ROUTE_MS = { wait: 1500 };

const hint = (h: RouteHint) => st().remember("routeHint", h);
/** asks for the route and fills it in. `byHand`: the button — every outcome is said */
export async function askRoute(byHand: boolean, signal?: AbortSignal): Promise<void> {
  const kd = (offerNow().Kundendaten ?? {}) as Fields, address = routeAddress(kd), key = addressKey(kd);
  if (byHand && !address.street && !address.city && !address.postalCode) { hint({ text: NO_ADDRESS }); return; }
  if (byHand) hint({ text: "Berechne Routenvorschlag …" });
  const offerType = str(offerNow().activeOffer); // Alltagshilfe starts its route at another address
  const moved = st().scratch.routeFor !== undefined; // the way on the page belongs to another address
  const readdressed = moved && st().scratch.routeFor !== key; // the address really changed since the way was set
  try {
    const route = await call("suggestDistance", { body: { Kundendaten: address, ...(offerType ? { offerType } : {}) }, ...(signal ? { signal } : {}) });
    const found = route.ok ? fromRoute(route) : null;
    if (!found) { if (readdressed) refitAhZone(); if (byHand) hint({ text: route.ok ? "Keine sinnvolle Strecke ermittelt." : "Routenvorschlag fehlgeschlagen." }); else if (moved) hint({ text: STALE }); return; }
    writeArbeitszeit(found.fields);
    st().remember("routeFor", key);
    hint({ text: found.text, basis: found.basis });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    if (readdressed) refitAhZone();
    if (byHand) hint({ text: err instanceof ApiFailure && err.status ? err.message : "Routenvorschlag fehlgeschlagen (Netzwerkfehler)." });
    else if (moved) hint({ text: STALE });
  }
}

/** on Kundendaten and on Arbeitszeit: the route follows the address */
export function useAutoRoute(): void {
  const key = useOfferStore((s) => addressKey((((s.offer ?? {}) as Record<string, any>).Kundendaten ?? {}) as Fields));
  useEffect(() => {
    if (!key) return;
    const routedFor = st().scratch.routeFor as string | undefined;
    if (!needsRoute((offerNow().Arbeitszeit ?? {}) as Fields, key, routedFor)) { if (routedFor === undefined) st().remember("routeFor", key); return; }
    const stop = new AbortController();
    const timer = setTimeout(() => { void askRoute(false, stop.signal); }, AUTO_ROUTE_MS.wait); // not while the address is being typed
    return () => { clearTimeout(timer); stop.abort(); };
  }, [key]);
}
