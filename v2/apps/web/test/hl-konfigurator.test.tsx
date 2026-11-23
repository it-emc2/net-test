// Handlauf, step "Handläufe" (hlk, slices 2 + 3) must store and show what today's UI does for the
// same taps. Reference: fixtures/hl-konfigurator.json, recorded from today's UI by
// v2/scripts/capture-handlauf-konfigurator.cjs (with today's Flexofit product list).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import reference from "./fixtures/hl-konfigurator.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const SERVER = { ...BASE, "GET /api/products?source=flexofit&limit=500": { body: reference.products } };
async function open() {
  fakeServer(SERVER);
  renderApp(`/deal/${KEY}/hl/hlk`);
  await screen.findByRole("heading", { name: "Handläufe", level: 2 });
  await waitFor(() => expect(screen.queryByText("Produkte werden geladen …")).toBeNull());
  return structuredClone(offer());
}
const panel = () => screen.getByTestId("hl-panel");
const step = (key: string) => screen.getByTestId(`hl-step-${key}`);
const STEP_OF: Record<string, string> = { area: "area", tab: "rohr", tube: "rohr", sonderAdd: "rohr", sonder: "rohr", sonderDel: "rohr", finish: "beschlaege", fit: "beschlaege" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const commit = (el: HTMLElement, value: string) => { fireEvent.change(el, { target: { value } }); fireEvent.blur(el); };
const line = (id: string) => (screen.getByTestId("hl-ledger").querySelector(id.startsWith("sonder:") ? `tr[data-kind="sonder"][data-key="${id.slice(7)}"]` : `tr[data-key*="::${id}::"]`) as HTMLElement);
const pick = (testid: string, pid: string) => within(panel()).getAllByTestId(testid).find((b) => b.querySelector('[data-part="meta"]')!.textContent!.startsWith(`${pid} ·`))!;

async function play(steps: unknown[][]) {
  const user = userEvent.setup();
  for (const [kind, a, b, c] of steps as [string, any, any, any][]) {
    const s = STEP_OF[kind];
    if (s) { const head = within(step(s)).getAllByRole("button")[0]!; if (head.getAttribute("aria-expanded") !== "true") await user.click(head); }
    if (kind === "area") await user.click(within(step("area")).getByRole("button", { name: new RegExp(`^${a === "inside" ? "Innenbereich" : "Außenbereich"}`) }));
    else if (kind === "tab") await user.click(within(within(step("rohr")).getByRole("group", { name: "Material" })).getByRole("button", { name: a === "__sonder__" ? /^Sonderprodukt( \(\d+\))?$/ : new RegExp(`^${esc(a)}( \\(\\d+\\))?$`) }));
    else if (kind === "tube") await user.click(pick("hl-tube", a));
    else if (kind === "finish") await user.click(within(within(step("beschlaege")).getByRole("group", { name: "Oberfläche" })).getByRole("button", { name: a }));
    else if (kind === "fit") await user.click(pick("hl-fitting", a));
    else if (kind === "qty") commit(within(line(a)).getByRole("spinbutton"), b);
    else if (kind === "del") await user.click(within(line(a)).getByRole("button", { name: /entfernen$/ }));
    else if (kind === "sonderAdd") await user.click(screen.getByRole("button", { name: "Sonderprodukt hinzufügen" }));
    else if (kind === "sonder") commit(within(screen.getByTestId("hl-sonder")).getAllByLabelText({ name: "Bezeichnung", price: "Preis netto", articleId: "Artikel-ID", qty: "Menge" }[b as string]!)[a]!, c);
    else if (kind === "sonderDel") await user.click(screen.getAllByRole("button", { name: "Sonderprodukt entfernen" })[a]!);
    else if (kind === "add") await user.click(screen.getByRole("button", { name: "Weitere Konfiguration" }));
    else if (kind === "select") await user.click(within(screen.getByTestId("hl-rail")).getAllByRole("button", { pressed: undefined }).filter((x) => x.hasAttribute("aria-pressed"))[a - 1]!);
    else if (kind === "remove" || kind === "keep") { await user.click(within(screen.getByTestId("hl-rail")).getAllByRole("button", { name: /entfernen$/ })[a - 1]!); await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: kind === "remove" ? "Ja, entfernen" : "Nein, behalten" })); }
    else if (kind === "rename") commit(screen.getByLabelText("Name der Konfiguration"), a);
    else if (kind === "toggle") await user.click(within(step(a)).getAllByRole("button")[0]!);
    else if (kind === "note") { await user.click(screen.getByText("Notizen & Projekt-Skizze anzeigen")); fireEvent.change(screen.getByLabelText(/^Notizen \/ Anmerkungen/), { target: { value: a } }); }
    else throw new Error(`step not handled: ${kind}`);
  }
}
const txt = (n: Element | null | undefined) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
function shown() {
  const rail = within(screen.getByTestId("hl-rail")).getAllByRole("button").filter((x) => x.hasAttribute("aria-pressed")).map((b) => {
    const row = b.parentElement!;
    return { name: txt(b.querySelector('[data-part="name"]')), summary: txt(b.querySelector('[data-part="summary"]')), complete: b.querySelector("span")!.className.includes("bg-success"), active: b.getAttribute("aria-pressed") === "true", removable: !(within(row).getByRole("button", { name: /entfernen$/ }) as HTMLButtonElement).disabled };
  });
  const steps = ["area", "rohr", "beschlaege"].map((k) => { const head = within(step(k)).getAllByRole("button")[0]!; return { title: txt(head.querySelector('[data-part="title"]')), value: txt(head.querySelector('[data-part="value"]')), done: !!head.querySelector("svg.lucide-check"), open: head.getAttribute("aria-expanded") === "true" }; });
  const body = ["area", "rohr", "beschlaege"].flatMap((k) => { const b = step(k).querySelector('[data-part="body"]'); return b ? [{
    hints: [...b.querySelectorAll('[data-part="hint"]')].map(txt),
    chips: [...b.querySelectorAll('[data-part="chip"]')].map((c) => ({ text: txt(c), on: c.getAttribute("aria-pressed") === "true" })),
    cards: [...b.querySelectorAll('[data-part="card"]')].map((c) => ({ title: txt(c.querySelector('[data-part="title"]')), sub: txt(c.querySelector('[data-part="sub"]')), on: c.getAttribute("aria-pressed") === "true" })),
    picks: [...b.querySelectorAll('[data-testid="hl-tube"],[data-testid="hl-fitting"]')].map((c) => ({ name: txt(c.querySelector('[data-part="name"]')), meta: txt(c.querySelector('[data-part="meta"]')), on: c.getAttribute("aria-pressed") === "true" })),
    sonder: [...b.querySelectorAll('[data-testid="hl-sonder"] > div')].filter((r) => r.querySelector("input")).map((r) => [...r.querySelectorAll("input")].map((i) => (i as HTMLInputElement).value)),
  }] : []; });
  const L = screen.getByTestId("hl-ledger");
  return {
    rail, name: (screen.getByLabelText("Name der Konfiguration") as HTMLInputElement).value, status: txt(screen.getByTestId("hl-status")), steps, body,
    ledger: {
      title: txt(L.querySelector("h3")), count: txt(L.querySelector('[data-part="count"]')),
      rows: [...L.querySelectorAll('[data-testid="hl-line"]')].map((r) => ({ name: txt(r.querySelector('[data-part="name"]')), sub: txt(r.querySelector('[data-part="sub"]')), qty: (r.querySelector("input") as HTMLInputElement).value, unit: txt(r.querySelector('[data-part="unit"]')), price: txt(r.querySelector('[data-part="price"]')), total: txt(r.querySelector('[data-part="total"]')) })),
      empty: L.querySelector('[data-testid="hl-line"]') ? "" : txt(L.querySelector("tbody")), total: txt(screen.getByTestId("hl-ledger-total")),
    },
  };
}
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const changed = (base: Record<string, unknown> = {}, now: Record<string, unknown> = {}) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => !same(base[k], now[k])).map((k) => [k, now[k] !== undefined ? JSON.parse(JSON.stringify(now[k])) : "<removed>"]));

describe("Handlauf Handläufe (configurator) stores and shows what today's UI does", () => {
  it("only Sonderprodukt edits leave today's page drawn behind (the recordings say so)", () => {
    const behind = reference.scenarios.filter((s) => "fresh" in s).map((s) => s.name);
    for (const name of behind) expect(JSON.stringify((reference.scenarios.find((s) => s.name === name)!).steps)).toMatch(/"sonder/);
  });

  it("a new offer starts with today's fields", async () => {
    const base = await open();
    expect(sorted(base.hl)).toEqual(reference.base);
  });

  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const base = await open();
    await play(scenario.steps as unknown[][]);
    await waitFor(() => expect(sorted(changed(base.hl, offer().hl))).toEqual(scenario.hl));
    // today's Sonderprodukt fields redraw only the position list (the rest catches up at the next tap);
    // the React page shows every part up to date at once: compared with today's page after that tap
    // (`fresh`, recorded; UX-CHANGES U-055 proposed)
    const s2 = scenario as { view: unknown; fresh?: unknown };
    expect(shown()).toEqual(s2.fresh ?? s2.view);
    const el = (scenario as { elsewhere?: Record<string, unknown> }).elsewhere ?? {};
    expect(Object.fromEntries(Object.keys(base).filter((k) => k !== "hl" && !same(base[k], offer()[k])).map((k) => [k, changed(base[k] as never, offer()[k])]))).toEqual(el);
  });
});
