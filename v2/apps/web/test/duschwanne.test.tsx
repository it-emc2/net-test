// Duschwanne (Badumbau) must store and show what today's UI does for the same inputs.
// Reference: fixtures/duschwanne.json, recorded from today's UI by v2/scripts/capture-duschwanne.cjs
// (with the answers of the tray search, so the same product lists are replayed here).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { arbeitenChanges, chooseKind, toggleTask } from "../src/features/steps/arbeiten/rules.js";
import { cheaper, parseDim, searches, shortTrayName, stockText, trayOn } from "../src/features/steps/duschwanne/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/duschwanne.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const CUSTOM: Record<string, string> = { dwCustomName: "Bezeichnung", dwCustomPrice: "Preis", dwCustomQty: "Menge", dwCustomId: "ID" };
const SEARCHES: Record<string, Reply> = Object.fromEntries(Object.entries(reference.searches).map(([q, results]) => [`GET /api/trays/suggest?${q}`, { body: { results } }]));

async function open() {
  const server = fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config }, ...SEARCHES });
  renderApp(`/deal/${KEY}/bu/Duschwanne`);
  await screen.findByRole("heading", { name: "Duschwanne" });
  return { base: structuredClone(offer()), server };
}
const settled = () => waitFor(() => expect(screen.queryByText("Suche…")).toBeNull());
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    const o = offer();
    if (kind === "kind") useOfferStore.getState().patchAll(arbeitenChanges(o, chooseKind(o.duschwanne, String(a)))); // chosen on the Arbeiten step
    else if (kind === "task") useOfferStore.getState().patchAll(arbeitenChanges(o, toggleTask(o.duschwanne, String(a), !(o.duschwanne.workTasks ?? []).includes(a))));
    else if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Duschwanne" }));
    else if (kind === "tier") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: a === "standard" ? /^Standard/ : /^Premium/ }));
    else if (kind === "dims") { fireEvent.change(screen.getByLabelText("Breite in cm"), { target: { value: a } }); fireEvent.change(screen.getByLabelText("Länge in cm"), { target: { value: b } }); }
    else if (kind === "pick") await user.click(screen.getAllByTestId("tray-card").filter((c) => c.dataset.pinned !== "true")[Number(a) - 1]!.querySelector("input")!);
    else if (kind === "color") await user.click(screen.getByRole("group", { name: "Farbe der Duschwanne Slate" }).querySelector(`input[value="${a}"]`)!);
    else if (kind === "acc") await user.click(screen.getByTestId(`acc-${a}`).querySelector("input")!);
    else if (kind === "qty") await user.click(screen.getByRole("button", { name: a === "+" ? "Mehr" : "Weniger" }));
    else if (kind === "hint") await user.click(screen.getByRole("switch", { name: "Hinweis zu möglichen Zusatzkosten einblenden" }));
    else if (kind === "cheaper") await user.click(screen.getByRole("button", { name: "Auf Standard wechseln" }));
    else if (kind === "restore") await user.click(screen.getByRole("button", { name: "Vorherige Maße zurück" }));
    else if (kind === "custom") { (screen.getByTestId("tray-custom") as HTMLDetailsElement).open = true; /* the user opens the section to type */ const el = screen.getByLabelText(CUSTOM[a as string]!, { exact: true }); await user.clear(el); await user.type(el, String(b)); }
    else throw new Error(`step not handled: ${kind}`);
    await settled();
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => k !== "computed" && !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => squeeze(el.querySelector(`[data-part="${name}"]`)?.textContent);

describe("Duschwanne stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base } = await open();
    await play(scenario.steps);
    await waitFor(() => expect(changed(base.duschwanne, offer().duschwanne)).toEqual(scenario.duschwanne));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit);

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Duschwanne" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByRole("group", { name: "Produktlinie wählen" })).toBe(v.settingsShown);
    if (!v.on) { // off: only the switch is on the page
      expect(screen.queryAllByTestId("tray-card")).toHaveLength(0);
      expect(screen.queryByTestId("tray-custom")).toBeNull();
      return;
    }
    expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(v.tier === "standard" ? /^Standard/ : /^Premium/);
    expect(screen.getByTestId("tier-line").textContent).toBe(v.tierLine);
    expect((screen.getByRole("switch", { name: "Hinweis zu möglichen Zusatzkosten einblenden" }) as HTMLInputElement).checked).toBe(v.hint);
    expect([(screen.getByLabelText("Breite in cm") as HTMLInputElement).value, (screen.getByLabelText("Länge in cm") as HTMLInputElement).value]).toEqual(v.dims);

    // the same trays in the same order, with the same texts, the same one picked
    expect(screen.queryAllByTestId("tray-heading").map((h) => h.textContent!.toUpperCase())).toEqual(v.headings.map((h) => h.toUpperCase()));
    expect(screen.queryAllByTestId("tray-card").map((c) => ({ id: c.dataset.id, title: part(c, "title"), sub: part(c, "sub"), price: part(c, "price"), selected: c.dataset.selected === "true", pinned: c.dataset.pinned === "true" })))
      .toEqual(v.cards.map((c) => ({ ...c, title: squeeze(c.title), sub: squeeze(c.sub), price: squeeze(c.price) })));
    expect(screen.queryAllByTestId("tray-note").map((n) => squeeze(n.textContent))).toEqual(v.notes.map(squeeze));
    expect(squeeze(screen.queryByTestId("tray-cheaper")?.textContent)).toBe(squeeze(v.cheaper));

    expect(!!screen.queryByRole("group", { name: "Farbe der Duschwanne Slate" })).toBe(v.colorShown);
    if (v.colorShown) expect((screen.getByRole("group", { name: "Farbe der Duschwanne Slate" }).querySelector("input:checked") as HTMLInputElement).value).toBe(v.color);
    expect(v.accessories.map((a) => { const row = screen.getByTestId(`acc-${a.name}`); return { name: a.name, shown: true, checked: row.querySelector("input")!.checked, caption: row.querySelector('[data-part="caption"]')!.textContent, small: row.querySelector('[data-part="small"]')!.textContent }; })).toEqual(v.accessories);
    expect(!!screen.queryByTestId("stelzlager-qty")).toBe(v.qtyShown);
    if (v.qtyShown) expect((screen.getByLabelText("Anzahl Stelzlager") as HTMLInputElement).value).toBe(v.qty);

    const custom = screen.getByTestId("tray-custom") as HTMLDetailsElement;
    expect([custom.open, custom.querySelector("summary")!.textContent]).toEqual([v.customOpen, v.customTitle]);
    expect(Object.fromEntries(Object.entries(CUSTOM).map(([k, label]) => [k, (screen.getByLabelText(label, { exact: true }) as HTMLInputElement).value]))).toEqual(v.custom);
    expect(squeeze(screen.queryByTestId("tray-summary")?.textContent).replace(/^IhreAuswahl/, "")).toBe(squeeze(v.summary));
  });
});

describe("Duschwanne — rules", () => {
  it("the search asks both lines for the size, like today", async () => {
    const { server } = await open();
    await play([["on"], ["dims", "90", "120"]]);
    expect(server.calls.map((c) => c.key).filter((k) => k.includes("/api/trays/suggest")).sort()).toEqual(["GET /api/trays/suggest?w=90&l=120&series=SLA", "GET /api/trays/suggest?w=90&l=120&source=badolux"]);
    expect(searches("", "")).toBeNull();
    expect([parseDim("90"), parseDim("90,5"), parseDim("0"), parseDim("x")]).toEqual([90, 90.5, null, null]);
  });

  it("an older offer without the switch: on exactly when something of the tray is in it", () => {
    expect([trayOn({}), trayOn({ smallMaterial: "Kleinmaterial" }), trayOn({ chosenTrayProductId: "SLA12090" }), trayOn({ trayEnabled: false, chosenTrayProductId: "SLA12090" })]).toEqual([false, true, true, false]);
  });

  it("names, stock and the cheaper offer", () => {
    expect(shortTrayName("Duschwanne Slate 120x90x3cm Mineralguss weiss Nuovvo")).toBe("Slate 120 × 90 × 3 cm, Mineralguss weiß");
    expect([stockText({ productId: "a" }), stockText({ productId: "a", stockQuantity: 0, stockSymbol: 6 })?.text, stockText({ productId: "a", stockQuantity: 0, stockSymbol: 1 })?.text]).toEqual([null, "Zentrallager 24 h", "Auf Bestellung"]);
    const premium = { productId: "SLA12090", price: 368.55, widthCm: 120, lengthCm: 90 };
    expect(cheaper(premium, [{ productId: "DW015", price: 138.8, widthCm: 90, lengthCm: 120, heightCm: 2.6 }])?.tray.productId).toBe("DW015"); // same size, the other way round
    expect(cheaper(premium, [{ productId: "DW9", price: 400, widthCm: 90, lengthCm: 120 }])).toBeNull();
  });

  it("picking a tray is ONE change of the offer", async () => {
    await open();
    await play([["on"], ["dims", "90", "120"]]);
    const before = useOfferStore.getState().version;
    await play([["pick", 1]]);
    expect(useOfferStore.getState().version).toBe(before + 1);
  });
});
