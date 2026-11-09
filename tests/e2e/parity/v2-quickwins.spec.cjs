// v2-only (PARITY_TARGET=v2): UX quick wins (spec „OC UX Quick Wins“ v1.0, UX-CHANGES U-010) in a real browser.
// Every tile operates an existing input — the tests check that the stored input changes, not only the look.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

const MAT = { Duschwanne: "dwTrayToggle", Fussboden: "fbMaster", Wandverkleidung: "wvEnabled", DuschabtrennungNeu: "daNeuToggle", Duschvorhang: "vorhangToggle" };

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

async function openBu(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ocQuickWins);
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#sidebar a.side-link[data-step]").length > 0);
}
const toggles = (page) => page.evaluate((m) => Object.fromEntries(Object.entries(m).map(([s, id]) => [s, document.getElementById(id).checked])), MAT);
const menuSteps = (page) => page.$$eval("#sidebar a.side-link[data-step]", (as) => as.filter((a) => a.offsetParent !== null).map((a) => a.dataset.step));

test("C5 + A5: home starts with today's appointments; offer tiles have icons", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ocQuickWins);
  const order = await page.$$eval("#page-home .home-stack > *", (els) => els.map((e) => e.id || e.className.split(" ")[0]));
  expect(order.indexOf("todayPlanningPanel")).toBe(0);
  expect(order.indexOf("home-offer-types")).toBe(1);
  expect(order.indexOf("home-load-panel")).toBe(2);
  const noIcon = await page.$$eval("#page-home .tile-btn[data-step]", (ts) => ts.filter((t) => !t.querySelector(".oc-tile-ico")).length);
  expect(noIcon).toBe(0);
});

test("A1: Umbauart tiles set the same radio as before", async ({ page }) => {
  await openBu(page);
  await page.locator('#sidebar a.side-link[data-step="Arbeiten"]').click();
  await expect(page.getByText("Was wird umgebaut?")).toBeVisible();
  await page.locator('#page-Arbeiten label.oc-tile:has(input[value="wanne_dusche"])').click();
  expect(await page.evaluate(() => document.querySelector('input[name="duschwanne[umbauart]"]:checked')?.value)).toBe("wanne_dusche");
  await expect(page.locator('#page-Arbeiten label.oc-tile:has(input[value="wanne_dusche"])')).toHaveClass(/is-on/);
  // suggestion only — nothing switched on by itself
  await expect(page.locator('#ocMaterialPick .oc-tile[data-step="Duschwanne"] .oc-badge')).toHaveText("Vorschlag");
  expect(Object.values(await toggles(page)).some(Boolean)).toBe(false);
});

test("B1 + B2: one question switches the five material sections; menu and „Weiter“ follow; screens exclusive", async ({ page }) => {
  await openBu(page);
  // nothing chosen → no material step in the menu, a hint instead
  let steps = await menuSteps(page);
  for (const s of Object.keys(MAT)) expect(steps).not.toContain(s);
  await expect(page.locator("#sidebar .oc-pick-link")).toBeVisible();

  await page.locator('#sidebar a.side-link[data-step="Arbeiten"]').click();
  const tile = (s) => page.locator(`#ocMaterialPick .oc-tile[data-step="${s}"]`);
  await tile("Duschwanne").click();
  await tile("DuschabtrennungNeu").click();
  expect(await toggles(page)).toEqual({ Duschwanne: true, Fussboden: false, Wandverkleidung: false, DuschabtrennungNeu: true, Duschvorhang: false });
  await expect(tile("Duschwanne")).toHaveAttribute("aria-checked", "true");
  steps = await menuSteps(page);
  expect(steps).toEqual(expect.arrayContaining(["Duschwanne", "DuschabtrennungNeu"]));
  expect(steps).not.toContain("Fussboden");

  // B2: the curtain replaces the glass enclosure
  await tile("Duschvorhang").click();
  expect(await toggles(page)).toMatchObject({ DuschabtrennungNeu: false, Duschvorhang: true });
  // both on (old drafts, the page's own switch) → yellow hint
  await page.evaluate(() => document.getElementById("daNeuToggle").click());
  await expect(page.locator("#ocMaterialPick .oc-warn")).toBeVisible();
  await page.evaluate(() => document.getElementById("daNeuToggle").click());
  await expect(page.locator("#ocMaterialPick .oc-warn")).toBeHidden();

  // the page's own switch updates the tile (two-way, same state)
  await page.evaluate(() => document.getElementById("fbMaster").click());
  await expect(tile("Fussboden")).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => document.getElementById("fbMaster").click());
  await expect(tile("Fussboden")).toHaveAttribute("aria-checked", "false");

  // „Weiter“ from Duschwanne skips Fußboden, Wandverkleidung and the glass enclosure → curtain
  await page.evaluate(() => window.setStep("Duschwanne"));
  await page.locator("#page-Duschwanne [data-nav=next]").click();
  await expect.poll(() => page.evaluate(() => window.getCurrentStep())).toBe("Duschvorhang");
});

test("A2: wall panelling scope as tiles, same radio wvKind", async ({ page }) => {
  await openBu(page);
  await page.evaluate(() => { window.__ocQuickWins.setMaterial("Wandverkleidung", true); window.setStep("Wandverkleidung"); });
  const tiles = page.locator("#wvKindGroup .oc-tiles .oc-tile");
  await expect(tiles).toHaveCount(5);
  await tiles.nth(2).click();
  expect(await page.evaluate(() => document.querySelector('input[name="wvKind"]:checked')?.value)).toBe("Fliesenspiegel");
  await expect(tiles.nth(2)).toHaveClass(/is-on/);
});

test("C2: Angebotsversand has one primary action; the rest under „Weitere Optionen“", async ({ page }) => {
  await openBu(page);
  await page.evaluate(() => window.setStep("Zusammenfassung"));
  const finish = page.locator("#ocFinish");
  await expect(finish).toBeVisible();
  await expect(finish.locator(".oc-primary")).toHaveCount(1);
  await expect(finish.locator(".oc-primary")).toHaveText(/Mit Kunde unterschreiben/);
  const more = page.locator("details.oc-more");
  await expect(more).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => {
    const m = document.querySelector("details.oc-more");
    return {
      studio: m.contains(document.getElementById("downloadDocx")),
      bitrix: m.contains(document.getElementById("auftragId")),
      mail: m.contains(document.getElementById("mailTo")),
      preview: m.contains(document.getElementById("documentPreviewSection")),
    };
  })).toEqual({ studio: true, bitrix: true, mail: false, preview: false });
  // the primary button operates today's „Vor Ort unterschreiben (iPad)“
  const hit = await page.evaluate(() => {
    let n = 0; const b = document.getElementById("signOnSiteBtn");
    const h = (e) => { n++; e.stopImmediatePropagation(); e.preventDefault(); };
    b.addEventListener("click", h, true); document.querySelector("#ocFinish .oc-primary").click(); b.removeEventListener("click", h, true);
    return n;
  });
  expect(hit).toBe(1);
});

test("C7: Kundenmodus hides markup, cost breakdown and internal documents; „Weiter“ skips Kosten", async ({ page }) => {
  await openBu(page);
  const btn = page.locator("#ocCustomerBtn");
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.setStep("Rabatt"));
  for (const sel of ["#aufschlagSection", "#rb-auf-row", "#rb-material", "#rb-arbeit"]) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator("#rb-total")).toBeVisible();
  await expect(page.locator('#sidebar a.side-link[data-step="Kosten"]')).toBeHidden();
  await page.locator("#page-Rabatt [data-nav=next]").click();
  await expect.poll(() => page.evaluate(() => window.getCurrentStep())).not.toBe("Kosten");
  await btn.click();
  await page.evaluate(() => window.setStep("Rabatt"));
  await expect(page.locator("#aufschlagSection")).toBeVisible();
});

test("D3: total is „vorläufig“ until a customer and at least one item exist", async ({ page }) => {
  await openBu(page);
  await expect(page.locator("#summaryWidget")).toHaveClass(/oc-provisional/);
  await expect(page.locator("#ocProvisional")).toBeVisible();
  await page.locator("#firstName").fill("Vorläufig");
  await page.locator("#lastName").fill("Test");
  await page.evaluate(() => window.__ocQuickWins.setMaterial("Duschwanne", true));
  await expect(page.locator("#summaryWidget")).not.toHaveClass(/oc-provisional/, { timeout: 5000 });
});

test("C1: developer and CRM groups are for admins only", async ({ page }) => {
  await openBu(page);
  await page.waitForFunction(() => document.documentElement.classList.contains("oc-admin")); // parity user is admin
  await expect(page.locator("#sideMenu .accordion-group").first()).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.remove("oc-admin"));
  expect(await page.$$eval("#sideMenu .accordion-group", (gs) => gs.every((g) => getComputedStyle(g).display === "none"))).toBe(true);
  await expect(page.locator('#sideMenu a.side-link[data-step="DuschabtrennungNeu"] > span:last-child')).toHaveText("Duschabtrennung");
});

test("D5: identical price requests in flight at the same time go to the server once", async ({ page }) => {
  let hits = 0;
  // only the test's own payloads ({a:…}) are counted; the app's own price requests pass through
  await page.route("**/api/price", async (route) => {
    if (!/"a":/.test(route.request().postData() || "")) return route.continue();
    hits++; await new Promise((r) => setTimeout(r, 200)); await route.fulfill({ json: { total: 1 } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ocPriceDedupe);
  const res = await page.evaluate(async () => {
    const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 1 }) };
    const [a, b] = await Promise.all([fetch("/api/price", opts), fetch("/api/price", opts)]); // same payload in flight
    const c = await fetch("/api/price", opts); // finished answers are never reused (offline fallback) → sent
    const d = await fetch("/api/price", { ...opts, body: JSON.stringify({ a: 2 }) }); // other payload → sent
    return [await a.json(), await b.json(), await c.json(), await d.json()].map((j) => j.total);
  });
  expect(res).toEqual([1, 1, 1, 1]);
  expect(hits).toBe(3);
});
