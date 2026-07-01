const { test, expect } = require("@playwright/test");

const BASE_URL = "http://localhost:3001";

// Minimal HnD-only view-model (Kassenkunde).
const HND_ONLY = {
  hasHnd: true, hasAb: false,
  isSelbstzahler: false, servicepauschale: 1.20, zoneData: { zone: 2, billMin: 15 },
  totalMonatlichH: 12.5, totalEinsaetze: 4, anfahrtTotal: 31.84,
  leistungenTotal: 507.0, gesamtBase: 538.84,
  hndTaskLabels: ["Reinigung der Wohnung", "Wäschepflege"],
  schedRows: [
    { regelmaessigkeit: "Wöchentlich", dauerMin: 120, reiseRoundMin: 30, perVisitMin: 150, freq: 4.33, monthlyH: 10.83 },
  ],
  abTotalMonatlichH: 0, abTotalEinsaetze: 0, abAnfahrtTotal: 0, abLeistungenTotal: 0,
  abGesamtBase: 0, abKmRate: 0.35, abTaskLabels: [], abSchedRows: [],
  gesamt: 538.84,
};

async function build(page, vm) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__buildAHKostenHTML === "function", null, { timeout: 15000 });
  return page.evaluate((v) => window.__buildAHKostenHTML(v), vm);
}

test("HnD table shows Angebot line items with correct values", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("Haushaltsnahe Dienstleistungen");
  // Leistungen row: 12,5 h × 40,56 € = 507,00 €
  expect(html).toContain("40,56");
  expect(html).toContain("507,00");
  // Anfahrtspauschale row: 4 × 7,96 € = 31,84 €
  expect(html).toContain("Anfahrtspauschale");
  expect(html).toContain("7,96");
  expect(html).toContain("31,84");
  // Gesamt HnD-Leistungen
  expect(html).toContain("Gesamt HnD-Leistungen");
  expect(html).toContain("538,84");
});

const BOTH = {
  ...HND_ONLY,
  hasAb: true,
  abTotalMonatlichH: 6.0, abTotalEinsaetze: 2, abAnfahrtTotal: 15.92,
  abLeistungenTotal: 318.24, abGesamtBase: 334.16, abKmRate: 0.35,
  abTaskLabels: ["Begleitung zu Terminen"], abSchedRows: [],
  gesamt: 873.0,
};

const EMPTY = { ...HND_ONLY, hasHnd: false, hasAb: false, gesamt: 0 };

test("Alltagsbegleitung table renders with its rate", async ({ page }) => {
  const html = await build(page, BOTH);
  expect(html).toContain("Alltagsbegleitung");
  expect(html).toContain("53,04");
  expect(html).toContain("318,24");
  expect(html).toContain("334,16");
});

test("combined grand total appears only when both services exist", async ({ page }) => {
  const both = await build(page, BOTH);
  expect(both).toContain("873,00");
  // The combined grand-total block is the only element rendered at font-weight:800.
  expect(both).toContain("font-weight:800");
  const hnd = await build(page, HND_ONLY);
  // HnD-only: no combined grand-total block.
  expect(hnd).not.toContain("font-weight:800");
});

test("empty state shown when nothing configured", async ({ page }) => {
  const html = await build(page, EMPTY);
  expect(html).toContain("Noch keine Leistung konfiguriert");
});

test("details block is present but hidden by default, with breakdown + zone", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("data-ah-details");
  expect(html).toContain("hidden");                 // collapsed by default
  expect(html).toContain("data-ah-details-toggle"); // toggle button
  expect(html).toContain("Details");                // button label
  // breakdown content
  expect(html).toContain("Wöchentlich");
  expect(html).toContain("Zone 2");                 // zone banner inside details
});

const HND_SELBSTZAHLER = { ...HND_ONLY, isSelbstzahler: true, gesamt: 540.04 };

test("Selbstzahler: Servicepauschale is a table line folded into the total", async ({ page }) => {
  const html = await build(page, HND_SELBSTZAHLER);
  expect(html).toContain("Servicepauschale");
  expect(html).toContain("1,20");
  // total for the HnD service = gesamtBase + servicepauschale = 540,04
  expect(html).toContain("540,04");
});

test("Kassenkunde: Servicepauschale is a footnote, not in the total", async ({ page }) => {
  const html = await build(page, HND_ONLY);
  expect(html).toContain("Separate Direktrechnung");
  expect(html).toContain("Servicepauschale");
  // HnD total stays at gesamtBase
  expect(html).toContain("538,84");
});

test("Alltagsbegleitung shows Fahrten/km footnote", async ({ page }) => {
  const html = await build(page, BOTH);
  expect(html).toContain("Fahrten im Rahmen der Alltagsbegleitung");
  expect(html).toContain("0,35"); // €/km
});

test("Dauer entry uses separate hour + minute inputs that serialize to H:MM", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(() => {
    const pageAh = document.getElementById("page-ah");
    if (pageAh) pageAh.hidden = false;
    document.getElementById("ahAddHaushaltBtn").click();
    const cards = document.querySelectorAll("#ahListHaushalt .ah-service-card");
    const card = cards[cards.length - 1];
    const row = card.querySelector(".ah-sched-row");
    const h = row.querySelector(".ah-dauer-h");
    const m = row.querySelector(".ah-dauer-m");
    const hidden = row.querySelector("[data-card-field=dauer]");
    const reg = row.querySelector("[data-card-field=regelmaessigkeit]");
    reg.value = "Wöchentlich"; reg.dispatchEvent(new Event("change", { bubbles: true }));
    h.value = "1"; h.dispatchEvent(new Event("input", { bubbles: true }));
    m.value = "30"; m.dispatchEvent(new Event("input", { bubbles: true }));
    const out = {
      twoInputs: !!h && !!m,
      hiddenIsHidden: hidden.type === "hidden",
      visibleNotTaggedDauer: !h.matches("[data-card-field=dauer]") && !m.matches("[data-card-field=dauer]"),
      hiddenValue: hidden.value,
      serialized: document.getElementById("ahServicesJson").value.includes('"dauer":"1:30"'),
    };
    m.value = "90"; m.dispatchEvent(new Event("input", { bubbles: true }));
    out.clamp = m.value === "59" && hidden.value === "1:59";
    card.remove();
    return out;
  });
  expect(r.twoInputs).toBe(true);
  expect(r.hiddenIsHidden).toBe(true);
  expect(r.visibleNotTaggedDauer).toBe(true);
  expect(r.hiddenValue).toBe("1:30");
  expect(r.serialized).toBe(true);
  expect(r.clamp).toBe(true);
});

test("Menge (Einsätze count) is rounded to 2 decimals, not raw", async ({ page }) => {
  // 52/12 = 4.33333... must render as "4,33", never the raw long decimal.
  const html = await build(page, { ...HND_ONLY, totalEinsaetze: 52 / 12 });
  expect(html).toContain("4,33&times;");
  expect(html).not.toContain("4,33333");
  expect(html).not.toContain("4.3333");
});
