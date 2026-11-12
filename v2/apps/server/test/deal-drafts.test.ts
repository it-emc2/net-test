// ADR 007: one draft per deal + revision history.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EJSON } from "bson";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { apply, diff } from "../src/modules/deal-drafts/patch.js";
import { registerDealDrafts } from "../src/modules/deal-drafts/routes.js";
import { migrateDealDraftIndexes, SNAPSHOT_EVERY } from "../src/modules/deal-drafts/store.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SECRET = "deal-draft-test-secret-0123456789";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
const auth = (email = "ao@test.local") => ({ authorization: `Bearer ${createToken(email, SECRET)}` });

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await migrateDealDraftIndexes();
  const ej = (f: string) => EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/" + f, "utf8")) as any[];
  await mongoose.connection.db!.collection("drafts").insertMany(ej("drafts.json").slice(0, 5));
  await mongoose.connection.db!.collection("offers").insertMany(ej("offers.json").slice(0, 5));
  app = await buildApp(cfg, { register: registerDealDrafts });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });

const put = (dealId: string, body: object, email?: string) => app.inject({ method: "PUT", url: `/api/deals/${dealId}/draft`, headers: auth(email), payload: body });
const get = (url: string) => app.inject({ url, headers: auth() });

describe("patch (diff/apply)", () => {
  it("apply(diff(a,b), a) = b for 2,000 random JSON pairs, input never mutated", () => {
    const r = rng(7);
    const val = (d: number): any => {
      const k = r();
      if (d > 3 || k < 0.35) return [null, true, false, 0, 1.5, "x", "", "on"][Math.floor(r() * 8)];
      if (k < 0.55) return Array.from({ length: Math.floor(r() * 4) }, () => val(d + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, (_, i) => [["a", "b", "c/d", "e~f", String(i)][Math.floor(r() * 5)]!, val(d + 1)]));
    };
    for (let i = 0; i < 2000; i++) {
      const a = val(0), b = val(0);
      const before = JSON.stringify(a);
      expect(apply(a, diff(a, b))).toEqual(b);
      expect(JSON.stringify(a)).toBe(before);
    }
  });
});

describe("deal drafts", () => {
  it("first save creates revision 1; GET returns it", async () => {
    const r = await put("1001", { offerType: "bu", payload: { Kundendaten: { lastName: "A" } }, baseRevision: 0 });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ revision: 1, changed: true });
    const g = await get("/api/deals/1001/draft");
    expect(g.json()).toMatchObject({ dealId: "1001", revision: 1, offerType: "bu", payload: { Kundendaten: { lastName: "A" } }, updatedBy: "ao@test.local" });
  });

  it("unchanged payload → no new revision", async () => {
    const r = await put("1001", { offerType: "bu", payload: { Kundendaten: { lastName: "A" } }, baseRevision: 1 });
    expect(r.json()).toMatchObject({ revision: 1, changed: false });
  });

  it("stale baseRevision → 409 with current revision (two devices)", async () => {
    await put("1001", { offerType: "bu", payload: { Kundendaten: { lastName: "B" } }, baseRevision: 1 });
    const stale = await put("1001", { offerType: "bu", payload: { Kundendaten: { lastName: "C" } }, baseRevision: 1 }, "rf@test.local");
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: "REVISION_CONFLICT", currentRevision: 2 });
    expect((await get("/api/deals/1001/draft")).json().payload.Kundendaten.lastName).toBe("B"); // not overwritten
  });

  it("concurrent first saves: exactly one wins", async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => put("2002", { offerType: "bwt", payload: { n: i }, baseRevision: 0 })));
    expect(rs.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.statusCode === 409)).toHaveLength(4);
  });

  it("history: every saved version is reconstructed exactly (incl. across snapshots)", async () => {
    const saved: any[] = [];
    const r = rng(42);
    let rev = 0;
    for (let i = 0; i < SNAPSHOT_EVERY * 2 + 5; i++) {
      const payload = { Kundendaten: { lastName: `K${i % 3}`, phone: r() < 0.5 ? "1" : undefined }, optional: { [`qty_${i % 4}`]: String(i) }, rabatt: { pct: Math.floor(r() * 10) } };
      const res = await put("3003", { offerType: "bu", payload: JSON.parse(JSON.stringify(payload)), baseRevision: rev });
      expect(res.statusCode).toBe(200);
      if (res.json().changed) { rev = res.json().revision; saved[rev] = JSON.parse(JSON.stringify(payload)); }
    }
    expect(rev).toBeGreaterThan(SNAPSHOT_EVERY);
    for (let v = 1; v <= rev; v++) {
      const got = await get(`/api/deals/3003/draft/revisions/${v}`);
      expect(got.json().payload, `rev ${v}`).toEqual(saved[v]);
    }
    const list = (await get("/api/deals/3003/draft/revisions")).json().revisions;
    expect(list[0].revision).toBe(rev);
    expect(list.at(-1).revision).toBe(1);
    expect(list[0].sections.length).toBeGreaterThan(0);
  });

  it("restore creates a NEW revision with the old content (history is never rewritten)", async () => {
    const before = (await get("/api/deals/1001/draft")).json();
    const res = await app.inject({ method: "POST", url: "/api/deals/1001/draft/restore", headers: auth(), payload: { revision: 1, baseRevision: before.revision } });
    expect(res.json()).toMatchObject({ revision: before.revision + 1, changed: true });
    expect((await get("/api/deals/1001/draft")).json().payload).toEqual({ Kundendaten: { lastName: "A" } });
    const list = (await get("/api/deals/1001/draft/revisions")).json().revisions;
    expect(list[0]).toMatchObject({ kind: "restore", note: "Version 1 wiederhergestellt" });
    expect(list).toHaveLength(before.revision + 1);
  });

  it("import copies a legacy draft/offer; the legacy document stays byte-identical", async () => {
    const db = mongoose.connection.db!;
    const legacyDraft = await db.collection("drafts").findOne({ offerType: { $in: ["bu", "bwt", "hl", "bl", "ah"] } });
    const legacyOffer = await db.collection("offers").findOne({ offerType: { $in: ["bu", "bwt", "hl", "bl", "ah"] } });
    const snapD = EJSON.stringify(legacyDraft), snapO = EJSON.stringify(legacyOffer);
    const r1 = await app.inject({ method: "POST", url: "/api/deals/4004/draft/import", headers: auth(), payload: { kind: "draft", id: String(legacyDraft!._id), baseRevision: 0 } });
    expect(r1.json()).toMatchObject({ revision: 1 });
    expect((await get("/api/deals/4004/draft")).json().payload).toEqual(JSON.parse(JSON.stringify(legacyDraft!.payload)));
    const r2 = await app.inject({ method: "POST", url: "/api/deals/4004/draft/import", headers: auth(), payload: { kind: "offer", offerNumber: legacyOffer!.offerNumber, baseRevision: 1 } });
    expect(r2.json()).toMatchObject({ revision: 2 });
    expect(EJSON.stringify(await db.collection("drafts").findOne({ _id: legacyDraft!._id }))).toBe(snapD);
    expect(EJSON.stringify(await db.collection("offers").findOne({ _id: legacyOffer!._id }))).toBe(snapO);
    expect((await get("/api/deals/4004/draft/revisions")).json().revisions[0].note).toMatch(/^Übernommen aus Angebot /);
  });

  it("validation: bad deal id, dropped offer types, missing fields, no auth", async () => {
    expect((await put("abc", { offerType: "bu", payload: {}, baseRevision: 0 })).statusCode).toBe(400);
    expect((await put("5005", { offerType: "hms", payload: {}, baseRevision: 0 })).statusCode).toBe(400);
    expect((await put("5005", { offerType: "bu", baseRevision: 0 })).statusCode).toBe(400);
    expect((await put("5005", { offerType: "bu", payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ url: "/api/deals/1001/draft" })).statusCode).toBe(401);
    expect((await get("/api/deals/9999/draft")).statusCode).toBe(404);
    expect((await get("/api/deals/1001/draft/revisions/999")).statusCode).toBe(404);
  });
});

describe("drafts started without a deal number (option A, owner 2026-11-06)", () => {
  const T = "t-" + "ab12".repeat(6); // temporary key
  const adopt = (dealId: string, from: string) => app.inject({ method: "POST", url: `/api/deals/${dealId}/draft/adopt`, headers: auth(), payload: { from } });

  it("saves and versions under a temporary key", async () => {
    expect((await put(T, { offerType: "bu", payload: { Kundendaten: { firstName: "Ohne" } }, baseRevision: 0 })).json()).toMatchObject({ revision: 1 });
    expect((await put(T, { offerType: "bu", payload: { Kundendaten: { firstName: "Ohne", lastName: "Deal" } }, baseRevision: 1 })).json()).toMatchObject({ revision: 2 });
    expect((await get(`/api/deals/${T}/draft`)).json().payload.Kundendaten.lastName).toBe("Deal");
    expect((await get(`/api/deals/${T}/draft/revisions`)).json().revisions).toHaveLength(2);
  });

  it("attach to a NEW deal: the temporary state becomes the deal's version 1, with a note", async () => {
    const r = await adopt("880001", T);
    expect(r.json()).toMatchObject({ dealId: "880001", revision: 1, changed: true });
    const d = (await get("/api/deals/880001/draft")).json();
    expect(d.payload.Kundendaten).toEqual({ firstName: "Ohne", lastName: "Deal" });
    expect((await get("/api/deals/880001/draft/revisions")).json().revisions[0].note).toContain("ohne Deal-Nummer begonnen");
    // the temporary draft is kept (marked), and attaching it to ANOTHER deal is refused
    expect((await mongoose.connection.db!.collection("deal_drafts").findOne({ dealId: T }))!.adoptedInto).toBe("880001");
    expect((await adopt("880002", T)).statusCode).toBe(409);
  });

  it("attach to a deal that already has a draft: added on top, nothing lost", async () => {
    const T2 = "t-" + "cd34".repeat(6);
    await put("880003", { offerType: "bu", payload: { Kundendaten: { firstName: "Vorher" } }, baseRevision: 0 });
    await put(T2, { offerType: "bu", payload: { Kundendaten: { firstName: "Neu" } }, baseRevision: 0 });
    expect((await adopt("880003", T2)).json()).toMatchObject({ revision: 2 });
    const v1 = (await get("/api/deals/880003/draft/revisions/1")).json();
    expect(v1.payload.Kundendaten.firstName).toBe("Vorher"); // the earlier state is still a version
  });

  it("rejects bad keys; unknown temporary draft → 404", async () => {
    expect((await adopt("880004", "t-123")).statusCode).toBe(400);
    expect((await adopt("t-" + "ab12".repeat(6), "t-" + "ab12".repeat(6))).statusCode).toBe(400); // target must be a deal number
    expect((await adopt("880004", "t-" + "ef56".repeat(6))).statusCode).toBe(404);
    expect((await get("/api/deals/t-xyz/draft")).statusCode).toBe(400);
  });
});
