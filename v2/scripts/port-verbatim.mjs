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
  // main's optional Gotenberg helper (PR #320) is not needed: v2 always converts through its PDF engine
  ['import { withGotenberg, gotenbergDocxToPdf } from "../utils/gotenberg.js";\n', ""],
  [/process\.cwd\(\)/g, "docsRoot()"],
  [/\bconsole\./g, "docsLog."],
  // PDF via Gotenberg (ADR 008): no LibreOffice warm-up at import, conversion through the engine
  [/\nspawn\(\s*"soffice",[\s\S]*?\)\.on\("error", \(\) => \{\}\);\n/, "\n/* v2: no LibreOffice warm-up — PDFs via the PDF engine (ADR 008) */\n"],
  [/function convertDocxToPdf\(docxBuffer\) \{[\s\S]*?\n\}\n/, "function convertDocxToPdf(docxBuffer) {\n  return pdfEngine().docxToPdf(docxBuffer); // v2: Gotenberg (ADR 008)\n}\n"],
];

const SIGNING_TRANSFORMS = [
  ['from "../lib/signatureImage.js"', 'from "./signature-image.js"'],
  ['import { replaceTextInHtml } from "../lib/docxTextReplace.js";', 'import { replaceTextInHtml } from "./docx-text-replace.js";\nimport { docsRoot } from "../shims/runtime.js";'],
  ['path.join(__dirname, "..", "public", "assets", "logo.png")', 'path.join(docsRoot(), "src", "public", "assets", "logo.png")'],
];

// shared rewrites for ported legacy route modules
const ROUTE_BASE = [
  ['import express from "express";', 'import express from "../shims/express.js";\nimport { docsRoot, docsLog } from "../shims/runtime.js";'],
  [/from "\.\.\/models\/Product\.js"/g, 'from "../shims/product-model.js"', { optional: true }],
  [/from "\.\.\/logic\/pricing\.js"/g, 'from "../shims/pricing.js"', { optional: true }],
  [/process\.cwd\(\)/g, "docsRoot()", { optional: true }],
  [/\bconsole\./g, "docsLog.", { optional: true }],
];
const KALK_TRANSFORMS = [
  ...ROUTE_BASE,
  ['from "../utils/htmlToPdf.js"', 'from "../shims/html-to-pdf.js"'],
  ['from "../templates/kalkulation-v2.js"', 'from "./kalkulation-v2.js"'],
];
const ARB_TRANSFORMS = [
  ...ROUTE_BASE,
  ['from "../models/Offer.js"', 'from "../shims/offer-model.js"'],
  ['from "../models/Draft.js"', 'from "../shims/draft-model.js"'],
];
const PRODUCT_IMAGE_TRANSFORMS = [
  ['import { htmlToPdfBuffer } from "../utils/htmlToPdf.js";', 'import { htmlToPdfBuffer } from "../shims/html-to-pdf.js";\nimport { docsLog } from "../shims/runtime.js";'],
  ['from "../external/vigorDb.js"', 'from "../shims/vigor-db.js"'],
  [/\bconsole\./g, "docsLog."],
];
const KALK_V2_TEMPLATE_TRANSFORMS = [
  ['import fs from "fs";', 'import fs from "fs";\nimport { docsRoot } from "../shims/runtime.js";'],
  ['path.join(__dirname, "..", "public", "assets", "logo.png")', 'path.join(docsRoot(), "src", "public", "assets", "logo.png")'],
];

const MATERIAL_TRANSFORMS = [
  ...ROUTE_BASE,
  ['from "../logic/badolux-cart.js"', 'from "./badolux-cart.js"'],
  ['from "../lib/wanneSets.js"', 'from "../../catalog/ported/wanne-sets.js"'],
  // module-relative data file → legacy data folder under DOCUMENTS_ROOT
  ['new URL("../logic/cleverbad-catalog.json", import.meta.url)', 'path.join(docsRoot(), "src", "logic", "cleverbad-catalog.json")'],
];
const HL_TRANSFORMS = [
  ...ROUTE_BASE,
  ['import multer from "multer";', 'import multer from "../shims/multer.js";'],
];

export const PORTS = [
  { from: "src/lib/wanneSets.js", to: "v2/apps/server/src/catalog/ported/wanne-sets.ts" },
  { from: "src/lib/wanneDescribe.js", to: "v2/apps/server/src/catalog/ported/wanne-describe.ts" },
  { from: "src/lib/docxTextReplace.js", to: "v2/apps/server/src/documents/ported/docx-text-replace.ts" },
  { from: "src/routes/docx-template.js", to: "v2/apps/server/src/documents/ported/docx-template.ts", transforms: DOCS_TRANSFORMS },
  { from: "src/routes/kalkulation.js", to: "v2/apps/server/src/documents/ported/kalkulation.ts", transforms: KALK_TRANSFORMS },
  { from: "src/templates/kalkulation-v2.js", to: "v2/apps/server/src/documents/ported/kalkulation-v2.ts", transforms: KALK_V2_TEMPLATE_TRANSFORMS },
  { from: "src/routes/arbeitsbericht.js", to: "v2/apps/server/src/documents/ported/arbeitsbericht.ts", transforms: ARB_TRANSFORMS },
  { from: "src/routes/pdf-preview.js", to: "v2/apps/server/src/documents/ported/pdf-preview.ts", transforms: ROUTE_BASE },
  { from: "src/lib/productImagePdf.js", to: "v2/apps/server/src/documents/ported/product-image-pdf.ts", transforms: PRODUCT_IMAGE_TRANSFORMS },
  { from: "src/routes/material-overview.js", to: "v2/apps/server/src/documents/ported/material-overview.ts", transforms: MATERIAL_TRANSFORMS },
  { from: "src/logic/badolux-cart.js", to: "v2/apps/server/src/documents/ported/badolux-cart.ts" },
  { from: "src/routes/hl-parse.js", to: "v2/apps/server/src/documents/ported/hl-parse.ts", transforms: HL_TRANSFORMS },
  { from: "src/routes/pdf.js", to: "v2/apps/server/src/documents/ported/pdf-summary.ts", transforms: ROUTE_BASE },
  // web layer (phase 6, ADR 021): settings that live inline in legacy app.js / authGate.js
  { from: "src/app.js", to: "v2/apps/server/src/web/ported/helmet-options.ts", extract: { start: "  helmet({", object: true, prefix: "export default ", suffix: ";\n" } },
  { from: "src/app.js", to: "v2/apps/server/src/web/ported/cors-origins.ts", extract: { start: "const allowedExact = new Set([", end: "app.use(\n  cors(", suffix: "export { isAllowedOrigin };\n" } },
  { from: "src/middleware/authGate.js", to: "v2/apps/server/src/web/ported/public-paths.ts", extract: { start: "const ASSET_RE =", end: "function isExternalApi(p)", suffix: "export { isPublicAsset, isPublicSigning, isAlwaysPublic };\n" } },
  { from: "src/lib/signatureImage.js", to: "v2/apps/server/src/documents/ported/signature-image.ts" },
  { from: "src/templates/signing-docs.js", to: "v2/apps/server/src/documents/ported/signing-docs.ts", transforms: SIGNING_TRANSFORMS },
];
export const header = (from, rules = 0) =>
  `// @ts-nocheck\n// GENERATED ${rules ? `copy of ${from} with ${rules} import/runtime rewrites (see v2/scripts/port-verbatim.mjs)` : `verbatim copy of ${from}`} — do not edit. Re-port: node v2/scripts/port-verbatim.mjs\n// Drift guard: apps/server/test/verbatim-ports.test.ts\n`;
/** Cut a piece out of a legacy file: from `start` to (excluding) `end`, or — with `object` —
 *  the balanced {…} literal that follows `start`. Missing anchors fail the port. */
export function extractPiece(src, from, x) {
  const i = src.indexOf(x.start);
  if (i < 0) throw new Error(`extract anchor not found in ${from}: ${x.start}`);
  if (x.object) {
    const open = src.indexOf("{", i);
    let depth = 0;
    for (let k = open; k < src.length; k++) {
      if (src[k] === "{") depth++;
      else if (src[k] === "}" && --depth === 0) return src.slice(open, k + 1);
    }
    throw new Error(`unbalanced object after ${x.start} in ${from}`);
  }
  const j = src.indexOf(x.end, i);
  if (j < 0) throw new Error(`extract end anchor not found in ${from}: ${x.end}`);
  return src.slice(i, j);
}

export function expected(from, transforms = [], extract = null) {
  let src = fs.readFileSync(path.join(ROOT, from), "utf8");
  if (extract) src = (extract.prefix ?? "") + extractPiece(src, from, extract) + (extract.suffix ?? "");
  for (const [find, repl, opts] of transforms) {
    const hit = typeof find === "string" ? src.includes(find) : find.test(src);
    if (find instanceof RegExp) find.lastIndex = 0;
    if (!hit && !opts?.optional) throw new Error(`port rule no longer matches in ${from}: ${find}`);
    src = typeof find === "string" ? src.split(find).join(repl) : src.replace(find, repl);
  }
  // module-relative file reads break once the file lives in v2 → must be rewritten by a rule
  if (transforms.length && /new URL\([^)]*import\.meta\.url\)|path\.join\(__dirname/.test(src))
    throw new Error(`${from}: module-relative path left after porting (add a rule mapping it to docsRoot())`);
  return header(from, transforms.length + (extract ? 1 : 0)) + src;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const p of PORTS) {
    fs.writeFileSync(path.join(ROOT, p.to), expected(p.from, p.transforms, p.extract));
    console.log("ported", p.from, "→", p.to);
  }
}
