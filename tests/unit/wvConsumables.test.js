/**
 * @jest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public/script.js",
);

const CONSUMABLES = [
  "wvSealingSelected",
  "wvFlachenSelected",
  "wvSilikonSelected",
  "wvEndProfileSelected",
];

// Slice recomputeWVFlachenQty + syncWVConsumablesToPanels out of the browser
// script and run them against a minimal WV form.
function loadRecompute() {
  const src = fs.readFileSync(SCRIPT_PATH, "utf8");
  const start = src.indexOf("function recomputeWVFlachenQty() {");
  const end = src.indexOf("\n    cb.dispatchEvent", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  const body = src.slice(start, src.indexOf("\n}", end) + 2);
  return new Function(`${body}\nreturn recomputeWVFlachenQty;`)();
}

function setup({ panels = 0, consumables = true } = {}) {
  document.body.innerHTML = `
    <input id="wvQty997" value="${panels}">
    <input id="wvQty1497" value="0">
    <input id="wvFlachenQty" value="">
    ${CONSUMABLES.map(
      (id) => `<input type="checkbox" id="${id}"${consumables ? " checked" : ""}>`,
    ).join("")}
  `;
  delete window.__RESTORING__;
  delete window.__restoring;
}

const checked = () =>
  CONSUMABLES.map((id) => document.getElementById(id).checked);

test("no panels switches the consumables off", () => {
  const recompute = loadRecompute();
  setup({ panels: 0, consumables: true });

  recompute();

  expect(checked()).toEqual([false, false, false, false]);
});

test("a prefilled Flächenkleber qty is cleared when the panels go away", () => {
  const recompute = loadRecompute();
  setup({ panels: 0, consumables: true });
  document.getElementById("wvFlachenQty").value = "1"; // what the sync IIFE writes on load

  recompute();

  expect(document.getElementById("wvFlachenQty").value).toBe("0");
});

test("first panel switches them back on, later edits leave them alone", () => {
  const recompute = loadRecompute();
  setup({ panels: 0, consumables: true });
  recompute(); // primes lastWvPanelTotal at 0 and clears the boxes

  document.getElementById("wvQty997").value = "2";
  recompute();
  expect(checked()).toEqual([true, true, true, true]);
  expect(document.getElementById("wvFlachenQty").value).toBe("4");

  // user deliberately drops Silikon, then changes the panel count
  document.getElementById("wvSilikonSelected").checked = false;
  document.getElementById("wvQty997").value = "3";
  recompute();
  expect(checked()).toEqual([true, true, false, true]);
});

test("restore is left untouched", () => {
  const recompute = loadRecompute();
  setup({ panels: 0, consumables: true });
  window.__RESTORING__ = true;

  recompute();

  // saved state wins: nothing switched off despite zero panels
  expect(checked()).toEqual([true, true, true, true]);
});
