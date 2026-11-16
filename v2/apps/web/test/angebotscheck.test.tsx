// Angebotscheck must show what today's UI does for the same offer and price, and store the same.
// Reference: fixtures/angebotscheck.json, recorded from today's UI by
// v2/scripts/capture-angebotscheck.cjs — every scenario with the offer and the price its rows
// were drawn from, then the answers given on the page with what they stored.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { acknowledged, check, wvPanels } from "../src/features/steps/angebotscheck/rules.js";
import reference from "./fixtures/angebotscheck.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, unknown>;
interface RowView { status: string; title: string; details: string[]; target: string; ack?: { id: string; on: boolean }; question?: { task: string; answer: string } }
interface View { heading: string; text: string; status: string; head: string; groups: { title: string; status: string; counts: string[]; rows: RowView[] }[]; empty: string }
interface Scenario { name: string; offer: Obj; price: Obj; view: View; answers: { answer: string[]; stored: Obj; view: View }[] }

const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
/** the offer of a scenario: today's new offer with the scenario's sections */
const offerOf = (s: Scenario): Obj => { const o: Obj = { ...structuredClone(reference.base as Obj) }; for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return o; };
const offer = () => useOfferStore.getState().offer as unknown as Obj;

async function open(s: Scenario) {
  const server = fakeServer({ ...BASE, [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: "bu", payload: offerOf(s), revision: 3, updatedAt: "2026-11-12T10:00:00Z" } }, "POST /api/price": { body: s.price } });
  renderApp(`/deal/${KEY}/bu/Angebotscheck`);
  await screen.findByRole("heading", { name: s.view.heading });
  return server;
}
const part = (el: Element, name: string) => flat(el.querySelector(`[data-part="${name}"]`)?.textContent);
function shown(): Pick<View, "status" | "head" | "groups"> {
  const head = screen.getByTestId("check-head");
  return {
    status: head.dataset.status!, head: flat(head.textContent).replace(/ · Preis wird berechnet …$/, ""),
    groups: screen.queryAllByTestId("check-group").map((g) => ({
      title: part(g, "title"), status: g.dataset.status!,
      counts: Array.from(g.querySelectorAll<HTMLElement>('[data-part="count"]')).map((c) => `${c.dataset.status} ${flat(c.textContent).replace(/\D/g, "")}`),
      rows: within(g).getAllByTestId("check-row").map((r) => {
        const box = r.querySelector<HTMLInputElement>('input[type="checkbox"]'), buttons = Array.from(r.querySelectorAll<HTMLElement>("button"));
        const link = r.querySelector<HTMLElement>("a")!;
        return {
          status: r.dataset.status!, title: part(r, "title"), details: Array.from(r.querySelectorAll('[data-part="detail"]')).map((d) => flat(d.textContent)), target: link.dataset.target!,
          ...(box ? { ack: { id: r.dataset.row!, on: box.checked } } : {}),
          ...(buttons.length ? { question: { task: r.dataset.row!.replace(/^rueckbau-/, ""), answer: buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.textContent?.toLowerCase() ?? "" } } : {}),
        };
      }),
    })),
  };
}
const expected = (v: View) => ({ status: v.status, head: v.head, groups: v.groups });

describe("Angebotscheck shows what today's UI does", () => {
  it.each((reference.scenarios as unknown as Scenario[]).map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    await open(s);
    expect(screen.getByText(s.view.text)).toBeTruthy();
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    expect(useOfferStore.getState().version).toBe(0); // looking at the check changes nothing in the offer
    const user = userEvent.setup(), before = structuredClone(offer());
    for (const a of s.answers) {
      const [kind, what, value] = a.answer;
      if (kind === "ack") await user.click(within(screen.getAllByTestId("check-row").find((r) => part(r, "title") === what)!).getByRole("checkbox"));
      else await user.click(within(screen.getAllByTestId("check-row").find((r) => r.dataset.row === `rueckbau-${what}`)!).getByRole("button", { name: value === "ja" ? "Ja" : "Nein" }));
      await waitFor(() => expect(shown()).toEqual(expected(a.view)));
      expect(changed(before, offer()), `stored after ${a.answer.join(" ")}`).toEqual(a.stored);
    }
  });
});

describe("Angebotscheck — rules and what goes beyond the recordings", () => {
  const first = (reference.scenarios as unknown as Scenario[])[0]!;
  it("a row leads to the step that fixes it", async () => {
    const router = await (async () => { fakeServer({ ...BASE, "POST /api/price": { body: first.price } }); return renderApp(`/deal/${KEY}/bu/Angebotscheck`); })();
    const row = (await screen.findAllByTestId("check-row")).find((r) => part(r, "title") === "Anfahrt erfasst")!;
    await userEvent.setup().click(within(row).getByRole("link"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${KEY}/bu/Arbeitszeit`));
  });

  it("without a price there is nothing to judge the material by — and nothing breaks", () => {
    const r = check(null, null);
    expect(r.status).toBe("rot");
    expect(r.groups.map((g) => g.rows.length > 0)).toEqual([true, true, true]);
  });

  it("\"Nicht nötig\" is stored per row and taken back without a trace", () => {
    const o = { zusammenfassung: { checkAck: { umbauart: true } } };
    expect(acknowledged(o, "wc-zubehoer", true)).toEqual({ checkAck: { umbauart: true, "wc-zubehoer": true } });
    expect(acknowledged(o, "umbauart", false)).toEqual({ checkAck: {} });
  });

  it("Sonderdruck asks for the Konfigurations-Nr. until it is entered", () => {
    const materials = { lines: [{ productId: "V3WVK999", category: "Wandverkleidung", qty: 2, lineTotal: 10 }] };
    const row = (nr: string) => check({ wandverkleidung: { wvSonderConfigNr: nr } }, { materials }).groups[1]!.rows.find((x) => x.id === "wandverkleidung-konfigurationsnr")!;
    expect(wvPanels(materials)).toBe(2);
    expect(row("").status).toBe("gelb");
    expect(row("K-123").status).toBe("gruen");
  });

  it("a material line without article number or without price is named", () => {
    const rows = check({}, { materials: { lines: [{ label: "Freier Posten", qty: 1, lineTotal: 0 }] } }).groups[1]!.rows;
    expect(rows.find((x) => x.id === "material-ohne-artikelid")!.details).toEqual(["Ohne Artikel-ID: Freier Posten"]);
    expect(rows.find((x) => x.id === "material-ohne-preis")!.details).toEqual(["Preis 0,00 €: Freier Posten"]);
  });
});
