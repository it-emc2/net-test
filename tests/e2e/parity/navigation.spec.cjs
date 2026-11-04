// UI parity — navigation per offer type. Records (as Playwright snapshots) what the CURRENT
// app shows: the sidebar step list for each main-menu tile and which step pages render.
// The rewrite must reproduce these snapshots. Update only on an intended change:
//   npx playwright test -c playwright.parity.config.cjs --update-snapshots
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const TILES = [
  ["bu", "BU-Badumbau"],
  ["bwt", "BWT-Badewannentür"],
  ["hl", "HL-Handlauf"],
  ["bl", "BL-Badelift"],
  ["ah", "AH-Alltagshilfe"],
  ["hms", "HMS-Hausmeister-Service"],
  ["wd", "WD-Winterdienst"],
];

test.beforeEach(async ({ page }) => {
  const res = await page.request.post("/api/auth/login", { data: USER });
  expect(res.ok()).toBeTruthy();
});

for (const [key, tile] of TILES) {
  test(`${key}: tile opens the same wizard steps and every step page renders`, async ({ page }) => {
    const errors = [];
    const dialogs = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    // Native confirm/alert are part of today's behaviour: record the text, then dismiss.
    page.on("dialog", async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss(); });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(`.tile-btn[data-step="${tile}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll("#sidebar a.side-link[data-step]").length > 0);

    const steps = await page.$$eval("#sidebar a.side-link[data-step]", (as) =>
      as.filter((a) => a.offsetParent !== null).map((a) => a.dataset.step));
    expect(steps.join("\n")).toMatchSnapshot(`${key}-steps.txt`);

    const rendered = [];
    for (const step of steps) {
      const before = dialogs.length;
      await page.locator(`#sidebar a.side-link[data-step="${step}"]`).click();
      await page.waitForTimeout(150);
      if (dialogs.length > before) {
        rendered.push(`${step}: dialog(${dialogs.slice(before).join(" / ").slice(0, 120)})`);
        continue;
      }
      const state = await page.evaluate(() => {
        const vis = (e) => {
          if (e.hidden || e.closest('[aria-hidden="true"]')) return false;
          const cs = getComputedStyle(e);
          return e.getClientRects().length > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
        };
        const pages = [...document.querySelectorAll('section.page[id^="page-"]')].filter(vis).map((e) => e.id);
        const modals = [...document.querySelectorAll('[role="dialog"], dialog[open], .modal, .modal-overlay')]
          .filter(vis).map((e) => e.getAttribute("aria-labelledby") || e.id || e.className.split(" ")[0]);
        return { pages, modals, hash: location.hash };
      });
      rendered.push(`${step}: visible=[${state.pages.join(",")}] modal=[${state.modals.join(",")}] hash=${state.hash}`);
      if (state.modals.length) {
        // Today the only sidebar modal is the reset confirm → cancel keeps the wizard as is.
        const cancel = page.locator("#homeConfirmCancel");
        if (await cancel.isVisible()) await cancel.click(); else await page.keyboard.press("Escape");
      }
    }
    expect(rendered.join("\n")).toMatchSnapshot(`${key}-pages.txt`);
    expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toEqual([]);
  });
}

test("main menu shows all seven offer tiles", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const tiles = await page.$$eval(".tile-btn[data-step]", (as) =>
    as.map((a) => `${a.dataset.step} | ${a.querySelector(".tile-title")?.textContent?.trim()}`));
  expect(tiles.join("\n")).toMatchSnapshot("main-menu-tiles.txt");
});
