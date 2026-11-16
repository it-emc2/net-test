// The mail form of Angebotsversand must show what today's UI does for the same offer — fields,
// text, attachments, preview — and store the same (`mail`, `auftragId`). Reference:
// fixtures/versand-mail.json, recorded from today's UI by v2/scripts/capture-versand-mail.cjs.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { BONUS_LINE, attachments, bodyDefault, bodyHtml, excluded, greetingLine, keptBody, mailChanges, subjectDefault, touchedOf, withBonusLine } from "../src/features/steps/versand/mail-rules.js";
import reference from "./fixtures/versand-mail.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Obj = Record<string, any>;
interface Labelled { label: string; value: string }
interface View {
  title: string; antrag: { label: string; checked: boolean }; deal: Labelled & { placeholder: string }; to: Labelled; cc: Labelled; subject: Labelled; body: Labelled;
  attachments: { name: string; meta: string; fixed: boolean }[]; count: string; preview: { text: string; links: string[]; lists: string[]; bold: string[] };
}
interface Scenario { name: string; type: string; offer: Obj; view: View; acts: { act: string[]; step: string; stored: Obj; view: View }[] }
const SCENARIOS = reference.scenarios as unknown as Scenario[];
const BASES = reference.bases as unknown as Record<string, Obj>;
const NUM = /ANG\d{4}-\d{4}-\d{6}/g, NUMBER = "ANG2026-1116-093000";
const mask = <T,>(v: T): T => JSON.parse(JSON.stringify(v).replace(NUM, "<number>"));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Obj).sort().map((k) => [k, sortKeys((v as Obj)[k])])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base: Obj, now: Obj) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])].filter((k) => !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));
const pick = (p: Obj) => ({ mail: p.mail, auftragId: p.auftragId, docSelection: p.docSelection, offerNumber: p.offerNumber });
/** the offer of a scenario; today's UI writes a number of the moment into every text — here it is ONE number */
const offerOf = (s: Scenario): Obj => { const o: Obj = structuredClone(BASES[s.type]!); for (const [k, v] of Object.entries(s.offer)) { if (v === "<removed>") delete o[k]; else o[k] = structuredClone(v); } return JSON.parse(JSON.stringify(o).replace(NUM, NUMBER)); };
const offer = () => useOfferStore.getState().offer as unknown as Obj;

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:test/1");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function open(s: Scenario, payload = offerOf(s)) {
  fakeServer({ ...BASE, "GET /api/auth/me": { body: { user: { email: "capture@local.test", name: "Capture", role: "user" } } }, "GET /api/users": { body: reference.users }, "POST /docx-template": { body: {} },
    [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: s.type, payload, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } } });
  renderApp(`/deal/${KEY}/${s.type}/Zusammenfassung`);
  return screen.findByTestId("zf-mail");
}
function shown(): View {
  const sec = screen.getByTestId("zf-mail");
  const field = (id: string) => { const el = sec.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!; return { label: flat(sec.querySelector(`label[for="${id}"]`)?.textContent), value: el.value }; };
  const doc = new DOMParser().parseFromString(screen.getByTestId("zf-mail-preview").getAttribute("srcdoc") ?? "", "text/html");
  const files = within(sec).getAllByTestId("zf-mail-file");
  return mask({
    title: flat(sec.querySelector("h3")?.textContent),
    antrag: { label: flat(sec.querySelector('label[for="zf-mail-antrag"]')?.textContent), checked: sec.querySelector<HTMLInputElement>("#zf-mail-antrag")!.checked },
    deal: { ...field("zf-mail-deal"), placeholder: sec.querySelector<HTMLInputElement>("#zf-mail-deal")!.placeholder },
    to: field("zf-mail-to"), cc: field("zf-mail-cc"), subject: field("zf-mail-subject"), body: field("zf-mail-body"),
    attachments: files.map((f) => ({ name: flat(f.querySelector('[data-part="name"]')?.textContent), meta: flat(f.querySelector('[data-part="meta"]')?.textContent), fixed: !!f.querySelector('[data-part="fixed"]') })),
    count: flat(sec.querySelector('[data-part="count"]')?.textContent),
    preview: { text: flat(doc.body.textContent), links: Array.from(doc.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? ""), lists: Array.from(doc.querySelectorAll("ul, ol")).map((l) => `${l.tagName.toLowerCase()} ${l.children.length}`), bold: Array.from(doc.querySelectorAll("p")).filter((p) => /font-weight:\s*bold/.test(p.getAttribute("style") ?? "")).map((p) => flat(p.textContent)) },
  });
}

describe("the mail form shows and stores what today's UI does", () => {
  it.each(SCENARIOS.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, s) => {
    await open(s);
    await waitFor(() => expect(shown()).toEqual(s.view));
    const user = userEvent.setup(), before = structuredClone(offer());
    for (const a of s.acts) {
      const [kind, x, f, v] = a.act;
      const sec = screen.getByTestId("zf-mail"), input = (id: string) => sec.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
      if (kind === "antrag") await user.click(input("zf-mail-antrag"));
      else if (kind === "doc") await user.click(screen.getByTestId("zf-docs").querySelector<HTMLElement>(`#zf-doc-${x}`)!);
      else if (kind === "tile") await user.click(within(sec).getByRole("button", { name: `${x} entfernen` }));
      else if (kind === "deal" || kind === "to" || kind === "cc" || kind === "subject") fireEvent.change(input(`zf-mail-${kind}`), { target: { value: x } });
      else if (kind === "body") fireEvent.change(input("zf-mail-body"), { target: { value: x!.startsWith("+") ? `${input("zf-mail-body").value}\n\n${x!.slice(1)}` : x } });
      else if (kind === "ap") await user.selectOptions(screen.getByLabelText("Ansprechpartner"), x!);
      else if (kind === "stamp") await user.click(screen.getByRole("button", { name: "Angebot: DOCX" }));
      else useOfferStore.getState().patch("Kundendaten" as never, { [f!]: v } as never); // a change made on Kundendaten
      await waitFor(() => expect(shown()).toEqual(a.view));
      // a text that only got the offer's new number is "unchanged" in the recording (every number reads <number> there)
      const diff = changed(pick(before), pick(offer())), was = mask(pick(before)) as Obj, now = mask(pick(offer())) as Obj;
      for (const k of Object.keys(diff)) if (k !== "offerNumber" && same(was[k], now[k])) delete diff[k];
      expect(mask(diff), `stored after ${a.act.join(" ")}`).toEqual(a.stored);
    }
  });
});

describe("the mail form — rules and what goes beyond the recordings", () => {
  const kunde = SCENARIOS.find((s) => s.name === "customer with e-mail")!;
  it("an offer without a number names none: subject and attachment say so, the list keeps a blank", () => {
    const o = { activeOffer: "bu", Kundendaten: {} };
    expect(subjectDefault(o)).toBe("emc2 | Ihr Angebot zum Badumbau");
    expect(attachments(o)[0]).toEqual({ id: "angebot", name: "Angebot.pdf", meta: "Angebots-PDF", fixed: true });
    expect(bodyDefault(o)).toContain("1. Ihr Angebot ANG-2025-_____\n2. Abtretungserklärung");
  });

  it("the bonus lines: in the text from the start, and in a text changed by hand the Neukundenbonus comes and goes", () => {
    const o = (rabatt: Obj) => ({ activeOffer: "bu", Kundendaten: { payer: "Kassenkunde" }, rabatt });
    expect(bodyDefault(o({ rabattEnabled: true, bonus300: true, bonusGrab: true }))).toContain(`${BONUS_LINE}\n• Gratis Haltegriff – für mehr Komfort und Sicherheit in Ihrem Alltag.\n\nUnser Ziel`);
    expect(bodyDefault(o({ rabattEnabled: false, bonus300: true }))).not.toContain(BONUS_LINE); // the tick only counts while the discount is on
    const hand = `${bodyDefault(o({}))}\n\nPS`;
    const withBonus = withBonusLine(hand, o({ rabattEnabled: true, bonus300: true }));
    expect(withBonus).toContain(`• Professionelle Antragsstellung - auf Wunsch übernehmen wir die Antragsstellung bei der Pflegekasse für Sie.\n${BONUS_LINE}\n`);
    expect(withBonusLine(withBonus, o({}))).toBe(hand);
    expect(withBonusLine("Guten Tag", o({ rabattEnabled: true, bonus300: true }))).toBe("Guten Tag"); // no list to put it in
  });

  it("greeting: the partner of a two-person offer comes before a contact person; without a name: Mustermann", () => {
    expect(greetingLine({ Kundendaten: { salutation: "Herr", lastName: "A", twoPersons: true, partnerSalutation: "Frau", partnerLastName: "B", hasContactPerson: "Ja", cp_name: "C" } })).toBe("Sehr geehrter Herr A, sehr geehrte Frau B,");
    expect(greetingLine({ Kundendaten: { salutation: "Familie" } })).toBe("Sehr geehrte Familie Mustermann,");
    expect(greetingLine({ Kundendaten: {} })).toBe("Sehr geehrte Damen und Herren,");
  });

  it("an opened offer: only what differs from the offer's own text counts as changed by hand", () => {
    const o = offerOf(kunde);
    expect(touchedOf(o)).toEqual({ to: false, subject: false, body: false });
    expect(touchedOf({ ...o, mail: { ...o.mail, subject: "Ihr Angebot", body: `${o.mail.body}\nPS` } })).toEqual({ to: false, subject: true, body: true });
    expect(mailChanges(o, {}, false)).toEqual({});
    expect(keptBody("Angebot ANG2025-0101-000000 anbei", { offerNumber: NUMBER })).toBe(`Angebot ${NUMBER} anbei`);
  });

  it("the preview: links, the signing link by its words, nothing of the text is run as markup", () => {
    const html = bodyHtml("Bitte an info@example.test oder www.example.test/sign/abc\n\n<script>x</script>");
    expect(html).toContain('<a href="mailto:info@example.test"');
    expect(html).toContain('<a href="https://www.example.test/sign/abc" style="color:#00a86b;text-decoration:none;">&gt;&gt; Hier Unterlagen online ausfüllen und unterzeichnen &lt;&lt;</a>');
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("Alltagshilfe: its own documents; what is taken out of the mail", () => {
    expect(attachments({ activeOffer: "ah", Kundendaten: { payer: "Selbstzahler" } }).map((a) => a.id)).toEqual(["angebot", "flyer_ah", "barrierefrei", "agb_ah", "zusatzblatt_ah"]);
    expect(excluded({ activeOffer: "bu", docSelection: { abtretung: false } }, ["vollmacht"])).toEqual(["abtretung", "vollmacht"]);
    expect(excluded({ activeOffer: "ah", docSelection: { abtretung: false } }, ["agb_ah"])).toEqual(["agb_ah"]);
  });
});
