// Kürzel je Produkt (owner 2026-11-27): in Kosten a line of Fußboden, Wandverkleidung, Duschwanne or
// Duschabtrennung ends with the Kürzel of its supplier, as in the offer document — muted, after the
// label (the label itself, which the replay of today's page compares, stays as it was). The category
// headings carry no Kürzel. One rule for both: @oc/pricing lineSupplierCode.
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { sections, type Row } from "../src/features/steps/kosten/rules.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const line = (category: string, productId: string, label: string, extra: Record<string, unknown> = {}) =>
  ({ category, productId, label, qty: 1, unitPrice: 10, lineTotal: 10, ...extra });
/** VIGOUR wall with TRINNITY sealing and Ramsauer adhesive, winwall floor, Slate tray + a free tray, a VIGOUR shower screen */
const LINES = [
  line("Kleinmaterial", "KM02", "- 1 Stk Kleinmaterial groß"),
  line("Fußboden", "WS22915", "- 2 Stk Aluverbundplatte 1000×2500 mm — Dekor: Struktur steingrau (WS 229)"),
  line("Fußboden", "R_4260602", "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)"),
  line("Wandverkleidung", "V3WVK09", "- 2 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Marmor weiß", { hassmannArticle: "V3WVK09" }),
  line("Wandverkleidung", "TRWDSET5", "- 1 Stk TRINNITY Wandabdichtung BASIS-Set 5 qm"),
  line("Wandverkleidung", "WS80301", "- 1 Stk winwall Abdichtungsset 5 m² (DIN 18534-1)"),
  line("Wandverkleidung", "R_4260602", "- 4 Pkg Flächenkleber (Wandverkleidung)"),
  line("Duschwanne", "SLA12090", "- 1 Stk Duschwanne 120 x 90 x 3 cm"),
  line("Duschwanne", "DW_CUSTOM", "- 1 Stk Duschwanne Sondermaß"),
  line("Duschabtrennung", "V2PT83LC", "- 1 Stk Pendeltür 1-tlg. V2", { source: "vigour_config" }),
];
const PRICE = { services: { lines: [], sum: 0 }, materials: { title: "Material für Badumbau", lines: LINES, sum: 100 }, materialsDisplayUI: { title: "Material für Badumbau", lines: LINES, sum: 100 }, total: 119 };
const OFFER = { duschwanne: { chosenTrayProductId: "SLA12090", addWallCladding: true, wallCladdingSupplier: "ww" }, wandverkleidung: { wvSupplier: "hm" } };
const EXPECTED: [string, string | undefined][] = [
  ["KLEINMATERIAL", undefined], ["KM02", undefined],
  ["FUSSBODEN", undefined], ["WS22915", "WV-WW"], ["R_4260602", undefined],
  ["WANDVERKLEIDUNG", undefined], ["V3WVK09", "WV-HM"], ["TRWDSET5", "WV-HM"], ["WS80301", "WV-WW"], ["R_4260602", undefined],
  ["DUSCHWANNE", undefined], ["SLA12090", "DW-SL"], ["DW_CUSTOM", "DW-FP"],
  ["DUSCHABTRENNUNG", undefined], ["V2PT83LC", undefined], // no Kürzel defined for shower screens
];
const material = (rows: Row[]) => rows.map((r) => ("subtitle" in r ? [r.subtitle, undefined] : [r.id, r.code]));

describe("Kosten: the supplier Kürzel per line (rules)", () => {
  it("Badumbau: each line its own supplier's Kürzel, the headings none", () => {
    const mat = sections(PRICE, { type: "bu", offer: OFFER }).find((s) => s.num === "II")!;
    expect(material(mat.rows)).toEqual(EXPECTED);
    // the label is untouched: the Kürzel is a field of its own
    expect(mat.rows.filter((r) => !("subtitle" in r) && r.label.includes("·"))).toEqual([]);
  });

  it("without the offer no Kürzel is guessed (a tray could not be told from a free item)", () => {
    const mat = sections(PRICE, { type: "bu" }).find((s) => s.num === "II")!;
    expect(mat.rows.every((r) => "subtitle" in r || r.code === undefined)).toBe(true);
  });

  it("Handlauf groups by configuration: no Kürzel", () => {
    const mat = sections(PRICE, { type: "hl", offer: OFFER }).find((s) => s.num === "II")!;
    expect(mat.rows.every((r) => "subtitle" in r || r.code === undefined)).toBe(true);
  });
});

describe("Kosten: the supplier Kürzel on the page", () => {
  it("muted, after the label of its line", async () => {
    fakeServer({ ...BASE, "POST /api/price": { body: PRICE } });
    renderApp(`/deal/${KEY}/bu/Kosten`);
    await screen.findByRole("heading", { name: "Kosten-Details" });
    act(() => {
      useOfferStore.setState((s) => {
        const o = (s.offer ?? {}) as Record<string, any>;
        return { offer: { ...o, duschwanne: { ...(o.duschwanne ?? {}), ...OFFER.duschwanne }, wandverkleidung: { ...(o.wandverkleidung ?? {}), ...OFFER.wandverkleidung } } as never };
      });
    });
    await waitFor(() => expect(screen.getAllByTestId("kosten-line").length).toBeGreaterThan(5));
    const rows = screen.getAllByTestId("kosten-line");
    const codeOf = (id: string) => rows.filter((r) => r.dataset.lineId === id).map((r) => r.querySelector('[data-part="code"]'));
    const panel = codeOf("V3WVK09")[0]!;
    expect(panel.textContent).toBe(" · WV-HM");
    expect(panel.className).toContain("text-muted-foreground");
    expect(panel.previousElementSibling?.getAttribute("data-part")).toBe("label");
    expect(codeOf("WS22915")[0]!.textContent).toBe(" · WV-WW");
    expect(codeOf("SLA12090")[0]!.textContent).toBe(" · DW-SL");
    expect(codeOf("DW_CUSTOM")[0]!.textContent).toBe(" · DW-FP");
    expect(codeOf("R_4260602")).toEqual([null, null]);
    expect(codeOf("V2PT83LC")).toEqual([null]);
    // headings without Kürzel
    expect(Array.from(document.querySelectorAll('[data-part="subtitle"]')).map((h) => h.textContent)).toEqual(["KLEINMATERIAL", "FUSSBODEN", "WANDVERKLEIDUNG", "DUSCHWANNE", "DUSCHABTRENNUNG"]);
  });
});
