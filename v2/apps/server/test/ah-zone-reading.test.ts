// ADR 028 addendum 2026-11-23 (owner): an AH offer sent from now on follows the screen's reading of
// the travel zone (travel time + Hof rule); an offer that already went out keeps the figures it went
// out with. Through the real routes (mail send, resend, download, signing page, signature, „ANG
// verschickt“ move) with the harness of deal-variants-signing.test.ts: in-memory MongoDB, SMTP sink,
// a recording Bitrix stub — nothing leaves the machine.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import PizZip from "pizzip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { ahDocumentInput, ahInputFromPayload, ahOfferTotals } from "@oc/pricing";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { offerIdentity } from "../src/modules/sends/identity.js";
import { BitrixStub, type RecordedCall } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";
import { SmtpSink } from "./helpers/smtp-sink.js";
// @ts-expect-error plain JS helper
import { fakePdf } from "./helpers/fake-pdf.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const fx = (p: string) => JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/" + p, "utf8"));
const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
let mongod: MongoMemoryServer, v2: FastifyInstance, token = "";
const bx = new BitrixStub({
  ...BITRIX_HANDLERS,
  "crm.deal.get": (p, app) => (/^96\d\d$/.test(p.get("id") ?? "") ? { result: { ID: p.get("id"), STAGE_ID: "C52:NEW", OPPORTUNITY: "1", CURRENCY_ID: "EUR" } } : BITRIX_HANDLERS["crm.deal.get"]!(p, app)),
  "crm.deal.update": () => ({ result: true }),
  "tasks.task.add": () => ({ result: { task: { id: 55 } } }),
});
const smtp = new SmtpSink();
const MAIL = { SMTP_EMAIL: "angebote@test.local", SMTP_PASS: "smtp-test-pass", SMTP_REPLY_TO: "service@test.local", PUBLIC_BASE_URL: "http://oc.test" };

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
  const vigor = fx("docs/vigor-products.json");
  if (vigor.length) await client.db("vigor").collection("products").insertMany(vigor);
  await client.close();
  const cfg = loadConfig({
    NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET,
    BITRIX_WEBHOOK_BASE: bx.base("v2"), BITRIX_MIN_GAP_MS: "0", PLANNING_API_BASE_URL: bx.planningBase("v2"), OFFER_LINK_BASE: "http://oc.test",
    OB24_BASE_URL: bx.ob24Base("v2"), OB24_API_KEY: "ob24-test-key", OB24_API_SECRET: "ob24-test-secret", OB24_MODE: "test", EXTERNAL_API_KEY: "ext-test-key",
    SMTP_HOST: "127.0.0.1", SMTP_SEND_PORT: String(smtp.port), SMTP_PORT: String(smtp.port), SIGNING_OFFICE_EMAIL: "buero@test.local", IMAP_HOST: "127.0.0.1", IMAP_PORT: "9", ...MAIL,
  });
  await connectDb(cfg, { info: () => {} });
  // the "PDF" of a DOCX is the DOCX itself here, so the printed figures can be read back
  v2 = await buildApp(cfg, { register: (a) => registerApi(a, { cfg, mailTls: { rejectUnauthorized: false }, pdfEngine: { docxToPdf: async (b: Buffer) => b, htmlToPdf: async (html: string) => fakePdf(html) } }) });
  const r = await v2.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: USER });
  token = r.json().token;
  const { migrateOfferSendIndexes } = await import("../src/modules/sends/store.js"); await migrateOfferSendIndexes();
  const { migrateDealDraftIndexes } = await import("../src/modules/deal-drafts/store.js"); await migrateDealDraftIndexes();
}, 180000);
afterAll(async () => { await v2?.close(); await disconnectDb(); await mongod?.stop(); await bx.stop(); await smtp.stop(); });

const db = () => mongoose.connection.db!;
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const rand = () => Math.random().toString(36).slice(2, 10);
const call = async (method: string, url: string, body?: unknown) => {
  const r = await v2.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
  let j: any = null; try { j = r.json(); } catch { /* */ }
  return { status: r.statusCode, body: j, raw: r.rawPayload, text: r.body };
};
const mail = async (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const rq = new Request("http://x/", { method: "POST", body: fd });
  const r = await v2.inject({ method: "POST", url: "/api/email/send-offer", headers: { authorization: `Bearer ${token}`, "content-type": rq.headers.get("content-type")! }, payload: Buffer.from(await rq.arrayBuffer()) });
  return { status: r.statusCode, body: r.json() };
};
const fieldsOf = (c: RecordedCall) => {
  const f: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(c.params)) { const m = /^fields\[([^\]]+)\](.*)$/.exec(k); if (m) f[m[1]! + m[2]!] = v; }
  return f;
};
const updates = (calls: RecordedCall[]) => calls.filter((c) => c.method === "crm.item.update").map((c) => fieldsOf(c));
const docxText = (buf: Buffer) => new PizZip(buf).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
const eur = (n: number) => n.toFixed(2).replace(".", ",");

// ---- an offer whose saved zone does not match its travel time (Hof postcode, travel 0:11 saved as zone 2) ----
const BASE = (fx("ah/payloads.json") as any[]).find((x) => x.payload.Kundendaten?.payer === "Selbstzahler").payload;
const AH: any = structuredClone(BASE);
AH.activeOffer = "ah";
AH.Kundendaten = { ...AH.Kundendaten, payer: "Kassenkunde", postalCode: "95032", email: "kunde@example.invalid" };
AH.Arbeitszeit = { ...AH.Arbeitszeit, travelTimeHHMM: "0:11", ahTravelZone: "2" };
AH.Finanzierung = {};
const CFG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };
const OLD = ahOfferTotals(ahDocumentInput(AH, CFG, "document")).customerAmount; // as the documents read it before
const NEW = ahOfferTotals(ahInputFromPayload(AH, CFG)).customerAmount; // as the screen shows it
const ZONE = { 1: "1928", 2: "1930" } as const;
const as = (nr: string) => ({ ...structuredClone(AH), offerNumber: nr });

const send = (nr: string, dealId: string) => mail({
  to: "kunde@example.invalid", subject: "Alltagshilfe", offerNumber: nr, offerType: "ah", payload: JSON.stringify(as(nr)), dealId, contactId: "101",
  body: "Guten Tag {{SIGN_LINK}}", sendId: `zr-${nr}-${rand()}`, forceResend: "1",
});
const record = (sendId: string) => db().collection("offer_sends").findOne({ sendId });
const download = async (nr: string) => {
  const r = await v2.inject({ method: "POST", url: "/docx-template", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: as(nr) as any });
  expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
  return docxText(r.rawPayload);
};
const signingPage = async (tok: string) => (await call("GET", `/api/signing/${tok}/documents/angebot/html`)).text;
const move = async (dealId: string, nr: string) => {
  bx.take("v2");
  const r = await call("POST", `/api/bitrix/deal/${dealId}/move-ang-verschickt`, { offerType: "ah", offerNumber: nr, payload: JSON.stringify(as(nr)) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  await wait();
  return updates(bx.take("v2")).find((f) => "opportunity" in f)!;
};
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const FILL = { kk_versichertennr: "K1", kassenkundeName: "AOK", geburtsdatum: "01.01.1940", phone: "0170", pflegegrad: "2", kk_pflegegradSeit: "2023", kk_krankenkasseAdresse: "Hof", street: "Weg 1", postalCode: "95032", city: "Hof", firstName: "Erika", lastName: "Muster" };
const bodyFor = (key: string) => key === "angebot" ? { signatureImage: PNG, extraFields: { paymentTermIdx: 0 } } : key === "zusatzblatt" ? { signatureImage: PNG } : { signatureImage: PNG, editedFields: FILL };
/** signs every document; the Bitrix stage update of the completion */
async function signAll(tok: string) {
  const keys: string[] = (await call("GET", `/api/signing/${tok}`)).body.documents.map((d: any) => d.key);
  bx.take("v2");
  let last: any = null;
  for (const k of keys) { last = await call("POST", `/api/signing/${tok}/documents/${k}`, bodyFor(k)); expect(last.status, JSON.stringify(last.body)).toBe(200); }
  expect(last.body).toMatchObject({ completed: true });
  await wait(150);
  return updates(bx.take("v2")).find((f) => "opportunity" in f);
}
async function handOver(dealId: string, nr: string) {
  const r = await call("POST", "/api/signing", { payload: as(nr), offerNumber: nr, offerType: "ah", dealId, sendEmail: false, sendId: `zh-${nr}-${rand()}` });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.token as string;
}

describe("the offer used here", () => {
  it("prints another figure in the two readings (Hof: 0:11 is zone 1 on the screen, saved as zone 2)", () => {
    expect(ahInputFromPayload(AH, CFG).zone?.zone).toBe(1);
    expect(OLD).toBeGreaterThan(NEW);
    expect([OLD, NEW]).toEqual([ahOfferTotals(ahDocumentInput(AH, CFG, "document")).net, ahOfferTotals(ahDocumentInput(AH, CFG, "screen")).net]);
  });
});

describe("an offer sent from now on: the screen's figure everywhere, and it stays so", () => {
  const NR = "ZR-NEU-1", DEAL = "9620";
  let first = "", tok = "";

  it("send: document, mail answer, send record and marker", async () => {
    const r = await send(NR, DEAL);
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    expect(r.body.offerTotal).toBe(NEW);
    first = r.body.sendId;
    const rec: any = await record(first);
    expect(rec).toMatchObject({ status: "done", total: NEW, ahZoneReading: "screen" });
    tok = rec.signingToken;
    expect(tok).toBeTruthy();
    // the PDF that went out (here: the DOCX itself)
    const file = rec.files.find((f: any) => f.role === "offer");
    const bytes = await call("GET", `/api/sends/${encodeURIComponent(first)}/files/${encodeURIComponent(file.fileId)}`);
    expect(bytes.status).toBe(200);
    const text = docxText(bytes.raw);
    expect(text).toContain(eur(NEW));
    expect(text).not.toContain(eur(OLD));
  });

  it("signing page of the open request, download, „ANG verschickt“ (amount and Anfahrtszone)", async () => {
    const page = await signingPage(tok);
    expect(page).toContain(eur(NEW));
    expect(page).not.toContain(eur(OLD));
    const dl = await download(NR);
    expect(dl).toContain(eur(NEW));
    expect(dl).not.toContain(eur(OLD));
    const u = await move(DEAL, NR);
    expect(Number(u.opportunity)).toBe(NEW);
    expect(u.UF_CRM_1711019971).toBe(ZONE[1]);
  });

  it("resend: the same figure, the same marker", async () => {
    const r = await send(NR, DEAL);
    expect(r.status).toBe(200);
    expect(r.body.offerTotal).toBe(NEW);
    expect(await record(r.body.sendId)).toMatchObject({ total: NEW, ahZoneReading: "screen", resendOf: first });
  });

  it("signature: the deal amount is the figure sent", async () => {
    const u = await signAll(tok);
    expect(Number(u!.opportunity)).toBe(NEW);
    expect(await download(NR)).toContain(eur(NEW)); // after the signature too
  });

  it("on-site hand-over of a new offer: page and signature with the screen's figure", async () => {
    const t = await handOver("9621", "ZR-NEU-2");
    expect(await db().collection("offer_sends").findOne({ signingToken: t })).toMatchObject({ ahZoneReading: "screen" });
    expect(await signingPage(t)).toContain(eur(NEW));
    expect(Number((await signAll(t))!.opportunity)).toBe(NEW);
  });
});

describe("an offer sent BEFORE this change keeps its figures", () => {
  it("send record without the marker: resend, download, move use the old reading; the new record says so", async () => {
    const NR = "ZR-ALT-1", DEAL = "9622";
    await db().collection("offer_sends").insertOne({
      sendId: `old-${rand()}`, channel: "email", status: "done", offerNumber: NR, offerType: "ah", by: "", dealId: DEAL, to: "kunde@example.invalid",
      payload: as(NR), identity: offerIdentity(as(NR), NR), total: OLD, files: [], steps: {}, startedAt: new Date(Date.now() - 86400000), finishedAt: new Date(Date.now() - 86400000),
    });
    expect(await download(NR)).toContain(eur(OLD));
    const r = await send(NR, DEAL);
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    expect(r.body.offerTotal).toBe(OLD);
    const rec: any = await record(r.body.sendId);
    expect(rec).toMatchObject({ total: OLD, ahZoneReading: "document" });
    expect(await signingPage(rec.signingToken)).toContain(eur(OLD));
    const u = await move(DEAL, NR);
    expect(Number(u.opportunity)).toBe(OLD);
    expect(u.UF_CRM_1711019971).toBe(ZONE[2]);
    expect(Number((await signAll(rec.signingToken))!.opportunity)).toBe(OLD);
  });

  it("the old app's e-mail log only: the old reading", async () => {
    const NR = "ZR-ALT-2";
    await db().collection("emaillogs").insertOne({ offerNumber: NR, to: "kunde@example.invalid", createdAt: new Date(Date.now() - 86400000) });
    expect(await download(NR)).toContain(eur(OLD));
    const r = await send(NR, "9623");
    expect(r.body.offerTotal).toBe(OLD);
    expect(await record(r.body.sendId)).toMatchObject({ total: OLD, ahZoneReading: "document" });
  });

  it("an on-site request handed over before the change (record without marker): page and signature with the old figure", async () => {
    const t = await handOver("9624", "ZR-ALT-3");
    await db().collection("offer_sends").updateMany({ offerNumber: "ZR-ALT-3" }, { $unset: { ahZoneReading: "" } });
    expect(await signingPage(t)).toContain(eur(OLD));
    expect(Number((await signAll(t))!.opportunity)).toBe(OLD);
  });

  it("„Neue Version“ of a sent offer (new number, not sent yet): the screen's figure", async () => {
    const r = await send("ZR-ALT-1-V2", "9625");
    expect(r.body.offerTotal).toBe(NEW);
    expect(await record(r.body.sendId)).toMatchObject({ total: NEW, ahZoneReading: "screen" });
    expect(await download("ZR-ALT-1-V2")).toContain(eur(NEW));
  });
});
