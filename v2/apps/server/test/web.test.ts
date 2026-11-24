// Web layer unit checks (no legacy needed): files, types, fallback, redirects, add-on injection.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWeb } from "../src/modules/web/register.js";
import { ownOrigins, registerSecurity } from "../src/modules/web/security.js";
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

  it("the server's own address is an allowed origin (test app under another address); a foreign one stays refused", async () => {
    expect(ownOrigins({ PUBLIC_BASE_URL: "https://ocv2.emc2.de/", FLY_APP_NAME: "ocv2-react" })).toEqual(["https://ocv2.emc2.de", "https://ocv2-react.fly.dev"]);
    expect(ownOrigins({ PUBLIC_BASE_URL: "not an address", FLY_APP_NAME: "x.evil.example/" })).toEqual([]);
    expect(ownOrigins({})).toEqual([]);
    const make = async (own?: string[]) => { const a = Fastify(); await registerSecurity(a, own); a.post("/api/auth/login", async () => ({ ok: true })); return a; };
    const post = (a: Awaited<ReturnType<typeof make>>, origin: string) => a.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: {} });
    const plain = await make();
    expect((await post(plain, "https://ocv2.emc2.de")).statusCode).toBe(500); // what the test app answered on 2026-11-24
    const own = await make(["https://ocv2.emc2.de"]);
    const ok = await post(own, "https://ocv2.emc2.de");
    expect([ok.statusCode, ok.headers["access-control-allow-origin"]]).toEqual([200, "https://ocv2.emc2.de"]);
    expect((await post(own, "https://oc.emc2.de")).statusCode).toBe(200); // today's list still applies
    expect((await post(own, "https://ocv2.emc2.de.evil.example")).statusCode).toBe(500);
  });
  it("the React app under /app: built files, hashed assets cached for good, any other address → its index.html; no login needed", async () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-app-"));
    fs.mkdirSync(path.join(appDir, "assets"));
    fs.writeFileSync(path.join(appDir, "index.html"), "<!doctype html><div id=root></div>");
    fs.writeFileSync(path.join(appDir, "assets", "index-abc.js"), "console.log(1)");
    const app = Fastify();
    await registerSecurity(app);
    await registerWeb(app, { publicDir: ROOT + "src/public", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "node_modules/@fortawesome/fontawesome-free", authSecret: SECRET, appDir });
    for (const url of ["/app", "/app/", "/app/neu/bu/Kundendaten", "/app/deal/4711/bwt"]) {
      const r = await app.inject({ url });
      expect([url, r.statusCode, r.headers["content-type"], r.body]).toEqual([url, 200, "text/html; charset=UTF-8", "<!doctype html><div id=root></div>"]);
      expect(r.headers["cache-control"]).toBe("no-cache");
    }
    const js = await app.inject({ url: "/app/assets/index-abc.js" });
    expect([js.statusCode, js.body, js.headers["cache-control"]]).toEqual([200, "console.log(1)", "public, max-age=31536000, immutable"]);
    expect(String(js.headers["content-type"])).toMatch(/javascript/);
    expect((await app.inject({ url: "/app/assets/missing.js" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/app/..%2F..%2Fpackage.json" })).body).toBe("<!doctype html><div id=root></div>"); // never a file outside
    // today's UI at "/" is untouched and still needs a session
    expect((await app.inject({ url: "/", headers: { accept: "text/html" } })).statusCode).toBe(302);
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it("/app without a build answers 503 with a clear message", async () => {
    const app = Fastify();
    await registerWeb(app, { publicDir: ROOT + "src/public", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "node_modules/@fortawesome/fontawesome-free", authSecret: SECRET, appDir: path.join(os.tmpdir(), "oc-app-missing") });
    const r = await app.inject({ url: "/app/" });
    expect([r.statusCode, r.json().error.code]).toEqual([503, "APP_NOT_BUILT"]);
  });

  describe("START_UI (U-061)", () => {
    const make = async (startUi?: "classic" | "react", secureCookie?: boolean) => {
      const app = Fastify();
      await registerSecurity(app);
      await registerWeb(app, {
        publicDir: ROOT + "src/public", logicDir: ROOT + "src/logic", fontAwesomeDir: ROOT + "node_modules/@fortawesome/fontawesome-free", authSecret: SECRET,
        ...(startUi ? { startUi } : {}), ...(secureCookie !== undefined ? { secureCookie } : {}),
      });
      return app;
    };
    const page = { accept: "text/html,application/xhtml+xml" };
    const CHOSEN = { cookie: "oc_ui=classic" };
    const both = () => ({ cookie: `${cookie().cookie}; oc_ui=classic` });
    type App = Awaited<ReturnType<typeof make>>;
    const get = (app: App, url: string, headers: Record<string, string> = {}) => app.inject({ url, headers: { ...page, ...headers } });
    const where = async (app: App, url: string, headers: Record<string, string> = {}) => {
      const r = await get(app, url, headers);
      return [r.statusCode, r.headers.location ?? null, r.headers["set-cookie"] ?? null];
    };
    const isIndex = (body: string) => body.includes("/v2/addons/error-compat.js") && !body.includes("/login.js");
    const isLogin = (body: string) => body.includes('<script src="/login.js">');

    it("react: a bare / page request opens the React app, logged in or not; a background fetch of / does not", async () => {
      const app = await make("react");
      expect(await where(app, "/")).toEqual([302, "/app", null]);
      expect(await where(app, "/", cookie())).toEqual([302, "/app", null]);
      const sw = await app.inject({ url: "/", headers: { accept: "*/*", ...cookie() } }); // the old UI's service worker warming its shell
      expect([sw.statusCode, sw.headers["set-cookie"]]).toEqual([200, undefined]);
      expect(isIndex(sw.body)).toBe(true);
    });
    it("react: with the cookie oc_ui=classic, / behaves as today (login gate, then today's UI)", async () => {
      const app = await make("react");
      expect((await where(app, "/", CHOSEN)).slice(0, 2)).toEqual([302, "/login"]);
      const r = await get(app, "/", both());
      expect(r.statusCode).toBe(200);
      expect(isIndex(r.body)).toBe(true);
    });
    it("react: /?classic=1 sets the session cookie and continues at a clean / that does not bounce to /app", async () => {
      const app = await make("react");
      expect(await where(app, "/?classic=1")).toEqual([302, "/", "oc_ui=classic; Path=/; SameSite=Lax"]);
      expect(await where(app, "/?classic=1&deal=9001", cookie())).toEqual([302, "/?deal=9001", "oc_ui=classic; Path=/; SameSite=Lax"]);
      const secure = await make("react", true);
      expect((await where(secure, "/?classic=1"))[2]).toBe("oc_ui=classic; Path=/; SameSite=Lax; Secure");
      const next = await get(app, "/", both()); // the redirected request carries the cookie
      expect([next.statusCode, isIndex(next.body)]).toEqual([200, true]);
    });
    it("react: / with another query is today's UI as before, and serving today's page remembers the choice", async () => {
      const app = await make("react");
      expect(await where(app, "/?offer=1")).toEqual([302, "/login?next=%2F%3Foffer%3D1", null]);
      for (const url of ["/?offer=1", "/?deal=9001", "/?entwurf=t-0123456789abcdef01234567"]) {
        const r = await get(app, url, cookie());
        expect([url, r.statusCode, r.headers["set-cookie"], isIndex(r.body)]).toEqual([url, 200, "oc_ui=classic; Path=/; SameSite=Lax", true]);
      }
      const s = await get(app, "/irgendwo/tief", cookie()); // SPA fallback = today's UI too
      expect([s.statusCode, s.headers["set-cookie"]]).toEqual([200, "oc_ui=classic; Path=/; SameSite=Lax"]);
    });
    it("react: /login opens the React app; /login?next=… and a browser that chose today's UI keep today's login page", async () => {
      const app = await make("react");
      expect(await where(app, "/login")).toEqual([302, "/app", null]);
      const deep = await get(app, "/login?next=%2F%3Foffer%3D1");
      expect([deep.statusCode, isLogin(deep.body)]).toEqual([200, true]);
      const chosen = await get(app, "/login", CHOSEN); // logout in today's UI
      expect([chosen.statusCode, isLogin(chosen.body)]).toEqual([200, true]);
    });
    it("classic (default) and explicit classic: nothing changes, no cookie anywhere", async () => {
      for (const app of [await make(), await make("classic")]) {
        expect(await where(app, "/")).toEqual([302, "/login", null]);
        const home = await get(app, "/", cookie());
        expect([home.statusCode, home.headers["set-cookie"], isIndex(home.body)]).toEqual([200, undefined, true]);
        const cl = await get(app, "/?classic=1", cookie());
        expect([cl.statusCode, cl.headers["set-cookie"], isIndex(cl.body)]).toEqual([200, undefined, true]);
        expect(await where(app, "/?offer=1")).toEqual([302, "/login?next=%2F%3Foffer%3D1", null]);
        const offer = await get(app, "/?offer=1", cookie());
        expect([offer.statusCode, offer.headers["set-cookie"]]).toEqual([200, undefined]);
        for (const url of ["/login", "/login?next=%2F"]) {
          const l = await get(app, url);
          expect([url, l.statusCode, isLogin(l.body)]).toEqual([url, 200, true]);
        }
      }
    });
  });
});
