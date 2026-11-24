// Records sending on today's step "Angebotsversand" (page "Zusammenfassung"): "An Kunden senden"
// and "Nur in Bitrix ablegen" — the checks before sending, the question about main items that are
// not in the offer, the documents made for Bitrix, what the send request carries (fields, files,
// the offer), the step-by-step messages, the "already sent" question, the dialog after sending
// with the move of the deal, own files for the customer and for Bitrix only, the offer edited in
// Word, and what is stored. The reference for apps/web/test/versand-senden.test.tsx (ADR 026,
// phase 4; Angebotsversand slice 4b, part 1).
// Every server route of the send is answered here — nothing is sent, saved or moved. The v2
// add-ons are blocked (the send guard is matched on its own in the test). RESUME=1 continues.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-versand-senden.cjs   → v2/apps/web/test/fixtures/versand-senden.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "versand-senden.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe", wd: "WD-Winterdienst", hms: "HMS-Hausmeister-Service" };
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
const NO_MAIL = KUNDE.filter(([, f]) => f !== "email"); // everything Kundendaten asks for, no e-mail
const READY = [["deal", "65418"]];
const ALL = ["hp", "all"]; // tick every main item and send
// set-up on Kundendaten: ["radio" | "text", name, value]
// on the page: ["send"] "An Kunden senden" · ["bitrix"] "Nur in Bitrix ablegen" · ["hp", "all" | "back" | page] the question
//   about main items · ["confirm", "yes" | "no"] the app's question · ["move"] / ["close"] the dialog after sending ·
//   ["answer", path, status, body] the next request to this route is answered so · ["deal" | "to" | "note", text] ·
//   ["file", "attachments" | "bitrix" | "docx", name] a file chosen · ["untile", name] / ["unbitrix", name] / ["undocx"] removed ·
//   ["doc", id] a tick of "Mitgesendete Unterlagen" · ["tile", name] an attachment taken off the list
// wall cladding (`wv`, on the step Wandverkleidung, classic editor): ["wall"] a winwall wall of 170 cm with a decor ·
//   ["wwrow", text] a winwall row more with a typed decor number (main 81f73fc7: an invalid one is asked before sending).
//   With `wv` the scenario also keeps the last price answer (`price`), which the main items are read from.
// RESUME=1 ONLY="name|name" adds these scenarios to the finished recording.
const SCENARIOS = {
  "nothing entered on Kundendaten": { acts: [["send"]] },
  "no deal number": { setup: KUNDE, acts: [["send"]] },
  "no recipient": { setup: NO_MAIL, pre: READY, acts: [["send"]] },
  "main items: back": { setup: KUNDE, pre: READY, acts: [["send"], ["hp", "back"]] },
  "main items: to the page": { setup: KUNDE, pre: READY, acts: [["send"], ["hp", "Duschwanne"]] },
  "sent, dialog closed": { setup: KUNDE, pre: READY, acts: [["send"], ALL, ["close"]] },
  "Handlauf: sent, deal moved": { type: "hl", setup: KUNDE, pre: READY, acts: [["send"], ["move"]] },
  "Handlauf: landlord approval asked (Miete)": { type: "hl", setup: [...KUNDE.slice(0, -1), ["radio", "vermieterGenehmigungErforderlich", "Ja"]], pre: READY, acts: [["send"]] },
  "sent, deal moved": { setup: KUNDE, pre: READY, acts: [["send"], ALL, ["move"]] },
  "sent, deal moved, Kassenkunde with invoice copy by e-mail": { setup: [...KUNDE, ["radio", "kk_rechnungskopie", "ja"], ["radio", "kk_rechnungskopie_art", "email"]], pre: READY, acts: [["send"], ALL, ["move"]] },
  "the deal cannot be moved": { setup: KUNDE, pre: READY, acts: [["answer", "/move-ang-verschickt", 500, { error: "Bitrix nicht erreichbar" }], ["send"], ALL, ["move"]] },
  "only in Bitrix": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 200, { ...SENT, bitrixOnly: true }], ["bitrix"], ALL, ["close"]] },
  "only in Bitrix without recipient": { setup: NO_MAIL, pre: READY, acts: [["answer", "/api/email/send-offer", 200, { ...SENT, bitrixOnly: true }], ["bitrix"], ALL, ["move"]] },
  "already sent: send again": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 409, { error: "already", code: "ALREADY_SENT", lastSentAt: "2026-11-15T09:30:00.000Z", lastOfferNumber: "ANG2026-1115-093000" }], ["send"], ALL, ["confirm", "yes"], ["close"]] },
  "already sent: not again": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 409, { error: "already", code: "ALREADY_SENT", lastSentAt: "2026-11-15T09:30:00.000Z", lastOfferNumber: "ANG2026-1115-093000" }], ["send"], ALL, ["confirm", "no"]] },
  "send in progress": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 409, { error: "Für diesen Deal wird gerade bereits eine Angebots-E-Mail versendet.", code: "SEND_IN_PROGRESS" }], ["send"], ALL] },
  "the send fails": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 500, { error: "Send failed", detail: "SMTP nicht erreichbar" }], ["send"], ALL] },
  "sent, Bitrix filing failed": { setup: KUNDE, pre: READY, acts: [["answer", "/api/email/send-offer", 200, { ...SENT, bitrixComment: { ok: false, error: "Timeout" } }], ["send"], ALL, ["close"]] },
  "a document for Bitrix cannot be made": { setup: KUNDE, pre: READY, acts: [["answer", "/kalkulation/pdf-v2", 500, { error: "Vorlage fehlt" }], ["send"], ALL] },
  "own files for the customer and for Bitrix": { setup: KUNDE, pre: READY, acts: [["file", "attachments", "Grundriss.pdf"], ["file", "attachments", "Notiz.txt"], ["untile", "Notiz.txt"], ["file", "bitrix", "Aufmass.pdf"], ["file", "bitrix", "Foto.jpg"], ["unbitrix", "Foto.jpg"], ["send"], ALL, ["close"]] },
  "offer edited in Word": { setup: KUNDE, pre: READY, acts: [["file", "docx", "Angebot_bearbeitet.docx"], ["send"], ALL, ["close"]] },
  "offer edited in Word, then removed": { setup: KUNDE, pre: READY, acts: [["file", "docx", "Angebot_bearbeitet.docx"], ["undocx"]] },
  "not a Word file": { setup: KUNDE, pre: READY, acts: [["file", "docx", "Angebot.pdf"]] },
  "internal note": { setup: KUNDE, pre: [...READY, ["note", "Kunde will Termin im Januar."]], acts: [["send"], ALL, ["close"]] },
  "documents taken out": { setup: KUNDE, pre: [...READY, ["doc", "abtretung"], ["tile", "Vollmacht.pdf"]], acts: [["send"], ALL, ["close"]] },
  "Badewannentür": { type: "bwt", setup: KUNDE, pre: READY, acts: [["send"], ["close"]] },
  "Alltagshilfe": { type: "ah", setup: KUNDE, pre: READY, acts: [["send"], ["move"]] },
  "Badelift": { type: "bl", setup: KUNDE, pre: READY, acts: [["send"], ["move"]] },
  "Winterdienst": { type: "wd", setup: KUNDE, pre: READY, acts: [["send"], ["move"]] },
  // main 81f73fc7 / 68b454a9: winwall plates count as wall cladding; rows with an invalid decor are asked
  "winwall plates: no question about the wall cladding": { setup: KUNDE, wv: [["wall"]], pre: READY, acts: [["send"], ALL, ["close"]] },
  "winwall row with an invalid decor: back": { setup: KUNDE, wv: [["wwrow", "23014"]], pre: READY, acts: [["send"], ["hp", "back"]] },
  "winwall plates and a row with an invalid decor": { setup: KUNDE, wv: [["wall"], ["wwrow", "23014"]], pre: READY, acts: [["send"], ALL, ["close"]] },
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
  const out = { note: "generated by v2/scripts/capture-versand-senden.cjs — do not edit", files: FILES, sent: SENT, scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split("|")) : null;
  for (const [name, { type = "bu", setup = [], wv = [], pre = [], acts = [] }] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (only && !only.has(name))) continue;
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
      let lastPrice = null;
      page.on("response", async (res) => { if (res.ok() && new URL(res.url()).pathname === "/api/price" && res.request().method() === "POST") { try { lastPrice = await res.json(); } catch {} } });
      await page.addInitScript(() => { window.__toasts = []; });
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
      if (wv.length) {
        const P = "#page-Wandverkleidung";
        await go("Wandverkleidung");
        await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click();
        await page.waitForTimeout(500);
        if (await page.locator("#wvSimple .wvs-classic").isVisible()) await page.locator("#wvSimple .wvs-classic").click(); // the classic editor (React's)
        await page.locator(`${P} label.ios-check-row:has(input[name="wvKind"][value="Deckenhoch"])`).click();
        for (const [kind, a] of wv) {
          if (kind === "wall") { await page.locator("#wvKBack").fill("170"); await page.locator("#wvKBack").blur(); await page.waitForTimeout(600); await page.locator('#wvKeramicoCalc .kc-row[data-wall="back"] .kc-decor').click(); await page.locator('#wvKeramicoCalc .kc-wall-body[data-body="back"] label.image-check:has(input[value="WS229"])').click(); }
          else if (kind === "wwrow") { await page.locator("#wvWwRowAdd").click(); await page.locator('#wvWwDecors label.image-check:has(input[value="custom"])').click(); await page.locator("#wvWwDecorCustom").fill(a); await page.locator("#wvWwDecorCustom").blur(); }
          else throw new Error(`wv step not handled: ${kind}`);
          await page.waitForTimeout(800);
        }
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
      }
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
        };
      });
      const offer = await page.evaluate(() => window.buildPayload());
      const entry = { name, type, setup, ...(wv.length ? { wv, price: lastPrice } : {}), pre, answers: acts.filter(([k]) => k === "answer").map(([, p, st, body]) => [p, st, body]), offer: changed(base, offer), view: mask(await viewOf()), acts: [] };
      for (const [kind, a, b, c] of acts) {
        if (kind === "answer") { await act(kind, a, b, c); continue; }
        seen.length = 0; alerts.length = 0;
        await page.evaluate(() => { window.__toasts.length = 0; });
        before = await page.evaluate(() => window.buildPayload());
        await act(kind, a, b, c);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => window.buildPayload());
        entry.acts.push({ act: [kind, a, b].filter((x) => x !== undefined), requests: seen.map((x) => ({ ...x })), toasts: mask(await page.evaluate(() => window.__toasts.map((t) => [...t]))), alerts: mask(alerts), stored: mask(changed(before, after)), view: mask(await viewOf()) });
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
