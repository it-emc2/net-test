// The wall calculator of the Wandverkleidung step (line winwall) must store and show what
// today's UI does for the same inputs. Reference: fixtures/wandrechner.json, recorded from
// today's UI by v2/scripts/capture-wandrechner.cjs.
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { cutList, planOf, wallDecorOf, wallRows } from "../src/features/steps/wandverkleidung/calc.js";
import { fromRows } from "../src/features/steps/wandverkleidung/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/wandrechner.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const WALL: Record<string, string> = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
const SIT: Record<string, string> = { wand: "Eine Wand", ecke: "Ecke", u: "Nische / U-Form" };

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
  renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return structuredClone(offer());
}
const wall = (key: string) => screen.getAllByTestId("kc-wall").find((w) => w.dataset.wall === key)!;
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "on") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "sit") await user.click(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { name: SIT[a as string]! }));
    else if (kind === "view") await user.click(within(screen.getByRole("group", { name: "Ansicht" })).getByRole("button", { name: a === "room" ? "Raumansicht" : "Nur Paneele" }));
    else if (kind === "width") fireEvent.change(screen.getByLabelText(`Breite ${WALL[a as string]} in cm`), { target: { value: b } });
    else if (kind === "height") fireEvent.change(screen.getByLabelText("Höhe der Verkleidung"), { target: { value: a } });
    else if (kind === "wall") await user.click(screen.getByRole("button", { name: `Dekor für ${WALL[a as string]} wählen` }));
    else if (kind === "decor") await user.click(wall(String(a)).querySelector(`[data-testid="kc-tiles"] button[data-value="${b}"]`)!);
    else if (kind === "same") await user.click(screen.getByRole("button", { name: "Alle Wände gleiches Dekor" }));
    else if (kind === "row+") await user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Dekor und Format)" }));
    else if (kind === "qty") await user.click(screen.getByRole("button", { name: `Zeile ${a}: ${b === "+" ? "mehr" : "weniger"}` }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => el.querySelector(`[data-part="${name}"]`)?.textContent ?? "";

describe("the wall calculator stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps);
    expect(changed(base.wandverkleidung, offer().wandverkleidung)).toEqual(scenario.wandverkleidung); // incl. the exact text of wvWallDecor and wvWwRows
    expect([changed(base.duschwanne, offer().duschwanne), changed(base.Arbeitszeit, offer().Arbeitszeit)]).toEqual([scenario.duschwanne, scenario.arbeitszeit]);

    const v = scenario.view;
    expect(screen.getByTestId("kc-note").textContent).toBe(v.note);
    expect(within(screen.getByRole("group", { name: "Wandsituation" })).getByRole("button", { pressed: true }).textContent).toBe(SIT[v.sit]);
    expect(within(screen.getByRole("group", { name: "Ansicht" })).getByRole("button", { pressed: true }).textContent).toBe(v.view === "room" ? "Raumansicht" : "Nur Paneele");
    expect(screen.getAllByTestId("kc-wall").map((w) => ({ key: w.dataset.wall, letter: part(w, "letter"), name: part(w, "name"), sub: part(w, "sub"), decor: part(w, "decor"), width: (w.querySelector('input[type="number"]') as HTMLInputElement).value, open: w.dataset.open === "true" }))).toEqual(v.walls);
    expect(screen.getAllByTestId("kc-wall").filter((w) => w.querySelector('[data-testid="kc-tiles"]')).map((w) => w.dataset.wall)).toEqual(v.tilesUnder);
    expect(!!screen.queryByRole("button", { name: "Alle Wände gleiches Dekor" })).toBe(v.sameButton);
    expect(Array.from(document.querySelectorAll('[data-testid="kc-tiles"] button[aria-pressed="true"]')).map((b) => (b as HTMLElement).dataset.value)).toEqual(v.tileActive);
    expect((screen.getByLabelText("Höhe der Verkleidung") as HTMLInputElement).value).toBe(v.height);
    expect(screen.queryByTestId("kc-warn")?.textContent ?? "").toBe(v.warn);
    expect(squeeze(screen.queryByTestId("kc-cuts")?.textContent)).toBe(squeeze(v.cutList));

    // the drawing: the same plates on the walls, the same cut ones, the same labels
    const svg = screen.getByTestId("kc-svg"), d = v.drawing;
    expect(screen.queryAllByTestId("kc-piece").map((p) => ({ plate: p.dataset.plate, cut: p.dataset.cut === "true", textured: p.dataset.textured === "true" }))).toEqual(d.pieces);
    expect(screen.queryAllByTestId("kc-mark").map((m) => m.textContent)).toEqual(d.marks);
    expect(screen.getAllByTestId("kc-badge").map((b) => b.textContent)).toEqual(d.badges);
    expect([screen.queryByTestId("kc-hlabel")?.textContent ?? "", svg.dataset.room === "true", svg.dataset.empty === "true"]).toEqual([d.heightLabel, d.room, d.empty]);

    // the rows the walls wrote
    expect(screen.queryAllByTestId("wv-row").map((r) => ({ title: part(r, "title"), fmt: r.querySelector("select")!.value, qty: part(r, "qty"), open: r.dataset.open === "true" }))).toEqual(v.rows);
  });
});

describe("the wall calculator — rules", () => {
  it("the plan is the price's: widest plates first, the narrowest fills up; low walls take the 205 cm plate", () => {
    expect([planOf({ wvKBack: "180" }).qty, planOf({ wvKBack: "260" }).qty, planOf({ wvKBack: "180", wvKHoehe: "200" }).qty]).toEqual([{ 15: 2, 16: 0, 17: 0 }, { 15: 0, 16: 1, 17: 1 }, { 13: 2 }]);
    expect(cutList(planOf({}))).toBeNull();
  });

  it("connecting profiles: the joints of the plan while the rows match it, else plates − 1", () => {
    const u = { wvKSituation: "u", wvKLinks: "90", wvKBack: "170", wvKRechts: "90" };
    const rows = [{ code: "WS203", fmt: "15", qty: 4 }];
    expect([fromRows(rows, planOf(u)).wvWwQty_WS80113, fromRows(rows, planOf({ wvKBack: "180" })).wvWwQty_WS80113, fromRows(rows).wvWwQty_WS80113]).toEqual(["1", "3", "3"]);
  });

  it("walls without a decor or without a width write no rows; a row added by hand stays", () => {
    expect(wallRows({ wvKBack: "180" }, wallDecorOf({}))).toBeNull();
    const wv = { wvKBack: "180", wvWallDecor: JSON.stringify({ line: "ww", back: "WS229" }), wvWwRows: JSON.stringify([{ code: "NW220", fmt: "17", qty: 1 }]) };
    expect(wallRows(wv, wallDecorOf(wv))!.rows.map((r) => `${r.code}|${r.fmt}|${r.qty}`)).toEqual(["WS229|15|2", "NW220|17|1"]);
    expect(wallDecorOf({ wvWallDecor: JSON.stringify({ line: "hm", back: "x" }) })).toEqual({ line: "ww" }); // another line's choice is ignored
  });

  it("typing a width is ONE change of the offer", async () => {
    await open();
    await play([["on"]]);
    const before = useOfferStore.getState().version;
    await play([["width", "back", "180"]]);
    expect(useOfferStore.getState().version).toBe(before + 1);
  });
});
