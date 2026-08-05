// Runs the server's own pricing rules in the browser, against the cached
// inputs, so a technician without signal still sees a total.
//
// It imports src/logic/pricing-core.js — the identical file the server uses —
// rather than reimplementing anything. Two numbers that disagree would be
// worse than no number at all.
import pricingCore from "/logic/pricing-core.js";
import { loadInputs } from "./pricing-cache.js";

// pricing-core reads config through { get(key, fallback) }, matching
// configService: a cached value wins, otherwise the caller's fallback.
function cfgFrom(config) {
  return {
    get(key, fallback) {
      const v = config?.[key];
      return v === undefined || v === null ? fallback : v;
    },
  };
}

// pricing-core only ever asks the Product model for
//   .find({ productId: { $in: [...] } }).lean()
//   .findOne({ productId }).lean()
// so a Map lookup behind that shape is all it needs.
function productModelFrom(rows) {
  const byId = new Map((rows || []).map((r) => [r.productId, r]));
  return {
    find: (query) => ({
      lean: async () =>
        (query?.productId?.$in || []).map((id) => byId.get(id)).filter(Boolean),
    }),
    findOne: (query) => ({
      lean: async () => byId.get(query?.productId) || null,
    }),
  };
}

// Live vigor net prices need the network. An empty Map is exactly what
// pricing-core treats as "keep the configurator snapshot price" — the same
// fallback it uses server-side when the vigor DB is unreachable.
const noLivePrices = async () => new Map();

let cached = null; // { inputs, pricing }

async function getPricing() {
  const inputs = await loadInputs();
  if (!inputs) return null;
  if (cached?.inputs === inputs.cachedAt) return cached.pricing;

  const pricing = pricingCore(productModelFrom(inputs.products), {
    cfg: cfgFrom(inputs.config),
    fetchVigourNetPrices: noLivePrices,
  });
  cached = { inputs: inputs.cachedAt, pricing };
  return pricing;
}

// Returns the same shape as POST /api/price, plus `_local: true` so callers can
// tell a locally computed total from a server-confirmed one. Nothing may be
// frozen or locked on a `_local` result — see freezeCurrentPricing.
export async function computePricesLocally(payload) {
  const pricing = await getPricing();
  if (!pricing) return null;
  const result = await pricing.computePrices(payload);
  return { ...result, _local: true };
}

export async function hasPricingInputs() {
  return (await loadInputs()) !== null;
}
