// Floor covered only by leftovers of the Wandverkleidung (owner 2026-11-26, ADR 031): the app shows the
// plate the offer lists — „Aluverbundplatte“ without a price, with the note „(aus Resten der
// Wandverkleidung)“ for the user; the note is internal (hidden in Kundenmodus), the row stays.
// Kosten lists the document's display-only line in its place, without a price; the sums do not move.
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { arbeitenChanges } from "../src/features/steps/arbeiten/rules.js";
import * as w from "../src/features/steps/fussboden/wand.js";
import { sections, sums } from "../src/features/steps/kosten/rules.js";
import { setCustomerMode } from "../src/shared/lib/customer-mode.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/fussboden-wand.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

type Fields = Record<string, unknown>;
const KEY = "t-0123456789abcdef01234567";
const SERVER: Record<string, Reply> = {
  ...BASE, "GET /admin/api/config/public": { body: { ...arbeiten.config } },
  ...Object.fromEntries(Object.entries(reference.prices).map(([q, body]) => [`GET /api/vigor-prices?${q}`, { body }])),
  ...Object.fromEntries(Object.entries(reference.products).filter(([, p]) => "price" in (p as object)).map(([id, body]) => [`GET /api/products/${id}`, { body }])),
};
const WW_ONLY_REST: Fields = { addWallCladding: "on", wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingWwQty: "", wallCladdingQty: "0", wallCladdingArea: "3", wallCladdingUseLeftover: "on" };
const VIGOUR_ONLY_REST: Fields = { addWallCladding: "on", wallCladdingSupplier: "hm", wallCladdingColor: "Weiß", wallCladdingArea: "3", wallCladdingUseLeftover: "on" };
const part = (el: Element, name: string) => (el.querySelector(`[data-part="${name}"]`)?.textContent ?? "").replace(/\s+/g, " ").trim();

afterEach(() => { setCustomerMode(false); });

async function openWith(dw: Fields) {
  fakeServer(SERVER);
  renderApp(`/deal/${KEY}/bu/Fussboden`);
  await screen.findByRole("heading", { name: "Fußboden" });
  act(() => {
    useOfferStore.setState((s) => {
      const o = s.offer as Record<string, any>, ch = arbeitenChanges(o, dw) as Record<string, Fields>;
      const next = { ...o, ...Object.fromEntries(Object.entries(ch).map(([k, f]) => [k, { ...(o[k] ?? {}), ...f }])) };
      return { offer: next as never, scratch: {} };
    });
  });
}
const plateRow = () => screen.getAllByTestId("wc-selected").find((r) => part(r, "name").startsWith("Aluverbundplatte"));

describe("„Ihre Auswahl“ of a leftover-only floor", () => {
  it("winwall: „Aluverbundplatte (aus Resten der Wandverkleidung)“, the Dekor, 1 Stück, no price; the note goes in Kundenmodus", { timeout: 20000 }, async () => {
    await openWith(WW_ONLY_REST);
    await waitFor(() => expect(plateRow()).toBeTruthy());
    const row = plateRow()!;
    expect([part(row, "name"), part(row, "note"), part(row, "price")]).toEqual(["Aluverbundplatte (aus Resten der Wandverkleidung)", "(aus Resten der Wandverkleidung)", ""]);
    expect(part(row, "meta")).toMatch(/WS 229 · 1 Stück$/);
    act(() => setCustomerMode(true));
    await waitFor(() => expect(part(plateRow()!, "name")).toBe("Aluverbundplatte"));
    expect(plateRow()!.querySelector('[data-part="note"]')).toBeNull();
    expect(part(plateRow()!, "meta")).toMatch(/1 Stück$/); // the row itself stays
  });

  it("no such row when plates are bought", { timeout: 20000 }, async () => {
    await openWith({ ...WW_ONLY_REST, wallCladdingWwQty: '{"15":1}', wallCladdingQty: "1", wallCladdingPanelSize: "15" });
    await waitFor(() => expect(screen.getAllByTestId("wc-selected").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("wc-selected").filter((r) => part(r, "note"))).toEqual([]);
  });

  it("the rule (VIGOUR, winwall, plates, switch off)", () => {
    const rows = (dw: Fields) => w.selection(dw, null, null, 11.82).map((r) => [r.name, r.note ?? "", r.meta, r.price]);
    expect(rows(VIGOUR_ONLY_REST)).toEqual([
      ["Aluverbundplatte", w.LEFTOVER_NOTE, "Weiß · 1 Stück", ""],
      ["Flächenkleber 600 ml", "", "Art.-Nr. R_4260602 · 1 Pkg je 0,60 m² · 3,00 m² Boden", "5 × 11,82 € = 59,10 €"],
    ]);
    expect(rows({ ...VIGOUR_ONLY_REST, wallCladdingColor: "" })[0]).toEqual(["Aluverbundplatte", w.LEFTOVER_NOTE, "1 Stück", ""]);
    expect(rows({ ...VIGOUR_ONLY_REST, wallCladdingQty: "2", wallCladdingPanelSize: "997" }).map((r) => r[0])).not.toContain("Aluverbundplatte");
    expect(rows({ ...VIGOUR_ONLY_REST, wallCladdingUseLeftover: undefined }).map((r) => r[0])).not.toContain("Aluverbundplatte");
  });
});

describe("Kosten: the document's display-only line", () => {
  const adhesive = { productId: "R_4260602", label: "- 5 Pkg Flächenkleber (1 Pkg je 0.6 m²)", qty: 5, unitPrice: 11.82, lineTotal: 59.1, category: "Fußboden" };
  const wall = { productId: "V3WVK09", label: "- 2 Stk Wandverkleidung 3.0 Alu 997×2550 mm (Marmor weiß)", qty: 2, unitPrice: 300, lineTotal: 600, category: "Wandverkleidung" };
  const shown = { productId: null, name: "Aluverbundplatte (Marmor weiß)", qty: 1, unitPrice: 0, lineTotal: 0, label: "- 1 Stk Aluverbundplatte (Marmor weiß)", category: "Fußboden", displayOnly: true, note: "aus Resten der Wandverkleidung" };
  const price = (docx: unknown[]) => ({
    services: { title: "Auszuführende Arbeiten", lines: [], sum: 0 }, materials: { title: "Material für Badumbau", lines: [adhesive, wall], sum: 659.1 },
    materialsDisplayUI: { title: "Material für Badumbau", lines: [adhesive, wall], sum: 659.1 }, materialsDisplayDocx: { lines: docx }, optionalDisplayUI: { lines: [], sum: 0 },
    markupPct: 0.3, markup: 197.73, markupBase: 659.1, netAfterRabatt_and_Bonus: 856.83, vatOnNet: 162.8, total: 1019.63, taxRate: 0.19,
  });

  it("listed before the floor's Flächenkleber, quantity 1, no unit price, no total, with its note; the sums are the same", () => {
    const with_ = price([shown, adhesive, wall]), without = price([adhesive, wall]);
    const mat = (p: Record<string, unknown>) => sections(p).find((s) => s.num === "II")!;
    expect(mat(with_).rows).toEqual([
      { subtitle: "FUSSBODEN" },
      { id: "", label: "- 1 Stk Aluverbundplatte (Marmor weiß)", tags: [], qty: "1", unit: "", total: "", note: "(aus Resten der Wandverkleidung)" },
      ...mat(without).rows.slice(1),
    ]);
    expect(mat(with_).footer).toBe(mat(without).footer);
    expect(sums(with_)).toEqual(sums(without));
  });
});
