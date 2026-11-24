// Winterdienst (step `wd`) must store and show what today's UI does for the same inputs; its Kosten
// page and total too. Reference: fixtures/winterdienst.json, recorded from today's UI by
// v2/scripts/capture-wd-hms.cjs. On purpose different (UX-CHANGES U-066, proposed): an opened offer
// shows and keeps its choices and hours (today's restore fills only the note and the sketch, so they
// are gone with the next save), and the second choice reads „Haushaltsnahe Dienstleistungen“ (the
// v2 add-on's label). The test environment has no canvas (see wv-skizze.test.tsx).
import { emptyOffer } from "@oc/domain";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { sections, sums } from "../src/features/steps/kosten/rules.js";
import { statuses } from "../src/features/steps/status.js";
import { ART, HEADING, NOTE_PLACEHOLDER, REGULARITY, TEXT, type ServiceType } from "../src/features/steps/wd/rules.js";
import wd from "./fixtures/winterdienst.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as F;
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as F)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
const png = (t: ServiceType, b: F = {}) => {
  const o = structuredClone(b);
  if (o.sketch?.dataUrl?.startsWith?.("data:image/png")) o.sketch.dataUrl = "<png>";
  if (String(o[`${t}SketchDataUrl`] ?? "").startsWith("data:image/png")) o[`${t}SketchDataUrl`] = "<png>";
  return o;
};

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, name) => (typeof name === "string" ? () => {} : undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,TEST");
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 280, right: 600, bottom: 280, x: 0, y: 0, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); useOfferStore.getState().close(); vi.restoreAllMocks(); });

/** a new offer of the type on its step, or a stored one (`payload`) opened from its draft */
async function open(t: ServiceType, payload: F | undefined, price: unknown) {
  const server = fakeServer({
    ...BASE, "POST /api/price": { body: price },
    ...(payload ? { "GET /api/deals/4711/draft": { body: { dealId: "4711", revision: 3, offerType: t, payload, updatedAt: "2026-11-24T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}),
  });
  const router = renderApp(payload ? `/deal/4711/${t}/${t}` : `/deal/${KEY}/${t}/${t}`);
  await screen.findByTestId(`${t}-step`);
  return { server, router, base: structuredClone(offer()) };
}
const chip = (legend: string, label: string) => within(screen.getByRole("group", { name: legend })).getByRole("radio", { name: label });
const artLabel = (value: string) => ART.find((a) => a.value === value)!.label;
const pointer = (type: string, [x, y]: number[]) => fireEvent(screen.getByTestId("sketch-pad").querySelector("canvas")!, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

async function play(steps: unknown[][], router: { state: { location: { pathname: string } } }) {
  const user = userEvent.setup();
  let next: string | null = null;
  for (const [kind, a, b] of steps as [string, any, any][]) {
    if (kind === "art") await user.click(chip(TEXT.art, artLabel(a)));
    else if (kind === "reg") await user.click(chip(TEXT.regularity, a));
    else if (kind === "num") fireEvent.change(screen.getByLabelText(a === "ahEinsatzUmfang" ? TEXT.perVisit : TEXT.perMonth), { target: { value: b } });
    else if (kind === "note") fireEvent.change(screen.getByLabelText(TEXT.note), { target: { value: a } });
    else if (kind === "stroke") { pointer("pointerdown", a[0]); for (const p of a.slice(1)) pointer("pointermove", p); pointer("pointerup", a[a.length - 1]); }
    else if (kind === "clear") await user.click(screen.getByRole("button", { name: "Skizze löschen" }));
    else if (kind === "next" || kind === "prev") {
      const from = router.state.location.pathname;
      await user.click(screen.getAllByRole("link", { name: kind === "next" ? /^Weiter zu/ : /^Zurück zu/ })[0]!);
      await waitFor(() => expect(router.state.location.pathname).not.toBe(from));
      next = router.state.location.pathname.split("/").pop()!;
    }
    else if (kind === "open" || kind === "payer") continue; // opened before / a step of Kundendaten (Kosten scenarios)
    else throw new Error(`step not handled: ${kind}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return next;
}

// U-066: what an opened offer keeps that today's restore does not show (and so loses with the next save)
const KEPT = ["ahArt", "ahEinsatzUmfang", "ahMonatUmfang", "ahRegelmaessigkeit"] as const;
const SET_BY: Record<string, string> = { art: "ahArt", num: "", reg: "ahRegelmaessigkeit" };
function keptByReact(opened: F | null, steps: unknown[][], today: F): F {
  if (!opened) return today;
  const set = new Set(steps.map(([k, a]) => (k === "num" ? String(a) : SET_BY[String(k)] ?? "")));
  const out = { ...today };
  for (const k of KEPT) if (!set.has(k) && opened[k] !== undefined && opened[k] !== "") out[k] = opened[k];
  return sorted(out) as F;
}
/** the page in the shape of the recording (the parts the replay compares) */
function shown(t: ServiceType) {
  const radios = (legend: string) => within(screen.getByRole("group", { name: legend })).getAllByRole("radio") as HTMLInputElement[];
  return {
    art: radios(TEXT.art).map((r) => ({ value: r.value, checked: r.checked })),
    reg: radios(TEXT.regularity).map((r) => ({ value: r.value, checked: r.checked })),
    perVisit: (screen.getByLabelText(TEXT.perVisit) as HTMLInputElement).value,
    perMonth: (screen.getByLabelText(TEXT.perMonth) as HTMLInputElement).value,
    note: (screen.getByLabelText(TEXT.note) as HTMLTextAreaElement).value,
    heading: flat(screen.getByTestId(`${t}-step`).querySelector("h2")?.textContent),
  };
}
const viewWanted = (v: F, kept: F, opened: F | null) => ({
  art: (v.art as F[]).map((a) => ({ value: a.value, checked: opened && kept.ahArt !== undefined ? kept.ahArt === a.value : a.checked })),
  reg: (v.reg as F[]).map((a) => ({ value: a.value, checked: opened && kept.ahRegelmaessigkeit !== undefined ? kept.ahRegelmaessigkeit === a.value : a.checked })),
  perVisit: opened ? String(kept.ahEinsatzUmfang ?? "") : v.perVisit.value, perMonth: opened ? String(kept.ahMonatUmfang ?? "") : v.perMonth.value,
  note: v.note, heading: v.heading,
});

interface Rec { type: ServiceType; base: F; scenarios: F[] }
const RECORDINGS: Rec[] = [wd as unknown as Rec];

describe.each(RECORDINGS.map((r) => [r.type, r] as const))("%s stores and shows what today's UI does", (t, rec) => {
  const OPENED = (s: F) => s.steps[0]?.[0] === "open";
  const shell = rec.scenarios[0]!.price;

  it("a new offer starts with today's section, and the page shows today's texts (the add-on's label for the second choice)", async () => {
    const { base } = await open(t, undefined, shell);
    expect(sorted(base[t])).toEqual(rec.base);
    const v = rec.scenarios[0]!.view as F;
    expect(v.heading).toBe(HEADING[t]);
    for (const text of [v.heading, v.artLabel, v.section.title, v.section.subtitle, v.regLabel, v.sketch.title, v.sketch.subtitle, v.sketch.hint]) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(ART.map((a) => a.value)).toEqual(v.art.map((a: F) => a.value));
    expect(ART.map((a) => a.label)).toEqual(v.art.map((a: F) => (a.value === "Haushaltsnahedienstleistungen" ? "Haushaltsnahe Dienstleistungen" : a.label)));
    expect(REGULARITY.map((r) => [r.value, r.label])).toEqual(v.reg.map((r: F) => [r.value, r.label]));
    expect(v.detailShown).toBe(false); // „Leistungsart im Detail“: in today's markup, never shown → not built
    for (const [label, f] of [[TEXT.perVisit, v.perVisit], [TEXT.perMonth, v.perMonth]] as const) {
      expect(label).toBe(f.label);
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect([input.type, input.placeholder, input.min, input.step]).toEqual(["number", f.placeholder, f.min, f.step]);
    }
    const note = screen.getByLabelText(v.noteLabel) as HTMLTextAreaElement;
    expect([note.placeholder, NOTE_PLACEHOLDER[t]]).toEqual([v.notePlaceholder, v.notePlaceholder]);
  });

  it.each(rec.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    const opened = OPENED(s) ? (s.steps[0][1] as F) : null;
    const stored = opened ? { ...emptyOffer(t as "wd", { date: "2026-11-24" }), [t]: opened } : undefined;
    const { router, base, server } = await open(t, stored, s.price);
    const next = await play(s.steps, router);
    if (s.next) expect(next).toBe(s.next);
    if (next !== null) return; // Weiter / Zurück: left the page (the page's state is checked by the other scenarios)
    const onlyOpened = !!opened && s.steps.length === 1;
    const want = onlyOpened ? sorted(opened) : keptByReact(opened, s.steps, s.stored);
    await waitFor(() => expect(sorted(png(t, plain(offer()[t])))).toEqual(sorted(want)));
    // nothing else of the offer changes (the Kosten scenarios' Kundendaten step is not played here)
    if (!s.steps.some(([k]: unknown[]) => k === "payer")) expect(Object.keys(base).filter((k) => k !== t && !same(base[k], offer()[k]))).toEqual(Object.keys(s.elsewhere ?? {}));
    expect(shown(t)).toEqual(viewWanted(s.view, onlyOpened ? opened! : want as F, opened));
    // the price is asked like today and carries the section as stored; the total shows „–“ as today's summary
    await waitFor(() => expect(server.count("POST /api/price")).toBeGreaterThan(0));
    await waitFor(() => expect(sorted((server.calls.filter((c) => c.key === "POST /api/price").at(-1)!.body as F)[t])).toEqual(sorted(offer()[t])));
    expect(s.view.total).toBe("–");
    await waitFor(() => expect(screen.getAllByText("Gesamt").map((g) => flat(g.parentElement?.textContent))).toContain("Gesamt –"));
  });
});

describe.each(RECORDINGS.map((r) => [r.type, r] as const))("%s · Kosten shows what today's UI does", (t, rec) => {
  const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
  it.each(rec.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    const v = s.kosten as F;
    fakeServer({ ...BASE, "POST /api/price": { body: s.price } });
    renderApp(`/deal/${KEY}/${t}/Kosten`);
    await screen.findByRole("heading", { name: v.heading });
    expect(screen.getByText(v.text)).toBeTruthy();
    const lists = (v.sections as F[]).filter((x) => x.title !== "Summen"), totals = (v.sections as F[]).find((x) => x.title === "Summen")!;
    await waitFor(() => expect(screen.getAllByTestId("kosten-section").map((sec) => ({ num: part(sec, "num"), title: part(sec, "title"), empty: part(sec, "empty"), footer: part(sec, "footer"), lines: sec.querySelectorAll('[data-testid="kosten-line"]').length })))
      .toEqual(lists.map((x) => ({ num: x.num, title: x.title, empty: x.empty, footer: x.footer, lines: x.rows.length }))));
    expect(Array.from(screen.getByTestId("kosten-sums").querySelectorAll('[data-part="row"]')).map((r) => ({ num: part(r, "num"), label: part(r, "label"), value: part(r, "value"), rule: (r as HTMLElement).dataset.rule === "true", total: (r as HTMLElement).dataset.total === "true" })))
      .toEqual(totals.sums);
    expect(within(screen.getByTestId("kosten-sums")).getByRole("button", { name: v.recompute })).toBeTruthy();
    // the rules alone: three sections without numerals, the server's zeros
    expect(sections(s.price, { type: t }).map((x) => [x.num, x.title])).toEqual(lists.map((x) => [x.num, x.title]));
    const last = sums(s.price, { type: t }).at(-1) as F;
    expect([last.label, flat(last.value), last.total]).toEqual(["Gesamt (brutto):", flat(totals.sums.at(-1).value), true]);
  });
});

describe("Winterdienst — step list", () => {
  it("done once something is entered on the page, open before", () => {
    const o = emptyOffer("wd", { date: "" }) as F;
    expect(statuses("wd", o, null).wd).toEqual({ kind: "open" });
    expect(statuses("wd", { ...o, wd: { ...o.wd, ahRegelmaessigkeit: "Monatlich" } }, null).wd).toEqual({ kind: "done" });
    expect(statuses("wd", { ...o, wd: { ...o.wd, wdNote: "  " } }, null).wd).toEqual({ kind: "open" });
  });
});
