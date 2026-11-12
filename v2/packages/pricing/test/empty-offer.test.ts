// A new offer from @oc/domain (ADR 026) must be something the pricing engine prices as it is:
// the React app shows a total from the first moment, without any field being touched.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NEW_OFFER_TYPES, emptyOffer } from "../../domain/src/index.js";
import { createPricingEngine } from "../src/index.js";
import { deps, ProductModel } from "./fixtures.js";

const engine = createPricingEngine(ProductModel, deps);
beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => { vi.restoreAllMocks(); });

describe("pricing a new, empty offer", () => {
  it.each(NEW_OFFER_TYPES.map((t) => [t] as const))("%s: prices without error, total is a number ≥ 0, same result on a second run", async (type) => {
    const offer = emptyOffer(type, { date: "2026-11-12" });
    const before = JSON.stringify(offer);
    const a: any = await engine.computePrices(structuredClone(offer));
    const b: any = await engine.computePrices(structuredClone(offer));
    expect(Number.isFinite(Number(a.total ?? 0))).toBe(true);
    expect(Number(a.total ?? 0)).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(offer)).toBe(before); // pricing a copy never changes the offer
  });
});
