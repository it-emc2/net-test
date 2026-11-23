// Aufschlag / Rabatt of a HANDLAUF offer must store and show what today's UI does for the same
// inputs. Reference: fixtures/rabatt-hl.json, recorded from today's UI by v2/scripts/capture-handlauf-rabatt.cjs
// (with every price answer, keyed by the part of the request that decides it).
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import * as r from "../src/features/steps/rabatt/rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/rabatt-hl.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const PRICES = reference.prices as Record<string, Record<string, unknown>>;
/** the part of a price request that decides the answer on this page (as in the recorder) */
const keyOf = (p: any) => [p?.Kundendaten?.payer, p?.Kundendaten?.aufschlag, !!p?.rabatt?.rabattEnabled, Number(p?.rabatt?.materialDiscountPct) || 0, !!p?.rabatt?.bonus300, !!p?.rabatt?.bonusGrab, Number(p?.duschwanne?.wallCladdingQty) || 0, Number(p?.optional?.qty_CLPESG30) || 0, (p?.hl?.quickAdd || []).reduce((n: number, r: any) => n + (Number(r?.qty) || 0), 0)].join("|");
const GRAB_IDS = ["CLPESG30", "CLPESG40", "CLPESG60", "CLPESG80"];

const handlers = (draft?: unknown) => ({ ...BASE, "GET /admin/api/config/public": { body: { ...arbeiten.config, GRAB_BONUS_IDS: GRAB_IDS } }, "POST /api/price": (body: unknown) => ({ body: PRICES[keyOf(body)] ?? { total: 0 } }),
  ...(draft ? { "GET /api/deals/*/draft": { body: { dealId: "4711", revision: 3, offerType: "hl", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}) });
async function open(setup: Record<string, Record<string, unknown>> = {}) {
  const server = fakeServer(handlers());
  renderApp(`/deal/${KEY}/hl/Rabatt`);
  await screen.findByRole("heading", { name: "Übersicht" });
  // what the scenario set on other steps (payer, material, a grab bar)
  // (not the markup: a scenario that changes it types it on this page, and the page stores it)
  const clean = Object.fromEntries(Object.entries(setup).map(([section, fields]) => [section, Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "aufschlag").map(([k, v]) => [k, v === "<removed>" ? undefined : v]))]));
  if (Object.keys(clean).length) useOfferStore.getState().patchAll(clean);
  return { base: structuredClone(offer()), server };
}
/** the offer as it is now is saved and opened again (as a draft of a deal): a new page, nothing remembered */
async function reopen() {
  const saved = structuredClone(offer());
  cleanup();
  useOfferStore.getState().close();
  fakeServer(handlers(saved));
  renderApp("/deal/4711/hl/Rabatt");
  await screen.findByRole("heading", { name: "Übersicht" });
}
async function play(steps: (string | number)[][], setup: Record<string, Record<string, unknown>> = {}) {
  const user = userEvent.setup();
  for (const [kind, a] of steps) {
    if (kind === "payer" || kind === "big" || kind === "grab") continue; // set up on other steps
    if (kind === "small") { useOfferStore.getState().patchAll({ duschwanne: { wallCladdingQty: setup.duschwanne!.wallCladdingQty } }); continue; } // the panels on the Fußboden step, down to what the recording ends with
    if (kind === "reopen") { await reopen(); continue; }
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

describe("Rabatt (Handlauf) stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const setup = scenario.setup as Record<string, Record<string, unknown>>, steps = scenario.steps as (string | number)[][];
    // with ["small"] the offer starts with the 40 panels of ["big"]; "small" brings them down to the recording's end
    const { base } = await open(steps.some(([k]) => k === "small") ? { ...setup, duschwanne: { ...setup.duschwanne, wallCladdingQty: "40" } } : setup);
    await play(steps, setup);
    const v = scenario.view as unknown as View;
    await waitFor(() => expect([changed(base.rabatt, offer().rabatt), changed(base.pricingRules, offer().pricingRules)]).toEqual([scenario.rabatt, scenario.pricingRules]));

    // the sums, from the price for exactly this state
    const sums = screen.getByTestId("rb-sums");
    await waitFor(() => expect([Array.from(sums.querySelectorAll('[data-part="row"]')).map((row) => [squeeze(part(row, "num") + part(row, "label")), part(row, "value")]), part(sums, "net"), part(sums, "vat"), part(sums, "total"), screen.queryByTestId("rb-after-bonus")?.textContent ?? ""])
      .toEqual([v.rows.map(([l, x]) => [squeeze(l).replace(/^MaterialfürBadumbau/, "MaterialfürHandläufe"), x]), // today's overview always says „Badumbau“ — React names the type's material (fixed already for BWT, kosten-bwt.test.tsx)
       v.net, v.vat, v.total, v.bonusTotal]), { timeout: 4000 });
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
  }, 20000);
});

