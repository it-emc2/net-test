import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportDealDraftsToLegacy, m002UnsetEmptyCustomerNumber } from "../src/migrations/index.js";

let mongod: MongoMemoryServer;
let client: mongoose.mongo.MongoClient;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new mongoose.mongo.MongoClient(mongod.getUri());
  await client.connect();
});
afterAll(async () => { await client?.close(); await mongod?.stop(); });

describe("migration 002 (B-1)", () => {
  it("dry run reports, changes nothing; real run unsets only exact empty strings; idempotent", async () => {
    const db = client.db("t");
    const k = db.collection("Kundendaten");
    await k.createIndex({ customerNumber: 1 }, { unique: true, sparse: true });
    await k.insertMany([
      { firstName: "A", customerNumber: "" },
      { firstName: "B", customerNumber: "C-1" },
      { firstName: "C" },
      { firstName: "D", customerNumber: " " }, // not exactly "" → untouched
    ]);
    const before = JSON.stringify(await k.find({}, { projection: { _id: 0 } }).sort({ firstName: 1 }).toArray());

    const dry = await m002UnsetEmptyCustomerNumber(db, true);
    expect(dry).toMatchObject({ dryRun: true, matched: 1, changed: 0 });
    expect(JSON.stringify(await k.find({}, { projection: { _id: 0 } }).sort({ firstName: 1 }).toArray())).toBe(before);

    const real = await m002UnsetEmptyCustomerNumber(db, false);
    expect(real).toMatchObject({ dryRun: false, matched: 1, changed: 1 });
    expect(await k.findOne({ firstName: "A" })).not.toHaveProperty("customerNumber");
    expect((await k.findOne({ firstName: "B" }))!.customerNumber).toBe("C-1");
    expect((await k.findOne({ firstName: "D" }))!.customerNumber).toBe(" ");

    // now several customers without number can coexist under the unique sparse index
    await k.insertOne({ firstName: "E" });
    expect(await k.countDocuments({ customerNumber: { $exists: false } })).toBe(3);

    expect(await m002UnsetEmptyCustomerNumber(db, false)).toMatchObject({ matched: 0, changed: 0 });
  });
});

describe("rollback export deal_drafts → drafts (CUTOVER.md §4.2)", () => {
  it("dry run only reports; apply inserts one legacy draft per deal revision; idempotent; deal drafts untouched", async () => {
    const db = client.db("rb");
    const at = new Date(2026, 10, 6, 14, 5, 9);
    await db.collection("deal_drafts").insertMany([
      { dealId: "4711", offerType: "bu", revision: 3, payload: { auftragId: "4711", offerNumber: "ANG2026-1106-140509", Kundendaten: { firstName: "Erika", lastName: "Müller-Lüdenscheidt" } }, updatedAt: at },
      { dealId: "4712", offerType: "ah", revision: 1, payload: { auftragId: "4712", Kundendaten: {} }, updatedAt: at },
    ]);
    await db.collection("drafts").insertOne({ name: "alt", offerType: "bu", payload: {}, clientSaveId: "dealdraft:4712:1" }); // already exported
    const snapshot = JSON.stringify(await db.collection("deal_drafts").find({}).toArray());

    expect(await exportDealDraftsToLegacy(db, true)).toMatchObject({ matched: 1, changed: 0 });
    expect(await db.collection("drafts").countDocuments()).toBe(1);

    expect(await exportDealDraftsToLegacy(db, false)).toMatchObject({ matched: 1, changed: 1 });
    const d: any = await db.collection("drafts").findOne({ clientSaveId: "dealdraft:4711:3" });
    expect(d).toMatchObject({ name: "ANG-BU-Erika-MüllerLüdenscheidt-06112026-140509", offerType: "bu", offerNumber: "ANG2026-1106-140509" });
    expect(d.payload.auftragId).toBe("4711"); // the old app's "Deal laden" finds it by deal

    expect(await exportDealDraftsToLegacy(db, false)).toMatchObject({ matched: 0, changed: 0 });
    expect(JSON.stringify(await db.collection("deal_drafts").find({}).toArray())).toBe(snapshot);
  });
});
