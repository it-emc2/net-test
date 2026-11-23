// ADR 027 A, step 1: variants of a deal's offer — storage, API, migration 005, number claim,
// adopt with several variants, markOthersNotChosen. In-memory MongoDB.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { loadConfig } from "@oc/config";
import { ahTotalsOfPayload } from "../src/modules/documents/index.js";
import { variantCopyPayload, newOfferPatch } from "@oc/domain";
import { buildApp } from "../src/app.js";
import { createToken } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerDealDrafts } from "../src/modules/deal-drafts/routes.js";
import { DealDraft, DealDraftRevision, migrateDealDraftIndexes, SNAPSHOT_EVERY } from "../src/modules/deal-drafts/store.js";
import { markOthersNotChosen, resolveSendVariant } from "../src/modules/deal-drafts/index.js";
import { exportDealDraftsToLegacy, m005DealDraftVariants } from "../src/migrations/index.js";
import { claimNumber } from "../src/modules/sends/numbers.js";
import { claimSendLock } from "../src/modules/email/send-lock.js";
import { EmailSend } from "../src/platform/models.js";

const SECRET = "deal-variant-test-secret-0123456789";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
const auth = (email = "ao@test.local") => ({ authorization: `Bearer ${createToken(email, SECRET)}` });
const db = () => mongoose.connection.db!;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  await migrateDealDraftIndexes();
  app = await buildApp(cfg, {
    register: (a) => registerDealDrafts(a, {
      // stands in for offers' resolveAnsprechpartner: the signed-in user becomes the contact person
      resolveContact: async (kd, user) => ({ ...kd, ansprechpartner: user?.email, emc2_contact: `Name of ${user?.email}` }),
    }),
  });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });

const q = (v?: string) => (v ? `?variant=${v}` : "");
const put = (dealId: string, body: object, variant?: string, email?: string) => app.inject({ method: "PUT", url: `/api/deals/${dealId}/draft${q(variant)}`, headers: auth(email), payload: body });
const get = (url: string) => app.inject({ url, headers: auth() });
const post = (url: string, payload: object = {}) => app.inject({ method: "POST", url, headers: auth(), payload });
const variants = async (dealId: string) => (await get(`/api/deals/${dealId}/variants`)).json();
const OFFER = (nr: string, extra: object = {}) => ({
  offerNumber: nr, auftragId: "x", activeOffer: "bu",
  Kundendaten: { lastName: "Muster", firstName: "Erika", email: "kunde@example.test", date: "2026-01-02", ansprechpartner: "rf@test.local", emc2_contact: "RF" },
  zusammenfassung: { versand: "E-Mail am 02.01.2026", note: "bleibt" }, rabatt: { pct: 5 }, ...extra,
});

describe("shared rule: what a new offer resets (@oc/domain)", () => {
  it("copy keeps everything but the number, the send status, the date and the contact; the source is not touched", () => {
    const src = OFFER("ANG2026-0102-100000");
    const before = JSON.stringify(src);
    const c = variantCopyPayload(src, "2026-11-19", { ansprechpartner: "ao@test.local", emc2_contact: "AO" });
    expect(c.offerNumber).toBeUndefined();
    expect(c.zusammenfassung).toEqual({ note: "bleibt" });
    expect(c.Kundendaten).toMatchObject({ date: "2026-11-19", ansprechpartner: "ao@test.local", emc2_contact: "AO", lastName: "Muster" });
    expect(c.rabatt).toEqual({ pct: 5 });
    expect(c.auftragId).toBe("x");
    expect(JSON.stringify(src)).toBe(before);
    expect(newOfferPatch("2026-11-19")).toEqual({ Kundendaten: { date: "2026-11-19" }, zusammenfassung: { versand: undefined } });
  });
});

describe("variants", () => {
  it("a draft saved before variants (no variantId field) opens as the first variant", async () => {
    await DealDraft.collection.insertOne({ dealId: "6001", offerType: "bu", payload: OFFER("ANG-OLD-1"), revision: 3, updatedBy: "rf@test.local", createdAt: new Date(), updatedAt: new Date() });
    const g = (await get("/api/deals/6001/draft")).json();
    expect(g).toMatchObject({ revision: 3, variantId: "v1", variantName: "Variante 1" });
    const l = await variants("6001");
    expect(l.defaultVariantId).toBe("v1");
    expect(l.variants).toEqual([expect.objectContaining({ variantId: "v1", name: "Variante 1", offerNumber: "ANG-OLD-1", status: "sent", isDefault: true, revision: 3 })]);
    // explicit "v1" is the same draft; the document was not rewritten
    expect((await get("/api/deals/6001/draft?variant=v1")).json().revision).toBe(3);
    expect((await DealDraft.collection.findOne({ dealId: "6001" }))!.variantId).toBeUndefined();
  });

  it("create copies the source; number and send status reset; date and contact set anew; it becomes the one opened last", async () => {
    expect((await put("6002", { offerType: "bu", payload: OFFER("ANG-A"), baseRevision: 0 }, undefined, "rf@test.local")).json()).toMatchObject({ revision: 1, variantId: "v1" });
    const r = await post("/api/deals/6002/variants", { name: "  Mit   Wanne " });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.variant).toMatchObject({ name: "Mit Wanne", offerType: "bu", offerNumber: "", status: "draft", isDefault: true, notChosenAt: null });
    expect(b.variant.variantId).toMatch(/^v-[0-9a-f]{12}$/);
    expect(b.revision).toBe(2); // one revision sequence per deal
    const copy = (await get(`/api/deals/6002/draft?variant=${b.variant.variantId}`)).json();
    expect(copy.payload.offerNumber).toBeUndefined();
    expect(copy.payload.zusammenfassung).toEqual({ note: "bleibt" });
    expect(copy.payload.Kundendaten).toMatchObject({ lastName: "Muster", ansprechpartner: "ao@test.local", emc2_contact: "Name of ao@test.local" });
    expect(copy.payload.Kundendaten.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(copy.payload.Kundendaten.date).not.toBe("2026-01-02");
    expect(copy.payload.rabatt).toEqual({ pct: 5 });
    // the source is unchanged
    expect((await get("/api/deals/6002/draft?variant=v1")).json().payload).toEqual(OFFER("ANG-A"));
    // fallback name, copy from an explicit source
    const c = (await post("/api/deals/6002/variants", { from: "v1" })).json();
    expect(c.variant.name).toBe("Variante 3");
    const hist = (await get(`/api/deals/6002/draft/revisions?variant=${c.variant.variantId}`)).json().revisions;
    expect(hist).toEqual([expect.objectContaining({ kind: "copy", note: "Kopie von „Variante 1“" })]);
  });

  it("create: bad name, unknown source, deal without draft", async () => {
    expect((await post("/api/deals/6002/variants", { name: "x".repeat(61) })).json().error.code).toBe("VARIANT_NAME_INVALID");
    expect((await post("/api/deals/6002/variants", { from: "v-000000000000" })).json().error.code).toBe("VARIANT_NOT_FOUND");
    expect((await post("/api/deals/6999/variants", {})).statusCode).toBe(404);
    expect((await post("/api/deals/6002/variants", { from: "bad" })).statusCode).toBe(400);
  });

  it("rename any time; empty or too long refused", async () => {
    const v = (await variants("6002")).variants[1].variantId;
    const r = await app.inject({ method: "PATCH", url: `/api/deals/6002/variants/${v}`, headers: auth(), payload: { name: "Ohne Wanne" } });
    expect(r.json().variant).toMatchObject({ variantId: v, name: "Ohne Wanne" });
    const first = await app.inject({ method: "PATCH", url: "/api/deals/6002/variants/v1", headers: auth(), payload: { name: "Grundangebot" } });
    expect(first.json().variant.name).toBe("Grundangebot");
    expect((await app.inject({ method: "PATCH", url: `/api/deals/6002/variants/${v}`, headers: auth(), payload: { name: "  " } })).json().error.code).toBe("VARIANT_NAME_INVALID");
    expect((await app.inject({ method: "PATCH", url: "/api/deals/6002/variants/v-0000000000ff", headers: auth(), payload: { name: "x" } })).statusCode).toBe(404);
  });

  it("two variants are saved independently, each with its own history and conflict check", async () => {
    const [a, b] = (await variants("6002")).variants;
    const ra = (await put("6002", { offerType: "bu", payload: { ...OFFER("ANG-A"), rabatt: { pct: 7 } }, baseRevision: a.revision }, "v1")).json();
    const rb = (await put("6002", { offerType: "bu", payload: { Kundendaten: { lastName: "B" } }, baseRevision: b.revision }, b.variantId)).json();
    expect(ra.changed && rb.changed).toBe(true);
    expect(rb.revision).toBeGreaterThan(ra.revision);
    // stale base on one variant → conflict only there
    expect((await put("6002", { offerType: "bu", payload: { z: 1 }, baseRevision: a.revision }, "v1")).statusCode).toBe(409);
    expect((await get("/api/deals/6002/draft?variant=v1")).json().payload.rabatt).toEqual({ pct: 7 });
    expect((await get(`/api/deals/6002/draft?variant=${b.variantId}`)).json().payload).toEqual({ Kundendaten: { lastName: "B" } });
    // history per variant; every version reconstructs (numbers have gaps across variants)
    const ha = (await get("/api/deals/6002/draft/revisions?variant=v1")).json().revisions.map((x: any) => x.revision);
    const hb = (await get(`/api/deals/6002/draft/revisions?variant=${b.variantId}`)).json().revisions.map((x: any) => x.revision);
    expect(ha.filter((n: number) => hb.includes(n))).toEqual([]);
    expect((await get(`/api/deals/6002/draft/revisions/${ha[1]}?variant=v1`)).json().payload).toEqual(OFFER("ANG-A"));
    expect((await get(`/api/deals/6002/draft/revisions/${hb[0]}?variant=v1`)).statusCode).toBe(404); // another variant's revision
    // restore inside one variant
    const cur = (await get("/api/deals/6002/draft?variant=v1")).json();
    const rs = (await post(`/api/deals/6002/draft/restore?variant=v1`, { revision: ha[1], baseRevision: cur.revision })).json();
    expect(rs.changed).toBe(true);
    expect((await get("/api/deals/6002/draft?variant=v1")).json().payload).toEqual(OFFER("ANG-A"));
  });

  it("interleaved saves of two variants: every version of each reconstructs exactly (across snapshots)", async () => {
    await put("6010", { offerType: "bu", payload: { v: "A", i: -1 }, baseRevision: 0 });
    const B = (await post("/api/deals/6010/variants", {})).json().variant.variantId as string;
    const saved: Record<string, Record<number, unknown>> = { v1: {}, [B]: {} };
    const rev: Record<string, number> = { v1: 1, [B]: (await get(`/api/deals/6010/draft?variant=${B}`)).json().revision };
    for (let i = 0; i < SNAPSHOT_EVERY * 2 + 3; i++) {
      const v = i % 3 === 0 ? B : "v1";
      const payload = { v, i, sec: { [`k${i % 4}`]: String(i) } };
      const r = (await put("6010", { offerType: "bu", payload, baseRevision: rev[v] }, v)).json();
      rev[v] = r.revision; saved[v]![r.revision] = payload;
    }
    for (const v of ["v1", B]) for (const [n, payload] of Object.entries(saved[v]!)) {
      expect((await get(`/api/deals/6010/draft/revisions/${n}?variant=${v}`)).json().payload, `${v} @${n}`).toEqual(payload);
    }
  });

  it("all variants have the same offer type", async () => {
    const a = (await variants("6002")).variants[0];
    const r = await put("6002", { offerType: "ah", payload: {}, baseRevision: a.revision }, "v1");
    expect([r.statusCode, r.json().error.code]).toEqual([409, "VARIANT_TYPE_MISMATCH"]);
  });

  it("today's UI (no variant): acts on the variant opened last; a switch in between is a conflict, not an overwrite", async () => {
    await put("6003", { offerType: "bu", payload: { n: "A1" }, baseRevision: 0 });
    // today's UI loads the deal: the only variant
    const loaded = (await get("/api/deals/6003/draft")).json();
    expect(loaded.variantId).toBe("v1");
    // someone creates variant B (it becomes the one opened last)
    const B = (await post("/api/deals/6003/variants", { name: "B" })).json().variant.variantId;
    // today's UI saves on its base → the variant opened last is B, whose revision differs → 409
    const stale = await put("6003", { offerType: "bu", payload: { n: "A2" }, baseRevision: loaded.revision });
    expect(stale.statusCode).toBe(409);
    expect(((await DealDraft.findOne({ dealId: "6003", variantId: null }).lean()) as any).payload).toEqual({ n: "A1" }); // read without "opening" it
    // after reloading it edits B
    const re = (await get("/api/deals/6003/draft")).json();
    expect(re.variantId).toBe(B);
    expect((await put("6003", { offerType: "bu", payload: { n: "B2" }, baseRevision: re.revision })).json().changed).toBe(true);
    expect((await get(`/api/deals/6003/draft?variant=${B}`)).json().payload).toEqual({ n: "B2" });
    // opening A explicitly makes A the one the calls without variant act on
    await get("/api/deals/6003/draft?variant=v1");
    expect((await get("/api/deals/6003/draft")).json().variantId).toBe("v1");
    expect((await get("/api/deals/6003/draft/revisions")).json().variantId).toBe("v1");
    expect((await variants("6003")).defaultVariantId).toBe("v1");
  });

  it("unknown or malformed variant ids", async () => {
    expect((await get("/api/deals/6003/draft?variant=v-123")).statusCode).toBe(400);
    expect((await get("/api/deals/6003/draft?variant=v-aaaaaaaaaaaa")).json().error.code).toBe("VARIANT_NOT_FOUND");
    expect((await put("6003", { offerType: "bu", payload: {}, baseRevision: 0 }, "v-aaaaaaaaaaaa")).statusCode).toBe(404);
    // the first save of a new deal may name the first variant explicitly
    expect((await put("6004", { offerType: "bu", payload: { a: 1 }, baseRevision: 0 }, "v1")).json()).toMatchObject({ revision: 1, variantId: "v1" });
  });

  it("delete: allowed for a never-sent variant; refused when sent (record, legacy log, signing request) or the only one", async () => {
    await put("6005", { offerType: "bu", payload: OFFER("ANG-6005-A"), baseRevision: 0 });
    const mk = async () => (await post("/api/deals/6005/variants", {})).json().variant.variantId as string;
    const del = (v: string) => app.inject({ method: "DELETE", url: `/api/deals/6005/variants/${v}`, headers: auth() });
    const setNumber = async (v: string, nr: string) => {
      const d = (await get(`/api/deals/6005/draft?variant=${v}`)).json();
      await put("6005", { offerType: "bu", payload: { ...d.payload, offerNumber: nr }, baseRevision: d.revision }, v);
    };
    // never sent → deleted (kept hidden); the default moves on
    const free = await mk();
    const ok = await del(free);
    expect(ok.json()).toMatchObject({ ok: true, variantId: free, defaultVariantId: "v1" });
    expect((await variants("6005")).variants.map((v: any) => v.variantId)).toEqual(["v1"]);
    expect(await DealDraft.countDocuments({ dealId: "6005", variantId: free, deletedAt: { $ne: null } })).toBe(1);
    expect((await get(`/api/deals/6005/draft?variant=${free}`)).statusCode).toBe(404);
    // a done send record of the variant
    const sent = await mk();
    await db().collection("offer_sends").insertOne({ sendId: "s-6005-1", dealId: "6005", variantId: sent, offerNumber: "ANG-6005-B", status: "done", channel: "email", startedAt: new Date() });
    expect((await del(sent)).json().error.code).toBe("VARIANT_SENT");
    // a legacy e-mail log under its number
    const logged = await mk();
    await setNumber(logged, "ANG-6005-C");
    await db().collection("emaillogs").insertOne({ to: "kunde@example.test", offerNumber: "ANG-6005-C" });
    expect((await del(logged)).json().error.code).toBe("VARIANT_SENT");
    // a signing request for its number
    const signing = await mk();
    await setNumber(signing, "ANG-6005-D");
    await db().collection("signingrequests").insertOne({ token: "tok-6005", offerNumber: "ANG-6005-D", status: "sent", customerType: "SZ", payloadSnapshot: {} });
    expect((await del(signing)).json().error.code).toBe("VARIANT_SENT");
    // the only variant of a deal
    await put("6006", { offerType: "bu", payload: {}, baseRevision: 0 });
    const only = await app.inject({ method: "DELETE", url: "/api/deals/6006/variants/v1", headers: auth() });
    expect([only.statusCode, only.json().error.code]).toEqual([409, "VARIANT_LAST"]);
    // refusals are recorded in the error log (ids only)
    const ev: any = await db().collection("error_events").findOne({ code: "VARIANT_SENT" });
    expect(ev).toMatchObject({ area: "deal-drafts.variants", dealId: "6005", severity: "warn" });
  });

  it("status: sent (date, channel, total), signed, not chosen", async () => {
    await put("6007", { offerType: "bu", payload: OFFER("ANG-6007-A", { zusammenfassung: {} }), baseRevision: 0 });
    const B = (await post("/api/deals/6007/variants", { name: "B" })).json().variant.variantId;
    const C = (await post("/api/deals/6007/variants", { name: "C" })).json().variant.variantId;
    const at = new Date("2026-11-18T10:00:00Z");
    // A: sent by e-mail before variants existed (no variantId on the record) — found by its number
    await db().collection("offer_sends").insertOne({ sendId: "s-6007-a", dealId: "6007", offerNumber: "ANG-6007-A", status: "done", channel: "email", total: 1234.5, startedAt: at, finishedAt: at });
    // B: sent by post and signed
    await db().collection("offer_sends").insertOne({ sendId: "s-6007-b", dealId: "6007", variantId: B, offerNumber: "ANG-6007-B", status: "done", channel: "post", total: 999, startedAt: at, finishedAt: at });
    await db().collection("signingrequests").insertOne({ token: "tok-6007", offerNumber: "ANG-6007-B", status: "completed", completedAt: at, customerType: "SZ", payloadSnapshot: {} });
    // C: only filed in Bitrix → still a draft
    await db().collection("offer_sends").insertOne({ sendId: "s-6007-c", dealId: "6007", variantId: C, offerNumber: "ANG-6007-C", status: "done", channel: "bitrix", total: 5, startedAt: at, finishedAt: at });
    expect(await markOthersNotChosen("6007", B)).toEqual(["v1", C]);
    const l = (await variants("6007")).variants;
    expect(l[0]).toMatchObject({ variantId: "v1", status: "not-chosen", sentChannel: "email", total: 1234.5 });
    expect(new Date(l[0].sentAt).toISOString()).toBe(at.toISOString());
    expect(l[0].notChosenAt).not.toBeNull();
    expect(l[1]).toMatchObject({ variantId: B, status: "signed", sentChannel: "post", total: 999, notChosenAt: null });
    expect(l[2]).toMatchObject({ variantId: C, status: "not-chosen", sentAt: null, total: 5 });
  });

  it("total of a handed-over offer: the send record has none, the stored offer does (U-polish)", async () => {
    const at = new Date("2026-11-22T10:00:00Z");
    const sendsC = db().collection("offer_sends"), offersC = db().collection("offers");
    // non-AH: on-site hand-over record without total; the stored offer's pricing.total
    await put("6021", { offerType: "bu", payload: OFFER("ANG-6021", { zusammenfassung: {} }), baseRevision: 0 });
    await sendsC.insertOne({ sendId: "s-6021", dealId: "6021", offerNumber: "ANG-6021", status: "done", channel: "onsite", startedAt: at, finishedAt: at });
    await offersC.insertOne({ offerNumber: "ANG-6021", offerType: "bu", payload: {}, pricing: { total: 4321.5 } });
    expect((await variants("6021")).variants[0]).toMatchObject({ status: "sent", sentChannel: "onsite", total: 4321.5 });
    // a record that carries a total keeps it (the stored one is not consulted)
    await put("6022", { offerType: "bu", payload: OFFER("ANG-6022", { zusammenfassung: {} }), baseRevision: 0 });
    await sendsC.insertOne({ sendId: "s-6022", dealId: "6022", offerNumber: "ANG-6022", status: "done", channel: "email", total: 100, startedAt: at, finishedAt: at });
    await offersC.insertOne({ offerNumber: "ANG-6022", offerType: "bu", payload: {}, pricing: { total: 999 } });
    expect((await variants("6022")).variants[0]).toMatchObject({ total: 100 });
    // nothing stored under the number → no total, no new price calculation
    await put("6023", { offerType: "bu", payload: OFFER("ANG-6023", { zusammenfassung: {} }), baseRevision: 0 });
    await sendsC.insertOne({ sendId: "s-6023", dealId: "6023", offerNumber: "ANG-6023", status: "done", channel: "onsite", startedAt: at, finishedAt: at });
    expect((await variants("6023")).variants[0]).toMatchObject({ status: "sent", total: null });
    // a stored offer without a usable price → none
    await put("6024", { offerType: "bu", payload: OFFER("ANG-6024", { zusammenfassung: {} }), baseRevision: 0 });
    await sendsC.insertOne({ sendId: "s-6024", dealId: "6024", offerNumber: "ANG-6024", status: "done", channel: "onsite", startedAt: at, finishedAt: at });
    await offersC.insertOne({ offerNumber: "ANG-6024", offerType: "bu", payload: {}, pricing: {} });
    expect((await variants("6024")).variants[0]).toMatchObject({ total: null });
    // AH: the monthly amount of the stored payload (ADR 028), not pricing.total
    const ROOT = new URL("../../../../", import.meta.url).pathname;
    const AH: any = structuredClone((JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8")) as any[])[0].payload);
    AH.activeOffer = "ah"; AH.offerNumber = "ANG-6025";
    const want = ahTotalsOfPayload(AH, undefined, "document").customerAmount;
    expect(want).toBeGreaterThan(0);
    await put("6025", { offerType: "ah", payload: AH, baseRevision: 0 });
    await sendsC.insertOne({ sendId: "s-6025", dealId: "6025", offerNumber: "ANG-6025", status: "done", channel: "onsite", ahZoneReading: "document", startedAt: at, finishedAt: at });
    await offersC.insertOne({ offerNumber: "ANG-6025", offerType: "ah", payload: AH, pricing: { total: 1 } });
    expect((await variants("6025")).variants[0]).toMatchObject({ status: "sent", total: want });
  });

  it("status from the offer itself: only a versand with how and when counts as sent (a new offer carries an empty object) — step 2 fix", async () => {
    await put("6011", { offerType: "bu", payload: OFFER("", { zusammenfassung: { versand: {} } }), baseRevision: 0 });
    expect((await variants("6011")).variants[0]).toMatchObject({ variantId: "v1", status: "draft", sentAt: null });
    await put("6012", { offerType: "bu", payload: OFFER("ANG-6012", { zusammenfassung: { versand: { art: "E-Mail", versendetAm: "2026-01-02" } } }), baseRevision: 0 });
    expect((await variants("6012")).variants[0]).toMatchObject({ variantId: "v1", status: "sent" });
  });

  it("markOthersNotChosen: idempotent; a later signature on another variant chooses it again; unknown id refused", async () => {
    const [, B, C] = (await variants("6007")).variants.map((v: any) => v.variantId);
    expect(await markOthersNotChosen("6007", B)).toEqual([]);
    const before: any = await DealDraft.findOne({ dealId: "6007", variantId: null }).lean();
    expect(await markOthersNotChosen("6007", "v1")).toEqual([B]);
    const l = (await variants("6007")).variants;
    expect(l.find((v: any) => v.variantId === "v1").notChosenAt).toBeNull();
    expect(l.find((v: any) => v.variantId === C).notChosenAt).not.toBeNull();
    // marking writes no revision and keeps updatedAt
    const after: any = await DealDraft.findOne({ dealId: "6007", variantId: null }).lean();
    expect([after.revision, +after.updatedAt]).toEqual([before.revision, +before.updatedAt]);
    await expect(markOthersNotChosen("6007", "v-ffffffffffff")).rejects.toThrow();
  });
});

describe("drafts started without a deal number, with variants", () => {
  const T = "t-" + "9a8b".repeat(6);
  it("adopt carries every variant over; the one opened last stays that", async () => {
    await put(T, { offerType: "bu", payload: { Kundendaten: { lastName: "Muster" } }, baseRevision: 0 });
    const V = (await post(`/api/deals/${T}/variants`, { name: "Zweite" })).json().variant.variantId;
    const tv = await variants(T);
    expect(tv.variants).toHaveLength(2);
    expect(tv.defaultVariantId).toBe(V);
    // the deal already has a draft: the temporary first variant lands on top of it
    await put("6101", { offerType: "bu", payload: { Kundendaten: { lastName: "Vorher" } }, baseRevision: 0 });
    const r = (await post("/api/deals/6101/draft/adopt", { from: T })).json();
    expect(r).toMatchObject({ dealId: "6101", variantId: V, changed: true });
    expect(r.variants.map((x: any) => x.variantId)).toEqual(["v1", V]);
    const dv = await variants("6101");
    expect(dv.variants.map((v: any) => [v.variantId, v.name])).toEqual([["v1", "Variante 1"], [V, "Zweite"]]);
    expect(dv.defaultVariantId).toBe(V);
    expect((await get("/api/deals/6101/draft")).json()).toMatchObject({ variantId: V, revision: r.revision });
    expect((await get("/api/deals/6101/draft?variant=v1")).json().payload.Kundendaten.lastName).toBe("Muster");
    const h = (await get("/api/deals/6101/draft/revisions?variant=v1")).json().revisions;
    expect((await get(`/api/deals/6101/draft/revisions/${h.at(-1).revision}?variant=v1`)).json().payload.Kundendaten.lastName).toBe("Vorher");
    const temps = await DealDraft.find({ dealId: T }).lean();
    expect(temps.every((t: any) => t.adoptedInto === "6101")).toBe(true);
    expect((await post("/api/deals/6102/draft/adopt", { from: T })).statusCode).toBe(409);
  });
});

describe("offer numbers and send lock", () => {
  it("a number in any variant's draft counts as in use", async () => {
    await put("6201", { offerType: "bu", payload: { offerNumber: "ANG2026-1119-100001" }, baseRevision: 0 });
    const V = (await post("/api/deals/6201/variants", {})).json().variant.variantId;
    const d = (await get(`/api/deals/6201/draft?variant=${V}`)).json();
    await put("6201", { offerType: "bu", payload: { ...d.payload, offerNumber: "ANG2026-1119-100002" }, baseRevision: d.revision }, V);
    for (const nr of ["ANG2026-1119-100001", "ANG2026-1119-100002"]) {
      expect(await claimNumber(nr, "device-other-123", "rf@test.local")).toMatchObject({ offerNumber: nr, changed: false, reason: "in-use" });
    }
  });

  it("resolveSendVariant: explicit id, else by number, else the one opened last; lock key keeps the deal number for the first variant", async () => {
    const V = (await variants("6201")).variants[1].variantId;
    expect(await resolveSendVariant("6201", { offerNumber: "ANG2026-1119-100001" })).toEqual({ variantId: "v1", lockKey: "6201" });
    expect(await resolveSendVariant("6201", { offerNumber: "ANG2026-1119-100002" })).toEqual({ variantId: V, lockKey: `6201#${V}` });
    expect(await resolveSendVariant("6201", { variantId: "v1", offerNumber: "ANG2026-1119-100002" })).toEqual({ variantId: "v1", lockKey: "6201" });
    expect(await resolveSendVariant("6201", { offerNumber: "ANG-UNKNOWN" })).toMatchObject({ variantId: V }); // opened last
    expect(await resolveSendVariant("6299", { offerNumber: "x" })).toEqual({ variantId: "v1", lockKey: "6299" }); // no draft: the deal, as today
  });

  it("the legacy unique dealId index stays: A then B passes, A again within 24 h is refused", async () => {
    await EmailSend.collection.createIndex({ dealId: 1 }, { unique: true, name: "dealId_1" }); // as in production
    const V = (await variants("6201")).variants[1].variantId;
    const o = { inFlightMs: 5 * 60_000, resendBlockMs: 24 * 3600_000 };
    const send = async (nr: string) => {
      const { lockKey } = await resolveSendVariant("6201", { offerNumber: nr });
      const blocked = await claimSendLock(EmailSend, lockKey, false, o);
      if (!blocked) await EmailSend.updateOne({ dealId: lockKey }, { $set: { inFlightUntil: null, sentAt: new Date(), offerNumber: nr } });
      return blocked;
    };
    expect(await send("ANG2026-1119-100001")).toBeNull(); // A
    expect(await send("ANG2026-1119-100002")).toBeNull(); // B: its own row
    expect(await send("ANG2026-1119-100001")).toMatchObject({ offerNumber: "ANG2026-1119-100001" }); // A again → "already sent"
    expect(await send("ANG2026-1119-100002")).toMatchObject({ offerNumber: "ANG2026-1119-100002" }); // B again
    expect((await EmailSend.find({}).lean()).map((r: any) => r.dealId).sort()).toEqual(["6201", `6201#${V}`]);
  });
});

describe("migration 005", () => {
  it("dry run reports; real run swaps the index without touching documents; idempotent; drafts made before it work", async () => {
    const d = db().collection("deal_drafts");
    const t = mongoose.connection.client.db("m005");
    const dd = t.collection("deal_drafts"), rv = t.collection("deal_draft_revisions");
    // the state before variants: one draft per deal
    await dd.createIndex({ dealId: 1 }, { unique: true, name: "uniq_dealId" });
    await rv.createIndex({ dealId: 1, revision: 1 }, { unique: true, name: "uniq_deal_revision" });
    await dd.insertMany([{ dealId: "1", offerType: "bu", payload: {}, revision: 2 }, { dealId: "2", offerType: "ah", payload: {}, revision: 1 }]);
    await rv.insertMany([{ dealId: "1", revision: 1 }, { dealId: "1", revision: 2 }, { dealId: "2", revision: 1 }]);
    const snap = JSON.stringify(await dd.find({}).toArray());
    const dry = await m005DealDraftVariants(t, true);
    expect(dry).toMatchObject({ dryRun: true, matched: 2, changed: 0 });
    expect(dry.note).toContain("drop deal_drafts.uniq_dealId");
    expect((await dd.indexes()).map((i) => i.name)).toContain("uniq_dealId");
    const real = await m005DealDraftVariants(t, false);
    expect(real).toMatchObject({ dryRun: false, matched: 2, changed: 3 });
    const names = (await dd.indexes()).map((i) => i.name);
    expect(names).toContain("uniq_deal_variant");
    expect(names).not.toContain("uniq_dealId");
    expect((await rv.indexes()).map((i) => i.name)).toEqual(expect.arrayContaining(["uniq_deal_revision", "deal_variant_revision"]));
    expect(JSON.stringify(await dd.find({}).toArray())).toBe(snap);
    expect(await m005DealDraftVariants(t, false)).toMatchObject({ changed: 0 });
    // a second variant of deal 1 is now accepted, a second FIRST variant is not
    await dd.insertOne({ dealId: "1", variantId: "v-aaaaaaaaaaaa", offerType: "bu", payload: {}, revision: 3 });
    await expect(dd.insertOne({ dealId: "1", offerType: "bu", payload: {}, revision: 4 })).rejects.toThrow(/E11000/);
    expect(await d.countDocuments({})).toBeGreaterThan(0); // the app's own database is untouched by this test
  });

  it("before migration 005 a second variant is refused with a clear code", async () => {
    const dd = DealDraft.collection;
    await dd.dropIndex("uniq_deal_variant");
    // the old index (limited to this deal: other tests made several variants in this collection)
    await dd.createIndex({ dealId: 1 }, { unique: true, name: "uniq_dealId", partialFilterExpression: { dealId: "6301" } });
    try {
      await put("6301", { offerType: "bu", payload: {}, baseRevision: 0 });
      const r = await post("/api/deals/6301/variants", {});
      expect([r.statusCode, r.json().error.code]).toEqual([503, "VARIANT_CREATE_FAILED"]);
      expect(await DealDraftRevision.countDocuments({ dealId: "6301" })).toBe(1); // the claimed revision was given back
    } finally {
      await dd.dropIndex("uniq_dealId");
      await migrateDealDraftIndexes();
    }
  });

  it("rollback export covers every live variant, one legacy draft each; idempotent", async () => {
    const t = mongoose.connection.client.db("rb-variants");
    const at = new Date(2026, 10, 19, 9, 0, 0);
    await t.collection("deal_drafts").insertMany([
      { dealId: "7", offerType: "bu", revision: 1, payload: { auftragId: "7", Kundendaten: { firstName: "Erika", lastName: "Muster" } }, updatedAt: at },
      { dealId: "7", variantId: "v-aaaaaaaaaaaa", variantName: "Mit Wanne", offerType: "bu", revision: 2, payload: { auftragId: "7", Kundendaten: { firstName: "Erika", lastName: "Muster" } }, updatedAt: at },
      { dealId: "7", variantId: "v-bbbbbbbbbbbb", variantName: "Weg", deletedAt: at, offerType: "bu", revision: 3, payload: {}, updatedAt: at },
    ]);
    expect(await exportDealDraftsToLegacy(t, false)).toMatchObject({ matched: 2, changed: 2 });
    const names = (await t.collection("drafts").find({}).toArray()).map((x: any) => x.name).sort();
    expect(names).toEqual(["ANG-BU-Erika-Muster-19112026-090000", "ANG-BU-Erika-Muster-19112026-090000-MitWanne"]);
    expect(await exportDealDraftsToLegacy(t, false)).toMatchObject({ matched: 0, changed: 0 });
  });
});
