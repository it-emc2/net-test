// Offers signed in the OLD app (U-069, owner 2026-11-25; investigation C of U-063). The old app
// (src/routes/signing.js) writes only a SigningRequest — collection `signingrequests`, shared with
// v2 — with offerNumber, status "completed" and the Bitrix target (deal, else contact). It writes
// no `offer_sends` row and nothing into the stored offer. v2 recognises such a signing through the
// deal number (filed on the deal, or the payload's deal number) and, filed on the contact, through
// the stored offer/draft of its number — read only. In-memory MongoDB, made-up deals.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerDealDrafts } from "../src/modules/deal-drafts/routes.js";
import { migrateDealDraftIndexes } from "../src/modules/deal-drafts/store.js";
import { dealSignature } from "../src/modules/deal-drafts/index.js";
import { Draft, Offer, SigningRequest } from "../src/platform/models.js";

const SECRET = "legacy-signature-test-secret-0123456789";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
const auth = () => ({ authorization: `Bearer ${createToken("ao@test.local", SECRET)}` });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await migrateDealDraftIndexes();
  app = await buildApp(cfg, { register: (a) => registerDealDrafts(a, {}) });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });

/** a signing request as the old app stores it after the customer signed everything */
const oldAppSigned = (offerNumber: string, target: { deal?: string; contact?: string }, payload: object = {}) => SigningRequest.create({
  token: `tok${offerNumber}`.padEnd(48, "0"), offerNumber, offerType: "bu", customerType: "SZ",
  bitrixEntityType: target.deal ? "deal" : "contact", bitrixEntityId: target.deal ?? target.contact ?? "",
  payloadSnapshot: { offerNumber, activeOffer: "bu", ...payload }, documents: [{ key: "angebot", status: "signed", signedAt: new Date("2026-11-10T10:00:00Z") }],
  status: "completed", completedAt: new Date("2026-11-10T10:00:00Z"),
});
const putDraft = (dealId: string, payload: object) => app.inject({ method: "PUT", url: `/api/deals/${dealId}/draft`, headers: auth(), payload: { offerType: "bu", payload: { activeOffer: "bu", ...payload }, baseRevision: 0 } });
const statusOf = async (dealId: string) => (await app.inject({ url: `/api/deals/${dealId}/variants`, headers: auth() })).json().variants.map((v: any) => v.status);

const before = async (id: string) => (await SigningRequest.findOne({ token: id }).lean()) as any;

describe("an offer signed in the old app (U-069)", () => {
  it("(a) shown as signed when the deal's draft carries that offer number", async () => {
    await oldAppSigned("ANG2026-1110-100000", { deal: "71001" });
    expect((await putDraft("71001", { offerNumber: "ANG2026-1110-100000" })).statusCode).toBe(200);
    expect(await statusOf("71001")).toEqual(["signed"]);
  });

  it("(a) shown as signed through the deal number when the deal's draft was started empty or carries another number", async () => {
    await oldAppSigned("ANG2026-1110-110000", { deal: "71002" });
    await putDraft("71002", { Kundendaten: { firstName: "Erika" } });
    expect(await statusOf("71002")).toEqual(["signed"]);
    await oldAppSigned("ANG2026-1110-120000", { deal: "71003" });
    await putDraft("71003", { offerNumber: "ANG2026-1120-090000" }); // a newer version under a new number
    expect(await statusOf("71003")).toEqual(["signed"]);
  });

  it("(b) a later send keeps the deal in its phase when the signing was filed on the deal — whatever the draft holds", async () => {
    expect(await dealSignature("71002")).toEqual({ offerNumber: "ANG2026-1110-110000" });
    expect(await dealSignature("71003")).toEqual({ offerNumber: "ANG2026-1110-120000" });
  });

  it("filed on the contact, the deal draft carries the number: signed; the same customer's empty deal is not", async () => {
    await oldAppSigned("ANG2026-1110-130000", { contact: "5901" });
    await putDraft("71004", { offerNumber: "ANG2026-1110-130000", auftragId: "71004" });
    expect(await statusOf("71004")).toEqual(["signed"]);
    expect(await dealSignature("71004")).toEqual({ offerNumber: "ANG2026-1110-130000" });
    await putDraft("71005", { Kundendaten: { firstName: "Erika" } }); // the same customer, started empty
    expect(await statusOf("71005")).toEqual(["draft"]);
    expect(await dealSignature("71005")).toBeNull(); // → a send moves the deal as before
  });

  it("filed on the contact, the payload names the deal number (auftragId / postal.auftragId): signed", async () => {
    await oldAppSigned("ANG2026-1110-140000", { contact: "5902" }, { auftragId: "71006" });
    await putDraft("71006", { Kundendaten: { firstName: "Erika" } });
    expect(await statusOf("71006")).toEqual(["signed"]);
    expect(await dealSignature("71006")).toEqual({ offerNumber: "ANG2026-1110-140000" });
    await oldAppSigned("ANG2026-1110-141000", { contact: "5903" }, { postal: { auftragId: "71007" } });
    expect(await dealSignature("71007")).toEqual({ offerNumber: "ANG2026-1110-141000" }); // no draft at all
  });

  it("two deals of one contact: each deal finds only its own signing, through the stored offer of the number", async () => {
    await Offer.create({ offerNumber: "ANG2026-1111-100000", offerType: "bu", payload: { offerNumber: "ANG2026-1111-100000", auftragId: "72001" } });
    await Draft.create({ name: "ANG-BU-Test", offerType: "bu", offerNumber: "ANG2026-1111-110000", payload: { offerNumber: "ANG2026-1111-110000", postal: { auftragId: "72002" } } });
    await oldAppSigned("ANG2026-1111-100000", { contact: "5910" });
    await oldAppSigned("ANG2026-1111-110000", { contact: "5910" });
    await putDraft("72001", { Kundendaten: { firstName: "Erika" } });
    await putDraft("72002", { Kundendaten: { firstName: "Erika" } });
    expect(await statusOf("72001")).toEqual(["signed"]);
    expect(await statusOf("72002")).toEqual(["signed"]);
    expect(await dealSignature("72001")).toEqual({ offerNumber: "ANG2026-1111-100000" });
    expect(await dealSignature("72002")).toEqual({ offerNumber: "ANG2026-1111-110000" });
    await putDraft("72003", { Kundendaten: { firstName: "Erika" } }); // a third deal of the same contact
    expect(await statusOf("72003")).toEqual(["draft"]);
    expect(await dealSignature("72003")).toBeNull();
  });

  it("a signing of ANOTHER deal does not leak, even when this deal's draft carries its number", async () => {
    await oldAppSigned("ANG2026-1112-100000", { deal: "73001" });
    await putDraft("73002", { offerNumber: "ANG2026-1112-100000" }); // e.g. copied from the other deal's offer
    expect(await statusOf("73002")).toEqual(["draft"]);
    expect(await dealSignature("73002")).toBeNull();
    await oldAppSigned("ANG2026-1112-110000", { contact: "5920" }, { auftragId: "73003" });
    await putDraft("73004", { offerNumber: "ANG2026-1112-110000" });
    expect(await dealSignature("73004")).toBeNull(); // the payload names deal 73003
    expect(await dealSignature("73003")).toEqual({ offerNumber: "ANG2026-1112-110000" });
  });

  it("a deal with two variants: the unmatched old signing marks no variant, but the deal counts as signed", async () => {
    await oldAppSigned("ANG2026-1113-100000", { deal: "74001" });
    await putDraft("74001", { Kundendaten: { firstName: "Erika" } });
    const add = await app.inject({ method: "POST", url: "/api/deals/74001/variants", headers: auth(), payload: { name: "Variante 2" } });
    expect(add.statusCode).toBeLessThan(300);
    expect(await statusOf("74001")).toEqual(["draft", "draft"]);
    expect(await dealSignature("74001")).toEqual({ offerNumber: "ANG2026-1113-100000" });
  });

  it("an old signing of another offer type does not mark the deal's only variant", async () => {
    await SigningRequest.create({ token: "tokAH".padEnd(48, "0"), offerNumber: "ANG2026-1114-100000", offerType: "ah", customerType: "SZ", bitrixEntityType: "deal", bitrixEntityId: "75001", payloadSnapshot: { activeOffer: "ah" }, status: "completed", completedAt: new Date("2026-11-10T10:00:00Z") });
    await putDraft("75001", { Kundendaten: { firstName: "Erika" } }); // a BU draft
    expect(await statusOf("75001")).toEqual(["draft"]);
    expect(await dealSignature("75001")).toEqual({ offerNumber: "ANG2026-1114-100000" }); // the deal stays where it is
  });

  it("reads the signing requests only — nothing is written to them", async () => {
    const tok = `tokANG2026-1110-110000`.padEnd(48, "0");
    const a = await before(tok);
    await statusOf("71002"); await dealSignature("71002");
    expect(await before(tok)).toEqual(a);
  });
});
