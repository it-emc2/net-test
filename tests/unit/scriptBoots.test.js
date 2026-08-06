/**
 * @jest-environment jsdom
 *
 * script.js is one big classic script: anything that throws during top-level
 * execution silently kills every listener registered after it, and the app
 * looks alive but dead (clicks do nothing). Boot it once and fail loudly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public",
);

test("script.js runs its top level without throwing", () => {
  document.documentElement.innerHTML = fs
    .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");

  // Browser APIs jsdom lacks. Keep this list minimal — every stub added here
  // is a real API the script depends on.
  window.fetch = () =>
    Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
  window.CSS = { supports: () => false, escape: (x) => String(x) };
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  // The script lazy-loads its managers with dynamic import(); jest's module
  // resolver rejects those paths. They are all awaited asynchronously, so
  // stubbing them does not weaken what this test checks: the synchronous
  // top-level run.
  // Any named export resolves to a no-op. `then` must stay undefined or the
  // module object would be mistaken for a thenable.
  const noopModule = new Proxy(
    {},
    { get: (_t, k) => (k === "then" ? undefined : () => ({})) },
  );
  window.__importStub = () => Promise.resolve(noopModule);
  const src = fs
    .readFileSync(path.join(PUBLIC, "script.js"), "utf8")
    .replace(/\bimport\(/g, "__importStub(");

  expect(() => window.eval(src)).not.toThrow();
});
