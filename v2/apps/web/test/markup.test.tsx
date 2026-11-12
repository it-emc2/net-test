// The markup (Aufschlag) must store what today's UI stores. Reference: fixtures/kundendaten-markup.json
// (v2/scripts/capture-kundendaten.cjs). As today, the markup is on the Aufschlag / Rabatt step for
// Badumbau, Badewannentür and Handlauf, and in Kundendaten for Badelift.
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { findBestMarkupUnits, markupForTarget, parseTarget } from "../src/features/steps/markup/zielpreis.js";
import { markupView, parsePercent } from "../src/features/steps/markup/rules.js";
import reference from "./fixtures/kundendaten-markup.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const CONTEXT = ["date", "ansprechpartner", "emc2_contact"];

function outsideChanges(type: string): Record<string, unknown> {
  const fresh = emptyOffer(type as NewOfferType, { date: "" }) as Record<string, any>;
  const out: Record<string, unknown> = {};
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const walk = (a: any, b: any, p: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (isObj(a) && isObj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  for (const k of new Set([...Object.keys(fresh), ...Object.keys(offer())])) if (k !== "Kundendaten") walk(fresh[k], offer()[k], k);
  return out;
}

/** the step that carries the control: the payer is always in Kundendaten, the markup depends on the offer type */
async function goTo(user: ReturnType<typeof userEvent.setup>, label: string, heading: string) {
  if (screen.queryByRole("heading", { name: heading })) return;
  await user.click(within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: new RegExp(`^${label}`) }));
  await screen.findByRole("heading", { name: heading });
}

async function play(type: string, steps: [string, string, string][]) {
  const user = userEvent.setup();
  const toMarkup = () => (type === "bl" ? goTo(user, "Kundendaten", "Aufschlag") : goTo(user, "Aufschlag / Rabatt", "Aufschlag"));
  for (const [kind, field, value] of steps) {
    if (kind === "radio" && field === "payer") {
      await goTo(user, "Kundendaten", "Kostenträger");
      const group = screen.getByRole("group", { name: "Ist der Kunde Selbstzahler oder Kassenkunde?" });
      await user.click(Array.from(group.querySelectorAll("input")).find((i) => i.value === value)!);
    } else if (kind === "click") {
      await toMarkup();
      await user.click(screen.getByRole("button", { name: `${/data-value="(\d+)"/.exec(field)![1]}%` }));
    } else if (kind === "slider") {
      await toMarkup();
      fireEvent.change(screen.getByLabelText("Aufschlag Schieberegler"), { target: { value } });
    } else if (field === "sonderaufschlagValue") {
      await toMarkup();
      const input = screen.getByLabelText("Aufschlag in Prozent");
      await user.clear(input);
      if (value) await user.type(input, value);
    } else if (field === "aufschlagBegruendung") {
      await toMarkup();
      await user.type(screen.getByLabelText(/^Begründung für Aufschlag unter/), value);
    } else throw new Error(`step not handled: ${kind} ${field}`);
  }
  await toMarkup();
}

describe("the markup stores what today's UI stores — every offer type that has one", () => {
  it.each(reference.scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, scenario) => {
    fakeServer(BASE);
    renderApp(`/deal/${KEY}/${scenario.type}/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await play(scenario.type, scenario.steps as [string, string, string][]);

    const kd: Record<string, unknown> = { ...offer().Kundendaten };
    for (const k of CONTEXT) kd[k] = "";
    expect(kd).toEqual(scenario.kundendaten);
    expect(outsideChanges(scenario.type)).toEqual(scenario.outside);

    // the same on the page: text in the field, pressed quick button, the minimum, the slider
    const m = scenario.markup;
    expect((screen.getByLabelText("Aufschlag in Prozent") as HTMLInputElement).value).toBe(m.field);
    expect(screen.queryAllByRole("button", { pressed: true }).map((b) => b.textContent!.replace("%", ""))).toEqual(m.activeChips);
    expect(screen.getByText(/^Mindestwert/).textContent).toBe(m.minLabel);
    // (a browser snaps the slider to its half-percent steps; the test browser does not — compare where no snapping is involved)
    if (Number.isInteger(parsePercent(m.field || "50") * 2) || !Number.isFinite(parsePercent(m.field))) expect((screen.getByLabelText("Aufschlag Schieberegler") as HTMLInputElement).value).toBe(m.slider);
  });
});

describe("the markup: minimum, reason, messages", () => {
  it("under the minimum: a warning and the reason; over it: neither", () => {
    const low = markupView("40", "Kassenkunde", "");
    expect([low.below, low.reasonMissing, low.minLabel]).toEqual([true, true, "Mindestwert Kassenkunde: 50 %"]);
    expect(low.warning).toBe("Aufschlag liegt unter dem Mindestwert für Kassenkunden (50 %) – bitte kurz begründen (keine Freigabe nötig).");
    expect(low.reasonLabel).toBe("Begründung für Aufschlag unter 50 %");
    expect(markupView("40", "Kassenkunde", "Bestandskunde").reasonMissing).toBe(false);
    const sz = markupView("40", "Selbstzahler", "");
    expect([sz.below, sz.warning, sz.minLabel]).toEqual([false, "", "Mindestwert Selbstzahler: 35 %"]);
    expect(markupView("30", "Selbstzahler", "").warning).toContain("für Selbstzahler (35 %)");
  });
  it("messages: not a number at once; empty only when the user goes on", () => {
    expect(markupView("abc", "Kassenkunde", "").error).toBe("Bitte geben Sie eine gültige Zahl ein.");
    expect(markupView("", "Kassenkunde", "").error).toBe("");
    expect(markupView("", "Kassenkunde", "", true).error).toBe("Bitte geben Sie einen Aufschlag ein.");
    expect([parsePercent("37,5"), parsePercent("40 %"), parsePercent("120.25"), Number.isNaN(parsePercent("abc"))]).toEqual([37.5, 40, 120.25, true]);
  });
  it("the warning and the reason field appear on the page under the minimum and go over it", async () => {
    fakeServer(BASE);
    renderApp(`/deal/${KEY}/bu/Rabatt`);
    await screen.findByRole("heading", { name: "Aufschlag" });
    expect(screen.queryByLabelText(/^Begründung für Aufschlag/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "40%" }));
    expect(screen.getByLabelText("Begründung für Aufschlag unter 50 %")).toBeInTheDocument();
    expect(screen.getByText("Bitte eine Begründung eintragen, um fortzufahren.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "60%" }));
    expect(screen.queryByLabelText(/^Begründung für Aufschlag/)).toBeNull();
  });
});

describe("markup from a target price", () => {
  // a price that grows with the markup in cent steps, like the server's
  const server = (base: number, perPercent: number) => async (aufschlag: string) => Math.round((base + perPercent * parseFloat(aufschlag)) * 119) / 100;
  const current = (pct: number, base: number, perPercent: number) => {
    const net = base + perPercent * pct, total = Math.round(net * 119) / 100;
    return { total, markup: perPercent * pct, markupPct: pct / 100, vatOnNet: Math.round((total - net) * 100) / 100 };
  };

  it("finds the largest markup whose total stays under the target", async () => {
    const priceWith = server(2000, 10);
    const r = await markupForTarget("4180", current(50, 2000, 10), priceWith);
    expect(r.ok).toBe(true);
    const pct = Number((r as { percent: string }).percent);
    const total = await priceWith(`${pct}%`);
    expect(total).toBeLessThan(4180);
    expect(total).toBeGreaterThan(4179.9);                              // as close as a cent allows
    expect(await priceWith(`${(pct + 0.01).toFixed(4)}%`)).toBeGreaterThanOrEqual(4180); // a little more would reach the target
  });
  it("asks the server only a handful of times", async () => {
    let calls = 0;
    const priceWith = async (a: string) => { calls++; return server(2000, 10)(a); };
    await markupForTarget("3000", current(50, 2000, 10), priceWith);
    expect(calls).toBeLessThanOrEqual(25);
  });
  it("says why when it cannot: no price yet, no markup amount, bad target, target under cost", async () => {
    const priceWith = server(2000, 10);
    expect(await markupForTarget("4180", null, priceWith)).toMatchObject({ ok: false, message: expect.stringContaining("Preis berechnet") });
    expect(await markupForTarget("4180", { total: 2380, markup: 0, markupPct: 0, vatOnNet: 380 }, priceWith)).toMatchObject({ ok: false, message: expect.stringContaining("Kein Aufschlag-Betrag") });
    expect(await markupForTarget("abc", current(50, 2000, 10), priceWith)).toMatchObject({ ok: false, message: "Bitte einen gültigen Zielpreis eingeben." });
    expect(await markupForTarget("1000", current(50, 2000, 10), priceWith)).toMatchObject({ ok: false, message: expect.stringContaining("unter den Selbstkosten") });
  });
  it("reads a target as people type it", () => {
    expect([parseTarget("4.180"), parseTarget("4.180,50"), parseTarget("8360"), Number.isNaN(parseTarget("0")), Number.isNaN(parseTarget(""))]).toEqual([4180, 4180.5, 8360, true, true]);
  });
  it("the search itself: exact hit, bracket and bisect, never over the goal", async () => {
    const step = (u: number) => Math.floor(u / 7) * 0.01 + 100; // a staircase: a cent every 7 units
    const best = await findBestMarkupUnits(async (u) => step(u), 0, 100.5, 0);
    expect(step(best)).toBeCloseTo(100.5, 2);
    expect(await findBestMarkupUnits(async () => 200, 0, 100, 0)).toBe(-1);
  });
  it("on the page: the target fills the markup field", async () => {
    const s = fakeServer({
      ...BASE,
      "POST /api/price": (body: any) => {
        const pct = parseFloat(String(body.Kundendaten.aufschlag));
        const net = 2000 + 10 * pct, total = Math.round(net * 119) / 100;
        return { body: { total, markup: 10 * pct, markupPct: pct / 100, vatOnNet: Math.round((total - net) * 100) / 100, selfPayAmount: 0 } };
      },
    });
    renderApp(`/deal/${KEY}/bu/Rabatt`);
    await screen.findByText("2.975,00 €"); // 50 % → (2000 + 500) × 1,19
    await userEvent.click(screen.getByRole("button", { name: "Aus Zielpreis berechnen" }));
    await userEvent.type(screen.getByLabelText("Zielpreis in €"), "3.500");
    await userEvent.click(screen.getByRole("button", { name: "Berechnen" }));
    await screen.findByRole("button", { name: "Berechnen" });
    const field = screen.getByLabelText("Aufschlag in Prozent") as HTMLInputElement;
    await vi.waitFor(() => expect(parsePercent(field.value)).toBeGreaterThan(90));
    const pct = parsePercent(field.value);
    expect(Math.round((2000 + 10 * pct) * 119) / 100).toBeLessThan(3500);
    expect(Math.round((2000 + 10 * (pct + 0.01)) * 119) / 100).toBeGreaterThanOrEqual(3500);
    expect(offer().Kundendaten.aufschlag).toBe(`${pct}%`);
    expect(s.count("POST /api/price")).toBeLessThanOrEqual(30);
  });
});
