// Hassmann Warenkorb CSV — the material list uploaded to the Bitrix timeline
// alongside the offer. Ported from the legacy /material-overview/hassmann-cart
// route. One line per Hassmann article: `ART;<artNo>;<qty>`, UTF-8 BOM + CRLF.
import Product from "../models/Product.js";
import type { Pricing } from "./pricing.js";

// Internal cost lines / other suppliers that must never reach the CSV (Hassmann
// rejects them or fuzzy-matches them to the wrong article).
const INTERNAL_NON_HASSMANN = new Set(["KM02", "AC004", "PLA5282", "R_4260602", "2000302"]);

function isHassmannManufacturer(manufacturer: string | null | undefined): boolean {
  const m = String(manufacturer || "").trim();
  if (!m) return true; // unknown → keep, so the cart is never silently emptied
  return /hassmann/i.test(m);
}

export function isHassmannProduct(id: string, manufacturer: string | null | undefined): boolean {
  const s = String(id || "").trim();
  if (!s) return false;
  if (/^HASS_/i.test(s)) return false;
  if (s === "OPT_CUSTOM" || s === "REHA_DELIVERY") return false;
  if (INTERNAL_NON_HASSMANN.has(s)) return false;
  return isHassmannManufacturer(manufacturer);
}

export interface HassmannCsv {
  filename: string;
  csv: string;
  rowCount: number;
}

/** Build the Hassmann Warenkorb CSV for a payload. Returns null-safe empty CSV. */
export async function buildHassmannCsv(
  payload: Record<string, any>,
  pricing: Pricing,
): Promise<HassmannCsv> {
  const materials = await pricing.computeMaterials(payload);
  const lines: any[] = Array.isArray(materials?.lines) ? materials.lines : [];

  // Aggregate by article number (materialNumber = productId in this catalog),
  // summing quantities so duplicate lines collapse to one CSV row.
  const byArt = new Map<string, { artNo: string; qty: number }>();
  for (const l of lines) {
    const materialNumber = String(l?.productId || "").trim();
    if (!materialNumber) continue;
    const qty = Number(l?.qty || 0);
    if (!(qty > 0)) continue;
    // Prefer the export-only article number (e.g. color-specific Wandverkleidung).
    const artNo = String(l?.hassmannArticle || materialNumber).trim();
    const key = `${materialNumber}::${artNo}`;
    const cur = byArt.get(key) || { artNo, qty: 0 };
    cur.qty += qty;
    byArt.set(key, { ...cur, _materialNumber: materialNumber } as any);
  }

  // Look up manufacturers so non-Hassmann articles can be filtered out.
  const materialNumbers = [...new Set([...byArt.values()].map((v: any) => v._materialNumber).filter(Boolean))];
  const manufacturerById = new Map<string, string | null>();
  if (materialNumbers.length) {
    const docs = await Product.find({ productId: { $in: materialNumbers } })
      .select("productId manufacturer")
      .lean();
    for (const d of docs) manufacturerById.set(d.productId, (d as any).manufacturer ?? null);
  }

  const rows = [...byArt.values()]
    .filter((v: any) => isHassmannProduct(v._materialNumber, manufacturerById.get(v._materialNumber)) && v.qty > 0)
    .map((v) => `ART;${v.artNo};${Math.round(v.qty)}`);

  const csv = "﻿" + rows.join("\r\n");
  const offerNumber = String(payload?.offerNumber || "").trim() || "ANG-0001";
  const filename = `Hassmann_Warenkorb_${offerNumber.replace(/[^A-Za-z0-9_-]+/g, "_")}.csv`;
  return { filename, csv, rowCount: rows.length };
}
