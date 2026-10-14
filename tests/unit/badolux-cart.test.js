/**
 * Badolux cart for cleverbad.de (src/logic/badolux-cart.js), against the real
 * generated catalog. Format: docs/research-cleverbad-badolux.md §11.
 */
import { readFileSync } from "node:fs";
import { buildBadoluxCart, cartCsv } from "../../src/logic/badolux-cart.js";

const catalog = JSON.parse(readFileSync(new URL("../../src/logic/cleverbad-catalog.json", import.meta.url), "utf8"));
const line = (productId, qty, extra = {}) => ({ productId, qty, unitPrice: 10, label: `- ${qty} Stk ${productId}`, ...extra });

describe("Badolux cart", () => {
  const cart = buildBadoluxCart({
    catalog,
    payload: { wandverkleidung: { wvMotif: "PRE97WP22|Arcadia" } },
    badoluxIds: new Set(["DW020", "WP003", "WP007", "BP003", "AGB001"]),
    lines: [
      line("DW020", 1, { category: "Duschwanne", unitPrice: 235.2 }),
      line("PRI80DK19-Z", 1, { finish: "Eckeinstieg · ESG Klarglas 8 mm" }),
      line("PRI80DK19-Z", 1), // two cards with the same door → one row, qty 2
      line("WP003", 6, { category: "Wandverkleidung" }),
      line("WP007", 3, { category: "Wandverkleidung" }),
      line("BP003", 10, { category: "Fußboden", label: "- 10 Pkg Hydroträgerplatte (1 Pkg = 1,49 m²)" }),
      line("AGB001", 1),
      line("V3WVK09", 4), // Vigour — not ours to put in this cart
      line("KM02", 1),
    ],
  });

  test("maps trays, doors, panels and the picked motif to shop articles", () => {
    expect(cart.items.map((i) => [i.sku, i.qty])).toEqual([
      ["PRI70DW08", 1],
      ["PRI80DK19-Z", 2],
      ["PRI73WP10", 6],
      ["PRE97WP22", 3],
    ]);
    expect(cart.items[0]).toMatchObject({
      section: "Duschwanne",
      ourProductId: "DW020",
      ourNetEach: 235.2,
      url: "https://cleverbad.de/produkt/duschwanne-riviera?breite=100&laenge=100",
    });
    expect(cart.items[1]).toMatchObject({
      section: "Duschabtrennung",
      url: "https://cleverbad.de/produkt/falttuer-lissabon?breite=90",
      variant: { widthCm: 90, glassMm: 8, option: "Zweiteilig" },
      note: "Eckeinstieg · ESG Klarglas 8 mm",
    });
    expect(cart.items[2].url).toBe("https://cleverbad.de/produkt/wandpaneel-keramico-grau");
  });

  test("Badolux items the shop doesn't sell go to manual; other suppliers are left out", () => {
    expect(cart.manual).toEqual([
      { ourProductId: "BP003", name: "Hydroträgerplatte (1 Pkg = 1,49 m²)", qty: 10, reason: "nicht im cleverbad-Shop" },
      { ourProductId: "AGB001", name: "AGB001", qty: 1, reason: "nicht im cleverbad-Shop" },
    ]);
  });

  test("own motif / no motif → Dein Design", () => {
    const own = buildBadoluxCart({ catalog, payload: { wandverkleidung: { wvMotif: "eigen|Eigenes Motiv" } }, lines: [line("WP007", 2)] });
    expect(own.items[0].sku).toBe("PRI73WP999");
  });

  test("CSV is Hassmann-style", () => {
    expect(cartCsv(cart)).toBe("﻿ART;PRI70DW08;1\r\nART;PRI80DK19-Z;2\r\nART;PRI73WP10;6\r\nART;PRE97WP22;3");
  });

  test("an offer without Badolux items gives an empty cart", () => {
    const none = buildBadoluxCart({ catalog, lines: [line("V3WVK09", 2), line("KM02", 1)] });
    expect(none).toEqual({ items: [], manual: [] });
  });
});
