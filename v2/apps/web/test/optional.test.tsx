// Optionale Produkte (Badumbau) must store and show what today's UI does for the same inputs.
// Reference: fixtures/optional.json, recorded from today's UI by v2/scripts/capture-optional.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { arbeitenChanges, chooseKind, optChanges, suggestion, syncTasks, toggleTask } from "../src/features/steps/arbeiten/rules.js";
import { CATEGORIES } from "../src/features/steps/optional/catalog.js";
import {
  NO_UI, addRow, basinOf, cardOn, changedFields, chips, closeCard, count, editBasin, editRow, fitsMount, isLocked, isOn, leaveQty, money, openCard, optionalProblem, productOf, qtyLabel,
  removeChip, removeRow, rowsOf, setMount, setQty, toggleProduct, type State,
} from "../src/features/steps/optional/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/optional.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim(); // as recorded: any white space is one blank
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const byId = (testId: string, id: unknown) => screen.getAllByTestId(testId).find((e) => e.dataset.id === String(id))!;
const input = (el: Element, sel: string) => el.querySelector(sel) as HTMLInputElement;

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
  const router = renderApp(`/deal/${KEY}/bu/Optional`);
  await screen.findByRole("heading", { name: "Optionale Produkte" });
  return { base: structuredClone(offer()), router };
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  const type = (el: HTMLInputElement, text: unknown) => { fireEvent.change(el, { target: { value: String(text) } }); fireEvent.blur(el); };
  for (const [kind, a, b, c] of steps) {
    const o = offer();
    if (kind === "kind") useOfferStore.getState().patchAll(arbeitenChanges(o, chooseKind(o.duschwanne, String(a)))); // chosen on the Arbeiten step
    else if (kind === "cat") await user.click(byId("opt-card", a));
    else if (kind === "done") await user.click(screen.getByRole("button", { name: "Fertig" }));
    else if (kind === "close") await user.click(screen.getByRole("button", { name: "Schließen" }));
    else if (kind === "backdrop") await user.click(screen.getByTestId("opt-backdrop"));
    else if (kind === "esc") await user.keyboard("{Escape}");
    else if (kind === "tile") await user.click(input(byId("opt-tile", a), 'input[type="checkbox"]'));
    else if (kind === "qty") type(input(document.body, `#qty_${a}`), b);
    else if (kind === "mount") await user.click(input(screen.getByRole("dialog"), `input[type="radio"][value="${a}"]`));
    else if (kind === "chip") await user.click(within(screen.getAllByTestId("opt-chip").find((x) => part(x, "text") === a)!).getByRole("button"));
    else if (kind === "row") type(input(screen.getAllByTestId("opt-row")[Number(a) - 1]!, `[data-field="${b}"]`), c);
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Weitere Position hinzufügen" }));
    else if (kind === "row-") await user.click(screen.getAllByRole("button", { name: "Diese Zeile entfernen" })[Number(a) - 1]!);
    else if (kind === "bs") type(input(screen.getByTestId("opt-free-basin"), `[data-field="${a}"]`), b);
    else if (kind === "next" || kind === "nextkey") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));

interface Tile { id: string; name: string; on: boolean; locked: boolean; qty: string | null; qtyLabel: string | null }
interface View {
  step: string; said: unknown[];
  cards: { id: string; on: boolean; badge: string; counted: boolean }[];
  bar: { head: string; chips: { text: string; title: string }[] } | null;
  dialog: null | {
    title: string; cat: string; mount: { value: string; hint: boolean } | null; tiles: Tile[]; headings: string[]; linked: string[] | null;
    freeBasin: { name: string; artikel: string; price: string; qty: string } | null; rows: { name: string; price: string; qty: string; id: string }[] | null;
  };
}
function dialogNow(): View["dialog"] {
  const dialog = screen.queryByRole("dialog");
  if (!dialog) return null;
  const panel = within(dialog).getByTestId("opt-panel"), cat = panel.dataset.cat!;
  const basin = panel.querySelector('[data-testid="opt-free-basin"]');
  const value = (el: Element, f: string) => input(el, `[data-field="${f}"]`).value;
  return {
    title: flat(dialog.querySelector("#opt-dialog-title")?.textContent), cat,
    mount: cat === "SHOWER" ? { value: (panel.querySelector('input[type="radio"]:checked') as HTMLInputElement | null)?.value ?? "", hint: !!panel.querySelector('[data-part="mount-hint"]') } : null,
    tiles: Array.from(panel.querySelectorAll<HTMLElement>('[data-testid="opt-tile"]')).map((t) => {
      const box = input(t, 'input[type="checkbox"]'), qty = t.querySelector<HTMLInputElement>('input[type="number"]');
      return { id: t.dataset.id!, name: part(t, "name"), on: box.checked, locked: box.disabled, qty: qty ? qty.value : null, qtyLabel: qty ? part(t, "qty-label") : null };
    }),
    headings: Array.from(panel.querySelectorAll("h4")).map((h) => flat(h.textContent)),
    linked: panel.querySelector('[data-testid="opt-linked"]') ? Array.from(panel.querySelectorAll('[data-testid="opt-linked"] > span')).map((x) => flat(x.textContent)) : null,
    freeBasin: basin ? { name: value(basin, "name"), artikel: value(basin, "artikel"), price: value(basin, "price"), qty: input(panel, "#qty_BASIN_SONDER").value } : null,
    rows: cat === "SONDER" ? Array.from(panel.querySelectorAll('[data-testid="opt-row"]')).map((r) => ({ name: value(r, "name"), price: value(r, "price"), qty: value(r, "qty"), id: value(r, "id") })) : null,
  };
}

describe("Optionale Produkte stores and shows what today's UI does", () => {
  it("the cards are today's, in today's order", async () => {
    await open();
    expect(screen.getAllByTestId("opt-card").map((c) => [c.dataset.id, part(c, "name")])).toEqual(reference.cards);
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base, router } = await open();
    await play(scenario.steps as (string | number)[][]);
    const elsewhere = ("elsewhere" in scenario ? scenario.elsewhere : {}) as Record<string, unknown>;
    await waitFor(() => expect(changed(base.optional, offer().optional)).toEqual(scenario.optional));
    for (const k of new Set([...Object.keys(base), ...Object.keys(offer())])) if (k !== "optional") expect([k, changed(base[k], offer()[k])]).toEqual([k, elsewhere[k] ?? {}]); // the tasks and the work time follow; nothing else changes

    const v = scenario.view as unknown as View;
    await waitFor(() => expect(router.state.location.pathname.split("/")[4]).toBe(v.step)); // "Weiter" asks for nothing on this step
    expect(v.said).toEqual([]);
    if (v.step !== "Optional") return; // gone on: the next step is on the page
    expect(screen.getAllByTestId("opt-card").map((c) => ({ id: c.dataset.id, on: c.getAttribute("aria-pressed") === "true", badge: part(c, "badge"), counted: c.querySelector('[data-part="badge"]')!.getAttribute("data-counted") === "true" })).filter((c) => c.on || c.counted || c.badge !== "✓ 0")).toEqual(v.cards);
    const bar = screen.queryByTestId("opt-bar");
    expect(bar ? { head: part(bar, "head"), chips: within(bar).getAllByTestId("opt-chip").map((c) => ({ text: part(c, "text"), title: flat(c.title) })) } : null).toEqual(v.bar && { head: v.bar.head, chips: v.bar.chips.map((c) => ({ text: c.text, title: flat(c.title) })) });
    expect(dialogNow()).toEqual(v.dialog);
  });
});

describe("Optionale Produkte — beyond today's page", () => {
  it("REHA has a search; the two categories that are not rebuilt lead to today's view", async () => {
    await open();
    await play([["cat", "REHA"]]);
    const search = screen.getByRole("searchbox", { name: "Produkte filtern" }) as HTMLInputElement;
    expect([search.placeholder, screen.getAllByTestId("opt-tile").length]).toEqual(["Suchen… (45 Produkte)", 45]);
    fireEvent.change(search, { target: { value: "  badeBRETT " } });
    expect(screen.getAllByTestId("opt-tile").map((t) => t.dataset.id)).toEqual(["78061000", "78058100", "78059100"]);
    await play([["tile", "78058100"]]);
    fireEvent.change(search, { target: { value: "gibt es nicht" } });
    expect([screen.queryAllByTestId("opt-tile").length, within(screen.getByRole("dialog")).getByRole("status").textContent]).toEqual([0, "Keine Produkte gefunden."]);
    await play([["done"], ["cat", "GRAB"]]);
    expect(screen.queryByRole("searchbox")).toBeNull(); // short lists have none
    await play([["done"]]);
    expect(document.activeElement).toBe(byId("opt-card", "GRAB")); // back on the card
    expect((offer().optional["optReha[]"] as string[]).length).toBe(1); // the pick made while searching stays
    for (const cat of ["WANNE", "WC"]) {
      await play([["cat", cat]]);
      expect(within(screen.getByRole("dialog")).getByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toBeInTheDocument();
      await play([["done"]]);
      expect(byId("opt-card", cat).getAttribute("aria-pressed")).toBe("false"); // left empty: not ticked
    }
  });
});

describe("Optionale Produkte — rules", () => {
  const fresh = (): State => ({ opt: { quickAdd: [], qty_CL60: "0", qty_CLTB: "0" }, ui: NO_UI });
  const ids = (s: State, group: string) => (s.opt[group] as string[] | undefined)?.map((v) => v.split(" ").pop());

  it("a product: ticked with quantity 1, unticked 0, its list in page order and gone when empty", () => {
    let s = toggleProduct(toggleProduct(fresh(), "CLPESG80"), "CLPESG30");
    expect([ids(s, "optGrab[]"), s.opt.qty_CLPESG30, s.opt.qty_CLPESG80]).toEqual([["CLPESG30", "CLPESG80"], "1", "1"]);
    s = toggleProduct(setQty(s, "CLPESG30", "4"), "CLPESG30");
    expect([ids(s, "optGrab[]"), s.opt.qty_CLPESG30]).toEqual([["CLPESG80"], "0"]);
    s = toggleProduct(s, "CLPESG80");
    expect(["optGrab[]" in s.opt, isOn(s.opt, "CLPESG80"), count(s, "GRAB"), cardOn(s, "GRAB")]).toEqual([false, false, 0, true]); // the card stays ticked until its dialog is left
    expect(cardOn(closeCard(s, "GRAB"), "GRAB")).toBe(false);
    const old = toggleProduct({ opt: { "optGrab[]": ["ein alter Griff", productOf("CLPESG80")!.value] }, ui: NO_UI }, "CLPESG30");
    expect(old.opt["optGrab[]"]).toEqual([productOf("CLPESG30")!.value, productOf("CLPESG80")!.value, "ein alter Griff"]); // a value the page does not know stays
  });

  it("REHA: every product also as opt_<article>; seven of them without a quantity", () => {
    const s = toggleProduct(toggleProduct(fresh(), "78061000"), "24081000");
    expect([s.opt.opt_78061000, s.opt.qty_78061000, s.opt.opt_24081000, s.opt.qty_24081000]).toEqual([true, undefined, true, "1"]);
    expect("opt_24081000" in toggleProduct(s, "24081000").opt).toBe(false);
  });

  it("only one shower system and one thermostat; the others are locked", () => {
    const s = toggleProduct(fresh(), "DEPTB");
    expect([isLocked(s.opt, "CLTB"), isLocked(s.opt, "DEPTB"), isLocked(s.opt, "CLPESG30")]).toEqual([true, false, false]);
    expect(ids(toggleProduct(s, "CLB"), "optThermo[]")).toEqual(["CLB"]); // reached only from an older offer: the other one goes
  });

  it("the tap: the answer decides the systems shown, brings hose and thermostat, and takes its own thermostat back", () => {
    const shower = CATEGORIES.find((c) => c.id === "SHOWER")!.products;
    let s = setMount(fresh(), "versetzt");
    expect([ids(s, "optShower[]"), ids(s, "optThermo[]"), s.ui.autoThermo, shower.filter((p) => fitsMount(s.opt, p)).length]).toEqual([["DESIBS160"], ["CLTB"], "CLTB", 4]);
    expect(setMount(s, "versetzt")).toBe(s); // the same answer again: nothing happens
    s = setMount(toggleProduct(s, "V22BG903R"), "direkt");
    expect([s.opt["optShower[]"], s.opt["optThermo[]"], s.opt.showerMount, s.ui.autoThermo]).toEqual([undefined, undefined, "direkt", null]);
    const own = setMount(setMount(toggleProduct(fresh(), "DEPTB"), "versetzt"), "direkt");
    expect(ids(own, "optThermo[]")).toEqual(["DEPTB"]); // a thermostat picked by hand stays
    const older: State = { opt: { "optShower[]": [productOf("STRAYT")!.value] }, ui: NO_UI };
    expect(shower.filter((p) => fitsMount(older.opt, p)).map((p) => p.id)).toEqual(["STRAYT"]); // no answer yet: only the ticked ones
    expect([optionalProblem(older)?.message.startsWith("Duschsystem:"), optionalProblem(s), optionalProblem(fresh())]).toEqual([true, null, null]);
    expect(closeCard(setMount(openCard(fresh(), "SHOWER"), "direkt"), "SHOWER").opt.showerMount).toBeUndefined(); // left without a system: the answer goes too
  });

  it("wash basins: fixing set and siphon per basin, two angle valves; set again with every basin change; gone with the last basin", () => {
    let s = setQty(toggleProduct(fresh(), "CL60"), "CL60", "2");
    expect([s.opt.qty_WTBF, s.opt.qty_RSL, s.opt.qty_EV, count(s, "BASIN")]).toEqual(["2", "2", "4", 4]);
    s = setQty(toggleProduct(setQty(s, "WTBF", "9"), "EV"), "CL60", "");
    expect([s.opt.qty_CL60, s.opt.qty_WTBF, s.opt.qty_EV, isOn(s.opt, "EV")]).toEqual(["1", "1", "0", false]); // an emptied quantity is 1; the valve stays off
    s = toggleProduct(toggleProduct(s, "ON35"), "CL60");
    expect([s.opt.qty_WTBF, isOn(s.opt, "WTBF")]).toEqual(["2", true]); // one of two off: the accessories stay as they are
    s = toggleProduct(s, "ON35");
    expect([s.opt["optBasinAcc[]"], s.opt.qty_WTBF, s.opt.qty_RSL]).toEqual([undefined, "0", "0"]);
    expect(qtyLabel({ qty_EV: "3" }, productOf("EV")!)).toBe("Menge (1.5 paare)");
    expect(qtyLabel({ qty_TECEADS: "" }, productOf("TECEADS")!)).toBe("Menge TECEADS (0 paare)");
  });

  it("accessories that come with a product follow its quantity while it is ticked", () => {
    let s = setQty(toggleProduct(fresh(), "WESGH"), "WESGH", "3");
    expect([s.opt.qty_TRGAVS15, s.opt.qty_INSTMATROH, count(s, "WESGH")]).toEqual(["3", "3", 3]);
    s = toggleProduct(s, "WESGH");
    expect([isOn(s.opt, "TRGAVS15"), s.opt.qty_TRGAVS15]).toEqual([true, "3"]); // they stay when the product goes
  });

  it("free items: quickAdd holds the complete rows; quantity 1 by itself; a further row needs name, price and article", () => {
    let s = editRow(openCard(fresh(), "SONDER"), 0, "name", " Spiegel ");
    expect([s.opt.quickAdd, addRow(s).missing, count(s, "SONDER")]).toEqual([[], "price", 1]);
    s = editRow(s, 0, "price", "1.234,56");
    expect([rowsOf(s)[0]!.qty, s.opt.quickAdd, addRow(s).missing]).toEqual(["1", [{ label: "Spiegel", price: 1234.56, qty: 1, productId: "" }], "id"]);
    s = leaveQty(editRow(editRow(s, 0, "id", "A1"), 0, "qty", "0"), 0);
    expect(rowsOf(s)[0]!.qty).toBe("1"); // a 0 is never kept
    s = addRow(editRow(s, 0, "qty", "3x")).state;
    expect([rowsOf(s).length, (s.opt.quickAdd as { qty: number }[])[0]!.qty]).toEqual([2, 3]);
    expect([rowsOf(removeRow(s, 0)).length, rowsOf(removeRow(removeRow(s, 1), 0))]).toEqual([1, [{ name: "", price: "", qty: "", id: "" }]]);
    expect(chips(s).map((c) => [c.text, c.title, c.row])).toEqual([["Spiegel", "Sonderprodukte: Spiegel", 0]]);
    expect(removeChip(s, chips(s)[0]!).opt.quickAdd).toEqual([]);
    const left = closeCard(editRow(openCard(fresh(), "SONDER"), 0, "price", "5"), "SONDER");
    expect([cardOn(left, "SONDER"), rowsOf(left)]).toEqual([false, [{ name: "", price: "", qty: "", id: "" }]]); // left without a name: the rows are gone
    expect([money("1.099,50"), money("1099.50"), money("12,2"), money("€ 7"), money("-3"), money("abc")]).toEqual([1099.5, 1099.5, 12.2, 7, 0, 0]);
  });

  it("the free wash basin: stored after the free items with its source; a dot in its price is read as thousands", () => {
    let s = editBasin(editBasin(toggleProduct(editRow(editRow(fresh(), 0, "name", "A"), 0, "price", "5"), "BASIN_SONDER"), "name", "Becken"), "price", "12.5");
    expect(s.opt.quickAdd).toEqual([{ label: "A", price: 5, qty: 1, productId: "" }, { label: "Becken", price: 125, qty: 1, productId: "", source: "BASIN_SONDER" }]);
    expect([isOn(s.opt, "WTBF"), s.opt.qty_EV]).toEqual([true, "2"]); // it brings the accessories like a basin
    s = toggleProduct(s, "BASIN_SONDER");
    expect([(s.opt.quickAdd as unknown[]).length, isOn(s.opt, "WTBF"), basinOf(s).name]).toEqual([1, false, "Becken"]); // what was typed stays on the page
  });

  it("an opened offer: rows, free wash basin, cards and bar come from what is stored", () => {
    const s: State = { ui: NO_UI, opt: {
      "optGrab[]": [productOf("CLPESG60")!.value], qty_CLPESG60: "2", chosenBathtubProductId: "BW170", "optWcWall[]": ["VIS WC-Element"], "optBasin[]": [productOf("BASIN_SONDER")!.value], qty_BASIN_SONDER: "1",
      quickAdd: [{ productId: "OPT-2", label: "Ablage", price: 35.5, qty: 2 }, { label: "Becken", price: 249.5, qty: 1, productId: "WS-1", source: "BASIN_SONDER" }],
    } };
    expect(rowsOf(s)).toEqual([{ name: "Ablage", price: "35,5", qty: "2", id: "OPT-2" }]);
    expect(basinOf(s)).toEqual({ name: "Becken", artikel: "WS-1", price: "249,5" });
    expect(CATEGORIES.filter((c) => cardOn(s, c.id)).map((c) => [c.id, count(s, c.id)])).toEqual([["GRAB", 1], ["BASIN", 1], ["WANNE", 1], ["WC", 1], ["SONDER", 1]]);
    expect(chips(s).map((c) => [c.cat, c.text, !!c.fixed])).toEqual([["GRAB", productOf("CLPESG60")!.name, false], ["BASIN", "Sonderprodukt (freier Posten)", false], ["WANNE", "BW170", true], ["WC", "VIS WC-Element", true], ["SONDER", "Ablage", false]]);
    expect(changedFields(s.opt, editRow(s, 0, "name", "Ablage").opt)).toEqual({}); // typing the same again changes nothing in the offer
    expect(changedFields({ a: 1, b: [1] }, { b: [1], c: 2 })).toEqual({ a: undefined, c: 2 });
  });

  it("the tasks follow the products once an Umbauart is chosen; a task changed by hand is left alone", () => {
    const opt = { "optShower[]": ["x"], showerMount: "direkt", "optThermo[]": ["t"], "optHebe[]": ["h"] };
    const dw = { umbauart: "ohne_rueckbau" };
    expect(syncTasks(dw, opt).workTasks).toEqual(["install_lifting_unit", "replace_thermostat", "replace_shower_with_thermo"]);
    expect(syncTasks({ ...dw, ...toggleTask(dw, "replace_shower_no_thermo", true) }, opt).workTasks).toEqual(["install_lifting_unit", "replace_thermostat", "replace_shower_no_thermo"]); // the sibling ticked by hand covers the system
    expect(syncTasks({ ...dw, workTasks: ["replace_thermostat", "install_sink"] }, {}).workTasks).toBeUndefined();
    expect(syncTasks({ ...dw, workTasks: ["install_sink"] }).workTasks).toEqual(["install_sink"]); // without the optional section its tasks are not touched
    expect(syncTasks({}, opt)).toEqual({}); // no Umbauart (older offers): nothing is ticked
    const o = { duschwanne: { umbauart: "ohne_rueckbau" }, optional: {}, Arbeitszeit: {} };
    expect(Object.keys(optChanges(o, { "optGrab[]": [productOf("CLPESG60")!.value], qty_CLPESG60: "2" }))).toEqual(["optional", "Arbeitszeit"]); // no task changes: the tasks are not written
    expect(optChanges(o, { "optHebe[]": ["h"] }).duschwanne).toEqual({ workTasks: ["install_lifting_unit"] });
  });

  it("the work time: a row per grab bar, after the rows of the other materials", () => {
    const opt = { "optGrab[]": [productOf("CLPESG30")!.value, productOf("CLPESG80")!.value], qty_CLPESG30: "", qty_CLPESG80: "3" };
    const stored = [{ key: "opt_CLPESG60", label: "old", minutes: 30, qty: 9 }, { key: "wallCladdingFloor", label: "Fußboden (Wandverkleidung)", minutes: 8, qty: 2 }];
    const rows = (s: Record<string, unknown>) => (s.autoSuggestedTasks as { key: string; minutes: number; qty: number }[]).map((r) => [r.key, r.minutes, r.qty]);
    expect(rows(suggestion({}, { grab: 20 }, stored, {}, opt))).toEqual([["wallCladdingFloor", 8, 2], ["opt_CLPESG30", 20, 1], ["opt_CLPESG80", 20, 3]]);
    expect(rows(suggestion({}, {}, stored, {}))).toEqual([["opt_CLPESG60", 30, 9], ["wallCladdingFloor", 8, 2]]); // without the optional section the stored rows stay
    expect(suggestion({}, {}, [], {}, opt).autoSuggestedHoursHHMM).toBe("02:00");
  });
});
