// Produktbilder-PDF — port of the helpers in legacy src/routes/email.js (buildFinishMap,
// imageLines, FLOOR_IMAGES, buildDacPreviewMap) plus the list/preview/send logic. The PDF
// builder itself is the ported legacy module (ported/product-image-pdf.ts, HTML → PDF engine).
import path from "node:path";

export interface ImageDeps {
  root: string;
  getOfferRenderData(payload: any): Promise<{ computed: any; data: any }>;
  aggregateMaterialsForOverview(payload: any, computed: any): Promise<any[]>;
  pdf: { generateProductImagePdf(products: any[], assetsDir: string, custom: Record<string, string>): Promise<Buffer | null>;
    resolveProductImages(ids: string[], assetsDir: string, noCustomIds?: Set<string>): Promise<Map<string, any>>;
    floorWvIds(lines: any[]): Set<string>; shouldSkipByDefault(name: string): boolean; PRODUCT_IMAGE_SKIP_KEYWORDS: string[] };
  adminSkipIds(): string[];
}

/** productId → finish text from payload.duschabtrennung.quickAdd (kind "config"). */
export function buildFinishMap(payload: any) {
  const map = new Map<string, string>();
  for (const q of payload?.duschabtrennung?.quickAdd || []) if (q.kind === "config" && q.productId && q.finish) map.set(String(q.productId), q.finish);
  return map;
}

// Fußboden tile photos (V5FB02 is one article for all colours → picked by colour)
export const FLOOR_IMAGES: Record<string, string> = {
  "AVP-W|Weiß": "/assets/585c6146589e2f4c59e026c2b5373966.jpg",
  "V5FB02|Lava-Beige": "/assets/V5_Lava_Beige.jpg",
  "V5FB02|Schiefer-Beige": "/assets/V5_Schiefer_beige.jpg",
  "V5FB02|Loft-Grau": "/assets/V5_loft_grau.jpg",
  "V5FB02|Speckstein-Schwarz": "/assets/V5_Speckstein_schwarz.jpg",
  "V5FB02|Eiche-Natur": "/assets/V5_Eiche_natur.jpg",
};

/** DA configurator article → configuration preview URL (+ the picked floor colour). */
export function buildDacPreviewMap(payload: any) {
  const map = new Map<string, string>();
  const fp = [].concat(payload?.duschwanne?.flooringProduct || [])[0] as string | undefined;
  if (fp && FLOOR_IMAGES[fp]) map.set(fp.split("|")[0]!, FLOOR_IMAGES[fp]!);
  const previews = payload?.duschabtrennung?.configurator?.previewImages;
  if (!Array.isArray(previews)) return map;
  for (const { articleNumbers, imageUrl } of previews) {
    if (!imageUrl || !Array.isArray(articleNumbers)) continue;
    for (const id of articleNumbers) if (id) map.set(String(id), imageUrl);
  }
  return map;
}

export function productImages(d: ImageDeps) {
  const assetsDir = path.join(d.root, "src", "public", "assets");

  /** Material rows for the PDF; floor panels get their article number + picked colour back. */
  async function imageLines(payload: any, computed: any) {
    const rows = await d.aggregateMaterialsForOverview(payload, computed);
    const fp = String([].concat(payload?.duschwanne?.flooringProduct || [])[0] || "");
    const floorColor = fp.startsWith("V5FB02|") ? fp.split("|")[1]!.replace(/-/g, " ") : "";
    return rows.map((r) => ({ ...r, materialNumber: r.materialNumber || r.productId, name: r.productId === "V5FB02" && floorColor ? `Fußboden-Paneele (${floorColor})` : r.name }));
  }

  async function buildPdf(payload: any, computed: any, excludeIds: Set<string>, customImages: Record<string, string>) {
    const lines = await imageLines(payload, computed);
    const finishMap = buildFinishMap(payload);
    const products = lines.filter((l) => l.materialNumber && !excludeIds.has(l.materialNumber)).map((l) => ({
      productId: l.materialNumber, name: l.name || l.materialNumber, finish: finishMap.get(l.materialNumber) || null, qty: l.quantity, unit: l.unit || "Stck.",
    }));
    // DA configurator previews (relative URL → disk path); client uploads win
    const merged: Record<string, string> = {};
    for (const [id, relUrl] of buildDacPreviewMap(payload)) merged[id] = path.join(d.root, "src", "public", relUrl);
    Object.assign(merged, customImages);
    return d.pdf.generateProductImagePdf(products, assetsDir, merged);
  }

  /** "Produktbilder-PDF" checkbox list (POST /api/email/product-image-list). */
  async function list(payload: any) {
    const { computed } = await d.getOfferRenderData(payload);
    const lines = await imageLines(payload, computed);
    const adminSkip = new Set(d.adminSkipIds().map(String));
    const filtered = lines.filter((l) => l.materialNumber && !adminSkip.has(String(l.materialNumber)));
    const imageMap = await d.pdf.resolveProductImages(filtered.map((l) => l.materialNumber), assetsDir, d.pdf.floorWvIds(filtered));
    const dacPreviewMap = buildDacPreviewMap(payload);
    const finishMap = buildFinishMap(payload);
    const products = filtered.map((l) => {
      const img = imageMap.get(l.materialNumber) || {};
      const dacPreview = dacPreviewMap.get(l.materialNumber) || null;
      const hasImage = !!(img.localPath || img.vigorUrl || dacPreview);
      const imageUrl = dacPreview || (img.localPath ? `/assets/${path.relative(assetsDir, img.localPath).split(path.sep).join("/")}` : img.vigorUrl || null);
      return {
        productId: l.materialNumber, name: l.name || l.materialNumber, finish: finishMap.get(l.materialNumber) || null, qty: l.quantity,
        unit: l.unit || "Stck.", hasImage, imageUrl, defaultInclude: hasImage && !d.pdf.shouldSkipByDefault(l.name || ""),
      };
    });
    return { products, skipKeywords: d.pdf.PRODUCT_IMAGE_SKIP_KEYWORDS };
  }

  /** Preview (POST /api/email/preview-product-image-pdf): null → 204. */
  async function preview(payload: any, excludeIdsIn: unknown[], custom: Record<string, string>) {
    const { computed } = await d.getOfferRenderData(payload);
    const excludeIds = new Set([...excludeIdsIn.map(String), ...d.adminSkipIds().map(String)]);
    return buildPdf(payload, computed, excludeIds, custom);
  }

  /** send-offer attachment (excludeIds already include the admin skip list). */
  const forSend = (payload: any, computed: any, o: { excludeIds: Set<string>; customImages: Record<string, string> }) => buildPdf(payload, computed, o.excludeIds, o.customImages);

  return { list, preview, forSend };
}
