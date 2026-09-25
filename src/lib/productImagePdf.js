import path from "path";
import { promises as fs } from "fs";
import { htmlToPdfBuffer } from "../utils/htmlToPdf.js";
import { getVigorDb } from "../external/vigorDb.js";

export const PRODUCT_IMAGE_SKIP_KEYWORDS = [
  "kleinmaterial",
  "montagematerial",
  "abfluss",
  "ablauf",
  "silikon",
  "schraube",
  "dübel",
  "siphon",
  "klebeband",
  "folie",
  "mörtel",
  "kleber",
  "dichtband",
  "befestigungs",
  "dichtstoff",
];

export function shouldSkipByDefault(name = "") {
  const lower = name.toLowerCase();
  return PRODUCT_IMAGE_SKIP_KEYWORDS.some((kw) => lower.includes(kw));
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns Map<productId, { localPath: string|null, vigorUrl: string|null }>
 * Checks local assets first; falls back to Vigor DB images field for missing ones.
 */
// WV panels picked on the Fußboden tab are named "Aluverbundplatte (…)" (see
// pricing-core displayName). They keep the normal product photo — the
// produktbilder/ photos show the panel mounted on a wall.
export function floorWvIds(lines) {
  return new Set(
    lines
      .filter((l) => /^V3WVK?\d/.test(l.productId || l.materialNumber || "") && /^Aluverbundplatte/.test(l.name || ""))
      .map((l) => l.productId || l.materialNumber),
  );
}

export async function resolveProductImages(productIds, assetsDir, noCustomIds = new Set()) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const result = new Map();

  const LOCAL_EXTS = [".jpg", ".jpeg", ".png", ".PNG", ".JPG", ".JPEG"];
  const localChecks = await Promise.all(
    ids.map(async (id) => {
      // assets/produktbilder/<id>.<ext> overrides the section image in assets/.
      // WV 997 (V3WVKnn) shares the 1497 photo (V3WVnn) — same decor.
      const custom = path.join(assetsDir, "produktbilder");
      const candidates = noCustomIds.has(id)
        ? [[assetsDir, id]]
        : [[custom, id], [custom, id.replace(/^V3WVK/, "V3WV")], [assetsDir, id]];
      for (const [dir, name] of candidates) {
        for (const ext of LOCAL_EXTS) {
          const p = path.join(dir, `${name}${ext}`);
          try { await fs.access(p); return { id, localPath: p }; } catch {}
        }
      }
      return { id, localPath: null };
    }),
  );

  const missingIds = [];
  for (const { id, localPath } of localChecks) {
    result.set(id, { localPath, vigorUrl: null });
    if (!localPath) missingIds.push(id);
  }

  if (missingIds.length) {
    try {
      const db = await getVigorDb();
      const docs = await db
        .collection("products")
        .find({ articleNumber: { $in: missingIds } }, { projection: { articleNumber: 1, images: 1 } })
        .toArray();
      for (const doc of docs) {
        const url = doc?.images?.[0];
        if (url && result.has(doc.articleNumber)) {
          result.get(doc.articleNumber).vigorUrl = String(url);
        }
      }
    } catch (e) {
      console.warn("[productImagePdf] Vigor DB image lookup failed:", e?.message || e);
    }
  }

  return result;
}

async function toDataUri(src) {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  if (src.startsWith("http://") || src.startsWith("https://")) {
    try {
      const resp = await fetch(src);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const mime = resp.headers.get("content-type") || "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }
  try {
    const buf = await fs.readFile(src);
    const ext = src.split(".").pop().toLowerCase();
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * @param {Array<{productId:string, name:string, qty:number, unit:string}>} products
 * @param {string} assetsDir  absolute path to src/public/assets
 * @param {Object} [customImageData]  productId -> data URL (overrides local/vigor)
 */
export async function generateProductImagePdf(products, assetsDir, customImageData = {}) {
  const imageMap = await resolveProductImages(
    products.map((p) => p.productId),
    assetsDir,
    floorWvIds(products),
  );

  const cards = await Promise.all(
    products.map(async (p) => {
      let dataUri = null;
      if (customImageData[p.productId]) {
        dataUri = await toDataUri(customImageData[p.productId]);
      } else {
        const img = imageMap.get(p.productId) || {};
        dataUri = await toDataUri(img.localPath || img.vigorUrl || null);
      }
      return { ...p, dataUri };
    }),
  );

  const withImages = cards.filter((c) => c.dataUri);
  if (!withImages.length) return null;

  const cardHtml = withImages
    .map(
      (c) => `
    <div class="card">
      <div class="img-wrap"><img src="${c.dataUri}" alt="${escHtml(c.name)}" /></div>
      <div class="name">${escHtml(c.name || c.productId)}</div>
      ${c.finish ? `<div class="finish">${escHtml(c.finish)}</div>` : ""}
      <div class="qty">${escHtml(String(c.qty ?? ""))} ${escHtml(c.unit || "Stck.")}</div>
    </div>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#243038;font-size:12px;}
  h1{font-size:14px;font-weight:normal;color:#666;margin:0 0 14px 0;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
  .card{border:1px solid #e0e5e8;border-radius:8px;padding:10px;text-align:center;break-inside:avoid;}
  .img-wrap{height:130px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;}
  .card img{max-width:100%;max-height:130px;object-fit:contain;display:block;}
  .name{font-size:10px;font-weight:bold;line-height:1.3;margin-bottom:2px;word-break:break-word;}
  .finish{font-size:9px;color:#555;line-height:1.3;margin-bottom:2px;word-break:break-word;}
  .qty{font-size:9px;color:#888;}
</style>
</head>
<body>
  <h1>Produktübersicht</h1>
  <div class="grid">${cardHtml}</div>
</body>
</html>`;

  return htmlToPdfBuffer(html, {
    margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
  });
}
