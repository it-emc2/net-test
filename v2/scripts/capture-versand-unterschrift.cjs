// Records signing of today's step "Angebotsversand" (page "Zusammenfassung"): "Vor Ort
// unterschreiben (iPad)" on both tabs — the checks before it, the save of the offer, the request,
// the question when documents were signed before, the signing view that opens — and
// "Unterschriebene Unterlagen per Post senden" on the Post tab (shown once a signature started
// from that tab is complete). The reference for apps/web/test/versand-unterschrift.test.tsx
// (ADR 026, phase 4; Angebotsversand slice 6).
// Every server route is answered here — nothing is signed, no letter is sent.
// The v2 add-ons are blocked. RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-versand-unterschrift.cjs   → v2/apps/web/test/fixtures/versand-unterschrift.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "versand-unterschrift.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
const USERS = [{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }];
// what the document routes answer: [content type, file name, body] — null: 204 (nothing to attach)
const FILES = {
  "/docx-template/pdf": ["application/pdf", "ANGEBOT_TEST.pdf", "%PDF-1.4 angebot"],
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
const ADDR = [...KUNDE, ["text", "street", "Musterweg 4"], ["text", "postalCode", "95028"], ["text", "city", "Hof"]];
const POST = [["deal", "65418"], ["tab", "post"]];
const NODEAL = [["tab", "post"]];
// what the printer answers (mode as asked for)
const POSTED = { ok: true, provider: "onlinebrief24", printjobId: "PJ-4711", status: "queue", bitrix: { ok: true } };
const DEAL = [["deal", "65418"]];
// what the signing route answers, and the signed documents
const SIGNING = { id: "s1", token: "TESTTOKEN", link: "/sign/TESTTOKEN", customerType: "Kassenkunde", documents: ["angebot", "abtretung", "vollmacht"], emailResult: { skipped: true }, reused: false };
const SIGNED_DOCS = { documents: [{ key: "abtretung", filename: "Abtretung_unterschrieben.pdf", base64: Buffer.from("%PDF-1.4 abtretung signed").toString("base64") }, { key: "angebot", filename: "Angebot_unterschrieben.pdf", base64: Buffer.from("%PDF-1.4 angebot signed").toString("base64") }, { key: "vollmacht", filename: "Vollmacht_unterschrieben.pdf", base64: Buffer.from("%PDF-1.4 vollmacht signed").toString("base64") }] };
const DONE_POST = [{ token: "TESTTOKEN", status: "completed", via: "post", customerType: "Kassenkunde", documents: [] }];
const BEFORE = { needsConfirm: true, warning: "Für dieses Angebot wurden bereits Unterlagen unterschrieben." };
// on the page (besides the acts of capture-versand-post.cjs): ["sign"] "Vor Ort unterschreiben (iPad)" on the mail tab ·
//   ["signpost"] the same on the Post tab · ["psigned"] "Unterschriebene Unterlagen per Post senden" ·
//   ["signings", list] what the server knows about signatures of this offer (set before the Post tab is opened)
const SCENARIOS = {
  "the buttons": { setup: KUNDE, acts: [["tab", "post"]] },
  "signed on site": { setup: ADDR, pre: DEAL, acts: [["sign"], ALL] },
  "Handlauf: signed on site": { type: "hl", setup: ADDR, pre: DEAL, acts: [["sign"]] },
  "signed on site, from the Post tab": { setup: ADDR, pre: POST, acts: [["signpost"], ALL] },
  "signed on site without deal number": { setup: ADDR, acts: [["sign"], ALL] },
  "nothing entered on Kundendaten": { acts: [["sign"]] },
  "main items not confirmed": { setup: ADDR, pre: DEAL, acts: [["sign"], ["hp", "back"]] },
  "the offer cannot be saved": { setup: ADDR, pre: DEAL, acts: [["answer", "/api/offers", 500, { error: "kaputt" }], ["sign"], ALL] },
  "signed before: continue": { setup: ADDR, pre: DEAL, acts: [["answer", "/api/signing", 409, BEFORE], ["sign"], ALL, ["confirm", "yes"]] },
  "signed before: not again": { setup: ADDR, pre: DEAL, acts: [["answer", "/api/signing", 409, BEFORE], ["sign"], ALL, ["confirm", "no"]] },
  "the signing view cannot be made": { setup: ADDR, pre: DEAL, acts: [["answer", "/api/signing", 500, { error: "kaputt" }], ["sign"], ALL, ["sign"], ALL] },
  "the offer was changed after it was sent": { setup: ADDR, pre: DEAL, acts: [["answer", "/api/signing", 409, { error: "Dieses Angebot wurde bereits versendet und seitdem geändert.", code: "OFFER_CHANGED" }], ["sign"], ALL] },
  "bwt: signed on site": { type: "bwt", setup: ADDR, pre: DEAL, acts: [["sign"]] },
  "bl: signed on site": { type: "bl", setup: ADDR, pre: DEAL, acts: [["sign"]] },
  "bl: signed documents posted in test mode": { type: "bl", setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["psigned"]] },
  "signed from the Post tab: the signed documents can be posted": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["tab", "mail"], ["tab", "post"]] },
  "signed from the mail tab: nothing to post": { setup: ADDR, pre: [["signings", [{ ...DONE_POST[0], via: "" }]], ...POST] },
  "signature not complete: nothing to post": { setup: ADDR, pre: [["signings", [{ ...DONE_POST[0], status: "opened" }]], ...POST] },
  "signed documents posted in test mode": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["psigned"]] },
  "signed documents posted live": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["mode", "live"], ["psigned"], ["live", "ok"]] },
  "signed documents: live, cancelled": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["mode", "live"], ["psigned"], ["live", "cancel"]] },
  "signed documents: address incomplete": { setup: KUNDE, pre: [["signings", DONE_POST], ...POST], acts: [["psigned"]] },
  "signed documents without deal number: released by password": { setup: ADDR, pre: [["signings", DONE_POST], ...NODEAL], acts: [["psigned"], ["pw", "ok"]] },
  "signed documents without deal number: cancelled": { setup: ADDR, pre: [["signings", DONE_POST], ...NODEAL], acts: [["psigned"], ["pw", "cancel"]] },
  "signed documents cannot be loaded": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["answer", "/signed", 500, { error: "kaputt" }], ["psigned"]] },
  "signed documents: the printer refuses": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["answer", "/api/post/send", 500, { error: "onlinebrief24 nicht erreichbar" }], ["psigned"], ["psigned"]] },
  "signed documents: Bitrix filing failed": { setup: ADDR, pre: [["signings", DONE_POST], ...POST], acts: [["answer", "/api/post/send", 200, { ...POSTED, mode: "test", attachmentCount: 2, bitrix: { ok: false, error: "Timeout" } }], ["psigned"]] },
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
const mask = (v) => JSON.parse(JSON.stringify(v ?? null).replace(NUM, "<number>"));
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
  const out = { note: "generated by v2/scripts/capture-versand-bilder.cjs — do not edit", files: FILES, sent: SENT, posted: POSTED, signing: SIGNING, signed: SIGNED_DOCS, scenarios: [] };
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
        seen.push({ path: "/api/email/send-offer", fields: mask(fields), files: form.files, payload: mask(changed(before, JSON.parse(payload || "{}"))) });
        return r.fulfill(answer("/api/email/send-offer") || json(SENT));
      });
      let mode = "test", acceptDialogs = true;
      const text64 = (b64) => { try { return Buffer.from(String(b64 || ""), "base64").toString("utf8").slice(0, 40); } catch { return ""; } };
      await page.route("**/api/post/config", (r) => { seen.push({ path: "/api/post/config" }); return r.fulfill(answer("/api/post/config") || json({ ok: true, mode })); });
      await page.route("**/api/post/balance", (r) => { seen.push({ path: "/api/post/balance" }); return r.fulfill(answer("/api/post/balance") || json({ ok: true, balance: 42.5, currency: "EUR" })); });
      await page.route("**/api/auth/confirm-password", (r) => { seen.push({ path: "/api/auth/confirm-password", keys: Object.keys(r.request().postDataJSON() || {}) }); return r.fulfill(answer("/api/auth/confirm-password") || json({ ok: true, email: "capture@local.test", name: "Capture" })); });
      let signings = [];
      await page.route((u) => u.pathname === "/api/signing", (r) => {
        const { payload, ...rest } = r.request().postDataJSON();
        seen.push({ path: "/api/signing", body: mask(rest), payload: mask(changed(before, payload || {})) });
        return r.fulfill(answer("/api/signing") || json(SIGNING, 201));
      });
      await page.route("**/api/signing/status/**", (r) => {
        const signed = new URL(r.request().url()).pathname.endsWith("/signed");
        if (signed) { seen.push({ path: "/api/signing/status/<number>/signed" }); return r.fulfill(answer("/signed") || json(SIGNED_DOCS)); }
        return r.fulfill(json(signings));
      });
      await page.route("**/api/post/send", (r) => {
        const b = r.request().postDataJSON();
        const { document: doc, attachments = [], bitrixDocs = [], ...rest } = b;
        seen.push({ path: "/api/post/send", body: mask(rest), document: { filename: mask(doc?.filename), content: text64(doc?.base64) },
          attachments: attachments.map((a) => ({ type: a.type, ...(a.id ? { id: a.id } : {}), filename: a.filename, ...(a.base64 ? { content: text64(a.base64) } : {}) })),
          bitrixDocs: bitrixDocs.map((d) => mask(d.filename)) });
        return r.fulfill(answer("/api/post/send") || json({ ...POSTED, mode, attachmentCount: attachments.length, attachmentNames: [doc?.filename, ...attachments.map((a) => a.filename)] }));
      });
      await page.route("**/api/drafts**", (r) => { if (r.request().method() === "GET") return r.fulfill(json([])); seen.push({ path: "/api/drafts", method: r.request().method() }); return r.fulfill(json({ ok: true, id: "d1" })); });
      await page.route("**/api/offers", (r) => {
        if (r.request().method() !== "POST") return r.continue();
        const b = r.request().postDataJSON();
        seen.push({ path: "/api/offers", offerNumber: mask(b.offerNumber), offerType: b.offerType, payload: mask(changed(before, b.payload || {})) });
        return r.fulfill(answer("/api/offers") || json({ ok: true, offerNumber: b.offerNumber }));
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
      page.on("dialog", (d) => { alerts.push(d.message()); (acceptDialogs ? d.accept() : d.dismiss()).catch(() => {}); });
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
        else if (kind === "tab") await page.locator(`#sendTabBtn-${a}`).click();
        else if (kind === "pfield") { await page.locator(`#post${a}`).fill(b); await page.locator(`#post${a}`).blur(); }
        else if (kind === "kfield") await page.evaluate(([f, v]) => { const el = document.querySelector(`#form-Kundendaten [name="${f}"]`); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [a, b]);
        else if (kind === "pfile") { const [mimeType, body] = FILE_BODY[a]; await page.locator("#postAttachments").setInputFiles({ name: a, mimeType, buffer: Buffer.from(body) }); }
        else if (kind === "premove") await page.locator("#postAttachmentList .mail-attach-tile").filter({ has: page.locator(".mail-attach-name", { hasText: a }) }).locator(".mail-attach-x").click();
        else if (kind === "psend") await page.evaluate(() => document.getElementById("sendOfferPost").click());
        else if (kind === "pw") { if (a === "ok") { await page.locator("#postOverridePassword").fill("nur-ein-test"); await page.locator("#postOverrideConfirm").click(); } else await page.locator("#postOverrideCancel").click(); }
        else if (kind === "live") await page.locator(a === "ok" ? "#postLiveConfirmOk" : "#postLiveConfirmCancel").click();
        else if (kind === "sign") await page.evaluate(() => document.getElementById("signOnSiteBtn").click());
        else if (kind === "signpost") await page.evaluate(() => document.getElementById("signOnSiteBtnPost").click());
        else if (kind === "psigned") await page.evaluate(() => document.getElementById("sendSignedPost").click());
        else if (kind === "signings") signings = a;
        else if (kind === "mode") mode = a;
        else if (kind === "dialogs") acceptDialogs = a !== "dismiss";
        else throw new Error(`act not handled: ${kind}`);
      };
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
          sign: Object.fromEntries([["mail", "signOnSiteBtn", "signOnSiteStatus"], ["post", "signOnSiteBtnPost", "signOnSiteStatusPost"]].map(([k, b, s]) => [k, { shown: vis(el(b)), label: txt(el(b)).replace(/^[^A-Za-zÄÖÜ]+/, ""), disabled: el(b).disabled, status: el(s).hidden ? null : { type: el(s).classList.contains("err") ? "error" : "ok", text: txt(el(s)) } }])),
          signedLabel: txt(el("sendSignedPost")).replace(/^[^A-Za-zÄÖÜ]+/, ""),
          tab: document.querySelector("[data-send-tab].is-active")?.dataset.sendTab ?? null,
          tabs: [...document.querySelectorAll("[data-send-tab]")].map((b) => txt(b).replace(/^[^A-Za-zÄÖÜ]+/, "")),
          mailShown: vis(el("sendTabPanel-mail")),
          post: (() => {
            const sec = el("postalSummarySection"), st = el("postStatus"), F = { AuftragId: "deal", FirstName: "firstName", LastName: "lastName", Street: "street", Zip: "zipCode", City: "city", Country: "country" };
            return {
              shown: vis(sec), title: txt(sec.querySelector("h2")),
              warning: vis(el("postAddressWarning")) ? txt(el("postAddressWarning")) : "",
              fields: Object.fromEntries(Object.entries(F).map(([id, k]) => [k, { label: txt(document.querySelector(`label[for="post${id}"]`)), value: el(`post${id}`).value, invalid: el(`post${id}`).classList.contains("input-error") }])),
              focus: Object.entries(F).find(([id]) => document.activeElement === el(`post${id}`))?.[1] ?? "",
              upload: txt(document.querySelector('label[for="postAttachments"]')),
              files: [...document.querySelectorAll("#postAttachmentList .mail-attach-tile")].map((t) => ({ name: txt(t.querySelector(".mail-attach-name")), meta: txt(t.querySelector(".mail-attach-meta")), fixed: !!t.querySelector(".mail-attach-lock") })),
              listTitle: txt(sec.querySelector(".mail-attach-title")), hint: txt(sec.querySelector(".mail-attach-hint")),
              send: { label: txt(el("sendOfferPost")).replace(/^[^A-Za-zÄÖÜ]+/, ""), disabled: el("sendOfferPost").disabled },
              status: st.hidden ? null : { type: st.dataset.type, text: txt(st) },
              signed: vis(el("sendSignedPost")),
            };
          })(),
          release: (() => { const o = el("postOverrideOverlay"); return o ? { title: txt(o.querySelector("h3")), text: txt(o.querySelector(".ang-stage-text")), note: txt(o.querySelector(".ang-stage-body")), placeholder: o.querySelector("input").placeholder, buttons: [...o.querySelectorAll(".ang-stage-actions button")].map((b) => txt(b)) } : null; })(),
          live: (() => { const o = el("postLiveConfirmOverlay"); return o ? { title: txt(o.querySelector("h3")), texts: [...o.querySelectorAll(".ang-stage-text")].map((p) => p.innerText.replace(/[ \t]+/g, " ").trim()), buttons: [...o.querySelectorAll(".ang-stage-actions button")].map((b) => txt(b)) } : null; })(),
          opened: [...window.__opened],
        };
      });
      const offer = await page.evaluate(() => window.buildPayload());
      await page.evaluate(() => { window.__opened.length = 0; });
      const entry = { name, type, setup, pre, answers: acts.filter(([k]) => k === "answer").map(([, p, st, body]) => [p, st, body]), offer: changed(base, offer), view: mask(await viewOf()), acts: [] };
      for (const [kind, a, b, c] of acts) {
        if (kind === "answer" || kind === "mode" || kind === "dialogs" || kind === "signings") { await act(kind, a, b, c); continue; }
        seen.length = 0; alerts.length = 0;
        await page.evaluate(() => { window.__toasts.length = 0; window.__opened.length = 0; });
        before = await page.evaluate(() => window.buildPayload());
        await act(kind, a, b, c);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(["psend", "hp", "pw", "live", "sign", "signpost", "psigned", "confirm"].includes(kind) ? 2200 : 1200);
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
