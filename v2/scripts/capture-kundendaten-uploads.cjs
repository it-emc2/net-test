// Records the two upload boxes of today's Kundendaten step (script.js: initDealUploads,
// docs/kasse-freigabe-upload.md): "Freigabe der Kasse" and "Bestätigung des Vermieters". A chosen
// file goes straight to the Bitrix deal (POST /api/bitrix/deal/:id/upload/:type); recorded are
// where the boxes are on the page, what they say (no deal number, too large, running, done,
// failed), the request, and what the offer stores afterwards. The reference for
// apps/web/test/kundendaten-uploads.test.tsx (ADR 026, phase 4).
// Every Bitrix route is answered here — nothing is uploaded. The v2 add-ons are blocked
// (error-compat stays: it is part of how today's page reads a v2 error).
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-kundendaten-uploads.cjs   → v2/apps/web/test/fixtures/kundendaten-uploads.json
//   ONLY=<scenario name> records one scenario (printed, not written)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "kundendaten-uploads.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
const EVERY = Object.keys(TILES);
const DEAL = ["deal", "65418"];
const RENTED = [["radio", "wohnsituation", "Miete"]]; // sets "erforderlich" = Ja by itself
const ERR = (status, code, message) => ["answer", status, { error: { code, message, requestId: "req-1" } }];
// setup (before the reference offer is read): ["radio", name, value] | ["text", name, value]
// acts: ["deal", number] the deal number of the offer · ["file", "kasse"|"vermieter", name, megabytes?] a file is chosen ·
//   ["answer", status, body] what the next upload answers (default 200 { ok: true, kept: true }) · ["hold"] the next upload
//   waits · ["release"] it is answered · ["offline"] the next upload gets no answer · ["radio", name, value]
const SCENARIOS = {
  // where the boxes are
  "boxes: Kassenkunde (preselected)": { types: EVERY },
  "boxes: Selbstzahler": { types: EVERY, setup: [["radio", "payer", "Selbstzahler"]] },
  "boxes: landlord approval needed": { types: EVERY, setup: [["radio", "vermieterGenehmigungErforderlich", "Ja"]] },
  "boxes: landlord approval not needed": { types: EVERY, setup: [["radio", "vermieterGenehmigungErforderlich", "Nein"]] },
  "boxes: rented, then owned": { types: ["bu", "bl"], setup: RENTED, acts: [["radio", "wohnsituation", "Eigentum"]] },
  "boxes: Selbstzahler, landlord approval needed": { types: ["bu"], setup: [["radio", "payer", "Selbstzahler"], ["radio", "vermieterGenehmigungErforderlich", "Ja"]] },
  // Freigabe der Kasse
  "kasse: no deal number": { acts: [["file", "kasse", "Freigabe.pdf"]] },
  "kasse: deal number is no number": { acts: [["deal", "t-abc"], ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: no deal number, then with one": { acts: [["file", "kasse", "Freigabe.pdf"], DEAL, ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: uploaded": { acts: [DEAL, ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: a photo, then a second file": { acts: [DEAL, ["file", "kasse", "Foto.jpg"], ["file", "kasse", "Seite 2.pdf"]] },
  "kasse: while it is running": { acts: [DEAL, ["hold"], ["file", "kasse", "Freigabe.pdf"], ["release"]] },
  "kasse: larger than 15 MB": { acts: [DEAL, ["file", "kasse", "Gross.pdf", 16]] },
  "kasse: not a picture or PDF": { acts: [DEAL, ["file", "kasse", "Notiz.txt"]] },
  "kasse: the field kept only the newest file": { acts: [DEAL, ["answer", 200, { ok: true, kept: false }], ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: Bitrix fails, then works": { acts: [DEAL, ERR(500, "BITRIX_ERROR", "Bitrix antwortet nicht"), ["file", "kasse", "Freigabe.pdf"], ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: deal not found": { acts: [["deal", "99999"], ERR(404, "NOT_FOUND", "Auftrag nicht gefunden"), ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: uploaded, then one fails": { acts: [DEAL, ["file", "kasse", "Freigabe.pdf"], ERR(500, "BITRIX_ERROR", "Bitrix antwortet nicht"), ["file", "kasse", "Seite 2.pdf"], ["file", "kasse", "Seite 3.pdf"]] },
  "kasse: an answer without a message": { acts: [DEAL, ["answer", 502, {}], ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: no connection": { acts: [DEAL, ["offline"], ["file", "kasse", "Freigabe.pdf"]] },
  "kasse: Badelift": { types: ["bl"], acts: [DEAL, ["file", "kasse", "Freigabe.pdf"]] },
  // Bestätigung des Vermieters
  "vermieter: rented, uploaded": { types: ["bu", "bwt", "hl"], setup: RENTED, acts: [DEAL, ["file", "vermieter", "Vermieter.pdf"]] },
  "vermieter: rented, answer was Nein": { setup: [...RENTED, ["radio", "vermieterGenehmigung", "Nein"]], acts: [DEAL, ["file", "vermieter", "Vermieter.jpg"]] },
  "vermieter: rented, answer was Noch ausstehend, upload fails": { setup: [...RENTED, ["radio", "vermieterGenehmigung", "Noch ausstehend"]], acts: [DEAL, ERR(500, "BITRIX_ERROR", "Bitrix antwortet nicht"), ["file", "vermieter", "Vermieter.pdf"]] },
  "vermieter: no deal number": { setup: RENTED, acts: [["file", "vermieter", "Vermieter.pdf"]] },
  "vermieter: owned, approval needed chosen by hand": { setup: [["radio", "wohnsituation", "Eigentum"], ["radio", "vermieterGenehmigungErforderlich", "Ja"]], acts: [DEAL, ["file", "vermieter", "Vermieter.pdf"]] },
  "vermieter: no living situation, approval needed": { setup: [["radio", "vermieterGenehmigungErforderlich", "Ja"]], acts: [DEAL, ["file", "vermieter", "Vermieter.pdf"], ["radio", "wohnsituation", "Miete"]] },
  "vermieter: uploaded, then approval not needed and needed again": { setup: RENTED, acts: [DEAL, ["file", "vermieter", "Vermieter.pdf"], ["radio", "vermieterGenehmigungErforderlich", "Nein"], ["radio", "vermieterGenehmigungErforderlich", "Ja"]] },
  "vermieter: uploaded, answer set back to Nein, second file": { setup: RENTED, acts: [DEAL, ["file", "vermieter", "Vermieter.pdf"], ["radio", "vermieterGenehmigung", "Nein"], ["file", "vermieter", "Seite 2.pdf"]] },
  "both boxes": { setup: RENTED, acts: [DEAL, ["file", "kasse", "Freigabe.pdf"], ["file", "vermieter", "Vermieter.pdf"]] },
};
if (require.main !== module) { module.exports = { SCENARIOS }; return; } // the test data only

const { chromium } = require("../../node_modules/playwright");
// PW_CHANNEL=chromium: the full browser instead of the headless shell (when the shell crashes on today's page)
const LAUNCH = { headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) };
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
// what differs from `base` (dotted paths); the generated offer number and the texts carrying it are left out
function changed(base, now) {
  const out = {};
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const walk = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  walk(base, now, "");
  for (const k of Object.keys(out)) if (/^mail\.(subject|body)$|^offerNumber$|^Kundendaten\.(date|ansprechpartner|emc2_contact)$/.test(k)) delete out[k];
  return sortKeys(out);
}
const TYPE = { pdf: "application/pdf", jpg: "image/jpeg", txt: "text/plain" };
const fileOf = (name, mb) => ({ name, mimeType: TYPE[name.split(".").pop()], buffer: mb ? Buffer.alloc(mb * 1024 * 1024, 1) : Buffer.from(`inhalt ${name}`) });

(async () => {
  let browser = await chromium.launch(LAUNCH);
  const out = { note: "generated by v2/scripts/capture-kundendaten-uploads.cjs — do not edit", scenarios: [] };
  for (const [name, { types = ["bu"], setup = [], acts = [] }] of Object.entries(SCENARIOS)) for (const type of types) {
    if (process.env.ONLY && name !== process.env.ONLY) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
      const seen = [], answers = [];
      let held = null, hold = false, offline = false;
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/users", (r) => r.fulfill(json([{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }])));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.route("**/api/bitrix/**", (r) => r.fulfill(json({}))); // nothing reaches Bitrix
      await page.route(/\/api\/bitrix\/deal\/[^/]+$/, (r) => r.fulfill(json({ contact: null, vermieter: { erforderlich: null, liegtVor: null } }))); // the deal says nothing about the landlord
      await page.route(/\/api\/bitrix\/deal\/[^/]+\/upload\/[^/]+$/, async (r) => {
        const req = r.request();
        seen.push({ method: req.method(), path: new URL(req.url()).pathname, body: req.postDataJSON() });
        if (offline) { offline = false; return r.abort("internetdisconnected"); }
        const a = answers.shift() ?? [200, { ok: true, kept: true }];
        if (hold) { hold = false; await new Promise((go) => { held = go; }); }
        return r.fulfill(json(a[1], a[0]));
      });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1500);

      // choosing / typing like a user: set the control, then tell the page; a control that is not on the page cannot be used
      const input = (kind, field, value) => page.evaluate(([k, f, v]) => {
        const el = k === "radio" ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`) : document.querySelector(`#form-Kundendaten [name="${f}"]`);
        if (!el || (el.closest("label") || el).getClientRects().length === 0 || el.disabled) return false;
        if (k === "radio") el.checked = true; else el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, [kind, field, value]);
      const view = () => page.evaluate(() => {
        const on = (el) => !!el && el.getClientRects().length > 0;
        const box = (id) => {
          const b = document.querySelector(`label.dealUploadBox[for="${id}"]`);
          if (!on(b)) return null;
          const t = (sel) => (b.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
          return { label: (b.previousElementSibling?.textContent || "").trim(), state: b.dataset.state || "", title: t(".du-title"), hint: t(".du-hint"), accept: document.getElementById(id).accept };
        };
        const answer = [...document.querySelectorAll('#form-Kundendaten input[name="vermieterGenehmigung"]')];
        return {
          kasse: box("kasseFreigabeFile"), vermieter: box("vermieterUploadFile"),
          // "Genehmigung des Vermieters liegt vor?": on the page, and the answer that is marked
          approvalAsked: answer.some((el) => on(el.closest("label"))), approval: answer.find((el) => el.checked)?.value ?? "",
        };
      });
      const payload = () => page.evaluate(() => window.buildPayload());
      const skipped = [];
      for (const [kind, field, value] of setup) { if (!(await input(kind, field, value))) skipped.push(field); await page.waitForTimeout(60); }
      await page.waitForTimeout(500);
      const base = await payload();
      const entry = { name, type, setup, skipped, view: await view(), acts: [] };
      for (const act of acts) {
        const [kind, a, b, c] = act;
        const from = seen.length;
        if (kind === "deal") await page.evaluate((v) => { const el = document.getElementById("auftragId"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, a);
        else if (kind === "answer" || kind === "hold" || kind === "offline") { // about the server, nothing happens on the page
          if (kind === "answer") answers.push([a, b]); else if (kind === "hold") hold = true; else offline = true;
          entry.acts.push({ act });
          continue;
        }
        else if (kind === "release") held();
        else if (kind === "radio") await input(kind, a, b);
        else if (kind === "file") await page.setInputFiles(a === "kasse" ? "#kasseFreigabeFile" : "#vermieterUploadFile", fileOf(b, c));
        else throw new Error(`unknown act ${kind}`);
        await page.waitForTimeout(500);
        entry.acts.push({ act, requests: seen.slice(from), stored: changed(base, await payload()), view: await view() });
      }
      console.log(`${type} · ${name}: ${entry.acts.length} acts, ${seen.length} uploads`);
      await ctx.close();
      return entry;
    };
    let entry;
    for (let attempt = 1; !entry; attempt++) {
      try { entry = await record(); }
      catch (err) {
        if (attempt >= 6) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch(LAUNCH);
      }
    }
    out.scenarios.push(entry);
  }
  await browser.close();
  if (process.env.ONLY) { console.log(JSON.stringify(out.scenarios, null, 2)); return; }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
})().catch((e) => { console.error(e); process.exit(1); });
