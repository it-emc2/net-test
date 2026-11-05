// Bathtub catalog parsing — port of parseWanneDoc/productLink in legacy src/routes/bathtubs.js.
// Vigor keeps every attribute in free text (name + finish); parsed here once, server-side.
// Contract test (seeded Iris docs) proves identical output; data + describe are verbatim ports.
import { WANNE_ACCESSORIES, WANNE_SET_ORDER } from "./ported/wanne-sets.js";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** { url, urlLabel } of the page that shows the product's photos and price. */
export function productLink(articleNumber: string) {
  const o: any = (WANNE_SET_ORDER as Map<string, any>).get(articleNumber);
  if (o?.url) return { url: o.url, urlLabel: o.shop.split(" /")[0] };
  return { url: `https://gconlineplus.de/p/search/${encodeURIComponent(articleNumber)}`, urlLabel: "GC" };
}

export function parseWanneDoc(doc: any): any {
  const articleNumber = String(doc?.articleNumber || "").trim();
  if (!articleNumber) return null;
  const name = String(doc?.name || "").trim();
  const finish = String(doc?.finish || "").trim();
  const text = `${name} ${finish}`;
  const isScreen = /^IRISWA/i.test(articleNumber);
  const sideChar = isScreen ? (articleNumber.match(/([LR])$/i)?.[1] ?? null) : (articleNumber.match(/^IRIS\d+([LR])/i)?.[1] ?? null);
  const side = sideChar ? (sideChar.toUpperCase() === "L" ? "links" : "rechts") : null;
  const base = {
    articleNumber, type: isScreen ? "screen" : "tub", name, finish,
    netPrice: num(doc?.netPrice), grosPrice: num(doc?.grosPrice), unit: doc?.unit || "Stück", brand: doc?.brand || null, side,
    image: doc?.images?.[0] || null,
  };
  if (!isScreen) {
    if (!/^IRIS\d/i.test(articleNumber)) return null; // accessories filed as "badewanne" (IRISNS) are not tubs
    const m = name.match(/(\d+)\s*x\s*(\d+)(?:\/(\d+))?(?:\s*x\s*\d+)?\s*cm/i);
    const schuerze = /m\.\s*3\s*Sch(ü|u|\.)/i.test(finish) ? "3 Schürzen"
      : /m\.\s*2\s*Sch(ü|u|\.)/i.test(finish) ? "2 Schürzen"
        : /m\.\s*Frontsch(ü|u)rze/i.test(finish) ? "Frontschürze" : null;
    return {
      ...base,
      einbau: schuerze === "3 Schürzen" ? "Vorwand" : schuerze === "2 Schürzen" ? "Ecke" : schuerze === "Frontschürze" ? "Nische" : null,
      wall: schuerze === "2 Schürzen" ? side : schuerze === "Frontschürze" ? "beide" : null,
      tubHeightCm: 62,
      requires: schuerze === "Frontschürze" ? [{ ...(WANNE_ACCESSORIES as any).IRISNS }] : [],
      hasDoor: true,
      screenFamily: "iris",
      lengthCm: num(m?.[1]), widthCm: num(m?.[2]), widthMaxCm: num(m?.[3]) ?? num(m?.[2]),
      schuerze,
      zulauf: /\b[mu]\.\s*WE\b/i.test(finish) ? "Wanneneinlauf" : /m\.\s*Ab(l|-)/i.test(finish) ? "Ablauf" : null,
    };
  }
  const wh = finish.match(/(\d+)\s*x\s*(\d+)\s*cm/i);
  const widthOnly = finish.match(/\/(\d+)\s*cm/i);
  const heightFromName = name.match(/H(ö|o)he\s*(\d+)\s*cm/i);
  const s = finish.match(/m\.\s*S(\d+)/i)?.[1];
  return {
    ...base,
    widthCm: num(wh?.[1]) ?? num(widthOnly?.[1]),
    heightCm: num(wh?.[2]) ?? num(heightFromName?.[2]),
    seitenwand: s ? `S${s}` : "ohne",
    klappbar: /klappb/i.test(text),
    screenKind: /klappb/i.test(text) ? "klapp" : "comby",
    screenFamily: "iris",
    glas: /ESG\s*klar/i.test(finish) ? "ESG klar" : null,
    rahmen: /chrom/i.test(finish) ? "chrom" : null,
  };
}
