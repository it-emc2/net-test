// Kosten (Kosten-Details) must show what today's UI does for the same price.
// Reference: fixtures/kosten.json, recorded from today's UI by v2/scripts/capture-kosten.cjs —
// every scenario with the price answer its page was drawn from. The page stores nothing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { eur, labelOf, percent, sections, stripBrand, sums } from "../src/features/steps/kosten/rules.js";
import reference from "./fixtures/kosten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
interface Line { subtitle?: string; id?: string; label?: string; tags?: string[]; qty?: string; unit?: string; total?: string }
interface Sec { num: string; title: string; head: string[]; rows: Line[]; empty: string; footer: string; sums: { note?: string; num?: string; label?: string; value?: string; rule?: boolean; total?: boolean }[] }
interface View { heading: string; text: string; sections: Sec[]; recompute: string }

async function open(price: unknown, type = "bu") {
  const server = fakeServer({ ...BASE, "POST /api/price": { body: price } });
  renderApp(`/deal/${KEY}/${type}/Kosten`);
  return server;
}
const shown = () => screen.getAllByTestId("kosten-section").map((sec) => ({
  num: part(sec, "num"), title: part(sec, "title"), head: within(sec).queryAllByRole("columnheader").map((h) => flat(h.textContent)),
  rows: Array.from(sec.querySelectorAll('[data-part="subtitle"], [data-testid="kosten-line"]')).map((r) => ((r as HTMLElement).dataset.part === "subtitle"
    ? { subtitle: flat(r.textContent) } : { id: (r as HTMLElement).dataset.lineId, label: part(r, "label"), tags: Array.from(r.querySelectorAll('[data-part="tag"]')).map((t) => flat(t.textContent)), qty: part(r, "qty"), unit: part(r, "unit"), total: part(r, "total") })),
  empty: part(sec, "empty"), footer: part(sec, "footer"),
}));

describe("Kosten shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const v = scenario.view as unknown as View;
    await open(scenario.price);
    await screen.findByRole("heading", { name: v.heading });
    expect(screen.getByText(v.text)).toBeTruthy();
    const lists = v.sections.filter((s) => s.title !== "Summen"), totals = v.sections.find((s) => s.title === "Summen")!;
    await waitFor(() => expect(shown()).toEqual(lists.map(({ sums: _s, ...sec }) => sec)));
    const box = screen.getByTestId("kosten-sums");
    expect(Array.from(box.querySelectorAll('[data-part="row"], [data-part="note"]')).map((r) => ((r as HTMLElement).dataset.part === "note"
      ? { note: flat(r.textContent) } : { num: part(r, "num"), label: part(r, "label"), value: part(r, "value"), rule: (r as HTMLElement).dataset.rule === "true", total: (r as HTMLElement).dataset.total === "true" }))).toEqual(totals.sums);
    expect(within(box).getByRole("button", { name: v.recompute })).toBeTruthy();
    expect(useOfferStore.getState().version).toBe(0); // looking at the page changes nothing in the offer
  });
});

describe("Kosten — rules and what goes beyond the recordings", () => {
  it("\"Preis neu berechnen\" asks the server for the price again", async () => {
    const server = await open(reference.scenarios[0]!.price);
    const button = await screen.findByRole("button", { name: "Preis neu berechnen" });
    const before = server.count("POST /api/price");
    await userEvent.setup().click(button);
    await waitFor(() => expect(server.count("POST /api/price")).toBe(before + 1));
  });

  it("the other offer types still use today's view for this step", async () => {
    await open({ total: 10 }, "bwt");
    expect(await screen.findByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toBeTruthy();
    expect(screen.queryByTestId("kosten-sums")).toBeNull();
  });

  it("a line left out of the markup is marked; a changed price shows today's difference, several of them their sum", () => {
    const price = {
      markupExemptIds: ["KM01"], services: { sum: 0, lines: [] },
      materials: { sum: 300, vigorPriceDrift: { totalDelta: -7.5, lines: [1, 2] }, lines: [
        { productId: "KM01", label: "- 1 Stk Kleinmaterial", qty: 1, unitPrice: 20, lineTotal: 20, category: "Kleinmaterial" },
        { productId: "V1", label: "- 2 Stk Paneel VIGOUR", qty: 2, unitPrice: 100, lineTotal: 200, currentNet: 110, category: "Wandverkleidung" },
        { productId: "V2", label: "Wanne", qty: 1.5, unit: "m²", unitPrice: 80, lineTotal: 80, currentNet: 62.5 },
      ] },
    };
    const material = sections(price)[2]!;
    expect(material.rows).toEqual([
      { subtitle: "KLEINMATERIAL" }, { id: "KM01", label: "- 1 Stk Kleinmaterial [KM01]", tags: [{ text: "ohne Aufschlag", kind: "plain" }], qty: "1", unit: eur(20), total: eur(20) },
      { subtitle: "WANDVERKLEIDUNG" }, { id: "V1", label: "- 2 Stk Paneel [V1]", tags: [{ text: `▲ +${eur(10)} heute`, kind: "up", title: `Angebotspreis ${eur(100)} — heute ${eur(110)}` }], qty: "2", unit: eur(100), total: eur(200) },
      { subtitle: "WEITERES" }, { id: "V2", label: "Wanne", tags: [{ text: `▼ −${eur(17.5)} heute`, kind: "down", title: `Angebotspreis ${eur(80)} — heute ${eur(62.5)}` }], qty: "1,5 m²", unit: eur(80), total: eur(80) },
    ]);
    expect(material.note).toEqual({ text: `Preis geändert: 2 Artikel kosten heute insgesamt −${eur(7.5)} gegenüber dem Angebot. Angebotspreise bleiben unverändert.`, up: false });
    expect(sections({ ...price, materials: { ...price.materials, vigorPriceDrift: { totalDelta: 10, lines: [1] } } })[2]!.note).toBeNull(); // one article says it on its own line
    expect(sections(null)).toEqual([]);
  });

  it("labels: brands are left out; the article number only for free items and older Hassmann picks", () => {
    expect([stripBrand("Haltegriff clivia plus VIGOUR 300mm"), labelOf({ productId: "A1", label: "- 1 Stk Sonderglas" }), labelOf({ productId: "A1", label: "Pendeltür Hassmann" }), labelOf({ productId: "HASS_1", label: "Pendeltür Hassmann" }), labelOf({ productId: "V9", label: "- 1 Stk Tür", source: "vigour_config" }), labelOf({ productId: "A1", label: "- 1 Stk X [A1]" }), labelOf({ name: "Nur Name" }), labelOf({})])
      .toEqual(["Haltegriff 300mm", "- 1 Stk Sonderglas [A1]", "Pendeltür Hassmann [A1]", "Pendeltür Hassmann", "- 1 Stk Tür", "- 1 Stk X [A1]", "Nur Name", "-"]);
    expect([percent(0.5), percent(0.375), percent(0.19), percent(undefined)]).toEqual(["50", "37,5", "19", "0"]);
  });

  it("the sums: the subtotal only when something is deducted; the grab-bar offer explained", () => {
    const base = { services: { sum: 1000 }, materials: { sum: 500 }, markup: 250, markupPct: 0.5, markupBase: 500, Nettobetrag: 1750, netAfterRabatt_and_Bonus: 1750, vatOnNet: 332.5, total: 2082.5 };
    expect(sums(base).map((r) => ("note" in r && r.note !== undefined ? r.note : `${r.num ?? ""}|${r.label}|${r.value}`))).toEqual([`I|Auszuführende Arbeiten:|${eur(1000)}`, `II|Material für Badumbau:|${eur(500)}`, `|Aufschlag (50% auf ${eur(500)}):|${eur(250)}`, `|Nettobetrag:|${eur(1750)}`, `|zzgl. 19% MwSt.:|${eur(332.5)}`, `|Gesamt (brutto):|${eur(2082.5)}`]);
    const all = sums({ ...base, optionalDisplayUI: { sum: 40 }, rabattAmount: 25, bonusGross: 250, grabBonusReal: 37.46, grabBonusMaterial: 87.5, grabBonusArbeit: 87.5 });
    expect(all.map((r) => ("note" in r && r.note !== undefined ? "note" : r.label))).toEqual(["Auszuführende Arbeiten:", "Material für Badumbau:", "Optionale Produkte:", `Aufschlag (50% auf ${eur(500)}):`, "Zwischensumme:", "Rabatt:", "Bonus / Gratis:", "note", "Nettobetrag:", "zzgl. 19% MwSt.:", "Gesamt (brutto):"]);
    expect((all[7] as { note: string }).note).toBe(`davon Aktion Haltegriff ${eur(37.46)} (Einkauf) · im Angebot: +${eur(87.5)} Material, +${eur(87.5)} Arbeit, −${eur(175)} Aktion — Nettobetrag gleich`);
    expect(sums(null)).toEqual([]);
  });
});
