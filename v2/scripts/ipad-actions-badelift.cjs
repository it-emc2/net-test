// iPad check of the step „Badelift“ (and Kosten for a Badelift):
//   CAPTURE_BASE=http://localhost:5173 node v2/scripts/ipad-check.cjs v2/scripts/ipad-actions-badelift.cjs bl
module.exports = async (page, measure, goStep) => {
  await measure("open Badelift", () => goStep("bl", /Badelift — Bestandsaufnahme/), 2500);
  const tick = (id) => page.locator(`[data-testid="bl-card"][data-id="${id}"] label`).first().click();
  await measure("tick Gleittuch", () => tick("BRS-909"));
  await measure("tick Halterung", () => tick("BHT-914"));
  await measure("Halterung quantity 2", async () => { const i = page.getByLabel("Menge Halterung ohne zu bohren", { exact: true }); await i.fill("2"); await i.blur(); });
  await measure("main product off", () => tick("BRS-912"));
  await measure("main product on", () => tick("BRS-912"));
  const cell = (f) => page.getByTestId("bl-row").first().getByLabel(f, { exact: true });
  await measure("free item: name typed", () => cell("Bezeichnung").pressSequentially("Sitz", { delay: 40 }));
  await measure("free item: price typed", () => cell("Preis (netto)").pressSequentially("199,00", { delay: 40 }));
  await measure("free item: id typed", () => cell("Artikel-ID").pressSequentially("BL-1", { delay: 40 }));
  await measure("plus", () => page.getByRole("button", { name: "Weitere Position hinzufügen" }).click());
  await measure("remove row", () => page.getByTestId("bl-row").nth(1).getByRole("button", { name: "Diese Zeile entfernen" }).click());
  await measure("note typed", () => page.getByLabel("Hinweise / Notizen").pressSequentially("Wanne 170", { delay: 40 }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  console.log(JSON.stringify({ at375: await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })) }));
  await page.setViewportSize({ width: 834, height: 1194 });
  await measure("open Kosten", () => goStep("Kosten", /Kosten-Details/), 2500);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  console.log(JSON.stringify({ kosten375: await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })) }));
  await page.setViewportSize({ width: 834, height: 1194 });
  await goStep("bl", /Badelift — Bestandsaufnahme/);
};
