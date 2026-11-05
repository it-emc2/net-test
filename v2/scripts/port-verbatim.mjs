// Verbatim ports of fast-changing legacy data/pure modules (bathtub catalog data etc.).
// The TS file = generated header + the legacy JS unchanged (// @ts-nocheck), so behaviour is
// identical by construction. Drift guard: apps/server/test/verbatim-ports.test.ts.
// Re-port after a main sync: node v2/scripts/port-verbatim.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Each rule must match (a vanished anchor fails the port, so a main change is never ported blindly).
const DOCS_TRANSFORMS = [
  ['import express from "express";', 'import express from "../shims/express.js";\nimport { docsRoot, docsLog, pdfEngine } from "../shims/runtime.js";'],
  ['from "../logic/pricing-core.js"', 'from "@oc/pricing"'],
  ['from "../models/Product.js"', 'from "../shims/product-model.js"'],
  ['from "../models/User.js"', 'from "../shims/user-model.js"'],
  ['from "../logic/pricing.js"', 'from "../shims/pricing.js"'],
  ['from "../services/configService.js"', 'from "../shims/config.js"'],
  ['from "../lib/docxTextReplace.js"', 'from "./docx-text-replace.js"'],
  [/process\.cwd\(\)/g, "docsRoot()"],
  [/\bconsole\./g, "docsLog."],
  // PDF via Gotenberg (ADR 008): no LibreOffice warm-up at import, conversion through the engine
  [/\nspawn\(\s*"soffice",[\s\S]*?\)\.on\("error", \(\) => \{\}\);\n/, "\n/* v2: no LibreOffice warm-up — PDFs via the PDF engine (ADR 008) */\n"],
  [/function convertDocxToPdf\(docxBuffer\) \{[\s\S]*?\n\}\n/, "function convertDocxToPdf(docxBuffer) {\n  return pdfEngine().docxToPdf(docxBuffer); // v2: Gotenberg (ADR 008)\n}\n"],
];

export const PORTS = [
  { from: "src/lib/wanneSets.js", to: "v2/apps/server/src/catalog/ported/wanne-sets.ts" },
  { from: "src/lib/wanneDescribe.js", to: "v2/apps/server/src/catalog/ported/wanne-describe.ts" },
  { from: "src/lib/docxTextReplace.js", to: "v2/apps/server/src/documents/ported/docx-text-replace.ts" },
  { from: "src/routes/docx-template.js", to: "v2/apps/server/src/documents/ported/docx-template.ts", transforms: DOCS_TRANSFORMS },
];
export const header = (from, rules = 0) =>
  `// @ts-nocheck\n// GENERATED ${rules ? `copy of ${from} with ${rules} import/runtime rewrites (see v2/scripts/port-verbatim.mjs)` : `verbatim copy of ${from}`} — do not edit. Re-port: node v2/scripts/port-verbatim.mjs\n// Drift guard: apps/server/test/verbatim-ports.test.ts\n`;
export function expected(from, transforms = []) {
  let src = fs.readFileSync(path.join(ROOT, from), "utf8");
  for (const [find, repl] of transforms) {
    const hit = typeof find === "string" ? src.includes(find) : find.test(src);
    if (find instanceof RegExp) find.lastIndex = 0;
    if (!hit) throw new Error(`port rule no longer matches in ${from}: ${find}`);
    src = typeof find === "string" ? src.split(find).join(repl) : src.replace(find, repl);
  }
  return header(from, transforms.length) + src;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const p of PORTS) {
    fs.writeFileSync(path.join(ROOT, p.to), expected(p.from, p.transforms));
    console.log("ported", p.from, "→", p.to);
  }
}
