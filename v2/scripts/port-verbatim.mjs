// Verbatim ports of fast-changing legacy data/pure modules (bathtub catalog data etc.).
// The TS file = generated header + the legacy JS unchanged (// @ts-nocheck), so behaviour is
// identical by construction. Drift guard: apps/server/test/verbatim-ports.test.ts.
// Re-port after a main sync: node v2/scripts/port-verbatim.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PORTS = [
  { from: "src/lib/wanneSets.js", to: "v2/apps/server/src/catalog/ported/wanne-sets.ts" },
  { from: "src/lib/wanneDescribe.js", to: "v2/apps/server/src/catalog/ported/wanne-describe.ts" },
];
export const header = (from) =>
  `// @ts-nocheck\n// GENERATED verbatim copy of ${from} — do not edit. Re-port: node v2/scripts/port-verbatim.mjs\n// Drift guard: apps/server/test/verbatim-ports.test.ts\n`;
export const expected = (from) => header(from) + fs.readFileSync(path.join(ROOT, from), "utf8");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const p of PORTS) {
    fs.writeFileSync(path.join(ROOT, p.to), expected(p.from));
    console.log("ported", p.from, "→", p.to);
  }
}
