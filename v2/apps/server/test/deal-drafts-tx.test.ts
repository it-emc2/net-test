// ADR 007 / phase 8: on a replica set the draft update and its revision record are ONE
// transaction. Real replica set in memory (Atlas runs replica sets too).
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DealDraft, DealDraftRevision, RevisionConflictError, migrateDealDraftIndexes, resetTransactionSupportCache, saveDealDraft, supportsTransactions,
} from "../src/deal-drafts/store.js";

let rs: MongoMemoryReplSet;
beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(rs.getUri(), { dbName: "tx-test" });
  resetTransactionSupportCache();
  await migrateDealDraftIndexes(); // creates the collections + unique indexes, like migration 001
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await rs?.stop();
  resetTransactionSupportCache();
});

describe("deal draft saves in a transaction", () => {
  it("detects transaction support on a replica set", async () => {
    expect(await supportsTransactions()).toBe(true);
  });

  it("a failing revision write rolls the draft back (both or neither)", async () => {
    const r1 = await saveDealDraft({ dealId: "7001", offerType: "bu", payload: { a: 1 }, baseRevision: 0, by: "t@test" });
    expect(r1).toMatchObject({ revision: 1, changed: true });
    const spy = vi.spyOn(DealDraftRevision, "create").mockRejectedValueOnce(new Error("disk full (simulated)"));
    await expect(saveDealDraft({ dealId: "7001", offerType: "bu", payload: { a: 2 }, baseRevision: 1, by: "t@test" })).rejects.toThrow("disk full");
    spy.mockRestore();
    const d: any = await DealDraft.findOne({ dealId: "7001" }).lean();
    expect([d.revision, d.payload]).toEqual([1, { a: 1 }]); // unchanged
    expect(await DealDraftRevision.countDocuments({ dealId: "7001" })).toBe(1);
    // and the next save works normally
    expect(await saveDealDraft({ dealId: "7001", offerType: "bu", payload: { a: 3 }, baseRevision: 1, by: "t@test" })).toMatchObject({ revision: 2 });
  });

  it("simultaneous saves from the same base: one wins, the others get a conflict; history stays consistent", async () => {
    await saveDealDraft({ dealId: "7002", offerType: "bu", payload: { n: 0 }, baseRevision: 0, by: "t@test" });
    const results = await Promise.allSettled([1, 2, 3, 4].map((n) =>
      saveDealDraft({ dealId: "7002", offerType: "bu", payload: { n }, baseRevision: 1, by: `u${n}@test` })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter((r) => r.status === "rejected" && (r as PromiseRejectedResult).reason instanceof RevisionConflictError);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(3);
    const d: any = await DealDraft.findOne({ dealId: "7002" }).lean();
    expect(d.revision).toBe(2);
    expect(await DealDraftRevision.countDocuments({ dealId: "7002" })).toBe(2);
  });
});
