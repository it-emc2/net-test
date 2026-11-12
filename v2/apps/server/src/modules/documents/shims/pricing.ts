// legacy logic/pricing.js (pricingFactory(Product)) → @oc/pricing with lazily resolved deps
import { createPricingEngine } from "@oc/pricing";
import { Draft, Offer } from "../../../platform/models.js";
import cfg from "./config.js";
import { documentsContext } from "../context.js";
export default (ProductModel: any) => createPricingEngine(ProductModel, {
  cfg,
  fetchVigourNetPrices: (ids: string[]) => documentsContext().fetchVigourNetPrices(ids),
  OfferModel: Offer as any,
  DraftModel: Draft as any,
} as any);
export { NO_MARKUP_IDS } from "@oc/pricing";
