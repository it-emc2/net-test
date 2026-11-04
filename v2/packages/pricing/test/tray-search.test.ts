// Differential test: legacy src/logic/tray-search-core.js vs the strict TS port, on seeded
// random tray catalogues and size requests (incl. missing axes, budget mode, odd values).
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import * as legacy from "../../../../src/logic/tray-search-core.js";
import * as ts from "../src/tray-search.js";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]!;
const SIZES = [70, 80, 90, 100, 110, 120, 140, 160, 170, 180];

function catalogue(r: () => number) {
  return Array.from({ length: 5 + Math.floor(r() * 25) }, (_, i) => ({
    productId: `${pick(r, ["SLA", "DW", "XX", "sla"])}${100 + i}`,
    source: pick(r, ["hassmann", "badolux", "Badolux", "", undefined]),
    widthCm: pick(r, [...SIZES, "90", null, undefined]),
    lengthCm: pick(r, [...SIZES, "120", null]),
    heightCm: pick(r, [2, 3, 4.5, 6, "3", null]),
    price: pick(r, [199, 349.9, 520, "410", null, undefined]),
  }));
}
const dim = (r: () => number) => (r() < 0.25 ? null : pick(r, SIZES));

describe("tray search: legacy JS vs strict TS (500 random scenarios)", () => {
  it("all functions agree", () => {
    const r = rng(0x7a7);
    for (let i = 0; i < 500; i++) {
      const docs = catalogue(r);
      const dims = { w: dim(r), l: dim(r), h: r() < 0.5 ? null : pick(r, [3, 4, 6]) };
      const budget = r() < 0.4;
      const series = pick(r, ["SLA", "DW", null]);
      const source = pick(r, ["badolux", "hassmann", null]);
      const disc = pick(r, [0.2, 0.15, 0]);
      const ctx = `scenario ${i}: ${JSON.stringify({ dims, budget, series, source, disc })}`;
      expect(ts.buildTrayDimFilter(dims), ctx).toEqual(legacy.buildTrayDimFilter(dims));
      for (const p of docs) {
        expect(ts.matchesTrayDims(p, dims), ctx).toBe(legacy.matchesTrayDims(p, dims));
        expect(ts.matchesTraySeriesAndSource(p, { series, source }), ctx).toBe(legacy.matchesTraySeriesAndSource(p, { series, source }));
        expect(ts.scoreTray(p, dims), ctx).toBe(legacy.scoreTray(p, dims));
        expect(ts.trayDisplayPrice(p, disc), ctx).toBe(legacy.trayDisplayPrice(p, disc));
      }
      expect(ts.scoreAndRank(structuredClone(docs), { ...dims, budget }, disc), ctx)
        .toEqual(legacy.scoreAndRank(structuredClone(docs), { ...dims, budget }, disc));
    }
  });
});
