/**
 * Live stock on the Duschwanne suggestions (vigor DB → /api/trays/suggest → badge).
 *
 * Two pure pieces are worth pinning down, because both encode a rule that is easy
 * to get subtly wrong and impossible to notice in the UI:
 *  - freshest-wins across the scraper's several docs per article, counting only
 *    docs that actually carry stock data;
 *  - stockSymbol 3/6/9 mean "quantity 0 but deliverable", so they must not render
 *    as "Auf Bestellung" alongside genuinely unavailable articles.
 */

import { pickFreshestStock } from "../../src/external/vigorDb.js";

/** Mirrors script.js trayStockState */
const TRAY_STOCK_SOON = {
  3: "Verbundhaus 2–5 Tage",
  6: "Zentrallager 24 h",
  9: "Nachtverbund bis 18 Uhr",
};

function trayStockState(p) {
  const qty = Number(p?.stockQuantity) || 0;
  if (qty > 0) return { cls: "sc-stock--in", glyph: String(qty), text: "Auf Lager" };
  const soon = TRAY_STOCK_SOON[p?.stockSymbol];
  if (soon) return { cls: "sc-stock--soon", glyph: "⏱", text: soon };
  return { cls: "sc-stock--out", glyph: "0", text: "Auf Bestellung" };
}

describe("pickFreshestStock", () => {
  test("keeps the reading from the freshest doc", () => {
    const out = pickFreshestStock([
      { articleNumber: "SLA100", stockQuantity: 3, stockSymbol: 2, lastSeenAt: "2026-07-01T00:00:00Z" },
      { articleNumber: "SLA100", stockQuantity: 10, stockSymbol: 2, lastSeenAt: "2026-07-09T00:00:00Z" },
    ]);
    expect(out.get("SLA100").stockQuantity).toBe(10);
  });

  test("ignores docs without stock data, however fresh", () => {
    const out = pickFreshestStock([
      { articleNumber: "SLA100", stockQuantity: 10, stockSymbol: 2, lastSeenAt: "2026-07-01T00:00:00Z" },
      { articleNumber: "SLA100", lastSeenAt: "2026-07-09T00:00:00Z" },
    ]);
    expect(out.get("SLA100").stockQuantity).toBe(10);
  });

  test("a zero quantity is real data, not missing data", () => {
    const out = pickFreshestStock([
      { articleNumber: "SLA100", stockQuantity: 5, lastSeenAt: "2026-07-01T00:00:00Z" },
      { articleNumber: "SLA100", stockQuantity: 0, stockSymbol: 1, lastSeenAt: "2026-07-09T00:00:00Z" },
    ]);
    expect(out.get("SLA100").stockQuantity).toBe(0);
  });

  test("articles with no stock data at all are absent (Badolux)", () => {
    const out = pickFreshestStock([{ articleNumber: "DW020", lastSeenAt: "2026-07-09T00:00:00Z" }]);
    expect(out.has("DW020")).toBe(false);
  });

  test("empty input is fine", () => {
    expect(pickFreshestStock(undefined).size).toBe(0);
    expect(pickFreshestStock([]).size).toBe(0);
  });
});

describe("trayStockState", () => {
  test("quantity > 0 is green and shows the count", () => {
    expect(trayStockState({ stockQuantity: 10, stockSymbol: 2 })).toEqual({
      cls: "sc-stock--in",
      glyph: "10",
      text: "Auf Lager",
    });
  });

  test.each([
    [3, "Verbundhaus 2–5 Tage"],
    [6, "Zentrallager 24 h"],
    [9, "Nachtverbund bis 18 Uhr"],
  ])("stockSymbol %i is deliverable, so amber not red", (sym, text) => {
    const s = trayStockState({ stockQuantity: 0, stockSymbol: sym });
    expect(s.cls).toBe("sc-stock--soon");
    expect(s.text).toBe(text);
    // a quantity of 0 in the circle would say nothing here
    expect(s.glyph).toBe("⏱");
  });

  test("stockSymbol 1 is genuinely unavailable", () => {
    expect(trayStockState({ stockQuantity: 0, stockSymbol: 1 }).cls).toBe("sc-stock--out");
  });

  test("no stockSymbol falls back to the quantity rule", () => {
    expect(trayStockState({ stockQuantity: 0 }).cls).toBe("sc-stock--out");
    expect(trayStockState({ stockQuantity: 4 }).cls).toBe("sc-stock--in");
  });
});
