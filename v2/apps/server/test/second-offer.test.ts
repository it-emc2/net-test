// ADR 027 B, step 1: a second offer type for the same customer. Through the real routes with an
// in-memory MongoDB and a recording Bitrix stub — nothing leaves the machine. Every Bitrix call of a
// creation is asserted (number, order, exact fields).
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig, secondOfferSettings, SECOND_OFFER_DEAL_VALUES } from "@oc/config";
import { DealDraftResponseSchema, DealRelatedResponseSchema, SecondOfferResponseSchema } from "@oc/api-contract";
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { buildApp } from "../src/app.js";
import { BitrixError } from "../src/integrations/bitrix.js";
import { DealCreateNoIdError } from "../src/integrations/bitrix-deal.js";
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { createOutcome, customerNameText, secondOffer, SecondOfferError } from "../src/modules/deal-drafts/second-offer.js";
import { BitrixStub, type RecordedCall } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";

const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";
let mongod: MongoMemoryServer, v2: FastifyInstance, token = "";

// ---- the Bitrix stub: deals with/without contact, a controllable create, the lookup by external id ----
let nextId = 50001;
let addMode: "ok" | "refuse" | "drop" | "drop-unrecorded" | "noid" = "ok";
let failCommentOn: string | null = null;
const byOrigin = new Map<string, number>();
const bx = new BitrixStub({
  ...BITRIX_HANDLERS,
  "crm.deal.get": (p, app) => {
    const id = p.get("id") ?? "";
    if (/^880\d$/.test(id)) return { result: { ID: id, STAGE_ID: "C38:NEW", CONTACT_ID: id === "8802" ? null : "301" } };
    return BITRIX_HANDLERS["crm.deal.get"]!(p, app);
  },
  "crm.item.add": (p) => {
    const origin = p.get("fields[originId]") ?? "";
    if (addMode === "refuse") return { error: "ACCESS_DENIED", error_description: "Access denied" };
    if (addMode === "noid") return { result: { item: {} } };
    if (addMode === "drop-unrecorded") return { __drop: true };
    const id = nextId++;
    byOrigin.set(origin, id);
    if (addMode === "drop") return { __drop: true }; // created, but the answer is lost
    return { result: { item: { id, categoryId: Number(p.get("fields[categoryId]")), stageId: p.get("fields[stageId]") } } };
  },
  "crm.item.list": (p, app) => {
    if (p.get("filter[originatorId]") !== null) {
      const id = p.get("filter[originatorId]") === "oc-second-offer" ? byOrigin.get(p.get("filter[originId]") ?? "") : undefined;
      return { result: { items: id ? [{ id }] : [] }, total: id ? 1 : 0 };
    }
    return BITRIX_HANDLERS["crm.item.list"]!(p, app);
  },
  "crm.timeline.comment.add": (p) => (failCommentOn && p.get("fields[ENTITY_ID]") === failCommentOn ? { error: "ACCESS_DENIED", error_description: "Access denied" } : { result: 4711 }),
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await bx.start();
  const client = new mongoose.mongo.MongoClient(uri); await client.connect();
  await client.db("KonfiguratorDB").collection("users").insertOne({ email: USER.email, name: "Contract", passwordHash: hashPassword(USER.password), role: "admin", active: true, signatureDataUrl: SIGNATURE });
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
beforeEach(() => { addMode = "ok"; failCommentOn = null; bx.take("v2"); });

const db = () => mongoose.connection.db!;
const call = async (method: string, url: string, body?: unknown) => {
  const r = await v2.inject({ method: method as any, url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
  let j: any = null; try { j = r.json(); } catch { /* */ }
  return { status: r.statusCode, body: j };
};
let seq = 0;
const cid = () => `cr-${Date.now().toString(36)}-${(seq++).toString(36)}`;
let dealSeq = 7700;
const newDealNo = () => String(dealSeq++);
const methods = (calls: RecordedCall[]) => calls.map((c) => c.method);
const params = (c: RecordedCall) => Object.fromEntries(new URLSearchParams(c.params));
/** the recorded error codes of a deal (the insert is not awaited by the route: wait until `code` is there, at most 2 s) */
const errorCodes = async (dealId: string, code?: string) => {
  for (let i = 0; ; i++) {
    const codes = (await db().collection("error_events").find({ dealId }).toArray()).map((e: any) => e.code as string);
    if (!code || codes.includes(code) || i >= 40) return codes;
    await new Promise((r) => setTimeout(r, 50));
  }
};
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ---- the source offer: a Kassenkunde with everything in Kundendaten, products, a number, a send status ----
const TODAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const CUSTOMER = {
  salutation: "Frau", firstName: "Erika", lastName: "Muster", email: "kunde@example.test", phone: "0170 000000",
  street: "Musterweg 1", postalCode: "95028", city: "Hof", state: "Bayern", deployment: "EG", parkDetails: "Hof",
  bitrixContactId: "301", customerNumber: "301", customerType: "Bestand", payer: "Kassenkunde",
  hasPflegegrad: "Ja", pflegegrad: "3", kassenkundeName: "AOK", kk_geburtsdatum: "01.01.1940", kk_versichertennr: "K123",
  kk_krankenkasseAdresse: "Kassenweg 2, Hof", kk_pflegegradSeit: "2023", kk_rechnungskopie: "ja", kk_rechnungskopie_art: "email",
  pflegekasseAntrag: "Ja", pflegekasseGenehmigung: "Nein",
  hasContactPerson: "Ja", cp_salutation: "Herr", cp_name: "Max Muster", cp_phone: "0171", cp_email: "kontakt@example.test", cp_street: "Weg 3", cp_postalCode: "95028", cp_city: "Hof",
  twoPersons: "Zwei Personen mit Pflegegrad", partnerSalutation: "Herr", partnerFirstName: "Max", partnerLastName: "Muster", partnerPflegegrad: "2", partnerKvnr: "K456",
  wohnsituation: "Miete", vermieterGenehmigung: "Ja", wohnumfeldDone: "Ja", wohnumfeld: { done: true, amount: 1000, entries: [{ amount: 1000, fuerWas: "Rampe" }] },
  emc2_contact: "Someone Else", ansprechpartner: "other@test.local", date: "2026-01-02", notes: "Kundennotiz",
};
function sourceOffer(type: NewOfferType, kd: Record<string, unknown> = CUSTOMER) {
  const o = emptyOffer(type, { date: "2026-01-02" }) as Record<string, any>;
  o.Kundendaten = { ...o.Kundendaten, ...structuredClone(kd) };
  o.offerNumber = "ANG2026-0102-101010";
  o.zusammenfassung = { ...o.zusammenfassung, versand: { art: "email", versendetAm: "2026-01-03" }, notizen: "intern" };
  o.duschwanne = { ...o.duschwanne, selectedTray: "TRAY-1", qty_x: 2 };
  o.rabatt = { ...o.rabatt, rabattProzent: 10 };
  o.mail = { ...o.mail, to: "kunde@example.test", subject: "Ihr Angebot", body: "Text" };
  o.auftragId = "OLD";
  return o;
}
async function seed(dealId: string, type: NewOfferType, kd?: Record<string, unknown>) {
  const r = await call("PUT", `/api/deals/${dealId}/draft`, { offerType: type, payload: sourceOffer(type, kd), baseRevision: 0 });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}
const create = (dealId: string, offerType: string, creationId = cid(), extra: Record<string, unknown> = {}) =>
  call("POST", `/api/deals/${dealId}/second-offer`, { offerType, creationId, ...extra });

describe("the Bitrix create request", () => {
  const TYPES: [NewOfferType, NewOfferType, string, string][] = [
    ["ah", "bu", "4334", "7730"], ["bu", "bwt", "4334", "4704"], ["bu", "hl", "4334", "4034"], ["bu", "bl", "4334", "4158"], ["bu", "ah", "4002", "4566"],
  ];
  it.each(TYPES)("%s → %s: exactly these fields, one create + one batch", async (from, to, kategorie, taetigkeit) => {
    const deal = newDealNo();
    await seed(deal, from);
    bx.take("v2");
    const creationId = cid();
    const r = await create(deal, to, creationId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(SecondOfferResponseSchema.parse(r.body)).toMatchObject({ ok: true, sourceDealId: deal, offerType: to, variantId: "v1", comments: "ok", repeated: false });
    const calls = bx.take("v2");
    expect(methods(calls)).toEqual(["crm.item.add", "batch"]);
    expect(calls[0]!.http).toBe("POST");
    expect(params(calls[0]!)).toEqual({
      entityTypeId: "2", useOriginalUfNames: "Y",
      "fields[categoryId]": "72", "fields[stageId]": "C72:NEW", "fields[title]": "Neuanfrage", "fields[sourceId]": "WEBFORM",
      "fields[contactId]": "301", "fields[contactIds][0]": "301",
      "fields[originatorId]": "oc-second-offer", "fields[originId]": creationId,
      "fields[UF_CRM_1725458507816][0]": kategorie, "fields[UF_CRM_1725521281342][0]": taetigkeit,
      "fields[UF_CRM_1764764902076]": "8158", "fields[UF_CRM_1736426014]": "Muster, Erika",
    });
    // no responsible person, no final title: the stage's automation rules write them
    expect(calls[0]!.params).not.toMatch(/assignedById|ASSIGNED_BY_ID/);
    // the two timeline notes in ONE batch
    const batch = params(calls[1]!);
    const notes = Object.entries(batch).filter(([k]) => /^cmd\[/.test(k)).map(([, v]) => Object.fromEntries(new URLSearchParams(v.split("?")[1])));
    const label = { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", bl: "Barrierefreies Leben", ah: "Alltagshilfe" }[to];
    expect(notes).toEqual([
      { "fields[ENTITY_ID]": r.body.dealId, "fields[ENTITY_TYPE]": "deal", "fields[COMMENT]": `Angelegt aus OC als weiteres Angebot (${label}) zum Auftrag ${deal}` },
      { "fields[ENTITY_ID]": deal, "fields[ENTITY_TYPE]": "deal", "fields[COMMENT]": `Weiteres Angebot (${label}) angelegt: Auftrag ${r.body.dealId}` },
    ]);
  });

  it("contact from the first deal when the offer names none: one read first", async () => {
    const deal = "8801";
    await seed(deal, "bu", { ...CUSTOMER, bitrixContactId: "", customerNumber: "" });
    bx.take("v2");
    const r = await create(deal, "ah");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const calls = bx.take("v2");
    expect(methods(calls)).toEqual(["crm.deal.get", "crm.item.add", "batch"]);
    expect(params(calls[0]!)).toEqual({ id: "8801" });
    expect(params(calls[1]!)["fields[contactId]"]).toBe("301");
  });

  it("the value table and its settings come from config (env override)", () => {
    const s = secondOfferSettings({ SECOND_OFFER_CATEGORY_ID: 99, SECOND_OFFER_STAGE_ID: "C99:NEW", SECOND_OFFER_SOURCE_ID: "WEBFORM", SECOND_OFFER_TITLE: "Neuanfrage", SECOND_OFFER_VALUES_JSON: '{"byType":{"bl":{"taetigkeiten":["9999"]}},"zugehoerigkeit":"1"}' });
    expect(s).toMatchObject({ categoryId: 99, stageId: "C99:NEW", values: { zugehoerigkeit: "1", byType: { bl: { kategorieNeu: ["4334"], taetigkeiten: ["9999"] } } } });
    expect(SECOND_OFFER_DEAL_VALUES.byType.bl!.taetigkeiten).toEqual(["4158"]); // the default is not changed
    expect(() => secondOfferSettings({ SECOND_OFFER_CATEGORY_ID: 72, SECOND_OFFER_STAGE_ID: "x", SECOND_OFFER_SOURCE_ID: "x", SECOND_OFFER_TITLE: "x", SECOND_OFFER_VALUES_JSON: '{"byType":{"bl":{"taetigkeiten":["x"]}}}' })).toThrow(/SECOND_OFFER_VALUES_JSON/);
    expect(() => loadConfig({ NODE_ENV: "test", SECOND_OFFER_VALUES_JSON: "{" })).toThrow(/SECOND_OFFER_VALUES_JSON/);
    expect(customerNameText({ firstName: " Erika ", lastName: "Muster" })).toBe("Muster, Erika");
    expect(customerNameText({ lastName: "Muster" })).toBe("Muster");
  });
});

describe("exactly once", () => {
  it("the same creationId twice: one create, the stored result, no Bitrix call", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    const a = await create(deal, "ah", id);
    const b = await create(deal, "ah", id);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(b.body).toEqual({ ...a.body, repeated: true });
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add", "batch"]);
  });

  it("the same creationId in parallel: one create", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    const rs = await Promise.all([create(deal, "hl", id), create(deal, "hl", id), create(deal, "hl", id)]);
    const ok = rs.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of rs) if (r.status !== 200) expect(r.body.error.code).toBe("SECOND_OFFER_RUNNING");
    expect(new Set(ok.map((r) => r.body.dealId)).size).toBe(1);
    expect(methods(bx.take("v2")).filter((m) => m === "crm.item.add")).toHaveLength(1);
    const again = await create(deal, "hl", id);
    expect(again.body.dealId).toBe(ok[0]!.body.dealId);
  });

  it("a creationId used for another type or deal is refused", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const id = cid();
    expect((await create(deal, "ah", id)).status).toBe(200);
    bx.take("v2");
    const r = await create(deal, "hl", id);
    expect([r.status, r.body.error.code]).toEqual([409, "SECOND_OFFER_ID_MISMATCH"]);
    expect(bx.take("v2")).toEqual([]);
  });

  it("a definite refusal: nothing created, the retry creates once", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    addMode = "refuse";
    const a = await create(deal, "ah", id);
    expect([a.status, a.body.error.code]).toEqual([502, "SECOND_OFFER_BITRIX_FAILED"]);
    expect(a.body.error.message).toMatch(/kein neuer Auftrag angelegt/);
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add"]);
    expect((await db().collection("second_offer_creations").findOne({ _id: id as any }))?.state).toBe("failed");
    addMode = "ok";
    const b = await create(deal, "ah", id);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add", "batch"]);
    await wait();
    expect(await errorCodes(deal, "SECOND_OFFER_BITRIX_FAILED")).toContain("SECOND_OFFER_BITRIX_FAILED");
  });

  it("an unknown outcome: no blind retry; the explicit check finds the deal made by this creationId", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    addMode = "drop"; // Bitrix created the deal, the answer never arrived
    const a = await create(deal, "ah", id);
    expect([a.status, a.body.error.code]).toEqual([502, "SECOND_OFFER_UNCLEAR"]);
    expect(a.body.error.message).toMatch(/Bitrix unter „Neue Anfragen“/);
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add"]);
    addMode = "ok";
    const b = await create(deal, "ah", id); // a plain repeat: refused, no Bitrix call
    expect([b.status, b.body.error.code]).toEqual([409, "SECOND_OFFER_UNCLEAR"]);
    expect(bx.take("v2")).toEqual([]);
    const c = await create(deal, "ah", id, { checkBitrix: true });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.dealId).toBe(String(byOrigin.get(id)));
    const calls = bx.take("v2");
    expect(methods(calls)).toEqual(["crm.item.list", "batch"]); // looked up, NOT created again
    expect(params(calls[0]!)).toMatchObject({ entityTypeId: "2", "filter[originatorId]": "oc-second-offer", "filter[originId]": id, "select[0]": "id" });
    await wait();
    expect(await errorCodes(deal, "SECOND_OFFER_UNCLEAR")).toContain("SECOND_OFFER_UNCLEAR");
  });

  it("an unknown outcome that did not create anything: the check finds none, then creates once", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    addMode = "drop-unrecorded";
    expect((await create(deal, "bl", id)).body.error.code).toBe("SECOND_OFFER_UNCLEAR");
    addMode = "ok"; bx.take("v2");
    const c = await create(deal, "bl", id, { checkBitrix: true });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(methods(bx.take("v2"))).toEqual(["crm.item.list", "crm.item.add", "batch"]);
  });

  it("an answer without id counts as unknown", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    addMode = "noid";
    expect((await create(deal, "ah")).body.error.code).toBe("SECOND_OFFER_UNCLEAR");
  });

  it("the deal was created but the draft write failed: the repeat finishes it without a new deal", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const id = cid();
    const next = String(nextId);
    // the draft history refuses the new deal's first revision (a real write failure, no test seam)
    await db().command({ collMod: "deal_draft_revisions", validator: { dealId: { $ne: next } }, validationAction: "error" });
    let a;
    try { a = await create(deal, "ah", id); } finally { await db().command({ collMod: "deal_draft_revisions", validator: {} }); }
    expect([a.status, a.body.error.code, a.body.error.newDealId]).toEqual([500, "SECOND_OFFER_DRAFT_FAILED", next]);
    expect(a.body.error.message).toMatch(new RegExp(`Auftrag ${next} wurde in Bitrix angelegt`));
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add"]); // no notes yet
    expect((await call("GET", `/api/deals/${next}/draft`)).status).toBe(404);
    const b = await create(deal, "ah", id);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.dealId).toBe(next);
    expect(methods(bx.take("v2"))).toEqual(["batch"]); // no second create
    expect((await call("GET", `/api/deals/${next}/draft`)).body.offerType).toBe("ah");
  });

  it("a failed timeline note does not fail the creation", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    failCommentOn = deal;
    const id = cid();
    const r = await create(deal, "ah", id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.comments).toBe("failed");
    expect(methods(bx.take("v2"))).toEqual(["crm.item.add", "batch"]);
    await wait();
    expect(await errorCodes(deal, "SECOND_OFFER_COMMENT_FAILED")).toContain("SECOND_OFFER_COMMENT_FAILED");
    expect((await create(deal, "ah", id)).body.comments).toBe("failed"); // never posted again
    expect(bx.take("v2")).toEqual([]);
  });
});

describe("refusals", () => {
  it("same type, temp key, unknown type, bad id, no draft, unknown variant, no contact", async () => {
    const deal = newDealNo(); await seed(deal, "bu"); bx.take("v2");
    const same = await create(deal, "bu");
    expect([same.status, same.body.error.code]).toEqual([409, "SECOND_OFFER_SAME_TYPE"]);
    expect(same.body.error.message).toMatch(/Variante/);
    const temp = await create("t-0123456789abcdef01234567", "ah");
    expect([temp.status, temp.body.error.code]).toEqual([409, "SECOND_OFFER_TEMP_DEAL"]);
    const type = await create(deal, "hms");
    expect([type.status, type.body.error.code]).toEqual([400, "SECOND_OFFER_TYPE_INVALID"]);
    const wd = await create(deal, "wd"); // a React type, but no Bitrix deal values for a second offer (SECOND_OFFER_TYPES)
    expect([wd.status, wd.body.error.code]).toEqual([400, "SECOND_OFFER_TYPE_INVALID"]);
    const bad = await call("POST", `/api/deals/${deal}/second-offer`, { offerType: "ah", creationId: "x" });
    expect([bad.status, bad.body.error.code]).toEqual([400, "BAD_REQUEST"]);
    const none = await create(newDealNo(), "ah");
    expect([none.status, none.body.error.code]).toEqual([404, "SECOND_OFFER_SOURCE_MISSING"]);
    const variant = await create(deal, "ah", cid(), { variantId: "v-0123456789ab" });
    expect([variant.status, variant.body.error.code]).toEqual([404, "SECOND_OFFER_SOURCE_MISSING"]);
    expect(bx.take("v2")).toEqual([]); // none of them asked Bitrix

    await seed("8802", "bu", { ...CUSTOMER, bitrixContactId: "", customerNumber: "" }); bx.take("v2");
    const id = cid();
    const noContact = await create("8802", "ah", id);
    expect([noContact.status, noContact.body.error.code]).toEqual([409, "SECOND_OFFER_NO_CONTACT"]);
    expect(methods(bx.take("v2"))).toEqual(["crm.deal.get"]); // no contact is created
    expect((await db().collection("second_offer_creations").findOne({ _id: id as any }))?.state).toBe("failed");
    await wait();
    expect(await errorCodes(deal, "SECOND_OFFER_TYPE_INVALID")).toEqual(expect.arrayContaining(["SECOND_OFFER_SAME_TYPE", "SECOND_OFFER_TYPE_INVALID"]));
  });

  it("Bitrix not configured / not reachable: refused, nothing created, retry allowed", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    let creates = 0;
    const deps = (configured: boolean, fail?: unknown) => ({
      bitrixConfigured: () => configured,
      settings: secondOfferSettings({ SECOND_OFFER_CATEGORY_ID: 72, SECOND_OFFER_STAGE_ID: "C72:NEW", SECOND_OFFER_SOURCE_ID: "WEBFORM", SECOND_OFFER_TITLE: "Neuanfrage", SECOND_OFFER_VALUES_JSON: undefined }),
      deals: {
        createDeal: async () => { creates++; if (fail) throw fail; return 60001; },
        findDealByOrigin: async () => null, getDealContactId: async () => 301,
        addTimelineComments: async () => ({ result: {}, result_error: {} }),
      },
    });
    const input = { dealId: deal, offerType: "ah", creationId: cid(), by: USER.email };
    await expect(secondOffer(deps(false)).create(input)).rejects.toMatchObject({ code: "SECOND_OFFER_BITRIX_FAILED", status: 503 });
    expect(await db().collection("second_offer_creations").findOne({ _id: input.creationId as any })).toBeNull(); // nothing claimed
    const refused = new BitrixError("fetch failed", { kind: "unreachable", cause: Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }) });
    const e = await secondOffer(deps(true, refused)).create(input).catch((x) => x);
    expect(e).toBeInstanceOf(SecondOfferError);
    expect([e.code, e.status]).toEqual(["SECOND_OFFER_BITRIX_FAILED", 502]);
    expect(e.message).toMatch(/nicht erreichbar/);
    const ok = await secondOffer(deps(true)).create(input);
    expect(ok).toMatchObject({ dealId: "60001", repeated: false });
    expect(creates).toBe(2);
  });

  it("what counts as a definite failure and what as unknown", () => {
    const be = (kind: any, cause?: unknown) => new BitrixError("x", { kind, cause });
    expect(createOutcome(be("refused"))).toBe("definite");
    expect(createOutcome(be("rate-limit"))).toBe("definite");
    expect(createOutcome(be("not-configured"))).toBe("definite");
    expect(createOutcome(be("unreachable", { cause: { code: "ECONNREFUSED" } }))).toBe("definite");
    expect(createOutcome(be("unreachable", { cause: { code: "UND_ERR_SOCKET" } }))).toBe("unknown");
    expect(createOutcome(be("timeout"))).toBe("unknown");
    expect(createOutcome(be("malformed"))).toBe("unknown");
    expect(createOutcome(new DealCreateNoIdError("x"))).toBe("unknown");
    expect(createOutcome(new Error("other"))).toBe("unknown");
  });
});

describe("the new offer", () => {
  const PRODUCT_SECTIONS = ["duschwanne", "rabatt"];
  it.each(["bwt", "hl", "bl", "ah"] as NewOfferType[])("bu → %s: customer data copied, deal number in all three places, nothing else", async (to) => {
    const deal = newDealNo(); await seed(deal, "bu");
    const r = await create(deal, to);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = await call("GET", `/api/deals/${r.body.dealId}/draft`);
    expect(DealDraftResponseSchema.parse(d.body)).toMatchObject({ offerType: to, variantId: "v1", revision: r.body.revision });
    const p = d.body.payload, kd = p.Kundendaten;
    const empty = emptyOffer(to, { date: TODAY }) as Record<string, any>;
    // the deal number everywhere an offer carries it
    expect([p.auftragId, p.mail.auftragId, p.postal.auftragId]).toEqual([r.body.dealId, r.body.dealId, r.body.dealId]);
    // NOT copied: products, prices, offer number, send status, other steps' notes, the mail text
    expect(p.offerNumber).toBe(empty.offerNumber);
    expect(p.zusammenfassung).toEqual(empty.zusammenfassung);
    for (const s of PRODUCT_SECTIONS) expect(p[s], s).toEqual(empty[s]);
    expect([p.mail.subject, p.mail.body]).toEqual([empty.mail.subject, empty.mail.body]);
    expect(p.activeOffer).toBe(to);
    // a new offer: today, the signed-in user as contact person
    expect([kd.date, kd.ansprechpartner, kd.emc2_contact]).toEqual([TODAY, USER.email, "Contract"]);
    // the customer
    for (const f of ["salutation", "firstName", "lastName", "email", "phone", "street", "postalCode", "city", "state", "deployment", "parkDetails", "bitrixContactId", "customerNumber", "customerType", "payer",
      "hasPflegegrad", "pflegegrad", "kassenkundeName", "kk_geburtsdatum", "kk_versichertennr", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "kk_rechnungskopie_art",
      "pflegekasseAntrag", "pflegekasseGenehmigung", "hasContactPerson", "cp_salutation", "cp_name", "cp_phone", "cp_email", "cp_street", "cp_postalCode", "cp_city",
      "partnerSalutation", "partnerFirstName", "partnerLastName", "partnerPflegegrad", "partnerKvnr", "wohnsituation", "vermieterGenehmigung", "notes"]) {
      expect(kd[f], f).toEqual((CUSTOMER as any)[f]);
    }
    expect([kd.twoPersons, kd.budgetOptionsPanel]).toEqual(["Zwei Personen mit Pflegegrad", "ZWEI PERSONEN MIT PFLEGEGRAD"]);
    expect(kd.vermieterGenehmigungErforderlich).toBe("Ja"); // renting asks for the landlord
    // type-dependent: no Wohnumfeld answer for Alltagshilfe
    if (to === "ah") expect("wohnumfeldDone" in kd).toBe(false);
    else expect([kd.wohnumfeldDone, kd.wohnumfeld]).toEqual(["Ja", { done: true, amount: 1000, entries: [{ amount: 1000, fuerWas: "Rampe" }] }]);
    // mail recipient and letter recipient follow the customer
    expect(p.mail.to).toBe("kunde@example.test");
    expect(p.postal.recipient).toMatchObject({ firstName: "Erika", lastName: "Muster", street: "Musterweg 1", zipCode: "95028", city: "Hof" });
    // the source is unchanged (except its relation)
    const src = await call("GET", `/api/deals/${deal}/draft`);
    expect(src.body.payload).toEqual(sourceOffer("bu"));
  });

  it("a Selbstzahler: the insurance details are not copied", async () => {
    const deal = newDealNo();
    await seed(deal, "ah", { ...CUSTOMER, payer: "Selbstzahler" });
    const r = await create(deal, "bu");
    const kd = (await call("GET", `/api/deals/${r.body.dealId}/draft`)).body.payload.Kundendaten;
    expect(kd.payer).toBe("Selbstzahler");
    for (const f of ["kassenkundeName", "kk_geburtsdatum", "kk_versichertennr", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "wohnumfeldDone"]) expect(f in kd, f).toBe(false);
    expect([kd.firstName, kd.lastName, kd.email]).toEqual(["Erika", "Muster", "kunde@example.test"]);
  });

  it("from a given variant", async () => {
    const deal = newDealNo(); await seed(deal, "bu");
    const v = await call("POST", `/api/deals/${deal}/variants`, { name: "B" });
    const vid = v.body.variant.variantId;
    const d = await call("GET", `/api/deals/${deal}/draft?variant=${vid}`);
    const payload = { ...d.body.payload, Kundendaten: { ...d.body.payload.Kundendaten, phone: "0999" } };
    await call("PUT", `/api/deals/${deal}/draft?variant=${vid}`, { offerType: "bu", payload, baseRevision: d.body.revision });
    const r = await create(deal, "ah", cid(), { variantId: vid });
    expect(r.body.sourceVariantId).toBe(vid);
    expect((await call("GET", `/api/deals/${r.body.dealId}/draft`)).body.payload.Kundendaten.phone).toBe("0999");
    expect((await call("GET", `/api/deals/${deal}/draft?variant=${vid}`)).body.related.map((x: any) => x.dealId)).toEqual([r.body.dealId]);
  });
});

describe("the relation", () => {
  it("is readable from both sides; a deal can have several", async () => {
    const a = newDealNo(); await seed(a, "bu");
    const b = (await create(a, "ah")).body.dealId, c = (await create(a, "hl")).body.dealId;
    const ra = DealRelatedResponseSchema.parse((await call("GET", `/api/deals/${a}/related`)).body);
    expect(ra.related.map((r) => [r.dealId, r.offerType, r.role, r.status])).toEqual([[b, "ah", "created", "draft"], [c, "hl", "created", "draft"]]);
    const rb = DealRelatedResponseSchema.parse((await call("GET", `/api/deals/${b}/related`)).body);
    expect(rb.related.map((r) => [r.dealId, r.offerType, r.role])).toEqual([[a, "bu", "source"]]); // not transitive: C is not listed
    // and on the draft answer
    expect((await call("GET", `/api/deals/${a}/draft`)).body.related.map((r: any) => r.dealId)).toEqual([b, c]);
    expect((await call("GET", `/api/deals/${c}/draft`)).body.related).toEqual([expect.objectContaining({ dealId: a, role: "source" })]);
    // a second offer from B back to bu is another relation of B, symmetric again
    const d = (await create(b, "bwt")).body.dealId;
    expect((await call("GET", `/api/deals/${b}/related`)).body.related.map((r: any) => r.dealId)).toEqual([a, d]);
    expect((await call("GET", "/api/deals/t-0123456789abcdef01234567/related")).body).toEqual({ dealId: "t-0123456789abcdef01234567", related: [] });
  });
});
