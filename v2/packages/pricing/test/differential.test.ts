// Differential test: legacy JS engine (repo root src/logic/pricing-core.js) vs the TS port,
// on thousands of seeded mutations of the real anonymised payloads. Compares the result AND
// the (mutated) input payload afterwards, because input mutation is legacy behaviour too.
// Any divergence prints the case id + mutation for reproduction.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore, { computeFingerprint as legacyFingerprint } from "../../../../src/logic/pricing-core.js";
import { computeFingerprint, createPricingEngine } from "../src/index.js";
import { cases, deps, ProductModel, roundTrip } from "./fixtures.js";

const MUTATIONS_PER_CASE = Number(process.env.DIFF_MUTATIONS ?? 20);

// Small seeded PRNG (mulberry32) → reproducible runs.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Json = Record<string, unknown>;
function leafPaths(o: unknown, prefix: string[] = [], out: string[][] = []): string[][] {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && !Array.isArray(v)) leafPaths(v, [...prefix, k], out);
      else out.push([...prefix, k]);
    }
  }
  return out;
}
function setPath(o: Json, path: string[], v: unknown) {
  let cur: Json = o;
  for (const k of path.slice(0, -1)) cur = cur[k] as Json;
  const last = path[path.length - 1]!;
  if (v === undefined) delete cur[last]; else cur[last] = v;
}

const VALUE_POOL: unknown[] = ["", "0", "1", "2", "3", "8", "12,5", "-1", "abc", "on", "off", "ja", "nein",
  true, false, 0, 1, 7, 2.5, null, undefined, "Kassenkunde", "Selbstzahler", "KK", "sz"];

function mutate(payload: Json, r: () => number): { payload: Json; desc: string[] } {
  const p = structuredClone(payload);
  const desc: string[] = [];
  const paths = leafPaths(p).filter((x) => !String(x.at(-1)).toLowerCase().includes("sketch"));
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n && paths.length; i++) {
    const path = paths[Math.floor(r() * paths.length)]!;
    const v = VALUE_POOL[Math.floor(r() * VALUE_POOL.length)];
    setPath(p, path, v);
    desc.push(`${path.join(".")}=${JSON.stringify(v)}`);
  }
  if (r() < 0.15) { const t = ["bu", "bwt", "hl", "bl", "ah", "BU", "", "xx"][Math.floor(r() * 8)]; p.activeOffer = t; desc.push(`activeOffer=${t}`); }
  return { payload: p, desc };
}

const ts = createPricingEngine(ProductModel, deps);
const legacy = legacyCore(ProductModel, deps);
beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => { vi.restoreAllMocks(); });

async function outcome(fn: () => Promise<unknown>) {
  try { return { ok: true, value: roundTrip(await fn()) }; } catch (e) { return { ok: false, error: String((e as Error)?.message ?? e) }; }
}

describe(`differential: legacy JS vs TS port (${MUTATIONS_PER_CASE} mutations × ${cases.length} cases)`, () => {
  it.each(cases.map((c, i) => [c.id, c, i] as const))("%s", async (_id, c, i) => {
    const r = rng(0xc0ffee + i);
    for (let m = 0; m < MUTATIONS_PER_CASE; m++) {
      const { payload, desc } = mutate(c.payload, r);
      const a = structuredClone(payload);
      const b = structuredClone(payload);
      const [ra, rb] = [await outcome(() => legacy.computePrices(a)), await outcome(() => ts.computePrices(b))];
      const ctx = `${c.id} mutation#${m}: ${desc.join(", ")}`;
      expect(rb, ctx).toEqual(ra);
      expect(roundTrip(b), `${ctx} (input mutation)`).toEqual(roundTrip(a));
      expect(computeFingerprint(structuredClone(payload)), ctx).toBe(legacyFingerprint(structuredClone(payload)));
    }
  });
});
