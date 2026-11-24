// Records the mail form of today's step "Angebotsversand" (page "Zusammenfassung") — without
// sending: deal number, recipient, CC, subject and text with what they are filled with by
// themselves and what happens once they were changed by hand, the list of attachments, the
// preview of the mail, and what is stored (`mail`, `auftragId`). The reference for
// apps/web/test/versand-mail.test.tsx (ADR 026, phase 4). The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-versand-mail.cjs   → v2/apps/web/test/fixtures/versand-mail.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "versand-mail.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe", wd: "WD-Winterdienst", hms: "HMS-Hausmeister-Service" };
const USERS = [{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }, { email: "ap.eins@local.test", name: "AP Eins", firstName: "AP", lastName: "Eins", hasSignature: true }];
const KUNDE = [["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Muster"], ["text", "email", "kunde@example.test"]];
const TWO = [...KUNDE, ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"], ["text", "partnerSalutation", "Herr"], ["text", "partnerFirstName", "Max"], ["text", "partnerLastName", "Beispiel"]];
const CP = [...KUNDE, ["text", "emailCc", "cc@example.test"], ["radio", "hasContactPerson", "Ja"], ["radio", "cp_salutation", "Herr"], ["text", "cp_name", "Sohn"], ["text", "cp_email", "sohn@example.test"]];
// set-up on Kundendaten: ["radio", name, value] · ["text", name, value] · ["check", name, "on" | "off"]
// on the page: ["antrag"] the tick "Antrag bereits gestellt" · ["doc", id] a tick of "Mitgesendete Unterlagen" ·
//   ["tile", file name] removes an attachment · ["deal" | "to" | "cc" | "subject" | "body", text] typed by hand ·
//   ["ap", email] another contact person · ["stamp"] "Angebot als DOCX" (the offer gets a new number) ·
//   ["kd", ...step] a change on Kundendaten, then back to the page
// set-up of the discount (`rb`, main d0528418 — the mail advertises the Neukundenbonus only while it is ticked AND
//   the price grants it): ["big"] 40 wall panels as flooring · ["rabatt"] "Rabatt hinzufügen" · ["b300"] the Neukundenbonus ·
//   ["small"] the panels down to 2 (below the threshold; the bonus stays ticked). Such scenarios keep the last price answer (`price`).
// RESUME=1 ONLY="name|name" adds these scenarios to the finished recording.
const SCENARIOS = {
  "new offer": {},
  "customer with e-mail": { setup: KUNDE },
  "customer with CC and a contact person": { setup: CP },
  "contact person without a name": { setup: [...KUNDE, ["radio", "hasContactPerson", "Ja"], ["text", "cp_email", "sohn@example.test"]] },
  "two persons": { setup: TWO },
  "Selbstzahler": { setup: [...KUNDE, ["radio", "payer", "Selbstzahler"]] },
  "Selbstzahler with Vollmacht ticked": { setup: [...KUNDE, ["radio", "payer", "Selbstzahler"]], acts: [["doc", "vollmacht"]] },
  "Antrag bereits gestellt": { setup: KUNDE, acts: [["antrag"], ["antrag"]] },
  "documents unticked": { setup: KUNDE, acts: [["doc", "abtretung"], ["doc", "barrierefrei"], ["doc", "abtretung"]] },
  "an attachment removed from the list": { setup: KUNDE, acts: [["tile", "Vollmacht.pdf"], ["doc", "vollmacht"], ["doc", "vollmacht"]] },
  "deal number": { acts: [["deal", "65418"]] },
  "another contact person": { setup: KUNDE, acts: [["ap", "ap.eins@local.test"]] },
  "the offer gets its number": { setup: [...KUNDE, ["radio", "vermieterGenehmigungErforderlich", "Nein"]], acts: [["stamp"]] },
  "recipient and CC by hand, then the customer's e-mail changes": { setup: KUNDE, acts: [["to", "andere@example.test"], ["cc", "kopie@example.test"], ["kd", "text", "email", "neu@example.test"], ["kd", "text", "emailCc", "cc2@example.test"]] },
  "subject by hand, then the offer gets its number": { setup: [...KUNDE, ["radio", "vermieterGenehmigungErforderlich", "Nein"]], acts: [["subject", "Ihr Angebot von emc2"], ["stamp"]] },
  "text by hand, then name, documents and number change": { setup: [...KUNDE, ["radio", "vermieterGenehmigungErforderlich", "Nein"]], acts: [["body", "+PS: Wir melden uns nächste Woche."], ["kd", "text", "lastName", "Beispiel"], ["doc", "abtretung"], ["stamp"]] },
  "text replaced by hand, then a document unticked": { setup: KUNDE, acts: [["body", "Guten Tag,\n\nanbei Ihr Angebot."], ["doc", "abtretung"]] },
  "Badewannentür": { type: "bwt", setup: KUNDE },
  "Handlauf": { type: "hl", setup: KUNDE },
  "Badelift": { type: "bl", setup: KUNDE },
  "Alltagshilfe": { type: "ah", setup: KUNDE, acts: [["tile", "AGB_Alltagshilfe_EmC2 Soziale Dienste UG.pdf"]] },
  "Alltagshilfe, Selbstzahler": { type: "ah", setup: [...KUNDE, ["radio", "payer", "Selbstzahler"]] },
  "Winterdienst": { type: "wd", setup: KUNDE },
  "Neukundenbonus ticked": { setup: KUNDE, rb: [["big"], ["rabatt"], ["b300"]] },
  "Neukundenbonus ticked, the total below the threshold": { setup: KUNDE, rb: [["big"], ["rabatt"], ["b300"], ["small"]] },
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
  const out = { note: "generated by v2/scripts/capture-versand-mail.cjs — do not edit", scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split("|")) : null;
  for (const [name, { type = "bu", setup = [], rb = [], acts = [] }] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (only && !only.has(name))) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/users", (r) => r.fulfill(json(USERS)));
      await page.route("**/docx-template", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": 'attachment; filename="Angebot_TEST.docx"' }, body: "docx" }) : r.continue()));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      const alerts = [];
      page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      const go = async (st) => { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(400); };
      const base = await page.evaluate(() => window.buildPayload());
      const kd = async ([kind, f, v]) => {
        await page.evaluate(([k, f, v]) => {
          if (k === "check") { const box = document.querySelector(`#form-Kundendaten input[type=checkbox][name="${f}"]`); if (box.checked !== (v === "on")) box.click(); return; }
          const el = k === "radio" ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`) : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (!el || (k === "radio" && (el.closest("label") || el).getClientRects().length === 0)) return; // not asked for with this offer type
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
        }, [kind, f, v]);
        await page.waitForTimeout(80);
      };
      let lastPrice = null;
      page.on("response", async (res) => { if (res.ok() && new URL(res.url()).pathname === "/api/price" && res.request().method() === "POST") { try { lastPrice = await res.json(); } catch {} } });
      for (const st of setup) await kd(st);
      await page.waitForTimeout(600);
      for (const [kind] of rb) {
        if (kind === "big") { await go("Fussboden"); await page.locator("#page-Fussboden label.sec-switch:has(#fbMaster)").click(); await page.locator("#fbTabBtnWall").click(); await page.locator('#wcSupplierRow .wc-sup-btn[data-sup="hm"]').click(); await page.locator("#wallCladdingArea").fill("4,5"); await page.locator("#wallCladdingArea").blur(); await page.waitForTimeout(800); await page.locator('#wallCladdingCards .wvc-card[data-size="997"]').click(); await page.locator("#wallCladdingQtyInput").fill("40"); await page.locator("#wallCladdingQtyInput").blur(); }
        else if (kind === "small") { await go("Fussboden"); await page.locator("#wallCladdingQtyInput").fill("2"); await page.locator("#wallCladdingQtyInput").blur(); }
        else if (kind === "rabatt") { await go("Rabatt"); await page.locator('#page-Rabatt label:has(input[name="rb-add-rabatt"][value="ja"])').click(); }
        else if (kind === "b300") { await go("Rabatt"); await page.locator("#page-Rabatt label:has(#rb-bonus-300)").click(); }
        else throw new Error(`rb step not handled: ${kind}`);
        await page.waitForTimeout(1300);
      }
      if (rb.length) { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(900); }
      await go("Zusammenfassung");
      await page.waitForTimeout(1000);
      const NUM = /ANG\d{4}-\d{4}-\d{6}/g;
      const viewOf = () => page.evaluate(() => {
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const el = (id) => document.getElementById(id);
        const sec = el("sendTabPanel-mail"), pv = el("mailHtmlPreview").contentDocument;
        const lab = (id) => txt(sec.querySelector(`label[for="${id}"]`));
        return {
          title: txt(sec.querySelector(".section-title")),
          antrag: { label: txt(el("mailAntragGestellt").closest("label")), checked: el("mailAntragGestellt").checked },
          deal: { label: lab("mailAuftragId"), value: el("mailAuftragId").value, placeholder: el("mailAuftragId").placeholder },
          to: { label: lab("mailTo"), value: el("mailTo").value }, cc: { label: lab("mailCc"), value: el("mailCc").value },
          subject: { label: lab("mailSubject"), value: el("mailSubject").value }, body: { label: lab("mailBody"), value: el("mailBody").value },
          attachments: [...document.querySelectorAll("#mailAttachmentList .mail-attach-tile")].map((t) => ({ name: txt(t.querySelector(".mail-attach-name")), meta: txt(t.querySelector(".mail-attach-meta")), fixed: !!t.querySelector(".mail-attach-lock") })), count: txt(el("mailAttachCount")),
          preview: { text: txt(pv.body), links: [...pv.querySelectorAll("a")].map((a) => a.getAttribute("href")), lists: [...pv.querySelectorAll("ul, ol")].map((l) => `${l.tagName.toLowerCase()} ${l.children.length}`), bold: [...pv.querySelectorAll("p")].filter((p) => p.style.fontWeight === "bold").map(txt) },
        };
      });
      const mask = (v) => JSON.parse(JSON.stringify(v).replace(NUM, "<number>"));
      const pick = (p) => ({ mail: p.mail, auftragId: p.auftragId, docSelection: p.docSelection, offerNumber: p.offerNumber });
      const offer = await page.evaluate(() => window.buildPayload());
      const entry = { name, type, setup, ...(rb.length ? { rb, price: lastPrice } : {}), offer: changed(base, offer), view: mask(await viewOf()), acts: [] };
      for (const [kind, a, ...rest] of acts) {
        if (kind === "antrag") await page.locator('label:has(#mailAntragGestellt)').click();
        else if (kind === "doc") await page.locator(`#zfDocSelectionCard label.doc-select-row:has(#docSel_${a})`).click();
        else if (kind === "tile") await page.locator("#mailAttachmentList .mail-attach-tile").filter({ has: page.locator(".mail-attach-name", { hasText: a }) }).locator(".mail-attach-x").click();
        else if (kind === "deal") { await page.locator("#mailAuftragId").fill(a); await page.locator("#mailAuftragId").blur(); }
        else if (kind === "to") { await page.locator("#mailTo").fill(a); await page.locator("#mailTo").blur(); }
        else if (kind === "cc") { await page.locator("#mailCc").fill(a); await page.locator("#mailCc").blur(); }
        else if (kind === "subject") { await page.locator("#mailSubject").fill(a); await page.locator("#mailSubject").blur(); }
        else if (kind === "body") { const now = await page.locator("#mailBody").inputValue(); await page.locator("#mailBody").fill(a.startsWith("+") ? `${now}\n\n${a.slice(1)}` : a); await page.locator("#mailBody").blur(); }
        else if (kind === "ap") await page.locator("#zfAnsprechpartner").selectOption(a);
        else if (kind === "stamp") { await page.evaluate(() => document.getElementById("downloadDocx").click()); await page.waitForTimeout(1200); }
        else if (kind === "kd") { await go("Kundendaten"); await kd([a, ...rest]); await page.waitForTimeout(500); await go("Zusammenfassung"); }
        else throw new Error(`act not handled: ${kind}`);
        await page.waitForTimeout(800);
        entry.acts.push({ act: [kind, a, ...rest].filter((x) => x !== undefined), step: await page.evaluate(() => location.hash.slice(1)), stored: mask(changed(pick(offer), pick(await page.evaluate(() => window.buildPayload())))), view: mask(await viewOf()) });
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
