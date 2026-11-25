// SIGNING_UI (U-068): which page the customer's signing link /sign/<token> opens. "classic"
// (default) must be byte-for-byte today's page; "react" serves the React page (sign.html of the
// app build) at the SAME address, so every link already sent keeps working. Nothing else changes:
// the other public paths answer the same in both modes. No database: the page route reads no record.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { registerSigning } from "../src/modules/signing/routes.js";
import { UNAVAILABLE_SIGNING_RENDERER } from "../src/modules/signing/documents.js";
import { injectHead, registerWeb } from "../src/modules/web/register.js";
import { registerSecurity } from "../src/modules/web/security.js";
import { createToken } from "../src/platform/auth.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SECRET = "signing-ui-secret-0123456789abcdef";
const SIGN_PAGE = ROOT + "src/public/signpage/index.html";
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
const cookie = () => ({ cookie: `net_session=${encodeURIComponent(createToken("rep@test.local", SECRET))}` });

const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-sign-ui-"));
fs.mkdirSync(path.join(appDir, "assets"));
const SIGN_HTML = '<!doctype html><html lang="de"><head><meta name="referrer" content="no-referrer"></head><body data-internal-user="false"><div id="root"></div><script type="module" src="/app/assets/sign-abc.js"></script></body></html>';
fs.writeFileSync(path.join(appDir, "index.html"), "<!doctype html><div id=root></div>");
fs.writeFileSync(path.join(appDir, "sign.html"), SIGN_HTML);
fs.writeFileSync(path.join(appDir, "assets", "sign-abc.js"), "console.log('sign')");
const noBuild = path.join(os.tmpdir(), "oc-sign-ui-missing");
afterAll(() => fs.rmSync(appDir, { recursive: true, force: true }));

const warnings: string[] = [];
async function make(signingUi?: "classic" | "react", dir = appDir, companyName?: string) {
  const app = Fastify();
  await registerSecurity(app);
  const log = { warn: (_o: object, m: string) => { warnings.push(m); }, error: () => {} };
  await registerSigning(app, {
    deals: {} as any, renderer: UNAVAILABLE_SIGNING_RENDERER, mailer: { configured: false } as any, assetsDir: ROOT + "src/assets",
    signPageFile: SIGN_PAGE, apDefaultEmail: "", authSecret: SECRET, log, appDir: dir, ...(signingUi ? { signingUi } : {}), ...(companyName ? { companyName } : {}),
  });
  await registerWeb(app, { publicDir: ROOT + "src/public", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "node_modules/@fortawesome/fontawesome-free", authSecret: SECRET, appDir: dir });
  return app;
}
const today = (internal: boolean) => injectHead(fs.readFileSync(SIGN_PAGE, "utf8").replace('data-internal-user="false"', `data-internal-user="${internal}"`));

describe("SIGNING_UI — the page behind /sign/<token>", () => {
  it("classic (default and explicit): exactly today's page, the rep's back link from the session cookie", async () => {
    for (const app of [await make(), await make("classic")]) {
      const r = await app.inject({ url: `/sign/${TOKEN}` });
      expect([r.statusCode, r.headers["content-type"], r.headers.location]).toEqual([200, "text/html; charset=utf-8", undefined]);
      expect(r.body).toBe(today(false));
      expect(r.body).toContain('<script src="/signpage/app.js"></script>');
      expect(r.headers["cache-control"]).toBeUndefined();
      expect((await app.inject({ url: `/sign/${TOKEN}`, headers: cookie() })).body).toBe(today(true));
    }
  });

  it("react: the same address serves the React page in place — no redirect, no store, no referrer; the rep flag as today", async () => {
    const app = await make("react");
    const r = await app.inject({ url: `/sign/${TOKEN}`, headers: { accept: "text/html" } });
    expect([r.statusCode, r.headers["content-type"], r.headers.location]).toEqual([200, "text/html; charset=utf-8", undefined]);
    expect(r.body).toBe(SIGN_HTML);
    expect(r.body).not.toContain(TOKEN);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    const rep = await app.inject({ url: `/sign/${TOKEN}`, headers: cookie() });
    expect(rep.body).toBe(SIGN_HTML.replace('data-internal-user="false"', 'data-internal-user="true"'));
    // the page's script is a public file of the app build
    const js = await app.inject({ url: "/app/assets/sign-abc.js" });
    expect([js.statusCode, js.body]).toEqual([200, "console.log('sign')"]);
    // a link with an unknown or odd token still opens the page (the page asks the API, as today)
    expect((await app.inject({ url: "/sign/abc" })).body).toBe(SIGN_HTML);
  });

  it("COMPANY_NAME (U-071): handed to the React page as data-company (escaped); the classic page unchanged", async () => {
    const app = await make("react", appDir, "Testfirma GmbH & Co. \"KG\"");
    const r = await app.inject({ url: `/sign/${TOKEN}` });
    expect(r.body).toBe(SIGN_HTML.replace('data-internal-user="false"', 'data-internal-user="false" data-company="Testfirma GmbH &amp; Co. &quot;KG&quot;"'));
    const classic = await make("classic", appDir, "Testfirma GmbH");
    expect((await classic.inject({ url: `/sign/${TOKEN}` })).body).toBe(today(false));
  });

  it("react without a build of the React app: today's page, one warning", async () => {
    warnings.length = 0;
    const app = await make("react", noBuild);
    for (let i = 0; i < 2; i++) expect((await app.inject({ url: `/sign/${TOKEN}` })).body).toBe(today(false));
    expect(warnings.filter((w) => w.includes("SIGNING_UI=react"))).toHaveLength(1);
  });

  it("react changes nothing else: every other public address answers as in classic mode", async () => {
    const classic = await make("classic"), react = await make("react");
    const urls = ["/signpage/app.js", "/sign", "/login", "/app/", "/app/sign.html", "/v2/addons/error-compat.js", "/api/health-not-here", "/admin/api/signing", "/api/signing"];
    for (const url of urls) {
      const [a, b] = [await classic.inject({ url, headers: { accept: "text/html" } }), await react.inject({ url, headers: { accept: "text/html" } })];
      expect([url, b.statusCode, b.headers["content-type"], b.headers.location, b.body]).toEqual([url, a.statusCode, a.headers["content-type"], a.headers.location, a.body]);
    }
    // the signing API keeps its routes (none added, none removed)
    const routes = (app: Awaited<ReturnType<typeof make>>) => app.printRoutes({ commonPrefix: false });
    expect(routes(react)).toBe(routes(classic));
  });
});
