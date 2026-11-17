// "Angebot anpassen" and the internal note must show what today's UI does and store the same
// (`offerOverrides`). Reference: fixtures/versand-anpassungen.json, recorded from today's UI by
// v2/scripts/capture-versand-anpassungen.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { badge, grossHint, rowsOf, stored } from "../src/features/steps/versand/overrides.js";
import reference from "./fixtures/versand-anpassungen.json" with { type: "json" };
import { BASE, fakeServer, openMore, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Line { label: string; value: string; placeholder: string; options?: { value: string; label: string }[]; gross?: string }
interface GroupView { title: string; rows: { lines: Line[]; remove: string }[]; add: string }
interface View { title: string; badge: string; locked: boolean; text: string; wording: GroupView | null; price: GroupView | null; notes: GroupView | null; note: { label: string; value: string; placeholder: string; hint: string; max: number } }
interface Scenario { name: string; type: string; offer: Obj; view: View; acts: { act: (string | number)[]; stored: Obj; view: View }[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;

const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(/ANG\d{4}-\d{4}-\d{6}/g, "ANG2026-1116-093000")); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const storedNow = (before: Obj) => (JSON.stringify(before.offerOverrides ?? null) === JSON.stringify(offer().offerOverrides ?? null) ? {} : { offerOverrides: offer().offerOverrides ?? "<removed>" });

async function open(s: Scenario, payload = offerOf(s), price: Obj = { total: 10, selfPayAmount: 0 }) {
  fakeServer({ ...BASE, "GET /api/users": { body: reference.users }, "POST /api/price": { body: price }, [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } } });
  renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
  const card = await screen.findByTestId("oo-card");
  openMore(); // U-023: "Angebot anpassen" is in "Mehr Optionen"
  (card as HTMLDetailsElement).open = true;
  return card;
}
const group = (name: string): HTMLElement | undefined => screen.queryAllByTestId("oo-group").find((g) => g.dataset.group === name);
function groupView(name: string): GroupView | null {
  const g = group(name);
  if (!g) return null;
  return {
    title: flat(g.querySelector("h4")?.textContent), add: `+ ${flat(g.querySelector(":scope > div:last-child button")?.textContent)}`,
    rows: within(g).queryAllByTestId("oo-row").map((r) => ({
      remove: r.querySelector<HTMLElement>('button[title]')!.title,
      lines: Array.from(r.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).map((c) => {
        const gross = flat(r.querySelector('[data-part="gross"]')?.textContent);
        return { label: flat(r.querySelector(`label[for="${c.id}"]`)?.textContent), value: c.value, placeholder: (c as HTMLInputElement).placeholder || "",
          ...(c instanceof HTMLSelectElement ? { options: Array.from(c.options).map((o) => ({ value: o.value, label: flat(o.textContent) })) } : {}), ...(c.id.startsWith("oo-amount") && gross ? { gross } : {}) };
      }),
    })),
  };
}
function shown(): Omit<View, "locked"> & { locked: boolean } {
  const card = screen.getByTestId("oo-card"), note = screen.getByTestId("zf-internal-note"), area = note.querySelector("textarea")!;
  return {
    title: flat(card.querySelector('[data-part="title"]')?.textContent), badge: flat(card.querySelector('[data-part="badge"]')?.textContent), locked: !!card.querySelector('[data-part="locked"]'), text: flat(card.querySelector('[data-part="text"]')?.textContent),
    wording: groupView("text"), price: groupView("price"), notes: groupView("notes"),
    note: { label: `🔒 ${flat(note.querySelector("label")?.textContent)}`, value: area.value, placeholder: area.placeholder, hint: flat(note.querySelector('[data-part="hint"]')?.textContent), max: 5000 },
  };
}
// today's number field shows what was typed; a row's stored number is the same
const expected = (v: View) => v;

describe("\"Angebot anpassen\" shows and stores what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    await open(s);
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    expect(useOfferStore.getState().version).toBe(0);
    const user = userEvent.setup(), before = structuredClone(offer());
    const rowOf = (name: string, n: number) => within(group(name)!).getAllByTestId("oo-row")[n - 1]!;
    for (const a of s.acts) {
      const [kind, x, y] = a.act;
      if (kind === "add") await user.click(group(x === "hint" ? "notes" : (x as string))!.querySelector<HTMLElement>(":scope > div:last-child button")!);
      else if (kind === "from") fireEvent.change(rowOf("text", x as number).querySelectorAll("input")[0]!, { target: { value: y } });
      else if (kind === "to") fireEvent.change(rowOf("text", x as number).querySelectorAll("input")[1]!, { target: { value: y } });
      else if (kind === "amount") fireEvent.change(rowOf("price", x as number).querySelector("input")!, { target: { value: y } });
      else if (kind === "target") await user.selectOptions(rowOf("price", x as number).querySelector("select")!, y as string);
      else if (kind === "hint") fireEvent.change(rowOf("notes", x as number).querySelector("textarea")!, { target: { value: y } });
      else if (kind === "del") await user.click(rowOf(x === "hint" ? "notes" : (x as string), y as number).querySelector<HTMLElement>("button[title]")!);
      else fireEvent.change(screen.getByTestId("zf-internal-note").querySelector("textarea")!, { target: { value: x } });
      await waitFor(() => expect(shown()).toEqual(expected(a.view)));
      expect(storedNow(before), `stored after ${a.act.join(" ")}`).toEqual(a.stored);
    }
  });
});

describe("\"Angebot anpassen\" — rules and what goes beyond the recordings", () => {
  const first = SCENARIOS[0]!;
  it("an empty row is on the page but not in the offer: nothing is saved, no price is asked", async () => {
    await open(first);
    await userEvent.setup().click(group("price")!.querySelector<HTMLElement>(":scope > div:last-child button")!);
    expect(within(group("price")!).getAllByTestId("oo-row")).toHaveLength(1);
    expect(useOfferStore.getState().version).toBe(0);
  });

  it("an opened offer shows its changes; single positions changed on Kosten are kept", async () => {
    const o = offerOf(first), line = { block: "material", id: "KM02", label: "Kleinmaterial Bad", unitPriceNet: 12 };
    o.offerOverrides = { textReplacements: [{ from: "Gleittür", to: "Schiebetür" }], priceAdjustments: [{ target: "material", amountNet: -20 }], extraHinweise: ["Hinweis"], lineEdits: [line] };
    await open(first, o);
    await waitFor(() => expect(shown().badge).toBe("1 Text · 1 Preis · 1 Hinweis · 1 Position angepasst"));
    expect(groupView("price")!.rows[0]!.lines.map((l) => l.value)).toEqual(["material", "-20"]);
    await userEvent.setup().click(within(group("notes")!).getByRole("button", { name: "Hinweis 1 entfernen" }));
    expect(offer().offerOverrides).toEqual({ textReplacements: [{ from: "Gleittür", to: "Schiebetür" }], priceAdjustments: [{ target: "material", amountNet: -20 }], lineEdits: [line] });
  });

  it("a frozen price (the number of a sent offer) is said on the card, with the way to a new version", async () => {
    const o = offerOf(first); o.offerNumber = "ANG2026-1116-093000";
    const card = await open(first, o, { total: 10, selfPayAmount: 0, _locked: true });
    await waitFor(() => expect(card.querySelector('[data-part="locked"]')).not.toBeNull());
    expect(within(card).getByRole("link", { name: "Neue Version in der bisherigen Ansicht erstellen" })).toBeTruthy();
  });

  it("the rules: what is stored, the badge, the gross hint", () => {
    expect(stored({ text: [{ from: " ", to: "x" }], price: [{ target: "services", amount: "0" }, { target: "material", amount: "" }], notes: ["  "] }, undefined)).toBeUndefined();
    expect(stored({ text: [], price: [], notes: [] }, { lineEdits: [{ id: "A" }] })).toEqual({ lineEdits: [{ id: "A" }] });
    expect(rowsOf({ priceAdjustments: [{ target: "x", amountNet: 5 }, { target: "material", amountNet: 0 }] })).toEqual({ text: [], price: [{ target: "services", amount: "5" }], notes: [] });
    expect(badge({ extraHinweise: ["a", "b"], lineEdits: [1, 2] })).toBe("2 Hinweise · 2 Positionen angepasst");
    expect(badge(undefined)).toBe("");
    expect(grossHint("100").replace(/\s/g, " ")).toBe("+119,00 € brutto");
    expect(grossHint("-59.5").replace(/\s/g, " ")).toBe("-70,80 € brutto"); // as today: the hint is not rounded commercially
    expect(grossHint("")).toBe("");
  });
});
