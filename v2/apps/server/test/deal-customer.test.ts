// GET /api/deals/:dealId/customer (React Kundendaten): one Bitrix batch per deal load, the single
// calls of today's route as fallback, a shared in-flight load and a 60 s copy per deal, and every
// failure coded and stored in `error_events` without customer data. Bitrix is a local recording
// stub (helpers/bitrix-stub.ts) with invented data; its call list counts the HTTP requests.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { BitrixClient, isRateLimited } from "../src/integrations/bitrix.js";
import { registerBitrixRead, registerDealCustomer } from "../src/modules/bitrix/index.js";
import { dealCustomerBatch, fromBatch } from "../src/modules/bitrix/customer.js";
import { migrateErrorEventIndexes, sanitise } from "../src/platform/error-events.js";
import { BitrixStub, batchOf, type Handler } from "./helpers/bitrix-stub.js";

const SECRET = "deal-customer-test-secret-0123456789";
const USER = "ap@example.test";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
let stub: BitrixStub;
let clock = Date.parse("2026-11-18T10:00:00.000Z");

// ---- invented Bitrix data ----
const CONTACTS: Record<string, any> = {
  "7001": { ID: "7001", HONORIFIC: "HNR_DE_1", NAME: "Erika", LAST_NAME: "Testkundin", PHONE: [{ VALUE: "+49 9281 000001" }], EMAIL: [{ VALUE: "erika@example.test" }], ADDRESS: "Probeweg 3", ADDRESS_CITY: "Teststadt", ADDRESS_POSTAL_CODE: "95000", ADDRESS_REGION: "Bayern" },
  "7002": { ID: "7002", NAME: "Max", LAST_NAME: "Beispiel", ADDRESS: "", ADDRESS_CITY: null, ADDRESS_POSTAL_CODE: " " }, // address only in the requisite
  "7003": { ID: "7003", NAME: "Ohne", LAST_NAME: "Adresse" }, // no address anywhere
};
const DEALS: Record<string, any> = {
  "4711": { ID: "4711", TITLE: "Badumbau Test", CONTACT_ID: "7001", UF_CRM_1791270927983: "8540" },
  "4712": { ID: "4712", TITLE: "Mit Requisit", CONTACT_ID: "7002" },
  "4713": { ID: "4713", TITLE: "Ohne Adresse", CONTACT_ID: "7003", UF_CRM_1791270927983: "8542" },
  "4714": { ID: "4714", TITLE: "Ohne Kontakt", CONTACT_ID: "0" },
};
// switches per test
const mode: { dealFails?: string; contactFailsInBatch?: boolean; limitedTimes?: number; batchRefused?: boolean; batchLimitedInside?: number; malformed?: boolean } = {};
const H: Record<string, Handler> = {
  "crm.deal.get": (p) => {
    const id = p.get("id") ?? "";
    if (mode.dealFails === id) return { error: "INTERNAL_SERVER_ERROR", error_description: "Internal server error" };
    return DEALS[id] ? { result: structuredClone(DEALS[id]) } : { error: "", error_description: "Not found" };
  },
  "crm.contact.get": (p) => {
    const id = p.get("id") ?? "";
    if (!id || id === "0") return { error: "", error_description: "ID is not defined or invalid." };
    return CONTACTS[id] ? { result: structuredClone(CONTACTS[id]) } : { error: "", error_description: "Not found" };
  },
  "crm.requisite.list": (p) => ({ result: p.get("filter[ENTITY_ID]") === "7002" ? [{ ID: "501" }] : [] }),
  // without a requisite id Bitrix would list addresses of others: the route must never use them
  "crm.address.list": (p) => ({ result: p.get("filter[ENTITY_ID]") === "501" ? [{ TYPE_ID: "1", ENTITY_TYPE_ID: "8", ENTITY_ID: "501", ADDRESS_1: " Reqstr. 5 ", POSTAL_CODE: "20000", CITY: "Ort2" }]
    : [{ TYPE_ID: "1", ENTITY_TYPE_ID: "8", ENTITY_ID: "999", ADDRESS_1: "Fremde Straße 1", POSTAL_CODE: "99999", CITY: "Fremdort" }] }),
};
const inner = batchOf(H);
const HANDLERS: Record<string, Handler> = {
  ...H,
  batch: (p, a) => {
    if (mode.limitedTimes && mode.limitedTimes-- > 0) return { __status: 503, body: { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" } };
    if (mode.batchRefused) return { __status: 401, body: { error: "insufficient_scope", error_description: "" } };
    if (mode.malformed) return { result: "kaputt" };
    const out: any = inner(p, a);
    if (mode.batchLimitedInside && mode.batchLimitedInside-- > 0) out.result.result_error = { contact: { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" } };
    if (mode.contactFailsInBatch) {
      out.result.result_error = { contact: { error: "INTERNAL_SERVER_ERROR", error_description: "Internal server error" } };
      delete out.result.result.contact;
    }
    return out;
  },
};

const auth = { authorization: `Bearer ${createToken(USER, SECRET)}` };
const get = (url: string) => app.inject({ url, headers: auth });
const bitrixRequests = () => stub.take("v2").map((c) => c.method);
const events = () => mongoose.connection.db!.collection("error_events").find({}, { projection: { _id: 0 } }).toArray();
const settle = () => new Promise((r) => setTimeout(r, 30)); // the error record is written without waiting

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await migrateErrorEventIndexes();
  stub = new BitrixStub(HANDLERS);
  await stub.start();
  const bx = new BitrixClient({ baseUrl: stub.base("v2"), minGapMs: 0, retryDelayMs: 1, logFailure: async () => {} });
  app = await buildApp(cfg, { register: async (a) => { await registerBitrixRead(a, bx); await registerDealCustomer(a, bx, { now: () => clock }); } });
}, 120000);
afterAll(async () => { await app?.close(); await stub?.stop(); await disconnectDb(); await mongod?.stop(); });
beforeEach(async () => {
  for (const k of Object.keys(mode)) delete (mode as any)[k];
  clock += 3_600_000; // every test starts with nothing kept
  stub.take("v2");
  await mongoose.connection.db!.collection("error_events").deleteMany({});
});

describe("GET /api/deals/:dealId/customer — one Bitrix request per deal load", () => {
  it("contact with address: one batch; the same data as today's route (which needs 2 single calls)", async () => {
    const r = await get("/api/deals/4711/customer");
    expect(r.statusCode).toBe(200);
    expect(bitrixRequests()).toEqual(["batch"]);
    expect(r.json()).toEqual({
      dealId: "4711", dealTitle: "Badumbau Test", source: "batch", loadedAt: new Date(clock).toISOString(),
      customer: { bitrixContactId: "7001", customerNumber: "7001", salutation: "Frau", firstName: "Erika", lastName: "Testkundin", company: "", email: "erika@example.test", phone: "+49 9281 000001", street: "Probeweg 3", city: "Teststadt", postalCode: "95000", state: "Bayern", country: "" },
      vermieter: { erforderlich: true, liegtVor: false },
    });
    const old = await get("/api/bitrix/deal/4711");
    expect(bitrixRequests()).toEqual(["crm.deal.get", "crm.contact.get"]);
    expect(old.json().contact.ADDRESS).toBe("Probeweg 3");
  });

  it("contact whose address is only in the requisite: one batch (today: 4 calls), the requisite's address", async () => {
    const r = await get("/api/deals/4712/customer");
    expect(bitrixRequests()).toEqual(["batch"]);
    expect(r.json().customer).toMatchObject({ street: "Reqstr. 5", postalCode: "20000", city: "Ort2" });
    const old = await get("/api/bitrix/deal/4712");
    expect(bitrixRequests()).toEqual(["crm.deal.get", "crm.contact.get", "crm.requisite.list", "crm.address.list"]);
    expect(old.json().contact).toMatchObject({ ADDRESS: "Reqstr. 5", ADDRESS_POSTAL_CODE: "20000", ADDRESS_CITY: "Ort2" });
  });

  it("contact without any address: one batch (today: 3 calls); never an address of another requisite", async () => {
    const r = await get("/api/deals/4713/customer");
    expect(bitrixRequests()).toEqual(["batch"]);
    expect(r.json().customer).toMatchObject({ street: "", postalCode: "", city: "" });
    expect(JSON.stringify(r.json())).not.toContain("Fremd");
    await get("/api/bitrix/deal/4713");
    expect(bitrixRequests()).toEqual(["crm.deal.get", "crm.contact.get", "crm.requisite.list"]);
  });

  it("deal without contact: a normal answer (customer null), one batch (today: 1 call), nothing recorded", async () => {
    const r = await get("/api/deals/4714/customer");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ customer: null, source: "batch" });
    expect(bitrixRequests()).toEqual(["batch"]);
    await settle();
    expect(await events()).toEqual([]);
  });

  it("the batch as sent: four commands, later ones refer to earlier answers, halt=0, POST", async () => {
    await get("/api/deals/4711/customer");
    const sent = stub.take("v2")[0]!;
    expect(sent.http).toBe("POST");
    const p = new URLSearchParams(sent.params);
    expect(p.get("halt")).toBe("0");
    expect(Object.fromEntries([...p].filter(([k]) => k.startsWith("cmd[")))).toEqual({
      "cmd[deal]": "crm.deal.get?id=4711",
      "cmd[contact]": "crm.contact.get?id=$result[deal][CONTACT_ID]",
      "cmd[requisite]": "crm.requisite.list?filter[ENTITY_TYPE_ID]=3&filter[ENTITY_ID]=$result[deal][CONTACT_ID]&select[0]=ID&order[ID]=ASC",
      "cmd[address]": "crm.address.list?filter[ENTITY_TYPE_ID]=8&filter[ENTITY_ID]=$result[requisite][0][ID]&select[0]=*",
    });
    expect(dealCustomerBatch("4711")).toEqual(Object.fromEntries([...p].filter(([k]) => k.startsWith("cmd[")).map(([k, v]) => [k.slice(4, -1), v])));
  });
});

describe("fallback, rate limit, errors", () => {
  it("a command inside the batch failed → the single calls once, recorded as a warning", async () => {
    mode.contactFailsInBatch = true;
    const r = await get("/api/deals/4711/customer");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ source: "fallback", customer: { firstName: "Erika" } });
    expect(bitrixRequests()).toEqual(["batch", "crm.deal.get", "crm.contact.get"]);
    await settle();
    const [e] = await events();
    expect(e).toMatchObject({ area: "kundendaten.bitrix-load", code: "BITRIX_BATCH_PARTIAL", severity: "warn", dealId: "4711", user: USER, fallbackUsed: true, upstream: { method: "batch", errorCode: "INTERNAL_SERVER_ERROR" } });
    expect(e!.requestId).toBe(r.headers["x-request-id"]);
  });

  it("batch refused (no permission) or a malformed answer → the single calls once", async () => {
    mode.batchRefused = true;
    expect((await get("/api/deals/4712/customer")).json()).toMatchObject({ source: "fallback", customer: { street: "Reqstr. 5" } });
    expect(bitrixRequests()).toEqual(["batch", "crm.deal.get", "crm.contact.get", "crm.requisite.list", "crm.address.list"]);
    clock += 120_000; mode.batchRefused = false; mode.malformed = true;
    expect((await get("/api/deals/4712/customer")).json()).toMatchObject({ source: "fallback" });
    expect(bitrixRequests()[0]).toBe("batch");
    await settle();
    expect((await events()).map((e) => e.code)).toEqual(["BITRIX_BATCH_MALFORMED", "BITRIX_BATCH_MALFORMED"]);
  });

  it("rate limit (HTTP 503 QUERY_LIMIT_EXCEEDED) → retried with back-off, then the answer", async () => {
    mode.limitedTimes = 2;
    const r = await get("/api/deals/4711/customer");
    expect(r.statusCode).toBe(200);
    expect(bitrixRequests()).toEqual(["batch", "batch", "batch"]);
    await settle();
    expect(await events()).toEqual([]);
  });

  it("rate limit reported INSIDE the batch counts the same (retried, no fallback)", async () => {
    mode.batchLimitedInside = 1;
    expect((await get("/api/deals/4711/customer")).json()).toMatchObject({ source: "batch" });
    expect(bitrixRequests()).toEqual(["batch", "batch"]);
  });

  it("rate limit exhausted → BITRIX_RATE_LIMITED to the user, a stored record without customer data, nothing kept", async () => {
    mode.limitedTimes = 99;
    const r = await get("/api/deals/4711/customer");
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ error: { code: "BITRIX_RATE_LIMITED", message: expect.stringMatching(/Bitrix ist gerade ausgelastet/), requestId: r.headers["x-request-id"] } });
    expect(bitrixRequests()).toEqual(["batch", "batch", "batch", "batch", "batch"]); // 1 + 4 retries, no fallback
    await settle();
    const all = await events();
    expect(all).toHaveLength(1);
    const e = all[0]!;
    expect(Object.keys(e).sort()).toEqual(["area", "at", "code", "dealId", "durationMs", "fallbackUsed", "message", "requestId", "severity", "upstream", "user"]);
    expect(e).toMatchObject({ code: "BITRIX_RATE_LIMITED", severity: "error", dealId: "4711", user: USER, fallbackUsed: false, upstream: { method: "batch", httpStatus: 503, errorCode: "QUERY_LIMIT_EXCEEDED", attempts: 5 } });
    const text = JSON.stringify(e);
    for (const personal of ["Erika", "Testkundin", "Probeweg", "Teststadt", "95000", "erika@example.test", "9281"]) expect(text).not.toContain(personal);
    mode.limitedTimes = 0;
    expect((await get("/api/deals/4711/customer")).statusCode).toBe(200); // the failure was not kept
  });

  it("deal unknown → DEAL_NOT_FOUND (404); a bad number → INVALID_DEAL_ID without asking Bitrix", async () => {
    const r = await get("/api/deals/4799/customer");
    expect([r.statusCode, r.json().error.code]).toEqual([404, "DEAL_NOT_FOUND"]);
    const bad = await get("/api/deals/abc/customer");
    expect([bad.statusCode, bad.json().error.code]).toEqual([400, "INVALID_DEAL_ID"]);
    expect(bitrixRequests()).toEqual(["batch"]);
  });

  it("Bitrix unreachable → BITRIX_UNAVAILABLE (502), recorded; the old routes answer as before", async () => {
    const dead = new BitrixClient({ baseUrl: "http://127.0.0.1:9/rest/0/x", minGapMs: 0, logFailure: async () => {} });
    const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
    const a2 = await buildApp(cfg, { register: (a) => registerDealCustomer(a, dead).then(() => undefined) });
    const r = await a2.inject({ url: "/api/deals/4711/customer", headers: auth });
    expect([r.statusCode, r.json().error.code]).toEqual([502, "BITRIX_UNAVAILABLE"]);
    await a2.close();
    await settle();
    expect((await events()).map((e) => [e.code, e.upstream?.method])).toEqual([["BITRIX_UNAVAILABLE", "batch"]]);
  });
});

describe("one load shared, kept 60 s", () => {
  it("a second ask within 60 s makes no Bitrix request; after 60 s one again", async () => {
    await get("/api/deals/4711/customer");
    await get("/api/deals/4711/customer");
    expect(bitrixRequests()).toEqual(["batch"]);
    clock += 61_000;
    await get("/api/deals/4711/customer");
    expect(bitrixRequests()).toEqual(["batch"]);
  });

  it("requests arriving together share one Bitrix request", async () => {
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => get("/api/deals/4712/customer")));
    expect(all.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(bitrixRequests()).toEqual(["batch"]);
  });

  it("fresh=1 asks Bitrix again", async () => {
    await get("/api/deals/4711/customer");
    await get("/api/deals/4711/customer?fresh=1");
    expect(bitrixRequests()).toEqual(["batch", "batch"]);
  });
});

describe("rules", () => {
  it("the batch answer is read like today's single answers", () => {
    const deal = { ID: "1", CONTACT_ID: "2" };
    expect(fromBatch({ result: { deal, contact: { ID: "2", ADDRESS: "A" } }, result_error: {} }).contact.ADDRESS).toBe("A");
    expect(fromBatch({ result: { deal: { ID: "1", CONTACT_ID: null } }, result_error: { contact: { error: "x" } } }).contact).toBeNull();
    expect(fromBatch({ result: {}, result_error: { deal: { error: "", error_description: "Not found" } } }).deal).toBeNull();
    expect(() => fromBatch({ result: { deal }, result_error: { contact: { error: "INTERNAL_SERVER_ERROR" } } })).toThrow(/contact/);
    expect(() => fromBatch({ result: { deal, contact: { ID: "3" } }, result_error: {} })).toThrow(/not the deal's/);
  });
  it("rate limit is recognised by text, code or HTTP 503", () => {
    expect([isRateLimited(new Error("Too many requests")), isRateLimited({ bitrixCode: "QUERY_LIMIT_EXCEEDED" }), isRateLimited({ status: 503 }), isRateLimited(new Error("x"))]).toEqual([true, true, true, false]);
  });
  it("the record keeps ids only: a wrong deal id or a long message is cut, unknown fields are dropped", () => {
    const r = sanitise({ area: "kundendaten.bitrix-load", code: "BITRIX_TIMEOUT", message: "x".repeat(500), dealId: "Erika Testkundin", upstream: { method: "crm.deal.get?name=Erika", errorCode: "a b" }, ...({ name: "Erika" } as object) } as never, { requestId: "r1", user: USER });
    expect(r.message).toHaveLength(300);
    expect(r).not.toHaveProperty("dealId");
    expect(r).not.toHaveProperty("upstream");
    expect(JSON.stringify(r)).not.toContain("Erika");
  });
});
