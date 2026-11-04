// The TS port must reproduce the recorded golden master exactly (same fixtures the legacy
// engine is tested against in tests/golden/pricing.golden.test.js).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeFingerprint, createPricingEngine } from "../src/index.js";
import { cases, deps, ProductModel, roundTrip } from "./fixtures.js";

const engine = createPricingEngine(ProductModel, deps);
beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => { vi.restoreAllMocks(); });

describe("TS pricing port — golden master", () => {
  it("covers all priced types and both payers", () => {
    const groups = new Set(cases.map((c) => `${c.offerType}|${c.payer}`));
    for (const g of ["bu|KK", "bu|SZ", "bwt|KK", "bwt|SZ", "hl|KK", "bl|KK", "bl|SZ"]) expect(groups).toContain(g);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    const got = roundTrip(await engine.computePrices(structuredClone(c.payload)));
    expect(got).toEqual(c.expected);
  });

  it("fingerprint is stable", () => {
    for (const c of cases) expect(computeFingerprint(structuredClone(c.payload))).toBe(computeFingerprint(roundTrip(c.payload)));
  });
});
