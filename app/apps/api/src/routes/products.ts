// Read-only product catalog backed by the Vigor DB (single source of truth).
// Browse/search/filter with live stock; category list; single-product detail.
import { Router, type Request, type Response } from "express";
import type {
  ProductDetail,
  ProductListItem,
  ProductCategoriesResponse,
} from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import { getVigorDb } from "../config/vigor.js";

const router = Router();
router.use(requireAuth);

const COLLECTION = "products";

function escRegex(value = ""): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface VigorDoc {
  articleNumber?: string;
  materialNumber?: string;
  name?: string;
  displayName?: string;
  netPrice?: number;
  grosPrice?: number; // note: Vigor's field is misspelled
  currency?: string;
  unit?: string;
  finish?: string;
  finishText?: string;
  configContext?: { category?: string };
  images?: string[];
  stockQuantity?: number;
  stockText?: string;
  isSpecialOffer?: boolean;
  packageUnits?: number;
  discountGroup?: string;
  originalPrice?: number;
  sourceUrl?: string;
  lastSeenAt?: Date | string;
  priceUpdatedAt?: Date | string;
}

function toListItem(d: VigorDoc): ProductListItem {
  const qty = num(d.stockQuantity);
  return {
    articleNumber: d.articleNumber ?? "",
    name: d.name || d.displayName || d.articleNumber || "",
    netPrice: num(d.netPrice) ?? 0,
    grossPrice: num(d.grosPrice) ?? 0,
    currency: d.currency || "EUR",
    unit: d.unit || "Stück",
    finish: d.finish || d.finishText || "",
    category: d.configContext?.category ?? null,
    image: Array.isArray(d.images) && d.images.length ? d.images[0] : null,
    stockQuantity: qty,
    stockText: d.stockText || "",
    inStock: qty != null ? qty > 0 : false,
    isSpecialOffer: Boolean(d.isSpecialOffer),
  };
}

const LIST_PROJECTION = {
  articleNumber: 1,
  name: 1,
  displayName: 1,
  netPrice: 1,
  grosPrice: 1,
  currency: 1,
  unit: 1,
  finish: 1,
  finishText: 1,
  "configContext.category": 1,
  images: 1,
  stockQuantity: 1,
  stockText: 1,
  isSpecialOffer: 1,
} as const;

// Category list cache (changes rarely).
let catCache: { at: number; values: string[] } | null = null;
const CAT_TTL_MS = 10 * 60 * 1000;

// GET /api/products/categories — distinct configContext.category values.
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (!catCache || now - catCache.at > CAT_TTL_MS) {
      const db = await getVigorDb();
      const raw = (await db.collection(COLLECTION).distinct("configContext.category")) as unknown[];
      const values = raw
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .sort((a, b) => a.localeCompare(b, "de"));
      catCache = { at: now, values };
    }
    const body: ProductCategoriesResponse = { categories: catCache.values };
    res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[products] categories error:", err);
    res.status(502).json({ error: "Vigor-Katalog nicht erreichbar" });
  }
});

// GET /api/products/brands — distinct configContext.brand values.
router.get("/brands", async (_req: Request, res: Response) => {
  try {
    const db = await getVigorDb();
    const raw = (await db.collection(COLLECTION).distinct("configContext.brand")) as unknown[];
    const brands = raw
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .sort((a, b) => a.localeCompare(b, "de"));
    res.json({ brands });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[products] brands error:", err);
    res.status(502).json({ error: "Vigor-Katalog nicht erreichbar" });
  }
});

// GET /api/products/images?ids=a,b,c — batch image/name lookup from Vigor.
router.get("/images", async (req: Request, res: Response) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const images: Record<string, { image: string | null; name: string }> = {};
    if (ids.length) {
      const db = await getVigorDb();
      const docs = await db
        .collection(COLLECTION)
        .find({ articleNumber: { $in: ids } }, { projection: { articleNumber: 1, name: 1, images: 1 } })
        .toArray();
      for (const d of docs as VigorDoc[]) {
        images[d.articleNumber as string] = {
          image: Array.isArray(d.images) && d.images.length ? d.images[0] : null,
          name: d.name || d.articleNumber || "",
        };
      }
    }
    res.json({ images });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[products] images error:", err);
    res.json({ images: {} });
  }
});

// GET /api/products?q=&category=&page=1&pageSize=24
router.get("/", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const brand = String(req.query.brand || "").trim();
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || "24"), 10) || 24, 1), 100);

    const filter: Record<string, unknown> = {};
    if (category) filter["configContext.category"] = category;
    if (brand) filter["configContext.brand"] = brand;
    if (q) {
      const rx = new RegExp(escRegex(q), "i");
      filter.$or = [{ articleNumber: rx }, { name: rx }, { finish: rx }, { materialNumber: rx }];
    }

    const db = await getVigorDb();
    const coll = db.collection(COLLECTION);
    const [total, docs] = await Promise.all([
      coll.countDocuments(filter),
      coll
        .find(filter, { projection: LIST_PROJECTION })
        .sort({ name: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
    ]);

    res.json({
      items: (docs as VigorDoc[]).map(toListItem),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[products] list error:", err);
    res.status(502).json({ error: "Vigor-Katalog nicht erreichbar" });
  }
});

// GET /api/products/:articleNumber — full detail.
router.get("/:articleNumber", async (req: Request, res: Response) => {
  try {
    const db = await getVigorDb();
    const d = (await db
      .collection(COLLECTION)
      .findOne({ articleNumber: req.params.articleNumber })) as VigorDoc | null;
    if (!d) return res.status(404).json({ error: "Produkt nicht gefunden" });

    const detail: ProductDetail = {
      ...toListItem(d),
      materialNumber: d.materialNumber ?? "",
      images: Array.isArray(d.images) ? d.images : [],
      packageUnits: num(d.packageUnits),
      discountGroup: d.discountGroup ?? "",
      originalPrice: num(d.originalPrice),
      sourceUrl: d.sourceUrl ?? "",
      lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : null,
      priceUpdatedAt: d.priceUpdatedAt ? new Date(d.priceUpdatedAt).toISOString() : null,
    };
    return res.json({ product: detail });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[products] detail error:", err);
    return res.status(502).json({ error: "Vigor-Katalog nicht erreichbar" });
  }
});

export default router;
