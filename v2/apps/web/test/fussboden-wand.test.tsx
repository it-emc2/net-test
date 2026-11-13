// Fußboden, mode "Wandverkleidung als Fußboden", must store and show what today's UI does for
// the same inputs. Reference: fixtures/fussboden-wand.json, recorded from today's UI by
// v2/scripts/capture-fussboden-wand.cjs (with the answers of the price list the page asked for).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { suggestion as workTime } from "../src/features/steps/arbeiten/rules.js";
import * as w from "../src/features/steps/fussboden/wand.js";
import { VG_COLORS } from "../src/features/steps/wandverkleidung/colors.js";
import { WW_DECORS } from "../src/features/steps/wandverkleidung/decors.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/fussboden-wand.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const WALL: Record<string, string> = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
const SERVER: Record<string, Reply> = {
  ...BASE, "GET /admin/api/config/public": { body: { ...arbeiten.config, WV_OWN_LAGER: { V3WVK09: 5, V3WV09: 5 } } },
  ...Object.fromEntries(Object.entries(reference.prices).map(([q, body]) => [`GET /api/vigor-prices?${q}`, { body }])),
  ...Object.fromEntries(Object.entries(reference.products).filter(([, p]) => "price" in p).map(([id, body]) => [`GET /api/products/${id}`, { body }])),
};

async function open() {
  fakeServer(SERVER);
  const router = renderApp(`/deal/${KEY}/bu/Fussboden`);
  await screen.findByRole("heading", { name: "Fußboden" });
  return { base: structuredClone(offer()), router };
}
const wall = (key: unknown) => screen.getAllByTestId("kc-wall").find((x) => x.dataset.wall === key)!;
async function play(steps: (string | number)[][], router: Awaited<ReturnType<typeof open>>["router"]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps) {
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Fußboden" }));
    else if (kind === "tab") await user.click(screen.getByRole("tab", { name: a === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden" }));
    else if (kind === "sup") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: a === "ww" ? /^winwall/ : /^VIGOUR/ }));
    else if (kind === "kind") await user.click(screen.getByRole("radio", { name: a === "Fehlstellen" ? "Nur Fehlstellen" : "Gesamter Badboden" }));
    else if (kind === "area") fireEvent.change(screen.getByLabelText("Fläche (m²)"), { target: { value: a } });
    else if (kind === "decor") await user.click(screen.getByTestId("wc-decors").querySelector(`label[data-value="${a}"]`)!);
    else if (kind === "custom") fireEvent.change(screen.getByLabelText("Dekor-Nummer"), { target: { value: a } });
    else if (kind === "color") await user.click(screen.getByTestId("wc-colors").querySelector(`label[data-value="${a}"]`)!);
    else if (kind === "card") await user.click(screen.getAllByTestId("wc-card").find((x) => x.dataset.size === a)!);
    else if (kind === "qty") fireEvent.change(screen.getByLabelText("Anzahl Paneele (Stück)"), { target: { value: a } });
    else if (kind === "rest") await user.click(screen.getByRole("switch", { name: "Reste aus Wandverkleidung anrechnen" }));
    else if (kind === "calc") await user.click(screen.getByRole("button", { name: /^Flächenrechner/ }));
    else if (kind === "row") { fireEvent.change(screen.getByLabelText(`Länge ${a} in m`), { target: { value: b } }); fireEvent.change(screen.getByLabelText(`Breite ${a} in m`), { target: { value: c } }); }
    else if (kind === "apply") await user.click(screen.getByRole("button", { name: "In Fläche übernehmen" }));
    else if (kind === "next") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else if (kind === "goto") { await router.navigate(`/deal/${KEY}/bu/${a}`); await screen.findByRole("heading", { name: a === "Fussboden" ? "Fußboden" : String(a) }); }
    else if (kind === "wvon") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "wvline") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: /^VIGOUR/ }));
    else if (kind === "wvwidth") fireEvent.change(screen.getByLabelText(`Breite ${WALL[a as string]} in cm`), { target: { value: b } });
    else if (kind === "wvwall") await user.click(screen.getByRole("button", { name: `Dekor für ${WALL[a as string]} wählen` }));
    else if (kind === "wvdecor") await user.click(wall(a).querySelector(`[data-testid="kc-tiles"] button[data-value="${(wall(a).querySelectorAll('[data-testid="kc-tiles"] button')[Number(b) - 1] as HTMLElement).dataset.value}"]`)!);
    else if (kind === "use") { await user.click(await screen.findByRole("button", { name: "Als Fußboden verwenden" })); await screen.findByRole("heading", { name: "Fußboden" }); }
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
interface Tile { value: string; caption: string; checked: boolean; disabled: boolean }
interface View {
  on: boolean; tab: string; shown: boolean; supplier: string; kind: string; rest: { shown: boolean; hint: string; checked: boolean; note: string }; area: string; calcOpen: boolean; calcToggle: string;
  decorShown: boolean; decors: Tile[]; customShown: boolean; custom: string; customHint: string; customKind: string; colorsShown: boolean; colors: Tile[];
  cardsShown: boolean; cards: { size: string; qty: string; title: string; best: boolean; selected: boolean; count: string; coverage: string; price: string; unit: string; label: string }[];
  qtyShown: boolean; qty: string; selection: { name: string; meta: string; price: string; badges: string; img: string }[]; step: string; wall: { rest: string; button: string };
}
const tiles = (testId: string): Tile[] => Array.from(screen.getByTestId(testId).querySelectorAll("label[data-value]")).map((l) => { const i = l.querySelector("input")!; return { value: (l as HTMLElement).dataset.value!, caption: part(l, "caption"), checked: i.checked, disabled: i.disabled }; });

describe("Wandverkleidung als Fußboden stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base, router } = await open();
    await play(scenario.steps as (string | number)[][], router);
    const v = scenario.view as unknown as View, next = (scenario as { next?: { step: string } }).next;
    // `computed` belongs to the mode Fußboden and is valued with the price list there (fussboden.test.tsx)
    const mine = ({ computed: _c, ...rest }: Record<string, unknown>) => rest;
    await waitFor(() => expect(mine(changed(base.duschwanne, offer().duschwanne))).toEqual(mine(scenario.duschwanne)));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit); // the floor in the work-time suggestion
    if (next) { await waitFor(() => expect(router.state.location.pathname.split("/").pop()).toBe(next.step)); return; } // today this mode asks for nothing
    expect(router.state.location.pathname.split("/").pop()).toBe(v.step);

    expect((screen.getByRole("switch", { name: "Fußboden" }) as HTMLInputElement).checked).toBe(v.on);
    if (!v.on) return; // off: only the switch
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(v.tab === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden");
    expect(!!screen.queryByLabelText("Fläche (m²)") && v.tab === "wall").toBe(v.shown);
    if (!v.shown) return; // the other mode has its own test
    expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(v.supplier === "ww" ? /^winwall/ : /^VIGOUR/);
    expect((screen.queryByRole("radio", { checked: true, name: /^(Nur Fehlstellen|Gesamter Badboden)$/ }) as HTMLInputElement | null)?.value ?? "").toBe(v.kind);
    // the rest of the wall cladding. Today its row is always visible (a styling slip); React shows it while there is a rest
    // (and its text is only brought up to date with the next change of the area — React shows it at once)
    const rest = screen.queryByTestId("wc-rest");
    expect(!!rest).toBe(v.wall.rest !== "");
    if (rest) expect((within(rest).getByRole("switch") as HTMLInputElement).checked).toBe(v.rest.checked);
    if (rest && v.rest.hint) expect(part(rest, "hint")).toBe(v.rest.hint);
    expect(flat(screen.queryByTestId("wc-rest-note")?.textContent)).toBe(v.rest.note);
    expect([(screen.getByLabelText("Fläche (m²)") as HTMLInputElement).value, !!screen.queryByTestId("fb-calc")]).toEqual([v.area, v.calcOpen]);
    expect(!!screen.queryByTestId("wc-decors")).toBe(v.decorShown);
    if (v.decorShown) {
      expect(tiles("wc-decors")).toEqual(v.decors);
      const custom = screen.queryByTestId("wc-custom");
      expect(!!custom).toBe(v.customShown);
      if (custom) expect([(within(custom).getByLabelText("Dekor-Nummer") as HTMLInputElement).value, part(custom, "hint"), custom.querySelector<HTMLElement>('[data-part="hint"]')!.dataset.kind]).toEqual([v.custom, v.customHint, v.customKind]);
    }
    expect(!!screen.queryByTestId("wc-colors")).toBe(v.colorsShown);
    if (v.colorsShown) expect(tiles("wc-colors")).toEqual(v.colors);
    await waitFor(() => expect(screen.queryAllByTestId("wc-card").map((c) => ({ size: c.dataset.size, qty: c.dataset.qty, title: part(c, "title"), best: !!c.querySelector('[data-part="best"]'), selected: c.getAttribute("aria-pressed") === "true", count: part(c, "count"), coverage: part(c, "coverage"), price: part(c, "price"), unit: part(c, "unit"), label: part(c, "label") }))).toEqual(v.cards));
    const qty = screen.queryByLabelText("Anzahl Paneele (Stück)") as HTMLInputElement | null;
    expect(!!qty).toBe(v.qtyShown);
    if (qty) expect(qty.value).toBe(v.qty);
    await waitFor(() => expect(screen.queryAllByTestId("wc-selected").map((r) => ({ name: part(r, "name"), meta: part(r, "meta"), price: part(r, "price"), badges: squeeze(part(r, "badges")), img: r.querySelector("img")?.getAttribute("src") ?? "" })))
      .toEqual(v.selection.map((s) => ({ ...s, badges: squeeze(s.badges), img: s.img.replace(/^\./, "") }))));
  });

  it("the Wandverkleidung step offers the wall's rest for the floor, as today", async () => {
    const { router } = await open();
    const scenario = reference.scenarios.find((s) => s.name === "rest of winwall: offered")!;
    await play((scenario.steps as (string | number)[][]).slice(0, 5), router); // up to the wall with its decor
    const box = await screen.findByTestId("wv-rest");
    expect([part(box, "text"), within(box).getByRole("button").textContent]).toEqual([scenario.view.wall.rest, scenario.view.wall.button]);
  });

  it("the decor and colour tiles are today's", async () => {
    const first = reference.scenarios[0]!.view as unknown as View;
    expect([...WW_DECORS.map((d) => d.value), "custom"]).toEqual(first.decors.map((d) => d.value));
    expect(w.COLORS.map((c) => c.value)).toEqual(first.colors.map((c) => c.value));
    expect(w.COLORS.length).toBe(VG_COLORS.length - 1); // all but Sonderdekor
  });
});

describe("Wandverkleidung als Fußboden — rules", () => {
  const WW = { wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS203", wallCladdingArea: "4,5" };
  const wallWw = { wvEnabled: true, wvSupplier: "ww", wvKBack: "170", wvWwRows: JSON.stringify([{ code: "WS203", fmt: "15", qty: 2 }]) };

  it("a card per format; the least offcut is recommended; VIGOUR takes the wide panel on a tie", () => {
    const s = w.suggestion(WW) as Extract<w.Suggestion, { options: w.Option[] }>;
    expect([s.options.map((o) => `${o.size}:${o.qty}`), s.best]).toEqual([["15:2", "16:2", "17:2"], "15"]);
    const hm = w.suggestion({ wallCladdingSupplier: "hm", wallCladdingArea: "3" }) as Extract<w.Suggestion, { options: w.Option[] }>;
    expect([hm.options.map((o) => `${o.size}:${o.qty}`), hm.best]).toEqual([["997:2", "1497:1"], "1497"]);
    expect([w.suggestion({ wallCladdingArea: "" }), w.supplierOf({}), w.supplierOf(WW)]).toEqual([null, "hm", "ww"]); // an offer from before the line existed: VIGOUR
  });

  it("the wall's rest: what the plates deliver beyond the wall, times the usable share, not below the minimum", () => {
    expect(w.restOf(wallWw)).toMatchObject({ usableM2: 0.53, color: "WS203", supplier: "ww", decor: "WS203" }); // 2 × 2,5 − 1,7 × 2,55 = 0,665 → 80 %
    expect(w.restOf({ ...wallWw, wvKBack: "190" })).toBeNull(); // 0,155 × 0,8 is below 0,5 m²
    expect(w.restOf(wallWw, { usable: 1, min: 0.5 })!.usableM2).toBe(0.67);
    expect([w.restOf({ ...wallWw, wvEnabled: false }), w.restOf({ ...wallWw, wvBudgetMode: "1" }), w.restOf({ ...wallWw, wvKBack: "" })]).toEqual([null, null, null]);
  });

  it("the rest counts only with the same decor; it is taken off the area and can cover the whole floor", () => {
    const rest = w.restOf(wallWw)!, on = { ...WW, wallCladdingUseLeftover: "on", wallCladdingArea: "3" };
    expect([w.creditOf(on, rest), w.creditOf({ ...on, wallCladdingWwDecor: "WS229" }, rest), w.creditOf({ ...on, wallCladdingSupplier: "hm" }, rest), w.creditOf(WW, rest)]).toEqual([0.53, 0, 0, 0]);
    expect((w.suggestion(on, 0.53) as Extract<w.Suggestion, { options: w.Option[] }>).options[0]!.qty).toBe(1);
    expect(w.suggestion({ ...on, wallCladdingArea: "0,5" }, 0.53)).toMatchObject({ allCovered: true });
    expect(w.settled({ ...on, wallCladdingArea: "0,5", wallCladdingPanelSize: "15", wallCladdingQty: "1" }, {}, rest)).toEqual({ wallCladdingLeftoverM2: "0.53", wallCladdingPanelSize: "", wallCladdingQty: "0" });
    expect(w.settled(on, {}, null)).toEqual({ wallCladdingUseLeftover: undefined, wallCladdingLeftoverM2: "" }); // no rest any more: the switch goes off
  });

  it("the switch gives the picked format its new quantity; another line empties format and quantity", () => {
    const rest = w.restOf(wallWw)!, picked = { ...WW, wallCladdingArea: "3", wallCladdingPanelSize: "15", wallCladdingQty: "2" };
    expect(w.useRest(picked, true, rest)).toEqual({ wallCladdingUseLeftover: "on", wallCladdingPanelSize: "15", wallCladdingQty: "1" });
    expect(w.useRest({ ...picked, wallCladdingUseLeftover: "on", wallCladdingQty: "1" }, false, rest)).toEqual({ wallCladdingUseLeftover: undefined, wallCladdingPanelSize: "15", wallCladdingQty: "2" });
    expect([w.setSupplier(picked, "hm"), w.setSupplier(picked, "ww"), w.setQty(""), w.setQty("4")]).toEqual([{ wallCladdingSupplier: "hm", wallCladdingPanelSize: "", wallCladdingQty: "" }, {}, { wallCladdingQty: "0" }, { wallCladdingQty: "4" }]);
    expect(w.takeRest({ wallCladdingSupplier: "hm", wallCladdingPanelSize: "997", wallCladdingQty: "2" }, rest)).toMatchObject({ wallCladdingSupplier: "ww", wallCladdingPanelSize: "", wallCladdingWwDecor: "WS203", wallCladdingUseLeftover: "on" });
  });

  it("the work-time suggestion counts the floor per m² while the mode is on", () => {
    const rows = (dw: Record<string, unknown>) => (workTime(dw, {}, []).autoSuggestedTasks as { key: string; minutes: number; qty: number }[]).map((r) => [r.key, r.minutes, r.qty]);
    expect([rows({ addWallCladding: "on", wallCladdingArea: "4,54" }), rows({ wallCladdingArea: "4,5" }), rows({ addWallCladding: "on" })]).toEqual([[["wallCladdingFloor", 8, 4.5]], [], []]);
  });
});
