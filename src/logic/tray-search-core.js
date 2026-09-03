// Pure Duschwanne (shower tray) suggestion logic, shared by the server route
// (routes/trays.js) and the offline client fallback
// (public/tray-search-client.js) — identical results whether matching runs
// against a live MongoDB query or a cached product snapshot. Mirrors the
// pricing-core.js pattern: one rules file, two callers.

// Orientation-independent footprint matching. Tray categories disagree on
// which physical side they store as "width": Hassmann/SLA stores width >=
// length, Badolux/DW stores width <= length. So every comparison treats the
// footprint by its sorted sides (max/min) and NEVER locks to
// widthCm/lengthCm — otherwise a single typed axis (e.g. width 120) starves
// whichever category is rotated.
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
    const need = w !== null ? w : l;
    filter.$expr = { $gte: [{ $max: ["$widthCm", "$lengthCm"] }, need] };
  }
  if (h !== null) filter.heightCm = { $gte: h };
  return filter;
}

// In-memory equivalent of buildTrayDimFilter's $expr, for filtering a plain
// array of cached product objects instead of querying Mongo. Same rule,
// expressed as a predicate so the two can never drift silently.
export function matchesTrayDims(p, { w, l, h }) {
  const wc = Number(p.widthCm) || 0;
  const lc = Number(p.lengthCm) || 0;
  const hc = Number(p.heightCm) || 0;
  if (w !== null && l !== null) {
    if (Math.max(wc, lc) < Math.max(w, l)) return false;
    if (Math.min(wc, lc) < Math.min(w, l)) return false;
  } else if (w !== null || l !== null) {
    if (Math.max(wc, lc) < (w !== null ? w : l)) return false;
  }
  if (h !== null && hc < h) return false;
  return true;
}

// In-memory equivalent of the route's productId/series/source filter.
export function matchesTraySeriesAndSource(p, { series, source }) {
  const pid = String(p.productId || "");
  if (series === "SLA") { if (!/^SLA/i.test(pid)) return false; }
  else if (series === "DW") { if (!/^DW/i.test(pid)) return false; }
  else if (!/^(SLA|DW)/i.test(pid)) return false;
  if (source && String(p.source || "").toLowerCase() !== source) return false;
  return true;
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

// Scores, ranks and trims a set of already-filtered candidate docs to the
// top 3 — the part of the route that has nothing to do with how the
// candidates were fetched, so both the live route and the offline fallback
// call it on whatever array they built.
export function scoreAndRank(docs, { w, l, h, budget }, badoluxDiscount = 0.20) {
  const mapped = docs.map((p) => {
    const pid = String(p.productId || "");
    const isDW = /^DW/i.test(pid);
    const isSLA = /^SLA/i.test(pid);
    const isBudget = String(p.source || "").toLowerCase() === "badolux";
    return {
      ...p,
      price: trayDisplayPrice(p, badoluxDiscount),
      score: scoreTray(p, { w, l, h }),
      isDW,
      isSLA,
      isBudget,
    };
  });

  return mapped
    .sort((a, b) => {
      if (budget) {
        const aRank = a.isDW && a.isBudget ? 0 : a.isDW ? 1 : a.isSLA ? 2 : 3;
        const bRank = b.isDW && b.isBudget ? 0 : b.isDW ? 1 : b.isSLA ? 2 : 3;
        return aRank - bRank || a.score - b.score || (a.price ?? Infinity) - (b.price ?? Infinity);
      }
      return a.score - b.score || (a.price ?? Infinity) - (b.price ?? Infinity);
    })
    .slice(0, 3)
    .map(({ isDW, isSLA, ...p }) => p); // keep payload clean; keep isBudget for frontend
}
