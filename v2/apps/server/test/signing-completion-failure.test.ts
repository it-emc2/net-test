// U-071 (owner 2026-11-25): the final step of a signing fails on the server (here: no PDF engine).
// Every signature is stored FIRST (atomic claim), so the answer may say so: today's answer
// (`message` — the classic page shows it, unchanged) plus `signatureStored: true` for the React
// page, which shows a plain German text; the technical detail goes to `error_events`.
// In-memory MongoDB, made-up request, no outside service.
import { MongoMemoryServer } from "mongodb-memory-server";
import Fastify, { type FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@oc/config";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerSigning } from "../src/modules/signing/routes.js";
import { UNAVAILABLE_SIGNING_RENDERER } from "../src/modules/signing/documents.js";
import { SigningRequest } from "../src/platform/models.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TOKEN = "c0ffee".padEnd(48, "0");
let mongod: MongoMemoryServer;
let app: FastifyInstance;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: "completion-failure-secret-0123456789" });
  await connectDb(cfg, { info: () => {} });
  app = Fastify();
  const deals = { addTimelineComment: async () => ({ ok: true }), updateDealAfterSigning: async () => ({}), ensurePartnerContact: async () => null, getDealContactId: async () => null, addTask: async () => null };
  await registerSigning(app, {
    deals: deals as any, renderer: UNAVAILABLE_SIGNING_RENDERER, mailer: { configured: false } as any, assetsDir: ROOT + "src/assets",
    signPageFile: ROOT + "src/public/signpage/index.html", apDefaultEmail: "", authSecret: "completion-failure-secret-0123456789",
    log: { warn: () => {}, error: () => {} },
  });
  await SigningRequest.create({
    token: TOKEN, offerNumber: "ANG2026-1125-100000", offerType: "ah", customerType: "SZ", bitrixEntityType: "deal", bitrixEntityId: "76001",
    payloadSnapshot: { activeOffer: "ah" }, prefill: { city: "Hof" }, documents: [{ key: "zusatzblatt", status: "pending" }], status: "opened",
    expiresAt: new Date(Date.now() + 86400000),
  });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });

describe("a failing completion (U-071)", () => {
  it("answers today's 500 plus signatureStored; the signature is stored; the detail is in error_events", async () => {
    const r = await app.inject({ method: "POST", url: `/api/signing/${TOKEN}/documents/zusatzblatt`, payload: { signatureImage: PNG, editedFields: {}, extraFields: {} } });
    expect(r.statusCode).toBe(500);
    const e = r.json().error;
    expect(e).toMatchObject({ code: "SIGNING_FAILED", signatureStored: true });
    expect(typeof e.message).toBe("string"); // today's text for the classic page
    const sr: any = await SigningRequest.findOne({ token: TOKEN }).lean();
    expect(sr.status).toBe("completed");
    expect(sr.documents[0]).toMatchObject({ key: "zusatzblatt", status: "signed", signatureImage: PNG });
    // the event is written without waiting for it
    let events: any[] = [];
    for (let i = 0; i < 40 && !events.length; i++) {
      await new Promise((res) => setTimeout(res, 50));
      events = await mongoose.connection.collection("error_events").find({ code: "SIGNING_COMPLETION_FAILED" }).toArray();
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ area: "signing.completion", severity: "error", dealId: "76001" });
    expect(String(events[0]!.message)).toContain("completion failed");
  });

  it("a repeated submit runs the completion again and answers the same way", async () => {
    const r = await app.inject({ method: "POST", url: `/api/signing/${TOKEN}/documents/zusatzblatt`, payload: { signatureImage: PNG, editedFields: {}, extraFields: {} } });
    expect(r.statusCode).toBe(500);
    expect(r.json().error).toMatchObject({ code: "SIGNING_FAILED", signatureStored: true });
  });
});
