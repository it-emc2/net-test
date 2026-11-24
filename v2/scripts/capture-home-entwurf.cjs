// Records today's Hauptmenü search („Öffnen“ — P7-1 over „Schnellsuche in Entwürfen + Angeboten“,
// script.js initGlobalOfferSearchUI / renderGlobalOfferSearchResults / loadGlobalOfferSearchResult)
// and the pick list of a Bitrix contact's deals (script.js fetchAndSetDeal, summary widget „Deal:“).
// Reference for apps/web/test/home-entwurf.test.tsx (ADR 026, phase 4; Hauptmenü, check level Full).
//
// The search runs against the REAL server and a seeded local database (only test customers, made
// up here: seedDocs). Bitrix and the planning service are answered here with made-up data.
//
//   node ~/emc2-local/suche/seed-suche.mjs <worktree>      (wipes and seeds oc_suche)
//   bash ~/emc2-local/suche/serve.sh <worktree> &            (:3000, MONGODB_DB=oc_suche)
//   CAPTURE_BASE=http://localhost:3000 node v2/scripts/capture-home-entwurf.cjs
//     → v2/apps/web/test/fixtures/home-entwurf.json        (ONLY=<name> runs one scenario)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3000";
const DB = process.env.CAPTURE_DB || "oc_suche";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "home-entwurf.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

// ---------- the test data (made up; test customers only) ----------
const oid = (n) => `6b00000000000000000000${String(n).padStart(2, "0")}`;
const at = (d) => new Date(d);
const ERIKA = { salutation: "Frau", firstName: "Erika", lastName: "Muster", street: "Teststraße 1", postalCode: "95028", city: "Hof", phone: "0170 0000001", email: "kunde@example.test" };
const MAX = { salutation: "Herr", firstName: "Max", lastName: "Muster", street: "Probeweg 2", postalCode: "95100", city: "Selb", phone: "0170 0000002", email: "kunde@example.test" };
/** a legacy payload of `type` for a customer; `deal`: the deal number as today's UI stores it */
function payloadOf(bases, type, who, { deal = "", offerNumber = "", extra = {} } = {}) {
  const b = JSON.parse(JSON.stringify(bases[type] || { activeOffer: type }));
  b.activeOffer = type;
  b.offerNumber = offerNumber;
  b.Kundendaten = { ...(b.Kundendaten || {}), ...who, bitrixContactId: "", customerNumber: "", emc2_contact: "", ansprechpartner: "" };
  delete b.ourSignatureUser;
  if (deal) { b.auftragId = deal; b.postal = { ...(b.postal || {}), auftragId: deal }; b.mail = { ...(b.mail || {}), auftragId: deal }; }
  else { delete b.auftragId; if (b.postal) b.postal.auftragId = ""; if (b.mail) b.mail.auftragId = ""; }
  return Object.assign(b, extra);
}
function seedDocs(bases) {
  const draft = (n, name, type, who, opts, day) => ({ _id: oid(n), name, offerType: type, payload: payloadOf(bases, type, who, opts), ...(opts.offerNumber ? { offerNumber: opts.offerNumber } : {}), savedAt: at(day), createdAt: at(day), updatedAt: at(day) });
  const offer = (n, number, type, who, deal, day) => ({
    _id: oid(n), offerNumber: number, offerType: type, payload: payloadOf(bases, type, who, { deal, offerNumber: number }), pricing: { total: 1000 }, locked: true,
    customer: { salutation: who.salutation, firstName: who.firstName, lastName: who.lastName, phone: who.phone, email: who.email, customerNumber: "", city: who.city, postalCode: who.postalCode },
    createdAt: at(day), updatedAt: at(day),
  });
  const drafts = [
    draft(1, "ANG-BU-Erika-Muster-01112026-100000", "bu", ERIKA, { deal: "70011" }, "2026-11-01T09:00:00Z"),
    draft(2, "ANG-HL-Max-Muster-02112026-110000", "hl", MAX, { offerNumber: "ANG2026-1102-110000", extra: { Anfragedetails: { Anfragedetails: "Rampe am Hauseingang gewünscht" } } }, "2026-11-02T10:00:00Z"),
    { _id: oid(3), name: "ANG-HMS-Erika-Muster-03112026-120000", offerType: "hms", payload: { activeOffer: "hms", Kundendaten: { ...ERIKA } }, savedAt: at("2026-11-03T11:00:00Z"), createdAt: at("2026-11-03T11:00:00Z"), updatedAt: at("2026-11-03T11:00:00Z") },
    draft(4, "ANG-BWT-Max-Muster-04112026-090000", "bwt", MAX, { deal: "70014" }, "2026-11-04T08:00:00Z"),
  ];
  const offers = [
    offer(11, "ANG2026-1105-100000", "bu", ERIKA, "70015", "2026-11-05T09:00:00Z"),
    offer(12, "ANG2026-1106-100000", "bwt", MAX, "70016", "2026-11-06T09:00:00Z"),
    { ...offer(13, "ANG2026-1107-100000", "bu", ERIKA, "", "2026-11-07T09:00:00Z"), offerType: "wd", payload: { activeOffer: "wd", offerNumber: "ANG2026-1107-100000", Kundendaten: { ...ERIKA } } },
  ];
  const sends = [{
    sendId: "s-0000000000000000000000000001", channel: "email", status: "done", by: "capture@local.test", dealId: "70016", variantId: "", offerNumber: "ANG2026-1106-100000", offerType: "bwt",
    to: "kunde@example.test", subject: "Ihr Angebot", payload: null, pricing: null, files: [], steps: {}, startedAt: at("2026-11-06T09:05:00Z"), finishedAt: at("2026-11-06T09:05:10Z"),
  }];
  return { drafts, offers, sends };
}

// ---------- Bitrix (made up) ----------
const CONTACT = (id, who) => ({ ID: String(id), NAME: who.firstName, LAST_NAME: who.lastName, HONORIFIC: { STATUS_ID: who.salutation === "Frau" ? "HNR_DE_1" : "HNR_DE_2" }, EMAIL: [{ VALUE: who.email }], PHONE: [{ VALUE: who.phone }], ADDRESS: who.street, ADDRESS_CITY: who.city, ADDRESS_POSTAL_CODE: who.postalCode });
const DEALS = {
  several: [{ id: "70021", title: "Badumbau Muster" }, { id: "70022", title: "Handlauf Muster" }, { id: "70023", title: "" }],
  one: [{ id: "70021", title: "Badumbau Muster" }],
  none: [],
};

// kind: "search" (type, look) · "open" (type, tap a row, look at what opened) · "pick" (contact's deals)
const SCENARIOS = {
  "search by name, several results": { kind: "search", q: "Muster" },
  "search by offer number": { kind: "search", q: "ANG2026-1106" },
  "search by text in the request details": { kind: "search", q: "rampe" },
  "search with accents folded": { kind: "search", q: "müster" },
  "search with first and last name: no field holds both": { kind: "search", q: "Erika Muster" },
  "no result": { kind: "search", q: "Zzyzx" },
  "search fails": { kind: "search", q: "Muster", fail: true },
  "hms and wd results": { kind: "search", q: "Erika" },
  "open a draft (deal number, no autosaved draft yet)": { kind: "open", q: "Muster", row: { _type: "draft", name: "ANG-BU-Erika-Muster-01112026-100000" }, deal: "70011" },
  "open a stored offer (not sent)": { kind: "open", q: "ANG2026-1105", row: { _type: "offer", offerNumber: "ANG2026-1105-100000" }, deal: "70015" },
  "open a sent offer": { kind: "open", q: "ANG2026-1106", row: { _type: "offer", offerNumber: "ANG2026-1106-100000" }, deal: "70016" },
  "open a draft whose deal has a different autosaved draft": { kind: "open", q: "Max", row: { _type: "draft", name: "ANG-BWT-Max-Muster-04112026-090000" }, deal: "70014", autosaved: { notes: "Stand vom Gerät" } },
  "open a draft without deal number": { kind: "open", q: "rampe", row: { _type: "draft", name: "ANG-HL-Max-Muster-02112026-110000" }, deal: "" },
  "open an hms draft": { kind: "open", q: "Erika", row: { _type: "draft", name: "ANG-HMS-Erika-Muster-03112026-120000" }, deal: "" },
  "contact with several deals: pick list": { kind: "pick", deals: "several", pick: "70022" },
  "contact with one deal": { kind: "pick", deals: "one" },
  "contact without deals": { kind: "pick", deals: "none" },
  "contact deals cannot be loaded": { kind: "pick", deals: "fail" },
  "appointment without deal, contact with several deals": { kind: "pick", deals: "several", planning: true, pick: "70023" },
};
/** the fields of a search-all row that today's UI reads (the rest — the whole payload — is left out of the fixture) */
const ROW_KEYS = ["_type", "_id", "id", "draftId", "source", "collection", "kind", "isDraft", "type", "name", "customerName", "title", "offerNumber", "angNumber", "number", "angebotNummer", "offerType", "activeOffer", "updatedAt", "createdAt", "date", "snippet", "summary", "preview", "dealId", "firstName", "lastName", "city"];
const slim = (row) => Object.fromEntries(ROW_KEYS.filter((k) => k in row).map((k) => [k, row[k]]).concat([["auftragId", row.payload?.auftragId ?? row.payload?.postal?.auftragId ?? ""]]));

module.exports = { SCENARIOS, seedDocs, CONTACT, DEALS, ERIKA, MAX, slim };

if (require.main === module) (async () => {
  const { chromium } = require("../../node_modules/playwright");
  const mongoose = require("mongoose");
  if (DB === "oc_preview") throw new Error("refusing oc_preview");
  await mongoose.connect(process.env.CAPTURE_MONGO || "mongodb://127.0.0.1:27018/?directConnection=true", { dbName: DB });
  const db = mongoose.connection.db;
  const token = (() => {
    const p = `${Date.now() + 3600e3}:capture@local.test`;
    return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex");
  })();
  // CAPTURE_ARGS e.g. "--host-resolver-rules=MAP localhost [::1]" when the server listens on ::1 only
  const browser = await chromium.launch({ headless: true, args: process.env.CAPTURE_ARGS ? [process.env.CAPTURE_ARGS] : [] });
  const API = process.env.CAPTURE_API || BASE; // direct calls of this script (setup)
  const out = { note: "generated by v2/scripts/capture-home-entwurf.cjs — do not edit", scenarios: [] };
  const only = process.env.ONLY;
  for (const [name, s] of Object.entries(SCENARIOS)) {
    if (only && name !== only) continue;
    for (let attempt = 1; ; attempt++) {
      try { out.scenarios.push(await run(name, s)); console.log(name, "✓"); break; } catch (e) { console.log(name, "attempt", attempt, String(e).slice(0, 300)); if (attempt >= 4) throw e; }
    }
  }
  await browser.close();
  await mongoose.disconnect();
  // a number today's UI gives a draft when it opens is the time of the run: masked
  const seeded = new Set(["ANG2026-1102-110000", "ANG2026-1105-100000", "ANG2026-1106-100000", "ANG2026-1107-100000"]);
  const masked = JSON.stringify(out, null, 2).replace(/ANG\d{4}-\d{4}-\d{6}/g, (n) => (seeded.has(n) ? n : "ANG<neu>"));
  if (!only) fs.writeFileSync(OUT, masked + "\n");
  else console.log(JSON.stringify(out.scenarios, null, 2));

  async function run(name, s) {
    await db.collection("deal_drafts").deleteMany({});
    await db.collection("deal_draft_revisions").deleteMany({});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
    await ctx.addCookies([{ name: "net_session", value: token, url: BASE }, ...(API !== BASE ? [{ name: "net_session", value: token, url: API }] : [])]);
    const page = await ctx.newPage();
    const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
    const seen = [];
    const answers = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (!/^\/api\/(offers|drafts|deals|bitrix\/contact)/.test(u.pathname)) return;
      if (/\/sends$|\/related$|\/variants$|\/revisions/.test(u.pathname)) return;
      let body; try { body = r.postDataJSON(); } catch { body = undefined; }
      seen.push({ method: r.method(), path: u.pathname + u.search, ...(body && body.baseRevision !== undefined ? { baseRevision: body.baseRevision } : {}) });
    });
    await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
    await page.route("**/api/planning/**", (r) => (/current$/.test(r.request().url()) && s.planning ? r.fulfill(json(require("./capture-home-planung.cjs").weekPayload())) : r.fulfill(json({}))));
    await page.route("**/api/bitrix/activities/today", (r) => r.fulfill(json({ byDealId: {} })));
    await page.route("**/api/bitrix/log-action", (r) => r.fulfill(json({ ok: true })));
    await page.route("**/api/bitrix/contact/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      if (/\/deals$/.test(p)) return s.deals === "fail" ? r.fulfill(json({ error: { code: "BITRIX_ERROR", message: "x", requestId: "c" } }, 500)) : r.fulfill(json({ deals: DEALS[s.deals] || [] }));
      const id = p.split("/").pop();
      return r.fulfill(json({ result: CONTACT(id, ERIKA) }));
    });
    await page.route("**/api/bitrix/deal/**", (r) => r.fulfill(json({ error: "x" }, 502)));
    await page.route("**/api/offers/search-all**", async (r) => {
      if (s.fail) return r.fulfill(json({ error: { code: "INTERNAL", message: "x", requestId: "c" } }, 500));
      const res = await r.fetch();
      const body = await res.json();
      const u = new URL(r.request().url());
      answers.push({ q: u.searchParams.get("q"), limit: u.searchParams.get("limit"), rows: body.map(slim) });
      return r.fulfill({ response: res, body: JSON.stringify(body) });
    });
    page.on("dialog", (d) => d.accept().catch(() => {}));
    if (s.autosaved) {
      const d = await db.collection("drafts").findOne({ name: s.row.name });
      const payload = { ...d.payload, Kundendaten: { ...d.payload.Kundendaten, ...s.autosaved } };
      const r = await ctx.request.put(`${API}/api/deals/${s.deal}/draft`, { data: { offerType: d.offerType, payload, baseRevision: 0 } });
      if (!r.ok()) throw new Error("autosaved setup " + r.status() + " " + (await r.text()));
    }
    await page.goto(BASE + "/", { waitUntil: "load" });
    const rec = { name, kind: s.kind };

    if (s.kind === "search" || s.kind === "open") {
      const input = page.locator("#globalOfferSearchInput");
      await input.waitFor();
      await page.waitForTimeout(800);
      rec.heading = (await page.locator("#homeSearchHeading").textContent()).trim();
      rec.placeholder = await input.getAttribute("placeholder");
      seen.length = 0;
      await input.click();
      await input.pressSequentially(s.q, { delay: 60 });
      const results = page.locator("#globalOfferSearchResults");
      await page.waitForFunction(() => { const el = document.getElementById("globalOfferSearchResults"); return el && !el.hidden && !/Suche läuft/.test(el.textContent); }, null, { timeout: 8000 });
      await page.waitForTimeout(400);
      rec.q = s.q;
      rec.searchRequests = seen.filter((x) => x.path.startsWith("/api/offers/search-all")).map((x) => x.path);
      rec.answer = answers.at(-1) || null;
      rec.view = await results.evaluate((el) => ({
        status: (el.querySelector(".home-search-status, .home-search-empty")?.textContent || "").trim(),
        rows: [...el.querySelectorAll(".home-search-result")].map((b) => ({
          title: b.querySelector(".home-search-result__title")?.textContent.trim() || "",
          badges: [...b.querySelectorAll(".home-search-badge")].map((x) => x.textContent.trim()),
          meta: (b.querySelector(".home-search-result__meta")?.textContent || "").replace(/\s+/g, " ").trim(),
          snippet: b.querySelector(".home-search-result__snippet")?.textContent.trim() || "",
          active: b.classList.contains("is-active"),
        })),
      }));
      if (s.kind === "open") {
        const rows = rec.answer.rows;
        const idx = rows.findIndex((r) => Object.entries(s.row).every(([k, v]) => r[k] === v));
        if (idx < 0) throw new Error("row not found");
        rec.opened = idx;
        seen.length = 0;
        await results.locator(".home-search-result").nth(idx).click();
        await page.waitForTimeout(6000); // restore + autosave (2.5 s) + the save
        rec.after = await page.evaluate(async (deal) => {
          const val = (id) => (document.getElementById(id)?.value ?? null);
          const q = new URLSearchParams(location.search);
          const key = val("auftragId") || q.get("deal") || q.get("entwurf") || "";
          let server = null;
          if (key) { const r = await fetch(`/api/deals/${encodeURIComponent(key)}/draft`); const b = await r.json(); server = r.ok ? { revision: b.revision, offerType: b.offerType, notes: b.payload?.Kundendaten?.notes ?? "", offerNumber: b.payload?.offerNumber ?? "" } : { status: r.status }; }
          return {
            step: location.hash.replace("#", ""),
            offerType: String(window.getCurrentOfferType?.() || ""),
            sent: document.body.classList.contains("is-sent-offer"),
            sentBar: (document.getElementById("sentOfferBar")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
            firstName: val("firstName"), lastName: val("lastName"), auftragId: val("auftragId"), offerNumber: val("offerNumber"),
            address: q.has("entwurf") ? "entwurf=t-…" : q.has("deal") ? `deal=${q.get("deal")}` : "",
            server, expectedDeal: deal,
          };
        }, s.deal);
        rec.requests = seen.map((x) => ({ ...x, path: x.path.replace(/t-[0-9a-f]{24}/, "t-…").replace(/\/api\/drafts\/[0-9a-f]{24}/, "/api/drafts/<id>") }));
      }
    } else {
      // „Kontakt aus Bitrix laden“ on a new Badumbau, or an appointment without a deal
      if (s.planning) {
        await page.locator('#todayPlanningList .today-calendar-card[data-id="b2"]').waitFor();
        seen.length = 0;
        await page.locator('#todayPlanningList .today-calendar-card[data-id="b2"] .today-calendar-open').click();
        await page.locator('#planningOfferPickerCards [data-offer-key="bu"]').click();
      } else {
        await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
        await page.waitForFunction(() => location.hash === "#Kundendaten");
        await page.fill("#bitrixContactId", "5001");
        seen.length = 0;
        await page.click("#loadBitrixContactBtn");
      }
      await page.waitForTimeout(2500);
      const look = () => page.evaluate(() => {
        const row = document.getElementById("swDealRow"), v = document.getElementById("swDealValue");
        return {
          shown: !!row && row.style.display !== "none",
          label: row?.querySelector(".sw-label")?.textContent.trim() ?? "",
          value: v?.querySelector("button") ? "" : (v?.textContent || "").trim(),
          buttons: [...(v?.querySelectorAll("button") || [])].map((b) => b.textContent.trim()),
          auftragId: document.getElementById("auftragId")?.value ?? null,
          mailAuftragId: document.getElementById("mailAuftragId")?.value ?? null,
          postAuftragId: document.getElementById("postAuftragId")?.value ?? null,
        };
      });
      rec.deals = s.deals;
      rec.view = await look();
      rec.requests = seen.filter((x) => x.path.startsWith("/api/bitrix/contact")).map((x) => `${x.method} ${x.path}`);
      if (s.pick) {
        await page.locator("#swDealValue button", { hasText: s.pick }).click();
        await page.waitForTimeout(500);
        rec.picked = s.pick;
        rec.after = await look();
      }
    }
    await ctx.close();
    return rec;
  }
})().catch((e) => { console.error(e); process.exit(1); });
