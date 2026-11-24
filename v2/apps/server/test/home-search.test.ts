// Hauptmenü „Öffnen“ (React): GET /api/offers/v2/search and /api/offers/v2/by-deal/:dealId give the
// rows of today's search-all / by-deal (same matching, same order) in the lean shape; a failure is
// coded and recorded without the search words. Plus the import of a stored offer into a deal's draft
// (the way the React app opens a result). In-memory MongoDB; the test documents are the recording's
// (v2/scripts/capture-home-entwurf.cjs, made-up customers).
import { createRequire } from "node:module";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { homeSearchRow } from "@oc/api-contract";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { Draft } from "../src/platform/models.js";
import { migrateErrorEventIndexes } from "../src/platform/error-events.js";
import { registerOffersRead } from "../src/modules/offers/read.js";
import { registerDealDrafts } from "../src/modules/deal-drafts/routes.js";
import { migrateDealDraftIndexes } from "../src/modules/deal-drafts/store.js";

const require = createRequire(import.meta.url);
const { seedDocs } = require("../../../scripts/capture-home-entwurf.cjs");
const bases = require("../../web/test/fixtures/versand-senden.json").bases;
const recorded = require("../../web/test/fixtures/home-entwurf.json");
const SECRET = "home-search-test-secret-0123456789";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
const auth = { authorization: `Bearer ${createToken("ao@test.local", SECRET)}` };
const get = (url: string) => app.inject({ url, headers: auth });
const events = () => mongoose.connection.db!.collection("error_events").find({}, { projection: { _id: 0 } }).toArray();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await migrateDealDraftIndexes();
  await migrateErrorEventIndexes();
  const docs = seedDocs(bases);
  const oid = (d: any) => ({ ...d, _id: new mongoose.Types.ObjectId(d._id) });
  await mongoose.connection.db!.collection("drafts").insertMany(docs.drafts.map(oid));
  await mongoose.connection.db!.collection("offers").insertMany(docs.offers.map(oid));
  app = await buildApp(cfg, { register: async (a) => { await registerOffersRead(a); await registerDealDrafts(a); } });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });

describe("GET /api/offers/v2/search", () => {
  const searches = recorded.scenarios.filter((s: any) => s.kind === "search" && s.answer);
  it.each(searches.map((s: any) => [s.name, s]))("%s: today's rows, same order", async (_n, s: any) => {
    const lean = await get(`/api/offers/v2/search?q=${encodeURIComponent(s.q)}&limit=20`);
    expect(lean.statusCode).toBe(200);
    const today = await get(`/api/offers/search-all?q=${encodeURIComponent(s.q)}&limit=20`);
    expect(lean.json().rows).toEqual(today.json().map((r: any) => homeSearchRow(r, "search")));
    // and what today's page showed in the recording
    expect(lean.json().rows.map((r: any) => r.title)).toEqual(s.view.rows.map((r: any) => r.title));
  });
  it("the lean row carries no customer data beyond what a row shows; the deal number of the document", async () => {
    const r = (await get("/api/offers/v2/search?q=ANG2026-1105")).json().rows;
    expect(r).toEqual([{ kind: "offer", id: expect.any(String), title: "ANG2026-1105-100000", offerType: "bu", ref: "ANG2026-1105-100000", offerNumber: "ANG2026-1105-100000", at: "2026-11-05T09:00:00.000Z", snippet: "", deal: "70015" }]);
  });
  it("empty text: no rows, no query", async () => {
    expect((await get("/api/offers/v2/search?q=%20%20")).json()).toEqual({ rows: [] });
  });
  it("a failure: coded answer, recorded without the search words", async () => {
    const spy = vi.spyOn(Draft, "find").mockImplementationOnce(() => { throw new Error("db down"); });
    const res = await get("/api/offers/v2/search?q=Muster");
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatchObject({ code: "OFFER_SEARCH_FAILED", requestId: expect.any(String) });
    await vi.waitFor(async () => expect((await events()).length).toBe(1));
    const [e] = await events();
    expect(e).toMatchObject({ area: "home.search", code: "OFFER_SEARCH_FAILED", severity: "error" });
    expect(JSON.stringify(e)).not.toMatch(/Muster/);
  });
});

describe("GET /api/offers/v2/by-deal/:dealId", () => {
  it("today's deal-dialog rows (name of the customer as title)", async () => {
    const res = await get("/api/offers/v2/by-deal/70011");
    expect(res.json().rows).toEqual([expect.objectContaining({ kind: "draft", title: "Erika Muster", offerType: "bu", ref: "", deal: "70011" })]);
    const today = (await get("/api/offers/by-deal/70011")).json();
    expect(res.json().rows).toEqual(today.map((r: any) => homeSearchRow(r, "deal")));
  });
  it("not a deal number → 400", async () => {
    expect((await get("/api/offers/v2/by-deal/abc")).statusCode).toBe(400);
  });
});

describe("opening a result = import into the deal's draft", () => {
  const post = (url: string, body: object) => app.inject({ method: "POST", url, headers: auth, payload: body });
  it("a stored offer: copied with its number; a stale base revision is refused", async () => {
    const r = await post("/api/deals/70016/draft/import", { kind: "offer", offerNumber: "ANG2026-1106-100000", baseRevision: 0 });
    expect(r.statusCode).toBe(200);
    const d = (await get("/api/deals/70016/draft")).json();
    expect(d).toMatchObject({ offerType: "bwt", revision: 1, payload: { offerNumber: "ANG2026-1106-100000", auftragId: "70016" } });
    const again = await post("/api/deals/70016/draft/import", { kind: "offer", offerNumber: "ANG2026-1106-100000", baseRevision: 0 });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("REVISION_CONFLICT");
  });
  it("a draft under a temporary key; an hms draft is refused (not a React type)", async () => {
    const id = String((await Draft.findOne({ offerType: "hl" }).lean())!._id);
    expect((await post("/api/deals/t-0123456789abcdef01234567/draft/import", { kind: "draft", id, baseRevision: 0 })).statusCode).toBe(200);
    const hms = String((await Draft.findOne({ offerType: "hms" }).lean())!._id);
    expect((await post("/api/deals/70099/draft/import", { kind: "draft", id: hms, baseRevision: 0 })).json().error.code).toBe("UNSUPPORTED_TYPE");
  });
  it("a Winterdienst offer is taken over like the other React types (U-066)", async () => {
    const r = await post("/api/deals/70098/draft/import", { kind: "offer", offerNumber: "ANG2026-1107-100000", baseRevision: 0 });
    expect(r.statusCode).toBe(200);
    expect((await get("/api/deals/70098/draft")).json()).toMatchObject({ offerType: "wd", revision: 1 });
  });
});
