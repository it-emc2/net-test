// Records the product pictures and the plan photos of today's step "Angebotsversand" (page
// "Zusammenfassung"): the tick "Produktbilder-PDF anhängen" with its list of products (ticks, own
// picture, preview of the PDF, the attachment it adds, what the send carries), and "Grundriss /
// Fotos hinzufügen" (pictures made smaller and named, for Bitrix only). The reference for
// apps/web/test/versand-bilder.test.tsx (ADR 026, phase 4; Angebotsversand slice 4b, part 2).
// Every server route is answered here — the list of products is a fixed one, nothing is sent.
// The v2 add-ons are blocked. RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-versand-bilder.cjs   → v2/apps/web/test/fixtures/versand-bilder.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "versand-bilder.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
const USERS = [{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }];
// what the document routes answer: [content type, file name, body] — null: 204 (nothing to attach)
const FILES = {
  "/docx-template": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ANGEBOT_TEST.docx", "docx"],
  "/material-overview/hassmann-cart": ["text/csv; charset=utf-8", "Hassmann_TEST.csv", "Artikel;Menge\nA-1;2\n"],
  "/kalkulation/pdf-v2": ["application/pdf", "Kalkulation_TEST.pdf", "%PDF-1.4 kalk"],
  "/material-overview/badolux-cart": null,
  "/material-overview/winwall-cart": null,
  "/material-overview/online-orders": null,
};
const SENT = { ok: true, bitrixOnly: false, messageId: "<m1@test>", attachmentNames: ["ANGEBOT.pdf", "Abtretungserklärung.pdf"], bitrixComment: { ok: true }, offerTotal: 4321.5, selfPayAmount: 120 };
const KUNDE = [["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Muster"], ["text", "email", "kunde@example.test"], ["radio", "vermieterGenehmigungErforderlich", "Nein"]];
const READY = [["deal", "65418"]];
const ALL = ["hp", "all"];
// the products the server names for this offer (a fixed list for the recording)
const PRODUCTS = [
  { productId: "SLA90120", name: "Duschwanne Slate 90 x 120 cm", finish: "Weiß", qty: 1, unit: "Stck.", hasImage: true, imageUrl: "/assets/logo.png", defaultInclude: true },
  { productId: "V3WV997", name: "Wandverkleidung 997 x 2550 mm", finish: "", qty: 3, unit: "Stck.", hasImage: true, imageUrl: "/assets/logo.png", defaultInclude: false },
  { productId: "CLPESG30", name: "Haltegriff 30 cm", qty: 2, hasImage: true, imageUrl: "/assets/logo.png", defaultInclude: true },
  { productId: "KM02", name: "Kleinmaterial", qty: 1, hasImage: false, imageUrl: "", defaultInclude: false },
];
// on the page (besides the acts of capture-versand-senden.cjs): ["prodimg"] the tick "Produktbilder-PDF anhängen" ·
//   ["prod", productId] the tick of one product · ["prodfile", productId] an own picture for it · ["prodpreview"] "PDF Vorschau" ·
//   ["plan", ...names] pictures chosen under "Grundriss / Fotos" (each 2400 × 1200 px) · ["products", list] what the server names next
const SCENARIOS = {
  "the parts": { setup: KUNDE, pre: READY },
  "product pictures ticked": { setup: KUNDE, pre: READY, acts: [["prodimg"]] },
  "product pictures ticked and unticked": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prodimg"], ["prodimg"]] },
  "one product more, one less": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prod", "V3WV997"], ["prod", "SLA90120"]] },
  "no product ticked": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prod", "SLA90120"], ["prod", "CLPESG30"]] },
  "an own picture for a product without one": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prodfile", "KM02"]] },
  "an own picture for a product that has one": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prodfile", "V3WV997"]] },
  "the attachment removed from the list": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["untile", "Produktbilder_"]] },
  "no products with a picture": { setup: KUNDE, pre: READY, acts: [["products", []], ["prodimg"]] },
  "the list cannot be loaded": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/product-image-list", 500, { error: "kaputt" }], ["prodimg"]] },
  "preview of the PDF": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prod", "CLPESG30"], ["prodpreview"]] },
  "preview: no pictures": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["answer", "/api/email/preview-product-image-pdf", 204, {}], ["prodpreview"]] },
  "preview fails": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["answer", "/api/email/preview-product-image-pdf", 500, { error: "kaputt" }], ["prodpreview"]] },
  "sent with product pictures": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prod", "CLPESG30"], ["prodfile", "KM02"], ["send"], ALL, ["close"]] },
  "sent without product pictures": { setup: KUNDE, pre: READY, acts: [["prodimg"], ["prodimg"], ["send"], ALL, ["close"]] },
  "a screenshot as plan": { setup: KUNDE, pre: READY, acts: [["plan", "image.png"]] },
  "two screenshots and a named photo": { setup: KUNDE, pre: READY, acts: [["plan", "IMG_0042.PNG", "Screenshot 2026-11-16.png", "Bad Aufmass.png"]] },
  "the same photo twice": { setup: KUNDE, pre: READY, acts: [["plan", "Bad Aufmass.png"], ["plan", "Bad Aufmass.png"]] },
  "not a picture": { setup: KUNDE, pre: READY, acts: [["plan", "Notiz.txt"]] },
  "sent with a plan": { setup: KUNDE, pre: READY, acts: [["plan", "image.png"], ["send"], ALL, ["close"]] },
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
const NUM = /ANG\d{4}-\d{4}-\d{6}/g;
const mask = (v) => JSON.parse(JSON.stringify(v ?? null).replace(NUM, "<number>").replace(/Grundriss_\d{4}-\d{2}-\d{2}_/g, "Grundriss_<date>_").replace(/(Nur Bitrix · )[\d.,]+ (B|KB|MB)/g, "$1<size>"));
/** multipart/form-data → { fields, files: { field: [file names] } } */
function multipart(buf, type) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type || "");
  if (!boundary) return null;
  const sep = Buffer.from(`--${boundary[1] || boundary[2]}`), fields = {}, files = {};
  let at = buf.indexOf(sep);
  while (at !== -1) {
    const next = buf.indexOf(sep, at + sep.length);
    if (next === -1) break;
    const part = buf.subarray(at + sep.length + 2, next - 2), head = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, head).toString("utf8"), content = part.subarray(head + 4);
    const name = /name="([^"]*)"/.exec(headers)?.[1], filename = /filename="([^"]*)"/.exec(headers)?.[1];
    if (name !== undefined) { if (filename !== undefined) (files[name] ||= []).push(filename); else fields[name] = content.toString("utf8"); }
    at = next;
  }
  return { fields, files };
}
const FILE_BODY = { "Grundriss.pdf": ["application/pdf", "%PDF-1.4 plan"], "Notiz.txt": ["text/plain", "Notiz"], "Aufmass.pdf": ["application/pdf", "%PDF-1.4 aufmass"], "Foto.jpg": ["image/jpeg", "jpeg"], "Angebot_bearbeitet.docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx edited"], "Angebot.pdf": ["application/pdf", "%PDF-1.4"] };

if (require.main !== module) { module.exports = { SCENARIOS }; return; } // the test data only

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-versand-bilder.cjs — do not edit", files: FILES, sent: SENT, products: PRODUCTS, scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, { type = "bu", setup = [], pre = [], acts = [] }] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (process.env.ONLY && name !== process.env.ONLY)) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
      const seen = [], answers = {};
      let before = null;
      const answer = (key) => { const a = answers[key]?.shift(); return a ? json(a[1], a[0]) : null; };
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/users", (r) => r.fulfill(json(USERS)));
      for (const [route, file] of Object.entries(FILES)) {
        await page.route((u) => u.pathname === route, (r) => {
          if (r.request().method() !== "POST") return r.continue();
          const q = new URL(r.request().url()).search;
          seen.push({ path: route + q, sent: mask(changed(before, r.request().postDataJSON())) });
          const a = answer(route); if (a) return r.fulfill(a);
          if (!file) return r.fulfill({ status: 204, body: "" });
          return r.fulfill({ status: 200, contentType: file[0], headers: { "content-disposition": `attachment; filename="${file[1]}"` }, body: file[2] });
        });
      }
      await page.route("**/api/email/send-offer", (r) => {
        const req = r.request(), form = multipart(req.postDataBuffer(), req.headers()["content-type"]);
        const { payload, ...fields } = form.fields;
        if (fields.productCustomImageData) fields.productCustomImageData = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(fields.productCustomImageData)).map(([k, v]) => [k, String(v).slice(0, 22)])));
        seen.push({ path: "/api/email/send-offer", fields: mask(fields), files: form.files, payload: mask(changed(before, JSON.parse(payload || "{}"))) });
        return r.fulfill(answer("/api/email/send-offer") || json(SENT));
      });
      let products = PRODUCTS;
      await page.route("**/api/email/product-image-list", (r) => {
        const b = r.request().postDataJSON();
        seen.push({ path: "/api/email/product-image-list", keys: Object.keys(b).sort(), payload: mask(changed(before, b.payload || {})) });
        return r.fulfill(answer("/api/email/product-image-list") || json({ products }));
      });
      await page.route("**/api/email/preview-product-image-pdf", (r) => {
        const b = r.request().postDataJSON();
        seen.push({ path: "/api/email/preview-product-image-pdf", keys: Object.keys(b).sort(), payload: mask(changed(before, b.payload || {})), excludeProductImageIds: b.excludeProductImageIds, custom: Object.fromEntries(Object.entries(b.productCustomImageData || {}).map(([k, v]) => [k, String(v).slice(0, 22)])) });
        const a = answer("/api/email/preview-product-image-pdf");
        if (a) return a.status === 204 ? r.fulfill({ status: 204, body: "" }) : r.fulfill(a);
        return r.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 bilder" });
      });
      await page.route("**/api/drafts**", (r) => { if (r.request().method() === "GET") return r.fulfill(json([])); seen.push({ path: "/api/drafts", method: r.request().method() }); return r.fulfill(json({ ok: true, id: "d1" })); });
      await page.route("**/api/offers", (r) => {
        if (r.request().method() !== "POST") return r.continue();
        const b = r.request().postDataJSON();
        seen.push({ path: "/api/offers", offerNumber: mask(b.offerNumber), offerType: b.offerType, payload: mask(changed(before, b.payload || {})) });
        return r.fulfill(json({ ok: true, offerNumber: b.offerNumber }));
      });
      await page.route("**/api/bitrix/**", (r) => {
        const u = new URL(r.request().url()), p = u.pathname.replace(/\/deal\/[^/]+\//, "/deal/<id>/");
        if (r.request().method() !== "POST") return r.fulfill(json({}));
        let body = null; try { body = r.request().postDataJSON(); } catch { body = r.request().postData(); }
        if (body && typeof body.payload === "string") body = { ...body, payload: "<the offer>" };
        seen.push({ path: p, deal: u.pathname.match(/\/deal\/([^/]+)\//)?.[1], body: mask(body) });
        return r.fulfill(answer("/" + p.split("/").pop()) || json({ ok: true }));
      });
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.addInitScript(() => { window.__toasts = []; window.__opened = []; window.open = (url, target) => { window.__opened.push([String(url).startsWith("blob:") ? "blob:" : String(url), target]); return null; }; });
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
        await page.evaluate(([k, f, v]) => {
          const el = k === "radio" ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`) : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (!el || (k === "radio" && (el.closest("label") || el).getClientRects().length === 0)) return;
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
        }, [kind, f, v]);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(600);
      await go("Zusammenfassung");
      await page.waitForTimeout(1000);
      const act = async (kind, a, b, c) => {
        if (kind === "send") await page.evaluate(() => document.getElementById("sendOfferMail").click());
        else if (kind === "bitrix") await page.evaluate(() => document.getElementById("sendOfferBitrix").click());
        else if (kind === "hp") {
          if (a === "all") { for (const box of await page.locator("#hpConfirmOverlay input[data-hp]").all()) await box.check(); await page.locator("#hpConfirmOverlay .ang-stage-btn--primary").click(); }
          else if (a === "back") await page.locator("#hpConfirmOverlay .ang-stage-btn:not(.ang-stage-btn--primary)").click();
          else await page.locator(`#hpConfirmOverlay [data-page="${a}"]`).click();
        } else if (kind === "confirm") await page.locator(a === "yes" ? "#appConfirmOk" : "#appConfirmCancel").click();
        else if (kind === "move") await page.locator("#angStageMoveBtn").click();
        else if (kind === "close") await page.locator("#angStageCloseBtn").click();
        else if (kind === "answer") (answers[a] ||= []).push([b, c]);
        else if (kind === "deal") { await page.locator("#mailAuftragId").fill(a); await page.locator("#mailAuftragId").blur(); }
        else if (kind === "to") { await page.locator("#mailTo").fill(a); await page.locator("#mailTo").blur(); }
        else if (kind === "note") { await page.locator("#internalNote").fill(a); await page.locator("#internalNote").blur(); }
        else if (kind === "doc") await page.locator(`#zfDocSelectionCard label.doc-select-row:has(#docSel_${a})`).click();
        else if (kind === "tile") await page.locator("#mailAttachmentList .mail-attach-tile").filter({ has: page.locator(".mail-attach-name", { hasText: a }) }).locator(".mail-attach-x").click();
        else if (kind === "file") {
          const [mimeType, body] = FILE_BODY[b];
          await page.locator({ attachments: "#mailAttachments", bitrix: "#mailBitrixAttachments", docx: "#mailEditedDocx" }[a]).setInputFiles({ name: b, mimeType, buffer: Buffer.from(body) });
        } else if (kind === "untile") await page.locator("#mailAttachmentList .mail-attach-tile").filter({ has: page.locator(".mail-attach-name", { hasText: a }) }).locator(".mail-attach-x").click();
        else if (kind === "unbitrix") await page.locator("#mailBitrixAttachmentList .mail-attach-tile").filter({ has: page.locator(".mail-attach-name", { hasText: a }) }).locator(".mail-attach-x").click();
        else if (kind === "undocx") await page.locator("#mailDocxRemove").click();
        else if (kind === "prodimg") await page.locator("label.mail-prodimg-toggle").click();
        else if (kind === "prod") await page.locator(`#mailProductImgList input[type=checkbox][value="${a}"]`).click();
        else if (kind === "prodfile") await page.locator("#mailProductImgList .mail-prodimg-item").filter({ has: page.locator(`input[type=checkbox][value="${a}"]`) }).locator("input[type=file]").setInputFiles({ name: "eigenes.png", mimeType: "image/png", buffer: PNG_SMALL });
        else if (kind === "prodpreview") await page.locator("#mailProductImgPreview").click();
        else if (kind === "products") products = a;
        else if (kind === "plan") await page.locator("#planFiles").setInputFiles([a, b, c].filter(Boolean).map((n) => (n.endsWith(".txt") ? { name: n, mimeType: "text/plain", buffer: Buffer.from("Notiz") } : { name: n, mimeType: "image/png", buffer: PNG_BIG })));
        else throw new Error(`act not handled: ${kind}`);
      };
      // a picture of 2400 × 1200 px (made in the page) and a small one
      const PNG_BIG = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 2400; c.height = 1200; const x = c.getContext("2d"); x.fillStyle = "#2f7d5b"; x.fillRect(0, 0, 2400, 1200); return c.toDataURL("image/png").split(",")[1]; }), "base64");
      const PNG_SMALL = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 8; c.height = 8; return c.toDataURL("image/png").split(",")[1]; }), "base64");
      for (const p of pre) { await act(...p); await page.waitForTimeout(300); }
      const viewOf = () => page.evaluate(() => {
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const el = (id) => document.getElementById(id);
        const tiles = (id) => [...document.querySelectorAll(`#${id} .mail-attach-tile`)].map((t) => ({ name: txt(t.querySelector(".mail-attach-name")), meta: txt(t.querySelector(".mail-attach-meta")) }));
        const hp = el("hpConfirmOverlay"), stage = el("angStageOverlay"), ask = el("appConfirmOverlay"), status = el("mailStatus");
        return {
          step: location.hash.slice(1),
          send: { label: txt(el("sendOfferMail")).replace(/^[^A-Za-zÄÖÜ]+/, ""), disabled: el("sendOfferMail").disabled, edited: el("sendOfferMail").classList.contains("btn-edited-docx") },
          bitrix: { label: txt(el("sendOfferBitrix")).replace(/^[^A-Za-zÄÖÜ]+/, ""), disabled: el("sendOfferBitrix").disabled },
          docx: { title: txt(el("mailDocxZoneTitle")), text: txt(el("mailDocxZoneSub")), remove: vis(el("mailDocxRemove")), note: vis(el("mailDocxSendNote")) ? txt(el("mailDocxSendNote")) : "" },
          attachments: tiles("mailAttachmentList"), count: txt(el("mailAttachCount")),
          bitrixFiles: tiles("mailBitrixAttachmentList"), bitrixCount: txt(el("mailBitrixAttachCount")),
          deal: { value: el("mailAuftragId").value, invalid: el("mailAuftragId").classList.contains("is-invalid") || el("mailAuftragId").getAttribute("aria-invalid") === "true" },
          note: el("internalNote")?.value ?? null,
          status: status.hidden ? null : status.classList.contains("mail-log")
            ? { log: [...status.querySelectorAll(".mail-log-line")].map((l) => [l.className.replace(/.*mail-log-line--/, ""), txt(l).replace(/^\S+ \[[^\]]*\] /, "")]) }
            : { type: status.dataset.type, text: txt(status) },
          hp: hp ? { title: txt(hp.querySelector("h3")), text: txt(hp.querySelector(".ang-stage-text")), rows: [...hp.querySelectorAll(".hp-confirm-row")].map((r) => ({ key: r.querySelector("input").dataset.hp, text: txt(r.querySelector("label")), page: r.querySelector("[data-page]").dataset.page, checked: r.querySelector("input").checked })), buttons: [...hp.querySelectorAll(".ang-stage-actions button")].map((b) => ({ label: txt(b), disabled: b.disabled })) } : null,
          stage: stage ? { title: txt(stage.querySelector("h3")), text: txt(stage.querySelector(".ang-stage-text")), body: txt(stage.querySelector(".ang-stage-body")), buttons: [...stage.querySelectorAll(".ang-stage-actions button")].map((b) => ({ label: txt(b), disabled: b.disabled })) } : null,
          ask: ask && ask.classList.contains("visible") ? { title: txt(el("appConfirmTitle")), message: txt(el("appConfirmMessage")), ok: txt(el("appConfirmOk")), cancel: txt(el("appConfirmCancel")) } : null,
          versand: txt(el("zfVersandStatus")),
          prod: { label: txt(document.querySelector("label.mail-prodimg-toggle")), checked: el("mailIncludeProductImages").checked, open: vis(el("mailProductImgPanel")), hint: vis(el("mailProductImgHint")) ? txt(el("mailProductImgHint")) : "", preview: vis(el("mailProductImgPreview")) ? txt(el("mailProductImgPreview")) : "",
            rows: [...document.querySelectorAll("#mailProductImgList .mail-prodimg-item")].map((r) => { const cb = r.querySelector("input[type=checkbox]"), th = r.querySelector(".prodimg-thumb"); return { id: cb.value, name: txt(r.querySelector(".prodimg-name > span")), finish: txt(r.querySelector(".prodimg-finish")), qty: txt(r.querySelector(".prodimg-qty")), checked: cb.checked, disabled: cb.disabled, picture: th.style.display === "none" ? "" : String(th.getAttribute("src")).startsWith("data:") ? "own" : "catalogue", upload: r.querySelector(".prodimg-upload-btn").title }; }) },
          plan: { label: el("planDropZone").getAttribute("aria-label"), title: txt(document.querySelector("#planDropZone .plan-zone-title")), text: txt(document.querySelector("#planDropZone .plan-zone-sub")) },
          opened: [...window.__opened],
        };
      });
      const offer = await page.evaluate(() => window.buildPayload());
      await page.evaluate(() => { window.__opened.length = 0; });
      const entry = { name, type, setup, pre, answers: acts.filter(([k]) => k === "answer").map(([, p, st, body]) => [p, st, body]), products: (acts.find(([k]) => k === "products") || [null, null])[1], offer: changed(base, offer), view: mask(await viewOf()), acts: [] };
      for (const [kind, a, b, c] of acts) {
        if (kind === "answer" || kind === "products") { await act(kind, a, b, c); continue; }
        seen.length = 0; alerts.length = 0;
        await page.evaluate(() => { window.__toasts.length = 0; window.__opened.length = 0; });
        before = await page.evaluate(() => window.buildPayload());
        await act(kind, a, b, c);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(kind === "plan" ? 2500 : 1500);
        const after = await page.evaluate(() => window.buildPayload());
        entry.acts.push({ act: [kind, a, b, c].filter((x) => x !== undefined && typeof x !== "object" || Array.isArray(x)).slice(0, kind === "answer" ? 2 : 4), requests: seen.map((x) => ({ ...x })), toasts: mask(await page.evaluate(() => window.__toasts.map((t) => [...t]))), alerts: mask(alerts), stored: mask(changed(before, after)), view: mask(await viewOf()) });
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
