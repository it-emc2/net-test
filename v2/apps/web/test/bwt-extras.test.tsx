// Badewannentür slice 2 (free items, note, sketch, note texts) must store and show what today's
// UI does for the same inputs. Reference: fixtures/bwt-extras.json, recorded from today's UI by
// v2/scripts/capture-bwt-extras.cjs. The test environment has no canvas (see wv-skizze.test.tsx).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { parseMoney, rowsOf, storedRows } from "../src/features/steps/bwt/extras-rules.js";
import { COLORS, SIZES, TOOLS } from "../src/shared/ui/sketch-pad.js";
import reference from "./fixtures/bwt-extras.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, name) => (typeof name === "string" ? () => {} : undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,TEST");
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 280, right: 600, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
});
async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bwt/bwt`);
  await screen.findByRole("heading", { name: "Freier Posten & Hinweise" });
  return structuredClone(offer());
}
const rowEls = () => screen.getAllByTestId("bwt-row");
const FIELD: Record<string, string> = { name: "Bezeichnung", price: "Preis", qty: "Menge", id: "ID" };
const cellOf = (i: number, f: string) => within(rowEls()[i]!).getByLabelText(FIELD[f]!) as HTMLInputElement;
const pad = () => screen.getByTestId("sketch-pad");
const pointer = (type: string, [x, y]: number[]) => fireEvent(pad().querySelector("canvas")!, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
const STEEL = "Stahl‑emaillierte Badewanne – Hinweis in Angebot übernehmen", PROXY = "Stellvertretung – Hinweis in Angebot übernehmen";
async function play(steps: unknown[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps as [string, any, any, any][]) {
    if (kind === "row") fireEvent.change(cellOf(a, b), { target: { value: c } });
    else if (kind === "add") await user.click(screen.getByRole("button", { name: "Weitere Position hinzufügen" }));
    else if (kind === "remove") await user.click(within(rowEls()[a]!).getByRole("button", { name: "Diese Zeile entfernen" }));
    else if (kind === "note") fireEvent.change(screen.getByLabelText("Zusätzliche Hinweise zur Badewannentür (für das Angebot)"), { target: { value: a } });
    else if (kind === "steel") await user.click(screen.getByRole("checkbox", { name: STEEL }));
    else if (kind === "proxy") await user.click(screen.getByRole("checkbox", { name: PROXY }));
    else if (kind === "steeltext") fireEvent.change(screen.getByRole("textbox", { name: STEEL }), { target: { value: a } });
    else if (kind === "proxytext") fireEvent.change(screen.getByRole("textbox", { name: PROXY }), { target: { value: a } });
    else if (kind === "tool") await user.click(within(pad()).getByRole("button", { name: TOOLS.find((t) => t.tool === a)!.label }));
    else if (kind === "size") await user.click(within(pad()).getByRole("button", { name: SIZES.find((s) => s.size === a)!.label }));
    else if (kind === "color") await user.click(within(pad()).getByRole("button", { name: COLORS.find((x) => x.color === a)!.label }));
    else if (kind === "undo") await user.click(within(pad()).getByRole("button", { name: "Rückgängig" }));
    else if (kind === "clear") await user.click(within(pad()).getByRole("button", { name: "Skizze löschen" }));
    else if (kind === "stroke") { pointer("pointerdown", a[0]); for (const p of a.slice(1)) pointer("pointermove", p); pointer("pointerup", a[a.length - 1]); }
    else if (kind === "tap") { pointer("pointerdown", a); pointer("pointerup", a); }
    else throw new Error(`step not handled: ${kind}`);
    await new Promise((r) => setTimeout(r, 0));
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
/** as recorded: the picture is megabytes of PNG — only whether there is one */
const png = (b: Record<string, any>) => {
  const out = { ...b }, mark = (v: unknown) => (typeof v === "string" && v.startsWith("data:image/png") ? "<png>" : v);
  if ("bwtSketchDataUrl" in out) out.bwtSketchDataUrl = mark(out.bwtSketchDataUrl);
  if (out.sketch && typeof out.sketch === "object") out.sketch = { ...out.sketch, dataUrl: mark(out.sketch.dataUrl) };
  return out;
};
const MINE = ["quickAdd", "bwtNote", "bwtSteelNoteEnabled", "bwtSteelNoteText", "bwtProxyNoteEnabled", "bwtProxyNoteText", "sketch", "bwtSketchJson", "bwtSketchDataUrl"];
const only = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => MINE.includes(k)));

describe("Badewannentür (slice 2) stores and shows what today's UI does", () => {
  it("a new offer starts with today's fields", async () => {
    const base = await open();
    expect(only(png(base.bwt))).toEqual(only(reference.base as Record<string, unknown>));
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as unknown[][]);
    await waitFor(() => expect(only(changed(png(base.bwt), png(offer().bwt)))).toEqual(only(scenario.bwt)));
    const v = scenario.view as { rows: Record<string, string>[]; focus: string; note: string; steel: { on: boolean; text: string }; proxy: { on: boolean; text: string };
      sketch: { tool: string; size: string; color: string; title: string; subtitle: string; hint: string }; noteLabel: string; placeholder: string; legend: string; help: string };
    expect(rowEls().map((_, i) => Object.fromEntries(Object.keys(FIELD).map((f) => [f, cellOf(i, f).value])))).toEqual(v.rows);
    if (v.focus) expect((document.activeElement as HTMLElement).dataset.field).toBe(v.focus);
    expect(screen.getByText(v.legend)).toBeTruthy();
    expect(screen.getByText(v.help)).toBeTruthy();
    const note = screen.getByLabelText(v.noteLabel) as HTMLTextAreaElement;
    expect([note.value, note.placeholder]).toEqual([v.note, v.placeholder]);
    expect([(screen.getByRole("checkbox", { name: STEEL }) as HTMLInputElement).checked, (screen.getByRole("textbox", { name: STEEL }) as HTMLTextAreaElement).value]).toEqual([v.steel.on, v.steel.text]);
    expect([(screen.getByRole("checkbox", { name: PROXY }) as HTMLInputElement).checked, (screen.getByRole("textbox", { name: PROXY }) as HTMLTextAreaElement).value]).toEqual([v.proxy.on, v.proxy.text]);
    const q = within(pad());
    const pressed = (group: string) => within(q.getByRole(group === "Skizzenwerkzeuge" ? "toolbar" : "group", { name: group })).getByRole("button", { pressed: true }).getAttribute("aria-label");
    expect([pressed("Skizzenwerkzeuge"), pressed("Strichstärke"), pressed("Farben")]).toEqual([TOOLS.find((t) => t.tool === v.sketch.tool)!.label, SIZES.find((s) => String(s.size) === v.sketch.size)!.label, COLORS.find((c) => c.color === v.sketch.color)!.label]);
    for (const text of [v.sketch.title, v.sketch.subtitle, v.sketch.hint]) expect(q.getByText(text)).toBeTruthy();
    // and nothing else of the offer changes
    const el = (scenario as { elsewhere?: Record<string, unknown> }).elsewhere ?? {};
    expect(Object.fromEntries(Object.keys(base).filter((k) => k !== "bwt" && !same(base[k], offer()[k])).map((k) => [k, changed(base[k] as never, offer()[k])]))).toEqual(el);
  });
});

describe("free items — rules", () => {
  it("prices are read like today's parseMoneyEuro", () => {
    expect([parseMoney("799,00"), parseMoney("1.234,56"), parseMoney("799.5"), parseMoney("ab 12,5 €"), parseMoney("0"), parseMoney("-5"), parseMoney("")]).toEqual([799, 1234.56, 799.5, 12.5, 0, 0, 0]);
  });
  it("stored rows come back as typed text; empty rows are not stored", () => {
    const stored = storedRows([{ name: " A ", price: "10,5", qty: "2", id: " X " }, { name: "", price: "", qty: "", id: "" }]);
    expect(stored).toEqual([{ kind: "bwt-extra", label: "A", productId: "X", qty: 2, price: 10.5 }]);
    expect(rowsOf({ quickAdd: stored }, null)).toEqual([{ name: "A", price: "10,5", qty: "2", id: "X" }]);
    expect(storedRows([{ name: "", price: "", qty: "", id: "" }])).toBeUndefined();
  });
});

describe("free items — fixed against today's UI", () => {
  it("leaving the price fills the quantity with 1 (an item without quantity is not priced)", async () => {
    await open();
    fireEvent.change(cellOf(0, "price"), { target: { value: "799,00" } });
    expect(cellOf(0, "qty").value).toBe("");
    fireEvent.blur(cellOf(0, "price"));
    await waitFor(() => expect(offer().bwt.quickAdd[0]).toMatchObject({ price: 799, qty: 1 }));
    fireEvent.change(cellOf(0, "qty"), { target: { value: "3" } });
    fireEvent.blur(cellOf(0, "price"));
    expect(offer().bwt.quickAdd[0].qty).toBe(3);
  });
  it('"+" adds a row only when the last one has a price and an id; the trash can removes or clears', async () => {
    await open();
    const user = userEvent.setup(), add = () => user.click(screen.getByRole("button", { name: "Weitere Position hinzufügen" }));
    await add();
    expect(rowEls()).toHaveLength(1);
    fireEvent.change(cellOf(0, "price"), { target: { value: "10" } });
    await add();
    expect(rowEls()).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(cellOf(0, "id")));
    fireEvent.change(cellOf(0, "id"), { target: { value: "A1" } });
    await add();
    expect(rowEls()).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(cellOf(1, "price")));
    fireEvent.change(cellOf(1, "name"), { target: { value: "Zweiter" } });
    expect(offer().bwt.quickAdd.map((q: { label: string }) => q.label)).toEqual(["", "Zweiter"]);
    await user.click(within(rowEls()[0]!).getByRole("button", { name: "Diese Zeile entfernen" }));
    expect(rowEls()).toHaveLength(1);
    expect(offer().bwt.quickAdd.map((q: { label: string }) => q.label)).toEqual(["Zweiter"]);
    await user.click(within(rowEls()[0]!).getByRole("button", { name: "Diese Zeile entfernen" }));
    expect([rowEls().length, cellOf(0, "name").value, "quickAdd" in offer().bwt]).toEqual([1, "", false]);
  });
});
