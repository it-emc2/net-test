/**
 * @jest-environment jsdom
 *
 * loadBudgetWandPanels() (script.js) lists the Budget-Wandpaneele (Badolux
 * WP*) products for the Wandverkleidung tab. It used to have no offline
 * fallback at all: a failed /api/products fetch left the section empty. It
 * now falls back to the same cached pricing snapshot (nt-pricing-inputs)
 * every other price lookup already uses — see docs1/13-OFFLINE-AND-SYNC.md.
 *
 * Boots the real script.js the same way tests/unit/scriptBoots.test.js does
 * (a classic script, so this is the only way to reach a top-level function),
 * but with a real pricing-cache.js stub instead of a no-op, so the fallback
 * path can be exercised end to end.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public",
);

function bootScript({ fetchImpl, cachedInputs }) {
  document.documentElement.innerHTML = fs
    .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");

  window.fetch = fetchImpl;
  window.CSS = { supports: () => false, escape: (x) => String(x) };
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  const noopModule = new Proxy(
    {},
    { get: (_t, k) => (k === "then" ? undefined : () => ({})) },
  );
  // Every dynamic import() resolves to a no-op, EXCEPT pricing-cache.js —
  // the one the offline fallback actually needs — which gets a real
  // loadInputs() returning a canned snapshot.
  window.__importStub = (specifier) => {
    if (String(specifier).endsWith("pricing-cache.js")) {
      return Promise.resolve({ loadInputs: async () => cachedInputs });
    }
    return Promise.resolve(noopModule);
  };

  const src = fs
    .readFileSync(path.join(PUBLIC, "script.js"), "utf8")
    .replace(/\bimport\(/g, "__importStub(");

  window.eval(src);
}

test("falls back to the cached pricing snapshot when the live product list fetch fails", async () => {
  bootScript({
    fetchImpl: () => Promise.reject(new Error("offline")),
    cachedInputs: {
      products: [
        { productId: "WP002", name: "Standard-Dekor Grau", source: "badolux", price: 129 },
        { productId: "WP001", name: "Standard-Dekor Weiß", source: "badolux", price: 129 },
        // Must be excluded: right source, wrong prefix / right prefix, wrong source.
        { productId: "SLA12070", name: "Some tray", source: "hassmann", price: 300 },
        { productId: "WPX99", name: "Not a budget panel", source: "other", price: 50 },
      ],
    },
  });

  const list = await window.loadBudgetWandPanels();
  // Sorted by productId, exactly like the live path.
  expect(list.map((p) => p.productId)).toEqual(["WP001", "WP002"]);
  expect(list[0]).toMatchObject({ name: "Standard-Dekor Weiß", img: "./assets/budget/WP001.png" });
});

test("an empty cache offline yields an empty list, not a throw", async () => {
  bootScript({
    fetchImpl: () => Promise.reject(new Error("offline")),
    cachedInputs: null,
  });

  await expect(window.loadBudgetWandPanels()).resolves.toEqual([]);
});

test("still prefers the live fetch when it succeeds", async () => {
  bootScript({
    fetchImpl: () =>
      Promise.resolve({
        ok: true,
        json: async () => [
          { productId: "WP001", name: "Live Weiß", source: "badolux", price: 129 },
        ],
      }),
    cachedInputs: { products: [] },
  });

  const list = await window.loadBudgetWandPanels();
  expect(list).toEqual([
    { productId: "WP001", name: "Live Weiß", img: "./assets/budget/WP001.png" },
  ]);
});
