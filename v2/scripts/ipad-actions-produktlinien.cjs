// iPad actions for main sync item 8 (product lines): node v2/scripts/ipad-check.cjs v2/scripts/ipad-actions-produktlinien.cjs
module.exports = async (page, measure, goStep) => {
  await measure("open Duschwanne", () => goStep("Duschwanne", "Duschwanne"), 1500);
  await measure("tray on (Badolux preselected)", () => page.getByRole("switch", { name: "Duschwanne", exact: true }).click(), 1500);
  await measure("line Hassmann", () => page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: /^Hassmann/ }).click(), 1500);
  await measure("line Badolux", () => page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: /^Badolux/ }).click(), 1500);
  await measure("size", async () => { await page.getByLabel("Breite in cm").fill("90"); await page.getByLabel("Länge in cm").fill("120"); await page.getByLabel("Länge in cm").blur(); }, 2500);
  await measure("pick tray", () => page.locator('[data-testid="tray-card"]:not([data-pinned="true"])').first().locator("input").click(), 1500);
  await measure("tray off", () => page.getByRole("switch", { name: "Duschwanne", exact: true }).click(), 1500);
  await measure("tray on again", () => page.getByRole("switch", { name: "Duschwanne", exact: true }).click(), 1500);
  await measure("open Fußboden", () => goStep("Fussboden", "Fußboden"), 1500);
  await measure("floor on", () => page.getByRole("switch", { name: "Fußboden", exact: true }).click(), 1500);
  await measure("floor line Badolux", () => page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: /^Badolux/ }).click(), 2000);
  await measure("floor area", async () => { await page.getByLabel("Fläche in m²").fill("5"); await page.getByLabel("Fläche in m²").blur(); }, 1500);
  await measure("floor covering", () => page.getByTestId("fb-tile").nth(1).click(), 1500);
  await measure("floor line Hassmann (asks)", () => page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: /^Hassmann/ }).click(), 1000);
};
