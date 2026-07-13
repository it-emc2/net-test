// Unified product/price resolver used by the pricing engine.
// Resolution order: Vigor (live price + stock) → legacy Products table (fallback).
// As articles are added to Vigor, the fallback shrinks; retire Products at 100%.
import { getVigorDb } from "../config/vigor.js";
import Product from "../models/Product.js";

export interface ResolvedProduct {
  productId: string;
  name: string;
  /** Net unit price in EUR. */
  netPrice: number;
  source: "vigor" | "legacy";
  /** Original supplier (legacy Products.source, e.g. "badolux"/"hassmann"); null from Vigor.
   *  Pricing uses this for the Badolux tray discount. */
  supplierSource: string | null;
  /** Live stock (Vigor only); null when unknown/fallback. */
  stockQuantity: number | null;
  inStock: boolean;
}

/** Resolve many product codes at once. Missing codes are simply absent from the map. */
export async function resolvePrices(idsIn: string[]): Promise<Map<string, ResolvedProduct>> {
  const ids = [...new Set(idsIn.filter(Boolean))];
  const out = new Map<string, ResolvedProduct>();
  if (ids.length === 0) return out;

  // 1) Vigor by articleNumber (== configurator productId).
  try {
    const db = await getVigorDb();
    const docs = await db
      .collection("products")
      .find(
        { articleNumber: { $in: ids } },
        { projection: { articleNumber: 1, name: 1, displayName: 1, netPrice: 1, stockQuantity: 1 } },
      )
      .toArray();
    for (const d of docs) {
      const art = d.articleNumber as string;
      const qty = typeof d.stockQuantity === "number" ? d.stockQuantity : null;
      out.set(art, {
        productId: art,
        name: (d.name as string) || (d.displayName as string) || art,
        netPrice: Number(d.netPrice) || 0,
        source: "vigor",
        supplierSource: null,
        stockQuantity: qty,
        inStock: qty != null ? qty > 0 : false,
      });
    }
  } catch (err) {
    // Vigor unreachable → fall through entirely to legacy so pricing still works.
    // eslint-disable-next-line no-console
    console.warn("[catalog] Vigor lookup failed, using legacy only:", (err as Error).message);
  }

  // 2) Legacy Products fallback for whatever Vigor didn't cover.
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const docs = await Product.find({ productId: { $in: missing } }).lean();
    for (const d of docs) {
      out.set(d.productId, {
        productId: d.productId,
        name: d.name,
        netPrice: Number(d.price) || 0,
        source: "legacy",
        supplierSource: d.source ?? null,
        stockQuantity: null,
        inStock: false,
      });
    }
  }

  return out;
}

/** Resolve a single product code, or null if it exists in neither source. */
export async function resolvePrice(id: string): Promise<ResolvedProduct | null> {
  const map = await resolvePrices([id]);
  return map.get(id) ?? null;
}
