/**
 * @jest-environment jsdom
 *
 * #wvEnabled (WV checkbox): old offers/drafts have no wvEnabled key and must
 * restore with WV on (unless "Keine" was picked); new payloads carry it
 * explicitly. Boots the real script.js like wandverkleidung-offline.test.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/public");

beforeAll(() => {
  document.documentElement.innerHTML = fs
    .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");
  window.fetch = () => Promise.reject(new Error("offline"));
  window.CSS = { supports: () => false, escape: (x) => String(x) };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const noop = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : () => ({})) });
  window.__importStub = () => Promise.resolve(noop);
  window.eval(
    fs.readFileSync(path.join(PUBLIC, "script.js"), "utf8").replace(/\bimport\(/g, "__importStub("),
  );
});

const cb = () => document.getElementById("wvEnabled");
const checked = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";

beforeEach(() => document.getElementById("form-wandverkleidung").reset());

test("fresh form: WV off, no Art and no Dekor preselected", () => {
  expect(cb().checked).toBe(false);
  expect(checked("wvKind")).toBe("");
  expect(checked("wvColor")).toBe("");
});

test("legacy payload (no wvEnabled) restores with WV on", () => {
  window.restoreWV({ wvKind: "Fliesenspiegel", wvColor: "Marmor weiß" });
  expect(cb().checked).toBe(true);
  expect(checked("wvKind")).toBe("Fliesenspiegel");
});

test('legacy payload with "Keine" restores with WV off', () => {
  window.restoreWV({ wvKind: "Keine", wvColor: "Marmor weiß" });
  expect(cb().checked).toBe(false);
});

test("explicit wvEnabled wins on restore and round-trips through buildPayload", () => {
  window.restoreWV({ wvEnabled: false, wvKind: "Deckenhoch", wvColor: "Weiß" });
  expect(cb().checked).toBe(false);
  expect(window.buildPayload().wandverkleidung.wvEnabled).toBe(false);

  window.restoreWV({ wvEnabled: true, wvKind: "Deckenhoch", wvColor: "Weiß" });
  expect(cb().checked).toBe(true);
  expect(window.buildPayload().wandverkleidung.wvEnabled).toBe(true);
});

// The send check (wvCheck) moved to angebotscheck.js — a red Angebotscheck
// row plus the pre-send confirmation; see tests/unit/hauptpunkte.test.js and
// tests/unit/angebotscheck.test.js ("Wandverkleidung vollständig").
test("the old blocking send check is gone", () => {
  expect(window.wvCheck).toBeUndefined();
  expect(window.confirmWvPanels).toBeUndefined();
});
