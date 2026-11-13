// "Skizze und Notiz" on the Wandverkleidung step must store and show what today's UI does for
// the same inputs. Reference: fixtures/wv-skizze.json, recorded from today's UI by
// v2/scripts/capture-wv-skizze.cjs. The test environment has no canvas: drawing calls go to a
// stand-in and the picture is a fixed PNG address — what is compared are the stored operations.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { COLORS, SIZES, TOOLS, hasSketch, opsOf } from "../src/shared/ui/sketch-pad.js";
import reference from "./fixtures/wv-skizze.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const calls: string[] = [];
beforeEach(() => {
  calls.length = 0;
  const ctx = new Proxy({}, { get: (_t, name) => (typeof name === "string" ? (..._a: unknown[]) => { calls.push(name); } : undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,TEST");
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 280, right: 600, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
});

async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return structuredClone(offer());
}
const pad = () => screen.getByTestId("sketch-pad");
const canvas = () => pad().querySelector("canvas")!;
const pointer = (type: string, [x, y]: number[]) => fireEvent(canvas(), new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
async function play(steps: unknown[][]) {
  const user = userEvent.setup();
  for (const [kind, a] of steps as [string, any][]) {
    if (kind === "on") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "open") { await user.click(screen.getByText("Skizze und Notiz")); await screen.findByTestId("sketch-pad"); }
    else if (kind === "tool") await user.click(within(pad()).getByRole("button", { name: TOOLS.find((t) => t.tool === a)!.label }));
    else if (kind === "size") await user.click(within(pad()).getByRole("button", { name: SIZES.find((s) => s.size === a)!.label }));
    else if (kind === "color") await user.click(within(pad()).getByRole("button", { name: COLORS.find((c) => c.color === a)!.label }));
    else if (kind === "undo") await user.click(within(pad()).getByRole("button", { name: "Rückgängig" }));
    else if (kind === "clear") await user.click(within(pad()).getByRole("button", { name: "Skizze löschen" }));
    else if (kind === "note") fireEvent.change(screen.getByLabelText("Notizen / Beschreibung zur Wandverkleidung"), { target: { value: a } });
    else if (kind === "stroke") { pointer("pointerdown", a[0]); for (const p of a.slice(1)) pointer("pointermove", p); pointer("pointerup", a[a.length - 1]); }
    else if (kind === "tap") { pointer("pointerdown", a); pointer("pointerup", a); }
    else throw new Error(`step not handled: ${kind}`);
    await new Promise((r) => setTimeout(r, 0)); // the pad hands the drawing back after it is painted
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
/** as recorded: the picture is megabytes of PNG — only whether there is one */
const png = (wv: Record<string, any>) => {
  const out = { ...wv }, mark = (v: unknown) => (typeof v === "string" && v.startsWith("data:image/png") ? "<png>" : v);
  if ("wvSketchDataUrl" in out) out.wvSketchDataUrl = mark(out.wvSketchDataUrl);
  if (out.sketch && typeof out.sketch === "object") out.sketch = { ...out.sketch, dataUrl: mark(out.sketch.dataUrl) };
  return out;
};
const SKETCH = ["sketch", "wvSketchJson", "wvSketchDataUrl", "wvNote", "wvEnabled"];
const only = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => SKETCH.includes(k)));

describe("Skizze und Notiz store and show what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as unknown[][]);
    await waitFor(() => expect(only(changed(png(base.wandverkleidung), png(offer().wandverkleidung)))).toEqual(only(scenario.wandverkleidung)));

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Wandverkleidung" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByTestId("wv-sketch")).toBe(v.shown);
    if (!v.shown) return; // Wandverkleidung off: nothing but the switch
    expect([(screen.getByTestId("wv-sketch") as HTMLDetailsElement).open, screen.getByTestId("wv-sketch").querySelector("summary")!.textContent]).toEqual([v.open, v.summary]);
    const q = within(pad());
    expect([...TOOLS.map((t) => t.label), "Rückgängig"].filter((name) => q.queryByRole("button", { name }))).toEqual(v.tools);
    expect(SIZES.map((s) => `${s.size}:${q.getByRole("button", { name: s.label }).textContent}:${s.label}`)).toEqual(v.sizes);
    expect(COLORS.map((c) => `${c.color}:${q.getByRole("button", { name: c.label }).getAttribute("aria-label")}`)).toEqual(v.colors);
    const pressed = (group: string) => within(q.getByRole(group === "Skizzenwerkzeuge" ? "toolbar" : "group", { name: group })).getByRole("button", { pressed: true }).getAttribute("aria-label");
    expect([pressed("Skizzenwerkzeuge"), pressed("Strichstärke"), pressed("Farben")]).toEqual([TOOLS.find((t) => t.tool === v.tool)!.label, SIZES.find((s) => String(s.size) === v.size)!.label, COLORS.find((c) => c.color === v.color)!.label]);
    for (const text of [v.title, v.subtitle, v.hint]) expect(q.getByText(text)).toBeTruthy();
    expect(q.getByRole("button", { name: v.clear })).toBeTruthy();
    const note = screen.getByLabelText(v.noteLabel) as HTMLTextAreaElement;
    expect([note.value, note.placeholder]).toEqual([v.note, v.placeholder]);
  });
});

describe("Skizze und Notiz — rules", () => {
  it("an opened offer with a sketch or a note shows the section open; an empty one folded", async () => {
    await open();
    await play([["on"]]);
    expect((screen.getByTestId("wv-sketch") as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByTestId("sketch-pad")).toBeNull();
    useOfferStore.getState().patch("wandverkleidung" as never, { wvNote: "Vorwand" } as never);
    await screen.findByTestId("sketch-pad");
    expect((screen.getByLabelText("Notizen / Beschreibung zur Wandverkleidung") as HTMLTextAreaElement).value).toBe("Vorwand");
  });

  it("a stored drawing is painted when the pad opens, and a new stroke is added to it", async () => {
    await open();
    const stroke = { type: "stroke", tool: "pen", color: "#dc2626", size: 7, points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] };
    const json = JSON.stringify({ version: 1, ops: [stroke] });
    useOfferStore.getState().patch("wandverkleidung" as never, { wvEnabled: true, sketch: { json, dataUrl: "data:image/png;base64,OLD" }, wvSketchJson: json } as never);
    await screen.findByTestId("sketch-pad");
    await waitFor(() => expect(calls.filter((c) => c === "stroke").length).toBeGreaterThan(0)); // drawn
    await play([["stroke", [[50, 50], [70, 70]]]]);
    await waitFor(() => expect(JSON.parse(offer().wandverkleidung.sketch.json).ops.map((o: { color: string }) => o.color)).toEqual(["#dc2626", "#0f172a"]));
    expect(offer().wandverkleidung.wvSketchJson).toBe(offer().wandverkleidung.sketch.json);
  });

  it("stored sketches: operations, a picture only, or nothing", () => {
    expect(opsOf({ json: '{"version":1,"ops":[{"type":"line","color":"#000","size":4,"from":{"x":1,"y":1},"to":{"x":2,"y":2}}]}' }).map((o) => o.type)).toEqual(["line"]);
    expect(opsOf({ json: '{"version":1,"ops":[]}', dataUrl: "data:image/png;base64,X" })).toEqual([{ type: "image", dataUrl: "data:image/png;base64,X" }]);
    expect(opsOf({ json: "not json", dataUrl: "" })).toEqual([]);
    expect([hasSketch(null), hasSketch({ json: '{"version":1,"ops":[]}' }), hasSketch({ dataUrl: "data:image/png;base64,X" })]).toEqual([false, false, true]);
  });
});
