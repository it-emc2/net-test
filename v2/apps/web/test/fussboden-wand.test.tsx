// Fußboden, mode "Wandverkleidung als Fußboden", must store and show what today's UI does for
// the same inputs. Reference: fixtures/fussboden-wand.json, recorded from today's UI by
// v2/scripts/capture-fussboden-wand.cjs (with the answers of the price list the page asked for).
// Steps on the winwall simple view of the Wandverkleidung (item 2, not built in React yet) are not
// played: the wall is set to what today's UI stored, and what today's UI does to the floor then is
// done with the rules that view will call (wand.ts `autoAdd`, `wallDecorChanged`) — see WALL below.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
type Fields = Record<string, unknown>;
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const WALL_NAMES: Record<string, string> = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
const SERVER: Record<string, Reply> = {
  ...BASE, "GET /admin/api/config/public": { body: { ...arbeiten.config, WV_OWN_LAGER: { V3WVK09: 5, V3WV09: 5 } } },
  ...Object.fromEntries(Object.entries(reference.prices).map(([q, body]) => [`GET /api/vigor-prices?${q}`, { body }])),
  ...Object.fromEntries(Object.entries(reference.products).filter(([, p]) => "price" in (p as object)).map(([id, body]) => [`GET /api/products/${id}`, { body }])),
};
type Step = (string | number | Fields)[];
interface Scenario { name: string; steps: Step[]; duschwanne: Fields; arbeitszeit: Fields; wandverkleidung: Fields; snaps?: { duschwanne: Fields; wandverkleidung: Fields }[]; dialogs: { title: string; message: string; ok: string; cancel: string }[]; view: View; next?: { step: string } }
const SCENARIOS = reference.scenarios as unknown as Scenario[];

async function open() {
  fakeServer(SERVER);
  const router = renderApp(`/deal/${KEY}/bu/Fussboden`);
  await screen.findByRole("heading", { name: "Fußboden" });
  return { base: structuredClone(offer()), router };
}
const sectionsWith = (o: Record<string, any>, section: string, fields: Fields) => ({ ...o, [section]: { ...(o[section] ?? {}), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === "<removed>" ? undefined : v])) } });
/** an offer saved earlier is opened: its fields are there, nothing is remembered from before */
const opened = (fields: Fields) => act(() => { useOfferStore.setState((s) => ({ offer: sectionsWith(s.offer as Record<string, any>, "duschwanne", fields) as never, scratch: {} })); });
/** the wall as today's UI stored it (the simple view's steps are not played in React) */
const wallSet = (fields: Fields) => act(() => { useOfferStore.setState((s) => ({ offer: sectionsWith(s.offer as Record<string, any>, "wandverkleidung", fields) as never })); });
const floorPatch = (fields: Fields) => act(() => { useOfferStore.getState().patch("duschwanne", fields); });
const SIMPLE = new Set(["wvplate", "wvcolor", "wvheight", "snap"]);
const restNow = () => w.restOf(offer().wandverkleidung ?? {});

/** what the simple view of the Wandverkleidung does to the floor in these scenarios (today's UI) — item 2 wires it in React.
 *  Called at the end of each visit to the wall (`seg` counts them). */
const WALL: Record<string, (s: Scenario, seg: number) => void> = {
  "strips: floor added from the rest": (s) => { wallSet(s.wandverkleidung); floorPatch(w.autoAdd(offer().duschwanne, restNow(), "WS203")!.fields); },
  "strips: floor added, then plates by hand": (s) => WALL["strips: floor added from the rest"]!(s, 0),
  // the floor is on already: no new floor, the plates follow the proposal (the rest is not switched on by itself)
  "strips: floor on before, rest switched on": (s) => { wallSet(s.wandverkleidung); expect(w.autoAdd(offer().duschwanne, restNow(), "WS203")).toBeNull(); floorPatch(w.settled(offer().duschwanne, {}, restNow(), (useOfferStore.getState().scratch.wcWwLast as w.Qty | undefined) ?? null)); },
  "strips: height without a rest": (s) => { wallSet(s.wandverkleidung); expect(w.autoAdd(offer().duschwanne, restNow(), "WS203")).toBeNull(); },
  "strips: wall decor changed, floor follows (yes)": (s, seg) => decorChange(s, seg, true),
  "strips: wall decor changed, floor stays (no)": (s, seg) => decorChange(s, seg, false),
  "strips: Bodenbelag, wall decor changed, switch to winwall": (s) => {
    wallSet(s.snaps![0]!.wandverkleidung);
    expect(w.autoAdd(offer().duschwanne, restNow(), "WS203")).toBeNull(); // the floor is a covering
    wallSet(s.wandverkleidung);
    const r = w.wallDecorChanged(offer().duschwanne, restNow(), "WS203", "WS229")!;
    expect(r.ask && { title: r.ask.title, message: r.ask.message, ok: r.ask.confirm, cancel: r.ask.cancel }).toEqual(s.dialogs[0]);
    floorPatch(r.yes);
  },
  // switched off by hand: a later wall change adds no floor again
  "strips: floor switched off by hand, no new floor": (s, seg) => {
    if (seg === 0) { wallSet(s.snaps![0]!.wandverkleidung); floorPatch(w.autoAdd(offer().duschwanne, restNow(), "WS203")!.fields); return; }
    wallSet(s.wandverkleidung);
    expect(w.autoAdd(offer().duschwanne, restNow(), "WS203", true)).toBeNull();
  },
};
function decorChange(s: Scenario, seg: number, yes: boolean) {
  if (seg === 0) {
    wallSet(s.snaps![0]!.wandverkleidung);
    floorPatch(w.autoAdd(offer().duschwanne, restNow(), "WS203")!.fields);
    expect(sorted(mine(changed(BASE_DW, offer().duschwanne)))).toEqual(sorted(mine(s.snaps![0]!.duschwanne)));
    return;
  }
  wallSet(s.wandverkleidung);
  const r = w.wallDecorChanged(offer().duschwanne, restNow(), "WS203", "WS229")!;
  expect(r.ask && { title: r.ask.title, message: r.ask.message, ok: r.ask.confirm, cancel: r.ask.cancel }).toEqual(s.dialogs[0]);
  if (yes) floorPatch(r.yes);
}
let BASE_DW: Fields = {};

async function play(s: Scenario, router: Awaited<ReturnType<typeof open>>["router"]) {
  const user = userEvent.setup();
  const steps = s.steps;
  let seg = -1, inWall = false;
  for (let i = 0; i < steps.length; i++) {
    const [kind, a, b, c] = steps[i]!;
    // a visit to the simple view of the wall: not played; WALL does what it does to the floor
    if (kind === "goto" && a === "Wandverkleidung" && SIMPLE.has(String(steps.slice(i + 1).find((x) => x[0] !== "wvon")?.[0]))) { inWall = true; seg++; continue; }
    if (inWall) { if (kind === "goto" && a === "Fussboden") { inWall = false; await router.navigate(`/deal/${KEY}/bu/Fussboden`); await screen.findByRole("heading", { name: "Fußboden" }); WALL[s.name]!(s, seg); } continue; }
    if (kind === "snap") continue;
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Fußboden" }));
    else if (kind === "tab") await user.click(screen.getByRole("tab", { name: a === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden" }));
    else if (kind === "sup") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: a === "ww" ? /^winwall/ : /^VIGOUR/ }));
    else if (kind === "kind") await user.click(screen.getByRole("radio", { name: a === "Fehlstellen" ? "Nur Fehlstellen" : "Gesamter Badboden" }));
    else if (kind === "area") fireEvent.change(screen.getByLabelText("Fläche (m²)"), { target: { value: a } });
    else if (kind === "plate") await user.click(screen.getByRole("button", { name: `${b === "-" ? "Weniger" : "Mehr"} ${plateSize(String(a))}` }));
    else if (kind === "resync") await user.click(screen.getByRole("button", { name: "↻ Vorschlag aus Fläche" }));
    else if (kind === "decor") await user.click(screen.getByTestId("wc-decors").querySelector(`[data-code="${a}"]`)!);
    else if (kind === "custom") fireEvent.change(screen.getByLabelText("Anderes Dekor"), { target: { value: a } });
    else if (kind === "confirm") await user.click(within(screen.getByTestId("wc-ask")).getByRole("button", { name: a === "ok" ? s.dialogs.at(-1)!.ok : s.dialogs.at(-1)!.cancel }));
    else if (kind === "color") await user.click(screen.getByTestId("wc-colors").querySelector(`label[data-value="${a}"]`)!);
    else if (kind === "card") await user.click(screen.getAllByTestId("wc-card").find((x) => x.dataset.size === a)!);
    else if (kind === "qty") fireEvent.change(screen.getByLabelText("Anzahl Paneele (Stück)"), { target: { value: a } });
    else if (kind === "rest") await user.click(screen.getByRole("switch", { name: "Reste aus Wandverkleidung anrechnen" }));
    else if (kind === "calc") await user.click(screen.getByRole("button", { name: /^Flächenrechner/ }));
    else if (kind === "row") { fireEvent.change(screen.getByLabelText(`Länge ${a} in m`), { target: { value: b } }); fireEvent.change(screen.getByLabelText(`Breite ${a} in m`), { target: { value: c } }); }
    else if (kind === "apply") await user.click(screen.getByRole("button", { name: "In Fläche übernehmen" }));
    else if (kind === "next") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else if (kind === "open") opened(a as Fields);
    else if (kind === "goto") { await router.navigate(`/deal/${KEY}/bu/${a}`); await screen.findByRole("heading", { name: a === "Fussboden" ? "Fußboden" : String(a) }); }
    else if (kind === "wvon") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "wvclassic") continue; // React's Wandverkleidung is the classic view (item 2 brings the simple one)
    else if (kind === "wvline") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: /^VIGOUR/ }));
    else if (kind === "wvwidth") fireEvent.change(screen.getByLabelText(`Breite ${WALL_NAMES[a as string]} in cm`), { target: { value: b } });
    else if (kind === "wvwall") await user.click(screen.getByRole("button", { name: `Dekor für ${WALL_NAMES[a as string]} wählen` }));
    else if (kind === "wvdecor") { const wall = screen.getAllByTestId("kc-wall").find((x) => x.dataset.wall === a)!; await user.click(wall.querySelectorAll<HTMLElement>('[data-testid="kc-tiles"] button')[Number(b) - 1]!); }
    else if (kind === "use") { await user.click(await screen.findByRole("button", { name: "Als Fußboden verwenden" })); await screen.findByRole("heading", { name: "Fußboden" }); }
    else throw new Error(`step not handled: ${kind}`);
  }
}
const plateSize = (code: string) => ({ 13: "100 × 205 cm", 15: "100 × 250 cm", 16: "125 × 250 cm", 17: "150 × 250 cm" } as Record<string, string>)[code]!;
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Fields, now: Fields, drop = false) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k]) && !(drop && k === "computed")).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
// `computed` belongs to the mode Fußboden and is valued with the price list there (fussboden.test.tsx)
const mine = ({ computed: _c, ...rest }: Fields) => rest;
interface Tile { value: string; caption: string; checked: boolean; disabled: boolean }
interface View {
  on: boolean; tab: string; shown: boolean; supplier: string; kind: string; rest: { shown: boolean; hint: string; checked: boolean; note: string }; area: string; calcOpen: boolean; calcToggle: string;
  resync: { hint: string; button: string } | null; platesShown: boolean; plates: { size: string; best: string; qty: string; has: boolean; img: string }[]; total: { text: string; small: string; short: boolean } | null;
  decorShown: boolean; palette: w.PaletteTile[]; customShown: boolean; custom: string; customHint: string; customKind: string; colorsShown: boolean; colors: Tile[];
  cardsShown: boolean; cards: { size: string; qty: string; title: string; best: boolean; selected: boolean; count: string; coverage: string; price: string; unit: string; label: string }[];
  qtyShown: boolean; qty: string; selection: { name: string; meta: string; price: string; badges: string; img: string }[]; toasts: string[]; step: string; wall: { rest: string; button: string };
}
const tiles = (testId: string): Tile[] => Array.from(screen.getByTestId(testId).querySelectorAll("label[data-value]")).map((l) => { const i = l.querySelector("input")!; return { value: (l as HTMLElement).dataset.value!, caption: part(l, "caption"), checked: i.checked, disabled: i.disabled }; });

describe("Wandverkleidung als Fußboden stores and shows what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))("%s", { timeout: 20000 }, async (_name, scenario) => {
    const { base, router } = await open();
    BASE_DW = base.duschwanne;
    await play(scenario, router);
    const v = scenario.view, next = scenario.next;
    await waitFor(() => expect(mine(changed(base.duschwanne, offer().duschwanne))).toEqual(mine(scenario.duschwanne)));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit); // the floor in the work-time suggestion
    if (next) { await waitFor(() => expect(router.state.location.pathname.split("/").pop()).toBe(next.step)); return; } // today this mode asks for nothing
    expect(router.state.location.pathname.split("/").pop()).toBe(v.step);
    // the in-page questions of the floor step itself (the wall's are checked in WALL)
    if (!scenario.steps.some((x) => SIMPLE.has(String(x[0])))) expect(scenario.dialogs.length).toBe(scenario.steps.filter((x) => x[0] === "confirm").length);

    expect((screen.getByRole("switch", { name: "Fußboden" }) as HTMLInputElement).checked).toBe(v.on);
    if (!v.on) return; // off: only the switch
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(v.tab === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden");
    expect(!!screen.queryByLabelText("Fläche (m²)") && v.tab === "wall").toBe(v.shown);
    if (!v.shown) return; // the other mode has its own test
    expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(v.supplier === "ww" ? /^winwall/ : /^VIGOUR/);
    expect((screen.queryByRole("radio", { checked: true, name: /^(Nur Fehlstellen|Gesamter Badboden)$/ }) as HTMLInputElement | null)?.value ?? "").toBe(v.kind);
    // the rest of the wall cladding. Today its row and hint are only brought up to date with the next change on this
    // step (as in the previous recording); React shows the row while the wall has a rest, as the Wandverkleidung step does (`wall.rest`)
    const rest = screen.queryByTestId("wc-rest");
    expect(!!rest).toBe(v.wall.rest !== "");
    if (rest) expect((within(rest).getByRole("switch") as HTMLInputElement).checked).toBe(v.rest.checked);
    if (rest && v.rest.shown) expect(part(rest, "hint")).toBe(v.rest.hint);
    expect(flat(screen.queryByTestId("wc-rest-note")?.textContent)).toBe(v.rest.note);
    expect([(screen.getByLabelText("Fläche (m²)") as HTMLInputElement).value, !!screen.queryByTestId("fb-calc")]).toEqual([v.area, v.calcOpen]);
    // winwall plates
    const plates = screen.queryByTestId("wc-plates");
    expect(!!plates).toBe(v.platesShown);
    if (plates) {
      expect(screen.getAllByTestId("wc-plate").map((p) => ({ size: part(p, "size"), best: part(p, "best"), qty: part(p, "qty"), has: part(p, "qty") !== "0", img: p.dataset.img }))).toEqual(v.plates);
      const t = screen.getByTestId("wc-total");
      expect({ text: part(t, "text"), small: part(t, "small"), short: t.dataset.short === "true" }).toEqual(v.total);
      const r = screen.queryByTestId("wc-resync");
      expect(r ? { hint: part(r, "hint"), button: flat(within(r).getByRole("button").textContent) } : null).toEqual(v.resync);
    }
    expect(!!screen.queryByTestId("wc-decors")).toBe(v.decorShown);
    if (v.decorShown) {
      expect(within(screen.getByTestId("wc-decors")).getAllByRole("radio").map((b) => ({ code: b.dataset.code, name: part(b, "name"), small: part(b, "small"), checked: b.getAttribute("aria-checked") === "true", swatch: !!(b.querySelector("i") as HTMLElement).style.backgroundImage, label: part(b, "label") }))).toEqual(v.palette);
      const custom = screen.getByTestId("wc-custom");
      expect([(within(custom).getByLabelText("Anderes Dekor") as HTMLInputElement).value, part(custom, "hint"), custom.querySelector<HTMLElement>('[data-part="hint"]')!.dataset.kind]).toEqual([v.custom, v.customHint, v.customKind]);
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

  it("the Wandverkleidung step offers the wall's rest for the floor, as today", { timeout: 20000 }, async () => {
    const { router } = await open();
    const scenario = SCENARIOS.find((s) => s.name === "rest of winwall: offered")!;
    await play({ ...scenario, steps: scenario.steps.slice(0, 6) }, router); // up to the wall with its decor
    const box = await screen.findByTestId("wv-rest");
    expect([part(box, "text"), within(box).getByRole("button").textContent]).toEqual([scenario.view.wall.rest, scenario.view.wall.button]);
  });

  it("the toast of a floor added from the wall's rest is today's", () => {
    const s = SCENARIOS.find((x) => x.name === "strips: floor added from the rest")!;
    const wv = { ...s.wandverkleidung };
    expect([w.autoAdd({}, w.restOf(wv), "WS203")!.toast]).toEqual(s.view.toasts);
  });

  it("the palette is today's; the VIGOUR colours are today's", () => {
    const first = SCENARIOS.find((s) => s.view.decorShown)!.view;
    expect(w.paletteOf({ wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS203" })).toEqual(first.palette);
    expect(WW_DECORS.map((d) => d.value)).toEqual(first.palette.map((d) => d.code).filter((c) => c !== "NW230"));
    const hm = SCENARIOS.find((s) => s.view.colorsShown)!.view;
    expect(w.COLORS.map((c) => c.value)).toEqual(hm.colors.map((c) => c.value));
    expect(w.COLORS.length).toBe(VG_COLORS.length - 1); // all but Sonderdekor
  });
});

describe("Wandverkleidung als Fußboden — rules", () => {
  const WW = { wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS203", wallCladdingArea: "4,5" };
  const wallWw = { wvEnabled: true, wvSupplier: "ww", wvKBack: "170", wvWwRows: JSON.stringify([{ code: "WS203", fmt: "15", qty: 2 }]) };

  it("the proposal is the cheapest cover; single plates, no set", () => {
    expect([w.bestOf(4.5), w.bestOf(1), w.bestOf(0)]).toEqual([{ 13: 1, 15: 1, 16: 0, 17: 0 }, { 13: 1, 15: 0, 16: 0, 17: 0 }, w.zero()]);
    expect(w.qtyFields({ 13: 1, 15: 1, 16: 0, 17: 0 })).toEqual({ wallCladdingWwQty: '{"13":1,"15":1,"16":0,"17":0}', wallCladdingQty: "2", wallCladdingPanelSize: "15" });
    expect(w.qtyFields(w.zero())).toEqual({ wallCladdingWwQty: "", wallCladdingQty: "0", wallCladdingPanelSize: "" });
    expect(w.selection({ ...WW, ...w.qtyFields({ 13: 0, 15: 2, 16: 0, 17: 0 }) }, null, null, 0)[0]).toMatchObject({ meta: "Marmor weiß · WS 203 · Art.-Nr. WS20315", price: "2 × 100×250 cm" }); // never WS20325 (set)
  });

  it("an offer with only the old fields has its one format; the JSON wins when it is there", () => {
    expect(w.qtyOf({ wallCladdingSupplier: "ww", wallCladdingPanelSize: "16", wallCladdingQty: "3" })).toEqual({ 13: 0, 15: 0, 16: 3, 17: 0 });
    expect(w.qtyOf({ wallCladdingSupplier: "ww", wallCladdingPanelSize: "15", wallCladdingQty: "3", wallCladdingWwQty: '{"13":1,"15":2}' })).toEqual({ 13: 1, 15: 2, 16: 0, 17: 0 });
    expect(w.qtyOf({ wallCladdingPanelSize: "997", wallCladdingQty: "3" })).toEqual(w.zero()); // VIGOUR
  });

  it("the plates follow the proposal until − / + changed them", () => {
    const set = { ...WW, ...w.qtyFields(w.bestOf(4.5)) }, last = w.bestOf(4.5);
    expect(w.follow({ ...set, wallCladdingArea: "9" }, 0, last)).toEqual(w.qtyFields(w.bestOf(9)));
    expect(w.follow({ ...set, ...w.stepPlate(set, "17", 1), wallCladdingArea: "9" }, 0, last)).toEqual({});
    expect(w.follow({ ...set, wallCladdingArea: "9" }, 0, null)).toEqual({}); // reopened: plates stay
    expect(w.follow({ ...WW, wallCladdingArea: "9" }, 0, null)).toEqual(w.qtyFields(w.bestOf(9))); // empty: follow
  });

  it("the wall's rest: area based for the first decor, or the strips above the cladding height per decor", () => {
    expect(w.restOf(wallWw)).toMatchObject({ usableM2: 0.53, color: "Marmor weiß", supplier: "ww", decor: "WS203", byDecor: { WS203: 0.53 } }); // 2 × 2,5 − 1,7 × 2,55 = 0,665 → 80 %
    expect(w.restOf({ ...wallWw, wvKBack: "190" })).toBeNull(); // 0,155 × 0,8 is below 0,5 m²
    const strips = { wvEnabled: true, wvSupplier: "ww", wvWwHeight: "200", wvWwRows: JSON.stringify([{ code: "WS203", fmt: "15", qty: 3 }, { code: "WS229", fmt: "17", qty: 1 }]) };
    expect(w.restOf(strips)).toMatchObject({ usableM2: 1.2, decor: "WS203", byDecor: { WS203: 1.2, WS229: 0.6 } });
    expect(w.restOf({ ...strips, wvWwHeight: "250" })).toBeNull();
    expect([w.restOf({ ...wallWw, wvEnabled: false }), w.restOf({ ...wallWw, wvBudgetMode: "1" }), w.restOf({ ...wallWw, wvKBack: "" })]).toEqual([null, null, null]);
  });

  it("the rest counts only with its decor; it is taken off the area", () => {
    const rest = w.restOf(wallWw)!, on = { ...WW, wallCladdingUseLeftover: "on", wallCladdingArea: "3" };
    expect([w.creditOf(on, rest), w.creditOf({ ...on, wallCladdingWwDecor: "WS229" }, rest), w.creditOf({ ...on, wallCladdingSupplier: "hm" }, rest), w.creditOf(WW, rest)]).toEqual([0.53, 0, 0, 0]);
    expect(w.proposalOf(on, 0.53)).toEqual(w.bestOf(2.47));
    expect(w.settled(on, {}, null)).toEqual({ wallCladdingUseLeftover: undefined, wallCladdingLeftoverM2: "" }); // no rest any more: the switch goes off
    expect(w.leavingRest({ ...on, wallCladdingWwDecor: "WS229" }, "WS203", rest)).toMatchObject({ title: "Reste nicht mehr anrechnen?", confirm: "Trotzdem ändern", cancel: "Abbrechen" });
    expect(w.leavingRest({ ...on, wallCladdingUseLeftover: undefined, wallCladdingWwDecor: "WS229" }, "WS203", rest)).toBeNull();
  });

  it("another line empties format, quantity and plates", () => {
    const picked = { ...WW, ...w.qtyFields(w.bestOf(4.5)) };
    expect([w.setSupplier(picked, "hm"), w.setSupplier(picked, "ww"), w.setQty(""), w.setQty("4")]).toEqual([{ wallCladdingSupplier: "hm", wallCladdingPanelSize: "", wallCladdingQty: "", wallCladdingWwQty: "" }, {}, { wallCladdingQty: "0" }, { wallCladdingQty: "4" }]);
    expect(w.takeRest({ wallCladdingSupplier: "hm", wallCladdingPanelSize: "997", wallCladdingQty: "2" }, w.restOf(wallWw)!)).toMatchObject({ wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS203", wallCladdingUseLeftover: "on" });
  });

  it("the work-time suggestion counts the floor per m² while the mode is on", () => {
    const rows = (dw: Record<string, unknown>) => (workTime(dw, {}, []).autoSuggestedTasks as { key: string; minutes: number; qty: number }[]).map((r) => [r.key, r.minutes, r.qty]);
    expect([rows({ addWallCladding: "on", wallCladdingArea: "4,54" }), rows({ wallCladdingArea: "4,5" }), rows({ addWallCladding: "on" })]).toEqual([[["wallCladdingFloor", 8, 4.5]], [], []]);
  });
});
