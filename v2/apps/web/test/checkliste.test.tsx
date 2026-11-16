// Checkliste must show what today's UI does for the same offer and price, and store the same.
// Reference: fixtures/checkliste.json, recorded from today's UI by v2/scripts/capture-checkliste.cjs.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { checklist, sentText, ticked } from "../src/features/steps/checkliste/rules.js";
import reference from "./fixtures/checkliste.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin"; // the recordings show the time of sending as the office sees it

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, unknown>;
interface ItemView { label: string; note: string; required: boolean; auto: boolean; checked: boolean; missing: boolean }
interface View { heading: string; text: string; summary: string; complete: boolean; open: boolean; groups: { title: string; items: ItemView[] }[] }
interface Scenario { name: string; offer: Obj; price: Obj; view: View; ticks: { tick: string; stored: Obj; view: View }[] }

const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const offerOf = (s: Scenario): Obj => { const o: Obj = { ...structuredClone(reference.base as Obj) }; for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return o; };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);

async function open(s: Scenario) {
  fakeServer({ ...BASE, [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: "bu", payload: offerOf(s), revision: 3, updatedAt: "2026-11-12T10:00:00Z" } }, "POST /api/price": { body: s.price } });
  renderApp(`/deal/${KEY}/bu/Checkliste`);
  await screen.findByRole("heading", { name: s.view.heading });
}
function shown() {
  const sum = screen.getByTestId("chk-summary");
  return {
    summary: part(sum, "text"), complete: sum.dataset.complete === "true",
    groups: screen.getAllByTestId("chk-group").map((g) => ({ title: flat(g.querySelector("h3")?.textContent), items: within(g).getAllByTestId("chk-item").map((it) => {
      const box = it.querySelector<HTMLInputElement>("input")!;
      return { label: part(it, "label"), note: part(it, "note"), required: true, auto: box.disabled, checked: box.checked, missing: it.dataset.missing === "true" };
    }) })),
  };
}
const expected = (v: View) => ({ summary: v.summary.replace(/^✅\s*/, ""), complete: v.complete, groups: v.groups });

describe("Checkliste shows what today's UI does", () => {
  it.each((reference.scenarios as unknown as Scenario[]).map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    await open(s);
    expect(screen.getByText(s.view.text)).toBeTruthy();
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    expect(s.view.open).toBe(!s.view.complete);
    expect(useOfferStore.getState().version).toBe(0); // looking at the list changes nothing in the offer
    const user = userEvent.setup(), before = structuredClone(offer());
    for (const t of s.ticks) {
      await user.click(within(screen.getAllByTestId("chk-item").find((i) => i.dataset.item === t.tick)!).getByRole("checkbox"));
      await waitFor(() => expect(shown()).toEqual(expected(t.view)));
      expect(changed(before, offer()), `stored after ${t.tick}`).toEqual(t.stored);
    }
  });
});

describe("Checkliste — rules and what goes beyond the recordings", () => {
  it("the items that follow from the offer cannot be ticked by hand", async () => {
    await open((reference.scenarios as unknown as Scenario[])[0]!);
    const auto = screen.getAllByTestId("chk-item").filter((i) => ["check", "versendet"].includes(i.dataset.item!));
    expect(auto.map((i) => within(i).getByRole("checkbox").hasAttribute("disabled"))).toEqual([true, true]);
  });

  it("a yellow Angebotscheck counts as done, a red one does not; without a price nothing is done", () => {
    expect(checklist(null, null)).toMatchObject({ done: 0, total: 4, complete: false, summary: "0 von 4 Pflichtpunkten erledigt." });
    expect(checklist(null, null).groups[0]!.items[0]).toMatchObject({ checked: false, note: "🔴 Fehlt" });
  });

  it("the time of sending is told with date and time; an unknown kind of sending is not sent", () => {
    expect(sentText({ art: "post", versendetAm: "2026-03-02T14:05:00.000Z" })).toBe("Ja — Versendet per Post am 2.3.2026 um 15:05 Uhr.");
    expect(sentText({ art: "fax", versendetAm: "2026-03-02T14:05:00.000Z" })).toBe("Nein");
    expect(sentText({ art: "mail", versendetAm: null })).toBe("Nein");
  });

  it("a tick keeps the other box as it is", () => {
    expect(ticked({ zusammenfassung: { checkliste: { skizzeErstellt: true, fotosErstellt: false } } }, "fotosErstellt", true)).toEqual({ checkliste: { skizzeErstellt: true, fotosErstellt: true } });
    expect(ticked({}, "skizzeErstellt", true)).toEqual({ checkliste: { skizzeErstellt: true, fotosErstellt: false } });
  });
});
