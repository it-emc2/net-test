// Handlauf, step "Arbeiten" (hlArbeiten, slice 1) must store and show what today's UI does
// for the same inputs. Reference: fixtures/hl-arbeiten.json, recorded from today's UI by
// v2/scripts/capture-handlauf-arbeiten.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { HANDRAIL_TASK as DOOR_TASK } from "../src/features/steps/hl/HlArbeiten.js";
import reference from "./fixtures/hl-arbeiten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
async function open() {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/hl/hlArbeiten`);
  await screen.findByRole("heading", { name: "Auszuführende Arbeiten" });
  return structuredClone(offer());
}
const rows = () => screen.getAllByLabelText("Zusätzliche Aufgabe") as HTMLTextAreaElement[];
const rowBox = (i: number) => rows()[i]!.parentElement!;
async function play(steps: unknown[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b] of steps as [string, any, any][]) {
    if (kind === "tick") await user.click(screen.getByRole("checkbox", { name: DOOR_TASK.title }));
    else if (kind === "add") await user.click(screen.getByRole("button", { name: "Aufgabe hinzufügen" }));
    else if (kind === "type") fireEvent.change(rows()[a]!, { target: { value: b } });
    else if (kind === "remove") await user.click(within(rowBox(a)).getByRole("button", { name: "Diese Zeile entfernen" }));
    else if (kind === "up") await user.click(within(rowBox(a)).getByRole("button", { name: "Nach oben verschieben" }));
    else if (kind === "down") await user.click(within(rowBox(a)).getByRole("button", { name: "Nach unten verschieben" }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));

describe("Handlauf Arbeiten (slice 1) stores and shows what today's UI does", () => {
  it("a new offer starts with today's fields", async () => {
    const base = await open();
    expect([base.hl.workTasks, base.hl.extraTasks]).toEqual([reference.base.workTasks, reference.base.extraTasks]);
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as unknown[][]);
    await waitFor(() => expect(Object.fromEntries(Object.entries(changed(base.hl, offer().hl)).filter(([k]) => ["workTasks", "extraTasks"].includes(k)))).toEqual(
      Object.fromEntries(Object.entries(scenario.hl as Record<string, unknown>).filter(([k]) => ["workTasks", "extraTasks"].includes(k)))));
    const v = scenario.view as { title: string; subtitle: string; groups: { title: string }[]; tasks: { title: string; on: boolean }[]; doorCount: string;
      rows: { text: string; up: boolean; down: boolean }[]; placeholder: string; count: string; empty: string; add: string; help: string };
    expect(screen.getByRole("heading", { name: v.title })).toBeTruthy();
    expect(screen.getByText(v.subtitle)).toBeTruthy();
    expect(v.groups.map((g) => g.title.replace(/\s*\d*$/, ""))).toEqual([screen.getByText(/^1\. Handläufe/).textContent!.replace(/\d*$/, ""), screen.getByText(/^2\. Weitere Arbeiten/).textContent!.replace(/\d*$/, "")]);
    expect(v.tasks.map((t) => ({ title: t.title, on: (screen.getByRole("checkbox", { name: t.title }) as HTMLInputElement).checked }))).toEqual(v.tasks);
    expect(screen.queryByTestId("hl-handrail-count")?.textContent ?? "").toBe(v.doorCount);
    expect(rows().map((t, i) => ({ text: t.value, up: !(within(rowBox(i)).getByRole("button", { name: "Nach oben verschieben" }) as HTMLButtonElement).disabled, down: !(within(rowBox(i)).getByRole("button", { name: "Nach unten verschieben" }) as HTMLButtonElement).disabled }))).toEqual(v.rows);
    // today's rebuilt rows lose the hint their page markup has (empty in some recordings); the React rows keep it
    expect(rows()[0]!.placeholder).toBe("z. B. Demontage des alten Handlaufs");
    expect(["", "z. B. Demontage des alten Handlaufs"]).toContain(v.placeholder);
    expect(screen.queryByTestId("hl-free-count")?.textContent ?? "").toBe(v.count);
    expect(screen.queryByText(/^Noch keine zusätzliche Aufgabe/)?.textContent ?? "").toBe(v.empty);
    expect(screen.getByRole("button", { name: v.add.replace(/^\+\s*/, "") })).toBeTruthy();
    expect(screen.getByText(v.help)).toBeTruthy();
    // what else changes in the offer is what today's UI changes as well
    const el = (scenario as { elsewhere?: Record<string, unknown> }).elsewhere ?? {};
    expect(Object.fromEntries(Object.keys(base).filter((k) => k !== "hl" && !same(base[k], offer()[k])).map((k) => [k, changed(base[k] as never, offer()[k])]))).toEqual(el);
  });
});
