// The offer being edited: ONE typed object in one store (ADR 026). Screens read single fields
// through narrow selectors and write through `patch`; nothing is read back from the page.
// Starting an offer and leaving it are one assignment each — no field is reset one by one.
import { emptyOffer, withSection, type NewOfferType, type Offer, type OfferContext, type SectionKey } from "@oc/domain";
import { create } from "zustand";

export interface OfferState {
  /** the offer being edited, or null on the Hauptmenü */
  offer: Offer | null;
  /** Bitrix deal the offer belongs to (null: started without a deal number) */
  dealId: string | null;
  /** counts every change — cheap "has it changed?" for autosave and the price request */
  version: number;
  start(type: NewOfferType, ctx: OfferContext, dealId?: string | null): void;
  /** replace everything with a stored offer (draft, sent offer) */
  load(offer: Offer, dealId?: string | null): void;
  /** back to the Hauptmenü */
  close(): void;
  patch<O extends Offer, K extends SectionKey<O>>(section: K, fields: Partial<O[K]>): void;
}

export const useOfferStore = create<OfferState>()((set) => ({
  offer: null,
  dealId: null,
  version: 0,
  start: (type, ctx, dealId = null) => set({ offer: emptyOffer(type, ctx) as Offer, dealId, version: 0 }),
  load: (offer, dealId = null) => set({ offer, dealId, version: 0 }),
  close: () => set({ offer: null, dealId: null, version: 0 }),
  patch: (section, fields) =>
    set((s) => (s.offer ? { offer: withSection(s.offer as any, section as any, fields as any) as Offer, version: s.version + 1 } : s)),
}));

// ---- narrow selectors: a screen re-renders only when ITS value changes ----
export const useOfferType = (): NewOfferType | null => useOfferStore((s) => (s.offer?.activeOffer as NewOfferType | undefined) ?? null);

/** One field of one section, e.g. useOfferField("Kundendaten", "firstName"). */
export function useOfferField<T = unknown>(section: string, key: string): T | undefined {
  return useOfferStore((s) => (s.offer as Record<string, any> | null)?.[section]?.[key] as T | undefined);
}
