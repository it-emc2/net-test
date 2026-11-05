// API contract test: the LEGACY Express app (spawned as a real process) and the v2 server
// run against the SAME in-memory MongoDB and answer the same requests. Success bodies must be
// identical; errors must match in status code and German message. A session token issued by
// the legacy login must be accepted by v2 (cut-over keeps everybody logged in).
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
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
      VIGOR_MONGODB_URI: uri, AUTH_SECRET: SECRET, BITRIX_WEBHOOK_BASE: `${DEAD}/rest/0/x/`, SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "9", PLANNING_API_BASE_URL: DEAD, EXTERNAL_API_BASE: DEAD, OB24_BASE_URL: DEAD, ORS_API_KEY: "",
    },
    stdio: "ignore",
  });
  // never leave the legacy server running if this worker dies
  process.once("exit", () => { try { legacy.kill("SIGKILL"); } catch { /* already gone */ } });
  await waitFor(`http://127.0.0.1:${LEGACY_PORT}/api/health`);

  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: uri, MONGODB_DB: "KonfiguratorDB", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  v2 = await buildApp(cfg, { register: (a) => registerApi(a, { cfg }) });

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
