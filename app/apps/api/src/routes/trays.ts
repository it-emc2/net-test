// Shower-tray search for the Duschwanne page. SLA (slate) trays come live from
// Vigor (price + stock); Badolux/DW trays from the legacy Products table
// (price shown with the Badolux discount). Ranked by dimension proximity.
import { Router, type Request, type Response } from "express";
import type { TraySuggestItem, TraySuggestResponse } from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import { getVigorDb } from "../config/vigor.js";
import Product from "../models/Product.js";
import config from "../services/config.js";

const router = Router();
router.use(requireAuth);

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pull width×length(×height) in cm from a product name or article code. */
function parseDims(name: string, article: string): { w: number | null; l: number | null; h: number | null } {
  const m = String(name || "").match(/(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{1,2}))?\s*cm/i);
  if (m) return { w: Number(m[1]), l: Number(m[2]), h: m[3] ? Number(m[3]) : null };
  // fallback: SLA12090 → 120 x 90 ; SLA100 → 100 x 100
  const a = String(article || "").toUpperCase().replace(/^SLA/, "");
  if (/^\d{6}$/.test(a)) return { w: Number(a.slice(0, 3)), l: Number(a.slice(3)), h: null };
  if (/^\d{3}$/.test(a)) return { w: Number(a), l: Number(a), h: null };
  return { w: null, l: null, h: null };
}

function sizeLabel(w: number | null, l: number | null): string {
  return w && l ? `${w} x ${l} cm` : "";
}

/** Orientation-independent dimension score (lower = better). null input → no constraint. */
function scoreDims(w: number | null, l: number | null, sw: number | null, sl: number | null): number {
  if (sw == null && sl == null) return 0;
  const [pa, pb] = [w ?? 0, l ?? 0].sort((a, b) => a - b);
  const [qa, qb] = [sw ?? 0, sl ?? 0].sort((a, b) => a - b);
  return Math.sqrt((pa - qa) ** 2 + (pb - qb) ** 2);
}

// GET /api/trays/suggest?w=&l=&limit=
router.get("/suggest", async (req: Request, res: Response) => {
  const sw = num(req.query.w);
  const sl = num(req.query.l);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "3"), 10) || 3, 1), 10);
  const discount = config.get("BU_BADOLUX_DISCOUNT", 0.2);

  const out: TraySuggestResponse = { sla: [], badolux: [] };

  // --- SLA (Vigor) ---
  try {
    const db = await getVigorDb();
    const docs = await db
      .collection("products")
      .find(
        { articleNumber: { $regex: "^SLA", $options: "i" } },
        { projection: { articleNumber: 1, name: 1, netPrice: 1, stockQuantity: 1, images: 1 } },
      )
      .limit(400)
      .toArray();
    const items: (TraySuggestItem & { _score: number })[] = docs.map((d: any) => {
      const dims = parseDims(d.name, d.articleNumber);
      const qty = typeof d.stockQuantity === "number" ? d.stockQuantity : null;
      return {
        productId: d.articleNumber,
        name: d.name || d.articleNumber,
        sizeLabel: sizeLabel(dims.w, dims.l),
        widthCm: dims.w,
        lengthCm: dims.l,
        heightCm: dims.h,
        netPrice: Number(d.netPrice) || 0,
        family: "sla",
        image: Array.isArray(d.images) && d.images.length ? d.images[0] : null,
        inStock: qty != null ? qty > 0 : false,
        stockQuantity: qty,
        _score: scoreDims(dims.w, dims.l, sw, sl),
      };
    });
    out.sla = items.sort((a, b) => a._score - b._score).slice(0, limit).map(({ _score, ...r }) => r);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[trays] SLA (Vigor) lookup failed:", (err as Error).message);
  }

  // --- Badolux / DW (legacy Products) ---
  try {
    // Only the canonical Mineral Duschwanne SMC trays — productId DW### (DW001…
    // DW025), whose prices match the current supplier price list. The parallel
    // BDX-DW-* set is an older duplicate import with outdated prices and is
    // intentionally excluded so each size appears exactly once.
    const docs = await Product.find({
      productId: { $regex: "^DW\\d", $options: "i" },
    }).lean();
    const items = (docs as any[]).map((d) => {
      const w = num(d.widthCm);
      const l = num(d.lengthCm);
      const h = num(d.heightCm);
      const net = round2((Number(d.price) || 0) * (1 - discount)); // Badolux display discount
      return {
        productId: d.productId,
        name: d.name || d.productId,
        sizeLabel: sizeLabel(w, l),
        widthCm: w,
        lengthCm: l,
        heightCm: h,
        netPrice: net,
        family: "badolux" as const,
        image: null,
        inStock: false,
        stockQuantity: null,
        _score: scoreDims(w, l, sw, sl),
      };
    });
    out.badolux = items.sort((a, b) => a._score - b._score).slice(0, limit).map(({ _score, ...r }) => r);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[trays] Badolux (Products) lookup failed:", (err as Error).message);
  }

  res.json(out);
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default router;
