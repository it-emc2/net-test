// What v2 knows about an offer signed in the OLD app (investigation C of U-063). The old app
// (src/routes/signing.js) writes only a SigningRequest — collection `signingrequests`, shared with
// v2 — with offerNumber, status "completed" and the Bitrix target (deal, else contact). It writes
// no `offer_sends` row and nothing into the stored offer. These tests pin down today's v2 answer
// to the two questions; they change nothing. In-memory MongoDB, made-up deals.
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
import { SigningRequest } from "../src/platform/models.js";

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
const oldAppSigned = (offerNumber: string, target: { deal?: string; contact?: string }) => SigningRequest.create({
  token: `tok${offerNumber}`.padEnd(48, "0"), offerNumber, offerType: "bu", customerType: "SZ",
  bitrixEntityType: target.deal ? "deal" : "contact", bitrixEntityId: target.deal ?? target.contact ?? "",
  payloadSnapshot: { offerNumber, activeOffer: "bu" }, documents: [{ key: "angebot", status: "signed", signedAt: new Date("2026-11-10T10:00:00Z") }],
  status: "completed", completedAt: new Date("2026-11-10T10:00:00Z"),
});
const putDraft = (dealId: string, payload: object) => app.inject({ method: "PUT", url: `/api/deals/${dealId}/draft`, headers: auth(), payload: { offerType: "bu", payload: { activeOffer: "bu", ...payload }, baseRevision: 0 } });
const statusOf = async (dealId: string) => (await app.inject({ url: `/api/deals/${dealId}/variants`, headers: auth() })).json().variants.map((v: any) => v.status);

describe("an offer signed in the old app", () => {
  it("(a) shown as signed when the deal's draft carries that offer number (opened via U-057, or autosaved by the old UI)", async () => {
    await oldAppSigned("ANG2026-1110-100000", { deal: "71001" });
    expect((await putDraft("71001", { offerNumber: "ANG2026-1110-100000" })).statusCode).toBe(200);
    expect(await statusOf("71001")).toEqual(["signed"]);
  });

  it("(a) NOT shown as signed when the deal's draft was started empty or carries another number (no send record links them)", async () => {
    await oldAppSigned("ANG2026-1110-110000", { deal: "71002" });
    await putDraft("71002", { Kundendaten: { firstName: "Erika" } });
    expect(await statusOf("71002")).toEqual(["draft"]);
    await oldAppSigned("ANG2026-1110-120000", { deal: "71003" });
    await putDraft("71003", { offerNumber: "ANG2026-1120-090000" }); // a newer version under a new number
    expect(await statusOf("71003")).toEqual(["draft"]);
  });

  it("(b) a later send keeps the deal in its phase when the signing was filed on the deal — whatever the draft holds", async () => {
    expect(await dealSignature("71002")).toEqual({ offerNumber: "ANG2026-1110-110000" });
    expect(await dealSignature("71003")).toEqual({ offerNumber: "ANG2026-1110-120000" });
  });

  it("(b) filed on the contact (no deal number at signing time): kept only through a deal draft that carries the number", async () => {
    await oldAppSigned("ANG2026-1110-130000", { contact: "5901" });
    await putDraft("71004", { offerNumber: "ANG2026-1110-130000", auftragId: "71004" });
    expect(await statusOf("71004")).toEqual(["signed"]); // the variant reads it by number …
    expect(await dealSignature("71004")).toEqual({ offerNumber: "ANG2026-1110-130000" }); // … and the move follows the signed variant
    await putDraft("71005", { Kundendaten: { firstName: "Erika" } }); // the same customer, started empty
    expect(await dealSignature("71005")).toBeNull(); // → a send would move the deal
  });
});
