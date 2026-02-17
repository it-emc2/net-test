// routes/bathtubs.js
import { Router } from "express";
import Product from "../models/Product.js";

const r = Router();

// Parse numbers; accepts "101", "101.0", "101,0"
function parseDim(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readTubQueryDims(q) {
  const w = parseDim(q.w ?? q.b ?? q.width ?? q.widthCm);
  const l = parseDim(q.l ?? q.length ?? q.lengthCm);
  return { w, l };
}

/**
 * Bathtub side from productId:
 * - IRIS160LS -> L
 * - IRIS160RS -> R
 */
function tubSideFromProductId(pid) {
  const s = String(pid || "").toUpperCase();
  if (s.includes("LS")) return "L";
  if (s.includes("RS")) return "R";
  return null;
}

/**
 * Map bathtub widthCm to nearest supported bucket.
 * Your website catalog currently has buckets 70 and 75 (no 80 screens).
 * Example: tub width 80 -> nearest bucket 75.
 */
function widthBucketFromTubWidth(w) {
  const buckets = [70, 75]; // <-- IMPORTANT: update only if you actually add IRISWAS80* later
  if (!Number.isFinite(w)) return null;

  let best = buckets[0];
  let bestD = Math.abs(w - best);
  for (const b of buckets) {
    const d = Math.abs(w - b);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/**
 * BATHTUB SUGGEST
 * GET /api/bathtubs/suggest?w=..&l=..
 * - Only IRIS* bathtubs; exclude IRISWAS* screens
 * - Strict >= on provided axes (like trays)
 * - Rank by closeness
 */
r.get("/suggest", async (req, res) => {
  try {
    const { w, l } = readTubQueryDims(req.query);

    if (w === null && l === null) {
      return res.status(400).json({ error: "Provide at least one of w, l" });
    }

    // IRIS* but NOT IRISWAS*
    const filter = { productId: /^IRIS(?!WAS)/i };
    const axesForScore = [];

    if (w !== null) {
      filter.widthCm = { $gte: w };
      axesForScore.push(["widthCm", w]);
    }
    if (l !== null) {
      filter.lengthCm = { $gte: l };
      axesForScore.push(["lengthCm", l]);
    }

    const docs = await Product.find(filter, {
      productId: 1,
      name: 1,
      price: 1,
      widthCm: 1,
      lengthCm: 1,
    }).lean();

    const score = (p) => {
      let sum = 0;
      for (const [key, want] of axesForScore) {
        const have = Number(p[key]) || 0; // have >= want because of filter
        const d = have - want;
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

    res.json({ input: { w, l }, results });
  } catch (e) {
    console.error("bathtubs/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * SCREEN SUGGEST (bucket-based)
 * GET /api/bathtubs/screens/suggest?bucket=70|75&side=L|R
 *
 * Uses families from your website list + DB:
 * - IRISWAS{bucket}{L/R}
 * - IRISWA14S{bucket}{L/R}
 * - IRISWA14{L/R}    (no bucket digits)
 *
 * Ranking:
 * 1) side match (if provided)
 * 2) height 150 preferred over 140
 * 3) cheapest
 */
r.get("/screens/suggest", async (req, res) => {
  try {
    const bucketRaw = String(req.query.bucket || "").trim();
    const bucket = Number(bucketRaw);
    if (!Number.isFinite(bucket)) {
      return res.status(400).json({ error: "bucket is required (e.g. 70, 75)" });
    }

    const sideRaw = String(req.query.side || "").trim().toUpperCase();
    const wantSide = sideRaw === "L" || sideRaw === "R" ? sideRaw : null;

    const reWAS = new RegExp(`^IRISWAS${bucket}`, "i");
    const reWA14S = new RegExp(`^IRISWA14S${bucket}`, "i");
    const reWA14Plain = /^IRISWA14[LR]$/i;

    const docs = await Product.find(
      {
        $or: [
          { productId: reWAS },
          { productId: reWA14S },
          { productId: reWA14Plain },
        ],
      },
      { productId: 1, name: 1, price: 1, heightCm: 1 }
    ).lean();

    const sideRank = (pid) => {
      if (!wantSide) return 0;
      const s = String(pid || "").toUpperCase();
      return s.endsWith(wantSide) ? 0 : 1;
    };

    const heightRank = (h) => {
      const n = Number(h);
      if (!Number.isFinite(n)) return 9;
      if (n === 150) return 0;
      if (n === 140) return 1;
      return 5;
    };

    const results = docs
      .sort(
        (a, b) =>
          sideRank(a.productId) - sideRank(b.productId) ||
          heightRank(a.heightCm) - heightRank(b.heightCm) ||
          (a.price ?? Infinity) - (b.price ?? Infinity),
      )
      .slice(0, 3);

    res.json({ input: { bucket, side: wantSide }, results });
  } catch (e) {
    console.error("bathtubs/screens/suggest error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * SCREEN RECOMMENDATION (hint only)
 * GET /api/bathtubs/recommend-screen?bathtubProductId=IRIS...
 *
 * - bucket from tub.widthCm (mapped to [70,75])
 * - side from tub productId (LS/RS)
 * - tries in priority order:
 *   IRISWAS{bucket}{side} -> IRISWA14S{bucket}{side} -> IRISWA14{side}
 * - fallback: cheapest among (IRISWAS{bucket}*, IRISWA14S{bucket}*, IRISWA14L/R)
 */
r.get("/recommend-screen", async (req, res) => {
  try {
    const bathtubProductId = String(req.query.bathtubProductId || "").trim();
    if (!bathtubProductId) {
      return res.status(400).json({ error: "bathtubProductId is required" });
    }

    const tub = await Product.findOne(
      { productId: bathtubProductId },
      { productId: 1, name: 1, widthCm: 1 }
    ).lean();

    if (!tub) return res.status(404).json({ error: "Bathtub not found" });

    const tubWidth = Number(tub.widthCm);
    const bucket = widthBucketFromTubWidth(tubWidth);
    const side = tubSideFromProductId(tub.productId); // L/R or null

    if (!bucket) return res.json({ bathtub: tub, recommended: null });

    const candidates = [];
    const pushSide = (s) => {
      candidates.push(`IRISWAS${bucket}${s}`);
      candidates.push(`IRISWA14S${bucket}${s}`);
      candidates.push(`IRISWA14${s}`);
    };

    if (side === "L" || side === "R") {
      pushSide(side);
      pushSide(side === "L" ? "R" : "L"); // fallback other side
    } else {
      pushSide("L");
      pushSide("R");
    }

    // 1) exact match on preferred ids
    let rec = await Product.findOne(
      { productId: { $in: candidates } },
      { productId: 1, name: 1, price: 1, heightCm: 1 }
    ).lean();

    // 2) fallback: cheapest among bucket families + IRISWA14L/R
    if (!rec) {
      const reWAS = new RegExp(`^IRISWAS${bucket}`, "i");
      const reWA14S = new RegExp(`^IRISWA14S${bucket}`, "i");

      const docs = await Product.find(
        { $or: [{ productId: reWAS }, { productId: reWA14S }, { productId: /^IRISWA14[LR]$/i }] },
        { productId: 1, name: 1, price: 1, heightCm: 1 }
      ).lean();

      rec =
        docs.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0] || null;
    }

    res.json({
      bathtub: tub,
      recommended: rec ? { ...rec, bucket, side } : null,
    });
  } catch (e) {
    console.error("bathtubs/recommend-screen error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;