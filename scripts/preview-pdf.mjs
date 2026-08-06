/* eslint-disable no-undef */
// scripts/preview-pdf.mjs
//
// Rendert Angebots-PDFs aus JSON-Fixtures (scenarios/pdf/*.json) — ohne Server,
// ohne Login, ohne Browser. Nutzt genau denselben Pfad wie die App:
// pricing.computePrices → mapData → renderDocx → LibreOffice (soffice).
//
//   node scripts/preview-pdf.mjs                    # alle Fixtures
//   node scripts/preview-pdf.mjs ah-hd-ab           # nur dieses Fixture
//   node scripts/preview-pdf.mjs --out ~/Desktop    # Zielordner
//
// Doku: docs/preview-pdfs.md
import fs from "fs/promises";
import path from "path";
import url from "url";
import pricingFactory from "../src/logic/pricing.js";
import ProductModel from "../src/models/Product.js";
import {
  mapData,
  getAngebotTemplatePath,
  renderDocx,
  convertDocxToPdf,
  deepSanitizeDocxPayload,
  STATIC_DOCX_WORD_BLOCKLIST,
} from "../src/routes/docx-template.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../scenarios/pdf");
const pricing = pricingFactory(ProductModel);

// --- Argumente: [name …] [--out <dir>] -----------------------------------
const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outDir = outIdx >= 0 ? argv[outIdx + 1] : path.join(__dirname, "../preview-pdfs");
const names = argv.filter(
  (a, i) => !a.startsWith("--") && (outIdx < 0 || (i !== outIdx && i !== outIdx + 1)),
);

async function renderFixture(name) {
  const fixture = JSON.parse(
    await fs.readFile(path.join(FIXTURE_DIR, `${name}.json`), "utf8"),
  );
  // _computed überschreibt einzelne Preisfelder — praktisch, um eine Zeile auf
  // einen exakten Betrag zu prüfen (z. B. Eigenanteil genau 420 €).
  // _note ist reine Dokumentation im Fixture.
  const { _computed, _note, ...payload } = fixture;

  const computed = await pricing.computePrices(payload);
  if (_computed) Object.assign(computed, _computed);

  const data = deepSanitizeDocxPayload(
    await mapData(payload, computed),
    STATIC_DOCX_WORD_BLOCKLIST,
  );
  const tpl = getAngebotTemplatePath(payload);
  const pdf = await convertDocxToPdf(await renderDocx(tpl, data));

  const file = path.join(outDir, `${name}.pdf`);
  await fs.writeFile(file, pdf);

  const lines = data.AhGesamtbetrag
    ? `Gesamtbetrag ${data.AhGesamtbetrag} | Eigenanteil ${data.AhEigenanteil || "–"}`
    : (data.Totals || []).map((t) => `${t.label} ${t.value}`).join(" | ");
  return { file, tpl: path.basename(tpl), lines };
}

const list = names.length
  ? names
  : (await fs.readdir(FIXTURE_DIR))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();

await fs.mkdir(outDir, { recursive: true });
for (const name of list) {
  const { file, tpl, lines } = await renderFixture(name);
  console.log(`✓ ${name}  [${tpl}]\n    ${lines}\n    → ${file}`);
}
process.exit(0);
