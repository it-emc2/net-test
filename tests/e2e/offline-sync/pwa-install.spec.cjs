// Installability. The offline behaviour lives in sw.js and works in a plain
// browser tab; these tests only cover what makes the app installable to a home
// screen, which is a separate set of requirements and easy to get subtly wrong.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test("the manifest is reachable without a session", async ({ request }) => {
  // <link rel="manifest"> is fetched without credentials unless the tag opts in,
  // so a manifest behind authGate makes the app silently non-installable.
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);

  const manifest = JSON.parse(await res.text());
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

  // Chrome requires a 192 and a 512, plus a maskable one for round launchers.
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
});

test("every declared icon exists at its declared size", async ({ request }) => {
  const manifest = JSON.parse(await (await request.get("/manifest.webmanifest")).text());

  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), `${icon.src} should be served`).toBe(200);

    const body = await res.body();
    // PNG IHDR: width and height are big-endian uint32 at offsets 16 and 20.
    const actual = `${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`;
    expect(actual, `${icon.src} dimensions`).toBe(icon.sizes);
  }
});

test("the page links the manifest and declares the iOS equivalents", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: USER });
  await page.goto("/");

  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    themeColor: document.querySelector('meta[name="theme-color"]')?.content,
    appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    // iOS ignores manifest.display; this meta is what makes it launch standalone.
    appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
  }));

  expect(head).toEqual({
    manifest: "/manifest.webmanifest",
    themeColor: "#1e5aa8",
    appleIcon: "/icons/icon-192.png",
    appleCapable: "yes",
  });
});

test("a controlling service worker with a fetch handler is active", async ({ page }) => {
  // The third installability requirement, after manifest and icons.
  await page.request.post("/api/auth/login", { data: USER });
  await page.goto("/");

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30000,
  });
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.scope,
  );
  expect(scope).toMatch(/\/$/);
});

// An ngrok tunnel is how this reaches a real iPhone (iOS needs HTTPS for
// service workers and Add to Home Screen). The browser sends an Origin header
// even on same-origin POSTs, so a tunnel host missing from the CORS allowlist
// fails login with an unparseable HTML error rather than anything readable.
test("tunnel origins used for on-device testing are accepted", async ({ request }) => {
  const cases = [
    ["https://noniconoclastic-pauletta-beloid.ngrok-free.dev", 200],
    ["https://something.ngrok-free.app", 200],
    ["https://evil.example.com", 500], // cors() rejects -> error handler
  ];

  for (const [origin, expected] of cases) {
    const res = await request.post("/api/auth/login", {
      headers: { origin },
      data: { email: "nobody@test.local", password: "wrong" },
      failOnStatusCode: false,
    });
    // 200 here means "reached the route"; the credentials are wrong on purpose,
    // so an allowed origin answers 401 and a blocked one never gets that far.
    const reachedRoute = res.status() === 401;
    expect(reachedRoute, `${origin} should ${expected === 200 ? "" : "not "}reach the route`).toBe(
      expected === 200,
    );
  }
});
