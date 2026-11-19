// The draft of an offer on the server (ADR 007): one draft per deal — or per temporary key for an
// offer started without a deal number. Today's UI reads and writes the SAME draft, so a step
// that is not rebuilt yet can be continued there and back without losing anything.
//  - opening an offer loads its draft; none yet → a new, empty offer
//  - every change is saved AUTOSAVE_MS after the last one (and kept in a localStorage snapshot when the page goes away); `flushDraft()` saves at once
//  - a draft changed elsewhere in the meantime is never overwritten (server answers 409)
import { FIRST_VARIANT_ID } from "@oc/api-contract";
import { isNewOfferType, pricingRulesOf, type NewOfferType, type Offer } from "@oc/domain";
import { useEffect, useState } from "react";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { todayIso } from "../../../shared/lib/format.js";
import { usePrefs } from "../../../shared/lib/prefs.js";
import { useOfferStore, type OpenVariant } from "./store.js";
import { snapshotKey, variantQuery } from "./variants.js";

export const AUTOSAVE_MS = 2500;

// Synchronous device snapshot (localStorage): the page may go away within the autosave delay and
// a request or IndexedDB write may not finish during unload. `revision` = server revision it is based on.
// One per deal and variant (variants.ts snapshotKey: the first variant keeps today's key).
interface Snapshot { at: number; revision: number; offerType: string; payload: unknown }
export function writeSnapshot(): void {
  const { offer, dealId, variantId, version, savedVersion, revision } = useOfferStore.getState();
  if (!offer || !dealId || version === savedVersion) return;
  try { localStorage.setItem(snapshotKey(dealId, variantId), JSON.stringify({ at: Date.now(), revision, offerType: offer.activeOffer, payload: offer } satisfies Snapshot)); } catch { /* full / private mode: the server draft remains */ }
}
const readSnapshot = (key: string): Snapshot | null => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
export const dropSnapshot = (key: string) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

/** A snapshot based on the server revision that is still current holds newer input → open it as
 *  unsaved changes (uploaded by autosave / "Speichern"). A snapshot of an older revision never wins. */
function applySnapshot(dealId: string, variant: OpenVariant, type: NewOfferType, serverRevision: number): boolean {
  const key = snapshotKey(dealId, variant.id);
  const snap = readSnapshot(key);
  if (!snap) return false;
  if (snap.revision !== serverRevision || snap.offerType !== type || !snap.payload) { dropSnapshot(key); return false; }
  useOfferStore.getState().load(snap.payload as Offer, dealId, serverRevision, variant);
  useOfferStore.setState({ version: 1 }); // dirty: savedVersion stays 0
  return true;
}

export type OpenState =
  | { status: "loading" }
  | { status: "ready" }
  /** the asked variant is gone: another one was opened → the address should name it */
  | { status: "moved"; variantId: string }
  /** the draft of this deal is an offer of another type → the address should follow it */
  | { status: "other-type"; type: NewOfferType }
  | { status: "error"; message: string };

/** What the Hauptmenü hands to the offer it is about to start (an appointment of the planning): one
 *  shot, used only if `dealId` starts as a NEW offer (an existing draft is never overwritten). */
let pendingStart: { dealId: string; apply: () => void } | null = null;
export const prefillNextOffer = (dealId: string, apply: () => void) => { pendingStart = { dealId, apply }; };
const takePrefill = (dealId: string) => { const p = pendingStart; pendingStart = null; if (p?.dealId === dealId) p.apply(); };

/** The open offer is about to be replaced (another deal or variant by address, e.g. the browser's
 *  back button): its unsaved input is kept on the device at once and saved to ITS draft. */
function keepOpenInput(): void {
  const s = useOfferStore.getState();
  if (!s.offer || !s.dealId || s.version === s.savedVersion) return;
  writeSnapshot();
  void flushDraft();
}

/** Is this offer (and variant, if the address names one) the open one? An address without a
 *  variant keeps the variant that is open (the frame then writes it into the address). */
const isOpen = (s: ReturnType<typeof useOfferStore.getState>, dealId: string, type: NewOfferType, variant: string | undefined) =>
  s.dealId === dealId && s.offer?.activeOffer === type && (!variant || s.variantId === variant);

/** Makes the offer of `dealId` the open one: its draft (of `variant`, else of the variant the
 *  server opened last), or a new empty offer of `type`. */
export function useOpenOffer(dealId: string, type: NewOfferType, variant?: string): OpenState {
  const open = useOfferStore((s) => isOpen(s, dealId, type, variant));
  const want = `${dealId}|${type}|${variant ?? ""}`;
  const [state, setState] = useState<OpenState & { for?: string }>({ status: "loading" });
  useEffect(() => {
    if (isOpen(useOfferStore.getState(), dealId, type, variant)) { setState({ status: "ready", for: want }); return; }
    keepOpenInput();
    const ctl = new AbortController();
    const say = (s: OpenState) => { if (!ctl.signal.aborted) setState({ ...s, for: want }); };
    setState({ status: "loading", for: want });
    const get = (asked: string | undefined) => call("dealDraft", { params: { dealId }, signal: ctl.signal, ...(asked ? { query: `variant=${encodeURIComponent(asked)}` } : {}) });
    const loaded = (d: Awaited<ReturnType<typeof get>>, asked: string | undefined) => {
      if (!isNewOfferType(d.offerType)) return say({ status: "error", message: "Dieser Entwurf hat eine Angebotsart, die hier nicht bearbeitet werden kann." });
      if (d.offerType !== type) return say({ status: "other-type", type: d.offerType });
      pendingStart = null; // an existing draft is never overwritten by an appointment
      const v: OpenVariant = { id: d.variantId ?? asked ?? FIRST_VARIANT_ID, name: d.variantName, known: !!(d.variantId || asked) };
      if (!applySnapshot(dealId, v, type, d.revision)) useOfferStore.getState().load(d.payload as unknown as Offer, dealId, d.revision, v);
      if (variant && v.id !== variant) return say({ status: "moved", variantId: v.id });
      say({ status: "ready" });
    };
    const fresh = () => { // no draft yet
      // a new offer carries a snapshot of the business settings, as today; without the
      // settings (offline) it starts without one and is priced with the defaults
      call("publicConfig", { signal: ctl.signal }).then(pricingRulesOf, () => undefined).then((pricingRules) => {
        if (ctl.signal.aborted) return;
        const v: OpenVariant = { id: FIRST_VARIANT_ID, known: false };
        if (applySnapshot(dealId, v, type, 0)) return say(variant && variant !== FIRST_VARIANT_ID ? { status: "moved", variantId: FIRST_VARIANT_ID } : { status: "ready" });
        useOfferStore.getState().start(type, { date: todayIso(), ...(pricingRules ? { pricingRules } : {}) }, dealId, v);
        takePrefill(dealId);
        say(variant && variant !== FIRST_VARIANT_ID ? { status: "moved", variantId: FIRST_VARIANT_ID } : { status: "ready" });
      });
    };
    const failed = (err: unknown) => {
      if ((err as Error)?.name === "AbortError") return;
      if (err instanceof ApiFailure && err.status === 404) return fresh();
      say({ status: "error", message: err instanceof ApiFailure ? err.message : "Der Entwurf konnte nicht geladen werden." });
    };
    get(variant).then((d) => loaded(d, variant), (err: unknown) => {
      // the asked variant is gone (deleted, an old link) or the deal has no draft yet: the server's default
      if (variant && err instanceof ApiFailure && err.status === 404) get(undefined).then((d) => loaded(d, undefined), failed);
      else failed(err);
    });
    return () => ctl.abort();
  }, [dealId, type, variant, want]);
  if (open && (state.for !== want || state.status === "loading")) return { status: "ready" };
  return state.for === want ? state : { status: "loading" };
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
  const s = useOfferStore.getState(), { offer, dealId, variantId, version, savedVersion, revision } = s;
  if (!offer || !dealId || version === savedVersion) return Promise.resolve({ state: "idle" });
  tell({ state: "saving" });
  const query = variantQuery(s);
  inFlight = call("saveDealDraft", { params: { dealId }, ...(query ? { query } : {}), body: { offerType: offer.activeOffer, payload: offer, baseRevision: revision } })
    .then((r): SaveStatus => {
      // only if the same offer is still open (the user may have gone to the Hauptmenü or another variant meanwhile)
      const now = useOfferStore.getState();
      if (now.dealId === dealId && now.variantId === variantId) {
        now.saved(version, r.revision);
        if (useOfferStore.getState().version === version) dropSnapshot(snapshotKey(dealId, variantId)); // nothing newer typed meanwhile
      }
      return tell({ state: "saved", at: new Date() });
    })
    .catch((err: unknown): SaveStatus =>
      tell(err instanceof ApiFailure && err.status === 409 ? { state: "conflict" } : { state: "failed", message: err instanceof ApiFailure ? err.message : "Speichern fehlgeschlagen." }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** The newer state of the deal's draft replaces what is open here (after a save was refused
 *  because the draft was changed elsewhere). What was typed on this device since is given up.
 *  False: it could not be loaded — nothing changed. */
export async function reloadDraft(): Promise<boolean> {
  const s = useOfferStore.getState(), { offer, dealId, variantId, variantName, variantKnown } = s;
  if (!offer || !dealId) return false;
  try {
    const query = variantQuery(s);
    const d = await call("dealDraft", { params: { dealId }, ...(query ? { query } : {}) });
    if (useOfferStore.getState().dealId !== dealId || useOfferStore.getState().variantId !== variantId || d.offerType !== offer.activeOffer) return false;
    dropSnapshot(snapshotKey(dealId, variantId));
    useOfferStore.getState().load(d.payload as unknown as Offer, dealId, d.revision, { id: d.variantId ?? variantId ?? FIRST_VARIANT_ID, name: d.variantName ?? variantName, known: variantKnown || !!d.variantId });
    tell({ state: "idle" });
    return true;
  } catch { return false; }
}

/** Saves the open offer by itself after each change — unless the user switched that off
 *  ("Automatisch speichern" in the user menu; then they save with the "Speichern" button). */
export function useAutosave(): void {
  const version = useOfferStore((s) => s.version);
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const dealId = useOfferStore((s) => s.dealId);
  const auto = usePrefs((p) => p.autosave);
  const variantId = useOfferStore((s) => s.variantId);
  useEffect(() => { tell({ state: "idle" }); }, [dealId, variantId]); // another offer or variant: its own saving state
  useEffect(() => {
    if (!dirty || !auto) return;
    const t = setTimeout(() => { void flushDraft(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [version, dirty, auto]);
  useEffect(() => writeSnapshot, []); // leaving the offer in-app: nothing may be lost (Hauptmenü also saves at once)
}

/** The page goes away (reload, close, tab discarded): keep the input at once. Called by the app
 *  shell on pagehide / visibilitychange→hidden (features register no window listeners, ADR 026). */
export function flushNow(): void {
  writeSnapshot();
  if (usePrefs.getState().autosave) void flushDraft();
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
