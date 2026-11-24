// The offer being edited: ONE typed object in one store (ADR 026). Screens read single fields
// through narrow selectors and write through `patch`; nothing is read back from the page.
// Starting an offer and leaving it are one assignment each — no field is reset one by one.
import { FIRST_VARIANT_ID, type DealRelation } from "@oc/api-contract";
import { emptyOffer, type NewOfferType, type Offer, type OfferContext, type SectionKey } from "@oc/domain";
import { create } from "zustand";

export interface OfferState {
  /** the offer being edited, or null on the Hauptmenü */
  offer: Offer | null;
  /** the draft this offer is saved under: a deal number or a temporary key (null: Hauptmenü) */
  dealId: string | null;
  /** the variant of the deal's offer that is open (ADR 027 A; "v1" = the first one, also before the server named it) */
  variantId: string | null;
  /** its internal name (never on documents or mails) */
  variantName: string;
  /** the server named this variant (GET draft answered its id, or it was created / opened by id):
   *  only then do draft calls and sends carry it — else they act on the server's default, which
   *  for a deal without variants is the same draft */
  variantKnown: boolean;
  /** the other deals of the same customer made with „Weiteres Angebot“ (ADR 027 B), as the draft GET answered them */
  related: DealRelation[];
  /** counts every change — cheap "has it changed?" for autosave and the price request */
  version: number;
  /** a number for THIS opening of an offer (never reused in a session): `version` starts at 0 each time
   *  an offer is opened, so anything cached per change (the price) is keyed by both */
  opening: number;
  /** revision of the draft on the server this offer is based on (0: nothing saved yet) */
  revision: number;
  /** the `version` that is on the server */
  savedVersion: number;
  start(type: NewOfferType, ctx: OfferContext, dealId?: string | null, variant?: OpenVariant): void;
  /** replace everything with a stored offer (draft, sent offer) */
  load(offer: Offer, dealId?: string | null, revision?: number, variant?: OpenVariant): void;
  /** the open variant was renamed */
  setVariantName(name: string): void;
  setRelated(related: DealRelation[]): void;
  /** back to the Hauptmenü */
  close(): void;
  /** change fields of one section; a field set to `undefined` is removed (today's UI stores
   *  some answers only once they are given, and drops fields of a part that does not apply) */
  patch<O extends Offer, K extends SectionKey<O>>(section: K, fields: Partial<O[K]>): void;
  /** the same for several sections in ONE change (one render, one save, one price request) */
  patchAll(changes: Record<string, Record<string, unknown>>): void;
  /** change fields that are not part of a section (the offer number); `undefined` removes one */
  setTop(fields: Record<string, unknown>): void;
  /** things a screen remembers while the offer is open but that are not part of the offer,
   *  e.g. the insurance details while the payer is "Selbstzahler" */
  scratch: Record<string, unknown>;
  remember(key: string, value: unknown): void;
  /** the server has `version` of this offer as draft revision `revision` */
  saved(version: number, revision: number): void;
}

/** which variant an offer that is opened is */
export interface OpenVariant { id: string; name?: string | undefined; known: boolean }
let openings = 0;
const CLOSED = { offer: null, dealId: null, variantId: null, variantName: "", variantKnown: false, related: [] as DealRelation[], version: 0, opening: 0, revision: 0, savedVersion: 0, scratch: {} };
const variantOf = (dealId: string | null, v: OpenVariant | undefined) =>
  dealId ? { variantId: v?.id ?? FIRST_VARIANT_ID, variantName: v?.name ?? "", variantKnown: !!v?.known } : {};

/** the section with `fields` applied; `undefined` removes a field */
function merged(section: Record<string, unknown> | undefined, fields: Record<string, unknown>): Record<string, unknown> {
  const out = { ...(section ?? {}), ...fields };
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete out[k];
  return out;
}

export const useOfferStore = create<OfferState>()((set) => ({
  ...CLOSED,
  start: (type, ctx, dealId = null, variant) => set({ ...CLOSED, opening: ++openings, offer: emptyOffer(type, ctx) as Offer, dealId, ...variantOf(dealId, variant) }),
  // an opened offer keeps its product line when the tray is switched on later (today's restore: `__dwLineDefaulted`);
  // only a NEW offer (`start`) gets Badolux preselected — see steps/duschwanne `LINE_DEFAULTED`
  load: (offer, dealId = null, revision = 0, variant) => set({ ...CLOSED, opening: ++openings, offer, dealId, revision, scratch: { dwLineDefaulted: true }, ...variantOf(dealId, variant) }),
  setVariantName: (variantName) => set({ variantName }),
  setRelated: (related) => set({ related }),
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
  setTop: (fields) => set((s) => (s.offer ? { offer: merged(s.offer as Record<string, unknown>, fields) as Offer, version: s.version + 1 } : s)),
  remember: (key, value) => set((s) => ({ scratch: { ...s.scratch, [key]: value } })),
  saved: (version, revision) => set({ savedVersion: version, revision }),
}));

// ---- narrow selectors: a screen re-renders only when ITS value changes ----
export const useOfferType = (): NewOfferType | null => useOfferStore((s) => (s.offer?.activeOffer as NewOfferType | undefined) ?? null);

/** One field of one section, e.g. useOfferField("Kundendaten", "firstName"). */
export function useOfferField<T = unknown>(section: string, key: string): T | undefined {
  return useOfferStore((s) => (s.offer as Record<string, any> | null)?.[section]?.[key] as T | undefined);
}
