// The draft of an offer on the server (ADR 007): one draft per deal — or per temporary key for an
// offer started without a deal number. Today's UI reads and writes the SAME draft, so a step
// that is not rebuilt yet can be continued there and back without losing anything.
//  - opening an offer loads its draft; none yet → a new, empty offer
//  - every change is saved AUTOSAVE_MS after the last one; `flushDraft()` saves at once
//  - a draft changed elsewhere in the meantime is never overwritten (server answers 409)
import { isNewOfferType, pricingRulesOf, type NewOfferType, type Offer } from "@oc/domain";
import { useEffect, useState } from "react";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { todayIso } from "../../../shared/lib/format.js";
import { usePrefs } from "../../../shared/lib/prefs.js";
import { useOfferStore } from "./store.js";

export const AUTOSAVE_MS = 2500;

export type OpenState =
  | { status: "loading" }
  | { status: "ready" }
  /** the draft of this deal is an offer of another type → the address should follow it */
  | { status: "other-type"; type: NewOfferType }
  | { status: "error"; message: string };

/** Makes the offer of `dealId` the open one: its draft, or a new empty offer of `type`. */
export function useOpenOffer(dealId: string, type: NewOfferType): OpenState {
  const [state, setState] = useState<OpenState>({ status: "loading" });
  useEffect(() => {
    const s = useOfferStore.getState();
    if (s.dealId === dealId && s.offer?.activeOffer === type) { setState({ status: "ready" }); return; }
    const ctl = new AbortController();
    setState({ status: "loading" });
    call("dealDraft", { params: { dealId }, signal: ctl.signal }).then(
      (d) => {
        if (!isNewOfferType(d.offerType)) return setState({ status: "error", message: "Dieser Entwurf hat eine Angebotsart, die hier nicht bearbeitet werden kann." });
        if (d.offerType !== type) return setState({ status: "other-type", type: d.offerType });
        useOfferStore.getState().load(d.payload as unknown as Offer, dealId, d.revision);
        setState({ status: "ready" });
      },
      (err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        if (err instanceof ApiFailure && err.status === 404) { // no draft yet
          // a new offer carries a snapshot of the business settings, as today; without the
          // settings (offline) it starts without one and is priced with the defaults
          call("publicConfig", { signal: ctl.signal }).then(pricingRulesOf, () => undefined).then((pricingRules) => {
            if (ctl.signal.aborted) return;
            useOfferStore.getState().start(type, { date: todayIso(), ...(pricingRules ? { pricingRules } : {}) }, dealId);
            setState({ status: "ready" });
          });
          return;
        }
        setState({ status: "error", message: err instanceof ApiFailure ? err.message : "Der Entwurf konnte nicht geladen werden." });
      },
    );
    return () => ctl.abort();
  }, [dealId, type]);
  return state;
}

export type SaveStatus = { state: "idle" } | { state: "saving" } | { state: "saved"; at: Date } | { state: "conflict" } | { state: "failed"; message: string };

let inFlight: Promise<SaveStatus> | null = null;
let last: SaveStatus = { state: "idle" };
const listeners = new Set<(s: SaveStatus) => void>();
const tell = (s: SaveStatus) => { last = s; listeners.forEach((l) => l(s)); return s; };

/** How saving stands — for any place that only shows it (header, sidebar). */
export function useSaveStatus(): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>(last);
  useEffect(() => { setStatus(last); listeners.add(setStatus); return () => { listeners.delete(setStatus); }; }, []);
  return status;
}

/** Saves the open offer now if it has unsaved changes. One save at a time; resolves with the outcome. */
export function flushDraft(): Promise<SaveStatus> {
  if (inFlight) return inFlight.then(() => flushDraft());
  const { offer, dealId, version, savedVersion, revision } = useOfferStore.getState();
  if (!offer || !dealId || version === savedVersion) return Promise.resolve({ state: "idle" });
  tell({ state: "saving" });
  inFlight = call("saveDealDraft", { params: { dealId }, body: { offerType: offer.activeOffer, payload: offer, baseRevision: revision } })
    .then((r): SaveStatus => {
      // only if the same offer is still open (the user may have gone to the Hauptmenü meanwhile)
      if (useOfferStore.getState().dealId === dealId) useOfferStore.getState().saved(version, r.revision);
      return tell({ state: "saved", at: new Date() });
    })
    .catch((err: unknown): SaveStatus =>
      tell(err instanceof ApiFailure && err.status === 409 ? { state: "conflict" } : { state: "failed", message: err instanceof ApiFailure ? err.message : "Speichern fehlgeschlagen." }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Saves the open offer by itself after each change — unless the user switched that off
 *  ("Automatisch speichern" in the user menu; then they save with the "Speichern" button). */
export function useAutosave(): void {
  const version = useOfferStore((s) => s.version);
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const dealId = useOfferStore((s) => s.dealId);
  const auto = usePrefs((p) => p.autosave);
  useEffect(() => { tell({ state: "idle" }); }, [dealId]); // another offer: its own saving state
  useEffect(() => {
    if (!dirty || !auto) return;
    const t = setTimeout(() => { void flushDraft(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [version, dirty, auto]);
}

/** A new temporary key for an offer started without a deal number ("t-" + 24 hex, unguessable). */
export function newTempKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return "t-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** The same offer and step in today's UI (it runs at "/" and opens the draft from the address). */
export const legacyAddress = (dealId: string, step: string): string =>
  `/?${/^t-/.test(dealId) ? "entwurf" : "deal"}=${encodeURIComponent(dealId)}#${step}`;

/**
 * Continue this offer in today's UI: save what is unsaved, tell today's UI which offer type and
 * step are open (it keeps that in the tab's session storage under "konfigurator_state_v1" and
 * otherwise starts at its Hauptmenü), then go there — its draft add-on fills the form from the
 * same draft. Returns false when saving failed (the user stays here and sees why).
 */
export async function openInLegacy(dealId: string, type: NewOfferType, step: string): Promise<boolean> {
  const s = await flushDraft();
  if (s.state === "conflict" || s.state === "failed") return false;
  try { sessionStorage.setItem("konfigurator_state_v1", JSON.stringify({ offerType: type, step })); } catch { /* private mode: today's UI opens its Hauptmenü */ }
  window.location.assign(legacyAddress(dealId, step));
  return true;
}
