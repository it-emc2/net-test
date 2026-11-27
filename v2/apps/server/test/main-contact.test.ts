// POST /api/bitrix/deal/:id/main-contact (Kundendaten, owner 2026-11-27): the exact outgoing Bitrix
// calls of both answers, against the recording stub (helpers/bitrix-stub.ts) with invented data.
//  - rename: the SAME contact, NAME + LAST_NAME only
//  - replace: a new contact (no phone / e-mail of the old contact copied) or an existing one (unchanged)
//    becomes primary; every linked contact stays; nothing written when ambiguous or the deal changed
//  - a failed timeline note does not fail the change; the server's copy of the deal's customer is dropped
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { User } from "../src/platform/models.js";
import { BitrixClient, buildQS } from "../src/integrations/bitrix.js";
import { dealWrites } from "../src/integrations/bitrix-deal.js";
import { registerDealCustomer, registerMainContact } from "../src/modules/bitrix/index.js";
import { BitrixStub, type Handler } from "./helpers/bitrix-stub.js";

const SECRET = "main-contact-test-secret-0123456789";
const USER = "ap@example.test";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
let stub: BitrixStub;

// ---- invented Bitrix data: the deal's contact is the daughter, the insured person is her mother ----
const OLD = { ID: "7001", NAME: "Max", LAST_NAME: "Muster", PHONE: [{ VALUE: "+49 9281 000001" }], EMAIL: [{ VALUE: "Max.Muster@Example.test" }], ADDRESS: "Probeweg 3", ADDRESS_POSTAL_CODE: "95000", ADDRESS_CITY: "Teststadt" };
const state: { dealContact: string; list: any[]; items: any[]; commentFails: boolean; addId: number } = { dealContact: "7001", list: [], items: [], commentFails: false, addId: 9001 };
const H: Record<string, Handler> = {
  "crm.deal.get": (p) => (p.get("id") === "4711" ? { result: { ID: "4711", TITLE: "Badumbau Test", CONTACT_ID: state.dealContact } } : { error: "", error_description: "Not found" }),
  "crm.contact.get": (p) => (p.get("id") === "7001" ? { result: structuredClone(OLD) } : { result: { ID: p.get("id"), NAME: "Andere", LAST_NAME: "Person" } }),
  "crm.contact.update": () => ({ result: true }),
  "crm.contact.list": () => ({ result: state.list }),
  "crm.contact.add": () => ({ result: state.addId }),
  "crm.deal.contact.items.get": () => ({ result: state.items }),
  "crm.deal.contact.items.set": () => ({ result: true }),
  "crm.timeline.comment.add": () => (state.commentFails ? { __status: 400, body: { error: "ACCESS_DENIED", error_description: "Access denied" } } : { result: 55 }),
  "crm.requisite.list": () => ({ result: [] }),
};

const auth = { authorization: `Bearer ${createToken(USER, SECRET)}` };
const post = (body: unknown, id = "4711") => app.inject({ method: "POST", url: `/api/bitrix/deal/${id}/main-contact`, headers: auth, payload: body as object });
const PERSON = { salutation: "Frau", firstName: "Erika", lastName: "Muster", street: "Probeweg 3", postalCode: "95000", city: "Teststadt", phone: "+49 9281 000001", email: "max.muster@example.test" };
/** the recorded calls: method and the parameters exactly as sent */
const calls = () => stub.take("v2").map((c) => ({ method: c.method, params: c.params }));
const sent = (method: string, params: Record<string, unknown>) => ({ method, params: buildQS(params) });
const logs = () => mongoose.connection.db!.collection("useractionlogs").find({}, { projection: { _id: 0, event: 1, dealId: 1 } }).toArray();
/** the user-action log is written without waiting (an entry of an earlier test may still arrive) */
const logged = (event: string) => vi.waitFor(async () => expect(await logs()).toEqual(expect.arrayContaining([{ event, dealId: "4711" }])), { timeout: 3000 });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await User.create({ email: USER, firstName: "Test", lastName: "Berater", name: "Test Berater", role: "user", active: true, passwordHash: "x" });
  stub = new BitrixStub(H);
  await stub.start();
  const bx = new BitrixClient({ baseUrl: stub.base("v2"), minGapMs: 0, retries: 0, retryDelayMs: 1, logFailure: async () => {} });
  const deals = dealWrites(bx, { offerLinkBase: "https://oc.example.test" });
  app = await buildApp(cfg, {
    register: async (a) => {
      const customer = await registerDealCustomer(a, bx);
      await registerMainContact(a, { deals, forgetDealCustomer: (id) => customer.forget(id) });
    },
  });
}, 120000);
afterAll(async () => { await app?.close(); await stub?.stop(); await disconnectDb(); await mongod?.stop(); });
beforeEach(async () => {
  Object.assign(state, { dealContact: "7001", list: [], items: [{ CONTACT_ID: "7001", SORT: "10", ROLE_ID: "0", IS_PRIMARY: "Y" }, { CONTACT_ID: "7005", SORT: "20", ROLE_ID: "0", IS_PRIMARY: "N" }], commentFails: false, addId: 9001 });
  stub.take("v2");
  await mongoose.connection.db!.collection("useractionlogs").deleteMany({});
});

const head = [sent("crm.deal.get", { id: 4711 }), sent("crm.contact.get", { id: 7001 })];
const listCall = sent("crm.contact.list", { filter: { NAME: "Erika", LAST_NAME: "Muster" }, select: ["ID", "ADDRESS_POSTAL_CODE"] });
const itemsGet = sent("crm.deal.contact.items.get", { id: 4711 });
const itemsSet = (primary: number) => sent("crm.deal.contact.items.set", {
  id: 4711,
  items: [
    { CONTACT_ID: primary, SORT: 10, IS_PRIMARY: "Y" },
    { CONTACT_ID: 7001, SORT: 20, ROLE_ID: "0", IS_PRIMARY: "N" },
    { CONTACT_ID: 7005, SORT: 30, ROLE_ID: "0", IS_PRIMARY: "N" },
  ],
});
const comment = (text: string) => sent("crm.timeline.comment.add", { fields: { ENTITY_ID: 4711, ENTITY_TYPE: "deal", COMMENT: text } });

describe("POST /api/bitrix/deal/:id/main-contact", () => {
  it("rename: only NAME and LAST_NAME of the SAME contact, then the note", async () => {
    const r = await post({ mode: "rename", expectedContactId: "7001", person: { firstName: " Maximilian ", lastName: "Muster" } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, contactId: "7001", created: false, mode: "rename" });
    expect(calls()).toEqual([
      ...head,
      sent("crm.contact.update", { id: 7001, fields: { NAME: "Maximilian", LAST_NAME: "Muster" } }),
      comment("Konfigurator: Name des Kontakts korrigiert von Max Muster auf Maximilian Muster (ID 7001). Geändert durch Test Berater."),
    ]);
    await logged("main_contact_changed");
  });

  it("replace, no fitting contact: a new contact WITHOUT the old contact's phone and e-mail; primary; every linked contact kept", async () => {
    const r = await post({ mode: "replace", expectedContactId: "7001", person: PERSON });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, contactId: "9001", created: true, mode: "replace" });
    expect(calls()).toEqual([
      ...head,
      listCall,
      sent("crm.contact.add", { fields: { NAME: "Erika", LAST_NAME: "Muster", OPENED: "Y", HONORIFIC: "HNR_DE_1", ADDRESS: "Probeweg 3", ADDRESS_POSTAL_CODE: "95000", ADDRESS_CITY: "Teststadt" } }),
      itemsGet,
      itemsSet(9001),
      comment("Konfigurator: Hauptkontakt geändert von Max Muster (ID 7001, bleibt als Ansprechpartner am Auftrag) auf Erika Muster (ID 9001, neu angelegt). Geändert durch Test Berater."),
    ]);
  });

  it("replace, new contact: its OWN phone and e-mail are taken (Herr → HNR_DE_2; Familie has no honorific)", async () => {
    await post({ mode: "replace", expectedContactId: "7001", person: { ...PERSON, salutation: "Herr", phone: "0170 1234567", email: "erika@example.test" } });
    const add = calls().find((c) => c.method === "crm.contact.add")!;
    expect(add).toEqual(sent("crm.contact.add", { fields: {
      NAME: "Erika", LAST_NAME: "Muster", OPENED: "Y", HONORIFIC: "HNR_DE_2",
      PHONE: [{ VALUE: "0170 1234567", VALUE_TYPE: "WORK" }], EMAIL: [{ VALUE: "erika@example.test", VALUE_TYPE: "WORK" }],
      ADDRESS: "Probeweg 3", ADDRESS_POSTAL_CODE: "95000", ADDRESS_CITY: "Teststadt",
    } }));
    await post({ mode: "replace", expectedContactId: "7001", person: { ...PERSON, salutation: "Familie", phone: "+49 (9281) 00-0001" } }); // the same digits: still the old contact's number
    const add2 = calls().find((c) => c.method === "crm.contact.add")!;
    expect(new URLSearchParams(add2.params).has("fields[HONORIFIC]")).toBe(false);
    expect(new URLSearchParams(add2.params).has("fields[PHONE][0][VALUE]")).toBe(false);
  });

  it("replace, one fitting contact: used unchanged (no add, no update); the old contact is not a candidate; PLZ rule", async () => {
    state.list = [{ ID: "7001", ADDRESS_POSTAL_CODE: "95000" }, { ID: "8001", ADDRESS_POSTAL_CODE: "95000" }, { ID: "8002", ADDRESS_POSTAL_CODE: "10115" }];
    const r = await post({ mode: "replace", expectedContactId: "7001", person: PERSON });
    expect(r.json()).toEqual({ ok: true, contactId: "8001", created: false, mode: "replace" });
    expect(calls()).toEqual([
      ...head, listCall, itemsGet, itemsSet(8001),
      comment("Konfigurator: Hauptkontakt geändert von Max Muster (ID 7001, bleibt als Ansprechpartner am Auftrag) auf Erika Muster (ID 8001, bestehender Kontakt). Geändert durch Test Berater."),
    ]);
  });

  it("replace, the found contact is already linked: it moves to the front, nobody is dropped; an old contact missing from the list is added", async () => {
    state.list = [{ ID: "7005", ADDRESS_POSTAL_CODE: "" }];
    state.items = [{ CONTACT_ID: "7005", SORT: "20", IS_PRIMARY: "N" }];
    await post({ mode: "replace", expectedContactId: "7001", person: PERSON });
    expect(calls().find((c) => c.method === "crm.deal.contact.items.set")).toEqual(sent("crm.deal.contact.items.set", {
      id: 4711, items: [{ CONTACT_ID: 7005, SORT: 10, IS_PRIMARY: "Y" }, { CONTACT_ID: 7001, SORT: 20, IS_PRIMARY: "N" }],
    }));
  });

  it("replace, several fitting contacts: 409 ambiguous, nothing written", async () => {
    state.list = [{ ID: "8001", ADDRESS_POSTAL_CODE: "95000" }, { ID: "8003", ADDRESS_POSTAL_CODE: "" }];
    const r = await post({ mode: "replace", expectedContactId: "7001", person: PERSON });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ ambiguous: true, error: { code: "MAIN_CONTACT_AMBIGUOUS", message: "Mehrere passende Kontakte in Bitrix – bitte im Büro klären" } });
    expect(calls()).toEqual([...head, listCall]);
  });

  it.each(["replace", "rename"])("%s: the deal's contact changed meanwhile → 409, only the deal was read", async (mode) => {
    state.dealContact = "7002";
    const r = await post({ mode, expectedContactId: "7001", person: PERSON });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("MAIN_CONTACT_CHANGED");
    expect(r.json().error.message).toMatch(/inzwischen geändert/);
    expect(calls()).toEqual([sent("crm.deal.get", { id: 4711 })]);
  });

  it("a failed timeline note does not fail the change (commentFailed)", async () => {
    state.commentFails = true;
    const r = await post({ mode: "rename", expectedContactId: "7001", person: { firstName: "Erika", lastName: "Muster" } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, contactId: "7001", created: false, mode: "rename", commentFailed: true });
  });

  it("Bitrix refuses a write: 502 in German, recorded as failed", async () => {
    state.addId = 0; // crm.contact.add without an id
    const r = await post({ mode: "replace", expectedContactId: "7001", person: PERSON });
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toMatchObject({ code: "MAIN_CONTACT_FAILED", message: expect.stringMatching(/^Bitrix konnte den Kontakt nicht ändern/) });
    expect(calls().map((c) => c.method)).not.toContain("crm.deal.contact.items.set");
    await logged("main_contact_failed");
  });

  it("invalid input: 400 without a Bitrix call", async () => {
    for (const body of [{ mode: "replace", expectedContactId: "7001", person: { firstName: "Erika", lastName: " " } }, { mode: "other", expectedContactId: "7001", person: PERSON }, { mode: "rename", expectedContactId: "x", person: PERSON }]) {
      expect((await post(body)).statusCode).toBe(400);
    }
    expect((await post({ mode: "rename", expectedContactId: "7001", person: PERSON }, "47a1")).statusCode).toBe(400);
    expect(calls()).toEqual([]);
  });

  it("needs a session", async () => {
    const r = await app.inject({ method: "POST", url: "/api/bitrix/deal/4711/main-contact", payload: { mode: "rename", expectedContactId: "7001", person: PERSON } });
    expect(r.statusCode).toBe(401);
  });

  it("after a change the deal's customer is asked from Bitrix again (the server's 60 s copy is dropped)", async () => {
    await app.inject({ url: "/api/deals/4711/customer", headers: auth });
    await app.inject({ url: "/api/deals/4711/customer", headers: auth });
    expect(calls().map((c) => c.method)).toEqual(["batch"]); // kept
    await post({ mode: "rename", expectedContactId: "7001", person: { firstName: "Erika", lastName: "Muster" } });
    stub.take("v2");
    await app.inject({ url: "/api/deals/4711/customer", headers: auth });
    expect(calls().map((c) => c.method)).toEqual(["batch"]);
  });
});
