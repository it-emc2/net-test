// Wandverkleidung, lines VIGOUR and Badolux: the simple view (owner 2026-11-25, "same as winwall").
// It is a view over the rows of the row editor (panels.ts): the same choice made in either stores the
// same fields and gives the same price; an offer is opened without a change; rows the view cannot
// express open the row editor with a hint. The row editor itself is replayed in wv-vigour / wv-badolux.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPricingEngine } from "@oc/pricing";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import * as bx from "../src/features/steps/wandverkleidung/keramico.js";
import * as pv from "../src/features/steps/wandverkleidung/panels.js";
import * as vg from "../src/features/steps/wandverkleidung/vigour.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

type Fields = Record<string, any>;
const offer = () => useOfferStore.getState().offer as Fields;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const LINE = { premium: /^VIGOUR/, standard: /^Badolux/ } as const;
let n = 0;
const key = () => `t-${String(++n).padStart(24, "0")}`;

/** a new offer, the Wandverkleidung switched on, the line chosen */
async function fresh(line: keyof typeof LINE) {
  cleanup();
  fakeServer(BASE);
  renderApp(`/deal/${key()}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
  await user.click(screen.getByTestId("wv-line-row"));
  await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: LINE[line] }));
  return user;
}
/** a saved offer (draft) with these Wandverkleidung fields, opened on the step */
async function opened(wv: Fields) {
  cleanup();
  const payload = { activeOffer: "bu", wandverkleidung: wv }, deal = String(4700 + ++n);
  fakeServer({ ...BASE, [`GET /api/deals/${deal}/draft`]: { body: { dealId: deal, offerType: "bu", payload, revision: 3, updatedAt: "2026-11-25T10:00:00Z", updatedBy: "x" } } });
  renderApp(`/deal/${deal}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return userEvent.setup();
}
const view = (id: string) => screen.getByTestId(id);
const chips = (id: string) => screen.getAllByTestId(`${id}-tab`).map((t) => ({ text: flat(t.querySelector('[data-part="text"]')!.textContent), pressed: t.getAttribute("aria-pressed") === "true" }));
const plates = (id: string) => screen.getAllByTestId(`${id}-plate`).map((p) => [flat(p.querySelector('[data-part="size"]')!.textContent), flat(p.querySelector('[data-part="qty"]')!.textContent)]);
const tile = (id: string, code: string) => within(view(`${id}-colors`)).getByRole("radiogroup").querySelector(`[data-code="${code}"]`)!;

// prices: one engine, a fixed price per article (the same for both ways of choosing)
const engine = createPricingEngine({
  find: (q: { productId: { $in: string[] } }) => ({ lean: async () => (q?.productId?.$in ?? []).map((id) => ({ productId: id, name: id, price: 40 + id.length })) }),
  findOne: (q: { productId: string }) => ({ lean: async () => ({ productId: q.productId, name: q.productId, price: 40 + q.productId.length }) }),
} as never, { cfg: { get: (_k: string, fb?: unknown) => fb }, fetchVigourNetPrices: async (ids: string[]) => new Map(ids.map((id) => [id, 100 + id.length])) } as never);
async function priced(o: Fields) {
  const r = (await engine.computePrices(structuredClone(o))) as Fields;
  const lines = (r.materials?.lines ?? []).filter((l: Fields) => l.category === "Wandverkleidung").map((l: Fields) => [l.label, l.qty, l.unitPrice, l.lineTotal]);
  return { lines, total: r.total };
}

describe("VIGOUR simple view", () => {
  it("opens by default: colour chip, both widths to scale, sum; − / + per width and colour write the rows", async () => {
    const user = await fresh("premium");
    expect(screen.queryByTestId("vg-row")).toBeNull();
    expect(screen.queryByTestId("kc-note")).toBeNull(); // calculator and rows are behind the link
    expect(chips("vgs")).toEqual([{ text: "Marmor weiß · 0 Stk", pressed: true }]);
    expect(plates("vgs")).toEqual([["997 × 2550 mm", "0"], ["1497 × 2550 mm", "0"]]);
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 1497 × 2550 mm" }));
    expect(flat(view("vgs-total").textContent)).toBe("3 Paneele · 8,9 m²");
    expect(vg.rowsOf(offer().wandverkleidung)).toEqual([{ size: 997, qty: 2, color: "Marmor weiß" }, { size: 1497, qty: 1, color: "Marmor weiß" }]);
    // a second colour
    await user.click(screen.getByRole("button", { name: "+ weitere Farbe" }));
    await user.click(tile("vgs", "Stein grau"));
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    expect(chips("vgs")).toEqual([{ text: "Marmor weiß · 3 Stk", pressed: false }, { text: "Stein grau · 1 Stk", pressed: true }]);
    expect(flat(view("vgs-total").textContent)).toBe("4 Paneele · 11,44 m² · 2 Farben");
    expect(vg.rowsOf(offer().wandverkleidung)).toEqual([{ size: 997, qty: 2, color: "Marmor weiß" }, { size: 997, qty: 1, color: "Stein grau" }, { size: 1497, qty: 1, color: "Marmor weiß" }]);
    expect([offer().wandverkleidung.wvColor, offer().wandverkleidung.wvQty997, offer().wandverkleidung.extraColors["997x2550"]]).toEqual(["Marmor weiß", "2", [{ color: "Stein grau", qty: 1 }]]);
    // a tile changes the colour of the open chip; 0 removes the row
    await user.click(tile("vgs", "Aragon grau"));
    expect(vg.rowsOf(offer().wandverkleidung)[1]).toEqual({ size: 997, qty: 1, color: "Aragon grau" });
    await user.click(screen.getByRole("button", { name: "Weniger 997 × 2550 mm" }));
    expect(vg.rowsOf(offer().wandverkleidung)).toEqual([{ size: 997, qty: 2, color: "Marmor weiß" }, { size: 1497, qty: 1, color: "Marmor weiß" }]);
    // remove a colour: its rows go
    await user.click(screen.getByRole("button", { name: "Mehr 1497 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "Farbe Aragon grau entfernen" }));
    expect(chips("vgs")).toEqual([{ text: "Marmor weiß · 3 Stk", pressed: true }]);
    expect(vg.rowsOf(offer().wandverkleidung)).toEqual([{ size: 997, qty: 2, color: "Marmor weiß" }, { size: 1497, qty: 1, color: "Marmor weiß" }]);
    // Sonderdruck: its configuration number as in the row editor
    await user.click(tile("vgs", vg.SONDER));
    expect(screen.getByTestId("vgs-sonder")).toBeTruthy();
    // the row editor is behind the link, with the same rows; back again
    await user.click(screen.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }));
    expect(screen.getAllByTestId("vg-row").map((r) => r.dataset.color)).toEqual([vg.SONDER, vg.SONDER]);
    expect(screen.getByTestId("kc-note")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Zur neuen Ansicht wechseln (Paneele + Farbe)" }));
    expect(chips("vgs")).toEqual([{ text: "Sonderdruck (Vigour) · 3 Stk", pressed: true }]);
    expect(offer().wandverkleidung.wvUi).toBe("simple"); // the choice of view is not stored
  }, 30000);

  it("the same choice in the row editor stores the same fields and gives the same price", async () => {
    let user = await fresh("premium");
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 1497 × 2550 mm" }));
    await user.click(screen.getByRole("button", { name: "+ weitere Farbe" }));
    await user.click(tile("vgs", "Stein grau"));
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    const simple = structuredClone(offer());

    user = await fresh("premium");
    await user.click(screen.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }));
    const add = () => user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Farbe oder Sonderdruck)" }));
    await add();
    await user.click(screen.getByRole("button", { name: "Zeile 1: mehr" }));
    await add();
    await user.click(screen.getByTestId("vg-tiles").querySelector('button[data-value="Stein grau"]')!);
    await add();
    await user.click(screen.getByTestId("vg-tiles").querySelector('button[data-value="Marmor weiß"]')!);
    await user.click(within(screen.getByRole("radiogroup", { name: "Breite Zeile 3" })).getByRole("radio", { name: "Breite Zeile 3: 1497 × 2550 mm" }));
    const rows = structuredClone(offer());

    expect(simple.wandverkleidung).toEqual(rows.wandverkleidung);
    expect(simple.Arbeitszeit).toEqual(rows.Arbeitszeit);
    const [a, b] = [await priced(simple), await priced(rows)];
    expect(a.lines.filter((l: unknown[]) => /Wandverkleidung 3\.0/.test(String(l[0])) && Number(l[3]) > 0)).toHaveLength(3); // the panels, priced; the rest are the accessories
    expect(a).toEqual(b);
  }, 30000);

  it("a saved offer opens in the simple view without a change", async () => {
    const wv = { wvEnabled: true, wvSupplier: "hm", wvUi: "", ...vg.fromRows({}, [{ size: 997, qty: 2, color: "Stein grau" }, { size: 997, qty: 1, color: "Weiß" }, { size: 1497, qty: 1, color: "Weiß" }, { size: 1497, qty: 2, color: "Stein grau" }]) };
    await opened(wv);
    const before = structuredClone(offer());
    expect(chips("vgs")).toEqual([{ text: "Stein grau · 4 Stk", pressed: true }, { text: "Weiß · 2 Stk", pressed: false }]);
    expect(plates("vgs")).toEqual([["997 × 2550 mm", "2"], ["1497 × 2550 mm", "2"]]);
    await new Promise((r) => setTimeout(r, 50));
    expect(offer()).toEqual(before);
    expect(useOfferStore.getState().version).toBe(0); // nothing to save
    // an edit keeps the order per width (1497: Weiß is the main panel, Stein grau its extra colour)
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mehr 997 × 2550 mm" }));
    expect(vg.rowsOf(offer().wandverkleidung)).toEqual([{ size: 997, qty: 3, color: "Stein grau" }, { size: 997, qty: 1, color: "Weiß" }, { size: 1497, qty: 1, color: "Weiß" }, { size: 1497, qty: 2, color: "Stein grau" }]);
  });

  it("two rows of one colour and width: the row editor opens, with a hint, nothing changed", async () => {
    const wv = { wvEnabled: true, wvSupplier: "hm", ...vg.fromRows({}, [{ size: 997, qty: 2, color: "Weiß" }, { size: 997, qty: 1, color: "Weiß" }]) };
    await opened(wv);
    const before = structuredClone(offer());
    expect(screen.getByTestId("vgs-rows-only").textContent).toMatch(/^Zwei Zeilen haben dieselbe Farbe und Breite/);
    expect(screen.getAllByTestId("vg-row")).toHaveLength(2);
    expect(screen.queryByTestId("vgs")).toBeNull();
    expect(screen.queryByRole("button", { name: "Zur neuen Ansicht wechseln (Paneele + Farbe)" })).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(offer()).toEqual(before);
    expect(useOfferStore.getState().version).toBe(0);
    // put right in the rows: the editor stays, the way to the simple view appears
    await userEvent.setup().click(screen.getByRole("button", { name: "Zeile 2 entfernen" }));
    expect(screen.queryByTestId("vgs-rows-only")).toBeNull();
    expect(screen.getByRole("button", { name: "Zur neuen Ansicht wechseln (Paneele + Farbe)" })).toBeTruthy();
    expect(screen.getAllByTestId("vg-row")).toHaveLength(1);
  });

  it("an order per width the view would not write back: the row editor opens", async () => {
    // offer colour Weiß; 997: Stein grau is the main panel, Weiß an extra colour
    const wv = { wvEnabled: true, wvSupplier: "hm", ...vg.fromRows({}, [{ size: 1497, qty: 1, color: "Weiß" }, { size: 997, qty: 1, color: "Stein grau" }, { size: 997, qty: 1, color: "Weiß" }]) };
    expect((wv as Fields).wvColor).toBe("Weiß");
    await opened(wv);
    expect(screen.getByTestId("vgs-rows-only").textContent).toMatch(/^Die Farben stehen je Breite in einer Reihenfolge/);
    expect(screen.getAllByTestId("vg-row")).toHaveLength(3);
  });
});

describe("Badolux simple view", () => {
  it("opens by default: decor chip, the one panel to scale, sum; chips, tiles and Sonder-Dekor write the rows", async () => {
    const user = await fresh("standard");
    expect(screen.queryByTestId("bx-row")).toBeNull();
    expect(chips("bxs")).toEqual([{ text: "Marmor weiß · 0 Stk", pressed: true }]);
    expect(plates("bxs")).toEqual([["95 × 255 cm", "0"]]);
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    await user.click(tile("bxs", bx.DECORS[2]!.value));
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    expect(chips("bxs")).toEqual([{ text: "Marmor weiß · 2 Stk", pressed: false }, { text: "grau · 1 Stk", pressed: true }]);
    expect(flat(view("bxs-total").textContent)).toBe("3 Paneele · 7,27 m² · 2 Dekore");
    expect(bx.rowsOf(offer().wandverkleidung)).toEqual([{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 2 }, { pid: "WP003", name: "Standard-Dekor grau", qty: 1 }]);
    // the Sonder-Dekor: its shop box and motif name for the open chip
    await user.click(tile("bxs", bx.DECORS[6]!.value));
    await user.type(within(screen.getByTestId("bxs-sonder")).getByLabelText("Motiv / Name"), "Octopus Flow");
    expect(bx.rowsOf(offer().wandverkleidung)[1]).toEqual({ pid: "WP007", name: "Octopus Flow", qty: 1 });
    expect(chips("bxs")[1]!.text).toBe("Octopus Flow · 1 Stk");
    // the Sonder tile on a motif keeps the motif
    await user.click(tile("bxs", bx.DECORS[6]!.value));
    expect(bx.rowsOf(offer().wandverkleidung)[1]!.name).toBe("Octopus Flow");
    // remove a decor
    await user.click(screen.getByRole("button", { name: "Dekor Octopus Flow entfernen" }));
    expect(bx.rowsOf(offer().wandverkleidung)).toEqual([{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 2 }]);
    await user.click(screen.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }));
    expect(screen.getAllByTestId("bx-row")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Zur neuen Ansicht wechseln (Paneele + Dekor)" })).toBeTruthy();
  }, 30000);

  it("the same choice in the row editor stores the same fields and gives the same price", async () => {
    let user = await fresh("standard");
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    await user.click(tile("bxs", bx.DECORS[2]!.value));
    await user.click(screen.getByRole("button", { name: "Mehr 95 × 255 cm" }));
    const simple = structuredClone(offer());

    user = await fresh("standard");
    await user.click(screen.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }));
    const add = () => user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Farbe oder Sonder-Dekor)" }));
    await add();
    await user.click(screen.getByRole("button", { name: "Zeile 1: mehr" }));
    await add();
    await user.click(screen.getByTestId("bx-tiles").querySelector(`button[data-value="${bx.DECORS[2]!.value}"]`)!);
    const rows = structuredClone(offer());

    expect(simple.wandverkleidung).toEqual(rows.wandverkleidung);
    expect(simple.Arbeitszeit).toEqual(rows.Arbeitszeit);
    const [a, b] = [await priced(simple), await priced(rows)];
    expect(a.lines.filter((l: unknown[]) => /Wandpaneel/.test(String(l[0])) && Number(l[3]) > 0)).toHaveLength(2); // the panels, priced; the rest are the accessories
    expect(a).toEqual(b);
  }, 30000);

  it("a saved offer opens without a change — also an older one without rows", async () => {
    for (const wv of [
      { wvEnabled: true, wvBudgetMode: "1", ...bx.fromRows({}, [{ pid: "WP002", name: "Standard-Dekor steingrau", qty: 2 }, { pid: "WP007", name: "Octopus Flow", qty: 1 }]) },
      { wvEnabled: true, wvBudgetMode: "1", wvColor: "WP002|Standard-Dekor steingrau", wvKQty: "3" },
    ]) {
      await opened(wv);
      const before = structuredClone(offer());
      expect(screen.getByTestId("bxs")).toBeTruthy();
      await new Promise((r) => setTimeout(r, 50));
      expect(offer()).toEqual(before);
      expect(useOfferStore.getState().version).toBe(0);
    }
    expect(chips("bxs")).toEqual([{ text: "steingrau · 3 Stk", pressed: true }]);
  });

  it("two rows of one decor: the row editor opens, with a hint", async () => {
    await opened({ wvEnabled: true, wvBudgetMode: "1", ...bx.fromRows({}, [{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 1 }, { pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 2 }]) });
    const before = structuredClone(offer());
    expect(screen.getByTestId("bxs-rows-only").textContent).toMatch(/^Zwei Zeilen haben dasselbe Dekor/);
    expect(screen.getAllByTestId("bx-row")).toHaveLength(2);
    await waitFor(() => expect(offer()).toEqual(before));
    expect(useOfferStore.getState().version).toBe(0);
  });
});

describe("rows ↔ simple view (panels.ts)", () => {
  const S = ["997", "1497"];
  const r = (key: string, size: string, qty: number): pv.PRow => ({ key, size, qty });

  it("load: one chip per colour in row order, the offer's colour first, numbers summed per width", () => {
    const rows = [r("A", "997", 2), r("B", "997", 1), r("B", "1497", 3)];
    expect(pv.load(rows, S, "X")).toEqual({ groups: [{ key: "A", qty: { 997: 2, 1497: 0 } }, { key: "B", qty: { 997: 1, 1497: 3 } }], active: 0 });
    expect(pv.load(rows, S, "X", "B").groups.map((g) => g.key)).toEqual(["B", "A"]);
    expect(pv.load([], S, "X")).toEqual({ groups: [{ key: "X", qty: { 997: 0, 1497: 0 } }], active: 0 });
    // a chip without panels stays while the page is open
    expect(pv.load(rows, S, "X", null, { groups: [{ key: "C", qty: { 997: 0, 1497: 0 } }], active: 2 }).groups.map((g) => g.key)).toEqual(["A", "B", "C"]);
  });

  it("save: n > 0 is a row, 0 none; per width the stored order stays, new colours in chip order; the first chip leads", () => {
    const rows = [r("A", "997", 2), r("B", "997", 1), r("B", "1497", 3)];
    const s = pv.load(rows, S, "X");
    expect(pv.save(s.groups, rows, S)).toEqual(rows);
    expect(pv.unchanged(pv.save(s.groups, rows, S), rows, S)).toBe(true);
    // A gets a 1497: in chip order before B
    expect(pv.save(pv.step(s, "1497", 1).groups, rows, S)).toEqual([r("A", "997", 2), r("B", "997", 1), r("A", "1497", 1), r("B", "1497", 3)]);
    // 0 removes the row
    expect(pv.save(pv.step({ ...s, active: 1 }, "997", -1).groups, rows, S)).toEqual([r("A", "997", 2), r("B", "1497", 3)]);
    // a stored order against chip order stays (1497: B main, A extra)
    const odd = [r("A", "997", 1), r("B", "1497", 1), r("A", "1497", 1)];
    expect(pv.save(pv.load(odd, S, "X").groups, odd, S)).toEqual(odd);
    // the first chip with panels leads (it names the offer's colour)
    expect(pv.save([{ key: "A", qty: { 997: 0, 1497: 1 } }, { key: "B", qty: { 997: 1, 1497: 0 } }], [], S)).toEqual([r("A", "1497", 1), r("B", "997", 1)]);
    // two chips of one colour are one row
    expect(pv.save([{ key: "A", qty: { 997: 1, 1497: 0 } }, { key: "A", qty: { 997: 2, 1497: 0 } }], [], S)).toEqual([r("A", "997", 3)]);
  });

  it("rowsOnly: duplicates and an order the view would change; else none", () => {
    expect(pv.rowsOnly([r("A", "997", 1), r("B", "997", 1), r("B", "1497", 1)], S)).toBeNull();
    expect(pv.rowsOnly([r("A", "997", 1), r("A", "997", 2)], S)).toBe("dup");
    expect(pv.rowsOnly([r("B", "997", 1), r("A", "997", 1), r("A", "1497", 1)], S, "A")).toBe("order");
    expect(pv.rowsOnly([], S)).toBeNull();
  });

  it("pick, add, remove, rename, total", () => {
    const s: pv.PView = { groups: [{ key: "A", qty: { 997: 1, 1497: 0 } }, { key: "B", qty: { 997: 0, 1497: 0 } }], active: 1 };
    expect(pv.pick(s, "A")).toEqual({ next: { ...s, active: 0 }, moved: false });
    expect(pv.pick(s, "C").next.groups[1]!.key).toBe("C");
    expect(pv.pick(s, "B").moved).toBe(false);
    expect(pv.addGroup(s, ["A", "B", "C"], S)).toEqual({ groups: [...s.groups, { key: "C", qty: { 997: 0, 1497: 0 } }], active: 2 });
    expect(pv.removeGroup(s, 1)).toEqual({ groups: [s.groups[0]], active: 0 });
    expect(pv.rename(s, "Z").groups[1]!.key).toBe("Z");
    expect(pv.totalOf(s, { 997: 2.54235, 1497: 3.81735 }, "Farben")).toBe("1 Paneel · 2,54 m² · 2 Farben");
  });

  it("VIGOUR fields → view → fields: the same rows", () => {
    const rows = [{ size: 997 as const, qty: 2, color: "Stein grau" }, { size: 997 as const, qty: 1, color: "Weiß" }, { size: 1497 as const, qty: 1, color: "Weiß" }];
    const wv = vg.fromRows({}, rows);
    const p = vg.rowsOf(wv).map((x) => ({ key: x.color, size: String(x.size), qty: x.qty }));
    const back = pv.save(pv.load(p, S, "X", String(wv.wvColor)).groups, p, S).map((x) => ({ size: Number(x.size) as 997 | 1497, qty: x.qty, color: x.key }));
    expect(vg.fromRows(wv, back)).toEqual(vg.fromRows(wv, rows));
  });
});
