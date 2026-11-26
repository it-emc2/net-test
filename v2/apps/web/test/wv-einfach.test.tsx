// Wandverkleidung, the winwall simple view, must store and show what today's UI does for the same
// inputs — and do the same to the floor. Reference: fixtures/wv-einfach.json, recorded from today's
// UI by v2/scripts/capture-wv-einfach.cjs.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { wvChanges } from "../src/features/steps/arbeiten/rules.js";
import * as sv from "../src/features/steps/wandverkleidung/simple.js";
import { toast } from "../src/shared/ui/toaster.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import reference from "./fixtures/wv-einfach.json" with { type: "json" };
import { BASE, fakeServer, renderApp, toRowEditor } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Fields = Record<string, unknown>;
type Step = (string | number | Fields)[];
interface Ask { title: string; message: string; ok: string; cancel: string }
interface View {
  on: boolean; line: string; lineRow: string | null; lineOpen: boolean; simple: boolean; classic: boolean; toSimple: boolean;
  tabs: { text: string; pressed: boolean; removable: boolean; swatch: string }[]; plates: { size: string; meta: string; qty: string; has: boolean; img: string }[];
  total: string; bad: string; height: string; heightHint: string; heightOk: boolean; palette: sv.PaletteTile[]; other: string; otherHint: string; otherKind: string;
  rows: { title: string; fmt: string; qty: string }[] | null; toasts: string[];
}
interface Scenario { name: string; steps: Step[]; wandverkleidung: Fields; duschwanne: Fields; arbeitszeit: Fields; dialogs: Ask[]; view: View; next?: { step: string } }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const LINE: Record<string, RegExp> = { ww: /^winwall/, premium: /^VIGOUR/, standard: /^Badolux/ };
const SIZE: Record<string, string> = { 13: "100 × 205 cm", 15: "100 × 250 cm", 16: "125 × 250 cm", 17: "150 × 250 cm" };
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
const swatchOf = (el: Element | null) => ((el as HTMLElement | null)?.style.backgroundImage.match(/winwall\/(\w+)\.jpg/) ?? [])[1] ?? "";
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Fields, now: Fields) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));
// `computed` belongs to the mode Fußboden and is valued with the price list there (fussboden.test.tsx)
const mine = ({ computed: _c, ...rest }: Fields) => rest;

async function open() {
  fakeServer({ ...BASE, "GET /admin/api/config/public": { body: arbeiten.config } });
  const router = renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
  await screen.findByRole("heading", { name: "Wandverkleidung" });
  return { base: structuredClone(offer()), router };
}
type Router = Awaited<ReturnType<typeof open>>["router"];
const goto = async (router: Router, step: string) => { await act(() => router.navigate(`/deal/${KEY}/bu/${step}`)); await screen.findByRole("heading", { name: step === "Fussboden" ? "Fußboden" : step }); };

async function play(s: Scenario, router: Router): Promise<Ask[]> {
  const user = userEvent.setup();
  const asks: Ask[] = [];
  for (const [kind, a, b] of s.steps) {
    const wvs = () => screen.getByTestId("wvs");
    if (kind === "on" || kind === "off") await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    else if (kind === "plate") await user.click(within(wvs()).getByRole("button", { name: `${b === "-" ? "Weniger" : "Mehr"} ${SIZE[String(a)]}` }));
    else if (kind === "color") await user.click(within(screen.getByTestId("wvs-colors")).getByRole("radiogroup").querySelector(`[data-code="${a}"]`)!);
    else if (kind === "tab") await user.click(screen.getAllByTestId("wvs-tab")[Number(a) - 1]!);
    else if (kind === "add") await user.click(screen.getByRole("button", { name: "+ weiteres Dekor" }));
    else if (kind === "del") await user.click(screen.getAllByTestId("wvs-tab")[Number(a) - 1]!.parentElement!.querySelector("button[aria-label$=' entfernen']")!);
    else if (kind === "other") await user.type(screen.getByLabelText("Anderes Dekor"), String(a));
    else if (kind === "height") { const el = screen.getByLabelText(/^Höhe der Verkleidung/); await user.click(el); await user.clear(el); await user.type(el, String(a)); await user.tab(); }
    else if (kind === "classic") await user.click(screen.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }));
    else if (kind === "simple") await user.click(screen.getByRole("button", { name: "Zur neuen Ansicht wechseln (Platten + Dekor)" }));
    else if (kind === "fix") await user.click(screen.getByRole("button", { name: "Im alten Konfigurator korrigieren" }));
    else if (kind === "lineopen") await user.click(screen.getByTestId("wv-line-row"));
    else if (kind === "line") { await user.click(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { name: LINE[String(a)]! })); await toRowEditor(user); } // today's VIGOUR / Badolux: the row editor
    else if (kind === "kind") await user.click(screen.getByRole("radiogroup", { name: "Welche Wände werden verkleidet?" }).querySelector(`input[value="${a}"]`)!);
    else if (kind === "acc") await user.click(screen.getByTestId(`wv-acc-${a}`).querySelector('input[type="checkbox"]')!);
    else if (kind === "open") { // the offer saved earlier is opened: its fields, nothing remembered from before
      act(() => useOfferStore.setState((st) => {
        const o = st.offer as Record<string, any>, wv = { ...o.wandverkleidung, ...(a as Fields) };
        for (const k of Object.keys(wv)) if (wv[k] === "<removed>") delete wv[k];
        const ch = wvChanges(o, wv);
        return { offer: { ...o, wandverkleidung: wv, Arbeitszeit: ch.Arbeitszeit } as never, scratch: {} };
      }));
      await goto(router, "Fussboden"); await goto(router, "Wandverkleidung");
    }
    else if (kind === "confirm") await user.click(within(screen.getByTestId("wv-ask")).getByRole("button", { name: a === "ok" ? s.dialogs.at(-1)!.ok : s.dialogs.at(-1)!.cancel }));
    else if (kind === "goto") await goto(router, String(a));
    else if (kind === "fbon") await user.click(screen.getByRole("switch", { name: "Fußboden" }));
    else if (kind === "fbwall") await user.click(screen.getByRole("tab", { name: "Wandverkleidung als Fußboden" }));
    else if (kind === "fbarea") fireEvent.change(screen.getByLabelText("Fläche (m²)"), { target: { value: a } });
    else if (kind === "next") await user.click(screen.getByRole("link", { name: /^Weiter zu/ }));
    else throw new Error(`step not handled: ${kind}`);
    const q = kind === "confirm" ? null : screen.queryByTestId("wv-ask");
    if (q) asks.push({ title: flat(q.querySelector("strong")!.textContent), message: flat(q.querySelector("p")!.textContent), ok: flat(q.querySelectorAll("button")[0]!.textContent), cancel: flat(q.querySelectorAll("button")[1]!.textContent) });
  }
  return asks;
}

function viewNow(): Partial<View> {
  const on = (screen.getByRole("switch", { name: "Wandverkleidung" }) as HTMLInputElement).checked;
  const wvs = screen.queryByTestId("wvs"), simple = !!wvs;
  const row = screen.queryByTestId("wv-line-row");
  const other = simple ? screen.getByTestId("wvs-other") : null, hh = simple ? screen.getByTestId("wvs-height-hint") : null;
  const rowsShown = !!screen.queryByText("Platten — winwall");
  return {
    on, lineRow: row ? part(row, "text") : null, lineOpen: !!screen.queryByRole("group", { name: "Produktlinie wählen" }),
    simple, classic: !!screen.queryByTestId("kc-note"), toSimple: !!screen.queryByRole("button", { name: "Zur neuen Ansicht wechseln (Platten + Dekor)" }),
    tabs: simple ? screen.getAllByTestId("wvs-tab").map((t) => ({ text: part(t, "text"), pressed: t.getAttribute("aria-pressed") === "true", removable: !!t.parentElement!.querySelector("button[aria-label$=' entfernen']"), swatch: swatchOf(t.querySelector("i")) })) : [],
    plates: simple ? screen.getAllByTestId("wvs-plate").map((p) => ({ size: part(p, "size"), meta: part(p, "meta"), qty: part(p, "qty"), has: part(p, "qty") !== "0", img: p.dataset.img ?? "" })) : [],
    total: simple ? flat(screen.getByTestId("wvs-total").textContent) : "",
    bad: simple ? part(screen.queryByTestId("wvs-bad") ?? document.createElement("i"), "text") : "",
    heightHint: hh ? flat(hh.textContent) : "", heightOk: hh?.dataset.ok === "true",
    palette: simple ? within(screen.getByTestId("wvs-colors")).getAllByRole("radio").map((b) => ({ code: b.dataset.code!, name: part(b, "name"), small: part(b, "small"), checked: b.getAttribute("aria-checked") === "true", swatch: !!swatchOf(b.querySelector("i")), label: part(b, "label") })) : [],
    ...(other ? { other: (within(other).getByLabelText("Anderes Dekor") as HTMLInputElement).value, otherHint: part(other, "hint"), otherKind: other.querySelector<HTMLElement>('[data-part="hint"]')!.dataset.kind ?? "" } : {}),
    rows: rowsShown ? screen.queryAllByTestId("wv-row").map((r) => ({ title: part(r, "title"), fmt: r.querySelector("select")!.value, qty: part(r, "qty") })) : null,
  };
}

afterEach(() => { vi.restoreAllMocks(); });
/** Known, not priced: today's restore of an offer writes an empty sketch (`sketch`, `wvSketchJson`) and an offer
 *  without `wvUi` gets `wvUi: ""` from the form; React opens the stored offer as it is (no field stays no field). */
function storedWv(s: Scenario): Fields {
  if (s.steps[0]?.[0] !== "open") return s.wandverkleidung;
  const { sketch: _s, wvSketchJson: _j, ...rest } = s.wandverkleidung;
  return rest.wvUi === "" && (s.steps[0]![1] as Fields).wvUi === "<removed>" ? { ...rest, wvUi: "<removed>" } : rest;
}

describe("Wandverkleidung, winwall simple view, stores and shows what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [s.name, s] as const))("%s", { timeout: 30000 }, async (_name, scenario) => {
    const toasts = vi.spyOn(toast, "info");
    const { base, router } = await open();
    const asks = await play(scenario, router);
    if (scenario.next) { await waitFor(() => expect(router.state.location.pathname.split("/").pop()).toBe(scenario.next!.step)); await goto(router, "Wandverkleidung"); }
    else if (router.state.location.pathname.split("/").pop() !== "Wandverkleidung") await goto(router, "Wandverkleidung");
    await waitFor(() => expect(changed(base.wandverkleidung, offer().wandverkleidung)).toEqual(storedWv(scenario)));
    expect(mine(changed(base.duschwanne, offer().duschwanne))).toEqual(mine(scenario.duschwanne));
    expect(changed(base.Arbeitszeit, offer().Arbeitszeit)).toEqual(scenario.arbeitszeit);
    expect(asks).toEqual(scenario.dialogs);
    expect(toasts.mock.calls.map((c) => String(c[0]))).toEqual(scenario.view.toasts);

    const v = scenario.view, now = viewNow();
    expect(now.on).toBe(v.on);
    if (!v.on) return; // off: only the switch
    const keys = ["lineRow", "lineOpen", "simple", "classic", "toSimple", "tabs", "plates", "total", "bad", "heightHint", "heightOk", "palette", "rows"] as const;
    expect(Object.fromEntries(keys.map((k) => [k, now[k]]))).toEqual(Object.fromEntries(keys.map((k) => [k, v[k]])));
    if (v.simple) expect([now.other, now.otherHint, now.otherKind]).toEqual([v.other, v.otherHint, v.otherKind]);
    if (v.simple) expect((screen.getByLabelText(/^Höhe der Verkleidung/) as HTMLInputElement).value).toBe(v.height);
    if (now.lineOpen) expect(within(screen.getByRole("group", { name: "Produktlinie wählen" })).getByRole("button", { pressed: true }).textContent).toMatch(LINE[v.line]!);
  });

  it("a new offer starts without the previous offer's plates", { timeout: 30000 }, async () => {
    const { router } = await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    await user.click(screen.getByRole("button", { name: "Mehr 100 × 250 cm" }));
    expect(flat(screen.getByTestId("wvs-total").textContent)).toBe("1 Platte · 2,5 m²");
    await act(() => router.navigate(`/deal/t-fedcba9876543210fedcba98/bu/Wandverkleidung`));
    await waitFor(() => expect(offer().wandverkleidung.wvEnabled).toBe(false));
    await user.click(await screen.findByRole("switch", { name: "Wandverkleidung" }));
    expect(flat(screen.getByTestId("wvs-total").textContent)).toBe("0 Platten · 0 m²");
    expect(offer().wandverkleidung.wvWwRows).toBe("[]");
  });
});

describe("Wandverkleidung simple view — rules", () => {
  it("rows → groups per decor and back; rows without a valid decor stay", () => {
    const rows = [{ code: "WS203", fmt: "15", qty: 2 }, { code: "NW230", fmt: "17", qty: 1, custom: true, text: "NW 230" }, { code: null, fmt: "16", qty: 1, custom: true, text: "23014" }];
    const s = sv.load(rows);
    expect(s.groups.map((g) => [g.code, g.qty[15], g.qty[17]])).toEqual([["WS203", 2, 0], ["NW230", 0, 1]]);
    expect(sv.save(s.groups, rows)).toEqual([{ code: "WS203", fmt: "15", qty: 2, custom: false, text: "" }, { code: "NW230", fmt: "17", qty: 1, custom: true, text: "NW 230" }, rows[2]]);
    expect(sv.badOf(rows)).toBe("1 Platte mit ungültiger Dekor-Nr. (23014) – fehlen im Preis.");
  });
  it("typed: decor numbers, article numbers, unknown", () => {
    expect(["NW 23013", "XY", "WS 999", "WS023"].map((t) => sv.typed(t).hint.kind)).toEqual(["ok", "warn", "warn", "ok"]);
    expect([sv.typed("NW 23013").code, sv.typed("NW 23013").fmt]).toEqual(["NW230", "13"]);
  });
});
