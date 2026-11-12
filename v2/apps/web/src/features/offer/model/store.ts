// The offer being edited: ONE typed object in one store (ADR 026). Screens read single fields
// through narrow selectors and write through `patch`; nothing is read back from the page.
// Starting an offer and leaving it are one assignment each — no field is reset one by one.
import { emptyOffer, type NewOfferType, type Offer, type OfferContext, type SectionKey } from "@oc/domain";
import { create } from "zustand";

export interface OfferState {
  /** the offer being edited, or null on the Hauptmenü */
  offer: Offer | null;
  /** the draft this offer is saved under: a deal number or a temporary key (null: Hauptmenü) */
  dealId: string | null;
  /** counts every change — cheap "has it changed?" for autosave and the price request */
  version: number;
  /** revision of the draft on the server this offer is based on (0: nothing saved yet) */
  revision: number;
  /** the `version` that is on the server */
  savedVersion: number;
  start(type: NewOfferType, ctx: OfferContext, dealId?: string | null): void;
  /** replace everything with a stored offer (draft, sent offer) */
  load(offer: Offer, dealId?: string | null, revision?: number): void;
  /** back to the Hauptmenü */
  close(): void;
  /** change fields of one section; a field set to `undefined` is removed (today's UI stores
   *  some answers only once they are given, and drops fields of a part that does not apply) */
  patch<O extends Offer, K extends SectionKey<O>>(section: K, fields: Partial<O[K]>): void;
  /** the same for several sections in ONE change (one render, one save, one price request) */
  patchAll(changes: Record<string, Record<string, unknown>>): void;
  /** things a screen remembers while the offer is open but that are not part of the offer,
   *  e.g. the insurance details while the payer is "Selbstzahler" */
  scratch: Record<string, unknown>;
  remember(key: string, value: unknown): void;
  /** the server has `version` of this offer as draft revision `revision` */
  saved(version: number, revision: number): void;
}

const CLOSED = { offer: null, dealId: null, version: 0, revision: 0, savedVersion: 0, scratch: {} };

/** the section with `fields` applied; `undefined` removes a field */
function merged(section: Record<string, unknown> | undefined, fields: Record<string, unknown>): Record<string, unknown> {
  const out = { ...(section ?? {}), ...fields };
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete out[k];
  return out;
}

export const useOfferStore = create<OfferState>()((set) => ({
  ...CLOSED,
  start: (type, ctx, dealId = null) => set({ ...CLOSED, offer: emptyOffer(type, ctx) as Offer, dealId }),
  load: (offer, dealId = null, revision = 0) => set({ ...CLOSED, offer, dealId, revision }),
  close: () => set({ ...CLOSED }),
  patch: (section, fields) =>
    set((s) => (s.offer ? { offer: { ...s.offer, [section]: merged((s.offer as any)[section], fields as Record<string, unknown>) } as Offer, version: s.version + 1 } : s)),
  patchAll: (changes) =>
    set((s) => {
      if (!s.offer) return s;
      const next: Record<string, unknown> = { ...s.offer };
      for (const [section, fields] of Object.entries(changes)) next[section] = merged(next[section] as Record<string, unknown>, fields);
      return { offer: next as Offer, version: s.version + 1 };
    }),
  remember: (key, value) => set((s) => ({ scratch: { ...s.scratch, [key]: value } })),
  saved: (version, revision) => set({ savedVersion: version, revision }),
}));

// ---- narrow selectors: a screen re-renders only when ITS value changes ----
export const useOfferType = (): NewOfferType | null => useOfferStore((s) => (s.offer?.activeOffer as NewOfferType | undefined) ?? null);

/** One field of one section, e.g. useOfferField("Kundendaten", "firstName"). */
export function useOfferField<T = unknown>(section: string, key: string): T | undefined {
  return useOfferStore((s) => (s.offer as Record<string, any> | null)?.[section]?.[key] as T | undefined);
}
