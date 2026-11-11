// v2-only (PARITY_TARGET=v2): a send can neither be lost nor go out twice (ADR 023).
// The add-on wraps POST /api/email/send-offer; server calls are simulated here (the server side
// is covered by the v2 contract test "send record").
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ocQuickWins); // add-ons loaded
});

// what today's EmailManager does: FormData + 60 s abort signal
const send = (page, timeoutMs = 60000) => page.evaluate(async (ms) => {
  const fd = new FormData(); fd.append("to", "k@example.invalid"); fd.append("payload", "{}");
  try {
    const r = await fetch("/api/email/send-offer", { method: "POST", body: fd, signal: AbortSignal.timeout(ms) });
    return { status: r.status, body: await r.json(), sendId: window.__ocLastSendId };
  } catch (e) { return { thrown: e.name + ": " + e.message, sendId: window.__ocLastSendId }; }
}, timeoutMs);

test("every send carries a sendId; the 60 s cut-off no longer applies", async ({ page }) => {
  let posted = null;
  await page.route("**/api/email/send-offer", async (route) => {
    posted = route.request().postData() || "";
    await new Promise((r) => setTimeout(r, 1500)); // slower than the app's own timeout below
    await route.fulfill({ json: { ok: true, messageId: "m1" } });
  });
  const r = await send(page, 500); // the app would have given up after 0.5 s
  expect(r).toMatchObject({ status: 200, body: { ok: true, messageId: "m1" } });
  expect(posted).toMatch(/name="sendId"\r\n\r\n[A-Za-z0-9-]{8,64}/);
  expect(posted).toContain(r.sendId);
});

test("connection drops while the server works → the app gets the real answer, not an error", async ({ page }) => {
  let polls = 0;
  await page.route("**/api/email/send-offer", (route) => route.abort("connectionreset"));
  await page.route("**/api/sends/*", async (route) => {
    polls++;
    const sendId = route.request().url().split("/").pop();
    if (polls === 1) return route.fulfill({ json: { ok: true, send: { sendId, status: "running" }, result: null } });
    return route.fulfill({ json: { ok: true, send: { sendId, status: "done" }, result: { ok: true, messageId: "m2", offerTotal: 1234.5, sendId } } });
  });
  const r = await send(page);
  expect(r).toMatchObject({ status: 200, body: { ok: true, messageId: "m2", offerTotal: 1234.5 } });
  expect(polls).toBe(2);
});

test("connection drops and the server reports a failed send → the app shows the server's error", async ({ page }) => {
  await page.route("**/api/email/send-offer", (route) => route.abort("connectionreset"));
  await page.route("**/api/sends/*", (route) => route.fulfill({ json: { ok: true, send: { status: "failed", error: "SMTP nicht erreichbar" }, result: null } }));
  const r = await send(page);
  expect(r).toMatchObject({ status: 500, body: { error: "Send failed", detail: "SMTP nicht erreichbar" } });
});

test("the server never saw the request → the app's own network error stays (nothing was sent)", async ({ page }) => {
  test.setTimeout(60000);
  let polls = 0;
  await page.route("**/api/email/send-offer", (route) => route.abort("internetdisconnected"));
  await page.route("**/api/sends/*", (route) => { polls++; return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Versand nicht gefunden" } } }); });
  const r = await send(page);
  expect(r.thrown).toMatch(/TypeError/);
  expect(polls).toBe(4);
});

test("other requests are untouched", async ({ page }) => {
  const r = await page.evaluate(async () => (await fetch("/api/version")).status);
  expect(r).toBe(200);
});
