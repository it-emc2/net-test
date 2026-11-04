// Pricing golden master: the engine must reproduce the recorded output for every
// real (anonymised) offer/draft in fixtures/pricing/cases.json — byte for byte after
// JSON round-trip. Fixtures are built by scripts/golden/build-pricing-golden.mjs from
// the local replica. A failure here means pricing behaviour changed: either a bug,
// or an intended rule change → rebuild the golden master and document it.
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pricingCore, { computeFingerprint } from "../../src/logic/pricing-core.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/pricing");
const load = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));
const cases = load("cases.json");
const products = load("products.json");
const vigor = load("vigor.json");
const config = load("config.json");

const cfg = { get: (k, fb) => (k in config ? config[k] : fb) };
const ProductModel = {
  find: (q) => ({ lean: async () => (q?.productId?.$in || []).map((id) => products[id]).filter(Boolean) }),
  findOne: (q) => ({ lean: async () => products[q?.productId] || null }),
};
const fetchVigourNetPrices = async (ids) =>
  new Map(ids.filter((id) => vigor[id] != null).map((id) => [id, vigor[id]]));

const { computePrices } = pricingCore(ProductModel, { cfg, fetchVigourNetPrices });

// Silence the engine's per-call info logging; keep errors visible.
let infoSpy;
beforeAll(() => { infoSpy = jest.spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => infoSpy.mockRestore());

describe("pricing golden master", () => {
  test("fixture set covers every priced offer type and both payers", () => {
    const groups = new Set(cases.map((c) => `${c.offerType}|${c.payer}`));
    for (const g of ["bu|KK", "bu|SZ", "bwt|KK", "bwt|SZ", "hl|KK", "bl|KK", "bl|SZ"]) {
      expect(groups).toContain(g);
    }
  });

  test.each(cases.map((c) => [c.id, c]))("%s", async (_id, c) => {
    const got = JSON.parse(JSON.stringify(await computePrices(structuredClone(c.payload))));
    expect(got).toEqual(c.expected);
  });

  test("fingerprint is stable for every fixture payload", () => {
    for (const c of cases) {
      const a = computeFingerprint(structuredClone(c.payload));
      const b = computeFingerprint(JSON.parse(JSON.stringify(c.payload)));
      expect(a).toBe(b);
    }
  });
});
