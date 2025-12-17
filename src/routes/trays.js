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

r.get("/suggest", async (req, res) => {
  try {
    const { w, l, h } = readQueryDims(req.query);

    // nothing provided?
    if (w === null && l === null && h === null) {
      return res.status(400).json({ error: "Provide at least one of w, l, h" });
    }

    // Build strict axis filters ONLY for provided axes.
    // => User may start with any axis and add others in any order.
    const filter = { productId: /^SLA/i };
    const axesForScore = [];
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

    // Strict match: if no product satisfies all provided axes, return [] (no fallback).
    const docs = await Product.find(filter, {
      productId: 1,
      name: 1,
      price: 1,
      widthCm: 1,
      lengthCm: 1,
      heightCm: 1,
    }).lean();

    // Rank by closeness using ONLY provided axes.
    const score = (p) => {
      let sum = 0;
      for (const [key, want] of axesForScore) {
        const have = Number(p[key]) || 0; // we already know have >= want from filter
        const d = have - want; // non-negative
        sum += d * d;
      }
      return Math.sqrt(sum);
    };

    const results = docs
      .map((p) => ({ ...p, score: score(p) }))
      .sort(
        (a, b) =>
          a.score - b.score || (a.price ?? Infinity) - (b.price ?? Infinity),
      )
      .slice(0, 3);

    res.json({ input: { w, l, h }, results });
  } catch (e) {
    console.error("trays/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;
