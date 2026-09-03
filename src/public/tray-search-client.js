// Offline fallback for the Duschwanne suggestion boxes when
// GET /api/trays/suggest is unreachable. Runs the exact same
// tray-search-core.js rules the server route uses, against the cached
// product snapshot from /api/price/inputs (see pricing-client.js for the
// identical pattern this mirrors — one rules file, two callers, so a local
// result can never disagree with what the server would have said).
import {
  matchesTrayDims,
  matchesTraySeriesAndSource,
  scoreAndRank,
} from "/logic/tray-search-core.js";
import { loadInputs } from "./pricing-cache.js";

// Returns the same shape as GET /api/trays/suggest, plus `_local: true` so
// callers can tell a cached result from a live one — same convention as
// pricing-client.js's computePricesLocally().
export async function suggestTraysLocally({ w, l, h, series, source, budget }) {
  const inputs = await loadInputs();
  if (!inputs) return null;

  const candidates = (inputs.products || []).filter(
    (p) =>
      matchesTraySeriesAndSource(p, { series, source }) &&
      matchesTrayDims(p, { w, l, h }),
  );

  const badoluxDiscount = inputs.config?.BU_BADOLUX_DISCOUNT ?? 0.20;
  const results = scoreAndRank(candidates, { w, l, h, budget }, badoluxDiscount);
  return { input: { w, l, h }, results, _local: true };
}
