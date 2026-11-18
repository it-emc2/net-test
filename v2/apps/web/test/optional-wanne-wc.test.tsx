// Optionale Produkte → Wanne and WC (Badumbau) must store and show what today's UI does for the
// same inputs. Reference: fixtures/optional-wanne-wc.json, recorded from today's UI by
// v2/scripts/capture-optional-wanne-wc.cjs — with the answers of the bathtub catalogue and the
// price list, which the fake server gives back here.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { arbeitenChanges, chooseKind } from "../src/features/steps/arbeiten/rules.js";
import { NO_UI, chips, closeCard, count, openCard, removeChip, type State } from "../src/features/steps/optional/rules.js";
import { answer, applySelection, clearPick, dwOf, fromSelection, resultsOf, screenFit, stepOf, type WItem } from "../src/features/steps/optional/wanne-rules.js";
import { clearWc, groupsOf, renamed, setMontage, setSeat, setWcQty, ticked, toggleTile } from "../src/features/steps/optional/wc-rules.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/optional-wanne-wc.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const parts = (el: Element, name: string) => Array.from(el.querySelectorAll(`[data-part="${name}"]`)).map((x) => flat(x.textContent));
const byId = (testId: string, id: unknown) => screen.getAllByTestId(testId).find((e) => e.dataset.id === String(id))!;
const ITEMS = reference.catalog.items as unknown as WItem[];
const PRODUCTS = reference.products as Record<string, { productId?: string; name: string | null; price: number | null }>;
const product = (id: string) => (PRODUCTS[id]?.productId ? { body: PRODUCTS[id] } : { status: 404, body: { error: { code: "NOT_FOUND", message: "nicht gefunden", requestId: "t" } } });

async function open() {
  const server = fakeServer({
    ...BASE, "GET /admin/api/config/public": { body: arbeiten.config }, "GET /api/bathtubs/catalog": { body: reference.catalog },
    ...Object.fromEntries(Object.keys(PRODUCTS).map((id) => [`GET /api/products/${id}`, product(id)])),
  });
  const router = renderApp(`/deal/${KEY}/bu/Optional`);
  await screen.findByRole("heading", { name: "Optionale Produkte" });
  return { base: structuredClone(offer()), router, server };
}
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  const dialog = () => screen.getByRole("dialog");
  const click = async (el: Element | null | undefined, what: string) => { if (!el) throw new Error(`not found: ${what}`); await user.click(el); };
  for (const [kind, a, b] of steps) {
    const o = offer();
    if (kind === "kind") useOfferStore.getState().patchAll(arbeitenChanges(o, chooseKind(o.duschwanne, String(a))));
    else if (kind === "cat") { await user.click(byId("opt-card", a)); if (a === "WANNE") await within(dialog()).findByTestId("wanne"); }
    else if (kind === "done") await user.click(screen.getByRole("button", { name: "Fertig" }));
    else if (kind === "set") await click(dialog().querySelector(`[data-testid="wanne-tile"][data-set="${a}"]`), `${a}`);
    else if (kind === "act") await user.click(within(dialog()).getByRole("button", { name: a === "only" ? "Nur einen Wannenaufsatz wählen (ohne Wanne)" : "Neu beginnen" }));
    else if (kind === "crumb") await click(dialog().querySelector(`[data-crumb="${a}"]`), `crumb ${a}`);
    else if (kind === "more") { const d = dialog().querySelector<HTMLDetailsElement>('[data-testid="wanne-more"]')!; await user.click(d.querySelector("summary")!); if (!d.open) d.open = true; }
    else if (kind === "chip") await click(dialog().querySelector(`[data-chip="${a}"][data-val="${b}"]`), `chip ${a} ${b}`);
    else if (kind === "pick") await click(dialog().querySelector(`[data-testid="wanne-card"][data-art="${a}"]`), `card ${a}`);
    else if (kind === "montage") await click(dialog().querySelector(`input[name="wcMontage"][value="${a}"]`), `montage ${a}`);
    else if (kind === "seat") await click(dialog().querySelector(`input[name="wcSeatHeight"][value="${a}"]`), `seat ${a}`);
    else if (kind === "tile") await click(byId("wc-tile", a).querySelector('input[type="checkbox"]'), `tile ${a}`);
    else if (kind === "qty") fireEvent.change(document.getElementById(`wc_${a}`)!, { target: { value: String(b) } });
    else if (kind === "chipx") await user.click(within(screen.getAllByTestId("opt-chip").find((x) => part(x, "text").includes(String(a)))!).getByRole("button"));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));

function wanneNow(panel: HTMLElement) {
  const q = (id: string) => Array.from(panel.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const visible = (el: Element) => !el.closest("details") || (el.closest("details") as HTMLDetailsElement).open;
  const more = panel.querySelector<HTMLDetailsElement>('[data-testid="wanne-more"]');
  return {
    question: q("wanne-question").map((x) => flat(x.textContent))[0] ?? null,
    tiles: q("wanne-tile").map((t) => ({ set: t.dataset.set, title: part(t, "title"), sub: part(t, "sub"), off: (t as HTMLButtonElement).disabled })),
    only: !!within(panel).queryByRole("button", { name: "Nur einen Wannenaufsatz wählen (ohne Wanne)" }),
    crumbs: Array.from(panel.querySelectorAll<HTMLElement>("[data-crumb]")).map((c) => [c.dataset.crumb, part(c, "label")]),
    reset: !!within(panel).queryByRole("button", { name: "Neu beginnen" }),
    hint: q("wanne-hint").map((x) => flat(x.textContent))[0] ?? null,
    heads: q("wanne-head").map((x) => flat(x.textContent)),
    notes: q("wanne-note").filter(visible).map((x) => flat(x.textContent)),
    more: more ? { summary: flat(more.querySelector("summary")!.textContent), open: more.open } : null,
    chips: Array.from(panel.querySelectorAll<HTMLElement>("[data-chip]")).map((c) => [c.dataset.chip, c.dataset.val, flat(c.textContent), c.getAttribute("aria-pressed") === "true"]),
    cards: q("wanne-card").map((c) => ({
      art: c.dataset.art, on: c.getAttribute("aria-pressed") === "true", reco: !!c.querySelector('[data-part="reco"]'), title: part(c, "title"), pills: parts(c, "pill"), notes: parts(c, "note"),
      name: part(c, "name"), price: part(c, "price"), link: c.parentElement!.querySelector<HTMLAnchorElement>('a[data-part="link"]')?.getAttribute("href") ?? null,
    })),
    empty: q("wanne-empty").map((x) => flat(x.textContent)),
    summary: flat(q("wanne-summary")[0]?.textContent),
  };
}
function wcNow(panel: HTMLElement) {
  const radio = (name: string) => panel.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "";
  const tile = (t: HTMLElement) => {
    const box = t.querySelector<HTMLInputElement>('input[type="checkbox"]')!, qty = t.querySelector<HTMLInputElement>('input[type="number"]');
    return {
      id: t.dataset.id, name: part(t, "name"), art: part(t, "art") || null, price: part(t, "price") || null,
      dims: Array.from(t.querySelectorAll('[data-part="dim"]')).map((d) => Array.from(d.children).map((x) => flat(x.textContent))), on: box.checked, locked: box.disabled, qty: qty ? qty.value : null,
    };
  };
  return {
    montage: radio("wcMontage"), seat: panel.querySelector('input[name="wcSeatHeight"]') ? radio("wcSeatHeight") : null,
    groups: Array.from(panel.querySelectorAll<HTMLElement>('[data-testid="wc-group"]')).map((g) => ({
      kind: g.dataset.kind, head: flat(g.querySelector("h4")!.textContent),
      items: Array.from(g.querySelectorAll<HTMLElement>('[data-testid="wc-pair"]')).map((p) => Array.from(p.querySelectorAll<HTMLElement>('[data-testid="wc-tile"]')).map(tile)),
    })),
  };
}

type Scenario = (typeof reference.scenarios)[number];
describe("Optionale Produkte — Wanne and WC store and show what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario: Scenario) => {
    const { base } = await open();
    await play(scenario.steps as (string | number)[][]);
    const elsewhere = ("elsewhere" in scenario ? scenario.elsewhere : {}) as Record<string, unknown>;
    await waitFor(() => expect(changed(base.optional, offer().optional)).toEqual(scenario.optional));
    // the bathtub on the duschwanne path, the tasks and the work time follow; nothing else changes
    for (const k of new Set([...Object.keys(base), ...Object.keys(offer())])) if (k !== "optional") expect([k, changed(base[k], offer()[k])]).toEqual([k, elsewhere[k] ?? {}]);

    const v = scenario.view as any;
    expect(screen.getAllByTestId("opt-card").map((c) => ({ id: c.dataset.id, on: c.getAttribute("aria-pressed") === "true", badge: part(c, "badge"), counted: c.querySelector('[data-part="badge"]')!.getAttribute("data-counted") === "true" })).filter((c) => c.on || c.counted || c.badge !== "✓ 0")).toEqual(v.cards);
    const bar = screen.queryByTestId("opt-bar");
    expect(bar ? { head: part(bar, "head"), chips: within(bar).getAllByTestId("opt-chip").map((c) => ({ text: part(c, "text"), title: flat(c.title), fixed: !c.querySelector("button") })) } : null)
      .toEqual(v.bar && { head: v.bar.head, chips: v.bar.chips.map((c: any) => ({ text: flat(c.text), title: flat(c.title), fixed: c.fixed })) });
    const dialog = screen.queryByRole("dialog");
    if (!v.dialog) { expect(dialog).toBeNull(); return; }
    const panel = within(dialog!).getByTestId("opt-panel");
    expect({ title: flat(dialog!.querySelector("#opt-dialog-title")?.textContent), cat: panel.dataset.cat }).toEqual({ title: v.dialog.title, cat: v.dialog.cat });
    if (v.dialog.wanne) expect(wanneNow(panel)).toEqual(v.dialog.wanne);
    if (v.dialog.wc) expect(wcNow(panel)).toEqual(v.dialog.wc);
  });
});

describe("Optionale Produkte — Wanne and WC rules", () => {
  const fresh = (): State => ({ opt: structuredClone(useOfferStore.getState().offer?.optional ?? {}) as Record<string, unknown>, ui: NO_UI });
  const tub = (art: string) => ITEMS.find((p) => p.articleNumber === art)!;

  it("which screen fits which tub: the door end, a wall to hinge on, a side panel only at a free end of the same width", () => {
    expect(screenFit(tub("ST170-EL-TL"), tub("STSA-2T-L")).ok).toBe(true);
    expect(screenFit(tub("ST170-EL-TR"), tub("STSA-2T-R")).reason).toBe("An der Türseite ist keine Wand, an der der Aufsatz angeschlagen werden kann.");
    expect(screenFit(tub("ST170-EL-TL"), tub("STSA-2T-R")).reason).toBe("Der Aufsatz steht immer auf der Türseite.");
    expect(screenFit(tub("IRIS160L2S"), tub("STSA-2T-L")).reason).toBe("Passt nicht zu dieser Wanne.");
    expect(screenFit(tub("IRIS160L2S"), tub("IRISWA14S70L")).reason).toBe("Aufsatz mit Seitenwand braucht ein freies Ende an der Tür – hier steht dort eine Wand.");
  });

  it("an opened offer starts the wizard on the answers of its pick; a tub of the old catalogue asks for a new pick", () => {
    expect(fromSelection(ITEMS, { chosenBathtubProductId: "ST170-EL-TL", chosenScreenProductId: "STSA-2T-L" })).toEqual({ einbau: "Ecke", wall: "links", side: "links", mode: "screen" });
    expect(fromSelection(ITEMS, { chosenScreenProductId: "IRISWA14R" })).toEqual({ mode: "only", side: "rechts" });
    const old = ITEMS.find((p) => p.type === "tub" && p.wizard === false)!;
    expect(resultsOf(ITEMS, { chosenBathtubProductId: old.articleNumber }, {})[0]).toEqual({ kind: "hint", text: `Die gespeicherte Wanne ${old.articleNumber} stammt aus dem alten Katalog ohne Angabe der Wandseite. Bitte hier neu auswählen.` });
    expect(stepOf(ITEMS, { mode: "only", side: "links" })).toBeNull();
  });

  it("picks: again unpicks; 'Ohne Aufsatz' drops the screen; the bar empties article, name, price — not the offer text", () => {
    let opt = applySelection(ITEMS, applySelection(ITEMS, {}, tub("ST170-EL-TL")), tub("STSA-2T-L"));
    expect([opt.chosenBathtubProductId, opt.chosenScreenProductId, dwOf(opt).wannenaufsatzProductId]).toEqual(["ST170-EL-TL", "STSA-2T-L", "STSA-2T-L"]);
    expect(answer(opt, {}, "mode", "plain").opt.chosenScreenProductId).toBe("");
    expect(applySelection(ITEMS, opt, tub("ST170-EL-TL")).chosenBathtubProductId).toBe("");
    opt = clearPick(opt, "tub");
    expect([opt.chosenBathtubProductId, opt.bathtubSize, opt.chosenBathtubDesc !== "", dwOf(opt).wanneZubehoer]).toEqual(["", "", true, []]);
  });

  it("WC: the Montageart ticks the required products; one WC with the seat of its pair; leaving it empty forgets everything", () => {
    const names = {};
    let opt = setMontage({}, names, "Wandmontage", null);
    expect([...ticked(opt, names)]).toEqual(["CVIS3WCT112", "SCHALL", "V1DON", "0601010003", "WWCAG90"]);
    opt = toggleTile(setSeat(opt, names, "normal"), names, "DEDWWC");
    expect([ticked(opt, names).has("DERSIAS__pair_DEDWWC"), opt.qty_DERSIAS, opt["optWcWall_alias[]"]]).toEqual([true, "1", ["WC-Sitz derby rund"]]);
    opt = toggleTile(opt, names, "DERWWCOSVP");
    expect([ticked(opt, names).has("DEDWWC"), ticked(opt, names).has("DERSIAS"), opt["optWcWall_alias[]"]]).toEqual([false, true, undefined]);
    expect(setWcQty(opt, "DERSIAS__pair_DEDWWC", "3").qty_DERSIAS).toBe("3");
    expect(groupsOf("Bodenmontage").map((g) => [g.kind, g.items.flat()])).toEqual([["optional", ["CLPWCF10", "WCBF", "CLPSSI", "WWCAG90"]]]);
    const empty = clearWc(opt, names);
    expect([empty.wcMontage, empty["optWcWall[]"], empty.qty_CVIS3WCT112]).toEqual([undefined, undefined, "0"]);
    expect(renamed(opt, { CVIS3WCT112: "VIS neu" })!["optWcWall[]"]).toContain("VIS neu"); // names from the price list replace the page's own
  });

  it("WC quantities are stored in page order — the price lists the products in that order (compare-optional-wanne-wc-prices.cjs)", () => {
    const names = {};
    const order = (opt: Record<string, unknown>) => Object.keys(opt).filter((k) => k.startsWith("qty_") && Number(opt[k]) > 0).map((k) => k.slice(4));
    const wall = toggleTile(setSeat(setMontage({ cat_WC: "on", qty_CLPESG60: "0" }, names, "Wandmontage", null), names, "normal"), names, "DERWWCOSVP");
    expect(order(wall)).toEqual(["CVIS3WCT112", "SCHALL", "V1DON", "0601010003", "WWCAG90", "DERWWCOSVP", "DERSIAS"]); // today: the WC before its seat
    const floor = toggleTile(toggleTile(setMontage({}, names, "Bodenmontage", null), names, "CLPWCF10"), names, "CLPSSI");
    expect(order(floor)).toEqual(["CLPWCF10", "CLPSSI", "WWCAG90"]); // the Anschlussgarnitur stands at the end of the Boden group
    expect(Object.keys(wall).indexOf("qty_CLPESG60")).toBe(1); // the other fields keep their place
  });

  it("the cards: WC is stored as ticked while open; chips of the tub are removable", () => {
    let s = openCard(fresh(), "WC");
    expect(s.opt.cat_WC).toBe("on");
    expect(closeCard(s, "WC").opt.cat_WC).toBeUndefined();
    s = { opt: { chosenBathtubProductId: "ST170-EL-TL", chosenBathtubName: "x", chosenBathtubPrice: "1" }, ui: NO_UI };
    expect([count(s, "WANNE"), chips(s).map((c) => c.text)]).toEqual([1, ["ST170-EL-TL"]]);
    expect(removeChip(s, chips(s)[0]!).opt.chosenBathtubProductId).toBe("");
  });
});
