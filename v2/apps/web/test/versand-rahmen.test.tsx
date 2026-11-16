// The frame of Angebotsversand (contact person, two-person name and greeting, send status,
// enclosed documents) must show what today's UI does for the same offer, and store the same.
// Reference: fixtures/versand-rahmen.json, recorded from today's UI by
// v2/scripts/capture-versand-rahmen.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { contactDefault, contactOf, documents, sendStatus, twoPersons } from "../src/features/steps/versand/rules.js";
import reference from "./fixtures/versand-rahmen.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

process.env.TZ = "Europe/Berlin"; // the recordings show the time of sending as the office sees it

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface View {
  heading: string; contact: { label: string; options: { value: string; label: string }[]; value: string };
  two: { title: string; text: string; nameLabel: string; name: string; greetingLabel: string; greeting: string } | null;
  status: string | null; docs: { title: string; text: string; items: { id: string; label: string; checked: boolean }[] } | null;
}
interface Scenario { name: string; type: string; offer: Obj; view: View; acts: { act: string[]; stored: Obj; view: View }[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const USERS = reference.users as { email: string; name: string }[];

const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return o; };
const offer = () => useOfferStore.getState().offer as unknown as Obj;
const pick = (p: Obj) => ({ Kundendaten: p.Kundendaten, docSelection: p.docSelection, zusammenfassung: p.zusammenfassung });

async function open(s: Scenario, payload = offerOf(s)) {
  fakeServer({ ...BASE, "GET /api/auth/me": { body: { user: { email: "capture@local.test", name: "Capture", role: "user" } } }, "GET /api/users": { body: USERS },
    [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } } });
  renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
  await screen.findByRole("heading", { name: s.view.heading, level: 2 }).catch(() => screen.findByRole("heading", { name: s.view.heading }));
  await waitFor(() => expect((screen.getByLabelText("Ansprechpartner") as HTMLSelectElement).options.length).toBe(USERS.length));
}
function shown(): Omit<View, "heading"> {
  const ap = screen.getByLabelText("Ansprechpartner") as HTMLSelectElement;
  const two = screen.queryByTestId("zf-two"), status = screen.queryByTestId("zf-status"), docs = screen.queryByTestId("zf-docs");
  const label = (el: Element) => flat(el.closest("div")!.querySelector("label")?.textContent);
  return {
    contact: { label: "Ansprechpartner", options: Array.from(ap.options).map((o) => ({ value: o.value, label: flat(o.textContent) })), value: ap.value },
    two: two ? (() => { const n = two.querySelector("textarea")!, g = two.querySelector("input")!; return { title: flat(two.querySelector("h3")?.textContent), text: flat(two.querySelector("p")?.textContent), nameLabel: label(n), name: n.value, greetingLabel: label(g), greeting: g.value }; })() : null,
    status: status ? `${status.dataset.sent === "true" ? "✅ " : ""}${flat(status.textContent)}` : null,
    docs: docs ? { title: flat(docs.querySelector("h3")?.textContent), text: flat(docs.querySelector("p")?.textContent), items: within(docs).getAllByRole("checkbox").map((b) => ({ id: b.id.replace("zf-doc-", ""), label: flat(b.closest("label")?.textContent), checked: (b as HTMLInputElement).checked })) } : null,
  };
}
const expected = ({ heading: _h, two, ...v }: View) => ({ ...v, two: two ? { ...two, title: two.title.replace(/^👥\s*/, "") } : null });

describe("the frame of Angebotsversand shows what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    await open(s);
    await waitFor(() => expect(shown()).toEqual(expected(s.view)));
    expect(useOfferStore.getState().version).toBe(0); // opening the page changes nothing in an offer that has its contact person
    const user = userEvent.setup(), before = structuredClone(offer());
    for (const a of s.acts) {
      const [kind, x, f, v] = a.act;
      if (kind === "ap") await user.selectOptions(screen.getByLabelText("Ansprechpartner"), x!);
      else if (kind === "doc") await user.click(screen.getByRole("checkbox", { name: s.view.docs!.items.find((d) => d.id === x)!.label }));
      else if (kind === "name") fireEvent.change(screen.getByLabelText("Anschrift / Namen (oben im Angebot)"), { target: { value: x } });
      else if (kind === "greet") fireEvent.change(screen.getByLabelText("Begrüßung (Anrede im Anschreiben)"), { target: { value: x } });
      else continue; // a change on Kundendaten is that step's business (kundendaten.test.tsx)
      await waitFor(() => expect(shown()).toEqual(expected(a.view)));
      expect(changed(pick(before), pick(offer())), `stored after ${a.act.join(" ")}`).toEqual(a.stored);
      void f; void v;
    }
  });
});

describe("the frame of Angebotsversand — rules and what goes beyond the recordings", () => {
  const first = SCENARIOS[0]!;
  it("a new offer without a contact person gets the signed-in user, in ONE change", async () => {
    const o = offerOf(first); o.Kundendaten = { ...o.Kundendaten, emc2_contact: "", ansprechpartner: "" };
    await open(first, o);
    await waitFor(() => expect(offer().Kundendaten).toMatchObject({ emc2_contact: "Capture", ansprechpartner: "capture@local.test" }));
    expect(useOfferStore.getState().version).toBe(1);
  });

  it("the contact person: default, a person known only by name, a person no longer in the list", () => {
    expect(contactDefault({}, USERS, "nobody@local.test")).toEqual({ emc2_contact: USERS[0]!.name, ansprechpartner: USERS[0]!.email });
    expect(contactDefault({ emc2_contact: "AP Drei" }, USERS, "capture@local.test")).toEqual({ ansprechpartner: "ap.drei@local.test" });
    expect(contactDefault({ emc2_contact: "Früher", ansprechpartner: "weg@local.test" }, USERS, "capture@local.test")).toEqual({ emc2_contact: "Capture", ansprechpartner: "capture@local.test" });
    expect(contactDefault({ emc2_contact: "Capture", ansprechpartner: "capture@local.test" }, USERS, "ap.eins@local.test")).toBeNull();
    expect(contactDefault({}, [], "capture@local.test")).toBeNull();
    expect(contactOf({ ansprechpartner: "weg@local.test" }, USERS)).toBe("");
  });

  it("Alltagshilfe: two persons follow its own switch; a Selbstzahler never has the two-person card", () => {
    expect(twoPersons({ activeOffer: "ah", Kundendaten: { ahZweiPersonen: true, kundenName: "A und B", greetingLine: "G" } })).toEqual({ name: "A und B", greeting: "G" });
    expect(twoPersons({ activeOffer: "ah", Kundendaten: { twoPersons: true } })).toBeNull();
    expect(twoPersons({ activeOffer: "bu", Kundendaten: { twoPersons: true, payer: "Selbstzahler" } })).toBeNull();
  });

  it("documents: missing ticks count as enclosed; no card without a payer or for Alltagshilfe; the send line", () => {
    expect(documents({ activeOffer: "bu", Kundendaten: { payer: "Kassenkunde" } })!.map((d) => d.checked)).toEqual([true, true, true]);
    expect(documents({ activeOffer: "bu", Kundendaten: {} })).toBeNull();
    expect(documents({ activeOffer: "ah", Kundendaten: { payer: "Kassenkunde" } })).toBeNull();
    expect(sendStatus({ activeOffer: "bwt" })).toEqual({ sent: false, text: "Noch nicht versendet." });
    expect(sendStatus({ zusammenfassung: { versand: { art: "mail", versendetAm: "2026-11-16T09:30:00.000Z" } } })).toEqual({ sent: true, text: "Versendet per E-Mail am 16.11.2026 um 10:30 Uhr." });
  });

  it("what is not built yet is reached in today's view", async () => {
    await open(first);
    expect(screen.getByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toBeTruthy();
  });
});
