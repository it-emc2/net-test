// routes/trays.js
import { Router } from "express";
import Product from "../models/Product.js";
import cfg from "../services/configService.js";
import { buildTrayDimFilter, scoreAndRank } from "../logic/tray-search-core.js";
import { fetchVigourStock } from "../external/vigorDb.js";

const r = Router();

// Parse numbers; accepts "101", "101.0", "101,0"
function parseDim(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", "."); // "1.200,5" -> "1200.5"
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// map common aliases just in case (B=b=width, L=l=length, H=h=height)
function readQueryDims(q) {
  // primary expected keys: w,l,h  (your frontend sends these)
  // fallbacks: b,l,h or width/length/height
  const w = parseDim(q.w ?? q.b ?? q.width ?? q.widthCm);
  const l = parseDim(q.l ?? q.length ?? q.lengthCm);
  const h = parseDim(q.h ?? q.height ?? q.heightCm);
  return { w, l, h };
}

function normSource(v) {
  return String(v || "").trim().toLowerCase();
}

// Live stock from the separate vigor DB, keyed by articleNumber == our productId.
// Display-only: it is never written into an offer, because stock at quote time is
// not stock at order time. Articles the vigor DB doesn't know (Badolux) stay
// without stock fields and simply render no badge.
//
// Deliberately fail-open AND fail-fast: a stock lookup must never break the tray
// search, and it must not slow it down either. Without the timeout an unreachable
// vigor DB costs mongoose's full serverSelectionTimeoutMS (30 s by default) on
// EVERY search, which is worse than no badges — the technician is standing in a
// bathroom waiting for it.
const STOCK_LOOKUP_TIMEOUT_MS = 1500;

async function attachStock(results) {
  if (!Array.isArray(results) || !results.length) return;
  try {
    const stock = await Promise.race([
      fetchVigourStock(results.map((p) => p.productId)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`stock lookup timed out after ${STOCK_LOOKUP_TIMEOUT_MS}ms`)),
          STOCK_LOOKUP_TIMEOUT_MS,
        ).unref?.(),
      ),
    ]);
    for (const p of results) {
      const s = stock.get(p.productId);
      if (!s) continue;
      p.stockQuantity = s.stockQuantity;
      p.stockText = s.stockText;
      p.stockSymbol = s.stockSymbol;
    }
  } catch (e) {
    console.warn("[trays/suggest] stock lookup skipped:", e?.message || e);
  }
}

r.get("/suggest", async (req, res) => {
  try {
    const { w, l, h } = readQueryDims(req.query);
    const wantBudget = String(req.query.budget || "").trim() === "1";

    // Optional additive explicit series filter: ?series=SLA or ?series=DW
    const series = String(req.query.series || "").trim().toUpperCase();

    // Optional source filter: ?source=badolux restricts to that manufacturer
    const wantSource = normSource(req.query.source);

    // nothing provided?
    if (w === null && l === null && h === null) {
      return res.status(400).json({ error: "Provide at least one of w, l, h" });
    }

    // Build strict axis filters ONLY for provided axes.
    // => User may start with any axis and add others in any order.
    const filter = {};

    // Always restrict duschwanne trays to SLA or DW (as requested)
    if (series === "SLA") filter.productId = /^SLA/i;
    else if (series === "DW") filter.productId = /^DW/i;
    else filter.productId = /^(SLA|DW)/i;

    if (wantSource) filter.source = wantSource;

    // Orientation-independent footprint match for provided axes (single or both).
    Object.assign(filter, buildTrayDimFilter({ w, l, h }));

    const docs = await Product.find(
      filter,
      {
        productId: 1,
        name: 1,
        price: 1,
        widthCm: 1,
        lengthCm: 1,
        heightCm: 1,
        source: 1,
      },
    ).lean();

    const badoluxDiscount = cfg.get("BU_BADOLUX_DISCOUNT", 0.20);
    const results = scoreAndRank(docs, { w, l, h, budget: wantBudget }, badoluxDiscount);

    await attachStock(results);

    res.json({ input: { w, l, h }, results });
  } catch (e) {
    console.error("trays/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;
