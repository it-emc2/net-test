// Optional catalog for the configurator. Categories → items → companions come
// from the DB (admin-managed) with a code-seed fallback. Prices/names/images are
// resolved live (Vigor → legacy Products) so the catalog stays current.
import { Router, type Request, type Response } from "express";
import type {
  OptionalCatalogResponse,
  OptionalCategoryDef,
  OptionalCategoryView,
} from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import { resolvePrices } from "../services/catalog.js";
import { getVigorDb } from "../config/vigor.js";
import OptionalCategory from "../models/OptionalCategory.js";
import { OPTIONAL_CATALOG_SEED } from "../data/optionalCatalog.js";

const router = Router();
router.use(requireAuth);

async function loadImages(ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!ids.length) return map;
  try {
    const db = await getVigorDb();
    const docs = await db
      .collection("products")
      .find({ articleNumber: { $in: ids } }, { projection: { articleNumber: 1, images: 1 } })
      .toArray();
    for (const d of docs) {
      map.set(d.articleNumber as string, Array.isArray(d.images) && d.images.length ? d.images[0] : null);
    }
  } catch {
    /* Vigor down → no images */
  }
  return map;
}

// GET /api/optional/catalog — categories with live-resolved item/companion data.
router.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const dbCats = (await OptionalCategory.find({}).sort({ order: 1 }).lean()) as unknown as OptionalCategoryDef[];
    const cats: OptionalCategoryDef[] = dbCats.length
      ? dbCats
      : OPTIONAL_CATALOG_SEED.slice().sort((a, b) => a.order - b.order);

    // Collect every product id (items + companions) for a single resolve pass.
    const ids = new Set<string>();
    for (const c of cats) {
      for (const it of c.items ?? []) {
        ids.add(it.productId);
        for (const comp of it.companions ?? []) ids.add(comp.productId);
      }
    }
    const idList = [...ids];
    const [resolved, images] = await Promise.all([resolvePrices(idList), loadImages(idList)]);

    const categories: OptionalCategoryView[] = cats.map((c) => ({
      id: c.id,
      label: c.label,
      order: c.order,
      selection: c.selection,
      special: c.special,
      items: (c.items ?? []).map((it) => {
        const r = resolved.get(it.productId);
        return {
          productId: it.productId,
          name: it.manual?.name || r?.name || it.productId,
          netPrice: it.manual?.price ?? r?.netPrice ?? 0,
          image: images.get(it.productId) ?? null,
          defaultQty: it.defaultQty ?? 1,
          companions: (it.companions ?? []).map((comp) => {
            const cr = resolved.get(comp.productId);
            return {
              productId: comp.productId,
              qtyRatio: comp.qtyRatio,
              name: cr?.name || comp.productId,
              netPrice: cr?.netPrice ?? 0,
              image: images.get(comp.productId) ?? null,
            };
          }),
        };
      }),
    }));

    const body: OptionalCatalogResponse = { categories };
    res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[optional] catalog error:", err);
    res.status(500).json({ error: "Optional-Katalog nicht verfügbar" });
  }
});

export default router;
