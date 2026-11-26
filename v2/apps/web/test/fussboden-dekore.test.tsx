// Fußboden, "Wandverkleidung als Fußboden" in winwall with several Dekors (owner 2026-11-25, ADR 029):
// the chips, + weiteres Dekor, ×, the first Dekor promoted, VIGOUR empties the further Dekors, the proposal
// for the open Dekor, the red line and the send check for a Dekor without a valid number — and an offer
// with one Dekor opens without anything written. The stored fields are priced by the real engine.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPricingEngine, WINWALL_CATALOG, WINWALL_FORMATS } from "@oc/pricing";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { arbeitenChanges } from "../src/features/steps/arbeiten/rules.js";
import * as w from "../src/features/steps/fussboden/wand.js";
import { missingMain } from "../src/features/steps/versand/send-rules.js";
import { nextDecor } from "../src/features/steps/wandverkleidung/simple.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Fields = Record<string, unknown>;
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const dw = () => offer().duschwanne as Fields;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const ONE: Fields = {
  addFlooring: false, addWallCladding: "on", wallCladdingSupplier: "ww", wallCladdingKind: "Gesamtes-Bad", wallCladdingArea: "8",
  wallCladdingWwDecor: "WS203", wallCladdingWwDecorCustom: "", wallCladdingWwQty: '{"13":0,"15":2,"16":0,"17":0}', wallCladdingQty: "2", wallCladdingPanelSize: "15",
};
const cat = WINWALL_CATALOG as Record<string, string>;

async function open(fields: Fields = ONE) {
  fakeServer({ ...BASE });
  renderApp(`/deal/${KEY}/bu/Fussboden`);
  await screen.findByRole("heading", { name: "Fußboden" });
  act(() => useOfferStore.setState((s) => {
    const o = s.offer as Record<string, any>, patch = arbeitenChanges(o, fields);
    return { offer: { ...o, duschwanne: { ...(o.duschwanne ?? {}), ...patch.duschwanne }, Arbeitszeit: { ...(o.Arbeitszeit ?? {}), ...patch.Arbeitszeit } } as never, scratch: {} };
  }));
  await screen.findByTestId("wc-plates");
  return userEvent.setup();
}
const chips = () => screen.getAllByTestId("wc-decor-chip").map((c) => ({ text: part(c, "text"), pressed: c.getAttribute("aria-pressed") === "true" }));
const total = () => part(screen.getByTestId("wc-total"), "text");
const plate = (user: ReturnType<typeof userEvent.setup>, size: string, more = true) => user.click(screen.getByRole("button", { name: `${more ? "Mehr" : "Weniger"} ${size}` }));
const tile = (user: ReturnType<typeof userEvent.setup>, code: string) => user.click(screen.getByTestId("wc-decors").querySelector(`[data-code="${code}"]`)!);
const more = () => (dw().wallCladdingWwMore === undefined ? undefined : JSON.parse(String(dw().wallCladdingWwMore || "[]")));

// the real engine on what the step stored (list prices per format; same set-up as the pricing package's test)
const PRODUCTS: Record<string, Fields> = { R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 } };
for (const d of ["WS203", "WS229", "WS000"]) for (const f of WINWALL_FORMATS) PRODUCTS[`${d}${f.code}`] = { productId: `${d}${f.code}`, name: "winwall", price: f.price, source: "winwall" };
const engine = createPricingEngine({ find: (q: { productId: { $in: string[] } }) => ({ lean: async () => q.productId.$in.map((id) => PRODUCTS[id]).filter(Boolean) }), findOne: () => ({ lean: async () => null }) } as never,
  { cfg: { get: (_k: string, d?: unknown) => d }, fetchVigourNetPrices: async () => new Map() });
const floorLines = async (d: Fields) => {
  const r = (await engine.computePrices({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne: structuredClone(d), wandverkleidung: {}, optional: {}, rabatt: {}, Arbeitszeit: {} })) as any;
  return Object.fromEntries(r.materials.lines.filter((l: any) => l.category === "Fußboden").map((l: any) => [l.productId || l.id, l.qty]));
};

describe("winwall floor with several Dekors", () => {
  it("an offer with one Dekor opens as before: one chip, no ×, nothing written", { timeout: 20000 }, async () => {
    await open();
    const before = structuredClone(offer());
    await new Promise((r) => setTimeout(r, 300));
    expect(chips()).toEqual([{ text: "Marmor weiß · 2 Stk", pressed: true }]);
    expect(screen.queryByRole("button", { name: /^Dekor .* entfernen$/ })).toBeNull();
    expect(screen.getByRole("button", { name: "+ weiteres Dekor" })).toBeInTheDocument();
    expect(total()).toBe("2 Platten · 5,00 m²");
    expect(offer()).toEqual(before);
    expect("wallCladdingWwMore" in dw()).toBe(false);
  });

  it("+ weiteres Dekor: the next palette decor, nothing stored until it has a plate; its tile and plates are stored in wallCladdingWwMore and priced", { timeout: 20000 }, async () => {
    const user = await open();
    const first = structuredClone(dw());
    await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    const next = nextDecor(["WS203"]);
    expect(chips()).toEqual([{ text: "Marmor weiß · 2 Stk", pressed: false }, { text: `${cat[next]} · 0 Stk`, pressed: true }]);
    expect(more()).toBeUndefined(); // an empty chip writes nothing
    await tile(user, "WS229");
    expect(more()).toBeUndefined();
    await plate(user, "100 × 205 cm");
    await plate(user, "150 × 250 cm");
    expect(more()).toEqual([{ decor: "WS229", decorCustom: "", qty: { 13: 1, 15: 0, 16: 0, 17: 1 } }]);
    for (const k of ["wallCladdingWwDecor", "wallCladdingWwDecorCustom", "wallCladdingWwQty", "wallCladdingQty", "wallCladdingPanelSize"]) expect(dw()[k]).toEqual(first[k]);
    expect(chips()).toEqual([{ text: "Marmor weiß · 2 Stk", pressed: false }, { text: `${cat.WS229} · 2 Stk`, pressed: true }]);
    expect(total()).toBe("4 Platten · 10,80 m² · 2 Dekore");
    expect(screen.getAllByTestId("wc-selected").filter((r) => part(r, "name") === "Aluverbundplatte").map((r) => part(r, "meta")))
      .toEqual(["Marmor weiß · WS 203 · Art.-Nr. WS20315", `${cat.WS229} · WS 229 · Art.-Nr. WS22913, WS22917`]);
    // the same lines as the pricing package's two-Dekor test
    expect(await floorLines(dw())).toEqual({ WS20315: 2, WS22913: 1, WS22917: 1, R_4260602: 14 });
    // the first chip opens the first Dekor again: its plates and decor
    await user.click(screen.getAllByTestId("wc-decor-chip")[0]!);
    expect(screen.getAllByTestId("wc-plate").map((p) => part(p, "qty"))).toEqual(["0", "2", "0", "0"]);
    expect(within(screen.getByTestId("wc-decors")).getByRole("radio", { checked: true }).dataset.code).toBe("WS203");
  });

  it("× on the first Dekor promotes the next into the three fields; × on the last further one stores \"\"", { timeout: 20000 }, async () => {
    const two = { ...ONE, wallCladdingWwMore: JSON.stringify([{ decor: "WS229", decorCustom: "", qty: { 13: 1, 15: 0, 16: 0, 17: 1 } }]) };
    const user = await open(two);
    await user.click(screen.getByRole("button", { name: "Dekor Marmor weiß entfernen" }));
    expect(dw()).toMatchObject({ wallCladdingWwDecor: "WS229", wallCladdingWwDecorCustom: "", wallCladdingWwQty: '{"13":1,"15":0,"16":0,"17":1}', wallCladdingQty: "2", wallCladdingPanelSize: "13", wallCladdingWwMore: "" });
    expect(chips()).toEqual([{ text: `${cat.WS229} · 2 Stk`, pressed: true }]);
    expect(await floorLines(dw())).toEqual({ WS22913: 1, WS22917: 1, R_4260602: 14 });

    act(() => useOfferStore.getState().patch("duschwanne", { ...two }));
    await user.click(screen.getByRole("button", { name: `Dekor ${cat.WS229} entfernen` }));
    expect(dw()).toMatchObject({ wallCladdingWwDecor: "WS203", wallCladdingWwQty: '{"13":0,"15":2,"16":0,"17":0}', wallCladdingWwMore: "" });
    expect(await floorLines(dw())).toEqual({ WS20315: 2, R_4260602: 14 });
  });

  it("a further Dekor stepped back to 0 plates is no longer stored but stays as a chip", { timeout: 20000 }, async () => {
    const user = await open({ ...ONE, wallCladdingWwMore: JSON.stringify([{ decor: "WS229", decorCustom: "", qty: { 13: 1, 15: 0, 16: 0, 17: 0 } }]) });
    await user.click(screen.getAllByTestId("wc-decor-chip")[1]!);
    await plate(user, "100 × 205 cm", false);
    expect(dw().wallCladdingWwMore).toBe("");
    expect(chips()).toEqual([{ text: "Marmor weiß · 2 Stk", pressed: false }, { text: `${cat.WS229} · 0 Stk`, pressed: true }]);
  });

  it("VIGOUR empties the further Dekors; back on winwall there is one chip", { timeout: 20000 }, async () => {
    const user = await open({ ...ONE, wallCladdingWwMore: JSON.stringify([{ decor: "WS229", decorCustom: "", qty: { 15: 1 } }]) });
    await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: /^VIGOUR/ }));
    expect(dw()).toMatchObject({ wallCladdingSupplier: "hm", wallCladdingWwMore: "", wallCladdingWwQty: "" });
    expect(await floorLines(dw())).not.toHaveProperty("WS22915");
    await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: /^winwall/ }));
    expect(chips()).toHaveLength(1);
  });

  it("↻ Vorschlag fills the open Dekor for the area the other Dekors leave; the first Dekor's proposal leaves the further plates out", { timeout: 20000 }, async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    const rest = w.bestOf(8 - 5); // 8 m² floor, the first Dekor has 2 × 100×250 = 5 m²
    expect(screen.getAllByTestId("wc-plate").map((p) => part(p, "best"))).toEqual(["13", "15", "16", "17"].map((c) => (rest[c as keyof w.Qty] ? `Vorschlag: ${rest[c as keyof w.Qty]}` : "")));
    await user.click(screen.getByRole("button", { name: "↻ Vorschlag aus Fläche" }));
    expect(more()).toEqual([{ decor: nextDecor(["WS203"]), decorCustom: "", qty: rest }]);
    expect(w.proposalOf(dw(), 0)).toEqual(w.bestOf(Math.max(0, 8 - WINWALL_FORMATS.reduce((a, f) => a + (rest[f.code as keyof w.Qty] || 0) * f.widthCm * f.heightCm / 1e4, 0))));
    // one Dekor: today's proposal
    expect(w.proposalOf(ONE, 0)).toEqual(w.bestOf(8));
  });

  it("a further Dekor typed with an invalid number: the red line, the send check, no price line", { timeout: 20000 }, async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    fireEvent.change(screen.getByLabelText("Anderes Dekor"), { target: { value: "WS 9" } });
    expect(part(screen.getByTestId("wc-custom"), "hint")).toMatch(/^Nicht erkannt/);
    // its decor is still the added one (an unreadable number does not change it) → make it "custom" like a stored invalid entry
    act(() => useOfferStore.getState().patch("duschwanne", { wallCladdingWwMore: JSON.stringify([{ decor: "custom", decorCustom: "WS 9", qty: { 15: 1 } }]) }));
    await waitFor(() => expect(flat(screen.getByTestId("wc-bad").textContent)).toBe("1 Platte mit ungültiger Dekor-Nr. (WS 9) – fehlen im Preis."));
    expect(missingMain(offer(), null).map((m) => m.key)).toContain("fbDekorUngueltig");
    expect(missingMain({ ...offer(), duschwanne: ONE }, null).map((m) => m.key)).not.toContain("fbDekorUngueltig");
    expect(await floorLines(dw())).toEqual({ WS20315: 2, R_4260602: 14 });
    void user;
  });
});

describe("Dekors — rules", () => {
  const d = (decor: string, qty: Partial<w.Qty>): w.Dekor => ({ decor, decorCustom: "", qty: { ...w.zero(), ...qty } });
  it("editDekor keeps the open chip on the same Dekor when one is stored or drops out", () => {
    const dwTwo = { ...ONE, ...w.moreFields([d("WS229", { 15: 1 }), d("NW220", { 17: 1 })]) };
    // pending WS000 (index 3) gets its first plate → stored at index 3 (after the stored ones)
    const r = w.editDekor(dwTwo, [d("WS000", {})], 3, 3, w.stepPlate(w.asFields(d("WS000", {})), "13", 1));
    expect([w.moreOf({ ...dwTwo, ...r.fields }).map((x) => x.decor), r.active, r.pending]).toEqual([["WS229", "NW220", "WS000"], 3, []]);
    // WS229 (index 1) stepped to 0: not stored, kept after the stored ones; the open chip follows it
    const s = w.editDekor(dwTwo, [], 1, 1, w.stepPlate(w.asFields(d("WS229", { 15: 1 })), "15", -1));
    expect([w.moreOf({ ...dwTwo, ...s.fields }).map((x) => x.decor), s.pending.map((x) => x.decor), s.active]).toEqual([["NW220"], ["WS229"], 2]);
    expect(w.removeDekor(dwTwo, [], 2, 1)).toEqual({ fields: w.moreFields([d("NW220", { 17: 1 })]), pending: [], active: 1 });
    expect(w.setSupplier(dwTwo, "hm")).toMatchObject({ wallCladdingWwMore: "" });
    expect(w.setSupplier(ONE, "hm")).not.toHaveProperty("wallCladdingWwMore");
  });
});
