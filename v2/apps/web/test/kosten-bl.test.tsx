// Kosten (Kosten-Details) of a Badelift must show what today's UI does for the same price.
// Reference: the Kosten page recorded at the end of every scenario of fixtures/badelift.json
// (v2/scripts/capture-badelift.cjs), each with the price answer it was drawn from; and the real
// stored Badelift offers of fixtures/badelift-old-offers.json with the server's price for them.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eur, sections, sums } from "../src/features/steps/kosten/rules.js";
import reference from "./fixtures/badelift.json" with { type: "json" };
import old from "./fixtures/badelift-old-offers.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
interface View { heading: string; text: string; sections: { num: string; title: string; head: string[]; rows: Record<string, unknown>[]; empty: string; footer: string; sums: unknown[] }[]; recompute: string }
const num = (t: string) => Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
/** approved for every type (U-033): the unit price shown is the one that gives the line total */
const approved = (rows: Record<string, unknown>[]) => rows.map((r) => {
  if (r.unit === undefined) return r;
  const unit = String(r.unit), qty = num(String(r.qty)), total = num(String(r.total));
  return qty > 0 && total > 0 && Math.abs(num(unit) * qty - total) >= 0.005 ? { ...r, unit: flat(eur(total / qty)) } : r;
});
const shown = () => screen.getAllByTestId("kosten-section").map((sec) => ({
  num: part(sec, "num"), title: part(sec, "title"), head: within(sec).queryAllByRole("columnheader").map((h) => flat(h.textContent)),
  rows: Array.from(sec.querySelectorAll('[data-part="subtitle"], [data-testid="kosten-line"]')).map((r) => ((r as HTMLElement).dataset.part === "subtitle"
    ? { subtitle: flat(r.textContent) } : { id: (r as HTMLElement).dataset.lineId, label: flat(r.querySelector('[data-part="label"]')?.textContent), tags: Array.from(r.querySelectorAll('[data-part="tag"]')).map((t) => flat(t.textContent)), qty: part(r, "qty"), unit: part(r, "unit"), total: part(r, "total") })),
  empty: part(sec, "empty"), footer: part(sec, "footer"),
}));
const sumRows = () => Array.from(screen.getByTestId("kosten-sums").querySelectorAll('[data-part="row"], [data-part="note"]')).map((r) => ((r as HTMLElement).dataset.part === "note"
  ? { note: flat(r.textContent) } : { num: part(r, "num"), label: part(r, "label"), value: part(r, "value"), rule: (r as HTMLElement).dataset.rule === "true", total: (r as HTMLElement).dataset.total === "true" }));

describe("Kosten (Badelift) shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const v = scenario.kosten as unknown as View;
    fakeServer({ ...BASE, "POST /api/price": { body: scenario.price } });
    renderApp(`/deal/${KEY}/bl/Kosten`);
    await screen.findByRole("heading", { name: v.heading });
    expect(screen.getByText(v.text)).toBeTruthy();
    const lists = v.sections.filter((s) => s.title !== "Summen"), totals = v.sections.find((s) => s.title === "Summen")!;
    await waitFor(() => expect(shown()).toEqual(lists.map(({ sums: _s, ...sec }) => ({ ...sec, rows: approved(sec.rows) }))));
    expect(sumRows()).toEqual(totals.sums);
    expect(within(screen.getByTestId("kosten-sums")).getByRole("button", { name: v.recompute })).toBeTruthy();
  });
});

describe("Kosten (Badelift) — real stored offers", () => {
  const offers = old.offers as unknown as { id: string; expected: Record<string, unknown> }[];
  it.each(offers.map((o) => [o.id, o] as const))("%s: three sections without numerals, the material as one list, the total of the price", (_id, o) => {
    const secs = sections(o.expected, { type: "bl" });
    expect(secs.map((s) => [s.num, s.title])).toEqual([["", "Auszuführende Arbeiten"], ["", "Enthält je Einheit"], ["", "Material für Badelift"]]);
    expect(secs[2]!.rows.every((r) => !("subtitle" in r))).toBe(true);
    const all = sums(o.expected, { type: "bl" });
    expect(all.every((r) => !("num" in r) || !r.num)).toBe(true);
    expect(all.at(-1)).toMatchObject({ label: "Gesamt (brutto):", value: eur(o.expected.total), total: true });
    // quantity × unit price = line total on every line
    for (const s of secs) for (const r of s.rows) {
      if ("subtitle" in r) continue;
      const q = num(r.qty), t = num(r.total);
      if (q > 0 && t > 0) expect(Math.abs(num(r.unit) * q - t)).toBeLessThan(0.02);
    }
  });
});
