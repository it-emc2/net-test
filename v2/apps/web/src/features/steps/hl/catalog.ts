// Handlauf · the Flexofit catalog the configurator offers (today: src/public/script.js, "HL Flexofit:
// shared pure helpers", ~line 29473). The model is NOT a configurator model file and not
// configurator/engine.js (that one is the Duschabtrennung/Badolux engine): it is the list of
// products of source "flexofit" from the database (GET /api/products?source=flexofit&limit=500,
// loaded once per page), turned into catalog entries here. Pure functions, no React.
//  - an entry = one product in one family, with the areas (innen / außen) it is offered for and a
//    label; FF_SL01 (Zuschnitt) is an entry of two tube families but never offered as a tube
//  - the key of an entry (`family::productId::label`) is what the stored configurator state uses
//  - fittings for innen come in 8 finishes, read from the product id's 2-digit suffix
export interface Product { productId: string; name?: string | null; price?: number | null; [k: string]: unknown }
export interface Entry { product: Product; family: string; areas: ("inside" | "outside")[]; label: string }

const FINISH_BY_SUFFIX: Record<string, string> = {
  "02": "Schwarz", "03": "Chrom glanz", "04": "Chrom matt", "05": "Messing brüniert", "06": "Weiß",
  "07": "Edelstahl gebürstet", "09": "Messing hochglanz", "10": "Anthrazit", "11": "Nickel gebürstet",
};
/** the 8 selectable innen finishes, in display order */
export const INNEN_FINISHES = ["Schwarz", "Chrom glanz", "Chrom matt", "Messing brüniert", "Weiß", "Messing hochglanz", "Anthrazit", "Nickel gebürstet"] as const;
/** tube families are priced per metre */
export const TUBE_FAMILIES = ["Aluminiumrohr 35mm", "Stahlrohr 35mm", "Massivholz"] as const;
/** fitting families that carry a finish */
export const FITTING_FAMILIES = ["Handlaufhalter innen", "Decken-/Wand-/Bodenplatte innen", "Flexo-Gelenk innen", "Sonderabschluss innen", "T-Bogen innen", "Wandabschlussbogen innen", "90-Grad-Bogen innen"] as const;
export const OUTSIDE_FITTING_FAMILIES = ["Beschläge Edelstahl außen", "Material Edelstahl außen"] as const;
/** the tube tabs per area, in order */
export const TUBE_GROUPS: Record<"inside" | "outside", readonly string[]> = { inside: ["Aluminiumrohr 35mm", "Stahlrohr 35mm", "Massivholz"], outside: ["Aluminiumrohr 35mm"] };
export const OUTSIDE_FINISH = "Edelstahl gebürstet";

/** finish of a fitting from its FF_<letters><2 digits> id */
export function finishOf(p: Product): string {
  const m = String(p?.productId || "").match(/^FF_[A-Za-z]+(\d{2})$/);
  return m ? FINISH_BY_SUFFIX[m[1]!] || "" : "";
}

/** the short name of a product as the configurator shows it */
export function productVariant(p: Product): string {
  const name = String(p?.name || ""), id = String(p?.productId || "");
  if (/^FF_\d{2}[a-z]?$/i.test(id) && /Stahlrohr/i.test(name)) return name.replace(/^Stahlrohr\s+35mm\s+Dekor\s+/i, "").replace(/\s+\(Innen\).*/i, "").trim();
  if (/^FF_\d{2}$/i.test(id) && /Aluminiumrohr/i.test(name)) return name.replace(/^Aluminiumrohr\s+35mm\s+/i, "").replace(/\s+\(Innen\/Außen\).*/i, "").trim();
  if (/^FF_69$/i.test(id)) return "Edelstahl-Rohr / Deco-Rohr";
  if (/^FF_20$/i.test(id)) return "Plexiglas 3,0 m";
  if (/^FF_3/i.test(id)) return name.replace(/^Massivholz\s+Handlauf\s+Ø35mm\s+/i, "").replace(/\s+\(Innen\).*/i, "").trim();
  return name.replace(/\s*\((?:Innen|Innen\/Außen)\)/gi, "").replace(/,\s*Preis pro lfm.*$/i, "").trim();
}

/** picture of an entry (today's files under /assets) */
export function imageFor(entry: Entry): string {
  const id = String(entry.product?.productId || ""), variant = productVariant(entry.product), f = entry.family;
  const a = (p: string) => `/assets/${p}`;
  if (f === "Stahlrohr 35mm") return a(`Stahl/${variant}.png`);
  if (f === "Aluminiumrohr 35mm") return a(`Aluminiumrohr/${variant}.png`);
  if (f === "Plexiglas") return a("Stahlrohr.png");
  if (f === "Massivholz") return a("Massivholz.png");
  if (f === "Handlaufhalter innen") return a("SonstigeInnen/Handlaufhalter.png");
  if (f === "Wandabschlussbogen innen") return a("SonstigeInnen/Wandabschlussbogen.png");
  if (f === "Flexo-Gelenk innen") return a("SonstigeInnen/Flexo-Gelenk.png");
  if (f === "90-Grad-Bogen innen") return a("SonstigeInnen/90 Bogen.png");
  if (f === "Sonderabschluss innen") return a("SonstigeInnen/Sonderabschluss.png");
  if (f === "T-Bogen innen") return a("SonstigeInnen/90 Bogen.png");
  if (f === "Decken-/Wand-/Bodenplatte innen") return a("SonstigeInnen/Chrom matt.png");
  if (id === "FF_E08") return a("Abdeckrosette .png");
  if (/^FF_E0[125]$|^FF_E1[12]$/i.test(id)) return a("Edelstahlstütze.png");
  if (/^FF_E22c$/i.test(id)) return a("Auflage für Edelstahlstütze.png");
  if (/^FF_E22d$/i.test(id)) return a("Auflage für Edel lang.png");
  if (/^FF_KFS|^FF_A06$/i.test(id)) return a("Wandanschluss gerade.png");
  if (/^FF_S0001$/i.test(id)) return a("Wandanschluss schräg.png");
  return a("Stahlrohr.png");
}

/** the catalog entries of one product */
export function familyEntriesFor(p: Product): Entry[] {
  const id = String(p?.productId || ""), name = String(p?.name || "");
  const out: Entry[] = [];
  const add = (family: string, areas: Entry["areas"], label?: string) => out.push({ product: p, family, areas, label: label || productVariant(p) });
  if (id === "FF_SL01") { add("Stahlrohr 35mm", ["inside"], "Zuschnitt Stahlrohr"); add("Aluminiumrohr 35mm", ["inside", "outside"], "Zuschnitt Aluminiumrohr"); return out; }
  if (/^FF_(?:0[1-9]|10|12|13|14|15|18|22|9[0-5])$/i.test(id)) add("Stahlrohr 35mm", ["inside"]);
  else if (id === "FF_20") add("Plexiglas", ["inside"]);
  else if (/^FF_3/i.test(id)) add("Massivholz", ["inside"]);
  else if (/^FF_(?:5[0-9]|6[0-6]|7[1-7]|8[2-5])$/i.test(id)) add("Aluminiumrohr 35mm", ["inside", "outside"]);
  else if (id === "FF_69") add("Aluminiumrohr 35mm", ["inside", "outside"]);
  else if (/^FF_H07$|^FF_W07$|^FF_F07$|^FF_D07$|^FF_B07$|^FF_S07$/i.test(id)) add("Beschläge Edelstahl außen", ["outside"]);
  else if (/^FF_E|^FF_KE|^FF_KFS|^FF_A06$|^FF_S0001$/i.test(id)) add("Material Edelstahl außen", ["outside"]);
  else if (/^FF_H/i.test(id)) add("Handlaufhalter innen", ["inside"]);
  else if (/^FF_W/i.test(id)) add("Wandabschlussbogen innen", ["inside"]);
  else if (/^FF_F/i.test(id)) add("Flexo-Gelenk innen", ["inside"]);
  else if (/^FF_D/i.test(id)) add("Decken-/Wand-/Bodenplatte innen", ["inside"]);
  else if (/^FF_T/i.test(id)) add("T-Bogen innen", ["inside"]);
  else if (/^FF_B/i.test(id)) add("90-Grad-Bogen innen", ["inside"]);
  else if (/^FF_S/i.test(id)) add("Sonderabschluss innen", ["inside"]);
  else add(name.includes("Außen") ? "Weitere Produkte außen" : "Weitere Produkte innen", name.includes("Außen") ? ["outside"] : ["inside"]);
  return out;
}

export const keyOf = (e: Entry): string => [e.family, e.product?.productId || "", e.label || productVariant(e.product)].join("::");

/** the catalog: every entry and a lookup by key */
export interface Catalog { entries: Entry[]; byKey: Map<string, Entry> }
export function catalogOf(products: readonly Product[]): Catalog {
  const entries = products.flatMap(familyEntriesFor);
  return { entries, byKey: new Map(entries.map((e) => [keyOf(e), e])) };
}
export const EMPTY_CATALOG: Catalog = { entries: [], byKey: new Map() };

/** "12,50 EUR" (today's configurator money format) */
export const money = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2).replace(".", ",")} EUR` : ""; };
