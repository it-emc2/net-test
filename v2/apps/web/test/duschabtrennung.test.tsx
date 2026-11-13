// Duschabtrennung must store and show what today's UI does for the same inputs.
// Reference: fixtures/duschabtrennung.json, recorded from today's UI by
// v2/scripts/capture-duschabtrennung.cjs. The VIGOUR catalogue is fixtures/da-model-vigour.json
// (the real one, with the articles only of the enclosures the recordings reach); the Badolux
// catalogue is the file today's UI serves.
import { readFileSync } from "node:fs";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import * as w from "../src/features/steps/duschabtrennung/engine.js";
import type { Model } from "../src/features/steps/duschabtrennung/engine.js";
import { addCard, cardsOf, fieldsOf, hassmannPicks, isOn, modelKey, removeCard, switched } from "../src/features/steps/duschabtrennung/rules.js";
import { sketchSVG, specFor } from "../src/features/steps/duschabtrennung/sketch.js";
import * as z from "../src/features/steps/duschabtrennung/wizard.js";
import reference from "./fixtures/duschabtrennung.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
// read as files, not imported: the compiler need not work out the type of 300 kB of catalogue
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const vigour = json("./fixtures/da-model-vigour.json"), badolux = json("../../../../src/public/configurator/badolux-model.json");
const VIGOUR = vigour as Model, BADOLUX = badolux as Model;
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const squeeze = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");
const part = (el: Element, name: string) => (el.querySelector(`[data-part="${name}"]`)?.textContent ?? "").replace(/\s+/g, " "); // as recorded: any white space is one blank
const cards = () => screen.queryAllByTestId("da-card");
const card = (n: number | string) => cards()[Number(n) - 1]!;
const exact = (t: unknown) => new RegExp(`^\\s*${String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function open() {
  const server = fakeServer({ ...BASE, "GET /api/da-config/model/vigour": { body: vigour }, "GET /api/da-config/model/badolux": { body: badolux }, "POST /api/bitrix/log-action": { body: { ok: true } } });
  const router = renderApp(`/deal/${KEY}/bu/DuschabtrennungNeu`);
  await screen.findByRole("heading", { name: "Duschabtrennung" });
  return { base: structuredClone(offer()), router, server };
}
const ready = (n: number | string) => waitFor(() => expect(within(card(n)).getByTestId("da-step")).toBeTruthy());
async function play(steps: (string | number)[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c, d] of steps) {
    if (kind === "on" || kind === "off") { await user.click(screen.getByRole("switch", { name: "Duschabtrennung" })); if (kind === "on") await ready(1); }
    else if (kind === "supplier") { await user.click(within(card(a!)).getByRole("radio", { name: b === "badolux" ? "Badolux" : "VIGOUR" })); await ready(a!); }
    else if (kind === "pick") await user.click(Array.from(within(card(a!)).getByTestId("da-options").querySelectorAll("button")).find((o) => exact(b).test(part(o, "title")))!);
    else if (kind === "size") await user.click(within(within(card(a!)).getAllByTestId("da-part")[Number(b) - 1]!.querySelectorAll('[data-part="row"]')[Number(c) - 1] as HTMLElement).getByRole("button", { name: exact(d) }));
    else if (kind === "answered") await user.click(within(card(a!)).getByTestId("da-answered").querySelectorAll("button")[Number(b) - 1]!);
    else if (kind === "back") await user.click(within(card(a!)).getByRole("button", { name: "Zurück" }));
    else if (kind === "reset") await user.click(within(card(a!)).getByRole("button", { name: "Neu konfigurieren" }));
    else if (kind === "extra") await user.click(within(card(a!)).getByTestId("da-extra").querySelector('input[type="checkbox"]')!);
    else if (kind === "extraqty") await user.click(within(within(card(a!)).getByTestId("da-extra")).getByRole("button", { name: b === "+" ? /: mehr$/ : /: weniger$/ }));
    else if (kind === "tray") await user.click(within(card(a!)).getAllByTestId("da-tray")[Number(b) - 1]!);
    else if (kind === "add") { await user.click(screen.getByRole("button", { name: "Weitere Duschabtrennung hinzufügen" })); await ready(cards().length); }
    else if (kind === "remove") await user.click(within(card(a!)).getByRole("button", { name: /entfernen$/ }));
    else if (kind === "next") await user.click(screen.getByRole("button", { name: "Weiter" }));
    else throw new Error(`step not handled: ${kind}`);
  }
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown>, now: Record<string, unknown>) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
const item = (r: Element) => ({ title: part(r, "title"), sub: part(r, "sub"), stock: squeeze(part(r, "stock")) });

interface Item { title: string; sub: string; stock: string; on?: boolean; qty?: string | null; price?: string; link?: string }
interface View {
  on: boolean; addShown: boolean;
  cards: { shown: boolean; title: string; supplier: string; removeShown: boolean; answered: { k: string; v: string }[]; step: string; back: boolean; options: { title: string; sub: string; picture: string }[];
    parts: { label: string; rows: { k: string; opts: string[] }[] }[]; extras: Item[]; trays: Item[]; reset: boolean; sketch: boolean; info: string; preview: string; previewSrc: string; summary: { hint: string; lines: Item[]; total: string } }[];
}

describe("Duschabtrennung stores and shows what today's UI does", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const { base, router } = await open();
    await play(scenario.steps);
    await waitFor(() => expect(changed(base.duschabtrennung, offer().duschabtrennung)).toEqual(scenario.duschabtrennung));
    expect(Object.keys(base).filter((k) => k !== "duschabtrennung" && !same(base[k], offer()[k]))).toEqual(Object.keys((scenario as { elsewhere?: object }).elsewhere ?? {})); // nothing else in the offer changes
    const next = (scenario as { next?: { step: string; alerts: string[] } }).next;
    if (next) { await waitFor(() => expect(router.state.location.pathname.split("/").pop()).toBe(next.step)); return; }

    const v = scenario.view as unknown as View;
    expect((screen.getByRole("switch", { name: "Duschabtrennung" }) as HTMLInputElement).checked).toBe(v.on);
    expect(!!screen.queryByRole("button", { name: "Weitere Duschabtrennung hinzufügen" })).toBe(v.addShown);
    expect(cards().length).toBe(v.cards.filter((c) => c.shown).length); // off: no cards
    if (!v.on) return;
    v.cards.forEach((c, i) => {
      const el = cards()[i]!, q = within(el);
      expect([part(el, "card-title"), el.dataset.supplier, !!q.queryByRole("button", { name: /entfernen$/ })]).toEqual([c.title, c.supplier, c.removeShown]);
      expect(Array.from(q.queryByTestId("da-answered")?.querySelectorAll("button") ?? []).map((r) => ({ k: part(r, "k"), v: part(r, "v").trim() }))).toEqual(c.answered);
      expect([q.getByTestId("da-step").textContent, !!q.queryByRole("button", { name: "Zurück" })]).toEqual([c.step, c.back]);
      const options = Array.from(q.queryByTestId("da-options")?.querySelectorAll("button") ?? []);
      expect(options.map((o) => ({ title: part(o, "title").trim(), sub: part(o, "sub") }))).toEqual(c.options.map(({ title, sub }) => ({ title, sub })));
      c.options.forEach((o, n) => { // a drawing (Badolux) or the catalogue's picture
        if (o.picture === "sketch") expect(options[n]!.querySelector("svg.bs-small")).toBeTruthy();
        else if (o.picture) expect(options[n]!.querySelector("img")?.getAttribute("src")).toBe(o.picture);
      });
      expect(q.queryAllByTestId("da-part").map((p) => ({ label: p.querySelector("legend")!.textContent!.toUpperCase(), rows: Array.from(p.querySelectorAll('[data-part="row"]')).map((r) => ({ k: part(r, "k"), opts: Array.from(r.querySelectorAll("button")).map((b) => `${b.getAttribute("aria-pressed") === "true" ? "*" : ""}${b.textContent}`) })) })))
        .toEqual(c.parts.map((p) => ({ ...p, label: p.label.toUpperCase() })));
      expect(q.queryAllByTestId("da-extra").map((r) => ({ ...item(r), on: (r.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, qty: (r.querySelector('input[type="number"]') as HTMLInputElement | null)?.value ?? null })))
        .toEqual(c.extras.map((e) => ({ title: e.title, sub: e.sub, stock: squeeze(e.stock), on: e.on, qty: e.qty })));
      expect(q.queryAllByTestId("da-tray").map((r) => ({ ...item(r), on: r.getAttribute("aria-pressed") === "true" }))).toEqual(c.trays.map((t) => ({ title: t.title, sub: t.sub, stock: squeeze(t.stock), on: t.on })));
      // today a part that is sized by itself completes the card one drawing late: "Neu konfigurieren" is missing until the next tap
      expect([!!q.queryByRole("button", { name: "Neu konfigurieren" }), !!q.queryByTestId("da-sketch"), q.queryByTestId("da-info")?.querySelector("summary")?.textContent ?? ""]).toEqual([c.reset || c.summary.lines.length > 0, c.sketch, c.info]);
      const preview = q.queryByTestId("da-preview");
      expect([preview ? part(preview, "preview-label").trim() : "", preview?.querySelector("img")?.getAttribute("src") ?? ""]).toEqual([c.preview, c.previewSrc]);
      const summary = q.getByTestId("da-summary");
      expect(part(summary, "hint")).toBe(c.summary.hint);
      expect(within(summary).queryAllByTestId("da-line").map((r) => ({ ...item(r), title: squeeze(part(r, "title")), price: squeeze(part(r, "price")), link: r.querySelector("a")?.getAttribute("href") ?? "" })))
        .toEqual(c.summary.lines.map((l) => ({ title: squeeze(l.title), sub: l.sub, stock: squeeze(l.stock), price: squeeze(l.price), link: l.link })));
      expect(squeeze(part(summary, "total"))).toBe(squeeze(c.summary.total));
    });
  });
});

describe("Duschabtrennung — pictures, drawing, audit trail, older picks", () => {
  const BXN = [["on"], ["supplier", 1, "badolux"], ["pick", 1, "Nische"], ["pick", 1, "Falttür"], ["pick", 1, "Anschlag links"]];

  it("a tap on a picture shows all pictures large; arrows and keys change the picture, Esc closes", async () => {
    await open();
    await play(BXN);
    const user = userEvent.setup(), preview = within(card(1)).getByTestId("da-preview");
    const count = z.previewImages(BADOLUX, { selections: { Einbausituation: "nische", Tuer: "falt", Anschlag: "falt_links", Duschabtrennung: "nische_falt_links" }, sizes: {} }).length;
    expect(count).toBeGreaterThan(6);
    expect(within(preview).getByRole("button", { name: `${count - 6} weitere Bilder` })).toBeTruthy();
    await user.click(within(preview).getByRole("button", { name: /^Bild 2 vergrößern/ }));
    const box = screen.getByRole("dialog", { name: "Bilder" });
    expect(part(box, "caption")).toMatch(new RegExp(`^2 / ${count} · `));
    await user.click(within(box).getByRole("button", { name: "Nächstes Bild" }));
    await user.keyboard("{ArrowRight}");
    expect(part(box, "caption")).toMatch(new RegExp(`^4 / ${count} · `));
    await user.click(within(box).getByRole("button", { name: "Vorheriges Bild" }));
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(part(box, "caption")).toMatch(new RegExp(`^${count} / ${count} · `)); // round again from the first
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Bilder" })).toBeNull();
    await user.click(within(preview).getByRole("button", { name: /^Bild vergrößern/ }));
    await user.click(within(screen.getByRole("dialog", { name: "Bilder" })).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog", { name: "Bilder" })).toBeNull();
  });

  it("the drawing: the door plays once, opens and closes on a tap and with the mouse over it; a walk-in has nothing to move", { timeout: 20000 }, async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); // reduced motion: the door jumps to its end state, so the test does not depend on frame timing
    await open();
    await play(BXN);
    const user = userEvent.setup();
    const door = () => within(card(1)).getByRole("button", { name: "Zeichnung: Tür öffnen oder schließen" });
    // right after the side was picked the door plays once by itself: open, then closed again
    await waitFor(() => expect(door().getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(door().getAttribute("aria-pressed")).toBe("false"), { timeout: 4000 });
    const drawn = (open: number) => { const d = document.createElement("div"); d.innerHTML = sketchSVG(specFor({ Einbausituation: "nische", Tuer: "falt", Anschlag: "falt_links" }, {}), { open }); return d.innerHTML; };
    const closed = drawn(0);
    await waitFor(() => expect(door().innerHTML).toBe(closed), { timeout: 4000 });
    fireEvent.click(door()); // a tap (iPad): open …
    await waitFor(() => expect([door().getAttribute("aria-pressed"), door().innerHTML]).toEqual(["true", drawn(1)]), { timeout: 4000 });
    fireEvent.click(door()); // … and closed again
    await waitFor(() => expect([door().getAttribute("aria-pressed"), door().innerHTML]).toEqual(["false", closed]), { timeout: 4000 });
    await user.hover(door()); // the mouse over it opens the door, leaving closes it
    await waitFor(() => expect(door().innerHTML).toBe(drawn(1)), { timeout: 4000 });
    await user.unhover(door());
    await waitFor(() => expect(door().innerHTML).toBe(closed), { timeout: 4000 });
    await play([["answered", 1, 1], ["pick", 1, "Walk-In"]]);
    expect((door() as HTMLButtonElement).disabled).toBe(true);
    expect(within(card(1)).queryByText("Antippen zeigt, wie die Tür öffnet")).toBeNull();
  });

  it("every answer is written to the audit trail, as today; a failing log never stops the wizard", async () => {
    const { server } = await open();
    await play([["on"], ["pick", 1, "Nischenlösung"], ["pick", 1, "Pendeltür 1-teilig"]]);
    const logs = server.calls.filter((c) => c.key === "POST /api/bitrix/log-action").map((c) => c.body);
    expect(logs).toEqual([
      { event: "duschabtrennung_leaf_selected", dealId: "", offerType: "BU", message: "1_EBS_Einbausituationen=010_Nischenloesung (Nischenlösung)" },
      { event: "duschabtrennung_leaf_selected", dealId: "", offerType: "BU", message: "4_AufbauDuschabtrennung=053_Pendeltuere_1tlg._Nische (Pendeltür 1-teilig)" },
    ]);
    fakeServer({ ...BASE, "POST /api/bitrix/log-action": { status: 500, body: { error: "x" } } });
    await play([["pick", 1, "Serie 1.0 VIGOUR"]]);
    expect(within(card(1)).getByTestId("da-step").textContent).toBe("Ausführung der Duschabtrennung");
  });

  it("picks of the older page Hassmann Duschsysteme are named, stay in the offer and lead to the old view", async () => {
    await open();
    expect(screen.queryByTestId("da-hassmann")).toBeNull();
    const pick = { kind: "door", label: "Pendeltür alt", qty: 1, price: "799,00", productId: "HASS-1" };
    useOfferStore.getState().patch("duschabtrennung" as never, { quickAdd: [pick] } as never);
    const note = await screen.findByTestId("da-hassmann");
    expect(note.textContent).toMatch(/^1 Position aus „Hassmann Duschsysteme“/);
    expect(within(note).getByRole("link", { name: "Hassmann Duschsysteme in der bisherigen Ansicht" })).toBeTruthy();
    await play([["on"], ["pick", 1, "Nischenlösung"], ["pick", 1, "Pendeltür 1-teilig"], ["pick", 1, "Serie 1.0 VIGOUR"], ["pick", 1, "Linke Ausführung"], ["size", 1, 1, 1, "800"]]);
    await waitFor(() => expect(offer().duschabtrennung.quickAdd.map((q: { productId: string }) => q.productId)).toEqual(["HASS-1", "V1P180E"]));
    expect(hassmannPicks(offer().duschabtrennung)).toBe(1);
  });
});

describe("Duschabtrennung — rules", () => {
  const nische = (model = VIGOUR) => {
    let s = z.start(model);
    for (const label of ["Nischenlösung", "Pendeltür 1-teilig", "Serie 1.0 VIGOUR ", "Linke Ausführung"]) {
      const step = w.currentStep(model, s) as { paramId: string };
      s = z.answer(model, s, step.paramId, w.availableOptions(model, s, step.paramId).find((o) => o.label === label)!.value);
    }
    return s;
  };

  it("the engine: one leaf after the structure questions, an article per part once sized", () => {
    const s = nische();
    expect([w.currentStep(VIGOUR, s).phase, w.resolveConfiguration(VIGOUR, s), z.canGoBack(VIGOUR, s)]).toEqual(["component", null, true]);
    const done = w.setComponentSize(s, "Auswahl_Tuer1", 800, 1900);
    expect([w.currentStep(VIGOUR, done).phase, z.resolved(VIGOUR, done)!.lines.map((l) => l.article.articleNumber), z.resolved(VIGOUR, done)!.net]).toEqual(["done", ["V1P180E"], 338.4]);
    expect(w.resolveConfiguration(VIGOUR, w.setComponentSize(s, "Auswahl_Tuer1", 801, 1900))).toBeNull(); // no article of that size — never another one
  });

  it("an answer keeps the earlier ones, drops the sizes and keeps the picked extras", () => {
    const s = z.toggleExtra(w.setComponentSize(nische(), "Auswahl_Tuer1", 800, 1900), "VZVP1195");
    const again = z.reopen(VIGOUR, s, "Serie");
    expect([Object.keys(again.selections), again.sizes, again.extras]).toEqual([["1_EBS_Einbausituationen", "4_AufbauDuschabtrennung"], {}, ["VZVP1195"]]);
    expect(z.goBack(VIGOUR, s).selections["C-35238"]).toBeUndefined(); // back: the last real choice is open again
    expect(z.start(VIGOUR).selections).toEqual({});
  });

  it("the widening profile counts with its quantity; the tray only fits its radius and width", () => {
    const s = z.setExtraQty(z.toggleExtra(w.setComponentSize(nische(), "Auswahl_Tuer1", 800, 1900), "VZVP1195"), "VZVP1195", 3);
    expect(Math.round(z.resolved(VIGOUR, s)!.net * 100)).toBe(Math.round((338.4 + 3 * 49.27) * 100));
    expect([z.extraQty(z.setExtraQty(s, "VZVP1195", 0), "VZVP1195"), z.extrasFor(BADOLUX).length, z.traysFor(VIGOUR, s)]).toEqual([1, 0, []]);
    expect([z.TRAYS[550]![900]!.map((t) => t.articleNumber), z.trayName(z.TRAYS[500]![800]![0]!, 800)]).toEqual([["V3ME90AN", "V3ME90BG", "V3ME90GR", "V3ME90SM", "V3ME90SP"], "Viertelkreis-Duschwanne 80×80×6,5 cm Weiß (Acryl one)"]);
  });

  it("a part with one size is sized by itself (Badolux pendulum door: the 40 cm door)", () => {
    let s = z.start(BADOLUX);
    for (const v of [["Einbausituation", "nische"], ["Tuer", "pendel"], ["Anschlag", "pendel_links"]] as const) s = z.autoSize(BADOLUX, z.answer(BADOLUX, s, v[0], v[1]));
    expect(s.sizes).toEqual({ Pendeltuer: { width: "40 cm", height: "" } });
    expect(z.answeredRows(BADOLUX, s).map((r) => r.values[0])).toEqual(["Nische", "Pendeltür", "Festglas links"]);
    expect(sketchSVG(specFor(s.selections, s.sizes), { small: true })).toMatch(/^<svg class="bs bs-small"/);
    expect(specFor({}, {})).toBeNull();
  });

  it("the offer: lines only of complete cards, only while on; the configuration only while there are lines", () => {
    const done = { id: 1, supplier: "vigour" as const, model: VIGOUR, state: w.setComponentSize(nische(), "Auswahl_Tuer1", 800, 1900) };
    const open2 = { id: 2, supplier: "badolux" as const, model: BADOLUX, state: z.start(BADOLUX) };
    const hassmann = { kind: "door", label: "alt", qty: 1, price: "10", productId: "X" }, curtain = { kind: "config", group: "Duschvorhang", label: "Vorhang", qty: 1, price: 5, productId: "V" };
    const f = fieldsOf({ quickAdd: [hassmann, { kind: "config", label: "old", price: 1 }, curtain] }, [done, open2], true) as Record<string, any>;
    expect(f.quickAdd.map((q: { productId?: string }) => q.productId)).toEqual(["X", "V1P180E", "V"]);
    expect([f.configurator.state.map((s: { __supplier: string }) => s.__supplier), f.configurator.lines.length, f.configurator.previewImages.length]).toEqual([["vigour", "badolux"], 1, 1]);
    const off = switched({ ...f }, false) as Record<string, any>;
    expect([off.configEnabled, off.quickAdd.map((q: { productId?: string }) => q.productId), "configurator" in off]).toEqual([false, ["X", "V"], false]);
    expect(fieldsOf({}, [open2], true).configurator).toBeUndefined();
  });

  it("an opened offer: its cards, the switch of older offers, the earlier Badolux list", () => {
    expect(cardsOf({})).toEqual([{ id: 1, supplier: "vigour", state: {} }]);
    expect(cardsOf({ configurator: { state: { selections: { a: "b" }, sizes: {} } } })).toEqual([{ id: 1, supplier: "vigour", state: { selections: { a: "b" }, sizes: {} } }]);
    const two = cardsOf({ configurator: { state: [{ __supplier: "badolux", selections: { Produkt: "x" }, sizes: {} }, { __supplier: "vigour", selections: {}, sizes: {} }] } });
    expect([two.map((c) => c.supplier), two.map(modelKey)]).toEqual([["badolux", "vigour"], ["badolux-v1", "vigour"]]);
    expect([isOn({}), isOn({ configurator: { lines: [{}] } }), isOn({ configEnabled: false, configurator: { lines: [{}] } })]).toEqual([false, true, false]);
    expect([addCard(two).map((c) => c.id), removeCard(two, 1).map((c) => c.id), removeCard([two[0]!], 1).length]).toEqual([[1, 2, 3], [2], 1]);
  });
});
