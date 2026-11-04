/**
 * Duschabtrennung (neu) / Duschvorhang an/aus (2026-10-27): off keeps the
 * configuration but prices nothing. Saved offers predate the switches, so they
 * reopen "on" exactly when they carry configured lines, and the flags never
 * change a saved offer's pricing fingerprint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeFingerprint } from "../../src/logic/pricing-core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "src/public/script.js"), "utf8");
const start = src.indexOf("function sectionSwitch(key)");
const end = src.indexOf("// Called by RestoreManager once the configurators are restored.", start);
const { deriveSectionOn } = new Function(`${src.slice(start, end)}\nreturn { deriveSectionOn };`)();

test("old offers: on exactly when configured lines were saved", () => {
  const line = [{ articleNumber: "X", net: 100 }];
  expect(deriveSectionOn("daNeu", { duschabtrennung: { configurator: { lines: line } } })).toBe(true);
  expect(deriveSectionOn("daNeu", { duschabtrennung: { quickAdd: [] } })).toBe(false);
  expect(deriveSectionOn("curtain", { duschvorhang: { configurator: { lines: line } } })).toBe(true);
  expect(deriveSectionOn("curtain", {})).toBe(false);
});

test("a saved flag wins", () => {
  const p = { duschabtrennung: { configEnabled: false, curtainEnabled: true, configurator: { lines: [{}] } } };
  expect(deriveSectionOn("daNeu", p)).toBe(false);
  expect(deriveSectionOn("curtain", p)).toBe(true);
});

test("the flags never change the pricing fingerprint", () => {
  const saved = { activeOffer: "bu", duschabtrennung: { quickAdd: [{ kind: "config", price: 1 }] } };
  const reopened = { activeOffer: "bu", duschabtrennung: { ...saved.duschabtrennung, configEnabled: true, curtainEnabled: false } };
  expect(computeFingerprint(reopened)).toBe(computeFingerprint(saved));
});

test("markup: both switches exist without a name, pages start switched off", async () => {
  const { JSDOM } = await import("jsdom");
  const doc = new JSDOM(fs.readFileSync(path.join(ROOT, "src/public/index.html"), "utf8")).window.document;
  for (const [toggle, page] of [["daNeuToggle", "page-DuschabtrennungNeu"], ["vorhangToggle", "page-Duschvorhang"]]) {
    expect(doc.getElementById(toggle).hasAttribute("name")).toBe(false);
    expect(doc.getElementById(page).hasAttribute("data-section-off")).toBe(true);
    expect(doc.getElementById(toggle).closest(".sec-keep")).not.toBeNull();
  }
  // All six section switches share one look.
  for (const id of ["dwTrayToggle", "addFlooring", "addWallCladding", "wvEnabled", "daNeuToggle", "vorhangToggle"]) {
    expect(doc.getElementById(id).closest(".sec-switch")).not.toBeNull();
  }
});
