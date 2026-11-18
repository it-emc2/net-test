// Records how today's UI brings a customer's data into Kundendaten (script.js), the reference for
// apps/web/test/kundendaten-bitrix.test.tsx (ADR 026, phase 4):
//  - "deal": Hauptmenü „Bitrix Deal laden“ (#homeDealIdInput → GET /api/bitrix/deal/:id → dialog →
//    offer type) — the contact goes into the new offer (applyArmedDealToForm → fillCustomerForm), the
//    deal number into the offer; the deal is asked again for the landlord fields (initVermieterFromDeal)
//  - "contact": Kundendaten „Kontakt aus Bitrix laden“ (#bitrixContactId → GET /api/bitrix/contact/:id,
//    then GET /api/bitrix/contact/:id/deals for the deal number)
//  - "search": „Kunde suchen“ (#customerSearch → GET /api/customers/search?q= after 250 ms → pick →
//    GET /api/customers/:id → fillCustomerForm) — the LOCAL customer list, no Bitrix
// Recorded: what the user sees (status line, dialog, toasts, result list), the requests, and what
// the offer stores afterwards (diff against the offer before the act). Every /api/bitrix and
// /api/customers call is answered HERE — invented data only, nothing reaches Bitrix or the database.
// The v2 add-ons are blocked (error-compat stays: it is how today's page reads a v2 error).
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-kundendaten-bitrix.cjs   → v2/apps/web/test/fixtures/kundendaten-bitrix.json
//   ONLY=<scenario name> records one scenario (printed, not written)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "kundendaten-bitrix.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
const LABELS = { bu: "BU · Badumbau", bwt: "BWT · Badewannentür", hl: "HL · Handlauf", bl: "BL · Badelift", ah: "AH · Alltagshilfe" };

// ---- invented Bitrix answers (the shape of GET /api/bitrix/deal/:id and /contact/:id) ----
const CONTACT = {
  ID: "7001", HONORIFIC: "HNR_DE_1", NAME: "Erika", LAST_NAME: "Testkundin", COMPANY_TITLE: "Testfirma",
  PHONE: [{ VALUE: "+49 9281 000001", VALUE_TYPE: "WORK" }, { VALUE: "0170 0000002" }], EMAIL: [{ VALUE: "erika@example.test" }],
  ADDRESS: "Probeweg 3", ADDRESS_CITY: "Teststadt", ADDRESS_POSTAL_CODE: "95000", ADDRESS_REGION: "Bayern", ADDRESS_COUNTRY: "Deutschland",
};
const BARE = { ID: "7003", NAME: "Max", LAST_NAME: "Beispiel" }; // no Anrede, phone, e-mail or address
const FAMILY = { ...CONTACT, ID: "7004", HONORIFIC: "1", NAME: "", LAST_NAME: "Probe", ADDRESS_REGION: "", ADDRESS_PROVINCE: "Oberfranken", EMAIL: [] };
const deal = (contact, vermieter = { erforderlich: null, liegtVor: null }) =>
  [200, { deal: { id: 4711, title: "Badumbau Test", stageId: "C38:NEW" }, contact, vermieter }];
const ERR = (status, code, message) => [status, { error: { code, message, requestId: "req-1" } }];

// ---- invented local customers (GET /api/customers/search, /api/customers/:id) ----
const SAVED = {
  salutation: "Herr", firstName: "Max", lastName: "Mustermann", phone: "+49 9281 222222", email: "max@example.test",
  street: "Musterstraße 9", city: "Musterhausen", postalCode: "95111", state: "Bayern", bitrixContactId: "7002", customerNumber: "7002",
  customerType: "Bestandskunde", payer: "Selbstzahler", notes: "Stammkunde", parkenMoeglich: "Ja", wohnsituation: "Eigentum",
};
const HIT = { _id: "65f000000000000000000001", customerNumber: "7002", bitrixContactId: "7002", firstName: "Max", lastName: "Mustermann", company: "", city: "Musterhausen", kundendaten: SAVED };
const HIT2 = { _id: "65f000000000000000000002", customerNumber: "", firstName: "", lastName: "", company: "Muster GmbH", email: "info@muster.test", city: "", kundendaten: { company: "Muster GmbH", email: "info@muster.test" } };

// a form filled by hand before the act
const FILLED = [
  ["radio", "salutation", "Herr"], ["text", "firstName", "Alt"], ["text", "lastName", "Name"], ["text", "phone", "0000 1"], ["text", "email", "alt@example.test"],
  ["text", "street", "Altweg 1"], ["text", "notes", "Notiz von Hand"], ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"],
  ["check", "budgetMax", "on"], ["radio", "wohnumfeldDone", "Ja"], ["radio", "kk_rechnungskopie", "ja"], ["radio", "kk_rechnungskopie_art", "email"],
];

// group deal:    deal: answer of GET /api/bitrix/deal/:id
// group contact: id typed into "Bitrix Kontakt ID", contact: answer, deals: answer of …/deals
// group search:  q typed, search: answer, customer: answer of /api/customers/:id, pick: index clicked (none = no click)
const SCENARIOS = {
  "deal: contact with address, landlord approval needed": { group: "deal", types: ["bu", "bwt", "hl", "bl", "ah"], deal: deal(CONTACT, { erforderlich: true, liegtVor: false }) },
  "deal: contact without Anrede, phone, e-mail and address; owned home": { group: "deal", deal: deal(BARE, { erforderlich: false, liegtVor: null }) },
  "deal: Familie, region from the province, approval there": { group: "deal", deal: deal(FAMILY, { erforderlich: true, liegtVor: true }) },
  "deal: no contact": { group: "deal", deal: deal(null, { erforderlich: true, liegtVor: null }) },
  "deal: Bitrix fails": { group: "deal", deal: ERR(500, "BITRIX_ERROR", "Bitrix antwortet nicht") },
  "deal: not found": { group: "deal", deal: ERR(404, "NOT_FOUND", "Deal not found") },
  "deal: no number typed": { group: "deal", id: "" },
  "contact: empty offer": { group: "contact", id: "7001", contact: [200, { result: CONTACT }], deals: [200, { deals: [] }] },
  "contact: filled form, contact without e-mail and address": { group: "contact", setup: FILLED, id: "7003", contact: [200, { result: BARE }], deals: [200, { deals: [] }] },
  "contact: one deal of the contact": { group: "contact", id: "7001", contact: [200, { result: CONTACT }], deals: [200, { deals: [{ id: "4711", title: "Badumbau" }] }] },
  "contact: two deals of the contact": { group: "contact", id: "7001", contact: [200, { result: CONTACT }], deals: [200, { deals: [{ id: "4711", title: "A" }, { id: "4712", title: "B" }] }] },
  "contact: not found": { group: "contact", id: "7999", contact: [200, { result: null }] },
  "contact: Bitrix fails": { group: "contact", id: "7001", contact: ERR(500, "BITRIX_ERROR", "Bitrix antwortet nicht") },
  "contact: no id typed": { group: "contact", id: "" },
  "search: a customer found and picked": { group: "search", q: "Muster", search: [200, { ok: true, items: [HIT, HIT2] }], customer: [200, { ok: true, customer: HIT }], pick: 0 },
  "search: company without name picked": { group: "search", q: "Muster", search: [200, { ok: true, items: [HIT, HIT2] }], customer: [200, { ok: true, customer: HIT2 }], pick: 1 },
  "search: filled form, customer picked": { group: "search", setup: FILLED, q: "Muster", search: [200, { ok: true, items: [HIT] }], customer: [200, { ok: true, customer: HIT }], pick: 0 },
  "search: customer could not be read, the hit is used": { group: "search", q: "Muster", search: [200, { ok: true, items: [HIT] }], customer: ERR(500, "INTERNAL", "Fehler"), pick: 0 },
  "search: nothing found": { group: "search", q: "Zzz", search: [200, { ok: true, items: [] }] },
  "search: the search fails": { group: "search", q: "Muster", search: ERR(500, "INTERNAL", "Es ist ein interner Fehler aufgetreten. Bitte erneut versuchen.") },
  "search: typed and cleared again": { group: "search", q: "Mu", clear: true, search: [200, { ok: true, items: [HIT] }] },
};
if (require.main !== module) { module.exports = { SCENARIOS }; return; } // the test data only

const { chromium } = require("../../node_modules/playwright");
const LAUNCH = { headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) };
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
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

(async () => {
  let browser = await chromium.launch(LAUNCH);
  const out = { note: "generated by v2/scripts/capture-kundendaten-bitrix.cjs — do not edit", scenarios: [] };
  for (const [name, s] of Object.entries(SCENARIOS)) for (const type of s.types ?? ["bu"]) {
    if (process.env.ONLY && name !== process.env.ONLY) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = ([status, body]) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
      const seen = [];
      const note = (r) => { const u = new URL(r.request().url()); seen.push(`${r.request().method()} ${u.pathname}${u.search}`); };
      await page.route("**/api/auth/me", (r) => r.fulfill(json([200, { user: { email: "capture@local.test", name: "Capture", role: "user" } }])));
      await page.route("**/api/users", (r) => r.fulfill(json([200, [{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }]])));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.route("**/api/offers/by-deal/**", (r) => r.fulfill(json([200, []])));
      await page.route("**/api/bitrix/**", (r) => { note(r); return r.fulfill(json([200, {}])); });
      await page.route(/\/api\/bitrix\/deal\/[^/]+$/, (r) => { note(r); return r.fulfill(json(s.deal ?? [200, { contact: null, vermieter: { erforderlich: null, liegtVor: null } }])); });
      await page.route(/\/api\/bitrix\/contact\/[^/]+$/, (r) => { note(r); return r.fulfill(json(s.contact ?? [200, { result: null }])); });
      await page.route(/\/api\/bitrix\/contact\/[^/]+\/deals$/, (r) => { note(r); return r.fulfill(json(s.deals ?? [200, { deals: [] }])); });
      await page.route(/\/api\/customers\/search/, (r) => { note(r); return r.fulfill(json(s.search ?? [200, { ok: true, items: [] }])); });
      await page.route(/\/api\/customers\/[0-9a-f]{24}$/, (r) => { note(r); return r.fulfill(json(s.customer ?? ERR(404, "NOT_FOUND", "Kundendaten nicht gefunden."))); });

      const startOffer = async () => {
        await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
        await page.waitForFunction(() => location.hash === "#Kundendaten");
        await page.waitForTimeout(1200);
      };
      const payload = () => page.evaluate(() => window.buildPayload());
      const view = () => page.evaluate(() => {
        const on = (el) => !!el && el.getClientRects().length > 0 && !el.hidden;
        const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
        const status = document.getElementById("homeDealStatus");
        const modal = document.getElementById("dealActionModal");
        const list = document.getElementById("customerSearchResults");
        return {
          status: on(status) ? text(status) : "",
          dialog: modal && !modal.hidden ? text(document.getElementById("dealActionIdentity")) : "",
          toasts: [...document.querySelectorAll(".nt-toast")].map((t) => [text(t.querySelector(".nt-title")), text(t.querySelector(".nt-msg"))].filter(Boolean).join(": ")),
          results: list && list.classList.contains("visible") ? [...list.querySelectorAll(".customer-result-item")].map((i) => ({ main: text(i.querySelector(".customer-result-main")) || text(i), meta: text(i.querySelector(".customer-result-meta")) })) : null,
          search: document.getElementById("customerSearch")?.value ?? "",
          contactId: document.getElementById("bitrixContactId")?.value ?? "",
          deal: document.getElementById("auftragId")?.value ?? "",
        };
      });
      const input = (kind, field, value) => page.evaluate(([k, f, v]) => {
        const el = k === "radio" ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`) : document.querySelector(`#form-Kundendaten [name="${f}"]`) || document.getElementById(f);
        if (!el || (el.closest("label") || el).getClientRects().length === 0 || el.disabled) return false;
        if (k === "radio") el.checked = true; else if (k === "check") el.checked = v === "on"; else el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, [kind, field, value]);

      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.waitForTimeout(800);
      // what was typed and answered, so the replay can give the React screen the same
      const answers = Object.fromEntries(Object.entries(s).filter(([k]) => !["group", "types", "setup"].includes(k)));
      const entry = { name, group: s.group, type, setup: s.setup ?? [], skipped: [], answers };
      if (s.group === "deal") {
        // the reference: the same offer type started without a deal
        await startOffer();
        const plain = await payload();
        await page.goto(BASE + "/", { waitUntil: "load" });
        await page.waitForTimeout(800);
        await page.fill("#homeDealIdInput", s.id ?? "4711");
        await page.click("#btnLoadDeal");
        await page.waitForTimeout(800);
        entry.view = await view();
        entry.requests = seen.splice(0);
        if (entry.view.dialog) {
          await page.locator("#dealActionTiles button", { hasText: LABELS[type] }).click();
          await page.waitForFunction(() => location.hash === "#Kundendaten");
          await page.waitForTimeout(1500);
          entry.opened = { view: await view(), requests: seen.splice(0), stored: changed(plain, await payload()) };
        }
      } else {
        await startOffer();
        for (const [kind, field, value] of entry.setup) { if (!(await input(kind, field, value))) entry.skipped.push(field); await page.waitForTimeout(60); }
        await page.waitForTimeout(500);
        const base = await payload();
        seen.splice(0);
        if (s.group === "contact") {
          await page.fill("#bitrixContactId", s.id);
          await page.click("#loadBitrixContactBtn");
          await page.waitForTimeout(1200);
        } else {
          await page.locator("#customerSearch").pressSequentially(s.q, { delay: 60 }); // a user typing
          await page.waitForTimeout(700);
          if (s.clear) { await page.fill("#customerSearch", ""); await page.waitForTimeout(700); }
          entry.list = await view();
          entry.listRequests = seen.splice(0);
          if (s.pick !== undefined) {
            await page.locator("#customerSearchResults .customer-result-item").nth(s.pick).click();
            await page.waitForTimeout(1200);
          }
        }
        entry.view = await view();
        entry.requests = seen.splice(0);
        entry.stored = changed(base, await payload());
      }
      console.log(`${type} · ${name}`);
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
