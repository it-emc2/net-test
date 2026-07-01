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
  // Gesamt / Monat
  expect(html).toContain("Gesamt / Monat");
  expect(html).toContain("538,84");
});
