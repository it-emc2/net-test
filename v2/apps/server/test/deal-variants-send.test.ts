// ADR 027 A, step 1: the 24 h "already sent" lock is per VARIANT, through the real e-mail and
// post routes, with the legacy unique dealId index in place. Harness as send-guard-audit.test.ts:
// in-memory MongoDB, SMTP sink, stubs for Bitrix and the print service — nothing leaves the machine.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EJSON } from "bson";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { BitrixStub } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";
import { SmtpSink } from "./helpers/smtp-sink.js";
// @ts-expect-error plain JS helper
import { fakePdf } from "./helpers/fake-pdf.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const fx = (p: string) => JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/" + p, "utf8"));
const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
let mongod: MongoMemoryServer, v2: FastifyInstance, token = "";
const bx = new BitrixStub(BITRIX_HANDLERS);
const smtp = new SmtpSink();
const OB24 = { OB24_API_KEY: "ob24-test-key", OB24_API_SECRET: "ob24-test-secret", OB24_MODE: "test" };
const MAIL = { SMTP_EMAIL: "angebote@test.local", SMTP_PASS: "smtp-test-pass", SMTP_REPLY_TO: "service@test.local", PUBLIC_BASE_URL: "http://oc.test" };
let pdfSeq = 0, realPdfs = false; // realPdfs: the HTML engine returns a PDF the post route can read

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await bx.start(); await smtp.start(0);
  const client = new mongoose.mongo.MongoClient(uri); await client.connect();
  const db = client.db("KonfiguratorDB");
  await db.collection("Products").insertMany(fx("docs/products.json"));
  await db.collection("Services").insertMany(fx("catalog/services.json").map((s: any) => ({ ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) })));
  await db.collection("appconfigs").insertMany(Object.entries(fx("pricing/config.json")).map(([key, value]) => ({ key, value })));
  await db.collection("users").insertOne({ email: USER.email, name: "Contract", passwordHash: hashPassword(USER.password), role: "admin", active: true });
  await db.collection("users").insertOne({ email: "ap@test.local", name: "AP Test", passwordHash: hashPassword("ap-pass"), role: "user", active: true, signatureDataUrl: "data:image/png;base64,AAAA", createdAt: new Date("2025-01-01") });
  const vigor = fx("docs/vigor-products.json");
  if (vigor.length) await client.db("vigor").collection("products").insertMany(vigor);
  await client.close();
  const cfg = loadConfig({
    NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET,
    BITRIX_WEBHOOK_BASE: bx.base("v2"), BITRIX_MIN_GAP_MS: "0", PLANNING_API_BASE_URL: bx.planningBase("v2"), OFFER_LINK_BASE: "http://oc.test",
    OB24_BASE_URL: bx.ob24Base("v2"), ...OB24, EXTERNAL_API_KEY: "ext-test-key",
    SMTP_HOST: "127.0.0.1", SMTP_SEND_PORT: String(smtp.port), SMTP_PORT: String(smtp.port), SIGNING_OFFICE_EMAIL: "buero@test.local", IMAP_HOST: "127.0.0.1", IMAP_PORT: "9", ...MAIL,
  });
  await connectDb(cfg, { info: () => {} });
  v2 = await buildApp(cfg, { register: (a) => registerApi(a, { cfg, mailTls: { rejectUnauthorized: false },
    pdfEngine: { docxToPdf: async () => Buffer.from(`%PDF-1.4\n% fake docx pdf ${++pdfSeq}\n%%EOF\n`), htmlToPdf: async (html: string) => (realPdfs ? Buffer.from(await pdfTitled("rendered"), "base64") : fakePdf(html)) } }) });
  const r = await v2.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: USER });
  token = r.json().token;
  const { migrateOfferSendIndexes } = await import("../src/modules/sends/store.js"); await migrateOfferSendIndexes();
}, 180000);
afterAll(async () => { await v2?.close(); await disconnectDb(); await mongod?.stop(); await bx.stop(); await smtp.stop(); });

const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
const BU = offers.find((o) => o.offerType === "bu").payload;
const db = () => mongoose.connection.db!;
const call = async (method: string, url: string, body?: unknown) => {
  const r = await v2.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
  let j: any = null; try { j = r.json(); } catch { /* */ }
  return { status: r.statusCode, body: j };
};
type Field = string | { filename: string; content: Buffer | string };
const mail = async (fields: Record<string, Field>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) { if (typeof v === "string") fd.append(k, v); else fd.append(k, new Blob([v.content]), v.filename); }
  const rq = new Request("http://x/", { method: "POST", body: fd });
  const r = await v2.inject({ method: "POST", url: "/api/email/send-offer", headers: { authorization: `Bearer ${token}`, "content-type": rq.headers.get("content-type")! }, payload: Buffer.from(await rq.arrayBuffer()) });
  return { status: r.statusCode, body: r.json() };
};
const mailFields = (nr: string, payload: any, sendId: string, extra: Record<string, Field> = {}) => ({ to: "kunde@example.invalid", subject: "Ihr Angebot", offerNumber: nr, offerType: "bu", body: "Hallo {{SIGN_LINK}}", payload: JSON.stringify({ ...payload, offerNumber: nr }), dealId: "", sendId, ...extra });

const letterFor = (nr: string, dealId: string, base64: string) => ({ auftragId: dealId, recipient: { name: "Test Kunde", street: "Weg 1", zipCode: "12345", city: "Ort", country: "Deutschland" }, document: { filename: `${nr}.pdf`, base64 }, attachments: [], meta: { offerNumber: nr, dealId } });
async function pdfTitled(title: string) { const { PDFDocument } = await import("pdf-lib"); const doc = await PDFDocument.create(); doc.addPage([595.28, 841.89]); doc.setTitle(title); return Buffer.from(await doc.save({ useObjectStreams: false })).toString("base64"); }

describe("send lock per variant (ADR 027 A)", () => {
  const DEAL = "9501";
  it("e-mail: variant A, then variant B passes; A again is refused (already sent); records carry the variant", async () => {
    await db().collection("emailsends").createIndex({ dealId: 1 }, { unique: true, name: "dealId_1" }); // as in production
    const { migrateDealDraftIndexes } = await import("../src/modules/deal-drafts/store.js"); await migrateDealDraftIndexes();
    const A = { ...BU, offerNumber: "VAR-A" };
    expect((await call("PUT", `/api/deals/${DEAL}/draft`, { offerType: "bu", payload: A, baseRevision: 0 })).status).toBe(200);
    const created = await call("POST", `/api/deals/${DEAL}/variants`, { name: "B" });
    const V = created.body.variant.variantId as string;
    const d = await call("GET", `/api/deals/${DEAL}/draft?variant=${V}`);
    const B = { ...d.body.payload, offerNumber: "VAR-B" };
    expect((await call("PUT", `/api/deals/${DEAL}/draft?variant=${V}`, { offerType: "bu", payload: B, baseRevision: d.body.revision })).status).toBe(200);

    const a1 = await mail(mailFields("VAR-A", A, "variant-a-0001", { dealId: DEAL }));
    expect(a1.status).toBe(200);
    const b1 = await mail(mailFields("VAR-B", B, "variant-b-0001", { dealId: DEAL })); // today's UI: no variant field — found by its number
    expect(b1.status).toBe(200);
    const a2 = await mail(mailFields("VAR-A", A, "variant-a-0002", { dealId: DEAL }));
    expect([a2.status, a2.body.error.code, a2.body.lastOfferNumber]).toEqual([409, "ALREADY_SENT", "VAR-A"]);
    const b2 = await mail(mailFields("VAR-B", B, "variant-b-0002", { dealId: DEAL, variantId: V }));
    expect([b2.status, b2.body.error.code]).toEqual([409, "ALREADY_SENT"]);

    const rows = await db().collection("emailsends").find({}, { projection: { _id: 0, dealId: 1, offerNumber: 1 } }).sort({ dealId: 1 }).toArray();
    expect(rows).toEqual([{ dealId: DEAL, offerNumber: "VAR-A" }, { dealId: `${DEAL}#${V}`, offerNumber: "VAR-B" }]);
    const recs = await db().collection("offer_sends").find({ dealId: DEAL, status: "done" }).toArray();
    expect(recs.map((r: any) => [r.offerNumber, r.variantId]).sort()).toEqual([["VAR-A", "v1"], ["VAR-B", V]]);

    // the variants list now shows both as sent, and neither may be deleted
    const l = (await call("GET", `/api/deals/${DEAL}/variants`)).body.variants;
    expect(l.map((v: any) => [v.variantId, v.status, v.sentChannel])).toEqual([["v1", "sent", "email"], [V, "sent", "email"]]);
    expect((await call("DELETE", `/api/deals/${DEAL}/variants/${V}`)).body.error.code).toBe("VARIANT_SENT");
  });

  it("post: the same per-variant rows on postalsends", async () => {
    await db().collection("postalsends").createIndex({ dealId: 1 }, { unique: true, name: "dealId_1" });
    realPdfs = true;
    try {
      const V = (await call("GET", `/api/deals/${DEAL}/variants`)).body.variants[1].variantId;
      const pdf = await pdfTitled("brief");
      const letter = (nr: string) => ({ ...letterFor(nr, DEAL, pdf), sendId: `variant-post-${nr}-${Math.random().toString(36).slice(2, 10)}` });
      expect((await call("POST", "/api/post/send", letter("VAR-A"))).status).toBe(200);
      expect((await call("POST", "/api/post/send", letter("VAR-B"))).status).toBe(200);
      const again = await call("POST", "/api/post/send", letter("VAR-A"));
      expect([again.status, again.body.code]).toEqual([409, "ALREADY_SENT"]);
      const rows = await db().collection("postalsends").find({}, { projection: { _id: 0, dealId: 1 } }).sort({ dealId: 1 }).toArray();
      expect(rows.map((r: any) => r.dealId)).toEqual([DEAL, `${DEAL}#${V}`]);
    } finally { realPdfs = false; }
  });
});
