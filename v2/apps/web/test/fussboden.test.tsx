// Fußboden (Badumbau) must store and show what today's UI does for the same inputs.
// Reference: fixtures/fussboden.json, recorded from today's UI by v2/scripts/capture-fussboden.cjs
// (with the answers of the price list and the panel lines of the price, replayed here).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { adhesivePacks, calcTotal, panelsFrom, sealingFor, standardTiles } from "../src/features/steps/fussboden/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/fussboden.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const PRODUCTS: Record<string, Reply> = {
  ...Object.fromEntries(Object.entries(reference.products).filter(([, p]) => "price" in p).map(([id, p]) => [`GET /api/products/${id}`, { body: p }])),
  "GET /api/products?prefix=BP&source=badolux&limit=200": { body: reference.standardFloors },
};
type Scenario = (typeof reference.scenarios)[number];

async function open(lines: unknown[] = []) {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config }, ...PRODUCTS, "POST /api/price": { body: { total: 10, selfPayAmount: 0, materials: { lines } } } });
  const router = renderApp(`/deal/${KEY}/bu/Fussboden`);
  await screen.findByRole("heading", { name: "Fußboden" });
  return { base: structuredClone(offer()), router };
}
const tile = (n: number) => screen.getAllByTestId("fb-tile")[n]!.querySelector("input")!;
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps) {
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Fußboden" }));
    else if (kind === "tab") await user.click(screen.getByRole("tab", { name: a === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden" }));
    else if (kind === "tier") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: a === "standard" ? /^Standard/ : /^Premium/ }));
    else if (kind === "confirm") await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: a === "yes" ? /umstellen$/ : "Abbrechen" }));
    else if (kind === "kind") await user.click(screen.getByRole("group", { name: "Umfang" }).querySelector(`input[value="${a}"]`)!);
    else if (kind === "area") fireEvent.change(screen.getByLabelText("Fläche in m²"), { target: { value: a } });
    else if (kind === "color") await user.click(screen.getAllByTestId("fb-tile").find((t) => t.dataset.value!.endsWith(`|${a}`))!.querySelector("input")!);
    else if (kind === "budget") { await waitFor(() => expect(screen.getAllByTestId("fb-tile").length).toBe(reference.standardFloors.length)); await user.click(tile(Number(a) - 1)); }
    else if (kind === "acc") await user.click(screen.getByRole("checkbox", { name: a === "adhesive" ? /^Flächenkleber/ : /^Bodenabdichtung/ }));
    else if (kind === "calc") await user.click(screen.getByRole("button", { name: /^Flächenrechner/ }));
    else if (kind === "row") { fireEvent.change(screen.getByLabelText(`Länge ${a} in m`), { target: { value: b } }); fireEvent.change(screen.getByLabelText(`Breite ${a} in m`), { target: { value: c } }); }
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Zeile hinzufügen" }));
    else if (kind === "sign") await user.click(screen.getAllByTestId("fb-calc-row")[Number(a) - 1]!.querySelector("button")!);
    else if (kind === "row-") await user.click(screen.getByRole("button", { name: `Zeile ${a} entfernen` }));
    else if (kind === "apply") await user.click(screen.getByRole("button", { name: "In Fläche übernehmen" }));
    else if (kind === "next") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else throw new Error(`step not handled: ${kind}`);
    // the Standard coverings come from the price list: wait for them where the line is Standard
    if (kind === "tier" && a === "standard" && !screen.queryByRole("alertdialog")) await waitFor(() => expect(screen.getAllByTestId("fb-tile").length).toBe(reference.standardFloors.length));
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const tiles = () => screen.queryAllByTestId("fb-tile").map((t) => ({ value: t.dataset.value, caption: t.querySelector('[data-part="caption"]')!.textContent, checked: t.querySelector("input")!.checked }));

describe("Fußboden stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario: Scenario) => {
    const { base, router } = await open(scenario.priceLines);
    const steps = scenario.steps.filter(([kind]) => kind !== "next");
    await play(steps);
    // `computed` is compared on its own: today's page starts with the unit prices not yet read,
    // so its recorded "before" differs from a new offer's
    const { computed, ...fields } = scenario.duschwanne as Record<string, unknown>;
    await waitFor(() => expect(without(changed(base.duschwanne, offer().duschwanne), "computed")).toEqual(fields));
    if (computed) expect(offer().duschwanne.computed).toEqual(computed);
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit);

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Fußboden" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByRole("tablist")).toBe(v.tabs);
    if (v.tabs) expect(screen.getByRole("tab", { selected: true }).textContent).toBe(v.tab === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden");
    expect(!!screen.queryByRole("group", { name: "Produktlinie wählen" })).toBe(v.floorShown);
    if (v.floorShown) {
      expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(v.tier === "standard" ? /^Standard/ : /^Premium/);
      expect(screen.getByTestId("fb-tier-line").textContent).toBe(v.tierLine);
      expect((screen.getByRole("group", { name: "Umfang" }).querySelector("input:checked") as HTMLInputElement | null)?.value ?? "").toBe(v.kind);
      expect((screen.getByLabelText("Fläche in m²") as HTMLInputElement).value).toBe(v.area);
      expect(screen.getByRole("button", { name: /^Flächenrechner/ }).textContent).toBe(v.calcToggle);
      expect(!!screen.queryByTestId("fb-calc")).toBe(v.calcOpen);
      if (v.calcOpen) {
        expect(screen.getByTestId("fb-calc-total").textContent).toBe(v.calcTotal);
        expect(screen.getAllByTestId("fb-calc-row").map((r, i) => ({ sign: r.querySelector("button")!.textContent, length: (screen.getByLabelText(`Länge ${i + 1} in m`) as HTMLInputElement).value, width: (screen.getByLabelText(`Breite ${i + 1} in m`) as HTMLInputElement).value, area: r.querySelector('[data-part="area"]')!.textContent })))
          .toEqual(v.calcRows);
      }
      expect(tiles()).toEqual(v.premiumShown ? v.premium : v.standard); // the coverings of the active line, the same one picked
      await waitFor(() => expect(screen.getByTestId("fb-panels").textContent).toBe(v.panels)); // from the price
      expect([(screen.getByRole("checkbox", { name: /^Flächenkleber/ }) as HTMLInputElement).checked, screen.getByTestId("fb-adhesive-hint").textContent]).toEqual([v.adhesive.checked, v.adhesive.hint]);
      expect([(screen.getByRole("checkbox", { name: /^Bodenabdichtung/ }) as HTMLInputElement).checked, screen.getByTestId("fb-sealing-hint").textContent]).toEqual([v.sealing.checked, v.sealing.hint]);
      await waitFor(() => expect(squeeze(screen.queryByTestId("fb-summary")?.textContent).replace(/^IhreAuswahl/, "")).toBe(squeeze(v.summary)));
    }

    if ("next" in scenario && scenario.next) { // "Weiter": goes on, or says what is missing
      await play([["next"]]);
      await waitFor(() => expect(router.state.location.pathname.split("/")[4]).toBe(scenario.next!.step));
      if (scenario.next.alerts.length) expect(await screen.findByText(new RegExp(`^${scenario.next.alerts[0]!.replace(/\.$/, "")}`))).toBeInTheDocument();
    }
  });
});

describe("Fußboden — rules", () => {
  it("changing the line asks only when the user picked the covering, and names it", async () => {
    await open();
    await play([["on"], ["area", "5"], ["color", "Loft-Grau"], ["tier", "standard"]]);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Fußboden auf „Standard\" umstellen?");
    expect(dialog.textContent).toContain("Die bisherige Auswahl „Loft-Grau\" gehört zur Linie Premium und wird entfernt.");
  });

  it("quantities: adhesive per 0,6 m², sealing set for 7 m² and a roll per further 5 m² (with 15 % offcut)", () => {
    expect([0, 0.6, 0.61, 4.5, 12.5].map(adhesivePacks)).toEqual([0, 1, 2, 8, 21]);
    expect([sealingFor(4, true), sealingFor(12, true), sealingFor(12, false)].map((s) => [s.sets, s.rolls])).toEqual([[1, 0], [1, 2], [0, 0]]);
    expect(calcTotal([{ subtract: false, length: "3.2", width: "1.8" }, { subtract: true, length: "10", width: "10" }])).toBe(0); // never below 0
  });

  it("the Standard coverings are the Badolux plates of the price list; the panels are what the price says", () => {
    expect(standardTiles([{ productId: "BP002", name: "Hydroträgerplatte grau", source: "badolux" }, { productId: "BP001", name: "Hydroträgerplatte steingrau", source: "Badolux" }, { productId: "XX1", name: "x", source: "badolux" }, { productId: "BP9", name: "y", source: "other" }]).map((t) => [t.value, t.caption]))
      .toEqual([["BP001|Hydroträgerplatte steingrau", "steingrau"], ["BP002|Hydroträgerplatte grau", "grau"]]);
    const price = { materials: { lines: [{ productId: "V5FB02", label: "Fußboden individ. 5.0", qty: 3 }, { productId: "V5FB02", label: "- 18 Stk Fußboden-Paneele", qty: 18 }] } };
    expect([panelsFrom(price, { flooringProduct: ["V5FB02|Lava-Beige"] }), panelsFrom(price, {}), panelsFrom(null, {})]).toEqual([18, 18, 0]);
  });

  it("typing the area is ONE change of the offer", async () => {
    await open();
    await play([["on"]]);
    const before = useOfferStore.getState().version;
    await play([["area", "4,5"]]);
    expect(useOfferStore.getState().version).toBe(before + 1);
  });
});
