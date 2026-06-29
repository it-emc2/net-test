// routes/trays.js
import { Router } from "express";
import Product from "../models/Product.js";

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

    // Width + length: match the footprint orientation-independently. Tray
    // categories disagree on which side is "width" (Hassmann/SLA stores
    // width >= length, Badolux/DW stores width <= length), so an axis-locked
    // widthCm>=w AND lengthCm>=l filter starves whichever category is rotated.
    // A rectangular tray fits if its larger side covers the larger requested
    // side and its smaller side covers the smaller one.
    if (w !== null && l !== null) {
      const needMax = Math.max(w, l);
      const needMin = Math.min(w, l);
      filter.$expr = {
        $and: [
          { $gte: [{ $max: ["$widthCm", "$lengthCm"] }, needMax] },
          { $gte: [{ $min: ["$widthCm", "$lengthCm"] }, needMin] },
        ],
      };
    } else {
      // Single axis (e.g. user still typing) — unchanged behavior.
      if (w !== null) filter.widthCm = { $gte: w };
      if (l !== null) filter.lengthCm = { $gte: l };
    }

    if (h !== null) filter.heightCm = { $gte: h };

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

    // Rank by closeness using ONLY provided axes. Width/length are compared
    // orientation-independently (sorted side-by-side) to match the filter.
    const score = (p) => {
      let sum = 0;
      if (w !== null && l !== null) {
        const td = [Number(p.widthCm) || 0, Number(p.lengthCm) || 0].sort((a, b) => a - b);
        const qd = [Math.min(w, l), Math.max(w, l)];
        sum += (td[0] - qd[0]) ** 2 + (td[1] - qd[1]) ** 2;
      } else {
        if (w !== null) { const d = (Number(p.widthCm) || 0) - w; sum += d * d; }
        if (l !== null) { const d = (Number(p.lengthCm) || 0) - l; sum += d * d; }
      }
      if (h !== null) { const d = (Number(p.heightCm) || 0) - h; sum += d * d; }
      return Math.sqrt(sum);
    };

    const mapped = docs.map((p) => {
      const pid = String(p.productId || "");
      const isDW = /^DW/i.test(pid);
      const isSLA = /^SLA/i.test(pid);
      const isBudget = normSource(p.source) === "badolux";
      return { ...p, score: score(p), isDW, isSLA, isBudget };
    });

    const results = mapped
      .sort((a, b) => {
        if (wantBudget) {
          // Budget mode: prioritize Badolux DW first, then other DW, then SLA
          const aRank =
            a.isDW && a.isBudget ? 0 : a.isDW ? 1 : a.isSLA ? 2 : 3;
          const bRank =
            b.isDW && b.isBudget ? 0 : b.isDW ? 1 : b.isSLA ? 2 : 3;

          return (
            aRank - bRank ||
            a.score - b.score ||
            (a.price ?? Infinity) - (b.price ?? Infinity)
          );
        }

        // Default behavior: closeness then price
        return a.score - b.score || (a.price ?? Infinity) - (b.price ?? Infinity);
      })
      .slice(0, 3)
      .map(({ isDW, isSLA, ...p }) => p); // keep payload clean; keep isBudget for frontend

    res.json({ input: { w, l, h }, results });
  } catch (e) {
    console.error("trays/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;
