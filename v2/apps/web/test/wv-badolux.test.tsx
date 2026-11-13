// Wandverkleidung, line Badolux (Keramico), must store and show what today's UI does for the
// same inputs. Reference: fixtures/wv-badolux.json, recorded from today's UI by
// v2/scripts/capture-wv-badolux.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { suggestion } from "../src/features/steps/arbeiten/rules.js";
import { BX_ACCESSORIES, DECORS, addRow, fromRows, rowTitle, rowsOf, setBxQty, toggleBx, withDecor } from "../src/features/steps/wandverkleidung/keramico.js";
import { ACCESSORIES, chooseLine } from "../src/features/steps/wandverkleidung/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/wv-badolux.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const LINE: Record<string, RegExp> = { ww: /^winwall/, premium: /^VIGOUR/, standard: /^Badolux/ };
const WALL: Record<string, string> = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
const SIT: Record<string, string> = { wand: "Eine Wand", ecke: "Ecke", u: "Nische / U-Form" };
const caption = (id: string) => [...ACCESSORIES, ...BX_ACCESSORIES].find((a) => a.id === id)!.caption;
const box = (testId: string) => screen.getByTestId(testId).querySelector('input[type="checkbox"]') as HTMLInputElement;

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
  renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return structuredClone(offer());
}
const wall = (key: string) => screen.getAllByTestId("kc-wall").find((w) => w.dataset.wall === key)!;
const tile = (root: Element, n: number) => root.querySelector(`button[data-value="${DECORS[n - 1]!.value}"]`)!;
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "line") await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: LINE[a as string]! }));
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Farbe oder Sonder-Dekor)" }));
    else if (kind === "row") await user.click(screen.getAllByTestId("bx-row")[Number(a) - 1]!.querySelector("button")!);
    else if (kind === "tile") await user.click(tile(screen.getByTestId("bx-tiles"), Number(a)));
    else if (kind === "sonder") await user.click(tile(screen.getByTestId("bx-tiles"), 7));
    else if (kind === "name") await user.type(screen.getByLabelText("Motiv / Name"), String(a));
    else if (kind === "qty") await user.click(screen.getByRole("button", { name: `Zeile ${a}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "row-") await user.click(screen.getByRole("button", { name: `Zeile ${a} entfernen` }));
    else if (kind === "acc") await user.click(box(`wv-acc-${a}`));
    else if (kind === "seal") await user.click(box("wv-acc-sealing"));
    else if (kind === "accqty" || kind === "bxqty") await user.click(screen.getByRole("button", { name: `Menge ${caption(String(a))}: ${b === "+" ? "mehr" : "weniger"}` }));
    else if (kind === "fold") await user.click(screen.getByRole("button", { name: /^Badolux-Zubehör/ }));
    else if (kind === "bx") await user.click(box(`bx-acc-${a}`));
    else if (kind === "sit") await user.click(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { name: SIT[a as string]! }));
    else if (kind === "width") fireEvent.change(screen.getByLabelText(`Breite ${WALL[a as string]} in cm`), { target: { value: b } });
    else if (kind === "height") fireEvent.change(screen.getByLabelText("Höhe der Verkleidung"), { target: { value: a } });
    else if (kind === "wall") await user.click(screen.getByRole("button", { name: `Dekor für ${WALL[a as string]} wählen` }));
    else if (kind === "decor") await user.click(tile(wall(String(a)).querySelector('[data-testid="kc-tiles"]')!, Number(b)));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => el.querySelector(`[data-part="${name}"]`)?.textContent ?? "";

describe("Wandverkleidung, line Badolux, stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps);
    await waitFor(() => expect(changed(base.wandverkleidung, offer().wandverkleidung)).toEqual(scenario.wandverkleidung));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit); // panels and silicone in the work-time suggestion

    const v = scenario.view;
    expect((screen.getByRole("switch", { name: "Wandverkleidung" }) as HTMLInputElement).checked).toBe(v.on);
    if (!v.on) return; // off: only the switch
    expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(LINE[v.line]!);
    if (v.line !== "standard") return; // the other lines have their own tests

    expect(screen.queryAllByTestId("bx-row").map((r) => ({ title: part(r, "title"), small: part(r, "note"), qty: part(r, "qty"), open: r.dataset.open === "true" }))).toEqual(v.rows);
    expect(screen.queryByText("Noch keine Paneele. Mit „+ Zeile hinzufügen“ beginnen.")?.textContent ?? "").toBe(v.rowsEmpty);
    expect(!!screen.queryByTestId("bx-tiles")).toBe(v.tilesShown);
    if (v.tilesShown) expect(Array.from(screen.getByTestId("bx-tiles").querySelectorAll('button[aria-pressed="true"]')).map((b) => (b as HTMLElement).dataset.value)).toEqual(v.tileActive);
    expect(!!screen.queryByTestId("bx-sonder")).toBe(!!v.sonder);
    if (v.sonder) {
      expect(squeeze(v.sonder.text)).toBe(squeeze(screen.getByTestId("bx-sonder").textContent));
      expect((screen.getByLabelText("Motiv / Name") as HTMLInputElement).value).toBe(v.sonder.name);
    }
    // winwall's accessories, used for Keramico: no cutting service
    expect(screen.getByTestId("wv-acc-label").textContent!.toUpperCase()).toBe(v.accLabel);
    for (const a of v.acc) {
      const id = a.id.replace(/^wvWw_?/, "");
      if (id === "Cut") { expect(!!screen.queryByTestId("wv-acc-cut")).toBe(a.shown); continue; }
      const row = screen.getByTestId(id === "Sealing" ? "wv-acc-sealing" : `wv-acc-${id}`), qty = row.querySelector('input[type="number"]') as HTMLInputElement;
      expect([a.id, (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, qty.value, part(row, "caption"), part(row, "small").trim()]).toEqual([a.id, a.checked, a.qty, a.caption, a.small]);
      if (id === "Sealing") expect(qty.placeholder).toBe(a.placeholder);
    }
    // Badolux accessories: folded until used
    expect(screen.getByRole("button", { name: /^Badolux-Zubehör/ }).getAttribute("aria-expanded")).toBe(String(v.bxOpen));
    if (v.bxOpen) for (const a of v.bx) {
      const row = screen.getByTestId(`bx-acc-${a.id.replace("wvBx_", "")}`);
      expect([a.id, (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, (row.querySelector('input[type="number"]') as HTMLInputElement).value, part(row, "caption"), part(row, "small")]).toEqual([a.id, a.checked, a.qty, a.caption, a.small]);
    }

    // the calculator on this line (today's page shows no introduction here — React does)
    const c = v.calc;
    expect(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { pressed: true }).textContent).toBe(SIT[c.sit]);
    expect(screen.getAllByTestId("kc-wall").map((w) => ({ key: w.dataset.wall, sub: part(w, "sub"), decor: part(w, "decor"), width: (w.querySelector('input[type="number"]') as HTMLInputElement).value, open: w.dataset.open === "true" }))).toEqual(c.walls);
    expect(screen.getAllByTestId("kc-wall").filter((w) => w.querySelector('[data-testid="kc-tiles"]')).map((w) => w.dataset.wall)).toEqual(c.tilesUnder);
    expect([(screen.getByLabelText("Höhe der Verkleidung") as HTMLInputElement).value, screen.queryByTestId("kc-warn")?.textContent ?? "", screen.queryByTestId("kc-hlabel")?.textContent ?? ""]).toEqual([c.height, c.warn, c.heightLabel]);
    expect(squeeze(screen.queryByTestId("kc-cuts")?.textContent)).toBe(squeeze(c.cutList));
    expect(screen.queryAllByTestId("kc-piece").map((p) => ({ plate: p.dataset.plate, cut: p.dataset.cut === "true" }))).toEqual(c.pieces);
    expect(screen.queryAllByTestId("kc-mark").map((m) => m.textContent)).toEqual(c.marks.map(squeeze));
  });

  it("the decor tiles are today's", () => {
    expect(DECORS.map(({ value, caption }) => ({ value, caption }))).toEqual(reference.tiles.map(({ value, caption }) => ({ value, caption })));
  });
});

describe("Wandverkleidung, line Badolux — rules", () => {
  it("rows ↔ fields: the first row names the offer's colour; adhesive 2 per panel, profiles panels − 1", () => {
    const rows = [{ pid: "WP003", name: "Standard-Dekor grau", qty: 2 }, { pid: "WP007", name: "Octopus Flow", qty: 1 }];
    const f = fromRows({}, rows);
    expect([f.wvColor, f.wvWwQty_R_4260602, f.wvWwQty_WS80113, f.wvWw_WS80113, f.wvSilikonSelected]).toEqual(["WP003|Standard-Dekor grau", "6", "2", "on", true]);
    expect(rowsOf(f)).toEqual(rows);
    expect(rows.map(rowTitle)).toEqual(["grau", "Octopus Flow"]);
    expect(rowTitle(withDecor(rows[0]!, DECORS[6]!.value))).toBe("Sonder-Dekor");
    expect(addRow(rows)[2]).toEqual({ pid: "WP007", name: "Octopus Flow", qty: 1 });
  });

  it("the first panel switches the consumables on, the last one going switches them off; in between a switch stays as set", () => {
    const one = fromRows({}, [{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 1 }]);
    const two = fromRows({ ...one, wvSilikonSelected: false }, [{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 2 }]);
    expect("wvSilikonSelected" in two).toBe(false);
    const none = fromRows(one, []);
    expect([none.wvKRows, none.wvSealingSelected, none.wvFlachenSelected, none.wvWwQty_R_4260602, "wvColor" in none]).toEqual(["[]", false, false, "0", false]);
  });

  it("an older offer without rows but with a Keramico decor has one row", () => {
    expect(rowsOf({ wvColor: "WP002|Standard-Dekor steingrau", wvKQty: "3" })).toEqual([{ pid: "WP002", name: "Standard-Dekor steingrau", qty: 3 }]);
    expect(rowsOf({ wvColor: "WP002|Standard-Dekor steingrau", wvKBack: "180" })[0]!.qty).toBe(2);
    expect(rowsOf({ wvColor: "Marmor weiß" })).toEqual([]);
  });

  it("a Badolux accessory: on gives one or keeps the number, off gives none", () => {
    expect([toggleBx({}, "PR47VBM02", true), toggleBx({ wvBxQty_PR47VBM02: "3" }, "PR47VBM02", true), setBxQty("PR47VBM02", 0)]).toEqual([
      { wvBxQty_PR47VBM02: "1", wvBx_PR47VBM02: "on" }, { wvBxQty_PR47VBM02: "3", wvBx_PR47VBM02: "on" }, { wvBxQty_PR47VBM02: "0", wvBx_PR47VBM02: undefined }]);
  });

  it("the work-time suggestion counts the Keramico panels only on the line Badolux", () => {
    const wv = { wvEnabled: true, wvBudgetMode: "1", wvSilikonSelected: true, wvKRows: JSON.stringify([{ pid: "WP001", name: "x", qty: 2 }, { pid: "WP007", name: "y", qty: 1 }]) };
    expect((suggestion({}, {}, [{ key: "wvKeramico", label: "old", minutes: 30, qty: 9 }], wv).autoSuggestedTasks as { key: string; minutes: number; qty: number }[]).map((r) => [r.key, r.minutes, r.qty])).toEqual([["wvKeramico", 30, 3], ["Silikon", 10, 1]]);
    expect(suggestion({}, {}, [], { ...wv, wvBudgetMode: undefined, wvSilikonSelected: false }).autoSuggestedTasks).toEqual([]);
  });

  it("leaving Badolux with rows takes the colour and the consumables along; they are not parked", () => {
    const wv = { wvBudgetMode: "1", ...fromRows({}, [{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 1 }]) };
    const r = chooseLine(wv, "ww", {});
    expect([r.changes.wvColor, r.changes.wvSilikonSelected, r.changes.wvKRows, "wvColor" in r.parked.standard!, r.parked.standard!.wvSilikonSelected]).toEqual(["", false, undefined, false, true]);
  });
});
