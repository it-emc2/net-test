// Records the Dokumentenstudio of today's step "Angebotsversand" (page "Zusammenfassung"): the
// document cards per offer type, what every button asks the server for (address, what differs
// from the offer, the offer saved after a PDF), the file the browser is handed, and the preview
// — the reference for apps/web/test/versand-dokumente.test.tsx (ADR 026, phase 4).
// The document routes are answered by small fixed files and nothing is saved: the recording is
// about the page, not about the documents. The v2 add-ons are blocked. RESUME=1 continues a run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-versand-dokumente.cjs   → v2/apps/web/test/fixtures/versand-dokumente.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "versand-dokumente.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe", wd: "WD-Winterdienst", hms: "HMS-Hausmeister-Service" };
const USERS = [{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }];
const FILES = { // what the document routes answer in this recording
  "/docx-template": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Angebot_TEST.docx", "docx"],
  "/docx-template/pdf": ["application/pdf", "Angebot_TEST.pdf", "%PDF-1.4 offer"],
  "/api/docx/pdf-preview": ["application/pdf", "Angebot_Vorschau.pdf", "%PDF-1.4 preview"],
  "/kalkulation/docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Kalkulation_TEST.docx", "docx"],
  "/kalkulation/pdf": ["application/pdf", "Kalkulation_TEST.pdf", "%PDF-1.4 kalk"],
  "/kalkulation/pdf-v2": ["application/pdf", "Kalkulation_V2_TEST.pdf", "%PDF-1.4 kalk2"],
  "/material-overview/hassmann-cart": ["text/csv; charset=utf-8", "Hassmann_TEST.csv", "Artikel;Menge\nA-1;2\nB-7;1\n"],
};
// set-up on Kundendaten: ["radio", name, value] · ["text", name, value] · ["auf", percent] the markup
// on the page: ["click", buttonId] a button of a card · ["switch", key] a tab of the preview · ["close"] ·
//   ["fail", path, status] the next request to this route fails
const OK = [["radio", "salutation", "Herr"], ["text", "firstName", "Max"], ["text", "lastName", "Muster"], ["radio", "vermieterGenehmigungErforderlich", "Nein"]]; // what Kundendaten asks for
const SCENARIOS = {
  "the cards": {},
  "nothing entered on Kundendaten": { acts: [["click", "downloadDocx"], ["click", "previewOfferPdf"], ["click", "downloadHassmannCart"]] },
  "Angebot as DOCX": { setup: OK, acts: [["click", "downloadDocx"]] },
  "Angebot as PDF": { setup: OK, acts: [["click", "downloadDocxAsPdf"]] },
  "Kalkulation as DOCX": { setup: OK, acts: [["click", "downloadKalkulationDocx"]] },
  "Kalkulation as PDF": { setup: OK, acts: [["click", "downloadKalkulation"]] },
  "Kalkulation, new version": { setup: OK, acts: [["click", "downloadKalkulationV2"]] },
  "Hassmann CSV": { setup: OK, acts: [["click", "downloadHassmannCart"]] },
  "preview of the offer, then the other tabs, then closed": { setup: OK, acts: [["click", "previewOfferPdf"], ["switch", "kalkulation"], ["switch", "hassmann"], ["switch", "offer"], ["close"]] },
  "preview of the Kalkulation": { setup: OK, acts: [["click", "previewKalkulation"]] },
  "preview of the Hassmann CSV": { setup: OK, acts: [["click", "previewHassmannCart"]] },
  "two PDFs one after the other": { setup: OK, acts: [["click", "downloadDocxAsPdf"], ["click", "downloadKalkulation"]] },
  "the PDF cannot be made": { setup: OK, acts: [["fail", "/docx-template/pdf", 500], ["click", "downloadDocxAsPdf"]] },
  "the DOCX cannot be made": { setup: OK, acts: [["fail", "/docx-template", 500], ["click", "downloadDocx"]] },
  "the CSV cannot be made": { setup: OK, acts: [["fail", "/material-overview/hassmann-cart", 500], ["click", "downloadHassmannCart"]] },
  "the preview cannot be made": { setup: OK, acts: [["fail", "/api/docx/pdf-preview", 500], ["click", "previewOfferPdf"]] },
  "markup missing": { setup: [...OK, ["auf", ""]], acts: [["click", "downloadDocxAsPdf"]] },
  "Badewannentür": { type: "bwt", setup: OK, acts: [["click", "downloadDocxAsPdf"]] },
  "Handlauf": { type: "hl" },
  "Badelift": { type: "bl", setup: OK, acts: [["click", "downloadKalkulation"]] },
  "Alltagshilfe": { type: "ah", setup: OK, acts: [["click", "downloadDocxAsPdf"], ["click", "previewKalkulation"]] },
  "Winterdienst": { type: "wd", setup: OK, acts: [["click", "downloadDocxAsPdf"], ["click", "downloadKalkulation"]] },
  "Hausmeister-Service": { type: "hms", setup: OK, acts: [["click", "downloadDocxAsPdf"], ["click", "downloadKalkulation"]] },
};
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base, now) => Object.fromEntries([...new Set([...Object.keys(base || {}), ...Object.keys(now || {})])]
  .filter((k) => !same((base || {})[k], (now || {})[k])).map((k) => [k, k in (now || {}) ? now[k] : "<removed>"]));

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-versand-dokumente.cjs — do not edit", scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, { type = "bu", setup = [], acts = [] }] of Object.entries(SCENARIOS)) {
    if (have.has(name)) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/users", (r) => r.fulfill(json(USERS)));
      const seen = [], failing = {};
      const NUM = /ANG\d{4}-\d{4}-\d{6}/g;
      let before = null; // the offer as it was before the button was pressed
      const diff = (body) => { const d = changed(before, body); if (typeof d.offerNumber === "string") d.offerNumber = d.offerNumber.replace(NUM, "<new number>"); return d; };
      for (const [route, [type, filename, content]] of Object.entries(FILES)) {
        await page.route(`**${route}`, (r) => {
          if (r.request().method() !== "POST") return r.continue();
          seen.push({ path: route, accept: r.request().headers().accept || "", sent: diff(r.request().postDataJSON()) });
          if (failing[route]) { const status = failing[route]; delete failing[route]; return r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "Dokument konnte nicht erstellt werden", detail: "Vorlage fehlt" }) }); }
          return r.fulfill({ status: 200, contentType: type, headers: { "content-disposition": `attachment; filename="${filename}"` }, body: content });
        });
      }
      await page.route("**/api/offers", (r) => {
        if (r.request().method() !== "POST") return r.continue();
        const b = r.request().postDataJSON(), p = b.payload || {};
        seen.push({ path: "/api/offers", offerNumber: String(b.offerNumber || "").replace(NUM, "<new number>"), offerType: b.offerType, emptied: Object.keys(p).filter((k) => p[k] && typeof p[k] === "object" && !Array.isArray(p[k]) && !Object.keys(p[k]).length && Object.keys((before || {})[k] || {}).length).sort(), pricing: b.pricing ? Object.keys(b.pricing).length > 0 : false, keys: Object.keys(b).sort() });
        return r.fulfill(json({ ok: true, offerNumber: b.offerNumber }));
      });
      await page.addInitScript(() => {
        window.__handed = []; window.__toasts = [];
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (String(this.href).startsWith("blob:")) { window.__handed.push(this.download); return; } return click.call(this); };
      });
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      const alerts = [];
      page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => { for (const k of ["error", "success", "warn", "info"]) { const was = window.toast?.[k]; if (was) window.toast[k] = (...a) => { window.__toasts.push([k, ...a.map(String)]); return was.apply(window.toast, a); }; } });
      const go = async (st) => { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(400); };
      const base = await page.evaluate(() => window.buildPayload());
      for (const [kind, f, v] of setup) {
        if (kind === "auf") { await go(type === "bl" || type === "ah" ? "Kundendaten" : "Rabatt"); await page.waitForTimeout(400); await page.locator("#sonderaufschlagValue").fill(f); await page.locator("#sonderaufschlagValue").blur(); continue; }
        await page.evaluate(([k, f, v]) => {
          const el = k === "radio" ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`) : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (!el || (el.closest("label") || el).getClientRects().length === 0) return; // not asked for with this offer type
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
        }, [kind, f, v]);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(600);
      await go("Zusammenfassung");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(900);
      const viewOf = () => page.evaluate(() => {
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const el = (id) => document.getElementById(id);
        const sec = document.querySelector("#page-Zusammenfassung .export-section"), pv = el("documentPreviewSection");
        return {
          step: location.hash.slice(1),
          studio: vis(sec) ? { title: txt(sec.querySelector(".section-title")), text: txt(sec.querySelector(".section-subtitle")), cards: [...sec.querySelectorAll(".export-card")].filter(vis).map((c) => ({
            badge: txt(c.querySelector(".document-card__badge")), format: txt(c.querySelector(".document-card__format")), title: txt(c.querySelector("h3")), text: txt(c.querySelector("p")),
            buttons: [...c.querySelectorAll("button")].filter(vis).map((b) => ({ id: b.id, label: txt(b).replace(/^[^A-Za-zÄÖÜ]+/, ""), disabled: b.disabled })) })) } : null,
          preview: vis(pv) ? {
            title: txt(el("documentPreviewTitle")), status: txt(el("documentPreviewStatus")),
            open: { label: txt(el("documentPreviewOpen")), ready: el("documentPreviewOpen").getAttribute("aria-disabled") === "false" },
            download: { label: txt(el("documentPreviewDownload")), ready: el("documentPreviewDownload").getAttribute("aria-disabled") === "false", filename: el("documentPreviewDownload").download },
            close: txt(el("documentPreviewClose")),
            tabs: [...pv.querySelectorAll(".document-preview-switcher [data-preview-key]")].map((b) => ({ key: b.dataset.previewKey, label: txt(b), active: b.classList.contains("is-active") })),
            mode: vis(el("pdfPreviewContainer")) ? "pdf" : vis(el("documentTextPreview")) ? "text" : "", pdf: String(el("pdfPreviewFrame").src).startsWith("blob:"), content: el("documentTextPreviewContent").textContent,
          } : null,
          progress: txt(el("status")).replace(/\[[^\]]*\] /, ""),
        };
      });
      const offer = await page.evaluate(() => window.buildPayload());
      const entry = { name, type, setup, offer: changed(base, offer), view: await viewOf(), acts: [] };
      for (const [kind, a, b] of acts) {
        if (kind === "fail") { failing[a] = b; continue; }
        seen.length = 0; alerts.length = 0;
        await page.evaluate(() => { window.__handed.length = 0; window.__toasts.length = 0; });
        before = await page.evaluate(() => window.buildPayload());
        if (kind === "click") await page.evaluate((id) => document.getElementById(id).click(), a);
        else if (kind === "switch") await page.locator(`#documentPreviewSection [data-preview-key="${a}"]`).click();
        else if (kind === "close") await page.locator("#documentPreviewClose").click();
        else throw new Error(`act not handled: ${kind}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1800);
        const after = await page.evaluate(() => window.buildPayload());
        const stored = changed(before, after); if (typeof stored.offerNumber === "string") stored.offerNumber = stored.offerNumber.replace(NUM, "<new number>");
        entry.acts.push({ act: [kind, a].filter(Boolean), requests: seen.map((x) => ({ ...x })), handed: await page.evaluate(() => [...window.__handed]), toasts: await page.evaluate(() => window.__toasts.map((t) => [...t])), alerts: [...alerts], stored, view: await viewOf() });
      }
      await ctx.close();
      console.log(name);
      return { base, entry };
    };
    let got;
    for (let attempt = 1; !got; attempt++) {
      try { got = await record(); }
      catch (err) {
        if (attempt >= 6) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    out.users = USERS.map(({ email, name }) => ({ email, name }));
    out.bases = { ...(out.bases || {}), [type]: (out.bases || {})[type] || got.base };
    out.scenarios.push(got.entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
