// "Sent" as a server-side fact on the offer itself (ADR 023, increment 3).
//
// The legacy app left it to the browser to save the offer as locked AFTER a send or before an
// on-site signature — best effort, errors swallowed. Without that offer document the price was
// not pinned: every later view of the signing page and the final signed PDF recomputed it
// (audit signing S-04). The server now makes sure the stored offer is the one that went out.
import { computeFingerprint, type PricingEngine } from "@oc/pricing";
import { EmailLog, Offer, PostalSend, SigningRequest } from "../../platform/models.js";
import { offerIdentity } from "./identity.js";
import { isReactClient, markReactOffer } from "./origin.js";

/**
 * After a send (or a hand-over for signature): the offer stored under the number IS that content.
 * `pricing` = the price as it went out; without it the price is computed here.
 * Callers have passed the send guard — an offer that was sent with other content never gets here.
 */
export type EnsureSentOffer = (a: {
  offerNumber: string; offerType: string; payload: unknown; pricing?: unknown;
  /** a repeated send of an offer that is out already: only make sure an offer is stored, replace nothing */
  onlyIfMissing?: boolean;
  /** the request's `client` field: "react" = the React app; an offer CREATED here for it is a React offer (origin.ts) */
  client?: unknown;
}) => Promise<"created" | "replaced" | "exists" | "skipped">;

/** `unpinned`: the engine that never serves a stored price as pinned (pinned-price.ts). */
export function sentOfferRecorder(unpinned: PricingEngine, log: { warn(o: object, m: string): void }): EnsureSentOffer {
  return async ({ offerNumber, offerType, payload, pricing: asSent, onlyIfMissing, client }) => {
    const nr = String(offerNumber || "").trim();
    if (!nr || !payload || typeof payload !== "object") return "skipped";
    try {
      const stored: any = await Offer.findOne({ offerNumber: nr }, { payload: 1 }).lean();
      // the same offer is stored already (a download before the send): its price stays as it is
      if (stored?.payload && offerIdentity(stored.payload, nr).contentHash === offerIdentity(payload, nr).contentHash) return "exists";
      if (stored && onlyIfMissing) return "exists";
      // Another state is stored (saved earlier, then changed and sent without a save — audit F8):
      // it is replaced, otherwise the stored offer is not what the customer has and saving it
      // again is refused as "changed". A copy, because pricing touches the payload it is given.
      const copy = structuredClone(payload) as Record<string, unknown>;
      const pricingPayload = { ...copy, offerNumber: nr, offerType };
      let computed: Record<string, unknown>;
      if (asSent && typeof asSent === "object") {
        const { _locked, _stale, ...rest } = JSON.parse(JSON.stringify(asSent));
        computed = rest;
      } else {
        // priced fresh: whatever is stored under the number is not this content
        computed = await unpinned.computePrices({ ...structuredClone(copy), offerNumber: nr, offerType, forceRecompute: true });
      }
      await Offer.updateOne(
        { offerNumber: nr },
        { $set: { offerType: offerType || "bu", payload: copy, pricing: computed, pricingFingerprint: computeFingerprint(pricingPayload), locked: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      if (!stored && isReactClient(client)) await markReactOffer(nr);
      return stored ? "replaced" : "created";
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
