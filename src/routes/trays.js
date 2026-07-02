// routes/trays.js
import { Router } from "express";
import Product from "../models/Product.js";
import cfg from "../services/configService.js";

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

// Orientation-independent footprint matching. Tray categories disagree on which
// physical side they store as "width": Hassmann/SLA stores width >= length,
// Badolux/DW stores width <= length. So every comparison treats the footprint by
// its sorted sides (max/min) and NEVER locks to widthCm/lengthCm — otherwise a
// single typed axis (e.g. width 120) starves whichever category is rotated.
export function buildTrayDimFilter({ w, l, h }) {
  const filter = {};
  if (w !== null && l !== null) {
    const needMax = Math.max(w, l);
    const needMin = Math.min(w, l);
    filter.$expr = {
      $and: [
        { $gte: [{ $max: ["$widthCm", "$lengthCm"] }, needMax] },
        { $gte: [{ $min: ["$widthCm", "$lengthCm"] }, needMin] },
      ],
    };
  } else if (w !== null || l !== null) {
    // Single axis: the one provided value may correspond to EITHER physical
    // side, so a tray fits if its larger side covers it (max >= value).
    const need = w !== null ? w : l;
    filter.$expr = { $gte: [{ $max: ["$widthCm", "$lengthCm"] }, need] };
  }
  if (h !== null) filter.heightCm = { $gte: h };
  return filter;
}

// Rank by closeness using ONLY provided axes, orientation-independently.
export function scoreTray(p, { w, l, h }) {
  let sum = 0;
  const wc = Number(p.widthCm) || 0;
  const lc = Number(p.lengthCm) || 0;
  if (w !== null && l !== null) {
    const td = [wc, lc].sort((a, b) => a - b);
    const qd = [Math.min(w, l), Math.max(w, l)];
    sum += (td[0] - qd[0]) ** 2 + (td[1] - qd[1]) ** 2;
  } else if (w !== null || l !== null) {
    const need = w !== null ? w : l;
    // Distance to the nearest side (either orientation).
    const d = Math.min(Math.abs(wc - need), Math.abs(lc - need));
    sum += d * d;
  }
  if (h !== null) { const d = (Number(p.heightCm) || 0) - h; sum += d * d; }
  return Math.sqrt(sum);
}

// Same rule as pricing.js: Badolux by source, or DW* productId.
export function isBadoluxTray(p) {
  return (
    String(p.source || "").toLowerCase() === "badolux" ||
    /^DW/i.test(String(p.productId || ""))
  );
}

// Price to display in the suggestion cards — must match the Kosten tab, which
// shows the tray line's unitPrice (net after the Badolux discount). Hassmann/SLA
// trays are shown at list price; Badolux trays at list × (1 − discount).
export function trayDisplayPrice(p, badoluxDiscount = 0.20) {
  const base = Number(p.price) || 0;
  if (!isBadoluxTray(p)) return base;
  return Math.round(base * (1 - badoluxDiscount) * 100) / 100;
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
    const mapped = docs.map((p) => {
      const pid = String(p.productId || "");
      const isDW = /^DW/i.test(pid);
      const isSLA = /^SLA/i.test(pid);
      const isBudget = normSource(p.source) === "badolux";
      // Show the same price as the Kosten tab (net after Badolux discount).
      return { ...p, price: trayDisplayPrice(p, badoluxDiscount), score: scoreTray(p, { w, l, h }), isDW, isSLA, isBudget };
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
