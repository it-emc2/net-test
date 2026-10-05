// routes/bathtubs.js
// Catalog for the "Wanne" category on the Optional tab: Novellini Iris bathtubs
// and their Wannenaufsätze, sourced from the vigor DB (category "badewanne").
//
// Vigor stores no structured dimensions or variant attributes for these — every
// attribute lives in the free-text `name` + `finish` pair, so it is parsed here,
// once, server-side. The client only renders what this returns.
import { Router } from "express";
import { getVigorDb } from "../external/vigorDb.js";

const r = Router();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// `name` + `finish` for the 18 Iris articles follow two stable shapes:
//   tub    "Badewanne Acryl Iris 160x70/80cm weiß li" + "m.2 Schürzen weiß m.Abl. Novellini"
//   screen "NOV Iris COMBY Wannenaufsatz für Iris li" + "24/60x140cm ESG klar chrom.m.S70"
//   screen "Wannenaufsatz für Iris links Höhe 140cm"  + "24/60cm klappb. ESG klar chrom Novellini"
export function parseWanneDoc(doc) {
  const articleNumber = String(doc?.articleNumber || "").trim();
  if (!articleNumber) return null;

  const name = String(doc?.name || "").trim();
  const finish = String(doc?.finish || "").trim();
  const text = `${name} ${finish}`;
  const isScreen = /^IRISWA/i.test(articleNumber);

  // Side is taken from the article number, which is the canonical key: tubs carry
  // it after the size block (IRIS160L2SWE), screens as the last character.
  const sideChar = isScreen
    ? (articleNumber.match(/([LR])$/i)?.[1] ?? null)
    : (articleNumber.match(/^IRIS\d+([LR])/i)?.[1] ?? null);
  const side = sideChar ? (sideChar.toUpperCase() === "L" ? "links" : "rechts") : null;

  const base = {
    articleNumber,
    type: isScreen ? "screen" : "tub",
    name,
    finish,
    netPrice: num(doc?.netPrice),
    grosPrice: num(doc?.grosPrice),
    unit: doc?.unit || "Stück",
    brand: doc?.brand || null,
    side,
    // Served straight from the scraper's CDN, which app.js already allows in
    // the CSP img-src — so nothing is downloaded into the repo and the picture
    // follows whatever the scraper last saw. The 8 COMBY screens legitimately
    // share two images (one per side): they differ only in height and side
    // panel width, which a product photo does not show.
    image: doc?.images?.[0] || null,
  };

  if (!isScreen) {
    // "160x70/80cm" -> 160 long, tapered 70..80 wide
    const m = name.match(/(\d+)\s*x\s*(\d+)(?:\/(\d+))?\s*cm/i);
    return {
      ...base,
      lengthCm: num(m?.[1]),
      widthCm: num(m?.[2]),
      widthMaxCm: num(m?.[3]) ?? num(m?.[2]),
      schuerze: /m\.\s*2\s*Sch(ü|u)rzen/i.test(finish)
        ? "2 Schürzen"
        : /m\.\s*Frontsch(ü|u)rze/i.test(finish)
          ? "Frontschürze"
          : null,
      // m.WE = Wanneneinlauf (water enters through the tub), m.Abl. = plain drain
      zulauf: /m\.\s*WE\b/i.test(finish)
        ? "Wanneneinlauf"
        : /m\.\s*Abl/i.test(finish)
          ? "Ablauf"
          : null,
    };
  }

  // "24/60x140cm" carries width x height; the folding variants say "24/60cm"
  // and put the height in the name instead ("Höhe 140cm").
  const wh = finish.match(/(\d+)\s*x\s*(\d+)\s*cm/i);
  const widthOnly = finish.match(/\/(\d+)\s*cm/i);
  const heightFromName = name.match(/H(ö|o)he\s*(\d+)\s*cm/i);

  return {
    ...base,
    widthCm: num(wh?.[1]) ?? num(widthOnly?.[1]),
    heightCm: num(wh?.[2]) ?? num(heightFromName?.[2]),
    // "m.S70" = supplied with a 70 cm side panel; the folding variants have none.
    seitenwand: finish.match(/m\.\s*S(\d+)/i)?.[1]
      ? `S${finish.match(/m\.\s*S(\d+)/i)[1]}`
      : "ohne",
    klappbar: /klappb/i.test(text),
    glas: /ESG\s*klar/i.test(finish) ? "ESG klar" : null,
    rahmen: /chrom/i.test(finish) ? "chrom" : null,
  };
}

/**
 * GET /api/bathtubs/catalog
 * The whole Iris catalog (18 articles), parsed. Small enough to send at once —
 * the client filters locally, so there is no search/debounce round trip.
 */
r.get("/catalog", async (_req, res) => {
  try {
    const db = await getVigorDb();
    const docs = await db
      .collection("products")
      .find(
        { category: "badewanne" },
        {
          projection: {
            articleNumber: 1,
            name: 1,
            finish: 1,
            netPrice: 1,
            grosPrice: 1,
            unit: 1,
            brand: 1,
            images: 1,
            lastSeenAt: 1,
          },
        },
      )
      .toArray();

    // The scraper can hold several docs per article; keep the freshest with a
    // usable price, mirroring pickFreshestNetPrices' rule.
    const best = new Map();
    for (const d of docs) {
      const parsed = parseWanneDoc(d);
      if (!parsed || !(parsed.netPrice > 0)) continue;
      const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() || 0 : 0;
      const prev = best.get(parsed.articleNumber);
      if (!prev || seen >= prev.seen) best.set(parsed.articleNumber, { parsed, seen });
    }

    const items = [...best.values()]
      .map((v) => v.parsed)
      .sort(
        (a, b) =>
          a.type.localeCompare(b.type) ||
          a.netPrice - b.netPrice ||
          a.articleNumber.localeCompare(b.articleNumber),
      );

    res.json({ count: items.length, items });
  } catch (e) {
    console.error("bathtubs/catalog error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default r;
