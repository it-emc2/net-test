// Web layer unit checks (no legacy needed): files, types, fallback, redirects, add-on injection.
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWeb } from "../src/web/register.js";
import { registerSecurity } from "../src/web/security.js";
import { createToken } from "../src/platform/auth.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SECRET = "web-test-secret-0123456789abcdef";
const build = async (indexInjections?: string[]) => {
  const app = Fastify();
  await registerSecurity(app);
  await registerWeb(app, {
    publicDir: ROOT + "src/public", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "node_modules/@fortawesome/fontawesome-free",
    authSecret: SECRET, ...(indexInjections ? { indexInjections } : {}),
  });
  return app;
};
const cookie = () => ({ cookie: `net_session=${encodeURIComponent(createToken("u@test.local", SECRET))}` });

describe("web layer", () => {
  it("Font Awesome, pdf.js and app files with legacy content types", async () => {
    const app = await build();
    const fa = await app.inject({ url: "/vendor/fontawesome/css/all.min.css" });
    expect([fa.statusCode, fa.headers["content-type"]]).toEqual([200, "text/css; charset=utf-8"]);
    const js = await app.inject({ url: "/script.js" });
    expect([js.statusCode, js.headers["content-type"]]).toEqual([200, "text/javascript; charset=utf-8"]);
    const mf = await app.inject({ url: "/manifest.webmanifest" });
    expect(mf.headers["content-type"]).toBe("application/manifest+json; charset=utf-8");
  });
  it("pages need a session; index injection adds the add-on scripts", async () => {
    const app = await build(['<script type="module" src="/v2/addon.js"></script>']);
    const r = await app.inject({ url: "/", headers: { accept: "text/html" } });
    expect([r.statusCode, r.headers.location]).toEqual([302, "/login"]);
    const ok = await app.inject({ url: "/irgendwo/tief", headers: { accept: "text/html", ...cookie() } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('<script type="module" src="/v2/addon.js"></script>\n</body>');
  });

  it("folder paths with double slashes still work; path traversal is refused", async () => {
    const app = Fastify();
    await registerWeb(app, { publicDir: ROOT + "src//public/", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "/node_modules/@fortawesome/fontawesome-free/", authSecret: SECRET });
    expect((await app.inject({ url: "/vendor/fontawesome/css/all.min.css" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/vendor/fontawesome/..%2f..%2fpackage.json" })).statusCode).toBe(404);
    const t = await app.inject({ url: "/..%2f..%2fpackage.json", headers: cookie() });
    expect(t.body.startsWith("<!DOCTYPE html>")).toBe(true); // the app page, never the file outside
  });

  it("deal links: login first, then /?deal=<id>[#step]; invalid ids never redirect", async () => {
    const app = await build(['<script src="/v2/addons/deal-link.js" defer></script>']);
    const anon = await app.inject({ url: "/deal/9001", headers: { accept: "text/html" } });
    expect([anon.statusCode, anon.headers.location]).toEqual([302, "/login?next=%2Fdeal%2F9001"]);
    const r = await app.inject({ url: "/deal/9001", headers: cookie() });
    expect([r.statusCode, r.headers.location]).toEqual([302, "/?deal=9001"]);
    const s2 = await app.inject({ url: "/deal/9001/Kosten", headers: cookie() });
    expect(s2.headers.location).toBe("/?deal=9001#Kosten");
    const bad = await app.inject({ url: "/deal/%3Cscript%3E", headers: cookie() });
    expect([bad.statusCode, bad.headers.location]).toEqual([200, undefined]);
    const addon = await app.inject({ url: "/v2/addons/deal-link.js" });
    expect([addon.statusCode, addon.headers["content-type"]]).toEqual([200, "text/javascript; charset=utf-8"]);
    expect(addon.body).toContain("btnLoadDeal");
  });
});
