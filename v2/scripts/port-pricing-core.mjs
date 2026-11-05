#!/usr/bin/env node
// Re-ports legacy src/logic/pricing-core.js → v2/packages/pricing/src/core.ts in one step:
//  1. legacy file + typed header (port/core.header.ts.txt) + MaterialLine type
//  2. known type-only pre-pass edits (exact strings — fails loudly if the legacy code moved)
//  3. strictify.mjs for everything else (type-only, compiler-driven)
// Afterwards: npx vitest run --project pricing  (drift guard + golden + differential).
//   node scripts/port-pricing-core.mjs <main-sha>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const sha = (process.argv[2] || execFileSync("git", ["rev-parse", "--short=8", "origin/main"]).toString().trim());
const legacy = readFileSync(here("../../src/logic/pricing-core.js"), "utf8");
const header = readFileSync(here("../packages/pricing/port/core.header.ts.txt"), "utf8")
  .replace("{{MAIN_SHA}}", sha).replace("{{DATE}}", new Date().toISOString().slice(0, 10));
const materialLine = readFileSync(here("../packages/pricing/port/material-line.ts.txt"), "utf8");

// [legacy text, typed text] — type annotations only
const PREPASS = [
  ["export default (ProductModel, deps = {}) => {", materialLine + "export default (ProductModel: PricingProductModel, deps: PricingDeps = {} as PricingDeps) => {"],
  ['let materials = { title: "", lines: [], sum: 0 };', 'let materials: any = { title: "", lines: [], sum: 0 };'],
  ["      let services = {", "      let services: any = {"],
  ["const resolved = lines.map(", "const resolved: any[] = lines.map("],
  ["const priorUnitById = new Map(", "const priorUnitById = new Map<string, number>("],
  ["const unique = [...new Set((ids || []).filter(Boolean))];", "const unique = [...new Set<string>((ids || []).filter(Boolean))];"],
  ["const [narrow, ...wide] = [...codes].reverse();", "const [narrow, ...wide]: any[] = [...codes].reverse();"],
];

let body = legacy;
const missing = [];
for (const [from, to] of PREPASS) {
  if (!body.includes(from)) missing.push(from);
  else body = body.replace(from, to);
}
if (missing.length) {
  console.error("pre-pass anchors not found (legacy code changed there — update PREPASS):\n  " + missing.join("\n  "));
  process.exit(1);
}
const out = here("../packages/pricing/src/core.ts");
writeFileSync(out, header + body);
execFileSync("node", [here("./strictify.mjs"), out], { stdio: "inherit" });
