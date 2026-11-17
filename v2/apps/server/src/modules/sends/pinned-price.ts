// When is the price of a stored offer pinned? (ADR 023, addendum 2026-11-17, audit F1.)
//
// The pricing engine (a 1:1 port of the old app's file, kept identical by a test) returns the
// stored price for every offer stored as `locked` — and every save stores `locked: true`: PDF
// download, before an on-site signature, after a send. So an offer that was only saved kept its
// old total when its positions changed, and went out with it.
//
// Rule now: the stored price is pinned
//   - for an offer that was SENT (send record with an identity, or the old app's logs) — always;
//   - for an offer that was only saved, as long as its content is unchanged.
// A saved, never-sent offer whose content changed is priced fresh.
//
// The engine itself is not touched: for the one case that must be priced fresh it is given an
// offer model that reports the stored offer as not locked.
import { createPricingEngine, type PricingDeps, type PricingEngine, type PricingProductModel, type PricingSnapshotModel } from "@oc/pricing";
import { Offer } from "../../platform/models.js";
import { offerIdentity } from "./identity.js";
import { wasSentBeforeRecords } from "./offer-record.js";
import { lastSentOffer } from "./store.js";

/** Did this offer number reach a customer? Send records first, then the old app's logs. */
export async function isOfferSent(offerNumber: string): Promise<boolean> {
  const nr = String(offerNumber || "").trim();
  if (!nr) return false;
  return !!(await lastSentOffer(nr)) || (await wasSentBeforeRecords(nr));
}

/** False only for a stored, never-sent offer whose content differs from `payload`. */
export async function isPricePinned(payload: any): Promise<boolean> {
  const nr = String(payload?.offerNumber || "").trim();
  if (!nr) return true;
  if (!(await Offer.exists({ offerNumber: nr, locked: true }))) return true; // nothing stored that could pin
  if (await isOfferSent(nr)) return true;
  const stored: any = await Offer.findOne({ offerNumber: nr }, { payload: 1 }).lean();
  // tolerant comparison (key order, empty values, workflow sections) — a reopened offer is
  // rebuilt from the form and must not count as changed
  return !stored?.payload || offerIdentity(stored.payload, nr).contentHash === offerIdentity(payload, nr).contentHash;
}

/** The same model, but every snapshot it hands out says "not locked". */
const neverLocked = (M: PricingSnapshotModel): PricingSnapshotModel => ({
  findOne(q) {
    let query = M.findOne(q);
    const chain = {
      select(s: unknown) { query = query.select(s); return chain; },
      sort(s: unknown) { query = query.sort(s); return chain; },
      async lean() { const doc = await query.lean(); return doc ? { ...doc, locked: false } : doc; },
    };
    return chain;
  },
});

/**
 * `pricing`: the engine with "locked" meaning "sent" (see the rule above) — for everything.
 * `unpinned`: never returns a stored price as pinned — only for writing the offer of a send,
 * where the caller knows that what is stored under the number is not the sent content.
 */
export function createSentAwarePricing(ProductModel: PricingProductModel, deps: PricingDeps): { pricing: PricingEngine; unpinned: PricingEngine } {
  const pinned = createPricingEngine(ProductModel, deps);
  if (!deps.OfferModel) return { pricing: pinned, unpinned: pinned };
  const unpinned = createPricingEngine(ProductModel, { ...deps, OfferModel: neverLocked(deps.OfferModel) });
  const pricing: PricingEngine = {
    ...pinned,
    async computePrices(payload) {
      let keep = true;
      // a failing check leaves the price as it always was
      try { keep = await isPricePinned(payload); } catch (e) { console.warn("[pricing] sent check failed — stored price kept:", (e as Error)?.message || e); }
      return keep ? pinned.computePrices(payload) : unpinned.computePrices(payload);
    },
  };
  return { pricing, unpinned };
}
