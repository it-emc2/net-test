// Wandverkleidung (Badumbau) must store and show what today's UI does for the same inputs.
// Reference: fixtures/wandverkleidung.json, recorded from today's UI by
// v2/scripts/capture-wandverkleidung.cjs (frame and the line winwall).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { WW_DECORS } from "../src/features/steps/wandverkleidung/decors.js";
import { ACCESSORIES, areaOf, chooseLine, decorCode, fromRows, rowsOf, sealing } from "../src/features/steps/wandverkleidung/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/wandverkleidung.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const LINE: Record<string, RegExp> = { ww: /^winwall/, premium: /^VIGOUR/, standard: /^Badolux/ };
const caption = (sku: string) => ACCESSORIES.find((a) => a.id === sku)!.caption;

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
  const router = renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return { base: structuredClone(offer()), router };
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "line") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: LINE[a as string]! }));
    else if (kind === "kind") await user.click(screen.getByRole("group", { name: "Ausführung" }).querySelector(`input[value="${a}"]`)!);
    else if (kind === "shower") await user.click(screen.getByRole("checkbox", { name: /^Im Duschbereich bis Höhe/ }));
    else if (kind === "height") fireEvent.change(screen.getByLabelText("Höhe in cm"), { target: { value: a } });
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Dekor und Format)" }));
    else if (kind === "row") await user.click(screen.getAllByTestId("wv-row")[Number(a) - 1]!.querySelector("button")!);
    else if (kind === "decor") await user.click(screen.getByTestId("wv-decors").querySelector(`input[value="${a}"]`)!);
    else if (kind === "custom") { const el = screen.getByLabelText("Dekor-Nummer"); await user.clear(el); await user.type(el, String(a)); }
    else if (kind === "fmt") await user.selectOptions(screen.getByLabelText(`Format Zeile ${a}`), String(b));
    else if (kind === "qty") await user.click(screen.getByRole("button", { name: `Zeile ${a}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "row-") await user.click(screen.getByRole("button", { name: `Zeile ${a} entfernen` }));
    else if (kind === "acc") await user.click(screen.getByTestId(`wv-acc-${a}`).querySelector('input[type="checkbox"]')!);
    else if (kind === "accqty") await user.click(screen.getByRole("button", { name: `Menge ${caption(String(a))}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "seal") await user.click(screen.getByTestId("wv-acc-sealing").querySelector('input[type="checkbox"]')!);
    else if (kind === "sealqty") fireEvent.change(screen.getByLabelText("Menge Abdichtungsset (leer = nach Wandfläche)"), { target: { value: a } });
    else if (kind === "cut") await user.click(screen.getByTestId("wv-acc-cut").querySelector('input[type="checkbox"]')!);
    else if (kind === "next") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const text = (el: Element, part: string) => el.querySelector(`[data-part="${part}"]`)?.textContent ?? "";

describe("Wandverkleidung stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base, router } = await open();
    await play(scenario.steps.filter(([kind]) => kind !== "next"));
    expect(changed(base.wandverkleidung, offer().wandverkleidung)).toEqual(scenario.wandverkleidung);
    expect(changed(base.duschwanne, offer().duschwanne)).toEqual(scenario.duschwanne);
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit);

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Wandverkleidung" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByRole("group", { name: "Produktlinie wählen" })).toBe(v.on); // off: only the switch
    if (v.on) {
      expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(LINE[v.line]!);
      expect(screen.getByTestId("wv-line-text").textContent).toBe(v.lineText);
      expect((screen.getByRole("group", { name: "Ausführung" }).querySelector("input:checked") as HTMLInputElement | null)?.value ?? "").toBe(v.kind);
      expect([(screen.getByRole("checkbox", { name: /^Im Duschbereich bis Höhe/ }) as HTMLInputElement).checked, (screen.getByLabelText("Höhe in cm") as HTMLInputElement).value]).toEqual([v.shower, v.height]);
    }
    if (v.on && v.line === "ww") {
      expect(screen.queryAllByTestId("wv-row").map((r) => ({ title: text(r, "title"), small: text(r, "note"), fmt: r.querySelector("select")!.value, qty: text(r, "qty"), open: r.dataset.open === "true" }))).toEqual(v.rows);
      expect(screen.queryByText("Noch keine Platten. Mit „+ Zeile hinzufügen“ beginnen.")?.textContent ?? "").toBe(v.rowsEmpty);
      expect(!!screen.queryByTestId("wv-decors")).toBe(v.decorsShown);
      if (v.decorsShown) {
        expect((screen.getByTestId("wv-decors").querySelector("input:checked") as HTMLInputElement).value).toBe(v.decor);
        expect(text(screen.getByTestId("wv-decors"), "custom-caption")).toBe(v.customCaption);
        expect(!!screen.queryByTestId("wv-custom")).toBe(v.customShown);
        if (v.customShown) expect([(screen.getByLabelText("Dekor-Nummer") as HTMLInputElement).value, screen.getByTestId("wv-custom-hint").textContent]).toEqual([v.custom, v.customHint]);
      }
      // accessories: the same switches, quantities and texts
      expect(screen.getByTestId("wv-acc-label").textContent!.toUpperCase()).toBe(v.accLabel.toUpperCase());
      const rowOf = (id: string) => screen.getByTestId(id === "wvWwSealing" ? "wv-acc-sealing" : id === "wvWwCut" ? "wv-acc-cut" : `wv-acc-${id.replace("wvWw_", "")}`);
      expect(v.acc.map((a) => { const row = rowOf(a.id), q = row.querySelector('input[type="number"]') as HTMLInputElement | null; return { id: a.id, shown: true, checked: (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, qty: q ? q.value : null, placeholder: q ? q.placeholder : null, caption: text(row, "caption"), small: squeeze(text(row, "small")) }; }))
        .toEqual(v.acc.map((a) => ({ ...a, small: squeeze(a.small) })));
    }
    if ("next" in scenario && scenario.next) { // today nothing is asked for on this step
      await play([["next"]]);
      await waitFor(() => expect(router.state.location.pathname.split("/")[4]).toBe(scenario.next!.step));
    }
  });

  it("the decor tiles are today's", () => {
    expect(WW_DECORS.map((d) => ({ ...d }))).toEqual(reference.decors.filter((d) => d.value !== "custom").map(({ value, caption }) => ({ value, caption })));
  });
});

describe("Wandverkleidung — rules", () => {
  it("a decor number: WS or NW with three digits; digits alone are WS", () => {
    expect(["WS 233", "nw230", "203", "XY", "WS12", ""].map(decorCode)).toEqual(["WS233", "NW230", "WS203", null, null, null]);
  });

  it("the rows give the plates per format and the suggestions; a row without a decor counts nothing", () => {
    const f = fromRows([{ code: "WS203", fmt: "15", qty: 2 }, { code: null, fmt: "16", qty: 5, custom: true, text: "XY" }, { code: "NW220", fmt: "17", qty: 1 }]);
    expect([f.wvWwQty_15, f.wvWwQty_16, f.wvWwQty_17, f.wvWwQty_R_4260602, f.wvWwQty_WS80113, f.wvWw_WS80113]).toEqual(["2", "0", "1", "6", "2", "on"]);
    expect(rowsOf({ wvWwRows: String(f.wvWwRows) })).toHaveLength(3);
    expect(rowsOf({ wvWwRows: "not json" })).toEqual([]);
  });

  it("sealing: one 6,25 m² set between 5 and 6,25 m², otherwise 5 m² sets", () => {
    expect([sealing({}, areaOf([{ code: "WS203", fmt: "15", qty: 1 }])).auto, sealing({}, areaOf([{ code: "WS203", fmt: "17", qty: 1 }, { code: "WS203", fmt: "15", qty: 1 }])).hint, sealing({}, 0).auto]).toEqual([1, "nach Plattenfläche 6,25 m² → 1 × 6,25 m² · automatisch", 0]);
  });

  it("a line that is left keeps its entries for the way back", () => {
    const wv = { wvSupplier: "ww", wvWwRows: "[1]", wvWwQty_15: "2", wvWwSealing: "on", wvWwCut: "on" };
    const there = chooseLine(wv, "standard", {});
    expect([there.changes.wvBudgetMode, there.changes.wvWwRows, there.changes.wvWwCut, "wvWwSealing" in there.changes]).toEqual(["1", undefined, undefined, false]); // Badolux keeps winwall's accessories
    const back = chooseLine({ wvSupplier: "ww", wvBudgetMode: "1", wvWwSealing: "on" }, "ww", there.parked);
    expect([back.changes.wvWwRows, back.changes.wvWwQty_15, back.changes.wvBudgetMode]).toEqual(["[1]", "2", undefined]);
  });

  it("a change of the rows is ONE change of the offer", async () => {
    await open();
    await play([["on"], ["row+"]]);
    const before = useOfferStore.getState().version;
    await play([["qty", 1, "+"]]);
    expect(useOfferStore.getState().version).toBe(before + 1);
  });
});
