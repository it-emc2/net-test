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

// v2 hides HMS and WD on the Hauptmenü (ADR 011, UX U-001) — their pages are not offered there.
const V2_HIDDEN = new Set(["hms", "wd"]);
const isV2 = process.env.PARITY_TARGET === "v2";

for (const [key, tile] of TILES) {
  test(`${key}: tile opens the same wizard steps and every step page renders`, async ({ page }) => {
    test.skip(isV2 && V2_HIDDEN.has(key), "not offered in v2 (ADR 011)");
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
      const link = page.locator(`#sidebar a.side-link[data-step="${step}"]`);
      await link.scrollIntoViewIfNeeded(); // bottom links can sit below the fold (Linux font metrics)
      // On small/Linux viewports a collapsed accordion can overlap the last links. What we
      // record is what the link DOES, so fall back to a DOM click if the pointer is blocked.
      try { await link.click({ timeout: 3000 }); } catch { await link.dispatchEvent("click"); }
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
  if (isV2) {
    // same tiles in the same order, minus the two v2 hides (checked for visibility in v2-deal-link.spec.cjs)
    const fs = require("node:fs");
    const recorded = fs.readFileSync(require("node:path").join(__dirname, "__snapshots__/main-menu-tiles.txt"), "utf8").trim().split("\n");
    expect(tiles).toEqual(recorded);
    return;
  }
  expect(tiles.join("\n")).toMatchSnapshot("main-menu-tiles.txt");
});
