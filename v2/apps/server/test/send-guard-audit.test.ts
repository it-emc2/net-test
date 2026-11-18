// Send guard, audit 2026-11-17 (server-side findings F1, F3, F8, F9, F10; F2 lives in contract.test.ts).
// Each case failed before its fix. In-memory MongoDB, SMTP sink, stubs for Bitrix and the print
// service — nothing leaves the machine.
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
// a change that moves the price: Sonderaufschlag / other positions
const changedPrice = (p: any) => ({ ...p, rabatt: { ...(p.rabatt || {}), sonderaufschlagValue: "500", sonderaufschlag: "500", sonderaufschlagType: "eur" }, offerOverrides: { priceAdjustments: [{ target: "services", amountNet: 1000 }] } });
const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString("base64");


const BY_NO = (nr: string) => offers.find((o) => o.offerNumber === nr).payload;
const ONE_DOC = BY_NO("ANG2026-1103-134214"); // signing: only the offer itself to sign
/** POST /api/offers as the React app does it (the marker that tells it from today's UI) */
const reactSave = (nr: string, payload: any) => call("POST", "/api/offers", { offerNumber: nr, offerType: "bu", payload, client: "react" });
const totalOf = async (payload: any, unusedNumber: string) => (await call("POST", "/api/price", { ...payload, offerNumber: unusedNumber })).body.total as number;
const stored = (nr: string) => db().collection("offers").findOne({ offerNumber: nr }) as Promise<any>;
const sign = (token: string, key = "angebot") => v2.inject({ method: "POST", url: `/api/signing/${token}/documents/${key}`, headers: { "content-type": "application/json" }, payload: { signatureImage: PNG, extraFields: { paymentTermIdx: 1 }, place: "Hof" } });
const letterFor = (nr: string, dealId: string, base64: string) => ({ auftragId: dealId, recipient: { name: "Test Kunde", street: "Weg 1", zipCode: "12345", city: "Ort", country: "Deutschland" }, document: { filename: `${nr}.pdf`, base64 }, attachments: [], meta: { offerNumber: nr, dealId } });
async function pdfTitled(title: string) { const { PDFDocument } = await import("pdf-lib"); const doc = await PDFDocument.create(); doc.addPage([595.28, 841.89]); doc.setTitle(title); return Buffer.from(await doc.save({ useObjectStreams: false })).toString("base64"); }
const openRequests = (nr: string) => db().collection("signingrequests").find({ offerNumber: nr, status: { $nin: ["completed", "expired"] } }).toArray();

describe("F1 — which stored offer keeps its price", () => {
  it("saved by the React app (PDF download), never sent, then changed: priced fresh in the UI, on save, in the mail and on the record", async () => {
    const A = { ...BU, offerNumber: "F1-A" }, B = changedPrice(A);
    const oldTotal = await totalOf(A, "F1-FRESH"), freshTotal = await totalOf(B, "F1-FRESH");
    expect(freshTotal).toBeGreaterThan(oldTotal);
    const saved = await reactSave("F1-A", A);
    expect(saved.body.offer.pricing.total).toBe(oldTotal);

    const ui = await call("POST", "/api/price", B);
    expect(ui.body.total).toBe(freshTotal);
    expect(ui.body._locked).toBeUndefined();
    const resave = await reactSave("F1-A", B);
    expect(resave.status).toBe(200);
    expect(resave.body.offer.pricing.total).toBe(freshTotal);

    // saved again as A, then B is mailed without a save in between (the send page does that)
    await reactSave("F1-A", A);
    const sent = await mail(mailFields("F1-A", B, "audit-f1-0001"));
    expect(sent.status, JSON.stringify(sent.body).slice(0, 300)).toBe(200);
    expect(sent.body.offerTotal).toBe(freshTotal);
    const rec: any = await db().collection("offer_sends").findOne({ sendId: "audit-f1-0001" });
    expect(rec.total).toBe(freshTotal);
    expect((await stored("F1-A")).pricing.total).toBe(freshTotal);
  }, 120000);

  it("saved by the React app and sent: the price is pinned, whatever is asked under its number", async () => {
    const A = { ...BU, offerNumber: "F1-S" }, B = changedPrice(A);
    await reactSave("F1-S", A);
    const sent = await mail(mailFields("F1-S", A, "audit-f1-0002"));
    expect(sent.status).toBe(200);
    // the pinned price is the stored one, not a recomputation: make it recognisable
    await db().collection("offers").updateOne({ offerNumber: "F1-S" }, { $set: { "pricing.total": 1234.56 } });
    for (const p of [A, B, { ...B, forceRecompute: true }]) {
      const r = await call("POST", "/api/price", p);
      expect(r.body.total).toBe(1234.56);
      expect(r.body._locked).toBe(true);
    }
    expect((await reactSave("F1-S", B)).status).toBe(409);
    expect((await mail(mailFields("F1-S", B, "audit-f1-0003", { forceResend: "1" }))).status).toBe(409);
  }, 120000);

  it("an offer the old app stored never changes its price — no send log needed (owner 2026-11-18)", async () => {
    const A = { ...BU, offerNumber: "F1-OLD-U" }, B = changedPrice(A);
    // stored as the old app (and today's UI) stores it: no marker; no mail log, no letter, no signature
    await db().collection("offers").insertOne({ offerNumber: "F1-OLD-U", offerType: "bu", payload: A, pricing: { total: 999.99, selfPayAmount: 0 }, pricingFingerprint: "stale", locked: true, createdAt: new Date("2026-06-01"), updatedAt: new Date("2026-06-01") });

    for (const p of [{ zusammenfassung: { versand: { art: "pdf" } }, ...A }, B, { ...B, forceRecompute: true }]) {
      const r = await call("POST", "/api/price", p);
      expect(r.body.total).toBe(999.99);
      expect(r.body._locked).toBe(true);
    }
    // saved changed — by today's UI, and by the React app (it did not create this offer)
    for (const save of [() => call("POST", "/api/offers", { offerNumber: "F1-OLD-U", offerType: "bu", payload: B }), () => reactSave("F1-OLD-U", B)]) {
      const r = await save();
      expect(r.status).toBe(200);
      expect(r.body.offer.pricing.total).toBe(999.99);
    }
    const mailed = await mail(mailFields("F1-OLD-U", B, "audit-f1-0004", { client: "react" }));
    expect(mailed.status, JSON.stringify(mailed.body).slice(0, 300)).toBe(200);
    expect(mailed.body.offerTotal).toBe(999.99);
    expect((await stored("F1-OLD-U")).pricing.total).toBe(999.99);
    // a save through today's UI under a NEW number is an old-app offer too
    const nowOld = await call("POST", "/api/offers", { offerNumber: "F1-OLD-N", offerType: "bu", payload: { ...A, offerNumber: "F1-OLD-N" } });
    const changed = await call("POST", "/api/price", { ...B, offerNumber: "F1-OLD-N" });
    expect(changed.body.total).toBe(nowOld.body.offer.pricing.total);
    expect(changed.body._locked).toBe(true);
  }, 120000);

  it("an offer the old app SENT (its mail log): pinned, and the changed offer cannot go out under that number", async () => {
    const A = { ...BU, offerNumber: "F1-OLD-S" }, B = changedPrice(A);
    await db().collection("offers").insertOne({ offerNumber: "F1-OLD-S", offerType: "bu", payload: A, pricing: { total: 999.99, selfPayAmount: 0 }, pricingFingerprint: "stale", locked: true, createdAt: new Date("2026-06-01"), updatedAt: new Date("2026-06-01") });
    await db().collection("emaillogs").insertOne({ offerNumber: "F1-OLD-S", to: "k@example.invalid", subject: "x", createdAt: new Date("2026-06-02") });
    const oldSent = await call("POST", "/api/price", B);
    expect(oldSent.body.total).toBe(999.99);
    expect(oldSent.body._locked).toBe(true);
    const refused = await mail(mailFields("F1-OLD-S", B, "audit-f1-0005"));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("OFFER_CHANGED");
    const same = await mail(mailFields("F1-OLD-S", A, "audit-f1-0006"));
    expect(same.status, JSON.stringify(same.body).slice(0, 300)).toBe(200);
    expect(same.body.offerTotal).toBe(999.99);
  }, 120000);

  it("the React app hands an offer over for signature without having saved it: the server stores it as a React offer", async () => {
    const A = { ...BU, offerNumber: "F1-HAND" }, B = changedPrice(A);
    const freshTotal = await totalOf(B, "F1-FRESH");
    const s = await call("POST", "/api/signing", { payload: A, offerNumber: "F1-HAND", offerType: "bu", sendEmail: false, sendId: "audit-f1-0009", client: "react" });
    expect(s.status).toBe(201);
    expect((await call("POST", "/api/price", B)).body.total).toBe(freshTotal); // not signed yet → still changeable
    // the same hand-over from today's UI: an old-app offer, pinned
    const A2 = { ...BU, offerNumber: "F1-HAND-OLD" };
    await call("POST", "/api/signing", { payload: A2, offerNumber: "F1-HAND-OLD", offerType: "bu", sendEmail: false, sendId: "audit-f1-0010" });
    const r = await call("POST", "/api/price", changedPrice(A2));
    expect(r.body._locked).toBe(true);
    expect(r.body.total).toBe((await stored("F1-HAND-OLD")).pricing.total);
  }, 120000);

  it("sign on site, go back, change, sign on site again: the signing view shows the new total", async () => {
    const A = { ...BU, offerNumber: "F1-SIGN" }, B = changedPrice(A);
    const freshTotal = await totalOf(B, "F1-FRESH");
    const de = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await reactSave("F1-SIGN", A);
    const s1 = await call("POST", "/api/signing", { payload: A, offerNumber: "F1-SIGN", offerType: "bu", sendEmail: false, sendId: "audit-f1-0007" });
    const s2 = await call("POST", "/api/signing", { payload: B, offerNumber: "F1-SIGN", offerType: "bu", sendEmail: false, sendId: "audit-f1-0008" });
    expect([s1.status, s2.status]).toEqual([201, 201]);
    const html = await v2.inject({ method: "GET", url: `/api/signing/${s2.body.token}/documents/angebot/html` });
    expect(html.body).toContain(de(freshTotal));
    expect((await stored("F1-SIGN")).pricing.total).toBe(freshTotal);
  }, 120000);
});

describe("F3 — \"Original per Post senden\" never posts another document", () => {
  it("no stored original (signed on site, not completed): refused, nothing goes to the printer", async () => {
    const A = { ...BU, offerNumber: "F3-A" };
    const s = await call("POST", "/api/signing", { payload: A, offerNumber: "F3-A", offerType: "bu", dealId: "9402", sendEmail: false, sendId: "audit-f3-0001" });
    expect(s.body.documents.length).toBeGreaterThan(1);
    expect((await sign(s.body.token, s.body.documents[0])).statusCode).toBe(200);
    const changedPdf = await pdfTitled("CHANGED OFFER PDF");
    bx.take("v2");
    const orig = await call("POST", "/api/post/send", { ...letterFor("F3-A", "9402", changedPdf), sendId: "audit-f3-0002", useSentOriginal: true });
    expect(orig.status).toBe(409);
    expect(orig.body).toMatchObject({ ok: false, error: { code: "ORIGINAL_NOT_STORED" } });
    expect(orig.body.error.message).toMatch(/Original/);
    expect(bx.take("v2").filter((c: any) => String(c.method || "").startsWith("ob24:"))).toHaveLength(0);
    const rec: any = await db().collection("offer_sends").findOne({ sendId: "audit-f3-0002" });
    expect(rec, JSON.stringify(rec)).toMatchObject({ status: "failed", files: [] });
  }, 120000);

  it("signed on site and completed: the signed offer is the original that is posted", async () => {
    const A = { ...ONE_DOC, offerNumber: "F3-B" };
    const s = await call("POST", "/api/signing", { payload: A, offerNumber: "F3-B", offerType: "bu", dealId: "9404", sendEmail: false, sendId: "audit-f3-0003" });
    realPdfs = true;
    const done = await sign(s.body.token);
    realPdfs = false;
    expect(done.json()).toMatchObject({ ok: true, completed: true });
    const onsite: any = await db().collection("offer_sends").findOne({ sendId: "audit-f3-0003" });
    const signedFile = onsite.files.find((f: any) => f.role === "signed" && f.filename === "angebot_F3-B.pdf");
    expect(signedFile).toBeTruthy();
    const { readSendFile } = await import("../src/modules/sends/store.js");
    const signedPdf = (await readSendFile(signedFile.fileId))!;
    const orig = await call("POST", "/api/post/send", { ...letterFor("F3-B", "9404", await pdfTitled("CHANGED OFFER PDF")), sendId: "audit-f3-0004", useSentOriginal: true });
    expect(orig.status, JSON.stringify(orig.body).slice(0, 300)).toBe(200);
    expect(orig.body.resendOf.sendId).toBe("audit-f3-0003");
    const rec: any = await db().collection("offer_sends").findOne({ sendId: "audit-f3-0004" });
    expect(rec.identity).toEqual(onsite.identity);
    const letter = (await readSendFile(rec.files.find((f: any) => f.role === "letter").fileId))!;
    expect(letter.equals(signedPdf)).toBe(true);
  }, 120000);
});

describe("F8 — after a send the stored offer is the sent content", () => {
  it("an older stored state is replaced by what was sent, with the price as sent", async () => {
    const A = { ...BU, offerNumber: "F8-A" }, B = changedPrice({ ...A, Kundendaten: { ...A.Kundendaten, lastName: "Anders" } });
    await reactSave("F8-A", A);
    const sent = await mail(mailFields("F8-A", B, "audit-f8-0001"));
    expect(sent.status).toBe(200);
    const offer = await stored("F8-A");
    const rec: any = await db().collection("offer_sends").findOne({ sendId: "audit-f8-0001" });
    expect(offer.payload.Kundendaten.lastName).toBe("Anders");
    expect(offer.pricing.total).toBe(rec.total);
    expect(offer.pricing.total).toBe(sent.body.offerTotal);
    expect(offer.locked).toBe(true);
    // the stored offer can be saved again (PDF download after the send) — it is the sent one
    const again = await call("POST", "/api/offers", { offerNumber: "F8-A", offerType: "bu", payload: offer.payload });
    expect(again.status, JSON.stringify(again.body).slice(0, 300)).toBe(200);
    expect(again.body.offer.pricing.total).toBe(rec.total);
  }, 120000);
});

describe("F9 — \"Nur in Bitrix ablegen\" is not a send to the customer", () => {
  it("the offer may still be changed, saved and mailed afterwards", async () => {
    const A = { ...BU, offerNumber: "F9-A" }, B = { ...A, Kundendaten: { ...A.Kundendaten, lastName: "Anders" } };
    const filed = await mail(mailFields("F9-A", A, "audit-f9-0001", { bitrixOnly: "1", to: "", dealId: "9401" }));
    expect(filed.body).toMatchObject({ ok: true, bitrixOnly: true });
    const { lastSentOffer } = await import("../src/modules/sends/store.js");
    expect(await lastSentOffer("F9-A")).toBeNull();
    expect((await call("POST", "/api/offers", { offerNumber: "F9-A", offerType: "bu", payload: B })).status).toBe(200);
    const changed = await mail(mailFields("F9-A", B, "audit-f9-0002", { dealId: "9401" }));
    expect(changed.status, JSON.stringify(changed.body).slice(0, 300)).toBe(200);
    expect(changed.body.resendOf).toBeUndefined();
    expect(((await db().collection("offer_sends").findOne({ sendId: "audit-f9-0002" })) as any).resendOf).toBe("");
  }, 120000);
});

describe("F10 — one open signing request per offer", () => {
  it("mail twice and on-site afterwards: the same request every time", async () => {
    const A = { ...BU, offerNumber: "F10-A" };
    const one = await mail(mailFields("F10-A", { ...A, mail: { subject: "a", body: "x" } }, "audit-f10-0001", { dealId: "9403" }));
    const two = await mail(mailFields("F10-A", { ...A, mail: { subject: "a", body: "x" }, zusammenfassung: { versand: { art: "mail", versendetAm: "2026-11-17T10:00:00Z" } } }, "audit-f10-0002", { dealId: "9403", forceResend: "1" }));
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await openRequests("F10-A")).toHaveLength(1);
    const onsite = await call("POST", "/api/signing", { payload: { ...A, zusammenfassung: { versand: { art: "mail" } } }, offerNumber: "F10-A", offerType: "bu", dealId: "9403", sendEmail: false, sendId: "audit-f10-0003" });
    expect(onsite.status).toBe(201);
    expect(onsite.body.reused).toBe(true);
    const open = await openRequests("F10-A");
    expect(open).toHaveLength(1);
    expect(onsite.body.token).toBe(open[0]!.token);
  }, 120000);

  it("requests left open by earlier sends, and one for an older state of the offer, are closed and cannot be signed", async () => {
    const A = { ...BU, offerNumber: "F10-B" }, B = { ...A, Kundendaten: { ...A.Kundendaten, lastName: "Anders" } };
    // as stored before the fix: two open requests for the same offer
    const s1 = await call("POST", "/api/signing", { payload: A, offerNumber: "F10-B", offerType: "bu", sendEmail: false });
    const dup = await db().collection("signingrequests").findOne({ token: s1.body.token }) as any;
    await db().collection("signingrequests").insertOne({ ...dup, _id: new mongoose.Types.ObjectId(), token: "f10-duplicate-token", createdAt: new Date(Date.now() - 60000) });
    expect(await openRequests("F10-B")).toHaveLength(2);
    const s2 = await call("POST", "/api/signing", { payload: A, offerNumber: "F10-B", offerType: "bu", sendEmail: false });
    expect(s2.body).toMatchObject({ reused: true, token: s1.body.token });
    expect(await openRequests("F10-B")).toHaveLength(1);
    expect((await v2.inject({ method: "GET", url: "/api/signing/f10-duplicate-token" })).statusCode).toBe(410);
    expect((await sign("f10-duplicate-token", s1.body.documents[0])).statusCode).toBe(410);

    // not signed yet, so the offer may change: the new state gets a new request, the old one is closed
    const s3 = await call("POST", "/api/signing", { payload: B, offerNumber: "F10-B", offerType: "bu", sendEmail: false, force: true });
    expect(s3.status).toBe(201);
    expect(s3.body.token).not.toBe(s1.body.token);
    const open = await openRequests("F10-B");
    expect(open.map((r: any) => r.token)).toEqual([s3.body.token]);
    expect((await sign(s1.body.token, s1.body.documents[0])).statusCode).toBe(410);
  }, 120000);
});

describe("F4 — an offer that went out hand-edited (server part)", () => {
  const docx = (text: string) => ({ editedDocx: { filename: "angebot.docx", content: `PK-${text}` } });

  it("is not handed over for signature from the form data, and is resent only with the same document", async () => {
    const A = { ...BU, offerNumber: "F4-A" };
    const first = await mail(mailFields("F4-A", A, "audit-f4-0001", docx("hand-edited")));
    expect(first.body).toMatchObject({ ok: true, signingLink: "off-hand-edited" });
    const rec: any = await db().collection("offer_sends").findOne({ sendId: "audit-f4-0001" });
    expect(rec.identity.handEdited).toBe(rec.files.find((f: any) => f.role === "editedDocx").sha256);

    const signing = await call("POST", "/api/signing", { payload: A, offerNumber: "F4-A", offerType: "bu", sendEmail: false, sendId: "audit-f4-0002" });
    expect(signing.status).toBe(409);
    expect(signing.body.error.code).toBe("HAND_EDITED_SENT");
    expect(signing.body.error.message).toMatch(/von Hand bearbeitet/);
    expect(await openRequests("F4-A")).toHaveLength(0);

    for (const [sendId, extra] of [["audit-f4-0003", {}], ["audit-f4-0004", docx("another edit")]] as const) {
      const r = await mail(mailFields("F4-A", A, sendId, { forceResend: "1", ...extra }));
      expect(r.status, sendId).toBe(409);
      expect(r.body.error.code, sendId).toBe("HAND_EDITED_SENT");
    }
    const same = await mail(mailFields("F4-A", A, "audit-f4-0005", { forceResend: "1", ...docx("hand-edited") }));
    expect(same.status, JSON.stringify(same.body).slice(0, 300)).toBe(200);
  }, 120000);

  it("sent as the standard document: a resend with a hand-edited one is another document and refused", async () => {
    const A = { ...BU, offerNumber: "F4-B" };
    expect((await mail(mailFields("F4-B", A, "audit-f4-0006"))).status).toBe(200);
    const edited = await mail(mailFields("F4-B", A, "audit-f4-0007", { forceResend: "1", ...docx("hand-edited") }));
    expect(edited.status).toBe(409);
    expect(edited.body.error.code).toBe("OFFER_CHANGED");
    // a record from before this field existed counts as not hand-edited: signing stays possible
    const signing = await call("POST", "/api/signing", { payload: A, offerNumber: "F4-B", offerType: "bu", sendEmail: false, sendId: "audit-f4-0008" });
    expect(signing.status).toBe(201);
  }, 120000);
});
