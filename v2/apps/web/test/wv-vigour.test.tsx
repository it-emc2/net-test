// Wandverkleidung, line VIGOUR, must store and show what today's UI does for the same inputs.
// Reference: fixtures/wv-vigour.json, recorded from today's UI by v2/scripts/capture-wv-vigour.cjs
// (with the purchase prices the calculator asked for, replayed here).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { suggestion } from "../src/features/steps/arbeiten/rules.js";
import { VG_COLORS } from "../src/features/steps/wandverkleidung/colors.js";
import { chooseLine } from "../src/features/steps/wandverkleidung/rules.js";
import { fromRows, rowsOf, setQty, toggleSwitch } from "../src/features/steps/wandverkleidung/vigour.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/wv-vigour.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const LINE: Record<string, RegExp> = { ww: /^winwall/, premium: /^VIGOUR/, standard: /^Badolux/ };
const WALL: Record<string, string> = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
const SIT: Record<string, string> = { wand: "Eine Wand", ecke: "Ecke", u: "Nische / U-Form" };
const SWITCH: Record<string, string> = { wvSealingSelected: "sealing", wvFlachenSelected: "adhesive", wvSilikonSelected: "silicone", wvEndProfileSelected: "endProfile", wvV3VSelected: "connecting" };
const QTY: Record<string, string> = { wvFlachenQty: "Menge Flächenkleber", wvSilikonQty: "Menge Silikon", wvEndProfileQty: "Menge Abschlussprofil V3A", wvV3VQty: "Menge Verbindungsprofil V3V", wvCornersCount: "Außenecken" };
// the price requests of the calculator: pairs of articles with a number each
const PRICES: Record<string, Reply> = Object.fromEntries(Object.entries(reference.vigorPrices as Record<string, Record<string, unknown>>)
  .filter(([ids, body]) => ids.includes(",") && Object.values(body).every((v) => typeof v === "number")).map(([ids, body]) => [`GET /api/vigor-prices?ids=${encodeURIComponent(ids)}`, { body }]));

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config }, ...PRICES });
  renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return structuredClone(offer());
}
const wall = (key: string) => screen.getAllByTestId("kc-wall").find((w) => w.dataset.wall === key)!;
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "line") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: LINE[a as string]! }));
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Farbe oder Sonderdruck)" }));
    else if (kind === "row") await user.click(screen.getAllByTestId("vg-row")[Number(a) - 1]!.querySelector("button")!);
    else if (kind === "tile") await user.click(screen.getByTestId("vg-tiles").querySelector(`button[data-value="${a}"]`)!);
    else if (kind === "size") await user.selectOptions(screen.getByLabelText(`Breite Zeile ${a}`), String(b));
    else if (kind === "qty") await user.click(screen.getByRole("button", { name: `Zeile ${a}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "row-") await user.click(screen.getByRole("button", { name: `Zeile ${a} entfernen` }));
    else if (kind === "sonder") await user.type(screen.getByLabelText("Konfigurations-Nr. von Vigour"), String(a));
    else if (kind === "acc") await user.click(screen.getByTestId(`vg-acc-${SWITCH[a as string]}`).querySelector('input[type="checkbox"]')!);
    else if (kind === "step") await user.click(screen.getByRole("button", { name: `${QTY[a as string]}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "sit") await user.click(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { name: SIT[a as string]! }));
    else if (kind === "width") fireEvent.change(screen.getByLabelText(`Breite ${WALL[a as string]} in cm`), { target: { value: b } });
    else if (kind === "height") fireEvent.change(screen.getByLabelText("Höhe der Verkleidung"), { target: { value: a } });
    else if (kind === "wall") await user.click(screen.getByRole("button", { name: `Dekor für ${WALL[a as string]} wählen` }));
    else if (kind === "decor") await user.click(wall(String(a)).querySelector(`[data-testid="kc-tiles"] button[data-value="${b}"]`)!);
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => el.querySelector(`[data-part="${name}"]`)?.textContent ?? "";

describe("Wandverkleidung, line VIGOUR, stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps);
    await waitFor(() => expect(changed(base.wandverkleidung, offer().wandverkleidung)).toEqual(scenario.wandverkleidung));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit); // panels and silicone in the work-time suggestion

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Wandverkleidung" }) as HTMLInputElement).checked).toBe(v.on);
    if (!v.on) return; // off: only the switch
    expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(LINE[v.line]!);
    if (v.line !== "premium") return; // the other lines have their own tests

    expect(screen.queryAllByTestId("vg-row").map((r) => ({ title: part(r, "title"), small: part(r, "note"), color: r.dataset.color, size: r.querySelector("select")!.value, qty: part(r, "qty"), open: r.dataset.open === "true" }))).toEqual(v.rows);
    expect(screen.queryByText("Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.")?.textContent ?? "").toBe(v.rowsEmpty);
    expect(!!screen.queryByTestId("vg-tiles")).toBe(v.tilesShown);
    if (v.tilesShown) expect(Array.from(screen.getByTestId("vg-tiles").querySelectorAll('button[aria-pressed="true"]')).map((b) => (b as HTMLElement).dataset.value)).toEqual(v.tileActive);
    expect(!!screen.queryByTestId("vg-sonder")).toBe(v.sonderShown);
    if (v.sonderShown) expect((screen.getByLabelText("Konfigurations-Nr. von Vigour") as HTMLInputElement).value).toBe(v.sonder);
    // switches and quantities of the accessories
    const f = v.fields as Record<string, { checked?: boolean; value?: string }>;
    for (const [id, key] of Object.entries(SWITCH)) expect([id, (screen.getByTestId(`vg-acc-${key}`).querySelector('input[type="checkbox"]') as HTMLInputElement).checked]).toEqual([id, f[id]!.checked]);
    for (const [id, label] of Object.entries(QTY)) expect([id, (screen.getByLabelText(label, { exact: true }) as HTMLInputElement).value]).toEqual([id, f[id]!.value]);

    // the calculator on this line
    const c = v.calc;
    expect(screen.getByTestId("kc-note").textContent).toBe(c.note);
    expect(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { pressed: true }).textContent).toBe(SIT[c.sit]);
    expect(screen.getAllByTestId("kc-wall").map((w) => ({ key: w.dataset.wall, sub: part(w, "sub"), decor: part(w, "decor"), width: (w.querySelector('input[type="number"]') as HTMLInputElement).value, open: w.dataset.open === "true" }))).toEqual(c.walls);
    expect(screen.getAllByTestId("kc-wall").filter((w) => w.querySelector('[data-testid="kc-tiles"]')).map((w) => w.dataset.wall)).toEqual(c.tilesUnder);
    expect([(screen.getByLabelText("Höhe der Verkleidung") as HTMLInputElement).value, screen.queryByTestId("kc-warn")?.textContent ?? "", screen.queryByTestId("kc-hlabel")?.textContent ?? ""]).toEqual([c.height, c.warn, c.heightLabel]);
    expect(squeeze(screen.queryByTestId("kc-cuts")?.textContent)).toBe(squeeze(c.cutList));
    expect(screen.queryAllByTestId("kc-piece").map((p) => ({ plate: p.dataset.plate, cut: p.dataset.cut === "true" }))).toEqual(c.pieces);
    expect(screen.queryAllByTestId("kc-mark").map((m) => m.textContent)).toEqual(c.marks.map(squeeze));
  });

  it("the colour tiles are today's", () => {
    expect(VG_COLORS.map(({ value, caption }) => ({ value, caption }))).toEqual(reference.colors.map(({ value, caption }) => ({ value, caption })));
  });
});

describe("Wandverkleidung, line VIGOUR — rules", () => {
  const NONE = { panelConfigs: { "997x2550": { enabled: false, qty: 0 }, "1497x2550": { enabled: false, qty: 0 } } };

  it("rows ↔ fields: main panel per width, further rows as extra colours, the first colour is the global one", () => {
    const rows = [{ size: 997 as const, qty: 2, color: "Stein grau" }, { size: 997 as const, qty: 1, color: "Weiß" }, { size: 1497 as const, qty: 1, color: "Weiß" }];
    const f = fromRows(NONE, rows);
    expect([f.wvColor, f.wvQty997, f.wvQty1497, f.wvColor_997, f.wvColor_1497, f.wvFlachenQty]).toEqual(["Stein grau", "2", "1", "", "Weiß", "8"]);
    expect(rowsOf({ ...NONE, ...f })).toEqual(rows);
  });

  it("the first panel switches the consumables on, the last one going switches them off; in between a switch stays as set", () => {
    const one = { ...NONE, ...fromRows(NONE, [{ size: 997, qty: 1, color: "Weiß" }]) } as Record<string, unknown>;
    expect([one.wvSealingSelected, one.wvSilikonSelected, one.wvEndProfileSelected, one.wvSilikonQty, one.wvEndProfileQty]).toEqual([true, true, true, "1", "1"]);
    const noSilicone = { ...one, ...toggleSwitch(one, "silicone", false) };
    const two = { ...noSilicone, ...fromRows(noSilicone, [{ size: 997, qty: 2, color: "Weiß" }]) } as Record<string, unknown>;
    expect([two.wvSilikonSelected, two.wvFlachenQty]).toEqual([false, "4"]);
    const none = { ...two, ...fromRows(two, []) } as Record<string, unknown>;
    expect([none.wvSealingSelected, none.wvEndProfileSelected, none.wvFlachenSelected, none.wvFlachenQty, "wvSealing" in none && none.wvSealing !== undefined]).toEqual([false, false, false, "0", false]);
    expect(setQty("connecting", 2)).toEqual({ wvV3VSelected: true, wvV3VQty: "2" });
  });

  it("the work-time suggestion counts the panels of the table (main + extra colours) and the silicone", () => {
    const wv = { wvEnabled: true, wvSilikonSelected: true, panelConfigs: { "997x2550": { enabled: true, qty: 2 }, "1497x2550": { enabled: false, qty: 0 } }, extraColors: { "997x2550": [{ color: "Weiß", qty: 1 }] } };
    expect((suggestion({}, { wv997: 20 }, [], wv).autoSuggestedTasks as { key: string; minutes: number; qty: number }[]).map((r) => [r.key, r.minutes, r.qty])).toEqual([["wv997", 20, 3], ["Silikon", 10, 1]]);
    expect(suggestion({}, {}, [], { ...wv, wvEnabled: false }).autoSuggestedTasks).toEqual([]);
  });

  it("Badolux does not touch the supplier; winwall and VIGOUR set it", () => {
    expect(["wvSupplier" in chooseLine({ wvSupplier: "hm" }, "standard", {}).changes, chooseLine({ wvSupplier: "hm", wvBudgetMode: "1" }, "ww", {}).changes.wvSupplier, chooseLine({ wvSupplier: "ww" }, "premium", {}).changes.wvSupplier]).toEqual([false, "ww", "hm"]);
  });
});
