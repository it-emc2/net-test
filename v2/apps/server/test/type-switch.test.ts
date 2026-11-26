// ADR 030: „Angebotsart wechseln“ — another offer type on the SAME deal as a new variant, customer
// data copied by the rule of „Weiteres Angebot“. Through the real routes with an in-memory MongoDB
// and a recording Bitrix stub: the switch itself makes NO Bitrix call.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { DealVariantsResponseSchema, TypeSwitchResponseSchema } from "@oc/api-contract";
import { emptyOffer, offerWithCustomerData, type NewOfferType } from "@oc/domain";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { secondOfferPayload } from "../src/modules/deal-drafts/second-offer.js";
import { switchVariantId } from "../src/modules/deal-drafts/type-switch.js";
import { BitrixStub } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";

const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
let mongod: MongoMemoryServer, v2: FastifyInstance, token = "";
let nextId = 61001;
const bx = new BitrixStub({
  ...BITRIX_HANDLERS,
  "crm.deal.get": (p, app) => {
    const id = p.get("id") ?? "";
    if (/^93\d\d$/.test(id)) return { result: { ID: id, STAGE_ID: "C38:NEW", CONTACT_ID: "301" } };
    return BITRIX_HANDLERS["crm.deal.get"]!(p, app);
  },
  "crm.item.add": (p) => ({ result: { item: { id: nextId++, categoryId: Number(p.get("fields[categoryId]")), stageId: p.get("fields[stageId]") } } }),
  "crm.timeline.comment.add": () => ({ result: 4711 }),
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await bx.start();
  const client = new mongoose.mongo.MongoClient(uri); await client.connect();
  await client.db("KonfiguratorDB").collection("users").insertOne({ email: USER.email, name: "Contract", passwordHash: hashPassword(USER.password), role: "admin", active: true });
  await client.close();
  const cfg = loadConfig({
    NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET,
    BITRIX_WEBHOOK_BASE: bx.base("v2"), BITRIX_MIN_GAP_MS: "0", OFFER_LINK_BASE: "http://oc.test",
  });
  await connectDb(cfg, { info: () => {} });
  v2 = await buildApp(cfg, { register: (a) => registerApi(a, { cfg, pdfEngine: { docxToPdf: async () => Buffer.from("%PDF"), htmlToPdf: async () => Buffer.from("%PDF") } }) });
  const r = await v2.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, payload: USER });
  token = r.json().token;
  const { migrateDealDraftIndexes } = await import("../src/modules/deal-drafts/store.js"); await migrateDealDraftIndexes();
}, 180000);
afterAll(async () => { await v2?.close(); await disconnectDb(); await mongod?.stop(); await bx.stop(); });
beforeEach(() => { bx.take("v2"); });

const db = () => mongoose.connection.db!;
const call = async (method: string, url: string, body?: unknown) => {
  const r = await v2.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
  let j: any = null; try { j = r.json(); } catch { /* */ }
  return { status: r.statusCode, body: j };
};
let seq = 0;
const cid = () => `ts-${Date.now().toString(36)}-${(seq++).toString(36)}`;
let dealSeq = 9300;
const newDealNo = () => String(dealSeq++);

// ---- the source offer: a Kassenkunde with everything in Kundendaten, products, a number, a send status (neutral values) ----
const CUSTOMER = {
  salutation: "Frau", firstName: "Kunde", lastName: "A", email: "kunde@example.test", phone: "0170 000000",
  street: "Weg 1", postalCode: "95028", city: "Ort", state: "Bayern", deployment: "EG", parkDetails: "Hof",
  bitrixContactId: "301", customerNumber: "301", customerType: "Bestand", payer: "Kassenkunde",
  hasPflegegrad: "Ja", pflegegrad: "3", kassenkundeName: "Kasse A", kk_geburtsdatum: "01.01.1940", kk_versichertennr: "K123",
  kk_krankenkasseAdresse: "Kassenweg 2, Ort", kk_pflegegradSeit: "2023", kk_rechnungskopie: "ja", kk_rechnungskopie_art: "email",
  pflegekasseAntrag: "Ja", pflegekasseGenehmigung: "Nein",
  hasContactPerson: "Ja", cp_salutation: "Herr", cp_name: "Kontakt B", cp_phone: "0171", cp_email: "kontakt@example.test", cp_street: "Weg 3", cp_postalCode: "95028", cp_city: "Ort",
  wohnsituation: "Miete", vermieterGenehmigung: "Ja", wohnumfeldDone: "Ja", wohnumfeld: { done: true, amount: 1000, entries: [{ amount: 1000, fuerWas: "Rampe" }] },
  emc2_contact: "Jemand", ansprechpartner: "other@test.local", date: "2026-01-02", notes: "Kundennotiz",
};
function sourceOffer(type: NewOfferType) {
  const o = emptyOffer(type, { date: "2026-01-02" }) as Record<string, any>;
  o.Kundendaten = { ...o.Kundendaten, ...structuredClone(CUSTOMER) };
  o.offerNumber = "ANG2026-0102-101010";
  o.zusammenfassung = { ...o.zusammenfassung, versand: { art: "email", versendetAm: "2026-01-03" }, notizen: "intern" };
  o.rabatt = { ...o.rabatt, rabattProzent: 10 };
  o.mail = { ...o.mail, to: "kunde@example.test", subject: "Ihr Angebot", body: "Text" };
  return o;
}
async function seed(dealId: string, type: NewOfferType) {
  const r = await call("PUT", `/api/deals/${dealId}/draft`, { offerType: type, payload: sourceOffer(type), baseRevision: 0 });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}
const sw = (dealId: string, offerType: string, creationId = cid(), extra: Record<string, unknown> = {}) =>
  call("POST", `/api/deals/${dealId}/type-switch`, { offerType, creationId, ...extra });
const rawDocs = (dealId: string) => db().collection("deal_drafts").find({ dealId }).sort({ _id: 1 }).toArray();
const rawRevisions = (dealId: string) => db().collection("deal_draft_revisions").find({ dealId }).sort({ revision: 1 }).toArray();

describe("creation", () => {
  it("bu → bwt: a new variant of the same deal, named by the type, Kundendaten filled, no Bitrix call", async () => {
    const deal = newDealNo();
    await seed(deal, "bu");
    bx.take("v2");
    const id = cid();
    const r = await sw(deal, "bwt", id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(TypeSwitchResponseSchema.parse(r.body)).toEqual({
      ok: true, creationId: id, dealId: deal, sourceVariantId: "v1", variantId: switchVariantId(deal, id), variantName: "Badewannentür", offerType: "bwt", revision: r.body.revision, repeated: false,
    });
    expect(bx.take("v2")).toEqual([]); // no Bitrix write — no Bitrix call at all
    const d = (await call("GET", `/api/deals/${deal}/draft?variant=${r.body.variantId}`)).body;
    expect([d.offerType, d.variantName, d.payload.activeOffer]).toEqual(["bwt", "Badewannentür", "bwt"]);
    expect(d.payload.Kundendaten).toMatchObject({ firstName: "Kunde", lastName: "A", street: "Weg 1", payer: "Kassenkunde", pflegegrad: "3", kassenkundeName: "Kasse A", cp_name: "Kontakt B", ansprechpartner: USER.email });
    expect([d.payload.auftragId, d.payload.mail.auftragId, d.payload.postal.auftragId]).toEqual([deal, deal, deal]);
    // nothing else of the source: no number, no send status, no discount, no mail text
    expect(d.payload.offerNumber ?? "").toBe("");
    expect(d.payload.zusammenfassung?.versand ?? {}).toEqual(emptyOffer("bwt", { date: "x" }).zusammenfassung?.versand ?? {});
    expect(d.payload.rabatt).toEqual((emptyOffer("bwt", { date: "x" }) as any).rabatt);
    expect(d.payload.mail.subject ?? "").toBe((emptyOffer("bwt", { date: "x" }) as any).mail?.subject ?? "");
    // the new variant is the one opened last (today's UI follows it)
    expect((await call("GET", `/api/deals/${deal}/draft`)).body.variantId).toBe(r.body.variantId);
  });

  it("the old variant is untouched byte for byte (document and history)", async () => {
    const deal = newDealNo();
    await seed(deal, "bu");
    const before = await rawDocs(deal), revBefore = await rawRevisions(deal);
    const r = await sw(deal, "ah");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = await rawDocs(deal), revAfter = await rawRevisions(deal);
    expect(after).toHaveLength(2);
    expect(after.find((x) => String(x._id) === String(before[0]!._id))).toEqual(before[0]);
    expect(revAfter.filter((x) => !x.variantId)).toEqual(revBefore);
  });

  it("source = the given variant, else the one opened last", async () => {
    const deal = newDealNo();
    await seed(deal, "bu");
    const v = (await call("POST", `/api/deals/${deal}/variants`, { name: "Zweite" })).body.variant.variantId as string;
    const r = await sw(deal, "hl", cid(), { variantId: "v1" });
    expect([r.status, r.body.sourceVariantId]).toEqual([200, "v1"]);
    await call("GET", `/api/deals/${deal}/draft?variant=${v}`); // opened last
    const r2 = await sw(deal, "bl");
    expect([r2.status, r2.body.sourceVariantId]).toEqual([200, v]);
  });
});

describe("exactly once", () => {
  it("the same creationId twice: one variant, the second answer is the first (repeated)", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const id = cid();
    const a = await sw(deal, "ah", id);
    const b = await sw(deal, "ah", id);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toEqual({ ...a.body, repeated: true });
    expect((await call("GET", `/api/deals/${deal}/variants`)).body.variants).toHaveLength(2);
  });

  it("a double tap at the same moment: one variant", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const id = cid();
    const [a, b] = await Promise.all([sw(deal, "bwt", id), sw(deal, "bwt", id)]);
    expect([a.status, b.status], JSON.stringify([a.body, b.body])).toEqual([200, 200]);
    expect([a.body.repeated, b.body.repeated].sort()).toEqual([false, true]);
    expect(a.body.variantId).toBe(b.body.variantId);
    expect((await call("GET", `/api/deals/${deal}/variants`)).body.variants).toHaveLength(2);
  });

  it("the same creationId for another type: TYPE_SWITCH_ID_MISMATCH, nothing made", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const id = cid();
    expect((await sw(deal, "ah", id)).status).toBe(200);
    const r = await sw(deal, "bwt", id);
    expect([r.status, r.body.error.code]).toEqual([409, "TYPE_SWITCH_ID_MISMATCH"]);
    expect((await call("GET", `/api/deals/${deal}/variants`)).body.variants).toHaveLength(2);
  });

  it("a new creationId is a new switch (another variant of the type)", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    expect((await sw(deal, "ah")).status).toBe(200);
    expect((await sw(deal, "ah", cid(), { variantId: "v1" })).status).toBe(200);
    expect((await call("GET", `/api/deals/${deal}/variants`)).body.variants.map((v: any) => v.offerType)).toEqual(["bu", "ah", "ah"]);
  });
});

describe("the copy is the copy of „Weiteres Angebot“", () => {
  it.each([["bu", "ah"], ["ah", "bu"], ["bu", "bwt"], ["bwt", "hl"], ["hl", "bl"]] as [NewOfferType, NewOfferType][])("%s → %s: both features store the same offer (only the deal number differs)", async (from, to) => {
    const deal = newDealNo(); await seed(deal, from);
    const a = await sw(deal, to);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    const b = await call("POST", `/api/deals/${deal}/second-offer`, { offerType: to, creationId: cid(), variantId: "v1" });
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    const switched = (await call("GET", `/api/deals/${deal}/draft?variant=${a.body.variantId}`)).body.payload;
    const second = (await call("GET", `/api/deals/${b.body.dealId}/draft?variant=v1`)).body.payload;
    const withDeal = (p: any, id: string) => ({ ...p, auftragId: id, mail: { ...p.mail, auftragId: id }, postal: { ...p.postal, auftragId: id } });
    expect(switched).toEqual(withDeal(second, deal));
    expect(switched.Kundendaten).toEqual(second.Kundendaten);
  });

  it("the pure functions agree too (same source, same deal)", () => {
    const kd = sourceOffer("bu").Kundendaten;
    const a = { offerType: "ah" as const, sourceKundendaten: kd, today: "2026-11-26", contact: { ansprechpartner: "x@test.local" } };
    expect(offerWithCustomerData({ ...a, dealId: "1" })).toEqual(secondOfferPayload({ ...a, newDealId: "1" }));
  });

  it("customer fields the target type does not have are skipped (bu → ah), the source is not changed", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const r = await sw(deal, "ah");
    const kd = (await call("GET", `/api/deals/${deal}/draft?variant=${r.body.variantId}`)).body.payload.Kundendaten;
    // the Wohnumfeld answer belongs to building offers: an Alltagshilfe offer does not store it
    expect(kd.wohnumfeldDone).toBeUndefined();
    expect(kd.wohnumfeld).toEqual((emptyOffer("ah", { date: "x" }) as any).Kundendaten.wohnumfeld); // the empty default, nothing copied
    expect(kd).toMatchObject({ firstName: "Kunde", pflegegrad: "3", payer: "Kassenkunde" });
    expect((await call("GET", `/api/deals/${deal}/draft?variant=v1`)).body.payload.Kundendaten.wohnumfeldDone).toBe("Ja");
  });
});

describe("refusals", () => {
  it("a deal with a signed offer: 409 TYPE_SWITCH_SIGNED, nothing made", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    await db().collection("signingrequests").insertOne({ token: `tok-${deal}`, offerNumber: "ANG2026-0102-101010", status: "completed", completedAt: new Date(), bitrixEntityType: "deal", bitrixEntityId: deal, customerType: "SZ", payloadSnapshot: {} });
    const r = await sw(deal, "ah");
    expect([r.status, r.body.error.code]).toEqual([409, "TYPE_SWITCH_SIGNED"]);
    expect(r.body.error.message).toMatch(/unterschrieben/);
    expect((await rawDocs(deal))).toHaveLength(1);
  });

  it("a deal with SENT offers is allowed", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    await db().collection("offer_sends").insertOne({ dealId: deal, offerNumber: "ANG2026-0102-101010", status: "done", channel: "email", startedAt: new Date(), finishedAt: new Date(), total: 1000 });
    const r = await sw(deal, "bwt");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = DealVariantsResponseSchema.parse((await call("GET", `/api/deals/${deal}/variants`)).body).variants;
    expect(list.map((v) => [v.offerType, v.status])).toEqual([["bu", "sent"], ["bwt", "draft"]]);
  });

  it.each([
    ["the same type as the source", "bu", 409, "TYPE_SWITCH_SAME_TYPE"],
    ["an unknown type", "xx", 400, "TYPE_SWITCH_TYPE_INVALID"],
    ["Winterdienst (not in the second-offer list)", "wd", 400, "TYPE_SWITCH_TYPE_INVALID"],
  ])("%s", async (_n, type, status, code) => {
    const deal = newDealNo(); await seed(deal, "bu");
    const r = await sw(deal, type);
    expect([r.status, r.body.error.code]).toEqual([status, code]);
  });

  it("no draft, an unknown variant, a temporary key, a bad creation id", async () => {
    expect((await sw("9399", "ah")).body.error.code).toBe("TYPE_SWITCH_SOURCE_MISSING");
    const deal = newDealNo(); await seed(deal, "bu");
    expect((await sw(deal, "ah", cid(), { variantId: "v-000000000000" })).body.error.code).toBe("TYPE_SWITCH_SOURCE_MISSING");
    expect((await sw("t-0123456789abcdef01234567", "ah")).body.error.code).toBe("TYPE_SWITCH_TEMP_DEAL");
    expect((await call("POST", `/api/deals/${deal}/type-switch`, { offerType: "ah", creationId: "x" })).status).toBe(400);
  });
});

describe("a deal with variants of different types", () => {
  it("each variant saves with its own type; a save that would change a variant's type is refused", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const v = (await sw(deal, "bwt")).body;
    const nv = (await call("GET", `/api/deals/${deal}/draft?variant=${v.variantId}`)).body;
    const ok = await call("PUT", `/api/deals/${deal}/draft?variant=${v.variantId}`, { offerType: "bwt", payload: { ...nv.payload, x: 1 }, baseRevision: nv.revision });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const one = (await call("GET", `/api/deals/${deal}/draft?variant=v1`)).body;
    expect((await call("PUT", `/api/deals/${deal}/draft?variant=v1`, { offerType: "bu", payload: { ...one.payload, y: 1 }, baseRevision: one.revision })).status).toBe(200);
    // today's UI (no variant) acts on the variant opened last: another tile there is refused, not written over it
    const last = (await call("GET", `/api/deals/${deal}/draft`)).body;
    const other = last.offerType === "bu" ? "bwt" : "bu";
    const bad = await call("PUT", `/api/deals/${deal}/draft`, { offerType: other, payload: last.payload, baseRevision: last.revision });
    expect([bad.status, bad.body.error.code]).toEqual([409, "VARIANT_TYPE_MISMATCH"]);
  });

  it("the variant list names each variant's type; rename and delete work as for any variant", async () => {
    const deal = newDealNo(); await seed(deal, "ah");
    const v = (await sw(deal, "bu")).body;
    const list = DealVariantsResponseSchema.parse((await call("GET", `/api/deals/${deal}/variants`)).body);
    expect(list.variants.map((x) => [x.variantId, x.name, x.offerType, x.status, x.isDefault])).toEqual([
      ["v1", "Variante 1", "ah", "sent", false], [v.variantId, "Badumbau", "bu", "draft", true],
    ]);
    expect((await call("PATCH", `/api/deals/${deal}/variants/${v.variantId}`, { name: "Badumbau groß" })).body.variant.name).toBe("Badumbau groß");
    expect((await call("DELETE", `/api/deals/${deal}/variants/${v.variantId}`)).status).toBe(200);
  });
});
