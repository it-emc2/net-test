// Kosten (Kosten-Details) of a Handlauf must show what today's UI does for the same price.
// Reference: fixtures/kosten-hl.json, recorded from today's UI by v2/scripts/capture-handlauf-kosten.cjs
// — every scenario with the price answer its page was drawn from (the page reads nothing else).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { eur, sections } from "../src/features/steps/kosten/rules.js";
import reference from "./fixtures/kosten-hl.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
interface View { heading: string; text: string; sections: { num: string; title: string; head: string[]; rows: Record<string, unknown>[]; empty: string; footer: string; sums: unknown[] }[]; recompute: string }

async function open(price: unknown, offer?: Record<string, Record<string, unknown>>) {
  fakeServer({ ...BASE, "POST /api/price": { body: price } });
  renderApp(`/deal/${KEY}/hl/Kosten`);
  if (offer) { await waitFor(() => expect(useOfferStore.getState().offer).toBeTruthy()); useOfferStore.getState().patchAll(offer as never); }
}
const num = (t: string) => Number(t.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
/** what the page shows now where today's recording differs (approved, U-032 / U-033): task lines are one quiet row; the unit price is the one that gives the line total */
const approved = (rows: Record<string, unknown>[]) => rows.map((r) => {
  if (r.unit === undefined) return r;
  const unit = String(r.unit), qty = num(String(r.qty)), total = num(String(r.total));
  if (r.id === "" && num(unit) === 0 && total === 0) return { label: r.label, task: true };
  return qty > 0 && total > 0 && Math.abs(num(unit) * qty - total) >= 0.005 ? { ...r, unit: flat(eur(total / qty)) } : r;
});
const shown = () => screen.getAllByTestId("kosten-section").map((sec) => ({
  num: part(sec, "num"), title: part(sec, "title"), head: within(sec).queryAllByRole("columnheader").map((h) => flat(h.textContent)),
  rows: Array.from(sec.querySelectorAll('[data-part="subtitle"], [data-testid="kosten-line"], [data-testid="kosten-task"]')).map((r) => ((r as HTMLElement).dataset.part === "subtitle"
    ? { subtitle: flat(r.textContent) } : (r as HTMLElement).dataset.testid === "kosten-task" ? { label: flat(r.querySelector('[data-part="label"]')?.textContent), task: true } : { id: (r as HTMLElement).dataset.lineId, label: flat(r.querySelector('[data-part="label"]')?.textContent), tags: Array.from(r.querySelectorAll('[data-part="tag"]')).map((t) => flat(t.textContent)), qty: part(r, "qty"), unit: part(r, "unit"), total: part(r, "total") })),
  empty: part(sec, "empty"), footer: part(sec, "footer"),
}));

describe("Kosten (Handlauf) shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const v = scenario.view as unknown as View;
    await open(scenario.price);
    await screen.findByRole("heading", { name: v.heading });
    expect(screen.getByText(v.text)).toBeTruthy();
    const lists = v.sections.filter((s) => s.title !== "Summen"), totals = v.sections.find((s) => s.title === "Summen")!;
    await waitFor(() => expect(shown()).toEqual(lists.map(({ sums: _s, ...sec }) => ({ ...sec, rows: approved(sec.rows) }))));
    const box = screen.getByTestId("kosten-sums");
    expect(Array.from(box.querySelectorAll('[data-part="row"], [data-part="note"]')).map((r) => ((r as HTMLElement).dataset.part === "note"
      ? { note: flat(r.textContent) } : { num: part(r, "num"), label: part(r, "label"), value: part(r, "value"), rule: (r as HTMLElement).dataset.rule === "true", total: (r as HTMLElement).dataset.total === "true" }))).toEqual(totals.sums);
    expect(within(box).getByRole("button", { name: v.recompute })).toBeTruthy();
  });
});

describe("Kosten (Handlauf) — quantity × unit price = line total, in every recording", () => {
  it("holds for every line shown", () => {
    for (const s of reference.scenarios) for (const sec of sections(s.price as never, { type: "hl" })) for (const r of sec.rows) {
      if ("subtitle" in r || r.task) continue;
      const qty = num(r.qty), total = num(r.total);
      if (qty > 0 && total > 0) expect(Math.abs(num(r.unit) * qty - total)).toBeLessThan(0.02);
    }
  });
});
