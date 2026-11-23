// Badelift (step `bl`) must store and show what today's UI does for the same inputs. Reference:
// fixtures/badelift.json, recorded from today's UI by v2/scripts/capture-badelift.cjs; real stored
// offers: fixtures/badelift-old-offers.json (anonymised). The test environment has no canvas
// (see wv-skizze.test.tsx).
import { emptyOffer } from "@oc/domain";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { ADD_WARNING, PRODUCTS, formOf, quickAddOf } from "../src/features/steps/bl/rules.js";
import { statuses } from "../src/features/steps/status.js";
import { toast } from "../src/shared/ui/toaster.js";
import reference from "./fixtures/badelift.json" with { type: "json" };
import old from "./fixtures/badelift-old-offers.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as F;
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as F)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const png = (b: F = {}) => (b.sketch?.dataUrl?.startsWith?.("data:image/png") ? { ...b, sketch: { ...b.sketch, dataUrl: "<png>" } } : b);
const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, name) => (typeof name === "string" ? () => {} : undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,TEST");
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 280, right: 600, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
  vi.spyOn(toast, "warning");
});
afterEach(() => { cleanup(); useOfferStore.getState().close(); vi.restoreAllMocks(); });

/** a new Badelift offer on the step, or a stored one (`payload`) opened from its draft */
async function open(payload?: F, price: unknown = { total: 10, selfPayAmount: 0 }) {
  const server = fakeServer({
    ...BASE, "POST /api/price": { body: price },
    ...(payload ? { "GET /api/deals/4711/draft": { body: { dealId: "4711", revision: 3, offerType: "bl", payload, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}),
  });
  const router = renderApp(payload ? "/deal/4711/bl/bl" : `/deal/${KEY}/bl/bl`);
  await screen.findByTestId("bl-step");
  return { server, router, base: structuredClone(offer()) };
}
const card = (id: string) => screen.getAllByTestId("bl-card").find((c) => c.dataset.id === id)!;
const titleOf = (id: string) => PRODUCTS.find((p) => p.id === id)!.title;
const rowEls = () => screen.getAllByTestId("bl-row");
const FIELD: Record<string, string> = { name: "Bezeichnung", price: "Preis (netto)", qty: "Menge", id: "Artikel-ID" };
const cellOf = (i: number, f: string) => within(rowEls()[i]!).getByLabelText(FIELD[f]!) as HTMLInputElement;
const pointer = (type: string, [x, y]: number[]) => fireEvent(screen.getByTestId("sketch-pad").querySelector("canvas")!, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

async function play(steps: unknown[][], router: { state: { location: { pathname: string } } }) {
  const user = userEvent.setup();
  let next: string | null = null;
  for (const [kind, a, b, c] of steps as [string, any, any, any][]) {
    if (kind === "tick") await user.click(within(card(a)).getByRole("checkbox"));
    else if (kind === "qty") fireEvent.change(screen.getByLabelText(`Menge ${titleOf(a)}`), { target: { value: b } });
    else if (kind === "row") fireEvent.change(cellOf(a, b), { target: { value: c } });
    else if (kind === "add") await user.click(screen.getByRole("button", { name: "Weitere Position hinzufügen" }));
    else if (kind === "remove") await user.click(within(rowEls()[a]!).getByRole("button", { name: "Diese Zeile entfernen" }));
    else if (kind === "note") fireEvent.change(screen.getByLabelText("Hinweise / Notizen"), { target: { value: a } });
    else if (kind === "stroke") { pointer("pointerdown", a[0]); for (const p of a.slice(1)) pointer("pointermove", p); pointer("pointerup", a[a.length - 1]); }
    else if (kind === "next") { await user.click(screen.getAllByRole("button", { name: "Weiter" })[0]!); await waitFor(() => expect(router.state.location.pathname).not.toMatch(/\/bl$/)); next = router.state.location.pathname.split("/").pop()!; }
    else if (kind === "open" || kind === "payer" || kind === "auf") continue; // opened before / steps of Kundendaten (Kosten scenarios)
    else throw new Error(`step not handled: ${kind}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return next;
}

/** what the page shows, in the shape of the recording */
function view() {
  const imgSrc = (s: string) => s.replace(/^\.\//, "/");
  return {
    cards: screen.getAllByTestId("bl-card").map((c) => {
      const p = PRODUCTS.find((x) => x.id === c.dataset.id)!, box = within(c).getByRole("checkbox") as HTMLInputElement, qty = within(c).getByLabelText(`Menge ${p.title}`) as HTMLInputElement, img = c.querySelector("img")!;
      return { productId: p.id, value: box.getAttribute("aria-label"), title: c.querySelector('[data-part="title"]')!.textContent, sub: c.querySelector('[data-part="sub"]')!.textContent, checked: box.checked, qty: qty.value, qtyDisabled: qty.disabled, img: img.getAttribute("src"), alt: img.alt, qtyLabel: "Menge" };
    }),
    rows: rowEls().map((_, i) => Object.fromEntries(Object.keys(FIELD).map((f) => [f, cellOf(i, f).value]))),
    imgSrc,
  };
}
const expectedView = (v: F) => ({
  cards: v.cards.map((c: F) => ({ ...c, img: String(c.img).replace(/^\.\//, "/") })),
  rows: v.rows,
});

describe("Badelift stores and shows what today's UI does", () => {
  it("a new offer starts with today's `bl`, and the page shows today's texts", async () => {
    const { base } = await open();
    expect(sorted(base.bl)).toEqual(reference.base);
    const v = reference.scenarios[0]!.view as F;
    for (const t of [v.heading, ...v.sections, v.legend, v.sketch.title, v.sketch.subtitle, v.sketch.hint]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByTestId("bl-free").querySelector("#bl-quickadd-help")!.textContent!.replace(/\s+/g, " ").trim()).toBe(v.help);
    expect(rowEls()[0]!.querySelectorAll("input").length).toBe(4);
    expect(Object.keys(FIELD).map((f) => cellOf(0, f).placeholder)).toEqual(v.placeholders);
    expect(Object.values(FIELD)).toEqual(v.fieldLabels);
    const note = screen.getByLabelText(v.noteLabel) as HTMLTextAreaElement;
    expect(note.placeholder).toBe(v.notePlaceholder);
    const preview = screen.getByRole("complementary", { name: "Großansicht Hauptprodukt" }).querySelector("img")!;
    expect([preview.getAttribute("src"), preview.alt]).toEqual([v.preview.src.replace(/^\.\//, "/"), v.preview.alt]);
  });

  const OPENED = (s: { steps: unknown[][] }) => s.steps[0]?.[0] === "open";
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const s = scenario as unknown as F;
    const stored = OPENED(s) ? { ...emptyOffer("bl", { date: "2026-11-19" }), bl: s.steps[0][1] } : undefined;
    const { router, base } = await open(stored);
    const next = await play(s.steps, router);
    if (s.next) { expect(next).toBe(s.next); return; }
    const opened = OPENED(s) && s.steps.length === 1;
    // stored: as today's page after the same steps; an offer only opened stays as stored (see below)
    await waitFor(() => expect(sorted(png(plain(offer().bl)))).toEqual(opened ? sorted(s.steps[0][1]) : s.stored));
    // nothing else of the offer changes (the Kosten scenarios' Kundendaten steps are not played here)
    if (!s.steps.some(([k]: unknown[]) => k === "payer" || k === "auf")) {
      const elsewhere = Object.keys(base).filter((k) => k !== "bl" && !same(base[k], offer()[k]));
      expect(elsewhere).toEqual(Object.keys(s.elsewhere ?? {}));
    }
    const v = view();
    expect({ cards: v.cards, rows: v.rows }).toEqual(expectedView(s.view));
    expect((screen.getByLabelText("Hinweise / Notizen") as HTMLTextAreaElement).value).toBe(s.view.note);
    const warned = (s.view.toasts as string[][]).filter((t) => t.includes(ADD_WARNING));
    expect(vi.mocked(toast.warning).mock.calls.length).toBe(warned.length);
    if (warned.length) expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("Hinweis", { description: ADD_WARNING });
  });
});

describe("Badelift — old stored offers", () => {
  const offers = old.offers as unknown as { id: string; payload: F }[];
  it.each(offers.map((o) => [o.id, o] as const))("%s opens with its products ticked and is stored unchanged; the price request carries it as stored", async (_id, o) => {
    const { server } = await open(structuredClone(o.payload));
    const want = (o.payload.bl.quickAdd as F[]).filter((q) => q.kind === "bl-item").map((q) => q.productId);
    expect(view().cards.filter((c) => c.checked).map((c) => c.productId)).toEqual(PRODUCTS.map((p) => p.id).filter((id) => want.includes(id)));
    await waitFor(() => expect(server.count("POST /api/price")).toBeGreaterThan(0));
    expect(sorted(offer())).toEqual(sorted(o.payload));
    const body = server.calls.filter((c) => c.key === "POST /api/price").at(-1)!.body as F;
    expect(sorted(body.bl)).toEqual(sorted(o.payload.bl));
    // a change on the page writes `bl` as today's page builds it from the same state
    const user = userEvent.setup();
    await user.click(within(card("BRS-802")).getByRole("checkbox"));
    await user.click(within(card("BRS-802")).getByRole("checkbox"));
    expect(sorted(offer().bl)).toEqual(sorted({ ...(quickAddOf(formOf(o.payload.bl)) ? { quickAdd: quickAddOf(formOf(o.payload.bl)) } : {}), blNote: o.payload.bl.blNote ?? "", sketch: { json: o.payload.bl.sketch?.json ?? "", dataUrl: o.payload.bl.sketch?.dataUrl ?? "" } }));
    expect(sorted(offer().bl)).toEqual(sorted(o.payload.bl)); // the real offers are in today's shape: unchanged after on + off
  });
});

describe("Badelift — price and step list", () => {
  it("one price request per change, carrying the new `bl`", async () => {
    const { server } = await open();
    await waitFor(() => expect(server.count("POST /api/price")).toBe(1));
    await userEvent.setup().click(within(card("BRS-909")).getByRole("checkbox"));
    await waitFor(() => expect(server.count("POST /api/price")).toBe(2));
    await new Promise((r) => setTimeout(r, 400));
    expect(server.count("POST /api/price")).toBe(2);
    expect((server.calls.at(-1)!.body as F).bl.quickAdd.map((q: F) => q.productId)).toEqual(["BRS-912", "BRS-909"]);
    // typing a free item: a few letters in quick succession are one request
    for (const t of ["S", "Si", "Sit", "Sitz"]) fireEvent.change(cellOf(0, "name"), { target: { value: t } });
    await new Promise((r) => setTimeout(r, 400));
    expect(server.count("POST /api/price")).toBe(3);
  });
  it("step list: Badelift is done while something is chosen, open when nothing is", () => {
    const o = emptyOffer("bl", { date: "" }) as F;
    expect(statuses("bl", o, null).bl).toEqual({ kind: "done" });
    expect(statuses("bl", { ...o, bl: { blNote: "", sketch: { json: "", dataUrl: "" } } }, null).bl).toEqual({ kind: "open" });
  });
  it("„+“ on an incomplete row warns and adds nothing (as today)", async () => {
    await open();
    await act(async () => { await userEvent.setup().click(screen.getByRole("button", { name: "Weitere Position hinzufügen" })); });
    expect(rowEls()).toHaveLength(1);
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("Hinweis", { description: ADD_WARNING });
  });
});
