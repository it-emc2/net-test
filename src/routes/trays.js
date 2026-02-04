// routes/trays.js
import { Router } from "express";
import Product from "../models/Product.js";

const r = Router();

function parseDim(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readQueryDims(q) {
  const w = parseDim(q.w ?? q.b ?? q.width ?? q.widthCm);
  const l = parseDim(q.l ?? q.length ?? q.lengthCm);
  const h = parseDim(q.h ?? q.height ?? q.heightCm);
  const budget = q.budget === "true" || q.budget === "1"; // NEW
  return { w, l, h, budget };
}

r.get("/suggest", async (req, res) => {
  try {
    const { w, l, h, budget } = readQueryDims(req.query);

    if (w === null && l === null && h === null) {
      return res.status(400).json({ error: "Provide at least one of w, l, h" });
    }

    // Build base filter
    const filter = {};
    const axesForScore = [];

    // NEW: If budget mode, restrict to Badolux (DW001-DW025)
    if (budget) {
      filter.productId = /^DW0(0[1-9]|1[0-9]|2[0-5])$/; // DW001 to DW025
      filter.source = "badolux";
    } else {
      filter.productId = /^SLA/i; // Standard premium trays
    }

    if (w !== null) {
      filter.widthCm = { $gte: w };
      axesForScore.push(["widthCm", w]);
    }
    if (l !== null) {
      filter.lengthCm = { $gte: l };
      axesForScore.push(["lengthCm", l]);
    }
    if (h !== null) {
      filter.heightCm = { $gte: h };
      axesForScore.push(["heightCm", h]);
    }

    const docs = await Product.find(filter, {
      productId: 1,
      name: 1,
      price: 1,
      widthCm: 1,
      lengthCm: 1,
      heightCm: 1,
      source: 1, // NEW
    }).lean();

    const score = (p) => {
      let sum = 0;
      for (const [key, want] of axesForScore) {
        const have = Number(p[key]) || 0;
        const d = have - want;
        sum += d * d;
      }
      return Math.sqrt(sum);
    };

    const results = docs
      .map((p) => ({ ...p, score: score(p), isBudget: p.source === "badolux" }))
      .sort(
        (a, b) =>
          a.score - b.score || (a.price ?? Infinity) - (b.price ?? Infinity),
      )
      .slice(0, 3);

    res.json({ input: { w, l, h, budget }, results });
  } catch (e) {
    console.error("trays/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;