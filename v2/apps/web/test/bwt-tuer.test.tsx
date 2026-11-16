// Badewannentür (slice 1) must store and show what today's UI does for the same inputs.
// Reference: fixtures/bwt-tuer.json, recorded from today's UI by v2/scripts/capture-bwt-tuer.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { DOORS, GRIPS, doorInfo } from "../src/features/steps/bwt/rules.js";
import reference from "./fixtures/bwt-tuer.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const door = (key: string) => DOORS.find((d) => d.key === key)!;
const cardOf = (key: string) => screen.getAllByTestId("bwt-door").find((c) => c.dataset.key === key)!;
const DIM_NAME: Record<string, string> = { Height: "Höhe", Width: "Breite", StdWidth: "Standardbreite", DepthTop: "Tiefe O", DepthBottom: "Tiefe U" };
const COLOR_LABEL: Record<string, string> = { weiß: "Weiß", Beige: "Bahama Beige", Manhattan: "Manhattan" };
const MATERIAL_LABEL: Record<string, string> = { "Weiß ich nicht": "Nicht bekannt" };
const UMBAU_LABEL: Record<string, string> = { flat_surface: "Fläche ist gerade und eben im Bereich der BWT", fixture_free: "Fläche ist frei von Armaturen", not_whirlpool: "Ist kein Whirlpool" };

async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bwt/bwt`);
  await screen.findByRole("heading", { name: "Badewanne — Bestandsaufnahme" });
  return structuredClone(offer());
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps) {
    if (kind === "shape") await user.click(screen.getByRole("radio", { name: a as string }));
    else if (kind === "umbau") await user.click(screen.getByRole("checkbox", { name: UMBAU_LABEL[a as string]! }));
    else if (kind === "material") await user.click(screen.getByRole("radio", { name: MATERIAL_LABEL[a as string] ?? (a as string) }));
    else if (kind === "door") await user.click(within(cardOf(a as string)).getByRole("checkbox"));
    else if (kind === "qty") fireEvent.change(within(cardOf(a as string)).getByLabelText(`Menge ${door(a as string).value}`), { target: { value: b } });
    else if (kind === "color") {
      const card = within(cardOf(a as string));
      if (a === "wien") fireEvent.change(card.getByLabelText("Farbe Individual Tür - Wien"), { target: { value: b } });
      else if (a === "glas") fireEvent.change(card.getByLabelText("Rahmen-Farbe"), { target: { value: b } });
      else await user.click(card.getByRole("radio", { name: COLOR_LABEL[b as string]! }));
    }
    else if (kind === "dim") fireEvent.change(within(cardOf(a as string)).getByLabelText(`${DIM_NAME[b as string]} ${door(a as string).value}`), { target: { value: c } });
    else if (kind === "anschlag") await user.click(screen.getByRole("radio", { name: a === "Links" ? "← Links" : "Rechts →" }));
    else if (kind === "grip") await user.click(screen.getByRole("checkbox", { name: `Haltegriff ${a} cm` }));
    else if (kind === "gripqty") fireEvent.change(screen.getByLabelText(`Menge Haltegriff ${a} cm`), { target: { value: b } });
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
const checked = (name: string) => (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? "";

describe("Badewannentür (slice 1) stores and shows what today's UI does", () => {
  it("a new offer starts with today's fields", async () => {
    const base = await open();
    expect(base.bwt).toEqual(reference.base);
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as (string | number)[][]);
    await waitFor(() => expect(changed(base.bwt, offer().bwt)).toEqual(scenario.bwt));
    const el = (scenario as { elsewhere?: Record<string, unknown> }).elsewhere ?? {};
    expect(Object.fromEntries(Object.keys(base).filter((k) => k !== "bwt" && !same(base[k], offer()[k])).map((k) => [k, changed(base[k] as never, offer()[k])]))).toEqual(el); // and nothing else changes

    const v = scenario.view as { shape: string; umbau: string[]; material: string; anschlag: string; steelNote: boolean;
      doors: { key: string; on: boolean; qty: string | null; color: string | null; dims: Record<string, string> }[]; grips: { n: number; on: boolean; qty: string | null }[] };
    expect(checked("bwtShape")).toBe(v.shape);
    expect(Object.keys(UMBAU_LABEL).filter((k) => (screen.getByRole("checkbox", { name: UMBAU_LABEL[k]! }) as HTMLInputElement).checked)).toEqual(v.umbau);
    expect(checked("bwtMaterial")).toBe(v.material);
    expect(checked("bwtAnschlag")).toBe(v.anschlag);
    expect(offer().bwt.bwtSteelNoteEnabled === "on").toBe(v.steelNote);
    expect(v.doors.map((x) => door(x.key)).map((d) => {
      const card = within(cardOf(d.key)), on = (card.getByRole("checkbox") as HTMLInputElement).checked;
      const qty = card.queryByLabelText(`Menge ${d.value}`) as HTMLInputElement | null;
      const color = d.colorKind === "pills" ? card.queryAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true")?.textContent
        : (card.queryByLabelText(d.colorKind === "text" ? "Rahmen-Farbe" : `Farbe ${d.value}`) as HTMLInputElement | null)?.value;
      const dims = Object.fromEntries(Object.keys(DIM_NAME).flatMap((f) => { const i = card.queryByLabelText(`${DIM_NAME[f]} ${d.value}`) as HTMLInputElement | null; return i ? [[f, i.value]] : []; }));
      const key = Object.entries(COLOR_LABEL).find(([, l]) => l === color)?.[0] ?? color;
      return { key: d.key, on, qty: on ? qty!.value : null, color: on ? key! : null, dims };
    })).toEqual(v.doors);
    expect(GRIPS.map((g) => { const cb = screen.getByRole("checkbox", { name: g.label }) as HTMLInputElement; return { n: g.n, on: cb.checked, qty: cb.checked ? (screen.getByLabelText(`Menge ${g.label}`) as HTMLInputElement).value : null }; })).toEqual(v.grips);
  });

  it("the document lines of the picked door follow the stored fields", () => {
    for (const s of reference.scenarios) expect(doorInfo({ ...reference.base, ...(s.bwt as Record<string, unknown>) })).toEqual({ ...reference.base, ...(s.bwt as Record<string, any>) }.doorInfoById);
  });
});
