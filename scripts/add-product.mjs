/**
 * add-product.mjs — put a product into the Konfigurator catalog.
 *
 *   Vigor:  node scripts/add-product.mjs COAIR40 [MORE_IDS...]
 *   Manual: node scripts/add-product.mjs --id=XY01 --name="…" --price=12.34 [--image=<url|file>]
 *
 * Does the two error-prone steps for you:
 *   1. upserts the article into the app's own `Products` collection (that is what
 *      pricing reads — Vigor itself is never queried at offer time)
 *   2. downloads the product image to src/public/assets/<ID>.jpg
 * Then prints the HTML tile + the JS wiring lines to paste.
 *
 * Flags: --group=optBasin (checkbox name group for the snippet)
 *        --dry            (look up / print only, no DB write, no download)
 *        --manufacturer="GC"  (any non-Hassmann value keeps the item out of the
 *                              Hassmann Warenkorb CSV — see docs)
 * See docs/optional-tab-produkte.md
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import Product from "../src/models/Product.js";

dotenv.config();

const ASSETS = path.resolve(import.meta.dirname, "../src/public/assets");

const argv = process.argv.slice(2);
const flag = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const has = (n) => argv.includes(`--${n}`);
const ids = argv.filter((a) => !a.startsWith("--"));

const DRY = has("dry");
const GROUP = flag("group") || "optX";

// ---------- Vigor lookup (read-only, separate cluster/db) ----------
async function fromVigor(articleNumbers) {
  const uri = process.env.VIGOR_MONGODB_URI;
  if (!uri) throw new Error("VIGOR_MONGODB_URI missing in .env");
  const conn = await mongoose
    .createConnection(uri, { dbName: "vigor" })
    .asPromise();
  try {
    const coll = conn.db.collection("products");
    const out = [];
    for (const articleNumber of articleNumbers) {
      const d = await coll.findOne({ articleNumber });
      if (!d) {
        console.error(`✗ ${articleNumber}: not in Vigor DB — use --manual flags`);
        continue;
      }
      out.push({
        productId: d.articleNumber,
        // `finish` carries the variant text (colour, connection, brand)
        name: [d.name, d.finish].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        price: d.netPrice, // net — the DB `price` field is VAT-exclusive
        imageUrl: d.images?.[0] || null,
        _vigor: { category: d.configContext?.category, unit: d.unit, gross: d.grosPrice },
      });
    }
    return out;
  } finally {
    await conn.close();
  }
}

function fromFlags() {
  const productId = flag("id");
  const name = flag("name");
  const price = Number(flag("price"));
  if (!productId || !name || !Number.isFinite(price)) {
    throw new Error("manual mode needs --id=… --name='…' --price=12.34");
  }
  return [{ productId, name, price, imageUrl: flag("image") || null, _vigor: null }];
}

// ---------- image ----------
async function saveImage(productId, src) {
  const target = path.join(ASSETS, `${productId}.jpg`);
  try {
    await fs.access(target);
    return { path: target, status: "exists" };
  } catch {}
  if (!src) return { path: null, status: "none" };
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`image download failed: ${res.status}`);
    await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
  } else {
    await fs.copyFile(path.resolve(src), target);
  }
  return { path: target, status: "written" };
}

// ---------- snippet ----------
function snippet(p, hasImage) {
  const id = p.productId;
  const img = hasImage ? `./assets/${id}.jpg` : `./assets/vk-brutto.jpg`;
  return `
<!-- ---------- paste into the menu_X panel in src/public/index.html ---------- -->
<div class="opt-item">
  <label class="image-check">
    <input type="checkbox" id="opt_${id}" name="${GROUP}[]"
      value="${p.name} ${id}" />
    <span class="img-wrap"><img src="${img}" alt="${id}" /></span>
    <span class="caption">${p.name} ${id}</span>
  </label>
  <div id="qty_${id}_wrap" class="field" hidden aria-hidden="true" style="max-width: 220px">
    <label for="qty_${id}" class="req">Menge ${id}</label>
    <input id="qty_${id}" name="qty_${id}" type="number" min="0" step="1" placeholder="0" />
  </div>
</div>

<!-- ---------- paste into src/public/script.js ---------- -->
wireTileQty("opt_${id}", "qty_${id}_wrap");          // next to the other calls of that category
"opt_${id}",                                          // into BOTH cat_X kid lists (~14075 and ~18106)
`;
}

async function main() {
  const products = ids.length ? await fromVigor(ids) : fromFlags();
  if (!products.length) process.exit(1);

  if (!DRY) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || "KonfiguratorDB",
    });
  }

  for (const p of products) {
    const doc = {
      productId: p.productId,
      name: p.name,
      price: p.price,
      source: ids.length ? "vigor" : "manual",
      ...(flag("manufacturer") ? { manufacturer: flag("manufacturer") } : {}),
    };
    console.log(`\n=== ${p.productId} ===`);
    console.log(`  name  : ${doc.name}`);
    console.log(`  price : ${doc.price} € netto${p._vigor?.gross ? ` (brutto ${p._vigor.gross})` : ""}`);
    if (p._vigor?.category) console.log(`  vigor category: ${p._vigor.category}`);

    let image = await saveImage(p.productId, DRY ? null : p.imageUrl);
    if (!DRY) {
      // Product model validates required name/price and enforces unique productId
      await Product.updateOne({ productId: p.productId }, { $set: doc }, { upsert: true, runValidators: true });
      console.log(`  DB    : upserted into Products`);
      console.log(`  image : ${image.status}${image.path ? ` -> ${path.relative(process.cwd(), image.path)}` : " (no image — snippet falls back to vk-brutto.jpg)"}`);
    }
    console.log(snippet(p, image.status === "written" || image.status === "exists"));
  }

  if (!DRY) await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
