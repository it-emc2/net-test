// Records what today's UI shows and stores for the Alltagshilfe-only blocks of Kundendaten
// („Vorbereitung vor dem Termin“, „2 Personen mit Pflegegrad im Haushalt“, „Besondere Hinweise“,
// „Lebenssituation“): the reference the React page is tested against
// (apps/web/test/kundendaten-ah.test.tsx). Same style as capture-kundendaten.cjs: each scenario
// types into today's form like a user (by field name), then reads `window.buildPayload()`.
// The v2 add-ons are blocked.
//
//   steps: ["text", name, value] | ["radio", name, value] | ["check", name, "on"|"off"] (a real click)
//          ["open", Kundendaten fields] the offer as it is now, with these fields ("<removed>" drops one),
//          is opened again (restoreConfiguratorFromOffer) — "reopen and save unchanged"
//   invented test data only ("Erika Muster", "Max Muster")
//
//   bash ~/emc2-local/ah4/server.sh &   (or v2/scripts/preview.sh)
//   CAPTURE_BASE=http://localhost:3002 node v2/scripts/capture-kundendaten-ah.cjs → v2/apps/web/test/fixtures/kundendaten-ah.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "kundendaten-ah.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const NAMES = [["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Muster"]];
const P2 = (level, sal = "Herr") => [["check", "ahZweiPersonen", "on"], ["radio", "p2Salutation", sal], ["text", "p2FirstName", "Max"], ["text", "p2LastName", "Muster"], ["radio", "p2Pflegegrad", level]];
const PREP = ["prep_terminBestaetigt", "prep_erstberatungsbogen", "prep_visitenkarten", "prep_leistungsuebersicht", "prep_mustervertrag"];
const HINTS = ["ah_mobilitaet", "ah_allergien", "ah_demenz", "ah_sprache"];
const ALL = [
  ...NAMES, ...PREP.map((n) => ["check", n, "on"]), ...P2("3", "Herr"),
  ["radio", "ah_mobilitaet_choice", "Ja"], ["radio", "ah_allergien_choice", "Nein"], ["radio", "ah_demenz_choice", "Sonstiges"], ["text", "ah_demenz", "leichte Vergesslichkeit"],
  ["radio", "ah_sprache_choice", "Nein"], ["text", "ah_sonstiges", "Mag keinen Kaffee, Mittagsruhe 13–14 Uhr"],
  ["radio", "ah_alleinLebend", "Ja"], ["radio", "ah_haustiere", "Ja"], ["radio", "ah_schluessel", "Schlüsselübergabe klären"], ["radio", "ah_bestehendeHilfe", "Pflegedienst"],
];

const SCENARIOS = {
  "nothing answered": [],
  "preparation: all five ticked": PREP.map((n) => ["check", n, "on"]),
  "preparation: two ticked, one unticked again": [["check", PREP[0], "on"], ["check", PREP[3], "on"], ["check", PREP[0], "off"]],
  "two persons, Pflegegrad 1": [...NAMES, ...P2("1")],
  "two persons, Pflegegrad 2": [...NAMES, ...P2("2", "Frau")],
  "two persons, Pflegegrad 3": [...NAMES, ...P2("3")],
  "two persons, Pflegegrad 4": [...NAMES, ...P2("4")],
  "two persons, Pflegegrad 5": [...NAMES, ...P2("5", "Frau")],
  "two persons, Pflegegrad beantragt": [...NAMES, ...P2("beantragt")],
  "two persons ticked, nothing else": [["check", "ahZweiPersonen", "on"]],
  "two persons entered, then unticked": [...NAMES, ...P2("2"), ["check", "ahZweiPersonen", "off"]],
  "two persons entered, unticked and ticked again": [...NAMES, ...P2("2"), ["check", "ahZweiPersonen", "off"], ["check", "ahZweiPersonen", "on"]],
  "two persons as Selbstzahler": [...NAMES, ["radio", "payer", "Selbstzahler"], ...P2("4")],
  "two persons, then the customer's name changed": [...NAMES, ...P2("3"), ["text", "lastName", "Beispiel"]],
  "notes: all Ja": HINTS.map((h) => ["radio", `${h}_choice`, "Ja"]),
  "notes: all Nein": HINTS.map((h) => ["radio", `${h}_choice`, "Nein"]),
  "notes: all Sonstiges with details": HINTS.flatMap((h, i) => [["radio", `${h}_choice`, "Sonstiges"], ["text", h, `Details ${i + 1}`]]),
  "notes: Sonstiges without details": [["radio", "ah_mobilitaet_choice", "Sonstiges"]],
  "notes: Sonstiges with details, then Ja": [["radio", "ah_allergien_choice", "Sonstiges"], ["text", "ah_allergien", "Nüsse"], ["radio", "ah_allergien_choice", "Ja"]],
  "notes: Ja, then Sonstiges": [["radio", "ah_demenz_choice", "Ja"], ["radio", "ah_demenz_choice", "Sonstiges"]],
  "notes: Nein, then Sonstiges with details": [["radio", "ah_sprache_choice", "Nein"], ["radio", "ah_sprache_choice", "Sonstiges"], ["text", "ah_sprache", "Spricht Polnisch"]],
  "notes: free text only": [["text", "ah_sonstiges", "Hört schlecht, bitte laut klingeln"]],
  "living: alone, pets, key, Pflegedienst": [["radio", "ah_alleinLebend", "Ja"], ["radio", "ah_haustiere", "Ja"], ["radio", "ah_schluessel", "Ja"], ["radio", "ah_bestehendeHilfe", "Pflegedienst"]],
  "living: not alone, no pets, no key, Angehörige": [["radio", "ah_alleinLebend", "Nein"], ["radio", "ah_haustiere", "Nein"], ["radio", "ah_schluessel", "Nein"], ["radio", "ah_bestehendeHilfe", "Angehörige"]],
  "living: key handover to clarify, Nachbarn": [["radio", "ah_schluessel", "Schlüsselübergabe klären"], ["radio", "ah_bestehendeHilfe", "Nachbarn"]],
  "living: no help yet (keine), answer changed": [["radio", "ah_bestehendeHilfe", "Pflegedienst"], ["radio", "ah_bestehendeHilfe", "keine"], ["radio", "ah_alleinLebend", "Ja"], ["radio", "ah_alleinLebend", "Nein"]],
  "everything answered": ALL,
  // reopen and save unchanged
  "everything answered, reopened unchanged": [...ALL, ["open", {}]],
  "two persons with Pflegegrad, reopened unchanged": [...NAMES, ...P2("beantragt", "Frau"), ["open", {}]],
  // the React page's one deliberate difference (details also after „Ja“), stored in React's shape and opened in today's UI
  "reopened: Ja with details (React's shape)": [...NAMES, ["open", { ah_mobilitaet_choice: "Ja", ah_mobilitaet: "Rollator, Treppe nur mit Hilfe", ah_allergien_choice: "Ja", ah_allergien: "Ja" }]],
  // older offers: only the text (before the chips)
  "reopened: older offer with free text only": [["open", { ah_mobilitaet_choice: "<removed>", ah_mobilitaet: "Gehstock", ah_demenz_choice: "<removed>", ah_demenz: "Nein", ah_sprache_choice: "<removed>", ah_sprache: "Ja" }]],
  "reopened: preparation ticks stored as Ja": [["open", { prep_terminBestaetigt: "Ja", prep_mustervertrag: "Ja" }]],
};

// what the user sees of the four blocks (and the two contradictions in today's page)
async function viewOf(page) {
  return page.evaluate(() => {
    const vis = (el) => !!el && el.getClientRects().length > 0;
    const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
    const byName = (n) => document.querySelector(`#form-Kundendaten [name="${n}"]`);
    const block = (n) => byName(n)?.closest("details");
    const radios = (n) => [...document.querySelectorAll(`#form-Kundendaten input[type=radio][name="${n}"]`)].filter((r) => vis(r.closest("label"))).map((r) => r.value);
    const checked = (n) => document.querySelector(`#form-Kundendaten input[name="${n}"]:checked`)?.value ?? "";
    const prep = block("prep_terminBestaetigt");
    const p2 = document.getElementById("ahPerson2Fields");
    const hints = block("ah_mobilitaet_choice"), life = block("ah_alleinLebend");
    const q = (n) => txt(byName(n)?.closest(".full")?.querySelector(":scope > label"));
    const order = [
      ["Vorbereitung", prep], ["Kontaktdaten", byName("firstName")], ["2 Personen", byName("ahZweiPersonen")?.closest("label")], ["Kostenträger", byName("payer")?.closest("label")],
      ["Pflegegrad", document.getElementById("pflegegradSection")], ["Besondere Hinweise", hints], ["Objekt", byName("parkenMoeglich")?.closest("label")],
      ["Interne Liste", document.getElementById("internalTodosSection")], ["Lebenssituation", life],
    ].filter(([, el]) => vis(el));
    order.sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return {
      prep: { shown: vis(prep), open: !!prep?.open, title: txt(prep?.querySelector("summary")), items: [...(prep?.querySelectorAll("label.check-pill") || [])].map((l) => [l.querySelector("input").name, txt(l)]), ticked: [...(prep?.querySelectorAll("input:checked") || [])].map((i) => i.name) },
      twoPersons: {
        shown: vis(byName("ahZweiPersonen")?.closest("label")), label: txt(byName("ahZweiPersonen")?.closest("label")), ticked: !!byName("ahZweiPersonen")?.checked,
        fields: vis(p2), salutations: radios("p2Salutation"), levels: [...document.querySelectorAll('input[name="p2Pflegegrad"]')].map((r) => r.value),
        salutation: checked("p2Salutation"), firstName: byName("p2FirstName")?.value ?? "", lastName: byName("p2LastName")?.value ?? "", level: checked("p2Pflegegrad"),
      },
      hints: {
        shown: vis(hints), open: !!hints?.open, title: txt(hints?.querySelector("summary")),
        questions: ["ah_mobilitaet", "ah_allergien", "ah_demenz", "ah_sprache"].map((n) => ({ name: n, label: q(`${n}_choice`), options: radios(`${n}_choice`), choice: checked(`${n}_choice`), detailsShown: vis(byName(n)), details: byName(n)?.value ?? "", placeholder: byName(n)?.placeholder ?? "" })),
        other: { label: txt(document.querySelector('label[for="ah_sonstiges"]')), value: byName("ah_sonstiges")?.value ?? "" },
      },
      living: {
        shown: vis(life), open: !!life?.open, title: txt(life?.querySelector("summary")),
        questions: ["ah_alleinLebend", "ah_haustiere", "ah_schluessel", "ah_bestehendeHilfe"].map((n) => ({ name: n, label: q(n), options: radios(n), choice: checked(n) })),
      },
      // contradictions found in the analysis: what an Alltagshilfe user really sees
      pflegegradSection: vis(document.getElementById("pflegegradSection")),
      wohnsituation: { shown: vis(byName("wohnsituation")?.closest(".full")), options: radios("wohnsituation") },
      order: order.map(([n]) => n),
    };
  });
}

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
function changesOutside(base, now) {
  const out = {};
  const walk = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) if (k !== "Kundendaten") walk(base[k], now[k], k);
  for (const k of Object.keys(out)) if (/^mail\.(subject|body)$|^offerNumber$/.test(k)) delete out[k];
  return out;
}

if (require.main === module) (async () => {
  const { chromium } = require("../../node_modules/playwright");
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-kundendaten-ah.cjs — do not edit", scenarios: [] };
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="AH-Alltagshilfe"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1500);
      const base = await page.evaluate(() => window.buildPayload());
      // requests the page makes while the steps are made (price, save …) — by path
      const requests = [];
      let counting = true;
      page.on("request", (r) => { const u = new URL(r.url()); if (counting && u.pathname.startsWith("/api/")) requests.push(`${r.method()} ${u.pathname}`); });
      const skipped = [];
      for (const [kind, field, value] of steps) {
        if (kind === "open") {
          await page.evaluate(async (fields) => {
            const p = window.buildPayload(), kd = { ...p.Kundendaten, ...fields };
            for (const k of Object.keys(kd)) if (kd[k] === "<removed>") delete kd[k];
            await window.restoreConfiguratorFromOffer({ payload: { ...p, Kundendaten: kd } });
            window.setStep("Kundendaten");
          }, field);
          await page.waitForTimeout(1500);
          continue;
        }
        const made = await page.evaluate(([k, f, v]) => {
          if (k === "check") { // a real click: the page's own handlers decide what else changes
            const box = document.querySelector(`#form-Kundendaten input[type=checkbox][name="${f}"]`);
            box.closest("details")?.setAttribute("open", ""); // the preparation list is folded away: opened first, like a user would
            if (box.checked !== (v === "on")) box.click();
            return true;
          }
          const el = k === "radio"
            ? document.querySelector(`#form-Kundendaten input[type=radio][name="${f}"][value="${v}"]`)
            : document.querySelector(`#form-Kundendaten [name="${f}"]`);
          if (!el || (el.closest("label") || el).getClientRects().length === 0 || el.disabled) return false;
          if (k === "radio") el.checked = true; else el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, [kind, field, value]);
        if (!made) skipped.push(`${field}=${value}`);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(800);
      counting = false;
      const now = await page.evaluate(() => window.buildPayload());
      const kd = now.Kundendaten;
      for (const k of ["date", "ansprechpartner", "emc2_contact"]) if (k in kd) kd[k] = "";
      const entry = { name, steps, skipped, kundendaten: sortKeys(kd), outside: sortKeys(changesOutside(base, now)), view: await viewOf(page), requests: requests.sort() };
      console.log(`${name}: ${Object.keys(kd).length} keys, ${requests.length} requests${skipped.length ? `, skipped ${skipped}` : ""}`);
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
        browser = await chromium.launch({ headless: true });
      }
    }
    out.scenarios.push(entry);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

module.exports = { SCENARIOS };
