// iPad check of the step „Winterdienst“ / „Hausmeister-Service“ (and Kosten for it):
//   node v2/scripts/ipad-check.cjs v2/scripts/ipad-actions-wd-hms.cjs wd     (or hms)
// SHOTS=<dir>: screenshots at 834 and 375 px, light and dark, into that directory.
const type = process.argv[3] || "wd";
const heading = type === "wd" ? /WD · Winterdienst/ : /HMS · Hausmeisterservice/;
module.exports = async (page, measure, goStep) => {
  await measure(`open ${type}`, () => goStep(type, heading), 2500);
  const chip = (legend, name) => page.getByRole("group", { name: legend }).getByText(name, { exact: true }).click();
  await measure("Alltagsbegleitung", () => chip("Angebot zur Unterstützung im Alltag", "Alltagsbegleitung"));
  await measure("Haushaltsnahe Dienstleistungen", () => chip("Angebot zur Unterstützung im Alltag", "Haushaltsnahe Dienstleistungen"));
  await measure("hours per visit typed", () => page.getByLabel("Gewünschter Stundenumfang pro Einsatz (h)").pressSequentially("2.5", { delay: 40 }));
  await measure("hours per month typed", () => page.getByLabel("Monatlicher Stundenumfang (h)").pressSequentially("10", { delay: 40 }));
  await measure("Monatlich", () => chip("Regelmäßigkeit", "Monatlich"));
  await measure("note typed", () => page.getByLabel("Notizen / Anmerkungen").pressSequentially("Zufahrt Hof", { delay: 40 }));
  // dark mode is the switch of today's UI: <html data-mode="dark">
  const mode = async (m) => { await page.evaluate((x) => document.documentElement.setAttribute("data-mode", x), m); await page.waitForTimeout(300); };
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${type}-${name}.png`, fullPage: true }); };
  await shot("834-light");
  await mode("dark"); await shot("834-dark"); await mode("light");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  console.log(JSON.stringify({ at375: await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })) }));
  await shot("375-light");
  await mode("dark"); await shot("375-dark"); await mode("light");
  await page.setViewportSize({ width: 834, height: 1194 });
  await measure("open Kosten", () => goStep("Kosten", /Kosten-Details/), 2500);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  console.log(JSON.stringify({ kosten375: await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })) }));
  await page.setViewportSize({ width: 834, height: 1194 });
  await goStep(type, heading);
};
