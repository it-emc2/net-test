// API contract test: the LEGACY Express app (spawned as a real process) and the v2 server
// run against the SAME in-memory MongoDB and answer the same requests. Success bodies must be
// identical; errors must match in status code and German message. A session token issued by
// the legacy login must be accepted by v2 (cut-over keeps everybody logged in).
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EJSON } from "bson";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { registerApi } from "../src/routes/api.js";
import { BitrixStub } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";
import { SmtpSink, mailView } from "./helpers/smtp-sink.js";
import type { OfferDocuments, SigningPort } from "../src/email/ports.js";
import { PDFDocument } from "pdf-lib";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const fx = (p: string) => JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/" + p, "utf8"));
// Random free port: a fixed port can be taken by an orphaned server from an earlier, crashed
// run (which then answers with a different database).
let LEGACY_PORT = 0;
const freePort = () => new Promise<number>((resolve, reject) => {
  const srv = createServer();
  srv.once("error", reject);
  srv.listen(0, "127.0.0.1", () => { const p = (srv.address() as any).port; srv.close(() => resolve(p)); });
});
const SECRET = "contract-test-secret-0123456789abcdef";
const USER = { email: "contract@test.local", password: "contract-pass" };
const DEAD = "http://127.0.0.1:9";

let mongod: MongoMemoryServer;
let legacy: ChildProcess;
let v2: FastifyInstance;
let token = "";
const bx = new BitrixStub(BITRIX_HANDLERS);
const smtp = new SmtpSink();
const OB24 = { OB24_API_KEY: "ob24-test-key", OB24_API_SECRET: "ob24-test-secret", OB24_MODE: "test" };
const MAIL = { SMTP_EMAIL: "angebote@test.local", SMTP_PASS: "smtp-test-pass", SMTP_REPLY_TO: "service@test.local", PUBLIC_BASE_URL: "http://oc.test" };
// fake LibreOffice: both apps "convert" DOCX → this fixed PDF (documents themselves = phase 5)
const FAKE_SOFFICE_DIR = mkdtempSync(join(tmpdir(), "oc-fake-soffice-"));
writeFileSync(join(FAKE_SOFFICE_DIR, "soffice"), `#!/bin/sh
out=""; prev=""; last=""
for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; last="$a"; done
[ -n "$out" ] || exit 0
printf '%%PDF-1.4\\n%% OC contract-test fake PDF\\n%%%%EOF\\n' > "$out/$(basename "$last" .docx).pdf"
`);
chmodSync(join(FAKE_SOFFICE_DIR, "soffice"), 0o755);
const PATH_WITH_FAKE_SOFFICE = `${FAKE_SOFFICE_DIR}:${process.env.PATH}`;
let documentsBridge: OfferDocuments;
let ORIGINAL_CWD = "";
let signingBridge: SigningPort;

const MAGIC = { EXTERNAL_API_USER: "magic@test.local", EXTERNAL_API_PASSWORD: "magic-test-pass" };

async function waitFor(url: string, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`legacy app not healthy at ${url}`);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  LEGACY_PORT = await freePort();
  await bx.start();
  await smtp.start(0);
  const client = new mongoose.mongo.MongoClient(uri);
  await client.connect();
  const db = client.db("KonfiguratorDB");
  await db.collection("Products").insertMany(fx("docs/products.json"));
  await db.collection("Services").insertMany(fx("catalog/services.json").map((s: any) => ({ ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) })));
  await db.collection("appconfigs").insertMany(Object.entries(fx("pricing/config.json")).map(([key, value]) => ({ key, value })));
  const ejson = (p: string) => EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/" + p, "utf8")) as any[];
  await db.collection("offers").insertMany(ejson("docs-db/offers.json"));
  await db.collection("drafts").insertMany(ejson("docs-db/drafts.json"));
  await db.collection("users").insertOne({ email: USER.email, name: "Contract", passwordHash: hashPassword(USER.password), role: "admin", active: true });
  await db.collection("users").insertMany([
    { email: "ap@test.local", name: "AP Test", firstName: "AP", lastName: "Test", passwordHash: hashPassword("ap-pass"), role: "user", active: true, signatureDataUrl: "data:image/png;base64,AAAA", createdAt: new Date("2025-01-01") },
    { email: "inactive@test.local", name: "Inactive", passwordHash: hashPassword("x"), role: "user", active: false, signatureDataUrl: "data:image/png;base64,BBBB" },
  ]);
  const vigor = fx("docs/vigor-products.json");
  if (vigor.length) await client.db("vigor").collection("products").insertMany(vigor);
  await client.close();

  legacy = spawn("node", ["src/app.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(LEGACY_PORT), MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB",
      VIGOR_MONGODB_URI: uri, AUTH_SECRET: SECRET, BITRIX_WEBHOOK_BASE: bx.base("legacy"), SMTP_HOST: "127.0.0.1",
      ...MAIL, IMAP_PORT: "9", NODE_TLS_REJECT_UNAUTHORIZED: "0", PATH: PATH_WITH_FAKE_SOFFICE,
      OC_TEST_FETCH_REWRITE: JSON.stringify({
        "https://photon.komoot.io": bx.extBase("legacy", "photon"), "https://nominatim.openstreetmap.org": bx.extBase("legacy", "nominatim"),
        "https://api.openrouteservice.org": bx.extBase("legacy", "ors"), "https://router.project-osrm.org": bx.extBase("legacy", "osrm"),
      }),
      OC_TEST_SMTP_PORT: String(smtp.port), OB24_BASE_URL: bx.ob24Base("legacy"), ...OB24, NODE_OPTIONS: `--import=${new URL("./helpers/legacy-smtp-port-shim.mjs", import.meta.url).href}`,
      SMTP_PORT: "9", PLANNING_API_BASE_URL: bx.planningBase("legacy"), EXTERNAL_API_BASE: bx.extBase("legacy", "magic"), ...MAGIC, ORS_API_KEY: "ors-test-key",
    },
    stdio: "ignore",
  });
  // never leave the legacy server running if this worker dies
  process.once("exit", () => { try { legacy.kill("SIGKILL"); } catch { /* already gone */ } });
  await waitFor(`http://127.0.0.1:${LEGACY_PORT}/api/health`);

  const cfg = loadConfig({
    NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET,
    BITRIX_WEBHOOK_BASE: bx.base("v2"), BITRIX_MIN_GAP_MS: "0", PLANNING_API_BASE_URL: bx.planningBase("v2"), OFFER_LINK_BASE: "http://oc.test", // throttle itself: unit test (bitrix.test.ts)
    OB24_BASE_URL: bx.ob24Base("v2"), ...OB24, ORS_API_KEY: "ors-test-key", EXTERNAL_API_BASE: bx.extBase("v2", "magic"), ...MAGIC,
    GEO_PHOTON_URL: bx.extBase("v2", "photon"), GEO_NOMINATIM_URL: bx.extBase("v2", "nominatim"), GEO_ORS_URL: bx.extBase("v2", "ors"), ROUTE_OSRM_URL: bx.extBase("v2", "osrm"),
    SMTP_HOST: "127.0.0.1", SMTP_SEND_PORT: String(smtp.port), IMAP_HOST: "127.0.0.1", IMAP_PORT: "9", ...MAIL,
  });
  await connectDb(cfg, { info: () => {} });

  // Bridges for the parts of the email flow that belong to later phases (PDF = phase 5,
  // signing = 4g): v2 calls the LEGACY implementations in-process, so this test compares the
  // email flow only. SAFETY: env first (legacy modules read endpoints at import time).
  Object.assign(process.env, {
    BITRIX_WEBHOOK_BASE: bx.base("v2"), MONGODB_URI: uri, VIGOR_MONGODB_URI: uri, PATH: PATH_WITH_FAKE_SOFFICE, ...MAIL,
  });
  if (!process.env.BITRIX_WEBHOOK_BASE!.startsWith("http://127.0.0.1:")) throw new Error("unsafe Bitrix base for in-process legacy import");
  // legacy resolves templates/assets from process.cwd() → run the worker from the repo root
  ORIGINAL_CWD = process.cwd();
  process.chdir(ROOT);
  const { default: rootMongoose } = await import(ROOT + "node_modules/mongoose/index.js");
  await rootMongoose.connect(uri, { dbName: "KonfiguratorDB" });
  const { default: legacyCfg } = await import(ROOT + "src/services/configService.js");
  legacyCfg._cache = new Map(Object.entries(fx("pricing/config.json")));
  const docx = await import(ROOT + "src/routes/docx-template.js");
  const signing = await import(ROOT + "src/routes/signing.js");
  documentsBridge = {
    renderOfferPdf: (p) => docx.generateOfferPdfBuffer(p),
    convertDocxToPdf: (b) => docx.convertDocxToPdf(b),
    getOfferRenderData: (p) => docx.getOfferRenderData(p),
    productImagePdf: async () => null,
  };
  signingBridge = { createRequest: (a) => signing.createSigningRequest(a) };

  v2 = await buildApp(cfg, {
    register: (a) => registerApi(a, { cfg, documents: documentsBridge, signing: signingBridge, mailTls: { rejectUnauthorized: false } }),
  });

  // log in on the LEGACY app; the same token is used against v2
  const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(USER),
  });
  token = (await r.json()).token;
}, 180000);

afterAll(async () => {
  legacy?.kill("SIGKILL");
  await v2?.close();
  await disconnectDb();
  await mongod?.stop();
  await bx.stop();
  await smtp.stop();
  rmSync(FAKE_SOFFICE_DIR, { recursive: true, force: true });
  if (ORIGINAL_CWD) process.chdir(ORIGINAL_CWD);
  try { const { default: m } = await import(ROOT + "node_modules/mongoose/index.js"); await m.disconnect(); } catch { /* not connected */ }
});

async function both(method: "GET" | "POST", url: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const l = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const lBody = await l.json().catch(() => null);
  const n = await v2.inject({ method, url, headers, payload: body as any });
  return { legacy: { status: l.status, body: lBody }, v2: { status: n.statusCode, body: n.json() } };
}

const GETS = [
  "/api/products", "/api/products?q=SLA", "/api/products?q=wanne", "/api/products?prefix=V3", "/api/products?prefix=dw",
  "/api/products?source=badolux", "/api/products?source=BADOLUX&limit=3", "/api/products?limit=5", "/api/products?limit=9999",
  "/api/products/sla", "/api/products/V3WVK09", "/api/services", "/api/services?q=mont", "/api/services?q=BU",
];

describe("contract: legacy vs v2 (same DB, same requests)", () => {
  it("v2 accepts the session token issued by the LEGACY login", async () => {
    expect(token).toMatch(/\./);
    const me = await both("GET", "/api/auth/me");
    expect(me.v2.status).toBe(200);
    expect(me.v2.body).toEqual(me.legacy.body);
  });

  it.each(GETS)("GET %s", async (url) => {
    const r = await both("GET", url);
    expect(r.v2.status).toBe(r.legacy.status);
    expect(r.v2.body).toEqual(r.legacy.body);
  });

  it("GET unknown product/service → 404 with the same message", async () => {
    for (const url of ["/api/products/NOPE-123", "/api/services/NOPE-123"]) {
      const r = await both("GET", url);
      expect(r.legacy.status).toBe(404);
      expect(r.v2.status).toBe(404);
      expect(r.v2.body.error.message).toBe(r.legacy.body.error);
    }
  });

  it("GET /api/services/:id (first real id)", async () => {
    const id = fx("catalog/services.json")[0].serviceId;
    const r = await both("GET", `/api/services/${encodeURIComponent(id)}`);
    expect(r.v2.status).toBe(200);
    expect(r.v2.body).toEqual(r.legacy.body);
  });

  it("GET /api/price/inputs — identical except build id", async () => {
    const r = await both("GET", "/api/price/inputs");
    expect(r.v2.status).toBe(200);
    expect({ ...r.v2.body, buildId: "x" }).toEqual({ ...r.legacy.body, buildId: "x" });
  });

  it("POST /api/price — identical for 40 real (anonymised) payloads", async () => {
    const cases = fx("pricing/cases.json").filter((_: unknown, i: number) => i % 3 === 0).slice(0, 40);
    for (const c of cases) {
      const r = await both("POST", "/api/price", c.payload);
      expect(r.v2.status, c.id).toBe(200);
      expect(r.v2.body, c.id).toEqual(r.legacy.body);
    }
  }, 120000);

  it("login errors: same status + message", async () => {
    for (const body of [{ email: USER.email, password: "wrong" }, { email: "", password: "" }]) {
      const l = await fetch(`http://127.0.0.1:${LEGACY_PORT}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const n = await v2.inject({ method: "POST", url: "/api/auth/login", payload: body });
      expect(n.statusCode).toBe(l.status);
      expect(n.json().error.message).toBe((await l.json()).error);
    }
  });
});

describe("v2 security by design (intentional differences to legacy)", () => {
  it("no token → 401 on every private route (also with odd casing / suffixes)", async () => {
    for (const url of ["/api/products", "/API/PRODUCTS", "/api/products/x.pdf", "/api/price/inputs", "/api/services/"]) {
      const r = await v2.inject({ url });
      expect([401, 404], url).toContain(r.statusCode);
      if (r.statusCode === 404) expect(r.json().error.code).toBe("NOT_FOUND");
    }
  });

  it("search input is escaped (legacy: raw RegExp → ReDoS / regex injection)", async () => {
    const r = await v2.inject({ url: "/api/products?q=" + encodeURIComponent("(a+)+$"), headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
    const s = await v2.inject({ url: "/api/products?q=" + encodeURIComponent("SLA.*"), headers: { authorization: `Bearer ${token}` } });
    expect(s.json()).toEqual([]); // literal "SLA.*", not a pattern
  });
});

describe("contract: offers + drafts (read)", () => {
  const offers = () => EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
  const drafts = () => EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/drafts.json", "utf8")) as any[];

  it.each([
    "/api/offers/search-all?q=Kunde0001", "/api/offers/search-all?q=kunde00", "/api/offers/search-all?q=Ort1&limit=5",
    "/api/offers/search-all?q=ANG2026", "/api/offers/search-all?q=", "/api/offers/search-all?q=Vorname0003%20Kunde0003",
    "/api/offers", "/api/offers?limit=5", "/api/offers?offerType=bwt", "/api/offers?q=Kunde0002", "/api/offers?q=ANG",
    "/api/drafts/search?offerType=bu", "/api/drafts/search?offerType=bu&q=Kunde", "/api/drafts/search?offerType=bwt&q=ANG",
  ])("GET %s", async (url) => {
    const r = await both("GET", url);
    expect(r.v2.status).toBe(r.legacy.status);
    expect(r.v2.body).toEqual(r.legacy.body);
  });

  it("GET /api/offers/:offerNumber — 10 real offers + 404", async () => {
    for (const o of offers().slice(0, 10)) {
      const r = await both("GET", `/api/offers/${encodeURIComponent(o.offerNumber)}`);
      expect(r.v2.status, o.offerNumber).toBe(200);
      expect(r.v2.body, o.offerNumber).toEqual(r.legacy.body);
    }
    const nf = await both("GET", "/api/offers/ANG-NOPE");
    expect(nf.v2.status).toBe(404);
    expect(nf.v2.body.error.message).toBe(nf.legacy.body.error);
  });

  it("GET /api/drafts/:id — 10 real drafts + 404", async () => {
    for (const d of drafts().slice(0, 10)) {
      const r = await both("GET", `/api/drafts/${d._id}`);
      expect(r.v2.status).toBe(200);
      expect(r.v2.body).toEqual(r.legacy.body);
    }
    const nf = await both("GET", "/api/drafts/0123456789abcdef01234567");
    expect(nf.v2.status).toBe(404);
    expect(nf.v2.body.error.message).toBe(nf.legacy.body.error);
  });

  it("GET /api/offers/by-deal/:dealId — every deal id present in the fixtures", async () => {
    const ids = new Set<string>();
    for (const d of [...offers(), ...drafts()]) {
      for (const v of [d.dealId, d.payload?.auftragId, d.payload?.dealId, d.payload?.Kundendaten?.dealId]) if (v && String(v) !== "0") ids.add(String(v));
    }
    expect(ids.size).toBeGreaterThan(0);
    for (const id of [...ids].slice(0, 15)) {
      const r = await both("GET", `/api/offers/by-deal/${encodeURIComponent(id)}`);
      expect(r.v2.body, id).toEqual(r.legacy.body);
    }
  });

  it("drafts/search without offerType → 400 same message", async () => {
    const r = await both("GET", "/api/drafts/search");
    expect(r.v2.status).toBe(400);
    expect(r.v2.body.error.message).toBe(r.legacy.body.error);
  });
});

// ---------------------------------------------------------------------------------------
// Writes: both apps get IDENTICAL payloads (different numbers/names so they don't collide in
// the shared DB). Responses and the stored documents must match after normalising ids,
// timestamps and the per-app number/name.
const VOLATILE = new Set(["_id", "id", "__v", "createdAt", "updatedAt", "savedAt"]);
function norm(v: any, swap: [string, string][]): any {
  if (Array.isArray(v)) return v.map((x) => norm(x, swap));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, norm(x, swap)]));
  }
  if (typeof v === "string") { let s = v; for (const [a, b] of swap) s = s.split(a).join(b); return s; }
  return v;
}
async function post(app: "legacy" | "v2", url: string, body: unknown) {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (app === "legacy") {
    const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  }
  const r = await v2.inject({ method: "POST", url, headers, payload: body as any });
  return { status: r.statusCode, body: r.json() };
}
const rawDb = () => mongoose.connection.db!;

describe("contract: offers + drafts (write)", () => {
  const payloads = () => fx("pricing/cases.json").filter((_: unknown, i: number) => i % 7 === 0).slice(0, 12);

  it("POST /api/offers — same response + same stored document (12 real payloads)", async () => {
    let i = 0;
    for (const c of payloads()) {
      const nL = `ANG-CT-L-${i}`, nV = `ANG-CT-V-${i}`; i++;
      const l = await post("legacy", "/api/offers", { offerNumber: nL, offerType: c.offerType, payload: structuredClone(c.payload), status: "sent" });
      const v = await post("v2", "/api/offers", { offerNumber: nV, offerType: c.offerType, payload: structuredClone(c.payload), status: "sent" });
      expect(v.status, c.id).toBe(l.status);
      expect(norm(v.body, [[nV, "N"]]), c.id).toEqual(norm(l.body, [[nL, "N"]]));
      const [dl, dv] = await Promise.all([rawDb().collection("offers").findOne({ offerNumber: nL }), rawDb().collection("offers").findOne({ offerNumber: nV })]);
      expect(norm(JSON.parse(JSON.stringify(dv)), [[nV, "N"]]), c.id).toEqual(norm(JSON.parse(JSON.stringify(dl)), [[nL, "N"]]));
    }
  }, 120000);

  it("POST /api/offers — validation errors identical", async () => {
    for (const body of [{}, { offerNumber: "X" }]) {
      const [l, v] = [await post("legacy", "/api/offers", body), await post("v2", "/api/offers", body)];
      expect(v.status).toBe(l.status);
      expect(v.body.error.message).toBe(l.body.error);
    }
  });

  it("POST /api/offers/:n/recompute — locked offer → 409, unknown → 404 (same messages)", async () => {
    for (const url of ["/api/offers/ANG-CT-L-0/recompute", "/api/offers/ANG-NOPE/recompute"]) {
      const [l, v] = [await post("legacy", url, {}), await post("v2", url, {})];
      expect(v.status).toBe(l.status);
      expect(v.body.error.message).toBe(l.body.error);
    }
  });

  it("POST /api/drafts — same response + stored document; replay/duplicate rules identical", async () => {
    let i = 0;
    for (const c of payloads()) {
      const nL = `CT-L-${i}`, nV = `CT-V-${i}`; i++;
      const body = (n: string) => ({ name: n, offerType: c.offerType, payload: structuredClone(c.payload), clientSaveId: `cs-${n}` });
      const l = await post("legacy", "/api/drafts", body(nL));
      const v = await post("v2", "/api/drafts", body(nV));
      expect(v.status, c.id).toBe(l.status);
      const swapL: [string, string][] = [[nL, "N"]], swapV: [string, string][] = [[nV, "N"]];
      // a sent offer number is replaced by a fresh, time-based one in both apps → normalise it
      if (l.body.offerNumber && l.body.offerNumber !== c.payload.offerNumber) swapL.push([l.body.offerNumber, "FRESH"]);
      if (v.body.offerNumber && v.body.offerNumber !== c.payload.offerNumber) swapV.push([v.body.offerNumber, "FRESH"]);
      expect(norm(v.body, swapV), c.id).toEqual(norm(l.body, swapL));
      const [dl, dv] = await Promise.all([rawDb().collection("drafts").findOne({ name: nL }), rawDb().collection("drafts").findOne({ name: nV })]);
      expect(norm(JSON.parse(JSON.stringify(dv)), swapV), c.id).toEqual(norm(JSON.parse(JSON.stringify(dl)), swapL));
      // replay with the same clientSaveId → 200; another save under the same name → 409
      const [rl, rv] = [await post("legacy", "/api/drafts", body(nL)), await post("v2", "/api/drafts", body(nV))];
      expect(rv.status).toBe(rl.status);
      const dup = (n: string) => ({ ...body(n), clientSaveId: "other" });
      const [xl, xv] = [await post("legacy", "/api/drafts", dup(nL)), await post("v2", "/api/drafts", dup(nV))];
      expect(xv.status).toBe(xl.status);
      expect(xv.body.error.message).toBe(xl.body.error);
    }
  }, 180000);

  it("POST /api/drafts/recompute — same pricing for the drafts just saved", async () => {
    const a = await rawDb().collection("drafts").find({ name: { $regex: "^CT-(L|V)-" }, offerNumber: { $exists: true, $ne: null } }).toArray();
    const pairs = a.filter((d) => d.name.startsWith("CT-L-")).map((d) => [d, a.find((x) => x.name === d.name.replace("CT-L-", "CT-V-"))]).filter(([, x]) => x);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [dl, dv] of pairs) {
      const l = await post("legacy", "/api/drafts/recompute", { offerNumber: dl!.offerNumber });
      const v = await post("v2", "/api/drafts/recompute", { offerNumber: dv!.offerNumber });
      expect(v.status).toBe(l.status);
      expect(norm(v.body.pricing, [])).toEqual(norm(l.body.pricing, []));
    }
  }, 120000);
});

// ---------------------------------------------------------------------------------------
describe("contract: customers, users, admin (group 3)", () => {
  const userToken = async (app: "legacy" | "v2", email: string, password: string) => {
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      return (await r.json()).token as string;
    }
    return (await v2.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } })).json().token as string;
  };
  const call = async (app: "legacy" | "v2", method: string, url: string, body?: unknown, tok = token) => {
    const headers: Record<string, string> = { authorization: `Bearer ${tok}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }
    const r = await v2.inject({ method: method as any, url, headers, payload: body as any });
    return { status: r.statusCode, body: r.json() };
  };

  it("POST /api/customers + search + :id — identical (both apps create the same customers)", async () => {
    const people = [
      { customerNumber: "C-0101", firstName: "Vorname0101", lastName: "Kunde0101", city: "Ort9", email: "K0101@Example.invalid", payer: "Kassenkunde", cp_name: "ANON" },
      { kundendaten: { bitrixContactId: "B-0102", firstName: "Vorname0102", lastName: "Kunde0102", company: "", phone: "0000" }, offerType: "bwt" },
      { customerNumber: "C-9001", firstName: "Vorname0103", lastName: "Kunde0103" },
    ];
    for (const [i, p] of people.entries()) {
      const tag = (app: string, o: any) => JSON.parse(JSON.stringify(o).replace(/0(10\d)/g, app === "legacy" ? "L$1" : "V$1").replace("C-9001", app === "legacy" ? "C-L9001" : "C-V9001"));
      const l = await call("legacy", "POST", "/api/customers", tag("legacy", p));
      const v = await call("v2", "POST", "/api/customers", tag("v2", p));
      expect(v.status, `customer ${i}`).toBe(l.status);
      const swap: [string, string][] = [];
      expect(norm(v.body, [["V10", "X10"], ["v10", "x10"], ["C-V9001", "C-X9001"]]), `customer ${i}`).toEqual(norm(l.body, [["L10", "X10"], ["l10", "x10"], ["C-L9001", "C-X9001"]]));
      void swap;
    }
    for (const q of ["KundeL101", "VornameL102 KundeL102", "ort9", "C-L9001", ""]) {
      const qv = q.replaceAll("L1", "V1").replaceAll("C-L", "C-V");
      const l = await call("legacy", "GET", `/api/customers/search?q=${encodeURIComponent(q)}`);
      const v = await call("v2", "GET", `/api/customers/search?q=${encodeURIComponent(qv)}`);
      if (qv === q) { expect(v.body, q).toEqual(l.body); continue; } // untagged query: both apps see the same docs
      expect(norm(v.body, [["V10", "X10"], ["v10", "x10"], ["C-V9001", "C-X9001"]]), q).toEqual(norm(l.body, [["L10", "X10"], ["l10", "x10"], ["C-L9001", "C-X9001"]]));
    }
    const anyCust = (await call("legacy", "GET", "/api/customers/search?q=KundeL101")).body.items[0];
    const byId = await both("GET", `/api/customers/${anyCust._id}`);
    expect(byId.v2.body).toEqual(byId.legacy.body);
    const nf = await both("GET", "/api/customers/0123456789abcdef01234567");
    expect(nf.v2.status).toBe(404);
    expect(nf.v2.body.error.message).toBe(nf.legacy.body.error);
    const bad = await both("POST", "/api/customers", { city: "x" });
    expect(bad.v2.status).toBe(400);
    expect(bad.v2.body.error.message).toBe(bad.legacy.body.error);
  });

  it("B-1: legacy fails on the 2nd customer without number; v2 (fixed, ADR 016) saves them all", async () => {
    const l1 = await call("legacy", "POST", "/api/customers", { firstName: "OhneNr", lastName: "Eins" });
    const l2 = await call("legacy", "POST", "/api/customers", { firstName: "OhneNr", lastName: "Zwei" });
    expect(l1.status).toBe(200);
    expect(l2.status).toBe(500); // legacy bug, unchanged on main
    for (const last of ["Drei", "Vier", "Fünf"]) {
      const v = await call("v2", "POST", "/api/customers", { firstName: "OhneNr", lastName: last });
      expect(v.status, last).toBe(200);
      expect(v.body.customer).not.toHaveProperty("customerNumber");
    }
    // saving the same person again updates instead of duplicating
    const again = await call("v2", "POST", "/api/customers", { firstName: "OhneNr", lastName: "Drei", city: "Ort5" });
    expect(again.body.customer.city).toBe("Ort5");
    const count = await rawDb().collection("Kundendaten").countDocuments({ firstName: "OhneNr", lastName: "Drei" });
    expect(count).toBe(1);
  });

  it("GET /api/users — identical (only active users with signature)", async () => {
    const r = await both("GET", "/api/users");
    expect(r.v2.body).toEqual(r.legacy.body);
    expect(r.v2.body.map((u: any) => u.email)).toEqual(["ap@test.local"]);
  });

  it("admin read endpoints — identical", async () => {
    for (const url of ["/admin/api/config", "/admin/api/users", "/admin/api/bitrix-logs", "/admin/api/user-action-logs?event=server_started", "/admin/api/users/ap@test.local/signature"]) {
      const r = await both("GET", url);
      expect(r.v2.status, url).toBe(r.legacy.status);
      expect(r.v2.body, url).toEqual(r.legacy.body);
    }
    const pub = await both("GET", "/admin/api/config/public");
    expect(pub.v2.body).toEqual(pub.legacy.body);
  });

  it("admin writes — same effect (config set/reset, user upsert, signature)", async () => {
    const put = { TAX_RATE: "0.19", NOT_A_KEY: 1, BU_SHOW_DA_HASSMANN: 1 };
    const [lp, vp] = [await call("legacy", "PUT", "/admin/api/config", put), await call("v2", "PUT", "/admin/api/config", put)];
    expect(vp.body).toEqual(lp.body);
    const [lr, vr] = [await call("legacy", "POST", "/admin/api/config/reset", { key: "BU_SHOW_DA_HASSMANN" }), await call("v2", "POST", "/admin/api/config/reset", { key: "BU_SHOW_DA_HASSMANN" })];
    expect(vr.body).toEqual(lr.body);
    const unk = await both("POST", "/admin/api/config/reset", { key: "NOPE" });
    expect(unk.v2.status).toBe(404);
    expect(unk.v2.body.error.message).toBe(unk.legacy.body.error);
    for (const [app, email] of [["legacy", "new-l@test.local"], ["v2", "new-v@test.local"]] as const) {
      const r = await call(app, "POST", "/admin/api/users", { email, firstName: "N", lastName: "U", role: "user", password: "pw" });
      expect(r.body).toEqual({ ok: true, email });
      const s = await call(app, "POST", `/admin/api/users/${email}/signature`, { dataUrl: "data:image/png;base64,CCCC" });
      expect(s.body).toEqual({ ok: true, hasSignature: true });
    }
    const list = (await both("GET", "/admin/api/users")).v2.body;
    const nl = list.find((u: any) => u.email === "new-l@test.local"), nv = list.find((u: any) => u.email === "new-v@test.local");
    expect({ ...nv, email: "x" }).toEqual({ ...nl, email: "x" });
    for (const body of [{ email: "" }, { email: "nopw@test.local" }]) {
      const r = await both("POST", "/admin/api/users", body);
      expect(r.v2.status).toBe(400);
      expect(r.v2.body.error.message).toBe(r.legacy.body.error);
    }
    const badImg = await both("POST", "/admin/api/users/ap@test.local/signature", { dataUrl: "data:text/plain;base64,x" });
    expect(badImg.v2.status).toBe(400);
    expect(badImg.v2.body.error.message).toBe(badImg.legacy.body.error);
  });

  it("non-admin user → 403 on admin routes (same message); admin login rules identical", async () => {
    const lt = await userToken("legacy", "ap@test.local", "ap-pass");
    for (const url of ["/admin/api/config", "/admin/api/users"]) {
      const [l, v] = [await call("legacy", "GET", url, undefined, lt), await call("v2", "GET", url, undefined, lt)];
      expect(v.status, url).toBe(403);
      expect(v.body.error.message).toBe(l.body.error);
    }
    for (const body of [{ email: "ap@test.local", password: "ap-pass" }, { email: USER.email, password: "nope" }, { email: "", password: "" }]) {
      const l = await fetch(`http://127.0.0.1:${LEGACY_PORT}/admin/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const v = await v2.inject({ method: "POST", url: "/admin/api/login", payload: body });
      expect(v.statusCode).toBe(l.status);
      expect(v.json().error.message).toBe((await l.json()).error);
    }
    const ok = await v2.inject({ method: "POST", url: "/admin/api/login", payload: USER });
    expect(ok.json().user).toEqual({ email: USER.email, name: "Contract", role: "admin" });
  });

  it("security by design: config/public needs a login in v2 (legacy: open)", async () => {
    expect((await v2.inject({ url: "/admin/api/config/public" })).statusCode).toBe(401);
  });
});

// ---------------- group 4: Bitrix (outbound calls go to a recording stub) ----------------
const same = async (method: "GET" | "POST", url: string, body?: unknown) => {
    bx.take("legacy"); bx.take("v2");
    const r = await both(method, url, body);
    const calls = { legacy: bx.take("legacy"), v2: bx.take("v2") };
    expect(r.v2.status, url).toBe(r.legacy.status);
    if (r.legacy.status >= 400) expect(r.v2.body.error.message, url).toBe(r.legacy.body.error);
    else expect(r.v2.body, url).toEqual(r.legacy.body);
    expect(calls.v2, url).toEqual(calls.legacy);
    return { ...r, calls: calls.v2 };
};

describe("contract: Bitrix read routes — same response AND same outgoing Bitrix calls", () => {

  it.each([
    "/api/bitrix/contact/101",          // address on the contact
    "/api/bitrix/contact/102",          // address from requisite → __addressSource
    "/api/bitrix/contact/103",          // no address anywhere
    "/api/bitrix/contact/404",          // empty result → 404
    "/api/bitrix/contact/101/deals",
    "/api/bitrix/deal/9001",            // contact via requisite, Vermieter enum + file
    "/api/bitrix/deal/9002",            // no contact, Vermieter from "Wohnsituation:" text
    "/api/bitrix/deal/9003",            // → 404
  ])("GET %s", async (url) => {
    const r = await same("GET", url);
    expect(r.calls.length).toBeGreaterThan(0);
  }, 30000);

  it("deal 9001: contact address patched from requisite, Vermieter liegt vor via file", async () => {
    const r = await same("GET", "/api/bitrix/deal/9001");
    expect(r.v2.body.contact.ADDRESS_CITY).toBe("Ort2");
    expect(r.v2.body.vermieter).toEqual({ erforderlich: true, liegtVor: true });
    expect(r.calls.map((c) => c.method)).toEqual(["crm.deal.get", "crm.contact.get", "crm.requisite.list", "crm.address.list"]);
  }, 30000);

  it("rate limit ('Too many requests') is retried, not failed", async () => {
    const r = await same("GET", "/api/bitrix/deal/9004");
    expect(r.v2.status).toBe(200);
    expect(r.calls.filter((c) => c.method === "crm.deal.get")).toHaveLength(2);
  }, 30000);

  it("Bitrix error → 500 with Bitrix message, and a bitrixlogs entry with the same shape", async () => {
    const coll = mongoose.connection.db!.collection("bitrixlogs");
    await coll.deleteMany({ method: "crm.deal.get", message: "Access denied" });
    await same("GET", "/api/bitrix/deal/9005");
    await new Promise((r) => setTimeout(r, 300)); // both apps log fire-and-forget
    const logs = await coll.find({ method: "crm.deal.get", message: "Access denied" }, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } }).toArray();
    expect(logs).toHaveLength(2);
    expect(logs[1]).toEqual(logs[0]);
    expect(logs[0]).toMatchObject({ httpMethod: "GET", params: { id: "9005" }, resolved: false });
  }, 30000);

  it("activities/today and calendar/week — identical", async () => {
    await same("GET", "/api/bitrix/activities/today");
    const w = await same("GET", "/api/bitrix/calendar/week");
    expect(w.v2.body.planning.days).toHaveLength(5);
  }, 30000);

  it("log-action / log-dialog-event — same response, same stored audit entry, same validation", async () => {
    const coll = mongoose.connection.db!.collection("useractionlogs");
    for (const [url, body] of [
      ["/api/bitrix/log-action", { event: "configurator_opened", dealId: "D-ctr", offerNumber: "N-1", offerType: "bu" }],
      ["/api/bitrix/deal/D-ctr2/log-dialog-event", { event: "move_dialog_dismissed", offerNumber: "N-2" }],
    ] as const) {
      await same("POST", url, body);
    }
    const docs = await coll.find({ dealId: { $in: ["D-ctr", "D-ctr2"] } }, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } }).sort({ dealId: 1 }).toArray();
    expect(docs).toHaveLength(4);
    expect(docs[1]).toEqual(docs[0]);
    expect(docs[3]).toEqual(docs[2]);
    for (const [url, body] of [
      ["/api/bitrix/log-action", { event: "nope" }],
      ["/api/bitrix/deal/1/log-dialog-event", { event: "termin_opened" }],
    ] as const) {
      const r = await same("POST", url, body);
      expect(r.v2.status).toBe(400);
    }
  });
});

const callApp = async (app: "legacy" | "v2", method: string, url: string, body?: unknown) => {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (app === "legacy") {
    const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  const r = await v2.inject({ method: method as any, url, headers, payload: body as any });
  return { status: r.statusCode, body: r.json() };
};

describe("contract: Bitrix WRITE routes — same response AND same outgoing calls (stub, never real Bitrix)", () => {
  const AH = JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8"))
    .find((x: any) => Number(x.payload.Arbeitszeit?.ahTravelZone) > 0 && x.payload.ah.services.length > 1)?.payload
    ?? JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8"))[0].payload;
  const T = 30000;

  it("timeline/comment: validation + comment with attachments", async () => {
    for (const body of [{}, { entityType: "deal" }, { entityType: "deal", entityId: 5 }, { entityType: "deal", entityId: "abc", comment: "x" }]) await same("POST", "/api/bitrix/timeline/comment", body);
    const r = await same("POST", "/api/bitrix/timeline/comment", {
      entityType: "deal", entityId: "9001", comment: "  Hallo  ", attachments: [{ filename: "a.pdf", base64: "QUJD" }, { filename: "", content: "x" }, { filename: "b.txt", content: "WFla" }],
    });
    expect(r.calls.map((c) => c.method)).toEqual(["crm.timeline.comment.add"]);
  }, T);

  it("deal upload: validation, append to multi-file field, read-back, timeline copy", async () => {
    for (const [url, body] of [
      ["/api/bitrix/deal/9010/upload/nope", { filename: "a", base64: "x" }],
      ["/api/bitrix/deal/0/upload/kasse", { filename: "a", base64: "x" }],
      ["/api/bitrix/deal/9010/upload/kasse", { filename: "a" }],
      ["/api/bitrix/deal/9003/upload/vermieter", { filename: "a.pdf", base64: "QUJD" }],
    ] as const) await same("POST", url, body);
    const r = await same("POST", "/api/bitrix/deal/9010/upload/kasse", { filename: "Freigabe.pdf", base64: "data:application/pdf;base64,QUJD" });
    expect(r.v2.body).toEqual({ ok: true, kept: true }); // stub returns 2 entries after; 1 with id before
    expect(r.calls.map((c) => c.method)).toEqual(["crm.deal.get", "crm.item.update", "crm.deal.get", "crm.timeline.comment.add"]);
  }, T);

  it("move-ang-verschickt: BU fields, amount fallback/missing, AH fields (zone once), 404, Bitrix error + audit log", async () => {
    await same("POST", "/api/bitrix/deal/9011/move-ang-verschickt", { opportunity: 5000.5, workDays: 2, offerType: "bu", offerNumber: " ANG-1 ", selfPayAmount: 0, invoiceCopy: "post", materialCodes: "WV-WW" });
    await same("POST", "/api/bitrix/deal/9011/move-ang-verschickt", { offerType: "bwt", invoiceCopy: "nein", finalTotal: "12" }); // amount from deal
    const missing = await same("POST", "/api/bitrix/deal/9010/move-ang-verschickt", { offerType: "bu" });
    expect(missing.v2.status).toBe(400);
    expect(missing.v2.body.missing).toEqual(missing.legacy.body.missing);
    for (const id of ["9012", "9013"]) {
      const r = await same("POST", `/api/bitrix/deal/${id}/move-ang-verschickt`, { offerType: "ah", payload: JSON.stringify(AH), opportunity: 99, invoiceCopy: "email" });
      expect(r.calls.at(-1)!.params.includes("UF_CRM_1711019971"), id).toBe(id === "9012");
    }
    await same("POST", "/api/bitrix/deal/9012/move-ang-verschickt", { offerType: "ah", payload: "{kaputt" });
    await same("POST", "/api/bitrix/deal/9003/move-ang-verschickt", { opportunity: 1 });
    const coll = mongoose.connection.db!.collection("useractionlogs");
    await coll.deleteMany({ dealId: "9005" });
    await same("POST", "/api/bitrix/deal/9005/move-ang-verschickt", { opportunity: 1, offerNumber: "N-9", offerType: "bu" });
    await new Promise((r) => setTimeout(r, 300));
    const logs = await coll.find({ dealId: "9005" }, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } }).toArray();
    expect(logs).toHaveLength(2);
    expect(logs[1]).toEqual(logs[0]);
    expect(logs[0]).toMatchObject({ event: "move_failed", message: "Access denied" });
  }, 60000);

  it("move-zuteilen / move-besichtigung (stage, comment, planner notified with the user's name)", async () => {
    await same("POST", "/api/bitrix/deal/9001/move-zuteilen", {});
    await same("POST", "/api/bitrix/deal/abc/move-zuteilen", {});
    await same("POST", "/api/bitrix/deal/9001/move-besichtigung", {});
    const r = await same("POST", "/api/bitrix/deal/9001/move-besichtigung", { comment: "Nicht erreicht", reason: "" });
    expect(r.v2.body).toMatchObject({ ok: true, commentFailed: false, plannerSynced: true });
    expect(r.calls.at(-1)).toEqual({ http: "POST", method: "plan:/api/planning/termin-not-held", params: JSON.stringify({ dealId: "9001", reason: "Nicht erreicht", by: "Contract" }) });
  }, T);

  it("admin retry of a logged Bitrix failure: success marks resolved; failure keeps it open", async () => {
    const coll = mongoose.connection.db!.collection("bitrixlogs");
    const ids: Record<string, { ok: string; bad: string }> = {};
    for (const app of ["legacy", "v2"]) {
      const ok = await coll.insertOne({ method: "crm.deal.get", message: "x", params: { id: "9001" }, httpMethod: "GET", resolved: false, resolvedAt: null });
      const bad = await coll.insertOne({ method: "crm.deal.get", message: "x", params: { id: "9005" }, httpMethod: "GET", resolved: false, resolvedAt: null });
      ids[app] = { ok: String(ok.insertedId), bad: String(bad.insertedId) };
    }
    const [lo, vo] = [await callApp("legacy", "POST", `/admin/api/bitrix-logs/${ids.legacy!.ok}/retry`), await callApp("v2", "POST", `/admin/api/bitrix-logs/${ids.v2!.ok}/retry`)];
    expect(vo).toEqual(lo);
    const [lb, vb] = [await callApp("legacy", "POST", `/admin/api/bitrix-logs/${ids.legacy!.bad}/retry`), await callApp("v2", "POST", `/admin/api/bitrix-logs/${ids.v2!.bad}/retry`)];
    expect(vb.status).toBe(lb.status);
    expect(vb.body.error.message).toBe(lb.body.error);
    for (const app of ["legacy", "v2"]) {
      expect((await coll.findOne({ _id: new mongoose.Types.ObjectId(ids[app]!.ok) }))!.resolved).toBe(true);
      expect((await coll.findOne({ _id: new mongoose.Types.ObjectId(ids[app]!.bad) }))!.resolved).toBe(false);
    }
    const missing = await same("POST", "/admin/api/bitrix-logs/000000000000000000000000/retry");
    expect(missing.v2.status).toBe(500);
  }, T);
});

// ---------------- group 4c: offer email (local SMTP sink + recording Bitrix stub) ----------------
describe("contract: send-offer — same mail, same Bitrix calls, same logs (no real email leaves)", () => {
  const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
  const BU = offers.find((o) => o.offerType === "bu").payload;
  const AH = JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8"))
    .find((x: any) => x.payload.Kundendaten?.payer === "Selbstzahler")?.payload
    ?? JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8"))[0].payload;
  const db = () => mongoose.connection.db!;
  const SIGN = /\/sign\/[0-9a-f]{48}/g;
  const norm = (s: string) => s.replace(SIGN, "/sign/<TOKEN>").replace(/Datum\/Zeit: [^\n]*/g, "Datum/Zeit: <NOW>");
  const normCalls = (calls: { http: string; method: string; params: string }[]) =>
    calls.map((c) => ({ ...c, params: norm(decodeURIComponent(c.params.replace(/\+/g, " "))) }));

  type Field = string | { filename: string; content: Buffer | string };
  const multipart = async (fields: Record<string, Field | Field[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) {
      if (typeof item === "string") fd.append(k, item);
      else fd.append(k, new Blob([item.content]), item.filename);
    }
    const r = new Request("http://x/", { method: "POST", body: fd });
    return { body: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type")! };
  };
  const sendTo = async (app: "legacy" | "v2", fields: Record<string, Field | Field[]>) => {
    const { body, contentType } = await multipart(fields);
    const headers = { authorization: `Bearer ${token}`, "content-type": contentType };
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}/api/email/send-offer`, { method: "POST", headers, body });
      return { status: r.status, body: await r.json() };
    }
    const r = await v2.inject({ method: "POST", url: "/api/email/send-offer", headers, payload: body });
    return { status: r.statusCode, body: r.json() };
  };
  // signing requests too: an unchanged offer reuses the open request (no new link note) — legacy rule
  const clean = async () => { await db().collection("emailsends").deleteMany({}); await db().collection("signingrequests").deleteMany({}); };
  /** legacy first, then v2 (locks cleared in between); returns everything that left each app */
  const sendBoth = async (fields: Record<string, Field | Field[]>, { clearLock = true } = {}) => {
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      if (clearLock) await clean();
      bx.take(app); smtp.take();
      const res = await sendTo(app, fields);
      await new Promise((r) => setTimeout(r, 300)); // fire-and-forget logs
      out[app] = { res, mails: smtp.take(), calls: normCalls(bx.take(app)) };
    }
    return out as Record<"legacy" | "v2", { res: { status: number; body: any }; mails: any[]; calls: any[] }>;
  };
  const expectSameResult = (o: Awaited<ReturnType<typeof sendBoth>>) => {
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 400)).toBe(o.legacy.res.status);
    if (o.legacy.res.status >= 400) {
      expect(o.v2.res.body.error.message).toBe(o.legacy.res.body.error);
      for (const k of ["detail", "lastOfferNumber"]) if (k in o.legacy.res.body) expect(o.v2.res.body[k], k).toEqual(o.legacy.res.body[k]);
      if (o.legacy.res.body.code) expect(o.v2.res.body.error.code).toBe(o.legacy.res.body.code);
    } else {
      const strip = (b: any) => ({ ...b, messageId: b.messageId ? "<ID>" : b.messageId });
      expect(strip(o.v2.res.body)).toEqual(strip(o.legacy.res.body));
    }
    expect(o.v2.mails.map((m) => mailView(m, norm))).toEqual(o.legacy.mails.map((m) => mailView(m, norm)));
    const firstDiff = () => {
      const l = o.legacy.calls, v = o.v2.calls;
      if (l.length !== v.length) return `count legacy=${l.length} [${l.map((c) => c.method)}] v2=${v.length} [${v.map((c) => c.method)}]`;
      for (let i = 0; i < l.length; i++) {
        const a = JSON.stringify(l[i]), b = JSON.stringify(v[i]);
        if (a !== b) { let k = 0; while (a[k] === b[k]) k++; return `call ${i} @${k}: legacy …${a.slice(k - 60, k + 80)}… v2 …${b.slice(k - 60, k + 80)}…`; }
      }
      return "";
    };
    expect(firstDiff()).toBe("");
  };
  const logs = async (coll: string, filter: Record<string, unknown>) =>
    (await db().collection(coll).find(filter, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } }).sort({ _id: 1 }).toArray());

  it("validation: missing 'to', invalid payload JSON, wrong edited-DOCX extension", async () => {
    for (const f of [{ subject: "x" }, { to: "k@test.local", payload: "{kaputt" },
      { to: "k@test.local", payload: "{}", editedDocx: { filename: "a.pdf", content: "x" } }] as Record<string, Field>[]) {
      const o = await sendBoth(f);
      expect(o.v2.res.status).toBe(400);
      expectSameResult(o);
    }
  }, 60000);

  it("full BU send: mail (text, html, presets, upload, inline signature), Bitrix link + timeline + note, EmailLog", async () => {
    await db().collection("emaillogs").deleteMany({});
    const o = await sendBoth({
      to: "kunde0001@example.invalid", cc: "cc@example.invalid", subject: "Ihr Angebot", offerNumber: "ANG-T-1", offerType: "bu",
      body: "Sehr geehrter Herr Kunde0001,\n\nanbei Ihr Angebot.\n\n- Punkt eins\n- Punkt zwei\n\nKeine Möglichkeit, die Dokumente auszudrucken? {{SIGN_LINK}}\n\nwww.emczwei.de",
      payload: JSON.stringify(BU), dealId: "9011", excludePreset: JSON.stringify(["vollmacht"]), internalNote: "nur intern",
      attachments: { filename: "Notiz.txt", content: "Hallo" }, bitrixDocs: { filename: "Kalkulation.pdf", content: "%PDF-kalk" },
    });
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 400)).toBe(200);
    expect(o.v2.mails).toHaveLength(1);
    expectSameResult(o);
    const view = mailView(o.v2.mails[0], norm);
    // offer number from the payload wins over the form field (legacy rule); vollmacht excluded
    expect(view.attachments.map((a) => a.filename).sort()).toEqual([`${BU.offerNumber}.pdf`, "Abtretungserklärung.pdf", "Notiz.txt", "emc2_Barrierefreies_Wohnen.pdf", "signaturepicture.png"].sort());
    expect(view.attachments.find((a) => a.filename === "signaturepicture.png")).toMatchObject({ cid: "emc2-signature-picture" });
    expect(view.text).toContain("/sign/<TOKEN>");
    expect(o.v2.calls.map((c) => c.method)).toEqual(expect.arrayContaining(["crm.deal.update", "crm.timeline.comment.add"]));
    const el = (await logs("emaillogs", {})).map((e) => ({ ...e, body: norm(e.body) }));
    expect(el).toHaveLength(2);
    expect(el[1]).toEqual(el[0]);
    const sends = await logs("emailsends", { dealId: "9011" });
    expect(sends[0]).toMatchObject({ inFlightUntil: null, offerNumber: expect.any(String) });
  }, 90000);

  it("duplicate send for the same deal within 24 h → 409 (same code/message); forceResend sends", async () => {
    const f = { to: "kunde0001@example.invalid", subject: "A", offerNumber: "ANG-T-2", offerType: "bu", payload: JSON.stringify(BU), dealId: "9011", body: "x" };
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      await clean(); smtp.take(); bx.take(app);
      expect((await sendTo(app, f)).status).toBe(200);
      out[app] = { blocked: await sendTo(app, f), forced: await sendTo(app, { ...f, forceResend: "1" }) };
      smtp.take(); bx.take(app);
    }
    expect(out.v2.blocked.status).toBe(409);
    expect(out.v2.blocked.body.error).toMatchObject({ code: out.legacy.blocked.body.code, message: out.legacy.blocked.body.error });
    expect(out.v2.blocked.body.lastOfferNumber).toBe(out.legacy.blocked.body.lastOfferNumber);
    expect(out.v2.forced.status).toBe(out.legacy.forced.status);
  }, 90000);

  it("Bitrix-only mode: no mail, documents archived on the timeline, audit event", async () => {
    await db().collection("useractionlogs").deleteMany({ event: "offer_bitrix_only" });
    const o = await sendBoth({ bitrixOnly: "1", subject: "Nur Bitrix", offerNumber: "ANG-T-3", offerType: "bu", payload: JSON.stringify(BU), dealId: "9011", body: "Link: {{SIGN_LINK}}" });
    expect(o.v2.mails).toHaveLength(0);
    expectSameResult(o);
    const ev = await logs("useractionlogs", { event: "offer_bitrix_only" });
    expect(ev).toHaveLength(2);
    expect(ev[1]).toEqual(ev[0]);
  }, 60000);

  it("AH offer: AH footer, AH preset set (Selbstzahler without Abtretung/Vollmacht), AH totals", async () => {
    const o = await sendBoth({ to: "ah@example.invalid", subject: "Alltagshilfe", offerNumber: "ANG-AH-1", offerType: "ah", payload: JSON.stringify(AH), contactId: "101", body: "Guten Tag" });
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 400)).toBe(200);
    expectSameResult(o);
  }, 60000);

  it("hand-edited DOCX replaces the generated PDF and is archived + flagged on the timeline", async () => {
    const o = await sendBoth({ to: "k@example.invalid", subject: "Bearbeitet", offerNumber: "ANG-T-4", offerType: "bu", payload: JSON.stringify(BU), dealId: "9011", body: "x",
      editedDocx: { filename: "Angebot bearbeitet.docx", content: "PK-fake-docx" } });
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 400)).toBe(200);
    expectSameResult(o);
    const mailNote = o.v2.calls.find((c) => c.method === "crm.timeline.comment.add" && c.params.includes("Email automatisch von OC gesendet"))!;
    expect(mailNote.params).toContain("Handbearbeitete DOCX hochgeladen");
    expect(mailNote.params).toContain(`${BU.offerNumber}.docx`);
  }, 60000);
});

// ---------------- group 4d: letters by post (onlinebrief24 stub + Bitrix stub) ----------------
describe("contract: post/send — same onlinebrief24 request, same Bitrix calls, same lock", () => {
  const db = () => mongoose.connection.db!;
  let A4_PDF = "", LETTER_PDF = "";
  beforeAll(async () => {
    const make = async (w: number, h: number) => {
      const d = await PDFDocument.create();
      d.setCreationDate(new Date("2026-01-01")); d.setModificationDate(new Date("2026-01-01"));
      d.addPage([w, h]).drawText("Angebot Testkunde", { x: 50, y: h - 100 });
      return Buffer.from(await d.save()).toString("base64");
    };
    A4_PDF = await make(595.28, 841.89);
    LETTER_PDF = await make(612, 792);
  });
  const RECIPIENT = { name: "Vorname0001 Kunde0001", street: "Musterweg 1", zipCode: "90475", city: "Ort1" };
  const tsLine = (s: string) => s.replace(/🕒 [^&\n"]*/g, "🕒 <NOW>");
  // Bitrix params are form-encoded (decode for readable diffs); onlinebrief24 bodies are raw JSON
  const view = (calls: { http: string; method: string; params: string }[]) =>
    calls.map((c) => ({ ...c, params: c.method.startsWith("ob24:") ? c.params : tsLine(decodeURIComponent(c.params.replace(/\+/g, " "))) }));
  const both = async (body: Record<string, unknown>, { clear = true } = {}) => {
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      if (clear) await db().collection("postalsends").deleteMany({});
      bx.take(app);
      out[app] = { res: await callApp(app, "POST", "/api/post/send", body), calls: view(bx.take(app)) };
    }
    return out as Record<"legacy" | "v2", { res: { status: number; body: any }; calls: ReturnType<typeof view> }>;
  };
  const expectSame = (o: Awaited<ReturnType<typeof both>>) => {
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 300)).toBe(o.legacy.res.status);
    if (o.legacy.res.status >= 400) {
      expect(o.v2.res.body.error.message).toBe(o.legacy.res.body.error);
      for (const k of ["stage", "details", "code", "lastOfferNumber", "lastPrintjobId"]) if (k in o.legacy.res.body && k !== "code") expect(o.v2.res.body[k], k).toEqual(o.legacy.res.body[k]);
      if (o.legacy.res.body.code) expect(o.v2.res.body.error.code).toBe(o.legacy.res.body.code);
      expect(o.v2.res.body).not.toHaveProperty("debug"); // intended: no request echo (security)
    } else expect(o.v2.res.body).toEqual(o.legacy.res.body);
    expect(o.v2.calls.length, `${o.legacy.calls.map((c) => c.method)} vs ${o.v2.calls.map((c) => c.method)}`).toBe(o.legacy.calls.length);
    o.v2.calls.forEach((c, i) => expect(c, `call ${i} ${c.method}`).toEqual(o.legacy.calls[i]));
  };

  it("validation + early failures: same status, message and stage", async () => {
    for (const body of [
      { recipient: RECIPIENT },
      { recipient: { name: "X" }, document: { base64: "QUJD" } },
      { recipient: RECIPIENT, document: { base64: A4_PDF }, attachments: [{ type: "upload", filename: "x.txt", base64: "QUJD" }] },
      { recipient: RECIPIENT, document: { base64: A4_PDF }, attachments: [{ type: "static", id: "flyer" }] },
      { recipient: RECIPIENT, document: { filename: "kaputt.pdf", base64: "QUJD" } },
    ]) expectSame(await both(body));
  }, 60000);

  it("full send (A4): letter request, lock row, Bitrix offer link + timeline + internal note", async () => {
    const o = await both({
      recipient: RECIPIENT, auftragId: "A-77", document: { filename: "ANG-P-1.pdf", base64: A4_PDF },
      specification: { color: "1" }, dispatchDate: "2026-12-01", registered: "r1", meta: { offerNumber: "ANG-P-1", dealId: "9011" },
      attachments: [{ type: "static", id: "abtretung" }, { type: "upload", filename: "Plan.pdf", base64: A4_PDF }, { type: "upload", filename: "", base64: "x" }],
      bitrixDocs: [{ filename: "Kalkulation.pdf", base64: "QUJD" }, { filename: "ohne-inhalt.pdf" }], docWarnings: ["Kalkulation (Timeout)"], internalNote: "intern", letterKind: "offer",
    });
    expect(o.v2.res.status).toBe(200);
    expectSame(o);
    expect(o.v2.calls.map((c) => c.method)).toEqual(["ob24:/printjobs", "crm.deal.update", "crm.timeline.comment.add", "crm.timeline.comment.add"]);
    const sent = JSON.parse(o.v2.calls[0]!.params);
    expect(sent.auth).toEqual({ apiKey: "ob24-test-key", apiSecret: "ob24-test-secret", mode: "test" });
    expect(sent.letter).toMatchObject({ specification: { color: "1", mode: "duplex", shipping: "national" }, notice: "ANG-P-1 / Auftrag A-77", registered: "r1", dispatch_date: "2026-12-01" });
    const rows = await db().collection("postalsends").find({ dealId: "9011" }).toArray();
    expect(rows[0]).toMatchObject({ offerNumber: "ANG-P-1", printjobId: "555001", inFlightUntil: null });
  }, 60000);

  it("duplicate letter within 24 h → 409 (same code/message/printjob); forceResend sends", async () => {
    const body = { recipient: RECIPIENT, document: { filename: "ANG-P-2.pdf", base64: A4_PDF }, meta: { offerNumber: "ANG-P-2", dealId: "9011" } };
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      await db().collection("postalsends").deleteMany({});
      expect((await callApp(app, "POST", "/api/post/send", body)).status).toBe(200);
      out[app] = { blocked: await callApp(app, "POST", "/api/post/send", body), forced: await callApp(app, "POST", "/api/post/send", { ...body, forceResend: true }) };
      bx.take(app);
    }
    expect(out.v2.blocked.status).toBe(409);
    expect(out.v2.blocked.body.error).toMatchObject({ code: out.legacy.blocked.body.code, message: out.legacy.blocked.body.error });
    for (const k of ["lastOfferNumber", "lastPrintjobId"]) expect(out.v2.blocked.body[k]).toBe(out.legacy.blocked.body[k]);
    expect(out.v2.forced.status).toBe(200);
    expect(out.v2.forced.body).toEqual(out.legacy.forced.body);
  }, 60000);

  it("onlinebrief24 rejects → same status/message/details, lock released (retry possible)", async () => {
    const o = await both({ recipient: RECIPIENT, document: { filename: "x.pdf", base64: A4_PDF }, meta: { offerNumber: "FAIL-1", dealId: "9011" } });
    expect(o.v2.res.status).toBe(422);
    expectSame(o);
    const row = await db().collection("postalsends").findOne({ dealId: "9011" });
    expect(row!.inFlightUntil).toBeNull();
    expect(row!.sentAt).toBeNull();
  }, 60000);

  it("US-Letter PDF is fitted onto A4 in both apps before it goes to onlinebrief24", async () => {
    const o = await both({ recipient: RECIPIENT, document: { filename: "letter.pdf", base64: LETTER_PDF } });
    expect(o.v2.res.status).toBe(200);
    expect(o.v2.res.body).toEqual(o.legacy.res.body);
    const pages = async (call: { params: string }) => {
      const doc = await PDFDocument.load(Buffer.from(JSON.parse(call.params).letter.base64_file, "base64"));
      return doc.getPages().map((p) => { const { width, height } = p.getSize(); return [Math.round(width), Math.round(height)]; });
    };
    expect(await pages(o.v2.calls[0]!)).toEqual([[595, 842]]);
    expect(await pages(o.v2.calls[0]!)).toEqual(await pages(o.legacy.calls[0]!));
  }, 60000);

  it("GET /api/post/config identical; balance sends auth in the GET body (v2; legacy can only do https)", async () => {
    const c = await both({}, { clear: false }).catch(() => null); // warm-up no-op not needed
    void c;
    const [lc, vc] = [await callApp("legacy", "GET", "/api/post/config"), await callApp("v2", "GET", "/api/post/config")];
    expect(vc).toEqual(lc);
    bx.take("v2");
    const bal = await callApp("v2", "GET", "/api/post/balance");
    expect(bal.body).toEqual({ ok: true, balance: 12.34, currency: "EUR" });
    const call = bx.take("v2")[0]!;
    expect(call).toMatchObject({ http: "GET", method: "ob24:/balance" });
    expect(JSON.parse(call.params).auth.mode).toBe("test");
  }, 60000);
});

// ---------------- group 4e: routing, planning proxy, today's customers ----------------
describe("contract: routing / planning / today's customers — same responses, same outgoing requests", () => {
  const run = async (method: "GET" | "POST", url: string, body?: unknown, { sortCalls = false } = {}) => {
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      bx.take(app);
      const res = await callApp(app, method, url, body);
      const calls = bx.take(app).map((c) => ({ ...c, params: decodeURIComponent(c.params.replace(/\+/g, " ")) }));
      out[app] = { res, calls: sortCalls ? calls.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : calls };
    }
    const { legacy: l, v2: v } = out as Record<string, { res: { status: number; body: any }; calls: any[] }>;
    expect(v!.res.status, `${url} ${JSON.stringify(v!.res.body).slice(0, 300)}`).toBe(l!.res.status);
    if (l!.res.status >= 400 && typeof l!.res.body?.error === "string") expect(v!.res.body.error.message, url).toBe(l!.res.body.error);
    else expect(v!.res.body, url).toEqual(l!.res.body);
    expect(v!.calls, url).toEqual(l!.calls);
    return v!;
  };

  it.each([
    ["full address → photon + ORS route", { Kundendaten: { street: "Musterweg 1", postalCode: "95028", city: "Hof", state: "Bayern" } }],
    ["compound city name", { Kundendaten: { street: "Hauptstr. 2", postalCode: "08606", city: "Triebel/Vogtland" } }],
    ["ORS route fails → OSRM fallback", { Kundendaten: { street: "OSRM-Weg 5", postalCode: "95030", city: "Hof" } }],
    ["geocode mismatch on every variant → 500 with all reasons", { Kundendaten: { street: "Falschort 1", postalCode: "95032", city: "Hof" } }],
    ["no address → 400", { Kundendaten: {} }],
    ["bereich/PLZ/Stadt aliases", { bereich: { PLZ: "95028", Stadt: "Hof" } }],
  ])("suggest-distance: %s", async (_name, body) => {
    await run("POST", "/api/routing/suggest-distance", body);
  }, 60000);

  it("suggest-distance: unknown address walks photon → ORS → Nominatim (1.1 s pause) per variant", async () => {
    const v = await run("POST", "/api/routing/suggest-distance", { Kundendaten: { postalCode: "99999", city: "Nirgendwo" } });
    expect(v.res.status).toBe(500);
    expect(v.calls.map((c) => c.method.split("/")[0])).toEqual(expect.arrayContaining(["ext:photon", "ext:ors", "ext:nominatim"]));
  }, 60000);

  it("routing/health identical", async () => { await run("GET", "/api/routing/health"); });

  it("planning: current proxied; stream passes the events through", async () => {
    await run("GET", "/api/planning/current");
    const [l, v] = [
      await fetch(`http://127.0.0.1:${LEGACY_PORT}/api/planning/stream`, { headers: { authorization: `Bearer ${token}` } }),
      await v2.inject({ url: "/api/planning/stream", headers: { authorization: `Bearer ${token}` } }),
    ];
    expect(v.statusCode).toBe(l.status);
    expect(v.headers["content-type"]).toBe(l.headers.get("content-type"));
    expect(v.body).toBe(await l.text());
    bx.take("legacy"); bx.take("v2");
  }, 60000);

  it("today's customers: same merged Kundendaten (contact → import text → requisite fallback), same Bitrix reads", async () => {
    const v = await run("GET", "/api/bitrix/kundendaten", undefined, { sortCalls: true });
    expect(v.res.body).toHaveLength(4);
    await run("GET", "/api/bitrix/kundendaten?stageId=C72:LEER");
    await run("POST", "/api/calendar/today", {});
  }, 60000);
});

describe("contract: Magic API (Hassmann product search) — same responses, same outgoing requests", () => {
  const run = async (method: "GET" | "POST", url: string, body?: unknown) => {
    const out: Record<string, any> = {};
    for (const app of ["legacy", "v2"] as const) {
      bx.take(app);
      const res = await callApp(app, method, url, body);
      out[app] = { res, calls: bx.take(app) };
    }
    const { legacy: l, v2: v } = out as Record<string, { res: { status: number; body: any }; calls: any[] }>;
    expect(v!.res.status, `${url} ${JSON.stringify(v!.res.body).slice(0, 300)}`).toBe(l!.res.status);
    if (l!.res.status >= 400) {
      expect(v!.res.body.error.message, url).toBe(l!.res.body.error);
      expect(v!.res.body.detail, url).toEqual(l!.res.body.detail);
    } else expect(v!.res.body, url).toEqual(l!.res.body);
    expect(v!.calls, url).toEqual(l!.calls);
    return v!;
  };

  it("first call logs in once (same credentials body), then uses the cached token", async () => {
    const v = await run("GET", "/api/magic/health");
    expect(v.calls.map((c) => c.method)).toEqual(["ext:magic/api/auth/login", "ext:magic/api/health"]);
    const again = await run("GET", "/api/magic/health");
    expect(again.calls.map((c) => c.method)).toEqual(["ext:magic/api/health"]);
  });

  it.each([
    ["plain", "/api/magic/products"],
    ["query passed through (repeated keys → a[]=)", "/api/magic/products?brand=a&brand=b&q=Glas%20T%C3%BCr"],
    ["upstream error with body → detail = body", "/api/magic/products?fail=1"],
    ["upstream error without body → detail = error text", "/api/magic/products?fail=empty"],
  ])("products: %s", async (_n, url) => { await run("GET", url); });

  it.each([
    ["corner (array → results)", { kind: "corner", payload: { width: 1200, depth: 900, priceRange: { min: 500, max: 2000 }, orientation: "LEFT", openingTypes: ["GLEITUR"] } }],
    ["niche (results field)", { kind: "niche", payload: { width: 900 } }],
    ["uform (object passed as is)", { kind: "uform", payload: {} }],
    ["walkin upstream 502 → 500 with detail", { kind: "walkin", payload: { width: 1400 } }],
    ["missing kind → 400", { payload: {} }],
    ["kind not a string → 400", { kind: 5, payload: {} }],
    ["unknown kind → 400", { kind: "bathtub", payload: {} }],
    ["missing payload → 400", { kind: "corner" }],
    ["payload not an object → 400", { kind: "corner", payload: "x" }],
  ])("search: %s", async (_n, body) => { await run("POST", "/api/magic/search", body); });
});
