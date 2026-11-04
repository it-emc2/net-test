// Shared golden-master fixtures + deterministic fake dependencies (same as tests/golden).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../../../tests/golden/fixtures/pricing/", import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(dir + f, "utf8"));

export interface GoldenCase {
  id: string;
  offerType: string;
  payer: string;
  payload: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export const cases: GoldenCase[] = load("cases.json");
export const products: Record<string, Record<string, unknown> | null> = load("products.json");
export const vigor: Record<string, number | null> = load("vigor.json");
export const config: Record<string, unknown> = load("config.json");

export const cfg = { get: (k: string, fb?: unknown) => (k in config ? config[k] : fb) };

export const ProductModel = {
  find: (q: { productId: { $in: string[] } }) => ({
    lean: async () => (q?.productId?.$in || []).map((id) => products[id]).filter(Boolean),
  }),
  findOne: (q: { productId: string }) => ({ lean: async () => products[q?.productId] ?? null }),
};

export const fetchVigourNetPrices = async (ids: string[]) =>
  new Map(ids.filter((id) => vigor[id] != null).map((id) => [id, vigor[id] as number]));

export const deps = { cfg, fetchVigourNetPrices };

export const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));
