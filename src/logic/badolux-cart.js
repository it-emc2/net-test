// badolux-cart.js — the Badolux cart for cleverbad.de (Badolux's shop), built from
// a priced offer. Attached to the Bitrix timeline next to the Hassmann CSV, so an
// n8n automation can fill the shop's cart. Format: docs/research-cleverbad-badolux.md §11.
//
// Pure: the caller passes the material lines, the payload, which of our productIds
// are Badolux (from the Products collection) and the catalog
// (cleverbad-catalog.json, built by scripts/buildCleverbadCatalog.mjs).

const SECTION = { Duschwanne: "Duschwanne", Wandverkleidung: "Wandverkleidung", Fußboden: "Fußboden" };

/** @returns {{ items: object[], manual: object[] }} */
export function buildBadoluxCart({ lines = [], payload = {}, badoluxIds = new Set(), catalog }) {
  const items = new Map(); // sku → item (same article from two lines is summed)
  const manual = [];
  for (const l of lines) {
    const qty = Number(l?.qty) || 0;
    const pid = String(l?.productId || "").trim();
    if (!pid || qty <= 0) continue;
    const sku = skuFor(pid, payload, catalog);
    if (!sku) {
      if (badoluxIds.has(pid)) manual.push({ ourProductId: pid, name: cleanLabel(l), qty, reason: "nicht im cleverbad-Shop" });
      continue;
    }
    const v = catalog.variants[sku];
    const prev = items.get(sku);
    if (prev) {
      prev.qty += qty;
      continue;
    }
    items.set(sku, {
      sku,
      qty,
      section: SECTION[l.category] || (pid === sku ? "Duschabtrennung" : l.category || null),
      name: v.label ? `${v.name}, ${v.label}` : v.name,
      url: urlFor(catalog.shop, v),
      variant: { widthCm: v.widthCm, lengthCm: v.lengthCm, glassMm: v.glassMm, option: v.option },
      ...(pid !== sku ? { ourProductId: pid } : {}),
      ourNetEach: Number(l.unitPrice) || 0,
      ...(l.finish ? { note: l.finish } : {}),
    });
  }
  return { items: [...items.values()], manual };
}

// Configurator lines already carry the shop's article number; trays and wall panels
// are mapped; the Sonder-Dekor takes the motif picked in the scroller.
function skuFor(pid, payload, catalog) {
  if (catalog.variants[pid]) return pid;
  if (pid === "WP007") {
    const motif = String(payload?.wandverkleidung?.wvMotif || "").split("|")[0].trim();
    if (motif && catalog.variants[motif]) return motif;
  }
  return catalog.ours[pid] || null;
}

// Same links the shop's own configurator uses to preselect a variant.
function urlFor(shop, v) {
  const base = `${shop}/produkt/${v.slug}`;
  if (v.slug.startsWith("duschwanne-") && v.widthCm && v.lengthCm)
    return `${base}?breite=${Math.min(v.widthCm, v.lengthCm)}&laenge=${Math.max(v.widthCm, v.lengthCm)}`;
  if (!v.slug.startsWith("wandpaneel-") && v.widthCm) return `${base}?breite=${v.widthCm}`;
  return base;
}

const cleanLabel = (l) => String(l?.label || l?.name || "").replace(/^-\s*\d+([.,]\d+)?\s*\S+\s+/, "").trim();

/** Hassmann-style CSV: one `ART;<Artikelnummer>;<Menge>` row per article. */
export function cartCsv({ items }) {
  return "﻿" + items.map((i) => `ART;${i.sku};${Math.round(i.qty)}`).join("\r\n");
}
