// The typed offer (ADR 026). An offer in the React app is ONE object — and that object is the
// stored wizard payload itself, strictly typed, not a second model: the pricing engine, the
// documents and old offers all read this shape (ADR 002, ADR 004), so a separate model would
// only need converters for several hundred fields.
//
// The field types and the defaults come from what today's UI stores for a new offer
// (./empty/<type>.json, written by v2/scripts/capture-empty-offers.cjs). Reading old documents
// stays lenient (payload.ts); this file is for code that WRITES offers.
import ah from "./empty/ah.json" with { type: "json" };
import bl from "./empty/bl.json" with { type: "json" };
import bu from "./empty/bu.json" with { type: "json" };
import bwt from "./empty/bwt.json" with { type: "json" };
import hl from "./empty/hl.json" with { type: "json" };

const EMPTY = { bu, bwt, hl, bl, ah } as const;

/** Offer types the new UI builds (HMS/WD are not part of v2, ADR 011). */
export const NEW_OFFER_TYPES = ["bu", "bwt", "hl", "bl", "ah"] as const;
export type NewOfferType = (typeof NEW_OFFER_TYPES)[number];
export const isNewOfferType = (v: unknown): v is NewOfferType => typeof v === "string" && (NEW_OFFER_TYPES as readonly string[]).includes(v);

/** JSON inference gives `never[]` for empty lists, `null` for unset values and `{}` for empty
 *  sections — widen those so the fields can actually be filled. Known keys keep their type. */
type Widen<T> =
  T extends readonly never[] ? unknown[]
  : T extends readonly (infer U)[] ? Widen<U>[]
  : T extends null ? unknown
  : T extends object ? (keyof T extends never ? Record<string, unknown> : { [K in keyof T]: Widen<T[K]> })
  : T;
/** A section also carries dynamic keys (`qty_<id>`, `opt_<id>`, …) → open for further keys. */
type Open<T> = T extends object ? (T extends unknown[] ? T : T & Record<string, unknown>) : T;

/** The offer of one type: every field today's UI stores, with its type. */
export type Offer<T extends NewOfferType = NewOfferType> = T extends NewOfferType
  ? { [K in keyof (typeof EMPTY)[T]]: K extends "activeOffer" ? T : Open<Widen<(typeof EMPTY)[T][K]>> }
  : never;
export type BuOffer = Offer<"bu">;
export type BwtOffer = Offer<"bwt">;
export type HlOffer = Offer<"hl">;
export type BlOffer = Offer<"bl">;
export type AhOffer = Offer<"ah">;

/** Name of a section (an object-valued top-level key) of an offer. */
export type SectionKey<O extends Offer> = { [K in keyof O]: O[K] extends Record<string, unknown> ? K : never }[keyof O];

/** What a new offer needs from outside: the day, the logged-in user and the business settings.
 *  These are NOT offer defaults, so they are blank in ./empty/*.json. */
export interface OfferContext {
  /** offer date as the UI stores it (`YYYY-MM-DD`) */
  date: string;
  /** Kundendaten.ansprechpartner (e-mail of the contact person) */
  ansprechpartner?: string;
  /** Kundendaten.emc2_contact (display name of the contact person) */
  contactName?: string;
  /** ourSignatureUser */
  signatureUser?: string;
  /** pricingRules: the snapshot of the business settings an offer is priced with */
  pricingRules?: Record<string, unknown>;
}

/**
 * A new, empty offer of the given type — exactly what today's UI stores right after the tile
 * was tapped. Starting an offer and "back to Hauptmenü" are this one call; nothing is reset
 * field by field. Every call returns its own copy.
 */
export function emptyOffer<T extends NewOfferType>(type: T, ctx: OfferContext): Offer<T> {
  const o = structuredClone(EMPTY[type]) as unknown as Record<string, any>;
  o.Kundendaten.date = ctx.date;
  if (ctx.ansprechpartner !== undefined) o.Kundendaten.ansprechpartner = ctx.ansprechpartner;
  if (ctx.contactName !== undefined) o.Kundendaten.emc2_contact = ctx.contactName;
  if (ctx.signatureUser !== undefined) o.ourSignatureUser = ctx.signatureUser;
  if (ctx.pricingRules !== undefined) o.pricingRules = structuredClone(ctx.pricingRules);
  return o as Offer<T>;
}

/** The offer with some fields of one section replaced (the offer itself is not changed). */
export function withSection<O extends Offer, K extends SectionKey<O>>(offer: O, section: K, patch: Partial<O[K]>): O {
  return { ...offer, [section]: { ...(offer[section] as object), ...patch } };
}
