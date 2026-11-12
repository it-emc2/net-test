// API contract test: the LEGACY Express app (spawned as a real process) and the v2 server
// run against the SAME in-memory MongoDB and answer the same requests. Success bodies must be
// identical; errors must match in status code and German message. A session token issued by
// the legacy login must be accepted by v2 (cut-over keeps everybody logged in).
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
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
import { hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerApi } from "../src/compose.js";
import { applyRewrites } from "../src/web/rewrites.js";
import { injectHead } from "../src/web/register.js";
import { BitrixStub } from "./helpers/bitrix-stub.js";
import { BITRIX_HANDLERS } from "./helpers/bitrix-fixtures.js";
import { SmtpSink, mailView } from "./helpers/smtp-sink.js";
// @ts-expect-error plain .mjs test helper
import { fakePdf, normaliseHtml } from "./helpers/fake-pdf.mjs";
// @ts-expect-error plain .mjs harness from the legacy golden suite
import { normaliseDocx } from "../../../../tests/golden/docs-harness.mjs";
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
      SMTP_PORT: "9", EXTERNAL_API_KEY: "ext-test-key", OC_TEST_FAKE_PUPPETEER: "1", SIGNING_OFFICE_EMAIL: "buero@test.local", PLANNING_API_BASE_URL: bx.planningBase("legacy"), EXTERNAL_API_BASE: bx.extBase("legacy", "magic"), ...MAGIC, ORS_API_KEY: "ors-test-key",
    },
    stdio: "ignore",
  });
  // never leave the legacy server running if this worker dies
  process.once("exit", () => { try { legacy.kill("SIGKILL"); } catch { /* already gone */ } });
  await waitFor(`http://127.0.0.1:${LEGACY_PORT}/api/health`);

  const cfg = loadConfig({
    NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET,
    BITRIX_WEBHOOK_BASE: bx.base("v2"), BITRIX_MIN_GAP_MS: "0", PLANNING_API_BASE_URL: bx.planningBase("v2"), OFFER_LINK_BASE: "http://oc.test", // throttle itself: unit test (bitrix.test.ts)
    OB24_BASE_URL: bx.ob24Base("v2"), ...OB24, ORS_API_KEY: "ors-test-key", EXTERNAL_API_BASE: bx.extBase("v2", "magic"), ...MAGIC, EXTERNAL_API_KEY: "ext-test-key",
    GEO_PHOTON_URL: bx.extBase("v2", "photon"), GEO_NOMINATIM_URL: bx.extBase("v2", "nominatim"), GEO_ORS_URL: bx.extBase("v2", "ors"), ROUTE_OSRM_URL: bx.extBase("v2", "osrm"),
    SMTP_HOST: "127.0.0.1", SMTP_SEND_PORT: String(smtp.port), SMTP_PORT: String(smtp.port), SIGNING_OFFICE_EMAIL: "buero@test.local", IMAP_HOST: "127.0.0.1", IMAP_PORT: "9", ...MAIL,
  });
  await connectDb(cfg, { info: () => {} });

  // v2 needs no legacy code in-process any more (phase 5: own documents + signing). The legacy
  // app still runs as its own process above; v2's ported document code reads templates from ROOT.


  v2 = await buildApp(cfg, {
    register: (a) => registerApi(a, {
      cfg, mailTls: { rejectUnauthorized: false }, // v2's own documents (phase 5) — no legacy bridge
      // v2's OWN signing templates (ported, 5c) + the same fake PDF engine as the legacy side:
      // DOCX→PDF = the fake soffice bytes, HTML→PDF = hash of the HTML (fake-pdf.mjs)
      pdfEngine: { docxToPdf: async () => Buffer.from("%PDF-1.4\n% OC contract-test fake PDF\n%%EOF\n"), htmlToPdf: async (html: string) => fakePdf(html) },
    }),
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
  // offer_sends too: the parity cases reuse offer numbers with different content, which v2 refuses
  // on purpose once an offer was sent (decision C — covered by "send record (v2 only)" below)
  const clean = async () => { await db().collection("emailsends").deleteMany({}); await db().collection("signingrequests").deleteMany({}); await db().collection("offer_sends").deleteMany({}); };
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

  it("hand-edited DOCX replaces the generated PDF and is archived + flagged on the timeline — v2: NO online-signing link (decision B)", async () => {
    const o = await sendBoth({ to: "k@example.invalid", subject: "Bearbeitet", offerNumber: "ANG-T-4", offerType: "bu", payload: JSON.stringify(BU), dealId: "9013",
      body: "Guten Tag,\n\nanbei Ihr Angebot.\n\nKeine Möglichkeit, die Dokumente auszudrucken? {{SIGN_LINK}}\n\nViele Grüße",
      editedDocx: { filename: "Angebot bearbeitet.docx", content: "PK-fake-docx" } });
    expect(o.v2.res.status, JSON.stringify(o.v2.res.body).slice(0, 400)).toBe(200);
    expect(o.legacy.res.status).toBe(200);
    // intended difference: the customer would sign the standard rendering without the edits
    // (audit signing S-02) → v2 creates no signing request and drops the sentence with the link
    expect(o.v2.res.body).toMatchObject({ ok: true, signingLink: "off-hand-edited" });
    const text = (m: any) => String(m.mail.text || "");
    expect(text(o.legacy.mails[0])).toMatch(/\/sign\/[0-9a-f]{48}/);
    expect(text(o.v2.mails[0])).not.toContain("/sign/");
    expect(text(o.v2.mails[0])).not.toContain("auszudrucken");
    expect(text(o.v2.mails[0])).toContain("anbei Ihr Angebot.");
    expect(await db().collection("signingrequests").countDocuments({})).toBe(0); // clean() ran before the v2 send
    // same attachments as legacy (the converted DOCX is the offer PDF)
    const names = (m: any) => m.mail.attachments.map((a: any) => a.filename).sort();
    expect(names(o.v2.mails[0])).toEqual(names(o.legacy.mails[0]));
    const mailNote = o.v2.calls.find((c) => c.method === "crm.timeline.comment.add" && c.params.includes("Email automatisch von OC gesendet"))!;
    expect(mailNote.params).toContain("Handbearbeitete DOCX hochgeladen");
    expect(mailNote.params).toContain(`${BU.offerNumber}.docx`);
    expect(o.v2.calls.some((c) => c.params.includes("/sign/"))).toBe(false);
  }, 60000);
  // ---- v2 only: one record per send (ADR 023) — legacy has no such thing ----
  describe("send record (v2 only)", () => {
    const get = async (url: string) => {
      const r = await v2.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
      return { status: r.statusCode, body: r.headers["content-type"]?.toString().includes("json") ? r.json() : null, raw: r.rawPayload, headers: r.headers };
    };
    const fields = (sendId: string, extra: Record<string, Field> = {}) => ({
      to: "kunde0001@example.invalid", subject: "Ihr Angebot", offerNumber: "ANG-REC-1", offerType: "bu", body: "Hallo {{SIGN_LINK}}",
      payload: JSON.stringify({ ...BU, offerNumber: "ANG-REC-1" }), dealId: "9311", sendId, ...extra,
    });
    beforeAll(async () => { const { migrateOfferSendIndexes } = await import("../src/modules/sends/store.js"); await migrateOfferSendIndexes(); });

    it("records who/what/price/steps, stores the exact PDF, and answers a repeated sendId without sending again", async () => {
      await clean(); smtp.take(); bx.take("v2");
      const first = await sendTo("v2", fields("send-rec-0001", { attachments: { filename: "Notiz.txt", content: "Hallo" } }));
      expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBe(200);
      expect(first.body).toMatchObject({ ok: true, sendId: "send-rec-0001" });
      const mails = smtp.take();
      expect(mails).toHaveLength(1);

      const st = await get("/api/sends/send-rec-0001");
      expect(st.status).toBe(200);
      expect(st.body.send).toMatchObject({
        status: "done", channel: "email", dealId: "9311", offerNumber: "ANG-REC-1", to: "kunde0001@example.invalid", by: USER.email,
        steps: { pdf: { status: "ok" }, mail: { status: "ok" }, emailLog: { status: "ok" }, bitrix: { status: "ok" } },
      });
      expect(st.body.send.total).toBe(first.body.offerTotal); // the price as sent is frozen on the record
      expect(st.body.result).toMatchObject({ ok: true, offerTotal: first.body.offerTotal });
      // offer PDF, the upload, and the standard enclosures that were filed in Bitrix
      expect([...new Set(st.body.send.files.map((f: any) => f.role))].sort()).toEqual(["offer", "preset", "upload"]);

      // the stored offer PDF is byte-identical to the one in the customer's mail
      const offerFile = st.body.send.files.find((f: any) => f.role === "offer");
      const pdf = await get(`/api/sends/send-rec-0001/files/${offerFile.fileId}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      const mailed = mails[0].mail.attachments.find((a: any) => a.filename === offerFile.filename)!;
      expect(Buffer.compare(pdf.raw, mailed.content)).toBe(0);

      // same sendId again (retry after a dropped connection): stored answer, no second mail, no second Bitrix filing
      bx.take("v2");
      const again = await sendTo("v2", fields("send-rec-0001"));
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ ok: true, duplicate: true, messageId: first.body.messageId });
      await new Promise((r) => setTimeout(r, 200));
      expect(smtp.take()).toHaveLength(0);
      expect(bx.take("v2")).toHaveLength(0);

      const list = await get("/api/offers/ANG-REC-1/sends");
      expect(list.body.sends.map((x: any) => x.sendId)).toEqual(["send-rec-0001"]);
      expect((await get("/api/sends/unknown-send-id")).status).toBe(404);
    }, 60000);

    it("a send that is still running is not started a second time", async () => {
      const { OfferSend } = await import("../src/modules/sends/store.js");
      await OfferSend.create({ sendId: "send-rec-running", channel: "email", status: "running", startedAt: new Date() });
      smtp.take();
      const r = await sendTo("v2", fields("send-rec-running"));
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("SEND_IN_PROGRESS");
      expect(smtp.take()).toHaveLength(0);
    }, 30000);

    it("decision C: a sent offer is immutable — changed content is refused for save, e-mail and post; unchanged goes through", async () => {
      await clean(); smtp.take();
      const P = { ...BU, offerNumber: "ANG-REC-C" };
      const f = (sendId: string, payload: any, extra: Record<string, Field> = {}) => ({ ...fields(sendId), offerNumber: "ANG-REC-C", payload: JSON.stringify(payload), dealId: "9312", ...extra });
      expect((await sendTo("v2", f("send-c-0001", P))).status).toBe(200);
      const post = (url: string, body: unknown) => v2.inject({ method: "POST", url, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: body as any });

      // saving the SAME offer again is fine (downloads etc.), also with workflow noise and another key order
      const noisy = { zusammenfassung: { sent: true }, mail: { to: "x" }, ...Object.fromEntries(Object.entries(P).reverse()) };
      expect((await post("/api/offers", { offerNumber: "ANG-REC-C", offerType: "bu", payload: noisy })).statusCode).toBe(200);

      // changed content under the sent number → refused everywhere, with a message that says what to do
      const changed = { ...P, Kundendaten: { ...P.Kundendaten, lastName: "Geändert" } };
      const save = await post("/api/offers", { offerNumber: "ANG-REC-C", offerType: "bu", payload: changed });
      expect(save.statusCode).toBe(409);
      expect(save.json()).toMatchObject({ error: { code: "OFFER_CHANGED" }, differences: ["Inhalt (Positionen, Preise oder Kundendaten)"], sent: { sendId: "send-c-0001", channel: "email" } });
      expect(save.json().error.message).toContain("neue Version");
      const mail = await sendTo("v2", f("send-c-0002", changed, { forceResend: "1" }));
      expect(mail.status).toBe(409);
      expect(mail.body.error.code).toBe("OFFER_CHANGED");
      expect(smtp.take()).toHaveLength(1); // only the first mail ever left
      // the stored offer is still the one that was sent
      const stored: any = await db().collection("offers").findOne({ offerNumber: "ANG-REC-C" });
      expect(stored.payload.Kundendaten.lastName).toBe(P.Kundendaten.lastName);
      // a new version (new number) is free
      expect((await post("/api/offers", { offerNumber: "ANG-REC-C-2", offerType: "bu", payload: { ...changed, offerNumber: "ANG-REC-C-2" } })).statusCode).toBe(200);
    }, 60000);

    it("e-mail first, post a few days later: unchanged → the letter is the exact PDF that was mailed; changed → refused, original on request", async () => {
      await clean(); await db().collection("postalsends").deleteMany({}); bx.take("v2");
      const { OfferSend, storeSendFile } = await import("../src/modules/sends/store.js");
      const { offerIdentity } = await import("../src/modules/sends/identity.js");
      const pdf = async (text: string) => { const d = await PDFDocument.create(); d.addPage([595.28, 841.89]).drawText(text, { x: 50, y: 700 }); return Buffer.from(await d.save()); };
      const P = { ...BU, offerNumber: "ANG-REC-P" };
      // the e-mail send of a few days ago (the contract-test PDF engine returns placeholder bytes, so the record is seeded with a real PDF)
      const mailedPdf = await pdf("Angebot wie per E-Mail versendet");
      await OfferSend.create({ sendId: "send-p-mail", channel: "email", status: "done", offerNumber: "ANG-REC-P", dealId: "9313", to: "kunde0001@example.invalid",
        by: USER.email, identity: offerIdentity(P, "ANG-REC-P"), total: 1234.5, startedAt: new Date(Date.now() - 3 * 864e5), finishedAt: new Date(Date.now() - 3 * 864e5) });
      await storeSendFile("send-p-mail", "offer", "ANG-REC-P.pdf", mailedPdf);

      const post = async (body: Record<string, unknown>) => {
        const r = await v2.inject({ method: "POST", url: "/api/post/send", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: body as any });
        return { status: r.statusCode, body: r.json() };
      };
      const printed = () => bx.take("v2").filter((c: any) => c.method.startsWith("ob24:") && c.http === "POST").map((c: any) => JSON.parse(c.params).letter.base64_file as string);
      const freshlyRendered = await pdf("Angebot neu erzeugt (andere Bytes)");
      const letter = { recipient: { name: "Kunde 0001", street: "Teststr. 1", zipCode: "95028", city: "Hof" }, auftragId: "9313", meta: { offerNumber: "ANG-REC-P", dealId: "9313" },
        document: { filename: "ANG-REC-P.pdf", base64: freshlyRendered.toString("base64") } };

      // unchanged offer → accepted; the printer receives the PDF that was mailed, not the freshly rendered one
      const ok = await post({ ...letter, sendId: "send-p-post", payload: P });
      expect(ok.status, JSON.stringify(ok.body).slice(0, 300)).toBe(200);
      expect(ok.body).toMatchObject({ ok: true, sendId: "send-p-post", resendOf: { sendId: "send-p-mail", channel: "email" } });
      const first = printed();
      expect(first).toHaveLength(1);
      expect(Buffer.from(first[0]!, "base64").equals(mailedPdf)).toBe(true);
      const st = await get("/api/sends/send-p-post");
      expect(st.body.send).toMatchObject({ channel: "post", status: "done", resendOf: "send-p-mail", total: 1234.5, steps: { provider: { status: "ok" }, bitrix: { status: "ok" } } });
      const letterFile = st.body.send.files.find((x: any) => x.role === "letter");
      expect((await get(`/api/sends/send-p-post/files/${letterFile.fileId}`)).raw.equals(mailedPdf)).toBe(true);

      // changed offer → refused; nothing goes to the printer
      await db().collection("postalsends").deleteMany({});
      const changed = { ...P, Kundendaten: { ...P.Kundendaten, street: "Andere Str. 9" } };
      const no = await post({ ...letter, sendId: "send-p-post2", payload: changed });
      expect(no.status).toBe(409);
      expect(no.body).toMatchObject({ ok: false, error: { code: "OFFER_CHANGED" }, sent: { sendId: "send-p-post" } });
      expect(printed()).toHaveLength(0);
      // …unless the user posts the original as it was sent
      const orig = await post({ ...letter, sendId: "send-p-post3", useSentOriginal: true });
      expect(orig.status, JSON.stringify(orig.body).slice(0, 300)).toBe(200);
      expect(orig.body.resendOf.sendId).toBe("send-p-post");
      expect(Buffer.from(printed()[0]!, "base64").equals(mailedPdf)).toBe(true);
      // without a payload (old client) nothing is compared — today's behaviour
      await db().collection("postalsends").deleteMany({});
      expect((await post({ ...letter })).status).toBe(200);
      expect(Buffer.from(printed()[0]!, "base64").equals(freshlyRendered)).toBe(true);
    }, 90000);

    it("a failed Bitrix filing can be repeated from the stored files — nothing is mailed again", async () => {
      await clean(); smtp.take(); bx.take("v2");
      const P = { ...BU, offerNumber: "ANG-REC-B" };
      const { OfferSend } = await import("../src/modules/sends/store.js");
      expect((await sendTo("v2", { ...fields("send-b-0001"), offerNumber: "ANG-REC-B", payload: JSON.stringify(P), dealId: "9314" })).status).toBe(200);
      smtp.take(); bx.take("v2");
      const retry = () => v2.inject({ method: "POST", url: "/api/sends/send-b-0001/retry-bitrix", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: {} });
      expect((await retry()).json()).toMatchObject({ ok: true, already: true }); // filed fine → nothing to do
      expect(bx.take("v2")).toHaveLength(0);
      // simulate the failure that was recorded at send time
      await OfferSend.updateOne({ sendId: "send-b-0001" }, { $set: { "steps.bitrix": { status: "failed", at: new Date(), error: "timeout" } } });
      const r = await retry();
      expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
      expect(r.json().send.steps.bitrix.status).toBe("ok");
      const calls = bx.take("v2");
      expect(calls.some((c: any) => c.method === "crm.timeline.comment.add" && decodeURIComponent(c.params).includes("ANG-REC-B"))).toBe(true);
      expect(smtp.take()).toHaveLength(0);
    }, 60000);

    it("offer numbers are registered: free → reserved; held by another unsaved offer → a new unique number; saved work keeps its number", async () => {
      const { migrateOfferNumberIndexes } = await import("../src/modules/sends/numbers.js");
      await migrateOfferNumberIndexes();
      await db().collection("offer_numbers").deleteMany({});
      const claim = async (current: string, claimId: string) => {
        const r = await v2.inject({ method: "POST", url: "/api/offer-numbers/claim", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, payload: { current, claimId } });
        return { status: r.statusCode, body: r.json() };
      };
      // device A registers its number; asking again changes nothing
      expect((await claim("ANG2026-1111-101500", "device-aaaa-0001")).body).toMatchObject({ ok: true, offerNumber: "ANG2026-1111-101500", changed: false, reason: "reserved" });
      expect((await claim("ANG2026-1111-101500", "device-aaaa-0001")).body).toMatchObject({ changed: false });
      // device B minted the same number in the same second → gets a new, unique one in the same format
      const b = await claim("ANG2026-1111-101500", "device-bbbb-0002");
      expect(b.body).toMatchObject({ ok: true, changed: true, reason: "taken" });
      expect(b.body.offerNumber).toMatch(/^ANG\d{4}-\d{4}-\d{6}$/);
      expect(b.body.offerNumber).not.toBe("ANG2026-1111-101500");
      expect((await claim(b.body.offerNumber, "device-bbbb-0002")).body).toMatchObject({ changed: false, offerNumber: b.body.offerNumber });
      // a number with saved work (here: the sent offer from the test above) belongs to whoever opens that offer
      expect((await claim("ANG-REC-1", "device-cccc-0003")).body).toMatchObject({ changed: false, reason: "in-use" });
      expect((await claim("kaputt", "device-cccc-0003")).status).toBe(400);
    }, 30000);

    it("a failed send is recorded as failed and can be repeated with the same sendId", async () => {
      await clean(); smtp.take();
      const bad = await sendTo("v2", fields("send-rec-fail", { editedDocx: { filename: "a.pdf", content: "x" } }));
      expect(bad.status).toBe(400);
      // the answer goes out before the record is closed — a client that polls sees "running" for a moment
      await expect.poll(async () => (await get("/api/sends/send-rec-fail")).body.send.status).toBe("failed");
      expect(smtp.take()).toHaveLength(0);
      const ok = await sendTo("v2", fields("send-rec-fail"));
      expect(ok.status).toBe(200);
      expect((await get("/api/sends/send-rec-fail")).body.send.status).toBe("done");
      expect(smtp.take()).toHaveLength(1);
    }, 60000);
  });
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

// ---------------- group 4g: online signing ----------------
describe("contract: online signing — same responses, stored requests, Bitrix notes, mails and documents", () => {
  const db = () => mongoose.connection.db!;
  const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
  const byNo = (n: string) => JSON.parse(JSON.stringify(offers.find((o) => o.offerNumber === n).payload));
  const AHS = JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8")) as any[];
  const ahBy = (payer: string) => JSON.parse(JSON.stringify(AHS.find((x) => x.payload.Kundendaten?.payer === payer).payload));
  const SZ = byNo("ANG2026-1103-134214"), KASSE = byNo("ANG2026-1104-093242"), TWO = byNo("ANG2026-1103-130810");
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const HDR = { "x-forwarded-for": "203.0.113.7", "user-agent": "contract-test" };
  const TOKEN_RE = /[0-9a-f]{48}/g;
  const normText = (s: string) => (normaliseHtml(s) as string).replace(TOKEN_RE, "<TOKEN>").replace(/\/sign\/[0-9a-f]{8}…/g, "/sign/<TOKEN8>…").replace(/<[0-9a-f-]{36}@test\.local>/g, "<MSGID>");

  type Res = { status: number; type: string; text: string; body: any };
  const send = async (app: "legacy" | "v2", method: string, url: string, body?: unknown, { auth = true, cookie = false } = {}): Promise<Res> => {
    const headers: Record<string, string> = { ...HDR };
    if (auth) headers.authorization = `Bearer ${token}`;
    if (cookie) headers.cookie = `net_session=${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let status: number, type: string, raw: Buffer;
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      status = r.status; type = r.headers.get("content-type") ?? ""; raw = Buffer.from(await r.arrayBuffer());
    } else {
      const r = await v2.inject({ method: method as any, url, headers, payload: body as any });
      status = r.statusCode; type = String(r.headers["content-type"] ?? ""); raw = r.rawPayload;
    }
    const text = type.includes("pdf") ? createHashHex(raw) : raw.toString("utf8");
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* html / pdf */ }
    return { status, type, text, body: parsed };
  };
  const createHashHex = (b: Buffer) => `pdf:${b.toString("utf8").replace(/\n/g, " ")}`;

  /** v2 error envelope vs legacy {error:"…"} — same status, same message, same extra fields */
  const view = (r: Res, app: string) => {
    let body = r.body;
    // v2 adds the error-compat shim to every full page it serves (ADR 021); fragments are unchanged
    if (app === "legacy" && !body && r.type.includes("html") && /<head/i.test(r.text)) r = { ...r, text: injectHead(r.text) };
    if (body && app === "v2" && body.error && typeof body.error === "object") body = { ...body, error: body.error.message };
    if (r.status === 401) body = { error: "<login required>" }; // auth-gate wording differs by design (see security section)
    return { status: r.status, type: r.type.split(";")[0], body: body ? JSON.parse(normText(JSON.stringify(stripIds(body)))) : normText(r.text) };
  };
  const stripIds = (v: any): any => Array.isArray(v) ? v.map(stripIds) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "id" && k !== "_id" && k !== "__v").map(([k, x]) => [k, stripIds(x)])) : v;
  const calls = (app: string) => bx.take(app).map((c) => ({ ...c, params: normText(decodeURIComponent(c.params.replace(/\+/g, " "))) }));
  const stored = async (offerNumber: string) =>
    (await db().collection("signingrequests").find({ offerNumber }).sort({ createdAt: 1 }).toArray())
      .map((d) => JSON.parse(normText(JSON.stringify(stripIds({ ...d, createdAt: undefined, updatedAt: undefined, openedAt: !!d.openedAt, completedAt: !!d.completedAt, expiresAt: !!d.expiresAt, documents: d.documents.map((x: any) => ({ ...x, signedAt: !!x.signedAt })) })))));

  /** Runs `steps` against legacy, then (clean DB) against v2; every step's response, Bitrix calls and mails must match. */
  const scenario = async (offerNumber: string, steps: (app: "legacy" | "v2", ctx: { tok: string }) => Promise<Res>[] | Promise<void>, per: (app: "legacy" | "v2", ctx: { tok: string; log: any[] }) => Promise<void>) => {
    const out: Record<string, { log: any[]; db: any[] }> = {};
    for (const app of ["legacy", "v2"] as const) {
      await db().collection("signingrequests").deleteMany({});
      bx.take(app); smtp.take();
      const ctx = { tok: "", log: [] as any[] };
      await per(app, ctx);
      await new Promise((r) => setTimeout(r, 200));
      out[app] = { log: ctx.log, db: await stored(offerNumber) };
    }
    void steps;
    for (let i = 0; i < Math.max(out.legacy!.log.length, out.v2!.log.length); i++) expect(out.v2!.log[i], `step ${i}: ${JSON.stringify(out.legacy!.log[i]?.step)}`).toEqual(out.legacy!.log[i]);
    expect(out.v2!.db).toEqual(out.legacy!.db);
    return out.v2!;
  };
  /** one step: response + outgoing Bitrix calls + mails */
  const step = async (app: "legacy" | "v2", ctx: { log: any[] }, name: string, p: Promise<Res>) => {
    const r = await p;
    await new Promise((res) => setTimeout(res, 50));
    ctx.log.push({ step: name, res: view(r, app), calls: calls(app), mails: smtp.take().map((m) => mailView(m, normText)) });
    return r;
  };
  const create = (app: "legacy" | "v2", body: Record<string, unknown>) => send(app, "POST", "/api/signing", body);

  it("Selbstzahler: create + email link, open, view, payment-term rule, sign → completion (mail, Bitrix, stage)", async () => {
    const v = await scenario("T-SZ-1", () => {}, async (app, ctx) => {
      const r = await step(app, ctx, "create", create(app, { payload: SZ, offerNumber: "T-SZ-1", offerType: "bu", dealId: "9001", sendEmail: true }));
      const tok = r.body.token;
      await step(app, ctx, "open", send(app, "GET", `/api/signing/${tok}`, undefined, { auth: false }));
      await step(app, ctx, "open again (no 2nd note)", send(app, "GET", `/api/signing/${tok}`, undefined, { auth: false }));
      await step(app, ctx, "html", send(app, "GET", `/api/signing/${tok}/documents/angebot/html`, undefined, { auth: false }));
      await step(app, ctx, "pdf", send(app, "GET", `/api/signing/${tok}/documents/angebot/pdf`, undefined, { auth: false }));
      await step(app, ctx, "unknown doc", send(app, "GET", `/api/signing/${tok}/documents/vollmacht/pdf`, undefined, { auth: false }));
      await step(app, ctx, "no signature", send(app, "POST", `/api/signing/${tok}/documents/angebot`, {}, { auth: false }));
      await step(app, ctx, "no payment term", send(app, "POST", `/api/signing/${tok}/documents/angebot`, { signatureImage: PNG }, { auth: false }));
      await step(app, ctx, "sign", send(app, "POST", `/api/signing/${tok}/documents/angebot`, { signatureImage: PNG, extraFields: { paymentTermIdx: 1 }, place: "Hof" }, { auth: false }));
      await step(app, ctx, "sign again → 409", send(app, "POST", `/api/signing/${tok}/documents/angebot`, { signatureImage: PNG + "A", extraFields: { paymentTermIdx: 1 } }, { auth: false })); // a DIFFERENT signature; the identical one is answered with the first result in v2 (see "v2 only" below)
      await step(app, ctx, "status", send(app, "GET", "/api/signing/status/T-SZ-1"));
      await step(app, ctx, "page (customer)", send(app, "GET", `/sign/${tok}`, undefined, { auth: false }));
      await step(app, ctx, "page (rep, cookie)", send(app, "GET", `/sign/${tok}`, undefined, { auth: false, cookie: true }));
    });
    // sanity: the flow really ran (equal failures on both sides must not pass)
    const at = (name: string) => v.log.find((l: any) => l.step === name);
    expect(at("create").res.status).toBe(201);
    expect(at("create").mails).toHaveLength(1);
    expect(at("pdf").res.type).toBe("application/pdf");
    expect(at("html").res.type).toBe("text/html");
    expect(at("no payment term").res.status).toBe(400);
    expect(at("sign").res.body).toMatchObject({ ok: true, status: "completed", completed: true });
    const done = at("sign");
    expect(done.mails).toHaveLength(1);
    expect(done.mails[0].envelope.to).toContain("buero@test.local"); // office bcc
    expect(done.mails[0].attachments.map((a: any) => a.filename)).toContain("angebot_T-SZ-1.pdf");
    expect(done.calls.map((c: any) => c.method)).toEqual(expect.arrayContaining(["crm.timeline.comment.add", "crm.item.update"]));
    expect(at("page (rep, cookie)").res.body).toContain('data-internal-user="true"');
    expect(at("page (customer)").res.body).toContain('data-internal-user="false"');
  }, 120000);

  it("Kassenkunde: Vollmacht/Abtretung required fields, field carry-over, completion with Eigenanteil stage move", async () => {
    const v = await scenario("T-KK-1", () => {}, async (app, ctx) => {
      const p = JSON.parse(JSON.stringify(KASSE));
      p.Kundendaten.kk_versichertennr = ""; // forces the required-field rule
      const r = await step(app, ctx, "create", create(app, { payload: p, offerNumber: "T-KK-1", dealId: "9002", sendEmail: false, via: "post" }));
      const tok = r.body.token;
      await step(app, ctx, "vollmacht html", send(app, "GET", `/api/signing/${tok}/documents/vollmacht/html`, undefined, { auth: false }));
      await step(app, ctx, "vollmacht pdf", send(app, "GET", `/api/signing/${tok}/documents/vollmacht/pdf`, undefined, { auth: false }));
      await step(app, ctx, "vollmacht missing KVNR", send(app, "POST", `/api/signing/${tok}/documents/vollmacht`, { signatureImage: PNG }, { auth: false }));
      await step(app, ctx, "vollmacht with edits", send(app, "POST", `/api/signing/${tok}/documents/vollmacht`, { signatureImage: PNG, editedFields: { kk_versichertennr: "K123456789", phone: "0170 111", kassenkundeName: "AOK Bayern", geburtsdatum: "01.02.1940" } }, { auth: false }));
      await step(app, ctx, "abtretung (carried fields)", send(app, "POST", `/api/signing/${tok}/documents/abtretung`, { signatureImage: PNG, editedFields: { pflegegrad: "3", kk_pflegegradSeit: "2024", kk_krankenkasseAdresse: "Postfach 1, Hof" } }, { auth: false }));
      await step(app, ctx, "angebot → completed", send(app, "POST", `/api/signing/${tok}/documents/angebot`, { signatureImage: PNG, extraFields: { paymentTermIdx: 0 } }, { auth: false }));
      await step(app, ctx, "signed PDFs for post", send(app, "GET", "/api/signing/status/T-KK-1/signed"));
      await step(app, ctx, "admin list", send(app, "GET", "/admin/api/signing?q=T-KK"));
      await step(app, ctx, "admin pdf (signed)", send(app, "GET", `/admin/api/signing/${tok}/documents/abtretung/pdf`));
    });
    expect(v.db[0].status).toBe("completed");
    expect(v.db[0].payloadSnapshot.Kundendaten.kk_versichertennr).toBe("K123456789");
  }, 120000);

  it("reuse rules: unchanged → same link; changed after a signature → 409 confirm, force → new link; expired → 410; admin send-bitrix", async () => {
    await scenario("T-RE-1", () => {}, async (app, ctx) => {
      const p = JSON.parse(JSON.stringify(KASSE));
      const r = await step(app, ctx, "create", create(app, { payload: p, offerNumber: "T-RE-1", dealId: "9001" }));
      const tok = r.body.token;
      await step(app, ctx, "unchanged → reused", create(app, { payload: JSON.parse(JSON.stringify(KASSE)), offerNumber: "T-RE-1", dealId: "9001", via: "post" }));
      await step(app, ctx, "sign vollmacht", send(app, "POST", `/api/signing/${tok}/documents/vollmacht`, { signatureImage: PNG, editedFields: { phone: "0170 2" } }, { auth: false }));
      await step(app, ctx, "admin send-bitrix (partial)", send(app, "POST", `/admin/api/signing/${tok}/send-bitrix`, {}));
      const changed = JSON.parse(JSON.stringify(KASSE)); changed.Kundendaten.city = "Rehau";
      await step(app, ctx, "changed → 409", create(app, { payload: changed, offerNumber: "T-RE-1", dealId: "9001" }));
      const n = await step(app, ctx, "force → new", create(app, { payload: changed, offerNumber: "T-RE-1", dealId: "9001", force: true }));
      await db().collection("signingrequests").updateOne({ token: n.body.token }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await step(app, ctx, "expired → 410", send(app, "GET", `/api/signing/${n.body.token}`, undefined, { auth: false }));
      // main PR #321: the customer asks for a new link — one Bitrix task + note, repeated clicks do nothing
      await step(app, ctx, "valid link → 400", send(app, "POST", `/api/signing/${tok}/request-new-link`, {}, { auth: false }));
      await step(app, ctx, "request new link", send(app, "POST", `/api/signing/${n.body.token}/request-new-link`, {}, { auth: false }));
      await step(app, ctx, "request again → already", send(app, "POST", `/api/signing/${n.body.token}/request-new-link`, {}, { auth: false }));
      await step(app, ctx, "expired → 410, requested", send(app, "GET", `/api/signing/${n.body.token}`, undefined, { auth: false }));
      await step(app, ctx, "unknown token → 404", send(app, "GET", "/api/signing/doesnotexist", undefined, { auth: false }));
      await step(app, ctx, "no payload → 400", create(app, {}));
      await step(app, ctx, "status needs login", send(app, "GET", "/api/signing/status/T-RE-1", undefined, { auth: false }));
    });
  }, 120000);

  it("two persons: partner documents, labels, completion files each person's PDFs on their own contact", async () => {
    await scenario("T-2P-1", () => {}, async (app, ctx) => {
      const r = await step(app, ctx, "create", create(app, { payload: TWO, offerNumber: "T-2P-1", dealId: "9001" }));
      const tok = r.body.token;
      const open = await step(app, ctx, "open", send(app, "GET", `/api/signing/${tok}`, undefined, { auth: false }));
      const fill = { kk_versichertennr: "K1", kassenkundeName: "AOK", geburtsdatum: "01.01.1940", phone: "0170", pflegegrad: "2", kk_pflegegradSeit: "2023", kk_krankenkasseAdresse: "Hof", street: "Weg 1", postalCode: "95028", city: "Hof", firstName: "A", lastName: "B" };
      for (const d of open.body.documents) {
        const body = d.key === "angebot" ? { signatureImage: PNG, extraFields: { paymentTermIdx: 0 } } : { signatureImage: PNG, editedFields: d.key.endsWith("_p2") ? { ...fill, firstName: "P", lastName: "Zwei" } : fill };
        await step(app, ctx, `sign ${d.key}`, send(app, "POST", `/api/signing/${tok}/documents/${d.key}`, body, { auth: false }));
      }
    });
  }, 120000);

  it("two persons, ambiguous partner contact → flagged deal note instead of filing", async () => {
    await scenario("T-2P-2", () => {}, async (app, ctx) => {
      const p = JSON.parse(JSON.stringify(TWO)); p.Kundendaten.partnerLastName = "Mehrfach";
      const r = await step(app, ctx, "create", create(app, { payload: p, offerNumber: "T-2P-2", dealId: "9001" }));
      const tok = r.body.token;
      const fill = { kk_versichertennr: "K1", kassenkundeName: "AOK", geburtsdatum: "01.01.1940", phone: "0170", pflegegrad: "2", kk_pflegegradSeit: "2023", kk_krankenkasseAdresse: "Hof", street: "Weg 1", postalCode: "95028", city: "Hof", firstName: "A", lastName: "B" };
      for (const d of r.body.documents as string[]) {
        const body = d === "angebot" ? { signatureImage: PNG, extraFields: { paymentTermIdx: 0 } } : { signatureImage: PNG, editedFields: d.endsWith("_p2") ? { ...fill, firstName: "P", lastName: "Mehrfach" } : fill };
        await step(app, ctx, `sign ${d}`, send(app, "POST", `/api/signing/${tok}/documents/${d}`, body, { auth: false }));
      }
    });
  }, 120000);

  it.each([["Kassenkunde"], ["Selbstzahler"]])("AH %s: Zusatzblatt (+ Abtretung §45b), Bevollmächtigte/r rule, AH stage", async (payer) => {
    const no = `T-AH-${payer}`;
    await scenario(no, () => {}, async (app, ctx) => {
      const r = await step(app, ctx, "create", create(app, { payload: ahBy(payer), offerNumber: no, offerType: "ah", dealId: "9003", sendEmail: true }));
      const tok = r.body.token;
      await step(app, ctx, "html angebot (AH)", send(app, "GET", `/api/signing/${tok}/documents/angebot/html`, undefined, { auth: false }));
      await step(app, ctx, "html zusatzblatt", send(app, "GET", `/api/signing/${tok}/documents/zusatzblatt/html`, undefined, { auth: false }));
      await step(app, ctx, "bevollmächtigte/r without signature", send(app, "POST", `/api/signing/${tok}/documents/zusatzblatt`, { signatureImage: PNG, editedFields: { bevollmaechtigterName: "Tochter" } }, { auth: false }));
      const fill = { kk_versichertennr: "K1", kassenkundeName: "AOK", geburtsdatum: "01.01.1940", phone: "0170", pflegegrad: "2", kk_pflegegradSeit: "2023", kk_krankenkasseAdresse: "Hof", street: "Weg 1", postalCode: "95028", city: "Hof", firstName: "A", lastName: "B" };
      for (const d of r.body.documents as string[]) {
        const body = d === "zusatzblatt" ? { signatureImage: PNG, editedFields: { bevollmaechtigterName: "Tochter" }, extraFields: { bevollmaechtigterSignature: PNG } }
          : d === "abtretung_ah" ? { signatureImage: PNG, editedFields: fill } : { signatureImage: PNG };
        await step(app, ctx, `sign ${d}`, send(app, "POST", `/api/signing/${tok}/documents/${d}`, body, { auth: false }));
      }
    });
  }, 120000);
  // ---- v2 only (ADR 023, increment 3): signature first, one completion, stored signed PDFs, on-site record ----
  describe("signing record (v2 only)", () => {
    const J = { authorization: `Bearer ${"x"}` };
    const call = async (method: "GET" | "POST", url: string, body?: unknown, auth = true) => {
      const r = await v2.inject({ method, url, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body as any });
      return { status: r.statusCode, body: r.headers["content-type"]?.toString().includes("json") ? r.json() : null, raw: r.rawPayload };
    };
    void J;
    beforeAll(async () => { const { migrateOfferSendIndexes } = await import("../src/modules/sends/store.js"); await migrateOfferSendIndexes(); });

    it("on-site: record + locked offer on the server; sent from the first signature; identical re-submit = first result; signed PDF stored and served", async () => {
      const db = mongoose.connection.db!;
      await db.collection("signingrequests").deleteMany({ offerNumber: "T-ONSITE-1" });
      await db.collection("offers").deleteMany({ offerNumber: "T-ONSITE-1" });
      smtp.take(); bx.take("v2");
      const P = { ...byNo("ANG2026-1103-134214"), offerNumber: "T-ONSITE-1" };
      const created = await call("POST", "/api/signing", { payload: P, offerNumber: "T-ONSITE-1", offerType: "bu", dealId: "9401", sendEmail: false, sendId: "onsite-send-0001" });
      expect(created.status, JSON.stringify(created.body).slice(0, 300)).toBe(201);
      const tok = created.body.token;

      // hand-over recorded; the locked offer exists without any browser save; not "sent" yet
      const rec1 = await call("GET", "/api/sends/onsite-send-0001");
      expect(rec1.body.send).toMatchObject({ channel: "onsite", status: "done", offerNumber: "T-ONSITE-1", signing: true, signedAt: null });
      expect(await db.collection("offers").countDocuments({ offerNumber: "T-ONSITE-1", locked: true })).toBe(1);
      // before any signature the rep may still change the offer (customer is watching) …
      const changed = { ...P, Kundendaten: { ...P.Kundendaten, street: "Neue Str. 5" } };
      expect((await call("POST", "/api/offers", { offerNumber: "T-ONSITE-1", offerType: "bu", payload: changed })).status).toBe(200);
      expect((await call("POST", "/api/offers", { offerNumber: "T-ONSITE-1", offerType: "bu", payload: P })).status).toBe(200);

      // sign
      const sign = (sig: string) => call("POST", `/api/signing/${tok}/documents/angebot`, { signatureImage: sig, extraFields: { paymentTermIdx: 1 }, place: "Hof" }, false);
      const first = await sign(PNG);
      expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBe(200);
      expect(first.body).toMatchObject({ ok: true, status: "completed", completed: true });
      await new Promise((r) => setTimeout(r, 200));
      const mails = smtp.take();
      expect(mails).toHaveLength(1);
      const calls1 = bx.take("v2").length;
      expect(calls1).toBeGreaterThan(0);

      // identical submit again (double tap / retry): first result, nothing sent or filed twice
      const again = await sign(PNG);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ ok: true, completed: true, duplicate: true });
      await new Promise((r) => setTimeout(r, 200));
      expect(smtp.take()).toHaveLength(0);
      expect(bx.take("v2")).toHaveLength(0);
      expect((await sign(PNG + "A")).status).toBe(409); // a different signature stays a conflict

      // the signed PDF is stored with the record — byte-identical to the customer's copy — and served from there
      const rec2 = await call("GET", "/api/sends/onsite-send-0001");
      expect(rec2.body.send.signedAt).toBeTruthy();
      const signedFile = rec2.body.send.files.find((f: any) => f.role === "signed");
      expect(signedFile.filename).toBe("angebot_T-ONSITE-1.pdf");
      const stored = (await call("GET", `/api/sends/onsite-send-0001/files/${signedFile.fileId}`)).raw;
      const mailed = mails[0].mail.attachments.find((a: any) => a.filename === "angebot_T-ONSITE-1.pdf")!.content as Buffer;
      expect(stored.equals(mailed)).toBe(true);
      const { SigningCompletion } = await import("../src/modules/sends/store.js");
      expect((await SigningCompletion.findOne({ token: tok }).lean() as any).result).toMatchObject({ ok: true, stored: true, email: "ok" });

      // signed = sent: changed content is refused now, for saving and for a new signing request
      const save = await call("POST", "/api/offers", { offerNumber: "T-ONSITE-1", offerType: "bu", payload: changed });
      expect(save.status).toBe(409);
      expect(save.body.error.code).toBe("OFFER_CHANGED");
      const again2 = await call("POST", "/api/signing", { payload: changed, offerNumber: "T-ONSITE-1", offerType: "bu", dealId: "9401", sendEmail: false, sendId: "onsite-send-0002" });
      expect(again2.status).toBe(409);
      expect(again2.body.error.code).toBe("OFFER_CHANGED");
    }, 120000);

    it("an offer the OLD app sent (no send record, but its mail log): changed content is refused; a never-sent saved offer is priced fresh", async () => {
      const db = mongoose.connection.db!;
      const P = { ...byNo("ANG2026-1103-134214"), offerNumber: "T-OLD-1" };
      const changed = { ...P, Kundendaten: { ...P.Kundendaten, lastName: "Anders" } };
      for (const n of ["T-OLD-1", "T-OLD-2"]) { await db.collection("offers").deleteMany({ offerNumber: n }); await db.collection("emaillogs").deleteMany({ offerNumber: n }); }
      // saved, never sent → changing it is allowed and the price is computed fresh
      expect((await call("POST", "/api/offers", { offerNumber: "T-OLD-2", offerType: "bu", payload: { ...P, offerNumber: "T-OLD-2" } })).status).toBe(200);
      const fresh = await call("POST", "/api/offers", { offerNumber: "T-OLD-2", offerType: "bu", payload: { ...P, offerNumber: "T-OLD-2", rabatt: { ...(P.rabatt || {}), sonderaufschlagValue: "80" } } });
      expect(fresh.status).toBe(200);
      const recomputed = await call("POST", "/api/offers", { offerNumber: "T-OLD-3", offerType: "bu", payload: { ...P, offerNumber: "T-OLD-3", rabatt: { ...(P.rabatt || {}), sonderaufschlagValue: "80" } } });
      expect(fresh.body.offer.pricing.total).toBe(recomputed.body.offer.pricing.total); // not the old pinned total
      await db.collection("offers").deleteMany({ offerNumber: "T-OLD-3" });
      // sent by the old app → refused
      expect((await call("POST", "/api/offers", { offerNumber: "T-OLD-1", offerType: "bu", payload: P })).status).toBe(200);
      await db.collection("emaillogs").insertOne({ offerNumber: "T-OLD-1", to: "k@example.invalid", subject: "x", createdAt: new Date() });
      expect((await call("POST", "/api/offers", { offerNumber: "T-OLD-1", offerType: "bu", payload: P })).status).toBe(200); // unchanged
      const no = await call("POST", "/api/offers", { offerNumber: "T-OLD-1", offerType: "bu", payload: changed });
      expect(no.status).toBe(409);
      expect(no.body.error.code).toBe("OFFER_CHANGED");
    }, 60000);
  });
});

// ---------------- remaining small endpoints (vigor, catalog bulk, submissions, external lookup) ----------------
describe("contract: vigor prices, catalog bulk, submissions, external lookup", () => {
  const db = () => mongoose.connection.db!;
  const raw = async (app: "legacy" | "v2", method: string, url: string, body?: unknown, headers: Record<string, string> = { authorization: `Bearer ${token}` }) => {
    const h = { ...headers, ...(body !== undefined ? { "content-type": "application/json" } : {}) };
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }
    const r = await v2.inject({ method: method as any, url, headers: h, payload: body as any });
    return { status: r.statusCode, body: r.json() };
  };
  const same = async (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
    const l = await raw("legacy", method, url, body, headers), v = await raw("v2", method, url, body, headers);
    expect(v.status, url).toBe(l.status);
    if (l.status >= 400 && typeof l.body?.error === "string") {
      expect(v.body.error.message, url).toBe(l.body.error);
      const { error: _l, ...lx } = l.body; const { error: _v, ...vx } = v.body;
      expect(vx, url).toEqual(lx);
    } else expect(v.body, url).toEqual(l.body);
    return v;
  };

  it("/health same shape", async () => {
    const l = await raw("legacy", "GET", "/health", undefined, {}), v = await raw("v2", "GET", "/health", undefined, {});
    expect(v.status).toBe(200); expect(l.status).toBe(200);
    expect(Object.keys(v.body).sort()).toEqual(Object.keys(l.body).sort());
    expect(v.body.ok).toBe(true);
  });

  it("vigor-prices: net map, full=1 cards, freshest wins, zero price ignored", async () => {
    const vdb = mongoose.connection.getClient().db("vigor");
    await vdb.collection("products").deleteMany({ articleNumber: /^T-VG/ });
    await vdb.collection("products").insertMany([
      { articleNumber: "T-VG1", name: "Alt", netPrice: 10, listPrice: 20, lastSeenAt: new Date("2026-01-01"), images: ["a.jpg"], stockQuantity: 3 },
      { articleNumber: "T-VG1", name: "Neu", netPrice: 12, listPrice: 22, lastSeenAt: new Date("2026-02-01"), images: [], stockText: "lieferbar" },
      { articleNumber: "T-VG2", name: "Null", netPrice: 0, lastSeenAt: new Date("2026-03-01") },
      { articleNumber: "T-VG3", name: "Ohne Datum", netPrice: "7.5" },
    ]);
    for (const url of ["/api/vigor-prices", "/api/vigor-prices?ids=T-VG1,T-VG2,T-VG3,NOPE", "/api/vigor-prices?ids=T-VG1,%20T-VG3&full=1", "/api/vigor-prices?ids=,"]) await same("GET", url);
    const v = await same("GET", "/api/vigor-prices?ids=T-VG1,T-VG3&full=1");
    expect(v.body["T-VG1"].netPrice).toBe(12);
  });

  it("products/services bulk: same response, same stored catalog rows; empty body → 400", async () => {
    const run = async (app: "legacy" | "v2") => {
      await db().collection("Products").deleteMany({ productId: /^T-BULK/ });
      await db().collection("Services").deleteMany({ serviceId: /^T-BULK/ });
      const a = await raw(app, "POST", "/api/products/bulk", [{ productId: "T-BULK-1", name: "Wanne", price: "123.5", widthCm: 70, manufacturer: "X" }, { productId: "T-BULK-2", name: "Tür" }]);
      const b = await raw(app, "POST", "/api/products/bulk", [{ productId: "T-BULK-1", name: "Wanne 2", price: 99 }]);
      const c = await raw(app, "POST", "/api/services/bulk", [{ serviceId: "T-BULK-S1", name: "Montage", price: 50, time: "2", description: "d" }]);
      const rows = [
        ...(await db().collection("Products").find({ productId: /^T-BULK/ }).sort({ productId: 1 }).toArray()),
        ...(await db().collection("Services").find({ serviceId: /^T-BULK/ }).toArray()),
      ].map(({ _id, createdAt, updatedAt, ...rest }) => rest);
      const res = [a, b, c].map((r) => ({ status: r.status, ok: r.body?.ok, result: JSON.parse(JSON.stringify(r.body?.result ?? null).replace(/"[0-9a-f]{24}"/g, '"<ID>"')) }));
      return { res, rows };
    };
    const l = await run("legacy"), v = await run("v2");
    expect(v.rows).toEqual(l.rows);
    expect(v.res).toEqual(l.res);
    await same("POST", "/api/products/bulk", []);
    await same("POST", "/api/services/bulk", { not: "an array" });
    await db().collection("Products").deleteMany({ productId: /^T-BULK/ });
    await db().collection("Services").deleteMany({ serviceId: /^T-BULK/ });
  });

  it("v2 by design (ADR 018): catalog bulk writes need an admin; a normal user gets 403 and nothing is written", async () => {
    const email = "catalog-user@test.local";
    await db().collection("users").deleteMany({ email });
    await db().collection("users").insertOne({ email, name: "Normal", passwordHash: await hashPassword("pw-normal"), role: "user", active: true });
    const userTok = (await v2.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "pw-normal" } })).json().token;
    const H = { authorization: `Bearer ${userTok}` };
    const p = await raw("v2", "POST", "/api/products/bulk", [{ productId: "T-BULK-NO", name: "X", price: 1 }], H);
    const sv = await raw("v2", "POST", "/api/services/bulk", [{ serviceId: "T-BULK-NO", name: "X", price: 1 }], H);
    expect([p.status, sv.status]).toEqual([403, 403]);
    expect(p.body.error.message).toBe("Admin-Zugriff erforderlich");
    expect(await db().collection("Products").countDocuments({ productId: "T-BULK-NO" })).toBe(0);
    expect(await db().collection("Services").countDocuments({ serviceId: "T-BULK-NO" })).toBe(0);
    expect((await raw("v2", "POST", "/api/products/bulk", [{ productId: "T-BULK-NO", name: "X", price: 1 }], {})).status).toBe(401);
    await db().collection("users").deleteMany({ email });
  });

  it("submissions: same computed price, same stored row", async () => {
    const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
    const payload = JSON.parse(JSON.stringify(offers[0].payload));
    const out: any = {};
    for (const app of ["legacy", "v2"] as const) {
      await db().collection("Submissions").deleteMany({});
      const r = await raw(app, "POST", "/api/submissions", payload);
      const rows = (await db().collection("Submissions").find({}).toArray()).map(({ _id, createdAt, ...rest }) => rest);
      out[app] = { status: r.status, computed: r.body?.computed, hasId: !!r.body?.id, rows: JSON.parse(JSON.stringify(rows)) };
    }
    expect(out.v2).toEqual(out.legacy);
    expect(out.v2.status).toBe(201);
  });

  it("external lookup: API key rules, search, draft, offer, not found", async () => {
    const K = { "x-api-key": "ext-test-key" };
    const draftId = String((await db().collection("drafts").findOne({}))!._id);
    const offerNo = String((await db().collection("offers").findOne({ offerNumber: { $exists: true, $ne: "" } }))!.offerNumber);
    await same("GET", "/api/offers/external/search?q=a", undefined, {});
    await same("GET", "/api/offers/external/search?q=a", undefined, { "x-api-key": "wrong" });
    await same("GET", "/api/offers/external/search?q=a&apiKey=ext-test-key", undefined, {});
    for (const url of [
      "/api/offers/external/search", "/api/offers/external/search?q=M%C3%BCller&limit=3", "/api/offers/external/search?q=ANG2026&limit=500",
      `/api/offers/external/drafts/${draftId}`, "/api/offers/external/drafts/000000000000000000000000", "/api/offers/external/drafts/not-an-id",
      `/api/offers/external/offers/${offerNo}`, "/api/offers/external/offers/NOPE-1",
    ]) await same("GET", url, undefined, K);
  });
});

// ---------------- group 4i: product pickers (trays, DA model, curtains, bathtubs) ----------------
describe("contract: product pickers — same responses from the same vigor data", () => {
  const vdb = () => mongoose.connection.getClient().db("vigor");
  const same = async (url: string, auth = true) => {
    const h: Record<string, string> = auth ? { authorization: `Bearer ${token}` } : {};
    const lr = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { headers: h });
    const l = { status: lr.status, type: (lr.headers.get("content-type") ?? "").toLowerCase(), body: await lr.json().catch(() => null) };
    const vr = await v2.inject({ url, headers: h });
    const v = { status: vr.statusCode, type: String(vr.headers["content-type"] ?? "").toLowerCase(), body: vr.json() };
    expect(v.status, url).toBe(l.status);
    if (l.status >= 400 && typeof l.body?.error === "string") expect(v.body.error.message, url).toBe(l.body.error);
    else expect(v.body, url).toEqual(l.body);
    if (l.status < 400) expect(v.type, url).toBe(l.type);
    return v;
  };

  beforeAll(async () => {
    await vdb().collection("products").deleteMany({ $or: [{ category: "badewanne" }, { "configContext.category": { $exists: true } }, { articleNumber: /^(SLA|DW|T-DA)/ }] });
    await vdb().collection("models").deleteMany({});
    await vdb().collection("products").insertMany([
      // tray stock (freshest reading with stock data wins)
      { articleNumber: "SLA100", stockQuantity: 4, stockText: "auf Lager", stockSymbol: "green", lastSeenAt: new Date("2026-10-01") },
      { articleNumber: "SLA100", stockQuantity: 1, stockText: "wenige", stockSymbol: "yellow", lastSeenAt: new Date("2026-11-01") },
      { articleNumber: "SLA120100", lastSeenAt: new Date("2026-11-02") },
      // DA model images
      { articleNumber: "T-DA1", images: ["https://cdn.test/da1.jpg"] }, { articleNumber: "T-DA2", images: [] },
      // curtains (committed images or none → no download)
      { articleNumber: "DEPDS30", name: "Deckenstütze 300mm", netPrice: 9.5, configContext: { category: "vorhangstange" }, images: ["https://cdn.test/x.jpg"] },
      { articleNumber: "DEPVS150", name: "Stange", netPrice: 30, grosPrice: 40, configContext: { category: "vorhangstange" } },
      { articleNumber: "DEPVS90", name: "Stange kurz", netPrice: 20, configContext: { category: "vorhangstange" } },
      { articleNumber: "DEPVSROS", name: "Rosettenpaar", netPrice: 5, configContext: { category: "vorhangstange" } },
      { articleNumber: "HEWIDV140200W", name: "Vorhang 140", netPrice: 25, unit: "Stück", configContext: { category: "duschvorhang" }, stockQuantity: 2 },
      { articleNumber: "HEWIDV120200W", name: "Vorhang 120", netPrice: 22, configContext: { category: "duschvorhang" } },
      { articleNumber: "HEWIDV120200W", name: "Duplikat", netPrice: 99, configContext: { category: "duschvorhang" } },
      { articleNumber: "DERING10", name: "Ringe", finish: "VPE = 10 Stück", netPrice: 3, configContext: { category: "vorhangringe" } },
      // bathtubs (free-text attributes)
      { articleNumber: "IRIS160L2SWE", category: "badewanne", name: "Badewanne Acryl Iris 160x70/80cm weiß li", finish: "m.2 Schürzen weiß m.Abl. Novellini", netPrice: 1200, grosPrice: 1500, images: ["https://cdn.test/iris.jpg"], lastSeenAt: new Date("2026-10-01") },
      { articleNumber: "IRIS160L2SWE", category: "badewanne", name: "Badewanne Acryl Iris 160x70/80cm weiß li", finish: "m.2 Schürzen weiß m.Abl. Novellini", netPrice: 1250, lastSeenAt: new Date("2026-11-01") },
      { articleNumber: "IRIS170R3S", category: "badewanne", name: "Badewanne Acryl Iris 170x75/85x62cm weiß re", finish: "m.3 Sch.m.Ab-u.Ül.Grt.u.WE", netPrice: 1400 },
      { articleNumber: "IRIS170LFS", category: "badewanne", name: "Badewanne Iris 170x75cm li", finish: "m.Frontschürze u.WE", netPrice: 1300 },
      { articleNumber: "IRISNS", category: "badewanne", name: "Nackenstütze Nische", netPrice: 80 },
      { articleNumber: "IRISWA140L", category: "badewanne", name: "NOV Iris COMBY Wannenaufsatz für Iris li", finish: "24/60x140cm ESG klar chrom.m.S70", netPrice: 600 },
      { articleNumber: "IRISWAK140R", category: "badewanne", name: "Wannenaufsatz für Iris rechts Höhe 140cm", finish: "24/60cm klappb. ESG klar chrom Novellini", netPrice: 550 },
      { articleNumber: "IRISWA0", category: "badewanne", name: "ohne Preis", netPrice: 0 },
    ]);
    await vdb().collection("models").insertOne({ _id: "vigour" as any, model: { version: 1, leaves: [{ id: "l1", components: [{ id: "c1", articles: [{ articleNumber: "T-DA1", price: 10 }, { articleNumber: "T-DA2", price: 12 }] }] }] } });
  });

  it.each([
    "/api/trays/suggest?w=100&l=100", "/api/trays/suggest?b=120&l=100,0&budget=1", "/api/trays/suggest?h=3&series=dw",
    "/api/trays/suggest?w=90&source=Badolux", "/api/trays/suggest?widthCm=1.000", "/api/trays/suggest",
  ])("trays: %s", async (url) => { await same(url); });

  it("DA model: vigour (with product images), badolux static file, unknown supplier — public like legacy", async () => {
    const v = await same("/api/da-config/model/vigour", false);
    expect(v.body.leaves[0].components[0].articles[0].image).toBe("https://cdn.test/da1.jpg");
    // legacy res.sendFile refuses paths with a dot-folder (local worktrees live under .claude/) → 404 there;
    // production/CI paths have none. v2 must serve the file unchanged either way.
    if (ROOT.includes("/.")) {
      const vb = await v2.inject({ url: "/api/da-config/model/badolux" });
      expect(vb.statusCode).toBe(200);
      expect(vb.json()).toEqual(JSON.parse(readFileSync(ROOT + "src/public/configurator/badolux-model.json", "utf8")));
    } else await same("/api/da-config/model/badolux", false);
    await same("/api/da-config/model/other", false);
  });

  it("curtains: grouping, sizes, dedup, ring packs, cached image paths", async () => {
    const v = await same("/api/vorhang/products");
    expect(v.body.curtains.map((c: any) => c.articleNumber)).toEqual(["HEWIDV120200W", "HEWIDV140200W"]);
  });

  it("bathtubs: Iris parsing, freshest price, IRISNS accessory, online sets, sort order", async () => {
    const v = await same("/api/bathtubs/catalog");
    expect(v.body.items.find((x: any) => x.articleNumber === "IRIS160L2SWE").netPrice).toBe(1250);
    expect(v.body.items.find((x: any) => x.articleNumber === "IRIS170LFS").requires[0]).toMatchObject({ articleNumber: "IRISNS", netPrice: 80 });
  });
});

// ---------------- group 5d: Kalkulation, Arbeitsbericht, PDF preview, product images ----------------
describe("contract: Kalkulation, Arbeitsbericht, PDF preview, product images (ported, fake PDF engine on both sides)", () => {
  const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
  const payloads = [offers.find((o) => o.offerType === "bu" && o.payload?.Kundendaten?.payer === "Kassenkunde"), offers.find((o) => o.offerType === "bu" && o.payload?.Kundendaten?.payer === "Selbstzahler"), offers.find((o) => o.offerType === "bwt")]
    .filter(Boolean).map((o) => JSON.parse(JSON.stringify(o.payload)));
  const ids = (s: string) => s.replace(/CALC[-_]\d{4}/g, "<CALC>").replace(/ARB[-_]\d{6}/g, "<ARB>");
  const call = async (app: "legacy" | "v2", url: string, body: unknown, headers: Record<string, string> = { authorization: `Bearer ${token}` }) => {
    const h = { ...headers, "content-type": "application/json" };
    let status: number, type: string, disp: string, raw: Buffer;
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method: "POST", headers: h, body: JSON.stringify(body) });
      status = r.status; type = r.headers.get("content-type") ?? ""; disp = r.headers.get("content-disposition") ?? ""; raw = Buffer.from(await r.arrayBuffer());
    } else {
      const r = await v2.inject({ method: "POST", url, headers: h, payload: body as any });
      status = r.statusCode; type = String(r.headers["content-type"] ?? ""); disp = String(r.headers["content-disposition"] ?? ""); raw = r.rawPayload;
    }
    const base = type.split(";")[0]!.toLowerCase();
    let view: unknown;
    if (base.includes("wordprocessingml")) view = JSON.parse(ids(JSON.stringify(normaliseDocx(raw))));
    else if (base === "application/json") { const j = JSON.parse(raw.toString("utf8")); view = app === "v2" && j?.error && typeof j.error === "object" ? { ...j, error: j.error.message } : j; view = JSON.parse(ids(JSON.stringify(view))); }
    else view = ids(raw.toString("utf8"));
    return { status, type: base, disp: ids(disp), view };
  };
  const same = async (url: string, body: unknown, headers?: Record<string, string>) => {
    const l = await call("legacy", url, structuredClone(body), headers), v = await call("v2", url, structuredClone(body), headers);
    expect(v, url).toEqual(l);
    return v;
  };

  it.each(payloads.map((p, i) => [i, p]))("Kalkulation preview/debug/docx/pdf/pdf-v2 (payload %s)", async (_i, p) => {
    for (const ep of ["/kalkulation/preview", "/kalkulation/debug", "/kalkulation/docx", "/kalkulation/pdf", "/kalkulation/pdf-v2"]) {
      const v = await same(ep, p);
      expect(v.status, ep).toBe(200);
    }
  }, 180000);

  it.each(payloads.map((p, i) => [i, p]))("Arbeitsbericht docx/pdf on both mounts (payload %s)", async (_i, p) => {
    for (const ep of ["/api/arbeitsbericht/docx", "/api/arbeitsbericht/pdf", "/arbeitsbericht/docx"]) expect((await same(ep, p)).status, ep).toBe(200);
  }, 180000);

  it("Arbeitsbericht external: API key on /api mount, selectors, not found", async () => {
    const K = { "x-api-key": "ext-test-key" };
    const offerNo = offers.find((o) => o.offerNumber)!.offerNumber;
    const draftId = String((await mongoose.connection.db!.collection("drafts").findOne({}))!._id);
    await same("/api/arbeitsbericht/external/pdf", { kind: "offer", offerNumber: offerNo }, {});
    for (const sel of [{ kind: "offer", offerNumber: offerNo }, { kind: "draft", id: draftId }, { kind: "offer" }, { kind: "offer", offerNumber: "NOPE" }, { kind: "x" }])
      await same("/api/arbeitsbericht/external/pdf", sel, K);
  }, 180000);

  it("PDF preview", async () => { expect((await same("/api/docx/pdf-preview", payloads[0])).status).toBe(200); }, 120000);

  it("product images: list, preview (with exclusions), empty → 204", async () => {
    for (const p of payloads) {
      const list = await same("/api/email/product-image-list", { payload: p });
      expect(list.status).toBe(200);
      const first = (list.view as any).products?.[0]?.productId;
      await same("/api/email/preview-product-image-pdf", { payload: p });
      if (first) await same("/api/email/preview-product-image-pdf", { payload: p, excludeProductImageIds: [first] });
    }
    await same("/api/email/preview-product-image-pdf", { payload: {} });
  }, 180000);
});

// ---------------- 5d (found later): Materialübersicht carts, request summary PDF, HL offer parser ----------------
describe("contract: Materialübersicht carts/online orders/PDF, /pdf summary, HL offer parser", () => {
  const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
  const payloads = offers.filter((o) => ["bu", "bwt"].includes(o.offerType)).slice(0, 4).map((o) => JSON.parse(JSON.stringify(o.payload)));
  const pdfText = async (buf: Buffer) => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join("|"));
    return pages;
  };
  const call = async (app: "legacy" | "v2", url: string, body: BodyInit | object, headers: Record<string, string> = {}) => {
    const h: Record<string, string> = { authorization: `Bearer ${token}`, ...headers };
    const isRaw = body instanceof FormData;
    let status: number, type: string, disp: string, raw: Buffer;
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method: "POST", headers: isRaw ? h : { ...h, "content-type": "application/json" }, body: isRaw ? body : JSON.stringify(body) });
      status = r.status; type = r.headers.get("content-type") ?? ""; disp = r.headers.get("content-disposition") ?? ""; raw = Buffer.from(await r.arrayBuffer());
    } else {
      let payload: any = body, hh = { ...h, "content-type": "application/json" };
      if (isRaw) { const req = new Request("http://x/", { method: "POST", body }); payload = Buffer.from(await req.arrayBuffer()); hh = { ...h, "content-type": req.headers.get("content-type")! }; }
      const r = await v2.inject({ method: "POST", url, headers: hh, payload });
      status = r.statusCode; type = String(r.headers["content-type"] ?? ""); disp = String(r.headers["content-disposition"] ?? ""); raw = r.rawPayload;
    }
    const base = type.split(";")[0]!.toLowerCase();
    let view: unknown;
    if (base.includes("wordprocessingml")) view = normaliseDocx(raw);
    else if (base === "application/json") { const j = JSON.parse(raw.toString("utf8")); view = app === "v2" && j?.error && typeof j.error === "object" ? { ...j, error: j.error.message } : j; }
    else if (base === "application/pdf" && raw.subarray(0, 80).toString().includes("fake")) view = raw.toString(); // fake engine bytes
    else if (base === "application/pdf") view = (await pdfText(raw)).map((t) => t.replace(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/g, "<NOW>")); // pdfkit: compare text (bytes carry a creation date)
    else view = raw.toString("utf8");
    return { status, type: base, disp: disp.replace(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}/, "<NOW>"), view };
  };
  const same = async (url: string, body: any, headers?: Record<string, string>) => {
    const l = await call("legacy", url, body instanceof FormData ? body : structuredClone(body), headers);
    const v = await call("v2", url, body instanceof FormData ? body : structuredClone(body), headers);
    expect(v, url).toEqual(l);
    return v;
  };

  it.each(payloads.map((p, i) => [i, p]))("Materialübersicht docx/pdf/carts/online orders (payload %s)", async (_i, p) => {
    for (const ep of ["/material-overview", "/material-overview/pdf", "/material-overview/hassmann-cart", "/material-overview/badolux-cart", "/material-overview/winwall-cart", "/material-overview/online-orders"]) {
      await same(ep, p);
    }
  }, 180000);

  it("/pdf request summary (pdfkit) — same text", async () => {
    const v = await same("/pdf", { bereich: { name: "Bad OG", flaeche: 6.5 }, duschwanne: { typ: "SLA", rutschfest: true }, wandverkleidung: { farbe: "weiß" }, optional: { handlauf: false } });
    expect(v.type).toBe("application/pdf");
    await same("/pdf", {});
  }, 60000);

  it("HL offer parser: no file → 400, non-PDF → 400, generated PDF → same parse", async () => {
    await same("/api/hl/parse-flexofit-offer", new FormData());
    const txt = new FormData(); txt.append("file", new Blob(["hallo"], { type: "text/plain" }), "angebot.txt");
    await same("/api/hl/parse-flexofit-offer", txt);
    const { default: PDFDocument } = await import("pdfkit");
    const pdf: Buffer = await new Promise((resolve) => {
      const d = new PDFDocument(); const chunks: Buffer[] = [];
      d.on("data", (c: Buffer) => chunks.push(c)); d.on("end", () => resolve(Buffer.concat(chunks)));
      d.fontSize(10).text("Angebot Nr. 4711").moveDown();
      for (const [pos, art, name, qty, price] of [["1", "FX-100", "Hebeanlage Sanifloor", "1", "1.234,00"], ["2", "FX-200", "Rohrset 32 mm", "2", "45,50"]])
        d.text(`${pos}   ${art}   ${name}   ${qty} Stk   ${price} €`);
      d.end();
    });
    const f = new FormData(); f.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "flexofit.pdf");
    const v = await same("/api/hl/parse-flexofit-offer", f);
    expect(v.status).toBe(200);
  }, 60000);
});

// ---------------- phase 6a: v2 serves today's UI (ADR 021) ----------------
describe("contract: web layer — same pages, files, redirects, security headers, CORS", () => {
  const HEADERS = ["content-type", "location", "content-security-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
    "origin-agent-cluster", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-dns-prefetch-control",
    "x-download-options", "x-frame-options", "x-permitted-cross-domain-policies", "x-xss-protection", "access-control-allow-origin",
    "access-control-allow-credentials", "access-control-expose-headers"];
  const get = async (app: "legacy" | "v2", url: string, h: Record<string, string> = {}, method = "GET") => {
    if (app === "legacy") {
      const r = await fetch(`http://127.0.0.1:${LEGACY_PORT}${url}`, { method, headers: h, redirect: "manual" });
      const body = Buffer.from(await r.arrayBuffer());
      return { status: r.status, headers: Object.fromEntries(HEADERS.map((k) => [k, r.headers.get(k)])), body };
    }
    const r = await v2.inject({ method: method as any, url, headers: h });
    return { status: r.statusCode, headers: Object.fromEntries(HEADERS.map((k) => [k, (r.headers[k] as string | undefined) ?? null])), body: r.rawPayload };
  };
  const norm = (x: { status: number; headers: Record<string, string | null>; body: Buffer }, json: boolean) => ({
    status: x.status,
    headers: { ...x.headers, "content-type": x.headers["content-type"]?.toLowerCase().replace(/\s/g, "") ?? null },
    body: json ? "<json>" : createHash("sha256").update(x.body).digest("hex"),
  });
  const same = async (url: string, h: Record<string, string> = {}, { method = "GET", bodyMatters = true } = {}) => {
    const l = await get("legacy", url, h, method), v = await get("v2", url, h, method);
    const isJson = !!l.headers["content-type"]?.includes("json");
    expect(norm(v, isJson || !bodyMatters), url).toEqual(norm(l, isJson || !bodyMatters));
    return { l, v };
  };
  const HTML = { accept: "text/html,application/xhtml+xml" };
  const COOKIE = () => ({ ...HTML, cookie: `net_session=${token}` });

  it("not logged in: pages redirect to /login (deep link keeps ?offer), login page and assets are public", async () => {
    await same("/", HTML);
    await same("/?offer=ANG2026-1", HTML);
    await same("/irgendwo/tief", HTML);
    { // login page: identical except the error-compat shim at the top of <head> (ADR 021)
      const l = await get("legacy", "/login", HTML), v = await get("v2", "/login", HTML);
      expect({ ...norm(v, true), body: v.body.toString() }).toEqual({ ...norm(l, true), body: injectHead(l.body.toString()) });
    }
    for (const f of ["/style.css", "/sw.js", "/manifest.webmanifest", "/login.js", "/configurator/boot.js", "/assets/logo.png"]) await same(f);
    // script.js: v2 serves it with the P7-4 confirm rewrites (ADR 022) — exactly legacy + rewrites
    {
      const l = await get("legacy", "/script.js"), v = await get("v2", "/script.js");
      expect({ ...norm(v, true), body: v.body.toString() }).toEqual({ ...norm(l, true), body: applyRewrites("script.js", l.body.toString()) });
    }
  });

  it("logged in: index, sub pages, SPA fallback, offline pricing sources", async () => {
    { // index: identical except v2's one add-on script tag before </body> (ADR 021)
      const l = await get("legacy", "/", COOKIE()), v = await get("v2", "/", COOKIE());
      expect({ ...norm(v, true), body: v.body.toString() }).toEqual({ ...norm(l, true), body: injectHead(l.body.toString()).replace("</body>", '<script src="/v2/addons/deal-link.js" defer></script>\n<script src="/v2/addons/local-store.js" defer></script>\n<script src="/v2/addons/deal-draft.js" defer></script>\n<script src="/v2/addons/ux.js" defer></script>\n<script src="/v2/addons/header.js" defer></script>\n<script src="/v2/addons/quickwins.js" defer></script>\n<script src="/v2/addons/send-guard.js" defer></script>\n<script src="/v2/addons/offer-record.js" defer></script>\n<script src="/v2/addons/kosten-edit.js" defer></script>\n</body>') });
    }
    { // admin page: + shim
      const l = await get("legacy", "/admin/", COOKIE()), v = await get("v2", "/admin/", COOKIE());
      expect({ ...norm(v, true), body: v.body.toString() }).toEqual({ ...norm(l, true), body: injectHead(l.body.toString()) });
    }
    // SPA fallback (any unknown app path) — legacy res.sendFile refuses dot-folder paths
    // (local worktrees under .claude/) → compare v2 with the file there. v2 adds its add-on script.
    {
      const v = await get("v2", "/irgendwo/tief", COOKIE());
      const html = injectHead(readFileSync(ROOT + "src/public/index.html", "utf8")).replace("</body>", '<script src="/v2/addons/deal-link.js" defer></script>\n<script src="/v2/addons/local-store.js" defer></script>\n<script src="/v2/addons/deal-draft.js" defer></script>\n<script src="/v2/addons/ux.js" defer></script>\n<script src="/v2/addons/header.js" defer></script>\n<script src="/v2/addons/quickwins.js" defer></script>\n<script src="/v2/addons/send-guard.js" defer></script>\n<script src="/v2/addons/offer-record.js" defer></script>\n<script src="/v2/addons/kosten-edit.js" defer></script>\n</body>');
      expect([v.status, v.body.toString()]).toEqual([200, html]);
    }
    // deal links are a v2 addition (ADR 006): /deal/<id> → /?deal=<id>
    expect((await get("v2", "/deal/9001", COOKIE())).headers.location).toBe("/?deal=9001");
    for (const f of ["/logic/pricing-core.js", "/logic/tray-search-core.js", "/logic/aufschlag-rules.js"]) {
      await same(f, { cookie: `net_session=${token}` });
      await same(f); // not public: 401 without a session
    }
  });

  it("dedicated static roots never fall back to the app page", async () => {
    // missing files: same status (legacy renders Express's own error page, v2 a plain "Not Found")
    expect((await get("v2", "/pdfjs/does-not-exist.js")).status).toBe((await get("legacy", "/pdfjs/does-not-exist.js")).status);
    if (ROOT.includes("/.")) { // legacy express.static refuses dot-folder roots locally (see above)
      const v = await get("v2", "/vendor/fontawesome/css/all.min.css");
      expect([v.status, v.headers["content-type"], v.body.equals(readFileSync(ROOT + "node_modules/@fortawesome/fontawesome-free/css/all.min.css"))]).toEqual([200, "text/css; charset=utf-8", true]);
    } else await same("/vendor/fontawesome/css/all.min.css");
    expect((await get("v2", "/vendor/fontawesome/nope.css")).status).toBe((await get("legacy", "/vendor/fontawesome/nope.css")).status);
  });

  it("CORS: allowed origin gets credentials + exposed header; unknown API path is JSON 404", async () => {
    await same("/api/health", { origin: "http://localhost:5173" }, { bodyMatters: false });
    await same("/api/gibt-es-nicht", { origin: "https://oc.emc2.de", cookie: `net_session=${token}` });
  });
});
