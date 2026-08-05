// src/logic/pricing.js
// Server wiring for the pricing rules. The rules themselves live in
// pricing-core.js with their dependencies injected, so the same file can also
// run in the browser for offline totals. Server call sites are unchanged:
// pricingFactory(Product).
import cfg from "../services/configService.js";
import { fetchVigourNetPrices } from "../external/vigorDb.js";
import pricingCore from "./pricing-core.js";

export * from "./pricing-core.js";

export default (ProductModel) =>
  pricingCore(ProductModel, { cfg, fetchVigourNetPrices });
