// Aufschlag / Rabatt, the discount part, must store and show what today's UI does for the same
// inputs. Reference: fixtures/rabatt.json, recorded from today's UI by v2/scripts/capture-rabatt.cjs
// (with every price answer, keyed by the part of the request that decides it).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import * as r from "../src/features/steps/rabatt/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/rabatt.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const PRICES = reference.prices as Record<string, Record<string, unknown>>;
/** the part of a price request that decides the answer on this page (as in the recorder) */
const keyOf = (p: any) => [p?.Kundendaten?.payer, p?.Kundendaten?.aufschlag, !!p?.rabatt?.rabattEnabled, Number(p?.rabatt?.materialDiscountPct) || 0, !!p?.rabatt?.bonus300, !!p?.rabatt?.bonusGrab, Number(p?.duschwanne?.wallCladdingQty) || 0, Number(p?.optional?.qty_CLPESG30) || 0].join("|");
const GRAB_IDS = ["CLPESG30", "CLPESG40", "CLPESG60", "CLPESG80"];

async function open(setup: Record<string, Record<string, unknown>> = {}) {
  const server = fakeServer({ ...BASE, "GET /admin/api/config/public": { body: { ...arbeiten.config, GRAB_BONUS_IDS: GRAB_IDS } }, "POST /api/price": (body) => ({ body: PRICES[keyOf(body)] ?? { total: 0 } }) });
  renderApp(`/deal/${KEY}/bu/Rabatt`);
  await screen.findByRole("heading", { name: "Übersicht" });
  // what the scenario set on other steps (payer, material, a grab bar)
  // (not the markup: a scenario that changes it types it on this page, and the page stores it)
  const clean = Object.fromEntries(Object.entries(setup).map(([section, fields]) => [section, Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "aufschlag").map(([k, v]) => [k, v === "<removed>" ? undefined : v]))]));
  if (Object.keys(clean).length) useOfferStore.getState().patchAll(clean);
  return { base: structuredClone(offer()), server };
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a] of steps) {
    if (kind === "payer" || kind === "big" || kind === "grab") continue; // set up on other steps
    if (kind === "auf") fireEvent.change(screen.getByLabelText("Aufschlag in Prozent"), { target: { value: a } });
    else if (kind === "rabatt") await user.click(screen.getByRole("radio", { name: a === "ja" ? "Rabatt hinzufügen" : "Kein Rabatt" }));
    else if (kind === "slider") fireEvent.change(await screen.findByLabelText("Rabatt in Prozent (0–9%)"), { target: { value: a } });
    else if (kind === "b300") await user.click(await screen.findByRole("checkbox", { name: /Neukundenbonus/ }));
    else if (kind === "bgrab") await user.click(await screen.findByRole("checkbox", { name: /Haltegriff GRATIS/ }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
interface View {
  rows: [string, string][]; net: string; vat: string; total: string; heading: string; choice: string; controls: boolean; empty: string;
  slider: { shown: boolean; value: string; text: string; min: string; max: string; step: string }; rabatt: string; after: string;
  b300: { shown: boolean; checked: boolean; text: string }; bgrab: { shown: boolean; checked: boolean; text: string }; bonusTotal: string; priceKey: string;
}

describe("Rabatt stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base } = await open(scenario.setup as Record<string, Record<string, unknown>>);
    await play(scenario.steps as (string | number)[][]);
    const v = scenario.view as unknown as View;
    await waitFor(() => expect([changed(base.rabatt, offer().rabatt), changed(base.pricingRules, offer().pricingRules)]).toEqual([scenario.rabatt, scenario.pricingRules]));

    // the sums, from the price for exactly this state
    const sums = screen.getByTestId("rb-sums");
    await waitFor(() => expect([Array.from(sums.querySelectorAll('[data-part="row"]')).map((row) => [squeeze(part(row, "num") + part(row, "label")), part(row, "value")]), part(sums, "net"), part(sums, "vat"), part(sums, "total"), screen.queryByTestId("rb-after-bonus")?.textContent ?? ""])
      .toEqual([v.rows.map(([l, x]) => [squeeze(l), x]), v.net, v.vat, v.total, v.bonusTotal]), { timeout: 4000 });
    expect(screen.getByRole("heading", { name: v.heading })).toBeTruthy();
    expect((screen.getByRole("radio", { checked: true, name: /^(Kein Rabatt|Rabatt hinzufügen)$/ }) as HTMLInputElement).value).toBe(v.choice);
    expect(!!screen.queryByTestId("rb-controls")).toBe(v.controls);
    await waitFor(() => expect(screen.queryByTestId("rb-empty")?.textContent ?? "").toBe(v.empty));
    const slider = screen.queryByLabelText("Rabatt in Prozent (0–9%)") as HTMLInputElement | null;
    expect(!!slider).toBe(v.slider.shown);
    if (slider) expect([slider.value, screen.getByTestId("rb-percent").textContent, slider.min, slider.max, slider.step]).toEqual([v.slider.value, v.slider.text, v.slider.min, v.slider.max, v.slider.step]);
    const discount = screen.queryByTestId("rb-discount");
    await waitFor(() => expect(discount ? [part(discount, "amount"), part(discount, "after")] : ["", ""]).toEqual([v.rabatt, v.after]));
    const bonus = screen.queryByRole("checkbox", { name: /Neukundenbonus/ }) as HTMLInputElement | null, grab = screen.queryByRole("checkbox", { name: /Haltegriff GRATIS/ }) as HTMLInputElement | null;
    expect([!!bonus, !!grab]).toEqual([v.b300.shown, v.bgrab.shown]);
    if (bonus) expect([bonus.checked, flat(bonus.closest("label")!.textContent)]).toEqual([v.b300.checked, v.b300.text]);
    if (grab) expect([grab.checked, flat(grab.closest("label")!.textContent)]).toEqual([v.bgrab.checked, v.bgrab.text]);
    expect(screen.queryByTestId("rb-after-bonus")?.textContent ?? "").toBe(v.bonusTotal);
  });
});

describe("Aufschlag — the switch for offers stored under the old rule", () => {
  it("only an offer that keeps small material out of the markup shows it; ticking changes the rule and the switch stays", async () => {
    await open();
    expect(screen.queryByRole("checkbox", { name: /^Kleinmaterial im Aufschlag berücksichtigen/ })).toBeNull(); // a new offer uses the new rule
    useOfferStore.getState().patch("pricingRules" as never, { kleinInAufschlag: false } as never);
    const box = (await screen.findByRole("checkbox", { name: /^Kleinmaterial im Aufschlag berücksichtigen/ })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.setup().click(box);
    await waitFor(() => expect(offer().pricingRules.kleinInAufschlag).toBe(true));
    expect((screen.getByRole("checkbox", { name: /^Kleinmaterial im Aufschlag berücksichtigen/ }) as HTMLInputElement).checked).toBe(true); // still there: the change can be taken back
    expect(within(screen.getByTestId("rb-sums")).queryByText(/ohne Kleinmaterial/)).toBeNull();
  });
});

describe("Rabatt — rules", () => {
  it("the discount on materials is only for Kassenkunde with a markup of at least 50 %", () => {
    expect([r.mayDiscountMaterials("Kassenkunde", "50%"), r.mayDiscountMaterials("Kassenkunde", "49,9%"), r.mayDiscountMaterials("Selbstzahler", "60%"), r.mayDiscountMaterials("Kassenkunde", "")]).toEqual([true, false, false, false]);
    expect([r.percentOf({ materialDiscountPct: 0.025 }), r.percentText(2.5), r.setPercent(12).rabatt!.materialDiscountPct, r.setPercent(NaN).rabatt!.materialDiscountPct]).toEqual([2.5, "2,5%", 0.09, 0]);
  });

  it("Kein Rabatt sets discount and bonuses back and forgets the stored grab bars", () => {
    expect(r.setEnabled(false)).toEqual({ rabatt: { rabattEnabled: false, "rb-add-rabatt": "nein", materialDiscountPct: 0, bonus300: false, bonusGrab: false }, pricingRules: { grabBonusIds: undefined, grabBonusRefId: undefined } });
    expect(r.setEnabled(true)).toEqual({ rabatt: { rabattEnabled: true, "rb-add-rabatt": "ja" } });
  });

  it("the Neukundenbonus: the offer's own values; an offer from before the setting keeps 300 € from 3.000 €", () => {
    const now = r.newCustomerBonus({ bonusNeuGross: 250, bonusNeuThreshold: 5000 }), old = r.newCustomerBonus({});
    expect([now.legacy, now.threshold, now.text]).toEqual([false, 5000, "Möchten Sie den Neukundenbonus in Höhe von 250,00 € brutto hinzufügen? (ab einem Gesamtwert über 5.000 €)"]);
    expect([old.legacy, old.threshold, old.text]).toEqual([true, 3000, "Möchten Sie den Neukundenbonus in Höhe von 252,10 € hinzufügen? (Rabatt von 300 € ab einem Gesamtwert von 3.000 €)"]);
    expect([r.newCustomerBonusOffered({ totalAfterRabatt: 5000 }, now), r.newCustomerBonusOffered({ totalAfterRabatt: 5000.01 }, now), r.newCustomerBonusOffered(null, now)]).toEqual([false, true, false]);
  });

  it("the free grab bar: the eligible bars are stored with the offer once the bonus is given", () => {
    expect([r.grabIds({}, {}), r.grabIds({}, { GRAB_BONUS_IDS: GRAB_IDS }), r.grabIds({ grabBonusIds: ["X"] }, { GRAB_BONUS_IDS: GRAB_IDS })]).toEqual([["CLPESG30"], GRAB_IDS, ["X"]]);
    expect(r.setGrabBonus(true, GRAB_IDS).pricingRules).toEqual({ grabBonusIds: GRAB_IDS, grabBonusRefId: "CLPESG30" });
    expect(r.setGrabBonus(true, ["CLPESG30"]).pricingRules).toEqual({ grabBonusIds: undefined, grabBonusRefId: "CLPESG30" }); // the old rule is what the price assumes anyway
    expect(r.setGrabBonus(false, GRAB_IDS).pricingRules).toEqual({ grabBonusIds: undefined, grabBonusRefId: undefined });
    const price = { materials: { lines: [{ productId: "CLPESG40", qty: 1 }, { id: "CLPESG30", qty: 0 }] } };
    expect([r.grabOffered(price, GRAB_IDS), r.grabOffered(price, ["CLPESG30"]), r.grabOffered(null, GRAB_IDS)]).toEqual([true, false, false]);
  });

  it("what no longer applies is taken back; offers from before the setting keep their Neukundenbonus", () => {
    const kk = { payer: "Kassenkunde", aufschlag: "50%" }, on = { rabattEnabled: true, materialDiscountPct: 0.05, bonus300: true, bonusGrab: true };
    const rules = { bonusNeuGross: 250, bonusNeuThreshold: 5000 }, low = { totalAfterRabatt: 1200, materials: { lines: [] } };
    expect(r.corrections({ rabatt: on, Kundendaten: { ...kk, aufschlag: "40%" }, pricingRules: rules }, null, {})).toEqual({ rabatt: { materialDiscountPct: 0 } }); // without a price only what needs none
    expect(r.corrections({ rabatt: on, Kundendaten: kk, pricingRules: rules }, low, {})).toEqual({ rabatt: { bonus300: false, bonusGrab: false }, pricingRules: { grabBonusIds: undefined, grabBonusRefId: undefined } });
    expect(r.corrections({ rabatt: on, Kundendaten: kk, pricingRules: {} }, { ...low, materials: { lines: [{ productId: "CLPESG30", qty: 1 }] } }, {})).toBeNull(); // legacy bonus stays, the bar is there
    expect(r.corrections({ rabatt: { ...on, rabattEnabled: false }, Kundendaten: { payer: "Selbstzahler" } }, low, {})).toBeNull();
  });

  it("the overview: optional products as a row of their own; the markup with its percent; group numbers only for Badumbau", () => {
    const price = { services: { sum: 1065 }, productsSubtotal: 37.46, materialsDisplayUI: { sum: 0 }, optionalDisplayUI: { sum: 37.46 }, markup: 18.73, markupPct: 0.375, Nettobetrag: 1121.19, baseVat: 213.03, base_total: 1334.22 };
    expect(r.overview(price, "bu", { kleinInAufschlag: false }, "").rows.map((x) => `${x.num}${x.label}=${x.value}`)).toEqual(["IAuszuführende Arbeiten=1.065,00 €", "IIMaterial für Badumbau=0,00 €", "IIIOptionale Produkte=37,46 €", "Aufschlag 37,5% (ohne Kleinmaterial)=18,73 €"]);
    expect(r.overview({ ...price, optionalDisplayUI: { sum: 0 }, markupPct: undefined }, "hl", {}, "40").rows.map((x) => `${x.num}${x.label}`)).toEqual(["Auszuführende Arbeiten", "Material für Badumbau", "Aufschlag 40%"]);
    expect(r.results({ materialDiscountPct: 0.05, bonus300: true }, { rabattAmount: 356.41, totalAfterRabatt: 13566.99, total: 13316.99 })).toEqual({ discount: "356,41 €", afterDiscount: "13.566,99 €", afterBonus: "13.316,99 €", empty: false });
    expect(r.results({}, {}).empty).toBe(true);
  });
});
