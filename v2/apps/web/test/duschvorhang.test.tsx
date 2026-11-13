// Duschvorhang must store and show what today's UI does for the same inputs.
// Reference: fixtures/duschvorhang.json, recorded from today's UI by
// v2/scripts/capture-duschvorhang.cjs (with the catalogue the page loaded).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { drawing } from "../src/features/steps/duschvorhang/drawing.js";
import { applyPlan, buildLines, configLabel, fromSaved, planParts, restored, type Catalog, type State } from "../src/features/steps/duschvorhang/plan.js";
import { fieldsOf, isOn, setCeiling, setLeg, setQty, setShape, stateOf, toggleItem } from "../src/features/steps/duschvorhang/rules.js";
import reference from "./fixtures/duschvorhang.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const CATALOG = reference.catalog as unknown as Catalog;
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim(); // as recorded: any white space is one blank
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const row = (art: unknown) => screen.getAllByTestId("vh-item").find((r) => r.dataset.art === art)!;
const SHAPE: Record<string, string> = { nische: "Nische", ecke: "Ecke", u: "U-Form" };

async function open(da: Record<string, unknown> = {}) {
  fakeServer({ ...BASE, "GET /api/vorhang/products": { body: reference.catalog } });
  renderApp(`/deal/${KEY}/bu/Duschvorhang`);
  await screen.findByRole("heading", { name: "Duschvorhang" });
  if (Object.keys(da).length) useOfferStore.getState().patch("duschabtrennung" as never, da as never);
  return structuredClone(offer());
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "on" || kind === "off") { await user.click(screen.getByRole("switch", { name: "Duschvorhang" })); if (kind === "on") await screen.findByTestId("vh-drawing"); }
    else if (kind === "shape") await user.click(within(screen.getByRole("group", { name: "Vorhang-Situation" })).getByRole("button", { name: SHAPE[a as string]! }));
    else if (kind === "leg") fireEvent.change(screen.getAllByTestId("vh-leg").find((l) => l.dataset.leg === a)!.querySelector("input")!, { target: { value: b } });
    else if (kind === "item") await user.click(row(a).querySelector('input[type="checkbox"]')!);
    else if (kind === "qty") await user.click(within(row(a)).getByRole("button", { name: b === "+" ? /: mehr$/ : /: weniger$/ }));
    else if (kind === "type") fireEvent.change(row(a).querySelector('input[type="number"]')!, { target: { value: b } });
    else if (kind === "ceiling") await user.click(screen.getByRole("group", { name: "Länge Deckenstütze" }).querySelector(`[data-ceiling="${a}"]`)!);
    else if (kind === "more") await user.click(screen.getByRole("button", { name: /^(Andere Größe oder Länge wählen|Weitere Größen ausblenden)$/ }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
interface Item { art: string; kind: string; title: string; small: string; on: boolean; qty: string | null; lengths: string[] }
interface View {
  on: boolean; shown: boolean; shape: string; legs: { leg: string; name: string; value: string; placeholder: string }[];
  drawing: { label: string; empty: boolean; badges: string[]; rods: number; joints: number; corners: number; rosettes: number; walls: number };
  products: Item[]; hint: string; more: string; moreOpen: boolean; fittings: Item[];
  summary: { head: string; sub: string; lines: { name: string; art: string; stock: string; price: string }[]; total: string };
}
const items = (testId: string): Item[] => Array.from(screen.getByTestId(testId).querySelectorAll('[data-testid="vh-item"]')).map((r) => ({
  art: (r as HTMLElement).dataset.art!, kind: (r as HTMLElement).dataset.kind!, title: part(r, "title"), small: part(r, "small"), on: (r.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
  qty: (r.querySelector('input[type="number"]') as HTMLInputElement | null)?.value ?? null, lengths: Array.from(r.querySelectorAll("[data-ceiling]")).map((b) => `${b.getAttribute("aria-pressed") === "true" ? "*" : ""}${b.textContent}`),
}));

describe("Duschvorhang stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as (string | number)[][]);
    await waitFor(() => expect([changed(base.duschabtrennung, offer().duschabtrennung), changed(base.duschvorhang, offer().duschvorhang)]).toEqual([scenario.duschabtrennung, scenario.duschvorhang]));
    expect(Object.keys(base).filter((k) => k !== "duschabtrennung" && k !== "duschvorhang" && !same(base[k], offer()[k]))).toEqual([]); // nothing else in the offer changes

    const v = scenario.view as unknown as View;
    expect((screen.getByRole("switch", { name: "Duschvorhang" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByTestId("vh-drawing")).toBe(v.shown);
    if (!v.shown) return; // off: only the switch
    expect(within(screen.getByRole("group", { name: "Vorhang-Situation" })).getByRole("button", { pressed: true }).textContent).toBe(SHAPE[v.shape]);
    expect(screen.getAllByTestId("vh-leg").map((l) => { const i = l.querySelector("input")!; return { leg: l.dataset.leg, name: part(l, "name"), value: i.value, placeholder: i.placeholder }; })).toEqual(v.legs);
    const svg = screen.getByTestId("vh-drawing").querySelector("svg")!, count = (sel: string) => svg.querySelectorAll(sel).length;
    expect({ label: svg.getAttribute("aria-label"), empty: svg.classList.contains("vhc-svg--empty"), badges: Array.from(svg.querySelectorAll(".vhc-badge-t")).map((t) => t.textContent), rods: count(".vhc-rod"), joints: count(".vhc-joint"), corners: count(".vhc-corner"), rosettes: count(".vhc-rosette"), walls: count(".vhc-wallp") }).toEqual(v.drawing);
    expect(items("vh-products")).toEqual(v.products);
    expect(items("vh-fittings")).toEqual(v.fittings);
    const more = screen.getByRole("button", { name: /^(Andere Größe oder Länge wählen|Weitere Größen ausblenden)$/ });
    expect([part(screen.getByTestId("vh-products"), "hint"), more.textContent, more.getAttribute("aria-expanded") === "true"]).toEqual([v.hint, v.more, v.moreOpen]);
    const summary = screen.queryByTestId("vh-summary");
    expect(summary ? [part(summary, "head"), part(summary, "sub"), squeeze(part(summary, "total"))] : ["", "", ""]).toEqual([v.summary.head, v.summary.sub, squeeze(v.summary.total)]);
    expect(summary ? within(summary).getAllByTestId("vh-line").map((l) => ({ name: part(l, "name"), art: part(l, "art"), stock: squeeze(part(l, "stock")), price: part(l, "price") })) : [])
      .toEqual(v.summary.lines.map((l) => ({ ...l, stock: squeeze(l.stock) })));
  });
});

describe("Duschvorhang — rules", () => {
  const fresh = (): State => ({ ...restored(null, CATALOG), enabled: true });

  it("the plan: a rod per side, couplings for long sides, a bend and a ceiling support per corner, one curtain for the run", () => {
    expect(planParts("nische", { a: 200 }, CATALOG)).toMatchObject({ rodQty: { DEPVS100: 2 }, kupplung: 1, corners: 0, total: 200, rodsPerLeg: [2] });
    expect(planParts("u", { a: 90, b: 120, c: 90 }, CATALOG)).toMatchObject({ rodQty: { DEPVS90: 2, DEPVS120: 1 }, curtainQty: { HEWIDV300200W: 1 }, corners: 2, total: 300 });
    expect(planParts("nische", { a: 450 }, CATALOG).curtainQty).toEqual({ HEWIDV240200W: 2 }); // longer than the widest curtain: two
    expect(planParts("ecke", {}, CATALOG)).toMatchObject({ corners: 0, total: 0, rodsPerLeg: [0, 0] });
    expect([configLabel("ecke", { a: 90, b: 120 }), configLabel("ecke", {}), configLabel(null, { a: 90 })]).toEqual(["Ecke 90 + 120 cm", "", ""]);
  });

  it("a new plan sets curtains, rods, bends, couplings and ceiling supports again and keeps the rest", () => {
    let s = setLeg(setLeg(setShape(fresh(), "ecke", CATALOG), "a", "90", CATALOG), "b", "120", CATALOG);
    expect(s.optionalQty).toMatchObject({ DEPVSBO: 1, DEPDS50: 1, DEPVSK: 0, DEPVSRI: 1 });
    s = setCeiling(toggleItem(setQty(s, "opt", "DEPVSBO", 4), "rosette", "DEPVSROS"), "DEPDS80");
    s = setLeg(s, "b", "150", CATALOG);
    expect([s.optionalQty.DEPVSBO, s.optionalQty.DEPDS80, s.optionalQty.DEPDS50, s.mandatoryQty!.DEPVSROS]).toEqual([1, 1, 0, 0]); // the length of the support and the switched-off rosettes stay
    expect(setLeg(s, "b", "150", CATALOG)).toBe(s); // the same length again: nothing happens
    expect(setLeg(s, "b", "149.6", CATALOG)).toBe(s); // rounded to the same length
    expect(applyPlan({ ...s, legs: {} }, CATALOG).curtainQty).toEqual({});
  });

  it("the lines: curtains first (the first names the situation), then rods, rosettes, other fittings; none while not wanted", () => {
    const s = setLeg(fresh(), "a", "120", CATALOG);
    expect(buildLines(s, CATALOG).map((l) => [l.articleNumber, l.qty])).toEqual([["HEWIDV120200W", 1], ["DEPVS120", 1], ["DEPVSROS", 1], ["DEPVSRI", 1]]);
    expect(buildLines(s, CATALOG)[0]!.label).toBe("HEWI Duschvorhang Dekor 80 uni weiss 120 × 200 cm (Nische 120 cm)");
    expect([buildLines({ ...s, enabled: false }, CATALOG), buildLines(s, null)]).toEqual([[], []]);
  });

  it("the offer: the curtain's lines come last in quickAdd, only while on; the configuration only while there are lines", () => {
    const s = setLeg(fresh(), "a", "120", CATALOG);
    const enclosure = { kind: "config", label: "Tür", price: 300, productId: "V1" }, hassmann = { kind: "door", label: "alt", price: "10", productId: "X" };
    const old = { kind: "config", group: "Duschvorhang", label: "old", price: 1, productId: "OLD" };
    const f = fieldsOf({ quickAdd: [hassmann, old, enclosure] }, s, CATALOG, true);
    expect((f.duschabtrennung.quickAdd as { productId: string }[]).map((q) => q.productId)).toEqual(["X", "V1", "HEWIDV120200W", "DEPVS120", "DEPVSROS", "DEPVSRI"]);
    expect((f.duschvorhang.configurator as { lines: unknown[] }).lines.length).toBe(4);
    const off = fieldsOf({ quickAdd: f.duschabtrennung.quickAdd }, s, CATALOG, false);
    expect([(off.duschabtrennung.quickAdd as { productId: string }[]).map((q) => q.productId), off.duschabtrennung.curtainEnabled, !!off.duschvorhang.configurator]).toEqual([["X", "V1"], false, true]);
    expect(fieldsOf({}, { ...s, enabled: false }, CATALOG, true).duschvorhang.configurator).toBeUndefined();
  });

  it("an opened offer: its state, the switch of older offers, offers from before the situation existed", () => {
    const old = fromSaved({ enabled: true, curtainSel: "HEWIDV140200W", rodSel: "DEPVS150", widthCm: 140 });
    expect([old.shape, old.legs, old.curtainQty, old.rodQty, old.mandatoryQty]).toEqual([null, { a: 140 }, { HEWIDV140200W: 1 }, { DEPVS150: 1 }, null]);
    expect(restored({ enabled: true, curtainSel: "HEWIDV140200W", rosetteOn: false }, CATALOG).mandatoryQty).toEqual({});
    expect(buildLines(restored({ enabled: true, curtainSel: "HEWIDV140200W", rodSel: "DEPVS150", widthCm: 140 }, CATALOG), CATALOG).map((l) => l.label)).toEqual(["HEWI Duschvorhang Dekor 80 uni weiss 140 × 200 cm", "Vorhangstange derby V3 plus  1500mm", "Befestigungsrosettenpaar derby V3 plus"]); // no situation text
    expect(stateOf({ configurator: { state: { enabled: true, shape: "u", legs: { a: 90 }, curtainQty: {}, rodQty: {}, mandatoryQty: { DEPVSROS: 2 } } } }, CATALOG)).toMatchObject({ shape: "u", mandatoryQty: { DEPVSROS: 2 } });
    expect([isOn({}, {}), isOn({}, { configurator: { lines: [{}] } }), isOn({ curtainEnabled: false }, { configurator: { lines: [{}] } })]).toEqual([false, true, false]);
  });

  it("the drawing shows the side being typed and fades the others", () => {
    const svg = drawing("ecke", { a: 90, b: 120 }, CATALOG, "b");
    expect(svg).toMatch(/^<svg class="vhc-svg vhc-has-focus"/);
    expect([svg.includes('class="vhc-seg vhc-on" data-leg="b"'), svg.includes('class="vhc-seg" data-leg="a"')]).toEqual([true, true]);
  });

  it("the enclosure's lines and the curtain's lines share quickAdd without losing each other", async () => {
    await open({ quickAdd: [{ kind: "config", label: "Pendeltür", qty: 1, price: 338.4, productId: "V1P180E", finish: null }] });
    await play([["on"], ["leg", "a", "120"]]);
    await waitFor(() => expect(offer().duschabtrennung.quickAdd.map((q: { productId: string }) => q.productId)).toEqual(["V1P180E", "HEWIDV120200W", "DEPVS120", "DEPVSROS", "DEPVSRI"]));
    await play([["off"]]);
    await waitFor(() => expect(offer().duschabtrennung.quickAdd.map((q: { productId: string }) => q.productId)).toEqual(["V1P180E"]));
  });
});
