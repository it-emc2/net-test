// legacy logic/pricing.js (pricingFactory(Product)) → @oc/pricing with lazily resolved deps
// The engine prices a stored offer as pinned only when it was sent (sends/pinned-price.ts) —
// the documents must show the same total as the price endpoint.
import { createSentAwarePricing } from "../../sends/index.js";
import { Draft, Offer } from "../../../platform/models.js";
import cfg from "./config.js";
import { documentsContext } from "../context.js";
export default (ProductModel: any) => createSentAwarePricing(ProductModel, {
  cfg,
  fetchVigourNetPrices: (ids: string[]) => documentsContext().fetchVigourNetPrices(ids),
  OfferModel: Offer as any,
  DraftModel: Draft as any,
} as any).pricing;
export { NO_MARKUP_IDS } from "@oc/pricing";
