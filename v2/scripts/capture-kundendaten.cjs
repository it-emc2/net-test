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

const NOT_AH = ["bu", "bwt", "hl", "bl"];
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
    "name, address and e-mail entered in two goes (what follows them elsewhere)": [
      ["text", "firstName", "Er"], ["text", "lastName", "Muster"], ["text", "street", "Teststr"], ["text", "postalCode", "950"], ["text", "city", "Ho"], ["text", "email", "er@example.test"],
      ["text", "firstName", "Erika"], ["text", "lastName", "Mustermann"], ["text", "street", "Teststraße 1"], ["text", "postalCode", "95028"], ["text", "city", "Hof"], ["text", "email", "erika@example.test"],
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
  // care level and budget. `only`: offer types the scenario applies to (the budget options are
  // not offered for Alltagshilfe); ["check", name, "on"|"off"] ticks or unticks a checkbox.
  "kundendaten-care.json": {
    "care level 3": [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"]],
    "care level 3, budget 4.180 maximal": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"]] },
    "names entered, then two persons (name and greeting of both)": { only: NOT_AH, steps: [["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Mustermann"], ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"]] },
    "two persons, then the name is changed": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"], ["radio", "salutation", "Herr"], ["text", "lastName", "Beispiel"]] },
    "two persons, then maximal instead": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"], ["check", "budgetMax", "on"]] },
    "premium, then no care level": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "premium", "on"], ["radio", "hasPflegegrad", "Nein"]] },
    "premium with co-payment, then Selbstzahler and back": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "2"], ["check", "premium", "on"], ["check", "budgetCopay", "on"], ["text", "copayAmount", "100"], ["radio", "payer", "Selbstzahler"], ["radio", "payer", "Kassenkunde"]] },
    "care level 2, maximal with co-payment 500": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "2"], ["check", "budgetMax", "on"], ["check", "budgetCopay", "on"], ["text", "copayAmount", "500"]] },
    "care level 4, two persons": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "4"], ["check", "twoPersons", "on"]] },
    "care level 5, premium": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "5"], ["check", "premium", "on"]] },
    "maximal, then two persons (only one main option)": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"], ["check", "twoPersons", "on"]] },
    "maximal with co-payment, then maximal unticked": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"], ["check", "budgetCopay", "on"], ["text", "copayAmount", "300"], ["check", "budgetMax", "off"]] },
    "care level and budget chosen, then no care level": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"], ["check", "budgetCopay", "on"], ["text", "copayAmount", "300"], ["radio", "hasPflegegrad", "Nein"]] },
    "no care level": [["radio", "hasPflegegrad", "Nein"]],
    "care level applied for (beantragt)": { only: ["bu", "ah"], steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "beantragt"]] },
    "care level 3 with budget, Selbstzahler, back to Kassenkunde": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"], ["check", "budgetCopay", "on"], ["text", "copayAmount", "250"], ["radio", "payer", "Selbstzahler"], ["radio", "payer", "Kassenkunde"]] },
    "care level 3 with budget, then Selbstzahler": { only: NOT_AH, steps: [["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "budgetMax", "on"], ["radio", "payer", "Selbstzahler"]] },
  },
  // the second person of a two-person offer (["select", name, value] chooses from a list)
  "kundendaten-partner.json": {
    "second person with all details": { only: NOT_AH, steps: [
      ["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Mustermann"],
      ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"],
      ["select", "partnerSalutation", "Herr"], ["text", "partnerFirstName", "Max"], ["text", "partnerLastName", "Mustermann"], ["radio", "partnerPflegegrad", "2"],
      ["text", "partnerKassenkundeName", "BKK Test"], ["text", "partnerGeburtsdatum", "1941-05-06"], ["text", "partnerKvnr", "B987654321"],
      ["text", "partnerPflegegradSeit", "2023-09"], ["text", "partnerKrankenkasseAdresse", "Kassenweg 2, 95028 Hof"],
    ] },
    "second person entered, then two persons unticked": { only: NOT_AH, steps: [
      ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"],
      ["select", "partnerSalutation", "Frau"], ["text", "partnerFirstName", "Eva"], ["text", "partnerLastName", "Probe"], ["radio", "partnerPflegegrad", "4"],
      ["check", "twoPersons", "off"],
    ] },
    "second person entered, then maximal instead": { only: NOT_AH, steps: [
      ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"],
      ["select", "partnerSalutation", "Frau"], ["text", "partnerFirstName", "Eva"], ["text", "partnerLastName", "Probe"], ["radio", "partnerPflegegrad", "4"],
      ["check", "budgetMax", "on"],
    ] },
    "second person entered, unticked and ticked again": { only: NOT_AH, steps: [
      ["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"],
      ["select", "partnerSalutation", "Frau"], ["text", "partnerFirstName", "Eva"], ["text", "partnerLastName", "Probe"],
      ["check", "twoPersons", "off"], ["check", "twoPersons", "on"],
    ] },
  },
  // funding and property details, notes. A step whose control is not on the page for that offer
  // type is not made; it is listed under `skipped`.
  "kundendaten-object.json": {
    "application made and approved": [["radio", "pflegekasseAntrag", "Ja"], ["radio", "pflegekasseGenehmigung", "Ja"]],
    "application approved, then not made: may EmC2 apply": [["radio", "pflegekasseAntrag", "Ja"], ["radio", "pflegekasseGenehmigung", "Nein"], ["radio", "pflegekasseAntrag", "Nein"], ["radio", "pflegekasseEmc2Antrag", "Ja"]],
    "rented, landlord approval needed and pending": [["radio", "wohnsituation", "Miete"], ["radio", "vermieterGenehmigungErforderlich", "Ja"], ["radio", "vermieterGenehmigung", "Noch ausstehend"]],
    "rented with approval, then owned": [["radio", "wohnsituation", "Miete"], ["radio", "vermieterGenehmigungErforderlich", "Nein"], ["radio", "vermieterGenehmigung", "Ja"], ["radio", "wohnsituation", "Eigentum"]],
    "stairs only, bathroom on another floor": [["radio", "zugangWohnung", "Nur Treppe"], ["radio", "badStockwerk", "Anderes OG"], ["text", "stockwerkBadSonst", "3. OG"]],
    "another floor named, then ground floor": [["radio", "zugangWohnung", "Aufzug vorhanden"], ["radio", "badStockwerk", "Anderes OG"], ["text", "stockwerkBadSonst", "DG"], ["radio", "badStockwerk", "EG"]],
    "parking and notes": [["radio", "parkenMoeglich", "Nein"], ["text", "parkDetails", "Hinterhof, Halteverbot"], ["text", "notes", "Bitte klingeln bei Probe"]],
    "living with relatives, parking possible": [["radio", "wohnsituation", "bei Angehörigen"], ["radio", "parkenMoeglich", "Ja"]],
    "application answers, Selbstzahler, back to Kassenkunde": [["radio", "pflegekasseAntrag", "Ja"], ["radio", "pflegekasseGenehmigung", "Ja"], ["radio", "wohnsituation", "Miete"], ["radio", "payer", "Selbstzahler"], ["radio", "payer", "Kassenkunde"]],
    "application answers, then Selbstzahler": [["radio", "pflegekasseAntrag", "Nein"], ["radio", "pflegekasseEmc2Antrag", "Nein"], ["radio", "wohnsituation", "Miete"], ["radio", "payer", "Selbstzahler"]],
  },
};
// which of these questions are on the page at the end (by field name)
const QUESTIONS = ["pflegekasseAntrag", "pflegekasseGenehmigung", "pflegekasseEmc2Antrag", "wohnsituation", "vermieterGenehmigungErforderlich", "vermieterGenehmigung",
  "zugangWohnung", "badStockwerk", "stockwerkBadSonst", "parkenMoeglich", "parkDetails", "notes",
  "partnerSalutation", "partnerFirstName", "partnerPflegegrad", "partnerKvnr"];
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
// what is on the page (not hidden) after the steps — the React screen shows the same parts
const PROBE = ["kassenkundeDetails", "kkRechnungskopieArtField", "kk_geburtsdatum", "kk_versichertennr", "pflegegradSection", "pflegekasseAntragRow",
  "pflegegradLevelRow", "budgetOptionsPanel", "copayField", "ehepaarPartnerPanel", "wohnumfeldPanel"];

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
    if (process.env.CAPTURE_ONLY && !file.includes(process.env.CAPTURE_ONLY)) continue; // e.g. CAPTURE_ONLY=care
    const out = { note: "generated by v2/scripts/capture-kundendaten.cjs — do not edit", scenarios: [] };
    // the contact part is the same form for every offer type (recorded for BU); the payer part
    // has rules per offer type and is recorded for each
    const types = file === "kundendaten-contact.json" ? ["bu"] : Object.keys(TILES);
    for (const type of types) for (const [name, spec] of Object.entries(scenarios)) {
      const steps = Array.isArray(spec) ? spec : spec.steps;
      if (!Array.isArray(spec) && !spec.only.includes(type)) continue;
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
      const skipped = [];
      for (const [kind, field, value] of steps) {
        const made = await page.evaluate(([k, f, v]) => {
          // choosing / typing like a user: set the control, then tell the page
          const el = k === "radio"
            ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`)
            : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (k === "check") { // a real click: the page's own handlers decide what else changes
            const box = document.querySelector(`#form-Kundendaten input[type=checkbox][name="${f}"]`);
            if (box.checked !== (v === "on")) box.click();
            return true;
          }
          // a control that is not on the page for this offer type cannot be used by anyone
          if (!el || (el.closest("label") || el).getClientRects().length === 0 || el.disabled) return false;
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, [kind, field, value]);
        if (!made) skipped.push(field);
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
      entry.outside = sortKeys(changesOutside(base, now));
      if (file !== "kundendaten-contact.json") { entry.type = type; entry.shown = shown; }
      if (file === "kundendaten-object.json" || file === "kundendaten-partner.json") {
        entry.skipped = skipped;
        entry.questions = await page.evaluate((names) => Object.fromEntries(names.map((n) => {
          const el = document.querySelector(`#form-Kundendaten [name="${n}"]`);
          return [n, !!el && !el.disabled && (el.closest("label") || el).getClientRects().length > 0];
        })), QUESTIONS);
      }
      if (file === "kundendaten-care.json") entry.budgetText = await page.evaluate(() => (document.getElementById("pgbBudgetOut")?.innerText || "").replace(/\s+/g, " ").trim());
      out.scenarios.push(entry);
      console.log(`${file} · ${type} · ${name}: ${Object.keys(kd).length} keys`);
      await ctx.close();
    }
    fs.mkdirSync(FIXTURES, { recursive: true });
    fs.writeFileSync(path.join(FIXTURES, file), JSON.stringify(out, null, 2) + "\n");
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
