/**
 * @jest-environment jsdom
 *
 * initWVConnectorsUI() runs on every visit to the Wandverkleidung page; it
 * must wire its listeners only once (Audit F-11 listener leak).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/public");

test("visiting Wandverkleidung twice does not add listeners twice", () => {
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

  const qty = document.getElementById("wvV3VQty");
  expect(qty).toBeTruthy();
  let added = 0;
  const orig = qty.addEventListener.bind(qty);
  qty.addEventListener = (...a) => {
    added += 1;
    return orig(...a);
  };
  window.initWVConnectorsUI();
  const first = added;
  expect(first).toBeGreaterThan(0);
  window.initWVConnectorsUI();
  window.initWVConnectorsUI();
  expect(added).toBe(first);
  expect(document.getElementById("wvV3VRuleText").innerHTML).toMatch(/Empfehlung|Keine Verbindungsprofile/);
});
