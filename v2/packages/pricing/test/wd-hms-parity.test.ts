// Price parity for Winterdienst and Hausmeister-Service: the pricing engine must answer every price
// request today's UI sent on the recorded pages (apps/web/test/fixtures/winterdienst.json, hausmeister.json, recorded by
// v2/scripts/capture-wd-hms.cjs against the running server) with the same answer — the empty shell
// (`_clientSideOffer`), whatever the page holds — and so must an offer as the React page writes it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyOffer } from "../../domain/src/index.js";
import { createPricingEngine } from "../src/index.js";
import { deps, ProductModel } from "./fixtures.js";

type F = Record<string, any>;
const load = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../apps/web/test/fixtures/${f}`, import.meta.url)), "utf8"));
const RECORDINGS: { type: "wd" | "hms"; scenarios: F[] }[] = [load("winterdienst.json"), load("hausmeister.json")];
const engine = createPricingEngine(ProductModel, deps);
beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => { vi.restoreAllMocks(); });

describe.each(RECORDINGS.map((r) => [r.type, r] as const))("%s: the same price as today", (type, rec) => {
  const asked = rec.scenarios.filter((s) => s.lastPrice);
  it("every scenario sent a price request today", () => { expect(asked.length).toBe(rec.scenarios.length); });
  it.each(asked.map((s) => [s.name, s] as const))("%s: the recorded request gets the recorded answer", async (_n, s) => {
    const got = await engine.computePrices(structuredClone(s.lastPrice.request));
    expect(JSON.parse(JSON.stringify(got))).toEqual(s.lastPrice.answer);
    expect(s.price).toEqual(s.lastPrice.answer); // the Kosten page was drawn from this answer
  });
  it.each(asked.map((s) => [s.name, s] as const))("%s: the offer as the React page stores it gets the same answer", async (_n, s) => {
    const offer = { ...emptyOffer(type, { date: "2026-11-24" }), [type]: s.stored };
    const got = await engine.computePrices(structuredClone(offer));
    expect(JSON.parse(JSON.stringify(got))).toEqual(s.lastPrice.answer);
  });
});
