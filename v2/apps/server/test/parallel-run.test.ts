// Phase 8 parallel run (cut-over gate "same inputs → same prices"): every offer and draft of a
// LOCAL COPY of the production data is priced by the legacy engine and by v2 with identical
// inputs (catalog, settings, vigor prices from the same copy). Read-only. Never runs in CI:
//   OC_PARALLEL_RUN_URI=mongodb://127.0.0.1:27018 npx vitest run test/parallel-run.test.ts
// The report contains only counts and document ids — no customer data (org rule).
import fs from "node:fs";
import { MongoClient } from "mongodb";
import { describe, expect, it } from "vitest";
// @ts-expect-error untyped legacy module
import legacyCore from "../../../../src/logic/pricing-core.js";
import { createPricingEngine } from "@oc/pricing";
import { BusinessConfig } from "../src/business-config.js";
import { isLocalMongo } from "@oc/config";

const URI = process.env.OC_PARALLEL_RUN_URI;
const REPORT = process.env.OC_PARALLEL_RUN_REPORT ?? "parallel-run-report.json";

function firstDiff(a: unknown, b: unknown, p = ""): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
      const d = firstDiff((a as any)[k], (b as any)[k], p ? `${p}.${k}` : k);
      if (d) return d;
    }
  }
  return p || "(root)";
}

describe.skipIf(!URI)("parallel run on the local data copy", () => {
  it("legacy and v2 compute the same price for every saved offer and draft", async () => {
    if (!isLocalMongo(URI!)) throw new Error("parallel run only against a LOCAL copy (ADR 001)");
    const client = await MongoClient.connect(URI!, { readPreference: "secondaryPreferred" });
    try {
      const db = client.db("KonfiguratorDB");
      const products = new Map((await db.collection("Products").find({}).toArray()).map((p: any) => [p.productId, p]));
      const vigorDocs: any[] = await client.db("vigor").collection("products").find({}, { projection: { articleNumber: 1, netPrice: 1, lastSeenAt: 1 } }).toArray();
      const overrides: any[] = await db.collection("appconfigs").find({}).toArray();
      const cfg = new BusinessConfig(async () => overrides.map((o) => ({ key: o.key, value: o.value })));
      await cfg.init({ warn() {} } as any);

      const ProductModel = {
        find: (q: any) => ({ lean: async () => (q?.productId?.$in || []).map((id: string) => products.get(id)).filter(Boolean) }),
        findOne: (q: any) => ({ lean: async () => products.get(q?.productId) ?? null }),
      };
      const fetchVigourNetPrices = async (ids: string[]) => {
        const best = new Map<string, { net: number; seen: number }>();
        for (const d of vigorDocs) {
          if (!ids.includes(d.articleNumber)) continue;
          const net = Number(d.netPrice); if (!(net > 0)) continue;
          const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() || 0 : 0;
          const prev = best.get(d.articleNumber);
          if (!prev || seen >= prev.seen) best.set(d.articleNumber, { net, seen });
        }
        return new Map([...best].map(([k, v]) => [k, v.net]));
      };
      const deps = { cfg, fetchVigourNetPrices } as any; // no Offer/Draft lookup: price everything fresh
      const legacy = legacyCore(ProductModel, deps);
      const v2 = createPricingEngine(ProductModel as any, deps);

      const docs: Array<{ id: string; kind: string; payload: any }> = [];
      for (const o of await db.collection("offers").find({}, { projection: { offerNumber: 1, payload: 1 } }).toArray()) docs.push({ id: String(o.offerNumber || o._id), kind: "offer", payload: o.payload });
      for (const d of await db.collection("drafts").find({}, { projection: { payload: 1 } }).toArray()) docs.push({ id: String(d._id), kind: "draft", payload: d.payload });

      const report = { at: new Date().toISOString(), total: docs.length, same: 0, bothFailed: 0, different: [] as Array<{ id: string; kind: string; at: string }>, skipped: 0 };
      for (const doc of docs) {
        if (!doc.payload || typeof doc.payload !== "object") { report.skipped++; continue; }
        const run = async (engine: any) => {
          try { return { ok: true, v: JSON.parse(JSON.stringify(await engine.computePrices(structuredClone(doc.payload)))) }; }
          catch (e) { return { ok: false, v: String((e as Error)?.message ?? e) }; }
        };
        const [l, n] = [await run(legacy), await run(v2)];
        if (!l.ok && !n.ok && l.v === n.v) { report.bothFailed++; continue; }
        const d = firstDiff(l, n);
        if (!d) report.same++; else report.different.push({ id: doc.id, kind: doc.kind, at: d });
      }
      cfg.stop?.();
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      console.log(`[parallel-run] ${report.total} documents: ${report.same} same, ${report.bothFailed} fail identically, ${report.skipped} without payload, ${report.different.length} different → ${REPORT}`);
      expect(report.different).toEqual([]);
    } finally {
      await client.close();
    }
  }, 600000);
});
