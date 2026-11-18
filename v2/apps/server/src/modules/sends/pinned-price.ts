// When is the price of a stored offer pinned? (ADR 023, addendum 2026-11-17, audit F1.)
//
// The pricing engine (a 1:1 port of the old app's file, kept identical by a test) returns the
// stored price for every offer stored as `locked` — and every save stores `locked: true`: PDF
// download, before an on-site signature, after a send. So an offer that was only saved kept its
// old total when its positions changed, and went out with it.
//
// Rule now (owner, 2026-11-18):
//   - stored by the OLD app (every stored offer the React app did not create — origin.ts): the
//     stored price, ALWAYS, with or without a provable send. In the old app a stored offer never
//     changed its price; an old offer opened in the new app must show the total of the PDF the
//     customer has.
//   - created by the React app and SENT (send record with an identity; the old app's logs count
//     too): the stored price, always.
//   - created by the React app, never sent (PDF download, a signing that was not completed): the
//     stored price while its content is unchanged, priced FRESH when it changes.
//   - drafts: as before.
//
// The engine itself is not touched: for the one case that must be priced fresh it is given an
// offer model that reports the stored offer as not locked.
import { createPricingEngine, type PricingDeps, type PricingEngine, type PricingProductModel, type PricingSnapshotModel } from "@oc/pricing";
import { Offer } from "../../platform/models.js";
import { offerIdentity } from "./identity.js";
import { wasSentBeforeRecords } from "./offer-record.js";
import { isReactOffer } from "./origin.js";
import { lastSentOffer } from "./store.js";

/** Did this offer number reach a customer? Send records first, then the old app's logs. */
export async function isOfferSent(offerNumber: string): Promise<boolean> {
  const nr = String(offerNumber || "").trim();
  if (!nr) return false;
  return !!(await lastSentOffer(nr)) || (await wasSentBeforeRecords(nr));
}

/** False only for an offer the React app created, that was never sent, and whose content differs from `payload`. */
export async function isPricePinned(payload: any): Promise<boolean> {
  const nr = String(payload?.offerNumber || "").trim();
  if (!nr) return true;
  if (!(await Offer.exists({ offerNumber: nr, locked: true }))) return true; // nothing stored that could pin
  if (!(await isReactOffer(nr))) return true; // stored by the old app: never repriced
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
