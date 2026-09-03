// routes/trays.js
import { Router } from "express";
import Product from "../models/Product.js";
import cfg from "../services/configService.js";
import { buildTrayDimFilter, scoreAndRank } from "../logic/tray-search-core.js";

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

    res.json({ input: { w, l, h }, results });
  } catch (e) {
    console.error("trays/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;
