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

// ---- owner decisions 2026-11-11: post after e-mail, changed sent offer, repeat Bitrix filing ----
const postLetter = (page, extra = {}) => page.evaluate(async (x) => {
  const r = await fetch("/api/post/send", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { name: "K" }, meta: { offerNumber: "ANG-X-1" }, document: { filename: "a.pdf", base64: "AAAA" }, ...x }) });
  return { status: r.status, body: await r.json() };
}, extra);

test("post after e-mail: the user confirms, the request carries sendId + the open offer; a changed offer can be posted as the original", async ({ page }) => {
  const bodies = [];
  await page.route("**/api/offers/ANG-X-1/sends", (route) => route.fulfill({ json: { ok: true, sends: [
    { sendId: "s-mail", status: "done", channel: "email", to: "kunde@example.invalid", ansprechpartner: "ap@example.invalid", finishedAt: "2026-11-08T09:30:00Z" }] } }));
  await page.route("**/api/post/send", async (route) => {
    const b = JSON.parse(route.request().postData()); bodies.push(b);
    if (!b.useSentOriginal) return route.fulfill({ status: 409, json: { ok: false, error: { code: "OFFER_CHANGED", message: "geändert" }, differences: ["Ansprechpartner"], sent: { sendId: "s-mail", at: "2026-11-08T09:30:00Z" } } });
    return route.fulfill({ json: { ok: true, printjobId: 7, resendOf: { sendId: "s-mail" } } });
  });
  const result = postLetter(page);
  // 1) "already sent" question names date, channel, recipient and Ansprechpartner
  const dlg = page.locator("#appConfirmOverlay");
  await expect(dlg).toBeVisible();
  await expect(page.locator("#appConfirmMessage")).toContainText("per E-Mail an kunde@example.invalid");
  await expect(page.locator("#appConfirmMessage")).toContainText("Ansprechpartner: ap@example.invalid");
  await page.locator("#appConfirmOk").click();
  // 2) the open offer differs → offer to post the original
  await expect(page.locator("#appConfirmTitle")).toHaveText("Das geöffnete Angebot weicht vom versendeten ab");
  await expect(page.locator("#appConfirmMessage")).toContainText("Ansprechpartner");
  await page.locator("#appConfirmOk").click();
  expect(await result).toMatchObject({ status: 200, body: { ok: true, printjobId: 7 } });
  expect(bodies).toHaveLength(2);
  expect(bodies[0].sendId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  expect(typeof bodies[0].payload).toBe("object"); // the open offer, for the server's comparison
  expect(bodies[1]).toMatchObject({ useSentOriginal: true, sendId: bodies[0].sendId });
  expect(bodies[1].payload).toBeUndefined();
});

test("post after e-mail: cancelling the question sends nothing", async ({ page }) => {
  let posted = 0;
  await page.route("**/api/offers/ANG-X-1/sends", (route) => route.fulfill({ json: { ok: true, sends: [{ sendId: "s", status: "done", channel: "email", to: "k@example.invalid" }] } }));
  await page.route("**/api/post/send", (route) => { posted++; return route.fulfill({ json: { ok: true } }); });
  const result = postLetter(page);
  await page.locator("#appConfirmCancel").click();
  expect(await result).toMatchObject({ status: 409, body: { code: "CANCELLED" } });
  expect(posted).toBe(0);
});

test("the signed-documents letter is not compared with the sent offer", async ({ page }) => {
  let body = null;
  await page.route("**/api/post/send", (route) => { body = JSON.parse(route.request().postData()); return route.fulfill({ json: { ok: true } }); });
  expect(await postLetter(page, { letterKind: "signed" })).toMatchObject({ status: 200 });
  expect(body.payload).toBeUndefined();
  expect(body.sendId).toBeTruthy();
});

test("saving a changed sent offer: clear notice to create a new version", async ({ page }) => {
  await page.route("**/api/offers", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 409, json: { error: { code: "OFFER_CHANGED", message: "…" }, differences: ["Inhalt"] } }) : route.continue());
  const status = await page.evaluate(async () => (await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect(status).toBe(409); // the app still gets the refusal
  await expect(page.locator(".oc-notice").last()).toContainText("bereits versendet");
  await expect(page.locator(".oc-notice").last()).toContainText("neue Version");
});

test("mail sent but Bitrix filing failed → offer to repeat the filing from the stored files", async ({ page }) => {
  let retried = null;
  await page.route("**/api/email/send-offer", (route) => route.fulfill({ json: { ok: true, messageId: "m", bitrixComment: { ok: false, error: "timeout" } } }));
  await page.route("**/api/sends/*/retry-bitrix", (route) => { retried = route.request().url(); return route.fulfill({ json: { ok: true } }); });
  const r = await send(page);
  expect(r.status).toBe(200);
  await expect(page.locator("#appConfirmTitle")).toHaveText("Ablage in Bitrix hat nicht geklappt");
  await page.locator("#appConfirmOk").click();
  await expect.poll(() => retried).toContain(`/api/sends/${r.sendId}/retry-bitrix`);
});
