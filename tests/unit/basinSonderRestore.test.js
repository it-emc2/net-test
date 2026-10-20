import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/public/script.js"),
  "utf8",
);

// The Sonderprodukt basin was added without being put into the lists that
// derive cat_BASIN from its kids, so reopening a Sonderprodukt-only offer left
// the category off and resetPanel() wiped the basin and its WTBF/RSL/EV.
// Every list that names the catalog basins must name the Sonderprodukt too.
test("every basin list includes the Sonderprodukt basin", () => {
  const lists = SCRIPT.match(/\[[^\]]*"opt_DEP65U"[^\]]*\]/g) || [];
  expect(lists.length).toBeGreaterThanOrEqual(3);
  for (const list of lists) expect(list).toContain('"opt_BASIN_SONDER"');
});

// Opening an offer does not reset the form first: restore must clear what the
// new offer does not mention, or the previous offer's basin leaks into it.
test("Optional restore clears leftover quantities and the Sonderprodukt fields", () => {
  const start = SCRIPT.indexOf("function restoreOptionalPage(opt) {");
  const body = SCRIPT.slice(start, SCRIPT.indexOf("\nfunction ", start + 10));
  const zeroAt = body.indexOf('el.value = "0"');
  const applyAt = body.indexOf("restoreOptional(opt);");
  expect(zeroAt).toBeGreaterThan(-1);
  expect(zeroAt).toBeLessThan(applyAt); // zero first, then apply the payload
  // the Sonder name field is written outside the quickAdd branch
  const sonderAt = body.indexOf('getElementById("basinSonderName")');
  const quickAddBranch = body.indexOf("if (Array.isArray(opt.quickAdd)) {");
  expect(sonderAt).toBeGreaterThan(-1);
  expect(sonderAt).toBeLessThan(quickAddBranch);
});
