/* eslint-disable no-undef */
// buildCleverbadCatalog.mjs
// Writes src/logic/cleverbad-catalog.json: which cleverbad.de article (Badolux's
// shop) each of our Badolux products is, for the Badolux cart file that goes to the
// Bitrix timeline (src/logic/badolux-cart.js). Re-run when the shop or our
// products change.
//
//   • variants: every shop variant we can order, by article number
//   • ours:     our productId → shop article number (trays by size, wall panels by colour)
//
// Reads the shop's product pages (public) and our Products collection (read-only).
// Run: node scripts/buildCleverbadCatalog.mjs

import "dotenv/config";
import mongoose from "mongoose";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../src/logic/cleverbad-catalog.json");
const MOTIFS = join(__dirname, "../src/public/assets/badolux/keramico-motive.json");
const SHOP = "https://cleverbad.de";

const SLUGS = [
  "duschwanne-riviera",
  "siphon-bridge-90",
  "falttuer-lissabon",
  "falttuer-rom",
  "falttuer-stockholm",
  "schiebetuer-madrid",
  "duschglas-wien",
  "wandpaneel-keramico-marmor-weiss",
  "wandpaneel-keramico-steingrau",
  "wandpaneel-keramico-grau",
  "wandpaneel-keramico-creme",
  "wandpaneel-keramico-sahara",
  "wandpaneel-keramico-cafe",
  "wandpaneel-dein-design",
];

// The product object embedded in a product page (Next.js payload).
async function shopProduct(slug) {
  const html = (await (await fetch(`${SHOP}/produkt/${slug}`)).text()).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const start = html.indexOf(`{"slug":"${slug}","id"`);
  if (start < 0) throw new Error(`no product data on /produkt/${slug}`);
  let depth = 0, i = start, inStr = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '"' && html[i - 1] !== "\\") inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return JSON.parse(html.slice(start, i + 1));
}

const variants = {};
const add = (sku, v) => { variants[sku] = v; };
for (const slug of SLUGS) {
  const p = await shopProduct(slug);
  for (const v of p.variants || []) {
    const a = v.attributes || {};
    add(v.sku, {
      slug,
      name: p.name,
      label: v.label || null,
      option: a.option ?? null,
      widthCm: a.widthCm ?? null,
      lengthCm: a.lengthCm ?? null,
      glassMm: a.glassMm ?? null,
    });
  }
}
// Catalogue motifs (Sonder-Dekor): the scroller's list already has sku + image path,
// and the image path starts with the product slug.
for (const m of JSON.parse(readFileSync(MOTIFS, "utf8")).motive) {
  add(m.sku, { slug: m.img.split("/")[0], name: `Wandpaneel ${m.name}`, label: m.kollektion, option: null, widthCm: 95, lengthCm: null, glassMm: null });
}

// --- our products → shop article --------------------------------------------------
await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const db = mongoose.connection.db;
const ours = {};

const key = (w, l) => `${Math.min(w, l)}x${Math.max(w, l)}`;
const riviera = Object.entries(variants).filter(([, v]) => v.slug === "duschwanne-riviera" && v.option === "Weiß");
const trays = await db.collection("Products").find({ productId: /^DW\d+$/, source: /badolux/i }).project({ productId: 1, widthCm: 1, lengthCm: 1 }).toArray();
for (const t of trays) {
  const hit = riviera.find(([, v]) => key(v.widthCm, v.lengthCm) === key(t.widthCm, t.lengthCm));
  if (hit) ours[t.productId] = hit[0];
  else console.warn(`no Riviera size for ${t.productId} ${t.widthCm}×${t.lengthCm}`);
}

const COLOUR_SLUG = { "marmor weiß": "marmor-weiss", steingrau: "steingrau", grau: "grau", creme: "creme", sahara: "sahara", cafe: "cafe" };
const panels = await db.collection("Products").find({ productId: /^WP00[1-6]$/ }).project({ productId: 1, name: 1 }).toArray();
for (const p of panels) {
  const colour = String(p.name).replace(/^Standard-Dekor\s+/i, "").trim().toLowerCase();
  const slug = `wandpaneel-keramico-${COLOUR_SLUG[colour]}`;
  const hit = Object.entries(variants).find(([, v]) => v.slug === slug);
  if (hit) ours[p.productId] = hit[0];
  else console.warn(`no Keramico panel for ${p.productId} "${p.name}"`);
}
ours["WP007"] = "PRI73WP999"; // Sonder-Dekor without a catalogue motif = "Dein Design"
await mongoose.disconnect();

const catalog = { shop: SHOP, generatedAt: new Date().toISOString(), variants, ours };
writeFileSync(OUT, JSON.stringify(catalog, null, 1) + "\n");
console.log(`Wrote ${OUT}: ${Object.keys(variants).length} variants, ${Object.keys(ours).length} of our products mapped`);
