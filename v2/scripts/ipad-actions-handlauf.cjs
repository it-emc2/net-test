// iPad actions for the Handlauf steps Arbeiten, Handläufe, Kosten:
//   CAPTURE_BASE=http://localhost:3002 node v2/scripts/ipad-check.cjs v2/scripts/ipad-actions-handlauf.cjs hl
module.exports = async (page, measure, goStep) => {
  const step = (k) => page.getByTestId(`hl-step-${k}`);
  const openStep = async (k) => { const h = step(k).getByRole("button").first(); if ((await h.getAttribute("aria-expanded")) !== "true") await h.click(); };
  const commit = async (loc, v) => { await loc.fill(String(v)); await loc.blur(); };
  await measure("open Arbeiten", () => goStep("hlArbeiten", "Auszuführende Arbeiten"), 1500);
  await measure("handrail task off", () => page.getByRole("checkbox", { name: /Handläufe$/ }).click(), 1500);
  await measure("free task typed", () => commit(page.getByLabel("Zusätzliche Aufgabe").first(), "Alten Handlauf demontieren"), 1500);
  await measure("open Handläufe", () => goStep("hlk", "Handläufe"), 2500);
  await measure("area innen", () => step("area").getByRole("button", { name: /^Innenbereich/ }).click(), 1500);
  await measure("tube Alu", () => page.getByTestId("hl-tube").first().click(), 1500);
  await measure("tube 3 m", () => commit(page.getByTestId("hl-ledger").getByRole("spinbutton").first(), "3"), 1500);
  await measure("finish Chrom matt", async () => { await openStep("beschlaege"); await step("beschlaege").getByRole("group", { name: "Oberfläche" }).getByRole("button", { name: "Chrom matt", exact: true }).click(); }, 1500);
  await measure("fitting", () => page.getByTestId("hl-fitting").first().click(), 1500);
  await measure("fitting ×4", () => commit(page.getByTestId("hl-ledger").getByRole("spinbutton").nth(1), "4"), 1500);
  await measure("Sonderprodukt", async () => { await openStep("rohr"); await step("rohr").getByRole("group", { name: "Material" }).getByRole("button", { name: /^Sonderprodukt/ }).click(); await page.getByRole("button", { name: "Sonderprodukt hinzufügen" }).click(); await commit(page.getByTestId("hl-sonder").getByLabel("Bezeichnung", { exact: true }), "Sonderhalter"); await commit(page.getByTestId("hl-sonder").getByLabel("Preis netto"), "12,5"); }, 1500);
  await measure("second configuration", () => page.getByRole("button", { name: "Weitere Konfiguration" }).click(), 1500);
  await measure("area außen", () => step("area").getByRole("button", { name: /^Außenbereich/ }).click(), 1500);
  await measure("tube Edelstahl", () => page.getByTestId("hl-tube").first().click(), 1500);
  await measure("notes open", () => page.getByText("Notizen & Projekt-Skizze anzeigen").click(), 1500);
  await measure("open Kosten", () => goStep("Kosten", "Kosten-Details"), 2500);
};
