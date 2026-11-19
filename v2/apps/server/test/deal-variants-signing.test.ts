// ADR 027 A, step 3: the signature decides the variant. Through the real routes (hand-over,
// customer signing, completion, mail, post, move) with the harness of deal-variants-send.test.ts:
// in-memory MongoDB, SMTP sink, a recording Bitrix stub — nothing leaves the machine.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EJSON } from "bson";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { DealVariantsResponseSchema } from "@oc/api-contract";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { BitrixStub, type RecordedCall } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";
import { SmtpSink } from "./helpers/smtp-sink.js";
// @ts-expect-error plain JS helper
import { fakePdf } from "./helpers/fake-pdf.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const fx = (p: string) => JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/" + p, "utf8"));
const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
const FAILING_DEAL = "9605"; // crm.item.update is refused for this deal
let mongod: MongoMemoryServer, v2: FastifyInstance, token = "";
const bx = new BitrixStub({
  ...BITRIX_HANDLERS,
  "crm.deal.get": (p, app) => (/^96\d\d$/.test(p.get("id") ?? "") ? { result: { ID: p.get("id"), STAGE_ID: "C38:NEW", OPPORTUNITY: "1", CURRENCY_ID: "EUR" } } : BITRIX_HANDLERS["crm.deal.get"]!(p, app)),
  "crm.item.update": (p, app) => (p.get("id") === FAILING_DEAL ? { error: "ACCESS_DENIED", error_description: "Access denied" } : BITRIX_HANDLERS["crm.item.update"]!(p, app)),
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
  v2 = await buildApp(cfg, { register: (a) => registerApi(a, { cfg, mailTls: { rejectUnauthorized: false }, pdfEngine: { docxToPdf: async () => Buffer.from("%PDF-1.4\n%%EOF\n"), htmlToPdf: async (html: string) => fakePdf(html) } }) });
  const r = await v2.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: USER });
  token = r.json().token;
  const { migrateOfferSendIndexes } = await import("../src/modules/sends/store.js"); await migrateOfferSendIndexes();
  const { migrateDealDraftIndexes } = await import("../src/modules/deal-drafts/store.js"); await migrateDealDraftIndexes();
}, 180000);
afterAll(async () => { await v2?.close(); await disconnectDb(); await mongod?.stop(); await bx.stop(); await smtp.stop(); });

const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
const byNo = (n: string) => JSON.parse(JSON.stringify(offers.find((o) => o.offerNumber === n).payload));
const SZ = byNo("ANG2026-1103-134214"), KASSE = byNo("ANG2026-1104-093242");
const AH = JSON.parse(JSON.stringify((fx("ah/payloads.json") as any[]).find((x) => x.payload.Kundendaten?.payer === "Selbstzahler").payload));
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const FILL = { kk_versichertennr: "K1", kassenkundeName: "AOK", geburtsdatum: "01.01.1940", phone: "0170", pflegegrad: "2", kk_pflegegradSeit: "2023", kk_krankenkasseAdresse: "Hof", street: "Weg 1", postalCode: "95028", city: "Hof", firstName: "Erika", lastName: "Muster" };
const db = () => mongoose.connection.db!;
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const call = async (method: string, url: string, body?: unknown) => {
  const r = await v2.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
  let j: any = null; try { j = r.json(); } catch { /* */ }
  return { status: r.statusCode, body: j };
};
const mail = async (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const rq = new Request("http://x/", { method: "POST", body: fd });
  const r = await v2.inject({ method: "POST", url: "/api/email/send-offer", headers: { authorization: `Bearer ${token}`, "content-type": rq.headers.get("content-type")! }, payload: Buffer.from(await rq.arrayBuffer()) });
  return { status: r.statusCode, body: r.json() };
};
const rand = () => Math.random().toString(36).slice(2, 10);

// ---- Bitrix calls as data ----
const fieldsOf = (c: RecordedCall) => {
  const f: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(c.params)) { const m = /^fields\[([^\]]+)\]$/.exec(k); if (m) f[m[1]!] = v; }
  return f;
};
const updates = (calls: RecordedCall[]) => calls.filter((c) => c.method === "crm.item.update").map((c) => ({ id: new URLSearchParams(c.params).get("id"), fields: fieldsOf(c) }));
const comments = (calls: RecordedCall[]) => calls.filter((c) => c.method === "crm.timeline.comment.add").map((c) => fieldsOf(c).COMMENT ?? "");
const errorCodes = async (dealId: string) => (await db().collection("error_events").find({ dealId }).toArray()).map((e: any) => e.code);

// ---- deals, variants, hand-overs, signatures ----
async function firstVariant(dealId: string, nr: string, payload: any) {
  const r = await call("PUT", `/api/deals/${dealId}/draft`, { offerType: String(payload.activeOffer || "bu"), payload: { ...payload, offerNumber: nr }, baseRevision: 0 });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return "v1";
}
async function addVariant(dealId: string, name: string, nr: string, payload: any, from = "v1") {
  const created = await call("POST", `/api/deals/${dealId}/variants`, { name, from });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const V = created.body.variant.variantId as string;
  const d = await call("GET", `/api/deals/${dealId}/draft?variant=${V}`);
  const r = await call("PUT", `/api/deals/${dealId}/draft?variant=${V}`, { offerType: String(payload.activeOffer || "bu"), payload: { ...payload, offerNumber: nr }, baseRevision: d.body.revision });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return V;
}
/** on-site hand-over (send record), optionally with the total the record carries */
async function handOver(dealId: string, nr: string, payload: any, a: { variantId?: string; total?: number } = {}) {
  const r = await call("POST", "/api/signing", {
    payload: { ...payload, offerNumber: nr }, offerNumber: nr, offerType: String(payload.activeOffer || "bu"), dealId, sendEmail: false, sendId: `sig-${nr}-${rand()}`,
    ...(a.variantId ? { variantId: a.variantId } : {}),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  if (a.total !== undefined) await db().collection("offer_sends").updateOne({ signingToken: r.body.token }, { $set: { total: a.total } });
  return r.body.token as string;
}
const bodyFor = (key: string) => key === "angebot" ? { signatureImage: PNG, extraFields: { paymentTermIdx: 0 } }
  : key === "zusatzblatt" ? { signatureImage: PNG }
  : { signatureImage: PNG, editedFields: FILL };
async function docsOf(tok: string): Promise<string[]> { return (await call("GET", `/api/signing/${tok}`)).body.documents.map((d: any) => d.key); }
async function signDocs(tok: string, keys: string[]) {
  let last: any = null;
  for (const k of keys) { last = await call("POST", `/api/signing/${tok}/documents/${k}`, bodyFor(k)); expect(last.status, JSON.stringify(last.body)).toBe(200); }
  return last;
}
/** signs everything; returns the Bitrix calls of the LAST signature (the completion is in it) */
async function signAll(tok: string) {
  const keys = await docsOf(tok);
  await signDocs(tok, keys.slice(0, -1));
  await wait(); bx.take("v2");
  const last = await signDocs(tok, keys.slice(-1));
  expect(last.body).toMatchObject({ completed: true });
  await wait();
  return bx.take("v2");
}
const LINK = (nr: string) => `http://oc.test/?offer=${encodeURIComponent(nr)}`;
const SZ_STAGE = { categoryId: "38", stageId: "C38:UC_5DII17" };
const KASSE_STAGE = { categoryId: "38", stageId: "C38:UC_ON3GS1", UF_CRM_1771944212969: "8396", UF_CRM_1771944969284: "8400", UF_CRM_1772533113350: "8412", UF_CRM_1772533223056: "8418" };
const amount = (t: string, nr: string) => ({ opportunity: t, isManualOpportunity: "Y", currencyId: "EUR", UF_CRM_1768391021079: t, UF_CRM_1776156870205: nr, UF_CRM_1790772236055: LINK(nr) });

describe("one variant: today's completion plus the signed offer's amount fields", () => {
  it("SZ: exact field set, same calls as before (✍️ note, ✅ note, ONE update), note text unchanged, completion runs once", async () => {
    const DEAL = "9601";
    await firstVariant(DEAL, "S1-SZ", SZ);
    const tok = await handOver(DEAL, "S1-SZ", SZ, { total: 2345.67 });
    const calls = await signAll(tok);
    expect(calls.map((c) => c.method)).toEqual(["crm.timeline.comment.add", "crm.timeline.comment.add", "crm.item.update"]);
    expect(updates(calls)).toEqual([{ id: DEAL, fields: { ...SZ_STAGE, ...amount("2345.67", "S1-SZ") } }]);
    expect(comments(calls)[1]).toBe("✅ Alle Dokumente unterschrieben (S1-SZ)\nSignierte PDFs sind angehängt.");
    // the same signature again: first result, no second completion, no Bitrix call
    const keys = await docsOf(tok).catch(() => ["angebot"]);
    const again = await call("POST", `/api/signing/${tok}/documents/${keys.slice(-1)[0]}`, bodyFor(keys.slice(-1)[0]!));
    expect(again.body).toMatchObject({ duplicate: true, completed: true });
    await wait();
    expect(bx.take("v2")).toEqual([]);
    expect((await call("GET", `/api/deals/${DEAL}/variants`)).body.variants.map((v: any) => v.status)).toEqual(["signed"]);
  });

  it("KASSE: Kasse fields + Eigenanteil as today, plus amount, number and link; total from the stored offer when the record has none", async () => {
    const DEAL = "9611";
    const tok = await handOver(DEAL, "S1-KK", KASSE); // no draft at all (today's UI) and no total on the record
    const stored: any = await db().collection("offers").findOne({ offerNumber: "S1-KK" });
    const total = Number(stored.pricing.total);
    expect(total).toBeGreaterThan(0);
    const calls = await signAll(tok);
    const [u] = updates(calls);
    expect(Object.keys(u!.fields).sort()).toEqual(Object.keys({ ...KASSE_STAGE, UF_CRM_1757490052931: "", ...amount("", "") }).sort());
    expect(u!.fields).toMatchObject({ ...KASSE_STAGE, ...amount(String(total), "S1-KK") });
    expect(Number(u!.fields.UF_CRM_1757490052931)).toBeGreaterThanOrEqual(0);
  });

  it("AH: exactly today's field set (AH stage only — no amount, number or link)", async () => {
    const DEAL = "9612";
    await firstVariant(DEAL, "S1-AH", AH);
    const tok = await handOver(DEAL, "S1-AH", AH, { total: 999 });
    const calls = await signAll(tok);
    expect(updates(calls)).toEqual([{ id: DEAL, fields: { categoryId: "52", stageId: "C52:UC_7NLTX7" } }]);
  });
});

describe("two variants: the signed one decides", () => {
  const DEAL = "9602";
  let B = "", C = "", tokA = "", tokB = "";

  it("older variant A signed after B was sent: amount/number/link of A, B not chosen, B's link closed, timeline names both", async () => {
    await firstVariant(DEAL, "VA-1", SZ);
    B = await addVariant(DEAL, "Mit Wanne", "VB-1", SZ);
    tokA = await handOver(DEAL, "VA-1", SZ, { variantId: "v1", total: 1000 });
    tokB = await handOver(DEAL, "VB-1", SZ, { variantId: B, total: 2000 }); // B is the last sent
    const calls = await signAll(tokA);
    expect(updates(calls)).toEqual([{ id: DEAL, fields: { ...SZ_STAGE, ...amount("1000", "VA-1") } }]);
    expect(calls.map((c) => c.method)).toEqual(["crm.timeline.comment.add", "crm.timeline.comment.add", "crm.item.update"]); // no extra call
    expect(comments(calls)[1]).toBe([
      "✅ Alle Dokumente unterschrieben (VA-1)", "Signierte PDFs sind angehängt.",
      "Variante „Variante 1“ unterschrieben.", "Nicht gewählt: Variante „Mit Wanne“", "Signatur-Link von Variante „Mit Wanne“ (VB-1) geschlossen.",
    ].join("\n"));
    const list = DealVariantsResponseSchema.parse((await call("GET", `/api/deals/${DEAL}/variants`)).body); // the real answer's shape
    expect(list.variants.map((v) => [v.variantId, v.status])).toEqual([["v1", "signed"], [B, "not-chosen"]]);
    const srB: any = await db().collection("signingrequests").findOne({ token: tokB });
    expect(srB.status).toBe("expired");
    const opened = await call("GET", `/api/signing/${tokB}`);
    expect([opened.status, opened.body.expired]).toEqual([410, true]);
  });

  it("the customer asks for a new link on the closed one: the office is told why", async () => {
    bx.take("v2");
    expect((await call("POST", `/api/signing/${tokB}/request-new-link`, {})).body).toMatchObject({ ok: true });
    await wait();
    const calls = bx.take("v2");
    const task = calls.find((c) => c.method === "tasks.task.add")!;
    expect(new URLSearchParams(task.params).get("fields[DESCRIPTION]")).toContain("weil der Kunde ein anderes Angebot zu diesem Auftrag unterschrieben hat (VA-1)");
    expect(comments(calls)[0]).toContain("anderes Angebot zu diesem Auftrag unterschrieben hat (VA-1)");
  });

  it("the not-chosen variant is refused on every channel: mail, post, signing hand-over", async () => {
    const sign = await call("POST", "/api/signing", { payload: { ...SZ, offerNumber: "VB-1" }, offerNumber: "VB-1", offerType: "bu", dealId: DEAL, variantId: B, sendEmail: true, sendId: `sig-nc-${rand()}` });
    expect([sign.status, sign.body.error.code]).toEqual([409, "VARIANT_NOT_CHOSEN"]);
    expect(sign.body.error.message).toMatch(/^Diese Variante wurde nicht gewählt/);
    const m = await mail({ to: "kunde@example.test", subject: "Ihr Angebot", offerNumber: "VB-1", offerType: "bu", body: "Hallo", payload: JSON.stringify({ ...SZ, offerNumber: "VB-1" }), dealId: DEAL, variantId: B, sendId: `mail-nc-${rand()}` });
    expect([m.status, m.body.error.code]).toEqual([409, "VARIANT_NOT_CHOSEN"]);
    const p = await call("POST", "/api/post/send", { auftragId: DEAL, variantId: B, recipient: { name: "Erika Muster", street: "Weg 1", zipCode: "12345", city: "Ort", country: "Deutschland" }, document: { filename: "VB-1.pdf", base64: "JVBERi0=" }, attachments: [], meta: { offerNumber: "VB-1", dealId: DEAL }, sendId: `post-nc-${rand()}` });
    expect([p.status, p.body.error.code]).toEqual([409, "VARIANT_NOT_CHOSEN"]);
    // also without the variant field (today's UI): found by its number
    const m2 = await mail({ to: "kunde@example.test", subject: "Ihr Angebot", offerNumber: "VB-1", offerType: "bu", body: "Hallo", payload: JSON.stringify({ ...SZ, offerNumber: "VB-1" }), dealId: DEAL, sendId: `mail-nc-${rand()}` });
    expect([m2.status, m2.body.error.code]).toEqual([409, "VARIANT_NOT_CHOSEN"]);
    expect(await db().collection("offer_sends").countDocuments({ sendId: /-nc-/ })).toBe(0); // nothing recorded, nothing sent
  });

  it("signed wins: a later send of a NEW variant moves the deal but keeps amount, number and link of the signed one", async () => {
    C = await addVariant(DEAL, "Günstig", "VC-1", SZ);
    bx.take("v2");
    const m = await mail({ to: "kunde@example.test", subject: "Ihr Angebot", offerNumber: "VC-1", offerType: "bu", body: "Hallo {{SIGN_LINK}}", payload: JSON.stringify({ ...SZ, offerNumber: "VC-1" }), dealId: DEAL, variantId: C, sendId: `mail-c-${rand()}` });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    await wait();
    expect(bx.take("v2").map((c) => c.method)).not.toContain("crm.deal.update"); // the link stays at VA-1
    const mv = await call("POST", `/api/bitrix/deal/${DEAL}/move-ang-verschickt`, { opportunity: 3000, finalTotal: 3000, workDays: 2, offerType: "bu", offerNumber: "VC-1", variantId: C });
    expect(mv.body).toMatchObject({ ok: true, amountKept: true, signedOfferNumber: "VA-1" });
    const [u] = updates(bx.take("v2"));
    expect(u!.fields).toEqual({ categoryId: "38", stageId: "C38:UC_2ZDNEZ", UF_CRM_1775019866756: "8440" });
    // the move for the signed variant itself writes its amount as before
    const own = await call("POST", `/api/bitrix/deal/${DEAL}/move-ang-verschickt`, { opportunity: 1000, offerType: "bu", offerNumber: "VA-1", variantId: "v1" });
    expect(own.body.amountKept).toBeUndefined();
    expect(updates(bx.take("v2"))[0]!.fields).toMatchObject({ opportunity: "1000", UF_CRM_1776156870205: "VA-1" });
  });

  it("before any signature the move writes the variant just sent (last sent wins)", async () => {
    const D = "9607";
    await firstVariant(D, "LS-A", SZ);
    const V = await addVariant(D, "B", "LS-B", SZ);
    bx.take("v2");
    const mv = await call("POST", `/api/bitrix/deal/${D}/move-ang-verschickt`, { opportunity: 777, offerType: "bu", offerNumber: "LS-B", variantId: V });
    expect(mv.body.amountKept).toBeUndefined();
    expect(updates(bx.take("v2"))[0]!.fields).toMatchObject({ opportunity: "777", UF_CRM_1768391021079: "777", UF_CRM_1776156870205: "LS-B" });
  });
});

describe("other variant partially signed", () => {
  it("is closed too; the timeline and error_events say so (warning)", async () => {
    const DEAL = "9603";
    await firstVariant(DEAL, "PA-1", SZ);
    const B = await addVariant(DEAL, "Kasse", "PB-1", KASSE);
    const tokB = await handOver(DEAL, "PB-1", KASSE, { variantId: B, total: 500 });
    const keysB = await docsOf(tokB);
    await signDocs(tokB, [keysB.find((k) => k !== "angebot")!]); // one of three documents
    const tokA = await handOver(DEAL, "PA-1", SZ, { variantId: "v1", total: 800 });
    const calls = await signAll(tokA);
    expect(comments(calls)[1]).toContain(`⚠️ Signatur-Link von Variante „Kasse“ (PB-1) geschlossen – dort waren bereits 1 von ${keysB.length} Dokument(en) unterschrieben. Bitte prüfen.`);
    expect((await db().collection("signingrequests").findOne({ token: tokB }))!.status).toBe("expired");
    await wait();
    const ev: any = await db().collection("error_events").findOne({ dealId: DEAL, code: "VARIANT_PARTIAL_SIGNING_CLOSED" });
    expect(ev).toMatchObject({ severity: "warn", area: "signing.completion" });
    expect(JSON.stringify(ev)).not.toMatch(/Muster|Erika/); // ids only
  });
});

describe("two signatures", () => {
  it("second signature (B's request had passed the gate before A closed it): B is completed, Bitrix keeps A, office warned", async () => {
    const DEAL = "9606";
    await firstVariant(DEAL, "RA-1", SZ);
    const B = await addVariant(DEAL, "Zweite", "RB-1", SZ);
    const tokA = await handOver(DEAL, "RA-1", SZ, { variantId: "v1", total: 100 });
    const tokB = await handOver(DEAL, "RB-1", SZ, { variantId: B, total: 200 });
    await signAll(tokA);
    // the race: B's request is open again as it was when B's last signature passed the expiry gate
    await db().collection("signingrequests").updateOne({ token: tokB }, { $set: { status: "opened", expiresAt: new Date(Date.now() + 86400000) } });
    const calls = await signAll(tokB);
    expect(updates(calls)).toEqual([]); // no stage move, no amount: A stays
    expect(comments(calls)[1]).toBe([
      "✅ Alle Dokumente unterschrieben (RB-1)", "Signierte PDFs sind angehängt.",
      "⚠️ Zweite Unterschrift: Variante „Zweite“ wurde unterschrieben, obwohl bereits Variante „Variante 1“ (RA-1) unterschrieben ist. Betrag, Angebotsnummer und Angebotslink im Deal bleiben bei Variante „Variante 1“. Bitte mit dem Kunden klären.",
    ].join("\n"));
    await wait();
    expect(await errorCodes(DEAL)).toContain("VARIANT_SECOND_SIGNATURE");
    const l = (await call("GET", `/api/deals/${DEAL}/variants`)).body.variants;
    expect(l.map((v: any) => [v.variantId, v.status, v.notChosenAt === null])).toEqual([["v1", "signed", true], [B, "signed", false]]);
    expect((await db().collection("signing_completions").findOne({ token: tokB }))!.result).toMatchObject({ ok: true, dealMove: "kept-first", variant: "second" });
  });

  it("near-simultaneous completions: exactly one decides — one deal update, the winner never marked not chosen", async () => {
    const DEAL = "9604";
    await firstVariant(DEAL, "SA-1", SZ);
    const B = await addVariant(DEAL, "Parallel", "SB-1", SZ);
    const tokA = await handOver(DEAL, "SA-1", SZ, { variantId: "v1", total: 10 });
    const tokB = await handOver(DEAL, "SB-1", SZ, { variantId: B, total: 20 });
    const [ka, kb] = [await docsOf(tokA), await docsOf(tokB)];
    await signDocs(tokA, ka.slice(0, -1)); await signDocs(tokB, kb.slice(0, -1));
    await wait(); bx.take("v2");
    const [ra, rb] = await Promise.all([
      call("POST", `/api/signing/${tokA}/documents/${ka.slice(-1)[0]}`, bodyFor(ka.slice(-1)[0]!)),
      call("POST", `/api/signing/${tokB}/documents/${kb.slice(-1)[0]}`, bodyFor(kb.slice(-1)[0]!)),
    ]);
    await wait(150);
    const calls = bx.take("v2");
    const choice: any = await db().collection("deal_variant_choices").findOne({ _id: DEAL as any });
    const winner = choice.variantId as string, loser = winner === "v1" ? B : "v1";
    const ups = updates(calls);
    expect(ups).toHaveLength(1);
    expect(ups[0]!.fields.UF_CRM_1776156870205).toBe(winner === "v1" ? "SA-1" : "SB-1");
    const l = (await call("GET", `/api/deals/${DEAL}/variants`)).body.variants;
    expect(l.find((v: any) => v.variantId === winner).notChosenAt).toBeNull();
    // the other one either lost at the gate (410, link closed) or completed as a second signature
    const loserRes = loser === "v1" ? ra : rb;
    if (loserRes.status === 200) expect(comments(calls).some((c) => c.includes("⚠️ Zweite Unterschrift"))).toBe(true);
    else expect(loserRes.status).toBe(410);
  });
});

describe("Bitrix fails during the completion", () => {
  it("the signature is completed anyway, an error event is written, the failed call (with the new fields) is logged for the admin retry", async () => {
    const DEAL = FAILING_DEAL;
    await firstVariant(DEAL, "BF-1", SZ);
    const tok = await handOver(DEAL, "BF-1", SZ, { total: 4321 });
    await signAll(tok);
    expect((await db().collection("signingrequests").findOne({ token: tok }))!.status).toBe("completed");
    expect((await db().collection("signing_completions").findOne({ token: tok }))!.result).toMatchObject({ ok: true, dealMove: "failed" });
    await wait();
    expect(await errorCodes(DEAL)).toContain("SIGNING_DEAL_UPDATE_FAILED");
    const log: any = await db().collection("bitrixlogs").findOne({ method: "crm.item.update", "params.id": Number(DEAL) });
    expect(log.params.fields).toMatchObject({ opportunity: 4321, UF_CRM_1776156870205: "BF-1", UF_CRM_1790772236055: LINK("BF-1") });
  });
});
