// Arbeiten (Badumbau) must store and show what today's UI does for the same inputs.
// Reference: fixtures/arbeiten.json, recorded from today's UI by v2/scripts/capture-arbeiten.cjs.
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer, pricingRulesOf } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { chooseKind, suggestion } from "../src/features/steps/arbeiten/rules.js";
import { TASK_GROUPS, TASKS } from "../src/features/steps/arbeiten/tasks.js";
import reference from "./fixtures/arbeiten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const box = (title: string) => screen.getAllByText(title, { exact: true })[0]!.closest("label")!.querySelector("input")!;
const button = (name: string) => screen.getByRole("button", { name, hidden: true });

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: reference.config } });
  renderApp(`/deal/${KEY}/bu/Arbeiten`);
  await screen.findByRole("heading", { name: "Auszuführende Arbeiten" });
  return structuredClone(offer());
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps) {
    if (kind === "kind") await user.click(screen.getByRole("group", { name: "Umbauart" }).querySelector(`input[value="${a}"]`)!);
    else if (kind === "task") await user.click(box(TASKS.find((t) => t.value === a)!.title));
    else if (kind === "wall+") await user.click(button("Weitere Stelle"));
    else if (kind === "wall") fireEvent.change(screen.getByLabelText(`Breite Stelle ${a} in mm`), { target: { value: b } });
    else if (kind === "wall-") await user.click(button(`Stelle ${a} entfernen`));
    else if (kind === "extra+") await user.click(button("Aufgabe hinzufügen"));
    else if (kind === "extra") await user.type(screen.getByLabelText(`Zusätzliche Aufgabe ${a}`), String(b));
    else if (kind === "extra-") await user.click(button(`Aufgabe ${a} entfernen`));
    else if (kind === "up") await user.click(button(`Aufgabe ${a} nach oben verschieben`));
    else if (kind === "down") await user.click(button(`Aufgabe ${a} nach unten verschieben`));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)); // the order of keys is no difference
/** the fields of a section that differ from the start, like the recorder */
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => k !== "computed" && !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));

describe("Arbeiten stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps);
    expect(changed(base.duschwanne, offer().duschwanne)).toEqual(scenario.duschwanne);
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit);

    const v = scenario.view;
    expect((screen.getByRole("group", { name: "Umbauart" }).querySelector("input:checked") as HTMLInputElement | null)?.value ?? "").toBe(v.kind);
    expect(TASKS.filter((t) => box(t.title).checked).map((t) => t.value)).toEqual(v.ticked);
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => screen.queryByTestId(`count-${n}`)?.textContent ?? "")).toEqual(v.counts);
    expect(screen.queryByTestId("free-count")?.textContent ?? "").toBe(v.extraCount);
    expect(screen.getAllByLabelText(/^Zusätzliche Aufgabe \d+$/).map((t) => (t as HTMLTextAreaElement).value)).toEqual(v.extraRows);
    expect(!!screen.queryByText("Noch keine zusätzliche Aufgabe erfasst.")).toBe(v.extraEmptyHint);
    expect(screen.queryAllByLabelText(/^Breite Stelle \d+ in mm$/).map((t) => (t as HTMLInputElement).value)).toEqual(v.wallRows);
    expect(offer().Arbeitszeit.laborHoursHHMM).toBe(v.laborHours);
  });

  it("the tasks, their groups, titles and hints are today's", () => {
    expect(TASK_GROUPS.map((g) => ({ title: g.title, tasks: g.tasks.map((t) => ({ ...t })) }))).toEqual(reference.tasks.map((g) => ({ title: g.title, tasks: g.tasks.map(({ value, title, hint }) => ({ value, title, hint })) })));
  });
});

describe("a new offer carries the snapshot of the business settings, as today", () => {
  it("the snapshot is what today's UI stores for the same settings", async () => {
    await open();
    expect(offer().pricingRules).toEqual(reference.pricingRules);
  });

  it("without the settings: today's defaults", () => {
    expect(pricingRulesOf({})).toEqual({ kleinInAufschlag: true, azMinutes: {}, bwtKmFreeThreshold: 200, bwtTravelTimeFreeHours: 2, bonusNeuGross: 250, bonusNeuThreshold: 5000 });
  });

  it("the settings cannot be read (offline): the offer starts without a snapshot", async () => {
    fakeServer(BASE);
    renderApp(`/deal/${KEY}/bu/Arbeiten`);
    await screen.findByRole("heading", { name: "Auszuführende Arbeiten" });
    expect(offer().pricingRules).toEqual({});
  });
});

describe("Arbeiten — rules", () => {
  it("a chosen bathtub keeps its installation ticked when the Umbauart no longer asks for it", () => {
    const dw = { ...(emptyOffer("bu", { date: "" }) as Record<string, any>).duschwanne, chosenBathtubProductId: "W-1", workTasks: ["remove_tub", "install_bathtub"], umbauart: "wanne_wanne" };
    expect(chooseKind(dw, "wanne_dusche").workTasks).toEqual(["remove_tub", "install_bathtub", "install_tray"]);
  });

  it("rows of the suggestion that come from other steps are kept; the admin's minutes come first", () => {
    const other = { key: "wv997", label: "Wandverkleidung 997×2550", minutes: 30, qty: 3 };
    const s = suggestion(["remove_tub"], { remove_tub: 60 }, [{ key: "remove_sink", label: "x", minutes: 30, qty: 1 }, other]);
    expect(s).toEqual({ autoSuggestedTasks: [{ key: "remove_tub", label: "Badewanne entfernen", minutes: 60, qty: 1 }, other], autoSuggestedHoursHHMM: "02:30", autoSuggestedHoursNumeric: 2.5 });
  });

  it("a tick is ONE change of the offer", async () => {
    await open();
    const before = useOfferStore.getState().version;
    await userEvent.click(box("Einbau der Duschwanne"));
    expect(useOfferStore.getState().version).toBe(before + 1);
  });
});
