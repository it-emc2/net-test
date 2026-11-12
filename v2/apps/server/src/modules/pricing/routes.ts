// Price calculation and the inputs the browser needs to compute prices offline (legacy /api/price*).
import type { FastifyInstance } from "fastify";
import type { PriceInputsResponse } from "@oc/api-contract";
import { CONFIG_SCHEMA, type BusinessConfig } from "../../platform/business-config.js";
import { Product } from "../../platform/models.js";

export interface PricingRouteDeps {
  computePrices: (payload: Record<string, unknown>) => Promise<any>;
  businessConfig: BusinessConfig;
  buildId: string;
}

export async function registerPricing(app: FastifyInstance, d: PricingRouteDeps) {
  const { businessConfig } = d;
  const pricing = { computePrices: d.computePrices };
  const cfg = { BUILD_ID: d.buildId };
  app.post("/api/price", async (req) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const result = await pricing.computePrices(payload);
    req.log.info({ offerType: payload.activeOffer || "bu", total: result?.total, markup: result?.markup }, "price computed");
    return result;
  });

  app.get("/api/price/inputs", async () => {
    const config: Record<string, unknown> = {};
    for (const def of CONFIG_SCHEMA) config[def.key] = businessConfig.get(def.key);
    const products = await Product.find({}, { _id: 0, productId: 1, price: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, source: 1 }).lean();
    return { buildId: cfg.BUILD_ID, config, products: products as unknown as PriceInputsResponse["products"] } satisfies PriceInputsResponse;
  });
}
