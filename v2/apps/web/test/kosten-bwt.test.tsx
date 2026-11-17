// Kosten (Kosten-Details) of a Badewannentür must show what today's UI does for the same price
// and offer. Reference: fixtures/kosten-bwt.json, recorded from today's UI by
// v2/scripts/capture-kosten-bwt.cjs — every scenario with the price answer its page was drawn from
// and the offer fields the page reads besides the price (tasks, extra work time).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { overview } from "../src/features/steps/rabatt/rules.js";
import { eur, sections, sums } from "../src/features/steps/kosten/rules.js";
import reference from "./fixtures/kosten-bwt.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
interface View { heading: string; text: string; sections: { num: string; title: string; head: string[]; rows: Record<string, unknown>[]; empty: string; footer: string; sums: unknown[] }[]; recompute: string }

async function open(price: unknown, offer?: Record<string, Record<string, unknown>>) {
  fakeServer({ ...BASE, "POST /api/price": { body: price } });
  renderApp(`/deal/${KEY}/bwt/Kosten`);
  if (offer) { await waitFor(() => expect(useOfferStore.getState().offer).toBeTruthy()); useOfferStore.getState().patchAll(offer as never); }
}
const shown = () => screen.getAllByTestId("kosten-section").map((sec) => ({
  num: part(sec, "num"), title: part(sec, "title"), head: within(sec).queryAllByRole("columnheader").map((h) => flat(h.textContent)),
  rows: Array.from(sec.querySelectorAll('[data-part="subtitle"], [data-testid="kosten-line"]')).map((r) => ((r as HTMLElement).dataset.part === "subtitle"
    ? { subtitle: flat(r.textContent) } : { id: (r as HTMLElement).dataset.lineId, label: flat(r.querySelector('[data-part="label"]')?.textContent), tags: Array.from(r.querySelectorAll('[data-part="tag"]')).map((t) => flat(t.textContent)), qty: part(r, "qty"), unit: part(r, "unit"), total: part(r, "total") })),
  empty: part(sec, "empty"), footer: part(sec, "footer"),
}));

describe("Kosten (Badewannentür) shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const v = scenario.view as unknown as View, o = scenario.offer as Record<string, Record<string, unknown>>;
    await open(scenario.price, { bwt: { workTasks: o.bwt!.workTasks, extraTasks: o.bwt!.extraTasks }, Arbeitszeit: { extraTasks: o.Arbeitszeit?.extraTasks } });
    await screen.findByRole("heading", { name: v.heading });
    expect(screen.getByText(v.text)).toBeTruthy();
    const lists = v.sections.filter((s) => s.title !== "Summen"), totals = v.sections.find((s) => s.title === "Summen")!;
    await waitFor(() => expect(shown()).toEqual(lists.map(({ sums: _s, ...sec }) => sec)));
    const box = screen.getByTestId("kosten-sums");
    expect(Array.from(box.querySelectorAll('[data-part="row"], [data-part="note"]')).map((r) => ((r as HTMLElement).dataset.part === "note"
      ? { note: flat(r.textContent) } : { num: part(r, "num"), label: part(r, "label"), value: part(r, "value"), rule: (r as HTMLElement).dataset.rule === "true", total: (r as HTMLElement).dataset.total === "true" }))).toEqual(totals.sums);
    expect(within(box).getByRole("button", { name: v.recompute })).toBeTruthy();
  });
});

describe("Kosten (Badewannentür) — rules", () => {
  it("without the server's included lines they are built from the services and the door, delivery and small-material lines", () => {
    const price = { services: { sum: 0, lines: [{ key: "kilometer", label: "- Kilometerpauschale", amount: 20 }, { key: "facharbeiter", label: "- 5,00 Std Arbeitszeit", qty: 5, unitPrice: 80, amount: 400 }] },
      materials: { lines: [{ productId: "140322", qty: 1, unitPrice: 75, lineTotal: 75 }, { productId: "1226", qty: 2, unitPrice: 860, lineTotal: 1720 }, { productId: "KM02", qty: 0, unitPrice: 150, lineTotal: 0 }] } };
    const inc = sections(price, { type: "bwt", offer: {} })[1]!;
    expect(inc.rows.map((r) => ("subtitle" in r ? r.subtitle : [r.id, r.label, r.total]))).toEqual([["kilometer", "- Kilometerpauschale", eur(20)], ["facharbeiter", "- 5,00 Std Arbeitszeit", eur(400)], ["140322", "- 1 Stk Lieferkosten Badewannentür [140322]", eur(75)], ["1226", "- 2 Stk Universal / Standard Tür [1226]", eur(1720)]]);
    expect(inc.footer).toBe(`Summe Leistungen: ${eur(2215)}`);
  });
  it("the sums of a Badewannentür have no numerals", () => {
    expect(sums({ services: { sum: 1 }, materials: { sum: 2 } }, { type: "bwt" }).map((r) => ("num" in r ? r.num : ""))).toEqual(["", "", "", "", "", ""]);
  });
  it("the overview on Aufschlag / Rabatt names the material of the offer type (fixed: today it always says Badumbau)", () => {
    const row = (title?: string) => overview({ services: { sum: 1 }, materials: { sum: 2, ...(title ? { title } : {}) }, productsSubtotal: 2 }, "bwt", null, "").rows[1]!.label;
    expect([row("Material für Badewannentür"), row()]).toEqual(["Material für Badewannentür", "Material für Badumbau"]);
  });
});
