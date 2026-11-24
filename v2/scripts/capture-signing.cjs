// Records today's customer signing page (src/public/signpage, served at /sign/<token>) — the
// reference for apps/web/test/signing.test.tsx (port-slice, check level Full: customer-facing,
// legally relevant). Every state of the page: loading a request, one or more documents, the
// signature drawn / typed / uploaded / copied, required fields, payment term, two signers, the
// second signature of the Zusatzblatt, partial and completed requests, expired / closed / unknown
// links, the "new link" request, server refusals and the "back to OC" link of a rep.
//
// Local only: a v2 server on http://localhost:3002 with its own database "oc_signing"
// (node v2/scripts/seed-signing.mjs) and every integration on a dead local port. The requests are
// created through the real POST /api/signing; the page's GETs (request, document HTML) are the
// real server answers; every POST of the page (signing a document, asking for a new link) is
// answered by this script (page.route) — nothing is signed, nothing leaves this computer.
// Payloads are the neutral golden fixtures. Tokens, today's date, the embedded pictures and the
// owner's name in the company line are masked.
//
//   bash <scratch>/run-server.sh (port 3002, MONGODB_DB=oc_signing), then
//   PLAYWRIGHT_MODULE=<main checkout>/node_modules/playwright node v2/scripts/capture-signing.cjs
//   → v2/apps/web/test/fixtures/signing.json      (ONLY=<name> records one scenario, RESUME=1 continues)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "signing.json");
const BASE = process.env.BASE || "http://localhost:3002";
const SECRET = "dev-only-auth-secret-change-me";

// ---- the requests (golden fixtures, neutral data) ----
const PAYLOADS = { SZ: ["ANG2026-1103-134214", "bu"], KASSE: ["ANG2026-1104-093242", "bu"], TWO: ["ANG2026-1103-130810", "bu"], AHK: ["Kassenkunde", "ah"], AHS: ["Selbstzahler", "ah"] };
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ERR = (code, message) => ({ error: { code, message, requestId: "req-1" } });

// setup: ["signed", ...keys] | ["completed"] | ["expired"] | ["closed"] | ["newLinkRequested"]
// acts: ["click", sel, nth?] · ["draw", sel] · ["fill", sel, text] · ["check", sel] · ["upload", sel, "png" | "txt"]
// answers: { "<METHOD> <path suffix>": [[status, body], …] } — script answers, in order (the page's POSTs
//   always; a GET only when listed: an error the real server cannot be made to give)
const SCENARIOS = {
  "sz: open": { req: "SZ" },
  "sz: submit without anything": { req: "SZ", acts: [["click", "#submitBtn"]] },
  "sz: payment chosen, no signature": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='1']"], ["click", "#submitBtn"]] },
  "sz: drawn and signed": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='1']"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "sz: typed name": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='0']"], ["click", "#toggleType"], ["fill", "#typeName", "Testkunde"], ["click", "#submitBtn"]] },
  "sz: typing chosen, no name": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='2']"], ["click", "#toggleType"], ["click", "#submitBtn"]] },
  "sz: typing, then back to drawing": { req: "SZ", acts: [["click", "#toggleType"], ["click", "#toggleUpload"], ["click", "#toggleUpload"]] },
  "sz: drawn, typing chosen, cleared": { req: "SZ", acts: [["draw", "#sigCanvas"], ["click", "#toggleType"], ["fill", "#typeName", "Testkunde"], ["click", "#clearSig"], ["click", "#toggleType"], ["check", "input[name=paymentTerm][value='0']"], ["click", "#submitBtn"]] },
  "sz: uploaded picture": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='1']"], ["click", "#toggleUpload"], ["upload", "#sigUpload", "png"], ["click", "#submitBtn"]] },
  "sz: upload chosen, no picture": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='1']"], ["click", "#toggleUpload"], ["click", "#submitBtn"]] },
  "sz: upload not a picture": { req: "SZ", acts: [["click", "#toggleUpload"], ["upload", "#sigUpload", "txt"]] },
  "sz: copy without signature": { req: "SZ", acts: [["click", "#copySig"]] },
  "sz: paste without copy": { req: "SZ", acts: [["click", "#pasteSig"]] },
  "sz: copy, clear, paste, sign": { req: "SZ", acts: [["draw", "#sigCanvas"], ["click", "#copySig"], ["click", "#clearSig"], ["click", "#pasteSig"], ["check", "input[name=paymentTerm][value='1']"], ["click", "#submitBtn"]] },
  "sz: drawn, then cleared": { req: "SZ", acts: [["check", "input[name=paymentTerm][value='1']"], ["draw", "#sigCanvas"], ["click", "#clearSig"], ["click", "#submitBtn"]] },
  "sz: completion fails (500)": { req: "SZ", answers: { "POST /documents/angebot": [[500, ERR("SIGNING_FAILED", "PDF-Erzeugung fehlgeschlagen")]] },
    acts: [["check", "input[name=paymentTerm][value='1']"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "sz: signed elsewhere (409), then again": { req: "SZ", answers: { "POST /documents/angebot": [[409, ERR("ALREADY_SIGNED", "Dokument wurde bereits unterschrieben")]] },
    acts: [["check", "input[name=paymentTerm][value='1']"], ["draw", "#sigCanvas"], ["click", "#submitBtn"], ["click", "#submitBtn"]] },
  "sz: payment refused by the server (400)": { req: "SZ", answers: { "POST /documents/angebot": [[400, ERR("BAD_REQUEST", "Bitte wählen Sie eine Zahlungsbedingung aus")]] },
    acts: [["check", "input[name=paymentTerm][value='1']"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "kasse: open (three documents)": { req: "KASSE" },
  "kasse: Angebot signed, Vollmacht next": { req: "KASSE", acts: [["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "kasse: Vollmacht with missing fields": { req: "KASSE", setup: [["signed", "angebot"]], acts: [["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "kasse: Vollmacht completed after Bearbeiten": { req: "KASSE", setup: [["signed", "angebot"]],
    acts: [["click", ".edit-toggle"], ["fill", "[data-edit-field=geburtsdatum]", "01.02.1940"], ["fill", "[data-edit-field=kk_versichertennr]", "A123456789"], ["fill", "[data-edit-field=phone]", "09281 000000"], ["click", ".edit-toggle"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "kasse: back to the Angebot and forward again": { req: "KASSE", acts: [["draw", "#sigCanvas"], ["click", "#submitBtn"], ["click", "#prevDoc"], ["click", "#nextDoc"]] },
  "kasse: reopened after the Angebot": { req: "KASSE", setup: [["signed", "angebot"]], acts: [["click", "#prevDoc"]] },
  "kasse: last document completes the request": { req: "KASSE", setup: [["signed", "angebot", "vollmacht"]],
    acts: [["click", ".edit-toggle"], ["fill", "[data-edit-field=geburtsdatum]", "01.02.1940"], ["fill", "[data-edit-field=kk_versichertennr]", "A123456789"], ["check", "input[name=pflegegrad][value='2']"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "kasse: Abtretung, Pflegegrad seit emptied": { req: "KASSE", setup: [["signed", "angebot", "vollmacht"]],
    acts: [["click", ".edit-toggle", 0], ["fill", "[data-edit-field=kk_pflegegradSeit]", ""], ["click", ".edit-toggle", 1], ["fill", "[data-edit-field=kk_krankenkasseAdresse]", ""], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "two persons: Vollmacht of person 1": { req: "TWO", setup: [["signed", "angebot"]] },
  "two persons: Vollmacht of person 2": { req: "TWO", setup: [["signed", "angebot", "vollmacht", "abtretung"]], acts: [["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "completed link": { req: "KASSE", setup: [["completed"]] },
  "every document signed, request not closed": { req: "KASSE", setup: [["signed", "angebot", "vollmacht", "abtretung"]] },
  "expired link": { req: "SZ", setup: [["expired"]] },
  "expired link: new link requested": { req: "SZ", setup: [["expired"]], answers: { "POST /request-new-link": [[200, { ok: true, taskId: 55 }]] }, acts: [["click", "#requestNewLink"]] },
  "expired link: request fails, then works": { req: "SZ", setup: [["expired"]],
    answers: { "POST /request-new-link": [[502, ERR("BITRIX_FAILED", "Anfrage konnte nicht übermittelt werden. Bitte rufen Sie uns an.")], [200, { ok: true, already: true }]] },
    acts: [["click", "#requestNewLink"], ["click", "#requestNewLink"]] },
  "expired link: new link asked for before": { req: "SZ", setup: [["expired"], ["newLinkRequested"]] },
  "link closed by the signature of another variant": { req: "KASSE", setup: [["closed"]] },
  "unknown link": { req: null },
  "server error on open": { req: "SZ", answers: { "GET ": [[500, ERR("SIGNING_FAILED", "Datenbank nicht erreichbar")]] } },
  "document cannot be loaded": { req: "SZ", answers: { "GET /documents/angebot/html": [[500, ERR("SIGNING_FAILED", "Dokumentenerzeugung für die Online-Unterschrift ist in v2 noch nicht verfügbar")]] } },
  "rep with a session: back link": { req: "SZ", rep: true },
  "ah kasse: Angebot signed": { req: "AHK", acts: [["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "ah: Zusatzblatt, Bevollmächtigte/r without signature": { req: "AHK", setup: [["signed", "angebot"]],
    acts: [["click", ".edit-toggle"], ["fill", "[data-edit-field=bevollmaechtigterName]", "Testbevollmächtigte"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
  "ah: Zusatzblatt with both signatures and invoice by post": { req: "AHK", setup: [["signed", "angebot"]],
    acts: [["click", ".edit-toggle"], ["fill", "[data-edit-field=bevollmaechtigterName]", "Testbevollmächtigte"], ["fill", "[data-edit-field=bevollmaechtigterTelefon]", "0000 111"], ["draw", "#sigCanvas"], ["draw", "#sigCanvas2"], ["check", "#rechnungPostCheckbox"], ["click", "#submitBtn"]] },
  "ah selbstzahler: Zusatzblatt without Bevollmächtigte/r": { req: "AHS", setup: [["signed", "angebot"]], acts: [["check", "#rechnungEmailCheckbox"], ["click", "#toggleType2"], ["draw", "#sigCanvas"], ["click", "#submitBtn"]] },
};

if (require.main !== module) { module.exports = { SCENARIOS }; return; } // the test data only

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || process.env.PLAYWRIGHT || path.join(ROOT, "node_modules", "playwright"));
const mongoose = require(path.join(ROOT, "v2", "node_modules", "mongoose"));
const { EJSON } = require(path.join(ROOT, "v2", "node_modules", "bson"));
const offers = EJSON.parse(fs.readFileSync(path.join(ROOT, "tests/golden/fixtures/docs-db/offers.json"), "utf8"));
const ahs = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/golden/fixtures/ah/payloads.json"), "utf8"));
const payloadOf = (k) => {
  const [id, type] = PAYLOADS[k];
  const p = type === "ah" ? ahs.find((x) => x.payload.Kundendaten?.payer === id).payload : offers.find((o) => o.offerNumber === id).payload;
  return [JSON.parse(JSON.stringify(p)), type];
};
const session = (() => {
  const p = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex");
})();

// ---- masking: tokens, today's date, pictures, the owner's name in the company line ----
const FAKE = (i) => "f".repeat(40) + String(i).padStart(8, "0");
const today = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
const scrub = (s, tok, i) => {
  let out = String(s);
  if (tok) out = out.split(tok).join(FAKE(i));
  return out
    .replace(/data:image\/(?:png|jpe?g|gif|svg\+xml);base64,[A-Za-z0-9+/=]{200,}/g, "data:image/png;base64," + PNG_1PX)
    .split(today).join("<HEUTE>")
    .replace(/(EmC2(?:\s|<br\s*\/?>)+)[A-ZÄÖÜ][a-zäöüß]+(\s+)[A-ZÄÖÜ][a-zäöüß]+/g, "$1Inhaber$2Name");
};
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
/** the request body as compared: every signature image (always a PNG) stands as "<png>" */
const bodyOf = (raw) => {
  if (raw == null || raw === "") return null;
  let b; try { b = JSON.parse(raw); } catch { return raw; }
  const png = (v) => (typeof v === "string" && PNG_URL.test(v) ? "<png>" : v);
  if (b && typeof b === "object") {
    if ("signatureImage" in b) b.signatureImage = png(b.signatureImage);
    if (b.extraFields && "bevollmaechtigterSignature" in b.extraFields) b.extraFields.bevollmaechtigterSignature = png(b.extraFields.bevollmaechtigterSignature);
  }
  return b;
};

// ---- what the customer sees (outside the document's own text, which is the server's HTML) ----
function viewOf() {
  const $ = (s) => document.querySelector(s);
  const shown = (el) => !!el && el.checkVisibility();
  const text = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  const screen = ["loading", "fatal", "expired", "app"].find((id) => shown(document.getElementById(id))) || null;
  const v = { screen };
  if (screen === "fatal") v.fatal = text($("#fatal"));
  if (screen === "expired") {
    const btn = $("#requestNewLink"), msg = $("#requestNewLinkMsg");
    v.expired = { heading: text($("#expired h2")), intro: text($("#expired p")), contact: text($("#expired .contact")),
      button: shown(btn) ? { text: text(btn), disabled: btn.disabled } : null,
      message: shown(msg) ? { text: text(msg), kind: msg.classList.contains("is-error") ? "error" : "success" } : null };
  }
  if (screen === "app") {
    v.title = text($(".sheet__header .title"));
    v.backLink = shown($("#backToOc")) ? { text: text($("#backToOc")), href: $("#backToOc").getAttribute("href") } : null;
    v.nav = shown($("#docNav")) ? { progress: text($("#progress")), prevDisabled: $("#prevDoc").disabled, nextDisabled: $("#nextDoc").disabled } : null;
    v.done = shown($("#doneCard")) ? text($("#doneCard")) : null;
    const c = $("#docContainer");
    const buttons = [...c.querySelectorAll("button")].filter(shown).map((b) => ({ text: text(b), disabled: b.disabled }));
    const err = $("#docError");
    v.doc = c.children.length === 0 ? null : {
      message: c.querySelector(".sheet, p:only-child") && !c.querySelector("#submitBtn") ? text(c) : null,
      buttons,
      error: shown(err) ? text(err) : null,
      editable: [...c.querySelectorAll("[data-edit-field], input[name=pflegegrad]")].filter((i) => !i.disabled).map((i) => i.getAttribute("data-edit-field") || "pflegegrad:" + i.value),
      typing: [shown($("#typeWrap")), shown($("#typeWrap2"))],
      uploading: [shown($("#uploadWrap")), shown($("#uploadWrap2"))],
      preview: [shown($("#sigPreview")), shown($("#sigPreview2"))],
    };
  }
  return v;
}

(async () => {
  const conn = await mongoose.createConnection("mongodb://127.0.0.1:27018/?directConnection=true", { dbName: "oc_signing" }).asPromise();
  if (conn.db.databaseName !== "oc_signing") throw new Error("wrong database");
  const requests = conn.db.collection("signingrequests");
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-signing.cjs — do not edit", scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  const names = Object.keys(SCENARIOS);
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (process.env.ONLY && name !== process.env.ONLY)) continue;
    const i = names.indexOf(name) + 1;
    const record = async () => {
      // ---- the request
      let tok = "e".repeat(40) + String(i).padStart(8, "0"); // unknown link: a token no request has
      if (sc.req) {
        const [payload, type] = payloadOf(sc.req);
        const offerNumber = `T-SIGN-${String(i).padStart(2, "0")}-${Date.now().toString(36)}`;
        const r = await fetch(BASE + "/api/signing", { method: "POST", headers: { "content-type": "application/json", cookie: "net_session=" + session }, body: JSON.stringify({ payload, offerNumber, offerType: type }) });
        const b = await r.json();
        if (!b.token) throw new Error("create failed: " + JSON.stringify(b));
        tok = b.token;
        for (const [what, ...keys] of sc.setup || []) {
          const sr = await requests.findOne({ token: tok });
          if (what === "signed" || what === "completed") {
            const docs = sr.documents.map((d) => (what === "completed" || keys.includes(d.key) ? { ...d, status: "signed", signatureImage: "data:image/png;base64," + PNG_1PX, signedAt: new Date(), editedFields: {}, extraFields: {} } : d));
            await requests.updateOne({ token: tok }, { $set: { documents: docs, status: what === "completed" ? "completed" : "partially_signed", ...(what === "completed" ? { completedAt: new Date() } : {}) } });
          }
          if (what === "expired") await requests.updateOne({ token: tok }, { $set: { expiresAt: new Date(Date.now() - 864e5) } });
          if (what === "closed") await requests.updateOne({ token: tok }, { $set: { status: "expired" } });
          if (what === "newLinkRequested") await requests.updateOne({ token: tok }, { $set: { newLinkRequestedAt: new Date() } });
        }
      }
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin", hasTouch: false });
      if (sc.rep) await ctx.addCookies([{ name: "net_session", value: session, url: BASE }]);
      const page = await ctx.newPage();
      const seen = [], answers = JSON.parse(JSON.stringify(sc.answers || {}));
      const status = {}; // the documents' status as the script answers them
      const api = `/api/signing/${tok}`;
      page.on("response", async (res) => {
        const u = new URL(res.url());
        if (!u.pathname.startsWith("/api/signing/")) return;
        const req = res.request();
        let body = null; try { body = await res.text(); } catch { /* aborted */ }
        const entry = { method: req.method(), path: scrub(u.pathname + u.search, tok, i), body: bodyOf(req.postData()), answer: { status: res.status(), type: (res.headers()["content-type"] || "").split(";")[0], body: scrub(body ?? "", tok, i) } };
        seen.push(entry);
      });
      await page.route((u) => u.pathname.startsWith("/api/signing/"), async (route) => {
        const req = route.request(), u = new URL(req.url());
        const rest = u.pathname.slice(api.length);
        const key = `${req.method()} ${rest}`;
        const listed = answers[key]?.shift();
        if (listed) return route.fulfill({ status: listed[0], contentType: "application/json", body: JSON.stringify(listed[1]) });
        if (req.method() === "GET") {
          const res = await route.fetch();
          if (rest === "" && res.status() === 200) { const j = await res.json(); for (const d of j.documents || []) status[d.key] = d.status; }
          return route.fulfill({ response: res });
        }
        const m = /^\/documents\/([^/]+)$/.exec(rest);
        if (req.method() === "POST" && m) { // the server's answer to a valid signature, without signing
          status[m[1]] = "signed";
          const docs = Object.entries(status).map(([key, s]) => ({ key, status: s }));
          const all = docs.every((d) => d.status === "signed");
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: all ? "completed" : "partially_signed", documents: docs, completed: all }) });
        }
        throw new Error("unanswered " + key);
      });
      const settle = async () => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(450); };
      await page.goto(`${BASE}/sign/${tok}`);
      await settle();
      const entry = { name, token: FAKE(i), rep: !!sc.rep, view: JSON.parse(scrub(JSON.stringify(await page.evaluate(viewOf)), tok, i)), requests: seen.splice(0), acts: [] };
      for (const act of sc.acts || []) {
        const [kind, sel, arg] = act;
        if (kind === "click") await page.locator(sel).nth(typeof arg === "number" ? arg : 0).click();
        if (kind === "check") await page.locator(sel).first().check();
        if (kind === "fill") await page.locator(sel).first().fill(arg);
        if (kind === "upload") await page.locator(sel).setInputFiles(arg === "png"
          ? { name: "unterschrift.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX, "base64") }
          : { name: "notiz.txt", mimeType: "text/plain", buffer: Buffer.from("keine Unterschrift") });
        if (kind === "draw") {
          await page.locator(sel).scrollIntoViewIfNeeded();
          const box = await page.locator(sel).boundingBox();
          await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down();
          for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + 20 + k * 25, box.y + 40 + (k % 2) * 50);
          await page.mouse.up();
        }
        await settle();
        entry.acts.push({ act, requests: seen.splice(0), view: JSON.parse(scrub(JSON.stringify(await page.evaluate(viewOf)), tok, i)) });
      }
      await ctx.close();
      return entry;
    };
    let got;
    for (let attempt = 1; !got; attempt++) {
      try { got = await record(); }
      catch (err) {
        if (attempt >= 4) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    console.log(name);
    out.scenarios.push(got);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  await conn.close();
  out.scenarios.sort((x, y) => names.indexOf(x.name) - names.indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
