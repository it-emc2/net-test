// "Sent" as a server-side fact on the offer itself (ADR 023, increment 3).
//
// The legacy app left it to the browser to save the offer as locked AFTER a send or before an
// on-site signature — best effort, errors swallowed. Without that offer document the price was
// not pinned: every later view of the signing page and the final signed PDF recomputed it
// (audit signing S-04). The server now makes sure the locked offer exists itself.
import { computeFingerprint, type PricingEngine } from "@oc/pricing";
import { EmailLog, Offer, PostalSend, SigningRequest } from "../../platform/models.js";

export type EnsureSentOffer = (a: { offerNumber: string; offerType: string; payload: unknown }) => Promise<"created" | "exists" | "skipped">;

export function sentOfferRecorder(pricing: PricingEngine, log: { warn(o: object, m: string): void }): EnsureSentOffer {
  return async ({ offerNumber, offerType, payload }) => {
    const nr = String(offerNumber || "").trim();
    if (!nr || !payload || typeof payload !== "object") return "skipped";
    try {
      if (await Offer.exists({ offerNumber: nr })) return "exists";
      // same computation as POST /api/offers; a copy, because pricing touches the payload it is given
      const copy = structuredClone(payload) as Record<string, unknown>;
      const pricingPayload = { ...copy, offerNumber: nr, offerType };
      const computed = await pricing.computePrices(pricingPayload);
      await Offer.create({
        offerNumber: nr, offerType: offerType || "bu", payload: copy, pricing: computed,
        pricingFingerprint: computeFingerprint(pricingPayload), locked: true, createdAt: new Date(), updatedAt: new Date(),
      });
      return "created";
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) return "exists";
      log.warn({ err: e, offerNumber: nr }, "recording the sent offer failed");
      return "skipped";
    }
  };
}

/** Offers sent by the legacy app have no send record — its own logs are the evidence. */
export async function wasSentBeforeRecords(offerNumber: string): Promise<boolean> {
  const nr = String(offerNumber || "").trim();
  if (!nr) return false;
  return !!(
    (await EmailLog.exists({ offerNumber: nr })) ||
    (await PostalSend.exists({ offerNumber: nr, sentAt: { $ne: null } })) ||
    (await SigningRequest.exists({ offerNumber: nr, "documents.status": "signed" }))
  );
}
