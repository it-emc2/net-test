/**
 * @jest-environment jsdom
 *
 * Global pricing service (script.js fetchPrice): identical requests still in
 * flight share one fetch, each caller gets its own result object, and a
 * finished answer is never reused (Audit F-01, safe part).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/public");

test("in-flight identical price requests share one fetch, finished ones do not", async () => {
  document.documentElement.innerHTML = fs
    .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  window.fetch = () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
  window.CSS = { supports: () => false, escape: (x) => String(x) };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const noopModule = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : () => ({})) });
  window.__importStub = () => Promise.resolve(noopModule);
  window.eval(
    fs.readFileSync(path.join(PUBLIC, "script.js"), "utf8").replace(/\bimport\(/g, "__importStub("),
  );

  const marker = { __test: "inflight-share" };
  const mine = [];
  const pending = [];
  window.fetch = (url, opts) => {
    if (url === "/api/price" && String(opts?.body).includes("inflight-share")) {
      mine.push(opts.body);
      return new Promise((resolve) => {
        pending.push(() =>
          resolve({ ok: true, json: async () => ({ total: 42, rows: [{ a: 1 }] }), text: async () => "" }),
        );
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
  };

  const p1 = window.__fetchPrice(marker);
  const p2 = window.__fetchPrice({ ...marker });
  const p3 = window.__fetchPrice({ ...marker, other: 1 });
  await Promise.resolve();
  expect(mine).toHaveLength(2); // p1+p2 shared, p3 has a different body
  pending.splice(0).forEach((fn) => fn());
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  expect(r1).toEqual({ total: 42, rows: [{ a: 1 }] });
  expect(r2).toEqual(r1);
  expect(r2).not.toBe(r1); // own object per caller
  r1.rows[0].a = 99;
  expect(r2.rows[0].a).toBe(1);
  expect(r3.total).toBe(42);

  // Finished → a new identical call fetches again.
  const p4 = window.__fetchPrice(marker);
  await Promise.resolve();
  expect(mine).toHaveLength(3);
  pending.splice(0).forEach((fn) => fn());
  await p4;
});
