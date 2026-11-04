// Lenient schema for the stored wizard payload (offers.payload, drafts.payload,
// signingrequests.payloadSnapshot). Derived from docs/rewrite/DATA-SHAPES.md:
//  - one object holds ALL sections, whatever the offer type
//  - scalars are mostly strings ("8", "on", "ja", "")
//  - fields appear/disappear over time → everything optional, unknown keys kept
// Reading must NEVER reject or rewrite an old document (ADR 002). Strict validation belongs
// to the input boundary of new writes, not to reads.
import { z } from "zod";

/** A value the legacy UI stores as string, number or boolean ("8", 8, "on", true, ""). */
export const LooseScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Section objects: known keys may be typed later; unknown keys are always preserved. */
const Section = z.looseObject({});

export const KundendatenSchema = z.looseObject({
  salutation: LooseScalar.optional(),
  firstName: LooseScalar.optional(),
  lastName: LooseScalar.optional(),
  email: LooseScalar.optional(),
  phone: LooseScalar.optional(),
  street: LooseScalar.optional(),
  zip: LooseScalar.optional(),
  city: LooseScalar.optional(),
  payer: LooseScalar.optional(),
  date: LooseScalar.optional(),
  ansprechpartner: LooseScalar.optional(),
});

export const WizardPayloadSchema = z.looseObject({
  activeOffer: z.union([z.string(), z.null()]).optional(),
  currentOfferKey: z.union([z.string(), z.null()]).optional(),
  offerType: z.union([z.string(), z.null()]).optional(),
  offerNumber: z.union([z.string(), z.null()]).optional(),
  auftragId: LooseScalar.optional(),
  Kundendaten: KundendatenSchema.optional(),
  Arbeitszeit: Section.optional(),
  duschwanne: Section.optional(),
  wandverkleidung: Section.optional(),
  duschabtrennung: Section.optional(),
  optional: Section.optional(),
  rabatt: Section.optional(),
  bwt: Section.optional(),
  hl: Section.optional(),
  bl: Section.optional(),
  ah: Section.optional(),
  hms: Section.optional(),
  wd: Section.optional(),
  Finanzierung: Section.optional(),
  offerOverrides: Section.optional(),
  pricingRules: Section.optional(),
  materials: z.union([z.array(z.unknown()), z.string()]).optional(),
});

export type WizardPayload = z.infer<typeof WizardPayloadSchema>;

/** Parse for reading: returns the SAME data (unknown keys kept) or a typed error — never throws. */
export function readPayload(raw: unknown) {
  return WizardPayloadSchema.safeParse(raw);
}

/** Legacy string booleans the UI stores. */
export function looseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return typeof v === "string" && /^(on|ja|true|yes|1)$/i.test(v.trim());
}

/** Legacy numeric strings ("8", "12,5", ""). Empty/invalid → 0, matching `Number(x) || 0`. */
export function looseNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
