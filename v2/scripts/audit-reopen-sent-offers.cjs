// Audit (ADR 023, "still open"): what happens to an offer the OLD app sent when it is opened in
// today's view and saved again WITHOUT a change? The form rebuilds the offer; if the rebuilt offer
// counts as "changed", the server refuses the save (409 OFFER_CHANGED) — and with it every resend.
//
// Works on a local COPY of the data copy only (never production):
//   docker start emc2-mongo-replica
//   mongosh: copy KonfiguratorDB → oc_audit   (aggregate $out per collection)
//   MONGODB_DB=oc_audit … node v2/apps/server/dist/server.js      (as v2/scripts/preview.sh, other database)
//   node v2/scripts/audit-reopen-sent-offers.cjs <result.json> [offers per type, default 12]
//
// Resumable: offers already in <result.json> are skipped (this Mac crashes Node now and then).
// Customer data never reaches the result: values under Kundendaten are written as their type.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const { chromium } = require(ROOT + "/node_modules/playwright");
const { MongoClient } = require(ROOT + "/v2/node_modules/mongodb");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const MONGO = process.env.AUDIT_MONGO || "mongodb://127.0.0.1:27018/?directConnection=true";
const SOURCE_DB = process.env.AUDIT_SOURCE_DB || "KonfiguratorDB"; // the untouched copy: what was stored
const [resultFile, perType = "12"] = process.argv.slice(2);
if (!resultFile) { console.error("usage: node v2/scripts/audit-reopen-sent-offers.cjs <result.json> [per type]"); process.exit(2); }
const p = `${Date.now() + 6 * 3600e3}:capture@local.test`;
const token = Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex");

// the server's own cleaning (sends/identity.ts), repeated here to NAME what differs
const WF = new Set(["mail", "post", "postal", "zusammenfassung", "docSelection", "pricing", "forceRecompute", "bitrixDealId", "bitrixContactId", "dealId", "contactId", "auftragId", "offerNumber", "activeOffer", "offerType"]);
const AP = new Set(["ansprechpartner", "emc2_contact"]);
function clean(v, top, inK) {
  if (v === null || v === undefined || v === "" || v === false) return undefined;
  if (typeof v === "string") { const t = v.trim(); return t === "" ? undefined : t; }
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) { const o = v.map((x) => clean(x, false)).filter((x) => x !== undefined); return o.length ? o : undefined; }
  if (typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) { if (top && WF.has(k)) continue; if (inK && AP.has(k)) continue; const c = clean(v[k], false, top && k === "Kundendaten"); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}
const show = (where, v) => (v === undefined ? "∅" : where.startsWith("Kundendaten") ? `<${typeof v}>` : JSON.stringify(v).slice(0, 60));
const diff = (a, b, where, out) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], where ? where + "." + k : k, out); }
  else out.push([where, show(where, a), show(where, b)]);
};
const differences = (stored, now) => { const d = []; diff(clean(stored, true) ?? {}, clean(now, true) ?? {}, "", d); return d; };

(async () => {
  const { offerIdentity } = await import(ROOT + "/v2/apps/server/dist/modules/sends/identity.js");
  const c = await MongoClient.connect(MONGO);
  const src = c.db(SOURCE_DB);
  const sent = new Set([
    ...(await src.collection("emaillogs").distinct("offerNumber")),
    ...(await src.collection("postalsends").distinct("offerNumber", { sentAt: { $ne: null } })),
    ...(await src.collection("signingrequests").distinct("offerNumber", { "documents.status": "signed" })),
  ]);
  const all = await src.collection("offers").find({ offerNumber: { $in: [...sent] } }, { projection: { offerNumber: 1, offerType: 1 } }).sort({ updatedAt: -1 }).toArray();
  const by = {};
  for (const o of all) (by[o.offerType || "-"] ??= []).push(o.offerNumber);
  console.log("sent offers by type:", JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length]))));
  const spread = (a, n) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor((i * a.length) / n)]));
  const sample = Object.entries(by).flatMap(([t, a]) => spread(a, Number(perType)).map((nr) => [t, nr]));
  const STORED = {};
  for (const [, nr] of sample) STORED[nr] = (await src.collection("offers").findOne({ offerNumber: nr })).payload;
  await c.close();

  const ready = async (nr) => {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(`${BASE}/api/offers/${encodeURIComponent(nr)}`, { headers: { cookie: "net_session=" + token } })).status === 200) return true; } catch { /* server or database restarting */ }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  };
  const out = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, "utf8")).filter((r) => !r.err) : [];
  const browser = await chromium.launch({ headless: true });
  const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  for (const [type, nr] of sample) {
    if (out.some((r) => r.nr === nr)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
    await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
    const page = await ctx.newPage();
    const row = { type, nr };
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
    page.on("dialog", (d) => { d.accept().catch(() => {}); });
    await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
    await page.route("**/api/planning/**", (r) => r.abort());
    let body = null, status = null, answer = null;
    page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/offers") { try { body = r.postDataJSON(); } catch { /* not JSON */ } } });
    page.on("response", async (r) => { if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/offers") { status = r.status(); try { answer = await r.json(); } catch { /* no body */ } } });
    try {
      if (!(await ready(nr))) throw new Error("server not ready");
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.waitForTimeout(800);
      row.loaded = await page.evaluate((n) => loadOfferByNumber(n), nr); // eslint-disable-line no-undef
      if (!row.loaded) throw new Error("not loaded: " + errs.slice(0, 3).join(" | "));
      await page.waitForTimeout(2500);
      // walk through every step like a user on the way to the last page
      row.steps = await page.evaluate(async () => { const st = (typeof getFlowSteps === "function" ? getFlowSteps() : []) || []; for (const x of st) { try { window.setStep(x); } catch { /* step not there */ } await new Promise((r) => setTimeout(r, 350)); } return st.length; }); // eslint-disable-line no-undef
      await page.waitForTimeout(1500);
      await page.evaluate(() => saveFinalOfferSnapshot().catch((e) => String(e))); // eslint-disable-line no-undef
      await page.waitForTimeout(1500);
      row.savedAs = body?.offerNumber;
      row.status = status;
      row.code = answer?.error?.code;
      if (body?.payload) {
        row.sameHash = offerIdentity(STORED[nr], nr).contentHash === offerIdentity(body.payload, nr).contentHash;
        if (!row.sameHash) row.diff = differences(STORED[nr], body.payload);
      }
    } catch (e) { row.err = String(e.message || e).slice(0, 240); }
    out.push(row);
    await ctx.close();
    fs.writeFileSync(resultFile, JSON.stringify(out, null, 1));
    console.log(JSON.stringify({ type, nr: nr.slice(-6), loaded: row.loaded, sameHash: row.sameHash, status: row.status, code: row.code, err: row.err }));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
