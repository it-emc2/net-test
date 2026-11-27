// Owner 2026-11-27 (ADR 032): (A) Wandverkleidung „Ausführung“ — two further answers with sketches,
// the height for „halbhoch“; (B) the wall-mounted WC's Vorwand needs one winwall plate 100 × 250 cm:
// the WC card adds it explicitly (in the Wandverkleidung's Dekor, or as a further Dekor picked in
// the Wandverkleidung step), notes it once in „Weitere Arbeiten“, and takes both out again.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { wvChanges } from "../src/features/steps/arbeiten/rules.js";
import { KIND_TILES } from "../src/features/steps/wandverkleidung/KindSketch.js";
import { HALF_HEIGHT_KIND, KINDS, rowsOf } from "../src/features/steps/wandverkleidung/rules.js";
import { KEPT, MARK, NOTE, REMOVED, VIS, addPlate, decorName, afterOptChange, cardOf, followPlate, markOf, removePlate, wantsPlate } from "../src/features/steps/wandverkleidung/wc-plate.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
type Fields = Record<string, unknown>;
const ROWS = (rows: object[]) => JSON.stringify(rows);
const WALL = { wcMontage: "Wandmontage", [`qty_${VIS}`]: "1" };
const make = (wv: Fields, opt: Fields = WALL, dw: Fields = {}) => ({ optional: opt, wandverkleidung: { wvSupplier: "ww", wvUi: "simple", ...wv }, duschwanne: dw });
/** apply a change the way the screens do (wv fields, then the Arbeiten note) */
const apply = (o: Record<string, any>, c: { wv: Fields; dw: Fields }): Record<string, any> => {
  const wv = { ...o.wandverkleidung, ...c.wv }, dw = { ...o.duschwanne, ...c.dw };
  for (const k of Object.keys(c.wv)) if (c.wv[k] === undefined) delete wv[k];
  for (const k of Object.keys(c.dw)) if (c.dw[k] === undefined) delete dw[k];
  return { ...o, wandverkleidung: wv, duschwanne: dw };
};
const plates = (o: Record<string, any>) => rowsOf(o.wandverkleidung).map((r) => `${r.code}:${r.fmt}:${r.qty}`);

describe("(A) Ausführung: the answers", () => {
  it("seven answers from small to large; the five of today keep value and text", () => {
    expect(KINDS.map((k) => k.value)).toEqual(["Fehlstellen", "Fliesenspiegel", "Fliesenspiegel-Duschbereich", "Innenraum-der-Kabine", "Deckenhoch", "alle-Bad-Wände-halbhoch", "alle-Bad-Wände"]);
    const today = { Fehlstellen: "Nur schließende Fehlstellen", Deckenhoch: "Deckenhoch im Dusch-/Wannenbereich", Fliesenspiegel: "Fliesenspiegel", "Innenraum-der-Kabine": "Innenraum der Kabine", "alle-Bad-Wände": "Alle Bad-Wände" };
    expect(Object.fromEntries(KINDS.filter((k) => !("v2" in k)).map((k) => [k.value, k.label]))).toEqual(today);
    expect(KINDS.filter((k) => "v2" in k).map((k) => k.label)).toEqual(["Fliesenspiegel im Dusch-/Wannenbereich", "Alle Bad-Wände halbhoch"]);
  });
  it("every answer has its own sketch (no two pictures alike)", () => {
    const pics = KIND_TILES.map((t) => renderToStaticMarkup(<>{t.picture}</>));
    expect(new Set(pics).size).toBe(KINDS.length);
  });

  async function openWv() {
    fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
    renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
    await screen.findByRole("heading", { name: "Wandverkleidung" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    return user;
  }
  it("seven tiles, 4 per row on the tablet; „halbhoch“ asks for the height, stored in wvKindHoehe", async () => {
    const user = await openWv();
    const group = await screen.findByRole("radiogroup", { name: "Welche Wände werden verkleidet?" });
    expect(group.querySelectorAll("input")).toHaveLength(7);
    expect(group.querySelector(".sm\\:grid-cols-4")).not.toBeNull();
    expect(screen.queryByTestId("wv-kind-height")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Alle Bad-Wände halbhoch" }));
    expect(offer().wandverkleidung.wvKind).toBe(HALF_HEIGHT_KIND);
    fireEvent.change(screen.getByLabelText("Alle Bad-Wände bis Höhe"), { target: { value: "120" } });
    expect(offer().wandverkleidung.wvKindHoehe).toBe("120");
    await user.click(screen.getByRole("radio", { name: "Fliesenspiegel im Dusch-/Wannenbereich" }));
    expect(offer().wandverkleidung.wvKind).toBe("Fliesenspiegel-Duschbereich");
    expect(screen.queryByTestId("wv-kind-height")).toBeNull(); // only for „halbhoch“; the typed height stays stored
    expect(offer().wandverkleidung.wvKindHoehe).toBe("120");
  });
});

describe("(B) the Vorwand's plate: rules", () => {
  it("only a wall-mounted WC with the VIS element in the offer wants it", () => {
    expect(wantsPlate(WALL)).toBe(true);
    expect(wantsPlate({ ...WALL, wcMontage: "Bodenmontage" })).toBe(false);
    expect(wantsPlate({ ...WALL, [`qty_${VIS}`]: "0" })).toBe(false);
    expect(wantsPlate(undefined)).toBe(false);
    expect(cardOf(make({}, { wcMontage: "Bodenmontage" }))).toEqual({ kind: "none" });
  });
  it("the card: open with the first Dekor; off; other lines a hint only", () => {
    const rows = ROWS([{ code: "WS229", fmt: "16", qty: 2 }]);
    expect(cardOf(make({ wvEnabled: true, wvWwRows: rows }))).toEqual({ kind: "open", decor: "WS229", off: false, gone: false });
    expect(cardOf(make({ wvEnabled: false }))).toEqual({ kind: "open", decor: "WS203", off: true, gone: false });
    expect(cardOf(make({ wvEnabled: true, wvSupplier: "hm" }))).toEqual({ kind: "line", line: "premium", panel: "1 Paneel 997 × 2550 mm" });
    expect(cardOf(make({ wvEnabled: true, wvBudgetMode: "1" }))).toEqual({ kind: "line", line: "standard", panel: "1 Wandpaneel Keramico 950 × 2550 mm" });
  });
  it("„Im Dekor der Wandverkleidung“: +1 plate 100 × 250 in the first Dekor, the note once, the mark", () => {
    const o = make({ wvEnabled: true, wvWwRows: ROWS([{ code: "WS229", fmt: "16", qty: 2 }, { code: "WS229", fmt: "15", qty: 1 }]) }, WALL, { extraTasks: ["Silikonfugen erneuern"] });
    const r = addPlate(o, "same");
    const after = apply(o, r);
    expect(plates(after)).toEqual(["WS229:16:2", "WS229:15:2"]);
    expect(after.wandverkleidung.wvWwQty_15).toBe("2");
    expect(after.wandverkleidung.wvWwQty_R_4260602).toBe("8"); // the existing suggestion: 2 bags of adhesive per plate
    expect(after.wandverkleidung.wvEnabled).toBe(true);
    expect(markOf(after.wandverkleidung)).toEqual({ decor: "WS229", count: 2, note: true, picked: true, orphan: false });
    expect(after.duschwanne.extraTasks).toEqual(["Silikonfugen erneuern", NOTE]);
    expect(cardOf(after)).toEqual({ kind: "added", decor: "WS229", off: false, changed: false, picked: true });
    // the note is never written twice, and a note the user typed himself is not taken over
    const again = addPlate({ ...after, wandverkleidung: { ...after.wandverkleidung, [MARK]: undefined } }, "same");
    expect(again.dw).toEqual({});
    expect((again.wv[MARK] as { note: boolean }).note).toBe(false);
  });
  it("Wandverkleidung off: the card's add switches it on with just this plate", () => {
    const after = apply(make({ wvEnabled: false }), addPlate(make({ wvEnabled: false }), "same"));
    expect(after.wandverkleidung.wvEnabled).toBe(true);
    expect(plates(after)).toEqual(["WS203:15:1"]);
  });
  it("„Anderes Dekor wählen“: a further Dekor (placeholder, not picked yet) with 1 × 100 × 250", () => {
    const o = make({ wvEnabled: true, wvWwRows: ROWS([{ code: "WS203", fmt: "16", qty: 3 }]) });
    const r = addPlate(o, "other");
    const after = apply(o, r);
    expect(r.decor).not.toBe("WS203");
    expect(plates(after)).toEqual(["WS203:16:3", `${r.decor}:15:1`]);
    expect(r.rowIndex).toBe(1);
    expect(cardOf(after)).toMatchObject({ kind: "added", decor: r.decor, picked: false });
    // the user picks the colour in the Wandverkleidung: the rows change there, the mark follows
    const picked = rowsOf(after.wandverkleidung).map((x) => (x.code === r.decor ? { ...x, code: "WS229" } : x));
    const follow = followPlate(after.wandverkleidung, { wvWwRows: ROWS(picked) });
    expect(follow[MARK]).toMatchObject({ decor: "WS229", count: 1, picked: true });
    // the same through the Wandverkleidung's one change function
    expect(wvChanges(after, { wvWwRows: ROWS(picked) }).wandverkleidung![MARK]).toMatchObject({ decor: "WS229", picked: true });
    // a change of other plates leaves the mark alone
    expect(followPlate(after.wandverkleidung, { wvWwRows: ROWS([{ code: "WS203", fmt: "16", qty: 4 }, { code: r.decor, fmt: "15", qty: 1 }]) })).toEqual({});
  });
  it("„Entfernen“: one plate out, the card's note out — a note the user edited stays", () => {
    const o = make({ wvEnabled: true, wvWwRows: ROWS([{ code: "WS229", fmt: "15", qty: 1 }]) }, WALL, { extraTasks: ["Estrich ausgleichen"] });
    const added = apply(o, addPlate(o, "same"));
    const gone = apply(added, removePlate(added));
    expect(plates(gone)).toEqual(["WS229:15:1"]);
    expect(gone.wandverkleidung[MARK]).toBeUndefined();
    expect(gone.duschwanne.extraTasks).toEqual(["Estrich ausgleichen"]);
    const edited = { ...added, duschwanne: { extraTasks: ["Estrich ausgleichen", `${NOTE} – Dekor wie Wand`] } };
    expect(apply(edited, removePlate(edited)).duschwanne.extraTasks).toEqual(["Estrich ausgleichen", `${NOTE} – Dekor wie Wand`]);
    // the only plate: the row goes; the only note: the field goes
    const lone = apply(make({ wvEnabled: true }), addPlate(make({ wvEnabled: true }), "same"));
    const none = apply(lone, removePlate(lone));
    expect(plates(none)).toEqual([]);
    expect(none.duschwanne.extraTasks).toBeUndefined();
  });
  it("the WC no longer wall-mounted: an unchanged plate goes; a changed one stays, announced once", () => {
    const o = make({ wvEnabled: true, wvWwRows: ROWS([{ code: "WS229", fmt: "15", qty: 2 }]) });
    const added = apply(o, addPlate(o, "same"));
    expect(afterOptChange(added)).toBeNull(); // still wall-mounted
    const floor: Record<string, any> = { ...added, optional: { ...added.optional, wcMontage: "Bodenmontage" } };
    const r = afterOptChange(floor)!;
    expect(r.toast).toBe(REMOVED);
    const after = apply(floor, r);
    expect(plates(after)).toEqual(["WS229:15:2"]);
    expect(after.wandverkleidung[MARK]).toBeUndefined();
    expect(after.duschwanne.extraTasks).toBeUndefined();
    // changed in the Wandverkleidung (one more plate of that Dekor): it stays
    const changed = { ...floor, wandverkleidung: { ...floor.wandverkleidung, wvWwRows: ROWS([{ code: "WS229", fmt: "15", qty: 4 }]) } };
    const k = afterOptChange(changed)!;
    expect(k.toast).toBe(KEPT);
    const kept = apply(changed, k);
    expect(plates(kept)).toEqual(["WS229:15:4"]);
    expect(markOf(kept.wandverkleidung)?.orphan).toBe(true);
    expect(kept.duschwanne.extraTasks).toEqual([NOTE]);
    expect(afterOptChange(kept)).toBeNull(); // not announced again
    // the WC removed altogether (its fields emptied): same rule
    expect(afterOptChange({ ...added, optional: { [`qty_${VIS}`]: "0" } })!.toast).toBe(REMOVED);
  });
});

describe("(B) the Vorwand's plate on the screens", () => {
  async function openOptional(wv: Fields = {}) {
    fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
    const router = renderApp(`/deal/${KEY}/bu/Optional`);
    await screen.findByRole("heading", { name: "Optionale Produkte" });
    if (Object.keys(wv).length) useOfferStore.getState().patchAll({ wandverkleidung: wv });
    const user = userEvent.setup();
    await user.click(screen.getAllByTestId("opt-card").find((e) => e.dataset.id === "WC")!);
    const dialog = screen.getByRole("dialog");
    await user.click(dialog.querySelector('input[name="wcMontage"][value="Wandmontage"]')!);
    return { user, router, dialog };
  }
  it("Wandverkleidung off: the card says so; adding switches it on with the plate; Entfernen takes it out", async () => {
    const { user, dialog } = await openOptional();
    const card = await within(dialog).findByTestId("wc-plate");
    expect(card.dataset.state).toBe("off");
    expect(card).toHaveTextContent("Für die Vorwand wird 1 Platte Wandverkleidung 100 × 250 cm benötigt.");
    expect(card).toHaveTextContent("Die Wandverkleidung ist ausgeschaltet");
    await user.click(within(card).getByRole("button", { name: "Einschalten, im Dekor der Wandverkleidung" }));
    expect(offer().wandverkleidung.wvEnabled).toBe(true);
    expect(plates(offer())).toEqual(["WS203:15:1"]);
    expect(offer().duschwanne.extraTasks).toEqual([NOTE]);
    const added = within(dialog).getByTestId("wc-plate");
    expect(added.dataset.state).toBe("added");
    expect(added.querySelector('[data-part="decor"]')).toHaveTextContent(`Dekor: ${decorName("WS203")}`);
    expect(added).toHaveTextContent("In den Arbeiten unter „Weitere Arbeiten“ vermerkt.");
    await user.click(within(added).getByRole("button", { name: "Entfernen" }));
    expect(plates(offer())).toEqual([]);
    expect(offer().duschwanne.extraTasks).toBeUndefined();
    expect(within(dialog).getByTestId("wc-plate").dataset.state).toBe("open");
  });
  it("Bodenmontage: the card goes, the unchanged plate with it", async () => {
    const { user, dialog } = await openOptional({ wvEnabled: true });
    await user.click(within(await within(dialog).findByTestId("wc-plate")).getByRole("button", { name: "Im Dekor der Wandverkleidung hinzufügen" }));
    expect(plates(offer())).toEqual(["WS203:15:1"]);
    await user.click(dialog.querySelector('input[name="wcMontage"][value="Bodenmontage"]')!);
    expect(within(dialog).queryByTestId("wc-plate")).toBeNull();
    expect(plates(offer())).toEqual([]);
    expect(offer().wandverkleidung[MARK]).toBeUndefined();
  });
  it("VIGOUR: a hint only, nothing added", async () => {
    const { dialog } = await openOptional({ wvEnabled: true, wvSupplier: "hm" });
    const card = await within(dialog).findByTestId("wc-plate");
    expect(card.dataset.state).toBe("line");
    expect(card).toHaveTextContent("Produktlinie VIGOUR: bitte 1 Paneel 997 × 2550 mm in der Wandverkleidung ergänzen");
    expect(within(card).queryByRole("button", { name: /hinzufügen/ })).toBeNull();
  });
  it("„Anderes Dekor wählen“: to the Wandverkleidung with the further Dekor open; a palette pick sets its colour", async () => {
    const { user, dialog, router } = await openOptional({ wvEnabled: true, wvWwRows: ROWS([{ code: "WS203", fmt: "16", qty: 2 }]), wvWwQty_16: "2" });
    await user.click(within(await within(dialog).findByTestId("wc-plate")).getByRole("button", { name: "Anderes Dekor wählen" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${KEY}/bu/Wandverkleidung`));
    const note = await screen.findByTestId("wv-wc-plate");
    expect(note.dataset.state).toBe("pick");
    const decor = markOf(offer().wandverkleidung)!.decor;
    expect(plates(offer())).toEqual(["WS203:16:2", `${decor}:15:1`]);
    const chips = screen.getAllByTestId("wvs-tab");
    expect(chips).toHaveLength(2);
    expect(chips[1]).toHaveAttribute("aria-pressed", "true"); // the further Dekor is open
    // pick a colour from the palette: the plate takes it, the note says it is chosen
    const tile = [...screen.getByTestId("wvs-colors").querySelectorAll<HTMLElement>("[data-code], button, label")].find((e) => /WS 229|WS229/.test(e.getAttribute("data-code") ?? e.textContent ?? ""));
    expect(tile).toBeTruthy();
    await user.click(tile!);
    await waitFor(() => expect(markOf(offer().wandverkleidung)).toMatchObject({ decor: "WS229", picked: true }));
    expect(plates(offer())).toEqual(["WS203:16:2", "WS229:15:1"]);
    expect(screen.getByTestId("wv-wc-plate").dataset.state).toBe("added");
  });
});
