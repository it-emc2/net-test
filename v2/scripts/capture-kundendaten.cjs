// Records what today's UI stores in `Kundendaten` for given inputs (ADR 026, phase 4): the
// reference the React Kundendaten screen is tested against (apps/web/test/kundendaten.test.tsx).
// Each scenario types into today's form exactly like a user (by field name), then reads
// `window.buildPayload().Kundendaten`. The v2 add-ons are blocked.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-kundendaten.cjs   → v2/apps/web/test/fixtures/kundendaten-*.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const FIXTURES = path.join(__dirname, "..", "apps", "web", "test", "fixtures");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

// steps: ["text", name, value] | ["radio", name, value]   — invented test data only
const FILES = {
  "kundendaten-contact.json": {
    "contact and address": [
      ["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Mustermann"],
      ["text", "phone", "+49 9281 000000"], ["text", "email", "erika@example.test"], ["text", "emailCc", "tochter@example.test"],
      ["text", "street", "Teststraße 1"], ["text", "city", "Hof"], ["text", "state", "Bayern"], ["text", "postalCode", "95028"],
      ["text", "deployment", "Gartenhaus"], ["radio", "customerType", "Bestandskunde"],
    ],
    "with a contact person": [
      ["radio", "salutation", "Herr"], ["text", "firstName", "Max"], ["text", "lastName", "Beispiel"],
      ["radio", "hasContactPerson", "Ja"], ["text", "cp_name", "Petra Beispiel"], ["text", "cp_phone", "+49 9281 111111"],
      ["radio", "cp_salutation", "Frau"], ["text", "cp_email", "petra@example.test"], ["text", "cp_street", "Nebenweg 2"],
      ["text", "cp_city", "Rehau"], ["text", "cp_state", "Bayern"], ["text", "cp_postalCode", "95111"],
    ],
    "contact person filled, then switched back to Nein": [
      ["radio", "salutation", "Familie"], ["text", "firstName", "Anna"], ["text", "lastName", "Probe"],
      ["radio", "hasContactPerson", "Ja"], ["text", "cp_name", "Jo Probe"], ["text", "cp_phone", "0170 0000000"], ["radio", "cp_salutation", "Herr"],
      ["radio", "hasContactPerson", "Nein"],
    ],
  },
  "kundendaten-payer.json": {
    "Kassenkunde with insurance details, invoice copy by e-mail": [
      ["text", "kassenkundeName", "AOK Test"], ["text", "kk_krankenkasseAdresse", "Kassenweg 1, 95028 Hof"], ["text", "kk_pflegegradSeit", "2024-03"],
      ["radio", "kk_rechnungskopie", "ja"], ["radio", "kk_rechnungskopie_art", "email"],
    ],
    "Kassenkunde, invoice copy ja (default kind), then nein again": [
      ["text", "kassenkundeName", "BKK Test"], ["radio", "kk_rechnungskopie", "ja"], ["radio", "kk_rechnungskopie", "nein"],
    ],
    "insurance details filled, then Selbstzahler": [
      ["text", "kassenkundeName", "AOK Test"], ["text", "kk_krankenkasseAdresse", "Kassenweg 1"], ["radio", "kk_rechnungskopie", "ja"],
      ["radio", "payer", "Selbstzahler"],
    ],
    "Selbstzahler and back to Kassenkunde": [
      ["text", "kassenkundeName", "AOK Test"], ["radio", "kk_rechnungskopie", "ja"], ["radio", "kk_rechnungskopie_art", "email"],
      ["radio", "payer", "Selbstzahler"], ["radio", "payer", "Kassenkunde"],
    ],
  },
};
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
// what is on the page (not hidden) after the steps — the React screen shows the same parts
const PROBE = ["kassenkundeDetails", "kkRechnungskopieArtField", "kk_geburtsdatum", "kk_versichertennr", "pflegegradSection", "pflegekasseAntragRow"];

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

// the parts of the payload outside Kundendaten that differ from `base` (dotted paths)
function changesOutside(base, now) {
  const out = {};
  const walk = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) if (k !== "Kundendaten") walk(base[k], now[k], k);
  for (const k of Object.keys(out)) if (/^mail\.(subject|body)$|^offerNumber$/.test(k)) delete out[k]; // carry the generated offer number
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [file, scenarios] of Object.entries(FILES)) {
    const out = { note: "generated by v2/scripts/capture-kundendaten.cjs — do not edit", scenarios: [] };
    // the contact part is the same form for every offer type (recorded for BU); the payer part
    // has rules per offer type and is recorded for each
    const types = file === "kundendaten-contact.json" ? ["bu"] : Object.keys(TILES);
    for (const type of types) for (const [name, steps] of Object.entries(scenarios)) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1500);
      const base = await page.evaluate(() => window.buildPayload());
      for (const [kind, field, value] of steps) {
        await page.evaluate(([k, f, v]) => {
          // choosing / typing like a user: set the control, then tell the page
          const el = k === "radio"
            ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`)
            : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, [kind, field, value]);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(600);
      const now = await page.evaluate(() => window.buildPayload());
      const shown = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
        const el = document.getElementById(id);
        return [id, !!el && el.getClientRects().length > 0];
      })), PROBE);
      const kd = now.Kundendaten;
      for (const k of ["date", "ansprechpartner", "emc2_contact"]) if (k in kd) kd[k] = ""; // day and user, not input
      const entry = { name, steps, kundendaten: sortKeys(kd) };
      if (file !== "kundendaten-contact.json") { entry.type = type; entry.outside = sortKeys(changesOutside(base, now)); entry.shown = shown; }
      out.scenarios.push(entry);
      console.log(`${file} · ${type} · ${name}: ${Object.keys(kd).length} keys`);
      await ctx.close();
    }
    fs.mkdirSync(FIXTURES, { recursive: true });
    fs.writeFileSync(path.join(FIXTURES, file), JSON.stringify(out, null, 2) + "\n");
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
